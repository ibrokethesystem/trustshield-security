import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const VT_KEY = Deno.env.get('VIRUSTOTAL_API_KEY');

type Verdict = {
  status: 'clean' | 'suspicious' | 'malicious' | 'error';
  detections: number;
  sources: string[];
  notes: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isIp(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s) || /^[0-9a-f:]+$/i.test(s) && s.includes(':');
}

function normalize(raw: string): string {
  let t = raw.trim().toLowerCase();
  t = t.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  return t;
}

async function checkUrlhaus(target: string, isIpTarget: boolean): Promise<Partial<Verdict>> {
  try {
    const body = new URLSearchParams(isIpTarget ? { host: target } : { host: target });
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/host/', {
      method: 'POST',
      body,
    });
    if (!res.ok) return {};
    const data = await res.json();
    if (data.query_status !== 'ok') return {};
    const urls = Array.isArray(data.urls) ? data.urls : [];
    const online = urls.filter((u: { url_status?: string }) => u.url_status === 'online').length;
    if (urls.length === 0) return {};
    return {
      detections: urls.length,
      sources: ['URLhaus (abuse.ch)'],
      notes: `URLhaus lists ${urls.length} malicious URL${urls.length === 1 ? '' : 's'} on this host${online ? ` (${online} still online)` : ''}.`,
    };
  } catch {
    return {};
  }
}

async function checkVirusTotal(target: string, isIpTarget: boolean): Promise<Partial<Verdict>> {
  if (!VT_KEY) return {};
  try {
    const path = isIpTarget ? `ip_addresses/${encodeURIComponent(target)}` : `domains/${encodeURIComponent(target)}`;
    const res = await fetch(`https://www.virustotal.com/api/v3/${path}`, {
      headers: { 'x-apikey': VT_KEY },
    });
    if (!res.ok) return {};
    const data = await res.json();
    const stats = data?.data?.attributes?.last_analysis_stats ?? {};
    const malicious = Number(stats.malicious ?? 0);
    const suspicious = Number(stats.suspicious ?? 0);
    if (!malicious && !suspicious) return { sources: ['VirusTotal'], notes: 'VirusTotal engines report no detections.' };
    return {
      detections: malicious + suspicious,
      sources: ['VirusTotal'],
      notes: `VirusTotal: ${malicious} malicious, ${suspicious} suspicious engine detection${malicious + suspicious === 1 ? '' : 's'}.`,
    };
  } catch {
    return {};
  }
}

async function runCheck(target: string, isIpTarget: boolean): Promise<Verdict> {
  const [uh, vt] = await Promise.all([checkUrlhaus(target, isIpTarget), checkVirusTotal(target, isIpTarget)]);
  const sources = [...new Set([...(uh.sources ?? []), ...(vt.sources ?? [])])];
  const detections = (uh.detections ?? 0) + (vt.detections ?? 0);
  const noteParts = [uh.notes, vt.notes].filter(Boolean) as string[];
  const notes = noteParts.length ? noteParts.join(' ') : 'No threat-intel feeds returned data for this target.';
  let status: Verdict['status'] = 'clean';
  if (detections >= 3 || (uh.detections ?? 0) > 0) status = 'malicious';
  else if (detections > 0) status = 'suspicious';
  if (sources.length === 0) status = 'error';
  return { status, detections, sources, notes };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not signed in' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'Not signed in' }, 401);

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 25) : [];
    if (!ids.length) return json({ error: 'No watchlist entries to check.' }, 400);

    const { data: rows, error } = await supabase
      .from('watchlist')
      .select('id, target, target_type')
      .in('id', ids)
      .eq('user_id', user.id);
    if (error) return json({ error: error.message }, 500);

    const results: Array<{ id: string } & Verdict> = [];
    for (const row of rows ?? []) {
      const target = normalize(row.target);
      const isIpTarget = row.target_type === 'ip' || isIp(target);
      const verdict = await runCheck(target, isIpTarget);
      results.push({ id: row.id, ...verdict });
      await supabase
        .from('watchlist')
        .update({
          status: verdict.status,
          detections: verdict.detections,
          sources: verdict.sources,
          notes: verdict.notes,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('user_id', user.id);
    }

    return json({ results });
  } catch (err) {
    console.error('check-watchlist failed', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});