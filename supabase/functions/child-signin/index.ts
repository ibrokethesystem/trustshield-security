import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const parent_email = String(body?.parent_email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    if (!parent_email || !parent_email.includes('@') || !password) {
      return json({ error: 'parent_email and password required' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Look up parent's child_links (bypasses RLS via service_role)
    const { data: parentRow } = await admin
      .from('_users_lookup_dummy' as never)
      .select('id')
      .limit(0);
    void parentRow;

    // Fetch parent's user id from auth.users via admin API by iterating pages is
    // expensive; instead use rpc to filter by lower(email). We use a raw SQL
    // call via the service role client.
    const { data: parents } = await admin
      .schema('auth' as never)
      .from('users' as never)
      .select('id, email')
      .ilike('email', parent_email)
      .limit(1) as unknown as { data: { id: string; email: string }[] | null };

    if (!parents || parents.length === 0) {
      return json({ error: 'invalid_credentials' }, 401);
    }
    const parentId = parents[0].id;

    const { data: links } = await admin
      .from('child_links')
      .select('child_email')
      .eq('parent_id', parentId)
      .is('deleted_at', null);

    const candidates = Array.from(
      new Set((links ?? []).map((l: { child_email: string }) => (l.child_email ?? '').toLowerCase()).filter(Boolean))
    );
    if (candidates.length === 0) return json({ error: 'invalid_credentials' }, 401);

    // Try each candidate. Use a fresh anon client so sign-in doesn't pollute state.
    const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const email of candidates) {
      const { data, error } = await auth.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        return json({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        }, 200);
      }
    }
    return json({ error: 'invalid_credentials' }, 401);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
