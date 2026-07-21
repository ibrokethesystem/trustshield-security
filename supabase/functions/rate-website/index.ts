// Requires a valid Trust Shield user session. The browser extensions attach
// the signed-in user's access token when calling this endpoint so anonymous
// callers can't drain the paid VirusTotal quota.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const VT_KEY = Deno.env.get('VIRUSTOTAL_API_KEY') ?? '';

function b64url(input: string) {
  return btoa(input).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Authenticate the caller. Without this, anyone on the internet can burn
    // through the project's paid VirusTotal quota.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!VT_KEY) throw new Error('VIRUSTOTAL_API_KEY not configured');
    let url = '';
    if (req.method === 'GET') url = new URL(req.url).searchParams.get('url') ?? '';
    else url = (await req.json())?.url ?? '';
    if (!url) {
      return new Response(JSON.stringify({ error: 'url required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const id = b64url(url);
    let stats: any = null;
    let categories: any = null;
    let reputation: number | null = null;

    const r = await fetch(`https://www.virustotal.com/api/v3/urls/${id}`, {
      headers: { 'x-apikey': VT_KEY },
    });
    if (r.ok) {
      const j = await r.json();
      stats = j?.data?.attributes?.last_analysis_stats ?? null;
      categories = j?.data?.attributes?.categories ?? null;
      reputation = j?.data?.attributes?.reputation ?? null;
    } else if (r.status === 404) {
      // Submit for analysis
      const form = new URLSearchParams({ url });
      const sub = await fetch('https://www.virustotal.com/api/v3/urls', {
        method: 'POST',
        headers: { 'x-apikey': VT_KEY, 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      });
      if (sub.ok) {
        const sj = await sub.json();
        const aid = sj?.data?.id;
        for (let i = 0; i < 6; i++) {
          await new Promise((res) => setTimeout(res, i === 0 ? 2500 : 2000));
          const ar = await fetch(`https://www.virustotal.com/api/v3/analyses/${aid}`, {
            headers: { 'x-apikey': VT_KEY },
          });
          if (!ar.ok) continue;
          const aj = await ar.json();
          if (aj?.data?.attributes?.status === 'completed') {
            stats = aj?.data?.attributes?.stats;
            break;
          }
        }
      }
    }

    const malicious = Number(stats?.malicious || 0);
    const suspicious = Number(stats?.suspicious || 0);
    const harmless = Number(stats?.harmless || 0);
    const rating = malicious > 0 ? 'malicious' : suspicious > 0 ? 'suspicious' : harmless > 0 ? 'safe' : 'unknown';
    const risk_score = Math.min(100, malicious * 14 + suspicious * 6);

    return new Response(JSON.stringify({
      url, rating, risk_score, malicious, suspicious, harmless,
      categories, reputation, stats,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});