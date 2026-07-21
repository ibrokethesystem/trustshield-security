import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type ChildLink = { child_id: string; child_email: string | null };
type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

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

    // Resolve parent user id via a service-role-only helper RPC.
    const { data: parentId } = await admin.rpc('find_parent_id_by_email', {
      _email: parent_email,
    }) as unknown as { data: string | null };
    if (!parentId) return invalidCredentials();

    const { data: links } = await admin
      .from('child_links')
      .select('child_id, child_email')
      .eq('parent_id', parentId)
      .is('deleted_at', null);

    const emails = new Set<string>();
    for (const l of (links ?? []) as ChildLink[]) {
      if (l.child_email) emails.add(l.child_email.toLowerCase());
      // Fallback: fetch the auth user's email if the link row didn't store it
      // (older child_links rows created before child_email was populated).
      if (l.child_id) {
        const { data: cu } = await admin.auth.admin.getUserById(l.child_id);
        const em = (cu?.user?.email ?? '').toLowerCase();
        if (em) emails.add(em);
      }
    }

    // Some children were created correctly, but the client-side link insert was
    // previously best-effort and could fail silently. In that case the child auth
    // user still has server-stored metadata tying it to this parent, but there is
    // no child_links row for child-signin to discover. Use this only as a login
    // candidate fallback; it does not auto-link/adopt the account.
    const linkedIds = new Set((links ?? []).map((l: ChildLink) => l.child_id).filter(Boolean));
    const orphanCandidates = await childEmailsFromMetadata(admin, parent_email, linkedIds);
    for (const email of orphanCandidates) emails.add(email);
    const candidates = Array.from(emails);
    if (candidates.length === 0) return invalidCredentials();

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
    return invalidCredentials();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function childEmailsFromMetadata(
  admin: ReturnType<typeof createClient>,
  parentEmail: string,
  alreadyLinkedIds: Set<string>,
) {
  const out = new Set<string>();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data?.users?.length) break;
    for (const user of data.users as AuthUser[]) {
      if (alreadyLinkedIds.has(user.id)) continue;
      const meta = user.user_metadata ?? {};
      const isChild = meta.role === 'child';
      const parentMatches = String(meta.parent_email ?? '').trim().toLowerCase() === parentEmail;
      const email = (user.email ?? '').trim().toLowerCase();
      if (isChild && parentMatches && email.endsWith('@trustshield.family')) out.add(email);
    }
    if (data.users.length < 100) break;
  }
  return out;
}

function invalidCredentials() {
  // Wrong child-login credentials are an expected form outcome, not an app/runtime
  // failure. Returning 200 prevents the preview runtime from blank-screening on a
  // handled sign-in mismatch while keeping the response intentionally generic.
  return json({ ok: false, error: 'invalid_credentials' }, 200);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
