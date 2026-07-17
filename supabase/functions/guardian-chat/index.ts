import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

type Msg = { role: 'user' | 'assistant'; content: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not signed in' }, 401);
    if (!LOVABLE_API_KEY) return json({ error: 'AI service unavailable' }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return json({ error: 'Not signed in' }, 401);

    const body = await req.json().catch(() => ({}));
    const threatId: string | undefined = body.threat_id;
    const messages: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (!threatId) return json({ error: 'Missing threat_id' }, 400);
    if (messages.length === 0) return json({ error: 'Empty conversation' }, 400);

    const { data: threat, error: tErr } = await supabase
      .from('threats')
      .select('title, description, threat_type, severity, source, details')
      .eq('id', threatId)
      .maybeSingle();
    if (tErr || !threat) return json({ error: 'Threat not found' }, 404);

    const details = threat.details ?? {};
    const context = [
      `Threat: ${threat.title}`,
      `Type: ${threat.threat_type} | Severity: ${threat.severity}`,
      threat.description ? `Summary: ${threat.description}` : '',
      details.indicators?.length ? `Indicators: ${details.indicators.join(' | ')}` : '',
      details.suspicious_urls?.length ? `Suspicious URLs: ${details.suspicious_urls.join(' , ')}` : '',
      details.recommended_action ? `Recommended action: ${details.recommended_action}` : '',
      details.original_snippet ? `Original snippet: ${String(details.original_snippet).slice(0, 800)}` : '',
    ].filter(Boolean).join('\n');

    const systemPrompt = `You are Cyber Guardian, the friendly AI assistant inside Trust Shield. You help everyday users understand a specific detected threat.
Rules:
- Answer ONLY about this threat and general online-safety guidance.
- Explain in plain language. No jargon unless you define it in the same sentence.
- Be honest about uncertainty. Do not invent attacker names, countries, or evidence.
- Trust Shield is a web app; it cannot reach into the user's OS, email, or accounts. Do not promise device-level actions.
- Keep replies 1-4 short paragraphs.

CONTEXT ABOUT THIS THREAT:
${context}`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
    ];

    const callModel = async (model: string) => {
      const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Lovable-API-Key': LOVABLE_API_KEY,
        },
        body: JSON.stringify({ model, messages: chatMessages }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      const data = await res.json();
      return data?.choices?.[0]?.message?.content?.trim() ?? '';
    };

    let reply = '';
    try {
      reply = await callModel('google/gemini-2.5-flash');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('429')) return json({ error: 'Rate limit reached — try again in a moment.' }, 429);
      if (msg.startsWith('402')) return json({ error: 'AI credits exhausted.' }, 402);
      console.error('guardian primary failed', msg);
      try {
        reply = await callModel('google/gemini-2.5-flash-lite');
      } catch (err2) {
        console.error('guardian retry failed', err2);
        return json({ error: 'Cyber Guardian is temporarily unavailable.' }, 502);
      }
    }

    if (!reply) return json({ error: 'Empty reply from AI.' }, 502);
    return json({ reply }, 200);
  } catch (err) {
    console.error('guardian-chat crashed', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}