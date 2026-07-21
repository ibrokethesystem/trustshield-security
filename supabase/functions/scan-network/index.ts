import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VT_KEY = Deno.env.get('VIRUSTOTAL_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

function clientIp(req: Request): string | null {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || null;
}

function isValidIp(s: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s) || /^[0-9a-fA-F:]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    let ip: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.ip && typeof body.ip === 'string' && isValidIp(body.ip)) ip = body.ip;
    } catch { /* ignore */ }
    if (!ip) ip = clientIp(req);

    // Fetch IP + geo/proxy info from ipapi.co (free, no key required)
    let geo: any = null;
    try {
      const url = ip ? `https://ipapi.co/${ip}/json/` : `https://ipapi.co/json/`;
      const r = await fetch(url, { headers: { 'User-Agent': 'TrustShield/1.0' } });
      if (r.ok) geo = await r.json();
      if (!ip && geo?.ip) ip = geo.ip;
    } catch { /* ignore */ }

    // Query VirusTotal IP reputation
    let vt: any = null;
    if (VT_KEY && ip) {
      try {
        const r = await fetch(`https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`, {
          headers: { 'x-apikey': VT_KEY },
        });
        if (r.ok) {
          const j = await r.json();
          const s = j?.data?.attributes?.last_analysis_stats ?? {};
          vt = {
            malicious: Number(s.malicious || 0),
            suspicious: Number(s.suspicious || 0),
            harmless: Number(s.harmless || 0),
            undetected: Number(s.undetected || 0),
            reputation: Number(j?.data?.attributes?.reputation ?? 0),
            country: j?.data?.attributes?.country ?? null,
            as_owner: j?.data?.attributes?.as_owner ?? null,
          };
        }
      } catch { /* ignore */ }
    }

    // Score
    const reasons: string[] = [];
    let risk = 0;

    if (vt) {
      if (vt.malicious > 0) { risk += 40 + Math.min(30, vt.malicious * 8); reasons.push(`${vt.malicious} security vendor(s) flagged this IP as malicious.`); }
      if (vt.suspicious > 0) { risk += 15 + Math.min(15, vt.suspicious * 4); reasons.push(`${vt.suspicious} vendor(s) flagged this IP as suspicious.`); }
      if (vt.reputation < -10) { risk += 10; reasons.push(`Poor community reputation score (${vt.reputation}).`); }
    }
    if (geo) {
      // ipapi doesn't expose proxy/vpn flags without paid tier; but ASN often reveals hosting/VPN providers.
      const org = String(geo.org || geo.asn || '').toLowerCase();
      const hostingSignals = ['digitalocean', 'ovh', 'linode', 'hetzner', 'vultr', 'amazon', 'aws', 'google cloud', 'microsoft azure', 'contabo', 'leaseweb', 'm247'];
      if (hostingSignals.some((h) => org.includes(h))) {
        risk += 15;
        reasons.push('Your connection appears to come from a data center or VPN provider (' + (geo.org || geo.asn) + ').');
      }
      const vpnSignals = ['vpn', 'proxy', 'tor', 'nordvpn', 'expressvpn', 'protonvpn', 'mullvad', 'surfshark'];
      if (vpnSignals.some((h) => org.includes(h))) {
        risk += 20;
        reasons.push('ISP name matches a known VPN/proxy service.');
      }
    }

    risk = Math.min(100, risk);
    const verdict = risk >= 45 ? 'unsafe' : risk >= 20 ? 'caution' : 'safe';

    return new Response(JSON.stringify({
      ip,
      verdict,
      risk_score: risk,
      reasons,
      geo: geo ? {
        city: geo.city ?? null,
        region: geo.region ?? null,
        country: geo.country_name ?? geo.country ?? null,
        org: geo.org ?? null,
        asn: geo.asn ?? null,
        postal: geo.postal ?? null,
        latitude: geo.latitude ?? null,
        longitude: geo.longitude ?? null,
      } : null,
      virustotal: vt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});