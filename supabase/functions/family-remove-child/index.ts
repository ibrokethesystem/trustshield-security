// Permanently deletes a child account owned by the calling parent.
// Wipes browsing activity, banned sites, the parent<->child link, and finally
// deletes the child's auth user so they can no longer sign in.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function childEmailFor(parentEmail: string): Promise<string> {
  const norm = parentEmail.trim().toLowerCase();
  const bytes = new TextEncoder().encode(`trustshield-child:${norm}`);
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hashBuf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ts-child-${hex}@trustshield.family`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Not signed in" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const { data: userData, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !userData?.user?.email) return json({ error: "Not signed in" }, 401);
    const parent = userData.user;
    const parentEmail = parent.email!.toLowerCase();

    const body = await req.json().catch(() => ({}));
    const requestedEmail = String(body?.child_email ?? "").trim().toLowerCase();

    // Find the child ID via child_links (preferred — proves parent ownership).
    let childId: string | null = null;
    {
      const q = admin
        .from("child_links")
        .select("child_id, child_email")
        .eq("parent_id", parent.id);
      const { data } = requestedEmail
        ? await q.ilike("child_email", requestedEmail).maybeSingle()
        : await q.maybeSingle();
      if (data?.child_id) childId = data.child_id as string;
    }

    // Fallback: look up the deterministic child email for this parent and find
    // the auth user directly. Only used when no link row exists.
    if (!childId) {
      const fallbackEmail = requestedEmail || (await childEmailFor(parentEmail));
      for (let page = 1; page <= 20 && !childId; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) break;
        const found = data.users.find((u) => (u.email ?? "").toLowerCase() === fallbackEmail);
        if (found) {
          const meta = (found.user_metadata ?? {}) as { parent_email?: string; role?: string };
          if ((meta.parent_email ?? "").toLowerCase() === parentEmail && meta.role === "child") {
            childId = found.id;
          }
        }
        if (data.users.length < 200) break;
      }
    }

    if (!childId) return json({ error: "No child account found for this parent." }, 404);

    // Verify ownership one more time against the auth user's metadata before deleting.
    const { data: childUser, error: cErr } = await admin.auth.admin.getUserById(childId);
    if (cErr || !childUser?.user) return json({ error: "Child account not found." }, 404);
    const meta = (childUser.user.user_metadata ?? {}) as { parent_email?: string; role?: string };
    if ((meta.parent_email ?? "").toLowerCase() !== parentEmail || meta.role !== "child") {
      return json({ error: "You do not own this child account." }, 403);
    }

    // Wipe child data. Order: activity/bans first (they FK-nothing but we clean
    // up), then the parent<->child link, then the auth user itself.
    await admin.from("child_activity").delete().eq("user_id", childId);
    await admin.from("child_banned_sites").delete().eq("user_id", childId);
    await admin.from("child_links").delete().eq("child_id", childId);
    await admin.from("profiles").delete().eq("id", childId);
    const { error: dErr } = await admin.auth.admin.deleteUser(childId);
    if (dErr) return json({ error: dErr.message }, 500);

    return json({ ok: true, child_id: childId });
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