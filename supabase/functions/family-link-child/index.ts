// Links a parent user to their child account for browsing monitoring.
// Verifies the child's user_metadata.parent_email matches the calling parent's email,
// then upserts a row into child_links.
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

    // SECURITY: only refresh child_links rows that the parent has already
    // created for themselves. We do NOT auto-adopt accounts based on
    // client-supplied user_metadata (role/parent_email are set by the child
    // during sign-up and cannot be trusted). To add a new child, use the
    // parent dashboard's "Set up child account" flow, which creates the
    // link row directly with the parent's authenticated session.
    const { data: existing, error: exErr } = await admin
      .from("child_links")
      .select("child_id, child_email, label")
      .eq("parent_id", parent.id)
      .is("deleted_at", null);
    if (exErr) return json({ error: exErr.message }, 500);

    const matches: { id: string; email: string }[] = [];
    for (const row of existing ?? []) {
      // Confirm the linked auth user is still a real child of this parent
      // (metadata + role check) before reporting them as linked.
      const { data: cu } = await admin.auth.admin.getUserById(row.child_id as string);
      if (!cu?.user) continue;
      const meta = (cu.user.user_metadata ?? {}) as { parent_email?: string; role?: string };
      const isChildOfCaller =
        (meta.parent_email ?? "").toLowerCase() === parentEmail && meta.role === "child";
      if (!isChildOfCaller) continue;
      matches.push({ id: cu.user.id, email: cu.user.email ?? "" });
    }

    if (matches.length === 0) {
      return json({
        error:
          "No child account is linked to this parent yet. Open your Trust Shield dashboard and use 'Set up child account' to create one.",
      }, 404);
    }

    return json({ ok: true, linked: matches.length, children: matches });
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