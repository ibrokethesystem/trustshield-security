// Public: no JWT required. CORS wide-open so the Chrome extension can call it.
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