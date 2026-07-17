import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

interface Analysis {
  is_threat: boolean;
  threat_type: 'phishing' | 'scam' | 'hack' | 'suspicious_link' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  indicators: string[];
  suspicious_urls: string[];
  recommended_action: string;
  risk_score: number;
  risk_level: 'safe' | 'low' | 'elevated' | 'high';
  risk_warnings: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Not signed in' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: 'Not signed in' }, 401);

    const body = await req.json().catch(() => ({}));
    const content: string = (body.content ?? '').toString().trim();
    const source: string = (body.source ?? 'manual').toString().slice(0, 200);

    if (!content || content.length < 3) {
      return json({ error: 'Please paste an email, message, or URL to scan.' }, 400);
    }
    if (content.length > 8000) {
      return json({ error: 'Content too long (max 8000 characters).' }, 400);
    }

    if (!LOVABLE_API_KEY) return json({ error: 'AI service unavailable' }, 500);

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Lovable-Api-Key': LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content:
              'You are Trust Shield, a security analyst. Analyze the user-provided text (email body, SMS, chat message, or URL) for scam, phishing, or hacking indicators. Look for: impersonated brands, urgency/pressure tactics, credential requests, payment demands, suspicious sender domains, mismatched or shortened URLs, malware download links, romance/investment scams, tech-support scams, extortion. ALSO: even when the source is a legitimate, well-known website or message, still evaluate residual hacking / data-corruption risk (e.g. tracking, data harvesting, weak TLS, third-party redirects, permissive login flows, brand look-alike domains, links that could still lead to credential theft, files that could be tampered with). Return STRICT JSON only.',
          },
          {
            role: 'user',
            content:
              `Analyze the following for security threats and return JSON with this exact shape:\n` +
              `{"is_threat":boolean,"threat_type":"phishing"|"scam"|"hack"|"suspicious_link"|"other","severity":"low"|"medium"|"high"|"critical","title":"short headline (max 70 chars)","summary":"one paragraph explanation for the user","indicators":["reason 1","reason 2"],"suspicious_urls":["url1"],"recommended_action":"what the user should do","risk_score":0-100 integer overall risk of hack/corruption/data-loss even if legitimate,"risk_level":"safe"|"low"|"elevated"|"high","risk_warnings":["specific residual risks to warn the user about even if the source is legitimate"]}\n\n` +
              `Content to analyze:\n"""\n${content}\n"""`,
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('AI gateway error', aiRes.status, errText);
      if (aiRes.status === 429) return json({ error: 'Rate limit reached — try again in a moment.' }, 429);
      if (aiRes.status === 402) return json({ error: 'AI credits exhausted. Add credits in workspace settings.' }, 402);
      return json({ error: 'Analysis failed. Try again.' }, 502);
    }

    const aiJson = await aiRes.json();
    const rawText: string = aiJson.choices?.[0]?.message?.content ?? '{}';
    let parsed: Analysis;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      try {
        parsed = extractJSON(rawText);
      } catch (e) {
        console.error('Could not parse analysis, raw:', rawText, e);
        return json({ error: 'Could not parse analysis' }, 502);
      }
    }

    // Only insert into DB if it's actually a threat
    let threatId: string | null = null;
    if (parsed.is_threat) {
      const { data: inserted, error: insertErr } = await supabase
        .from('threats')
        .insert({
          user_id: user.id,
          title: (parsed.title || 'Suspicious content detected').slice(0, 200),
          description: parsed.summary?.slice(0, 2000) ?? null,
          threat_type: parsed.threat_type ?? 'other',
          severity: parsed.severity ?? 'medium',
          source,
          details: {
            indicators: parsed.indicators ?? [],
            suspicious_urls: parsed.suspicious_urls ?? [],
            recommended_action: parsed.recommended_action ?? '',
            original_snippet: content.slice(0, 500),
          },
        })
        .select('id')
        .single();
      if (insertErr) {
        console.error('Insert threat failed', insertErr);
      } else {
        threatId = inserted?.id ?? null;
      }
    }

    return json({ analysis: parsed, threat_id: threatId }, 200);
  } catch (err) {
    console.error('analyze-threat crashed', err);
    return json({ error: 'Unexpected error' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractJSON(raw: string): Analysis {
  let cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (!cleaned.startsWith('{')) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('No JSON object found');
    cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}