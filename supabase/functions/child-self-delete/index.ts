// Lets a signed-in child account permanently delete themselves after
// re-entering their own password. Wipes activity, bans, link, profile, auth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: userData, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !userData?.user?.email) return json({ error: "Not signed in" }, 401);
    const me = userData.user;
    const meta = (me.user_metadata ?? {}) as { role?: string };
    if (meta.role !== "child") return json({ error: "Only child accounts can self-delete here." }, 403);

    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "");
    if (password.length < 4) return json({ error: "Enter your password." }, 400);

    // Require parent approval — an approved `delete_account` permission request
    // must exist for this child before we honor the deletion.
    const { data: approved, error: reqErr } = await admin
      .from("permission_requests")
      .select("id")
      .eq("child_id", me.id)
      .eq("kind", "delete_account")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(1);
    if (reqErr) return json({ error: reqErr.message }, 500);
    if (!approved || approved.length === 0) {
      return json(
        { error: "Your grown-up hasn't approved this yet. Ask them to say yes in their Family tab." },
        403,
      );
    }

    // Verify the password by signing in with a throwaway client.
    const verifier = createClient(url, anon, { auth: { persistSession: false } });
    const { error: vErr } = await verifier.auth.signInWithPassword({
      email: me.email!,
      password,
    });
    if (vErr) return json({ error: "Incorrect password." }, 401);

    const childId = me.id;
    await admin.from("child_activity").delete().eq("user_id", childId);
    await admin.from("child_banned_sites").delete().eq("user_id", childId);
    await admin.from("permission_requests").delete().eq("child_id", childId);
    await admin.from("child_links").delete().eq("child_id", childId);
    await admin.from("profiles").delete().eq("id", childId);
    const { error: dErr } = await admin.auth.admin.deleteUser(childId);
    if (dErr) return json({ error: dErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
