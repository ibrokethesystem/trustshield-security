import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not signed in' }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = await supabase.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'Not signed in' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: mine } = await admin
      .from('child_links')
      .select('parent_id')
      .eq('child_id', uid)
      .is('deleted_at', null);

    const parentIds = Array.from(new Set((mine ?? []).map((r: { parent_id: string }) => r.parent_id)));
    if (parentIds.length === 0) return json({ siblings: [] }, 200);

    const { data: rows } = await admin
      .from('child_links')
      .select('child_id, label')
      .in('parent_id', parentIds)
      .is('deleted_at', null)
      .neq('child_id', uid);

    const siblings = (rows ?? []).map((r: { child_id: string; label: string | null }) => ({
      sibling_id: r.child_id,
      sibling_label: r.label ?? null,
    }));
    return json({ siblings }, 200);
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
