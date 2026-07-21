import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VT_KEY = Deno.env.get('VIRUSTOTAL_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

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
    if (!VT_KEY) throw new Error('VIRUSTOTAL_API_KEY not configured');
    const { file_base64, filename } = await req.json();
    if (!file_base64 || typeof file_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'file_base64 required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // decode
    const b64 = file_base64.includes(',') ? file_base64.split(',')[1] : file_base64;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length > 30 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large (max 30MB)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const form = new FormData();
    form.append('file', new Blob([bytes]), filename || 'upload.bin');

    const up = await fetch('https://www.virustotal.com/api/v3/files', {
      method: 'POST',
      headers: { 'x-apikey': VT_KEY },
      body: form,
    });
    if (!up.ok) {
      const t = await up.text();
      return new Response(JSON.stringify({ error: 'VT upload failed', details: t }), {
        status: up.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const upJson = await up.json();
    const analysisId: string = upJson?.data?.id;
    if (!analysisId) throw new Error('No analysis id from VirusTotal');

    // Poll analysis
    let attrs: any = null;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 3000 : 2500));
      const r = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
        headers: { 'x-apikey': VT_KEY },
      });
      if (!r.ok) continue;
      const j = await r.json();
      attrs = j?.data?.attributes;
      if (attrs?.status === 'completed') break;
    }
    const stats = attrs?.stats ?? { malicious: 0, suspicious: 0, harmless: 0, undetected: 0 };
    const malicious = Number(stats.malicious || 0);
    const suspicious = Number(stats.suspicious || 0);
    const total = Object.values(stats).reduce((a: number, b: any) => a + Number(b || 0), 0) as number;
    const verdict = malicious > 0 ? 'threat' : suspicious > 0 ? 'caution' : 'safe';
    const risk_score = Math.min(100, malicious * 12 + suspicious * 5);
    return new Response(JSON.stringify({
      verdict, risk_score, stats, total_engines: total, filename: filename || null,
      completed: attrs?.status === 'completed',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});