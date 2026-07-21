import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not signed in' }, 401);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: claimsData } = await supabase.auth.getClaims(token);
    if (!claimsData?.claims?.sub) return json({ error: 'Not signed in' }, 401);
    if (!LOVABLE_API_KEY) return json({ error: 'AI unavailable' }, 500);
    const body = await req.json().catch(() => ({}));
    const texts: string[] = Array.isArray(body.texts) ? body.texts.slice(0, 400) : [];
    const target: string = String(body.target || '').slice(0, 40);
    if (!texts.length || !target) return json({ error: 'Missing texts or target' }, 400);
    if (target.toLowerCase() === 'english' || target.toLowerCase() === 'en') {
      return json({ translations: texts }, 200);
    }

    const clean = texts.map((t) => String(t).slice(0, 500));
    const sys = `You are a professional translator. Translate every English UI string in the input array into ${target}. Rules:\n- Output ONLY a JSON object of the form {"translations": [ ... ]} with the SAME length and order as input.\n- Actually translate — do not echo English back. The ONLY exception is the exact brand name "Trust Shield", which stays as-is. Everything else, including short words like "Dashboard", "Log in", "Email", "Password", MUST be translated.\n- Preserve numbers, punctuation, emojis, URLs, and short codes like "F8" or "alt+T".\n- No commentary, no code fences.`;
    const user = JSON.stringify({ input: clean });

    const call = async (model: string) => {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': LOVABLE_API_KEY },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim() ?? '';
    };

    let raw = '';
    try {
      raw = await call('google/gemini-2.5-flash-lite');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('429')) return json({ error: 'Rate limited, try again shortly.' }, 429);
      if (msg.startsWith('402')) return json({ error: 'AI credits exhausted.' }, 402);
      raw = await call('google/gemini-2.5-flash');
    }

    // Extract array from the reply — accept many shapes, never 502.
    const arr = extractArray(raw);
    const translations = clean.map((src, i) => {
      const v = arr?.[i];
      return typeof v === 'string' && v.trim() ? v : src;
    });
    return json({ translations }, 200);
  } catch (err) {
    console.error('translate-text crashed', err);
    // Best-effort: echo originals so the client keeps working.
    try {
      const body = await req.clone().json().catch(() => ({}));
      const texts: string[] = Array.isArray(body?.texts) ? body.texts : [];
      return json({ translations: texts.map((t) => String(t)) }, 200);
    } catch {
      return json({ error: 'Unexpected error' }, 500);
    }
  }
});

function extractArray(raw: string): unknown[] | null {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  let cleaned = raw.replace(/^```(?:json)?\s*/im, '').replace(/```\s*$/im, '').trim();
  let parsed: any = tryParse(cleaned);
  if (!parsed) {
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) parsed = tryParse(m[0]);
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.translations)) return parsed.translations;
    const vals = Object.values(parsed);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0] as unknown[];
    if (vals.every((v) => typeof v === 'string')) return vals as unknown[];
  }
  return null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}