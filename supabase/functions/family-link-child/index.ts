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

    // Find every child user whose metadata pairs them to this parent email.
    // Supports multi-child (labeled) accounts and legacy single-child.
    const legacyEmail = await childEmailFor(parentEmail);
    const matches: { id: string; email: string }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      for (const u of data.users) {
        const meta = (u.user_metadata ?? {}) as { parent_email?: string; role?: string };
        const email = (u.email ?? "").toLowerCase();
        const linkedByMeta =
          (meta.parent_email ?? "").toLowerCase() === parentEmail && meta.role === "child";
        const linkedByLegacy = email === legacyEmail;
        if (linkedByMeta || linkedByLegacy) matches.push({ id: u.id, email: u.email ?? "" });
      }
      if (data.users.length < 200) break;
    }
    if (matches.length === 0) {
      return json({ error: "No child account found for this parent email. Create one first from the dashboard." }, 404);
    }

    for (const m of matches) {
      const { error: upErr } = await admin
        .from("child_links")
        .upsert({ parent_id: parent.id, child_id: m.id }, { onConflict: "child_id" });
      if (upErr) return json({ error: upErr.message }, 500);
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