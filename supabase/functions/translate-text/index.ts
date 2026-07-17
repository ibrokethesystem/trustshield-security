import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) return json({ error: 'AI unavailable' }, 500);
    const body = await req.json().catch(() => ({}));
    const texts: string[] = Array.isArray(body.texts) ? body.texts.slice(0, 400) : [];
    const target: string = String(body.target || '').slice(0, 40);
    if (!texts.length || !target) return json({ error: 'Missing texts or target' }, 400);
    if (target.toLowerCase() === 'english' || target.toLowerCase() === 'en') {
      return json({ translations: texts }, 200);
    }

    const clean = texts.map((t) => String(t).slice(0, 500));
    const sys = `You translate short UI strings from English into ${target}. Return ONLY a JSON array of strings, same length and order as the input. Preserve punctuation, numbers, emojis, and placeholders. Do not add commentary. If a string is a proper noun/brand (like "Trust Shield"), you may keep it in English.`;
    const user = JSON.stringify(clean);

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

    // Extract JSON array from the reply.
    let arr: unknown = null;
    try { arr = JSON.parse(raw); } catch { /* try to salvage */ }
    if (arr && !Array.isArray(arr) && typeof arr === 'object') {
      const vals = Object.values(arr as Record<string, unknown>);
      if (vals.length === 1 && Array.isArray(vals[0])) arr = vals[0];
      else if (vals.every((v) => typeof v === 'string')) arr = vals;
    }
    if (!Array.isArray(arr)) {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) { try { arr = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    if (!Array.isArray(arr) || arr.length !== clean.length) {
      return json({ error: 'Translation parse failed' }, 502);
    }
    const translations = (arr as unknown[]).map((v, i) => (typeof v === 'string' && v.trim() ? v : clean[i]));
    return json({ translations }, 200);
  } catch (err) {
    console.error('translate-text crashed', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}