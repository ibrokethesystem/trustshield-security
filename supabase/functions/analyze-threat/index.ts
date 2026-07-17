import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createOpenAICompatible } from 'npm:@ai-sdk/openai-compatible';
import { generateObject } from 'npm:ai';
import { z } from 'npm:zod';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

const AnalysisSchema = z.object({
  is_threat: z.boolean(),
  threat_type: z.string(),
  severity: z.string(),
  title: z.string(),
  summary: z.string(),
  indicators: z.array(z.string()).optional(),
  suspicious_urls: z.array(z.string()).optional(),
  recommended_action: z.string(),
  risk_score: z.number().min(0).max(100),
  risk_level: z.string(),
  risk_warnings: z.array(z.string()).optional(),
});

type Analysis = {
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
};

const THREAT_TYPES = ['phishing', 'scam', 'hack', 'suspicious_link', 'other'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const RISK_LEVELS = ['safe', 'low', 'elevated', 'high'] as const;

function pickEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const v = String(value ?? '').toLowerCase().trim();
  return (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

function normalize(raw: z.infer<typeof AnalysisSchema>): Analysis {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.risk_score) || 0)));
  return {
    is_threat: !!raw.is_threat,
    threat_type: pickEnum(raw.threat_type, THREAT_TYPES, 'other'),
    severity: pickEnum(raw.severity, SEVERITIES, 'medium'),
    title: (raw.title || 'Scan result').slice(0, 90),
    summary: (raw.summary || '').slice(0, 1200),
    indicators: (raw.indicators ?? []).map((s) => String(s)),
    suspicious_urls: (raw.suspicious_urls ?? []).map((s) => String(s)),
    recommended_action: (raw.recommended_action || '').slice(0, 700),
    risk_score: score,
    risk_level: pickEnum(raw.risk_level, RISK_LEVELS, score >= 70 ? 'high' : score >= 40 ? 'elevated' : score > 0 ? 'low' : 'safe'),
    risk_warnings: (raw.risk_warnings ?? []).map((s) => String(s)),
  };
}

const SYSTEM_PROMPT =
  'You are Trust Shield, a security analyst. Analyze user-provided text, email bodies, SMS messages, chat messages, domains, or URLs for scams, phishing, hacking indicators, malware, credential theft, and data-corruption risk. Also evaluate residual risk even for legitimate sites, including tracking, data harvesting, redirects, look-alike domains, file tampering, and weak trust signals. Use cautious, evidence-based language. Every summary must end with a complete sentence.';

const createGateway = (apiKey: string) =>
  createOpenAICompatible({
    name: 'lovable-ai',
    baseURL: 'https://ai.gateway.lovable.dev/v1',
    headers: { 'Lovable-API-Key': apiKey },
  });

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

    const gateway = createGateway(LOVABLE_API_KEY);
    let parsed: Analysis;
    const promptText =
      `Analyze this content for security threats. Keep the summary to 2-4 complete sentences. ` +
      `Return evidence-based results only; do not invent identities or attackers.\n\n` +
      `Content to analyze:\n"""\n${content}\n"""`;

    const runModel = async (modelId: string) => {
      const { object } = await generateObject({
        model: gateway(modelId),
        schema: AnalysisSchema,
        system: SYSTEM_PROMPT,
        prompt: promptText,
      });
      return normalize(object);
    };

    try {
      parsed = await runModel('google/gemini-2.5-flash');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('AI structured analysis failed (primary)', message);
      if (message.includes('429')) return json({ error: 'Rate limit reached — try again in a moment.' }, 429);
      if (message.includes('402')) return json({ error: 'AI credits exhausted. Add credits in workspace settings.' }, 402);
      try {
        parsed = await runModel('google/gemini-2.5-flash-lite');
      } catch (err2) {
        const m2 = err2 instanceof Error ? err2.message : String(err2);
        console.error('AI structured analysis failed (retry)', m2);
        if (m2.includes('429')) return json({ error: 'Rate limit reached — try again in a moment.' }, 429);
        if (m2.includes('402')) return json({ error: 'AI credits exhausted. Add credits in workspace settings.' }, 402);
        parsed = createBasicAnalysis(content);
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

function createBasicAnalysis(content: string): Analysis {
  const urls = extractUrls(content);
  const text = content.toLowerCase();
  const indicators: string[] = [];

  const pressureWords = ['urgent', 'immediately', 'final warning', 'verify now', 'act now', 'limited time'];
  const credentialWords = ['password', 'login', 'verify your account', 'confirm your account', 'security code', 'one-time code'];
  const paymentWords = ['gift card', 'wire transfer', 'crypto', 'bitcoin', 'cashapp', 'zelle'];

  if (pressureWords.some((word) => text.includes(word))) indicators.push('Uses urgency or pressure language.');
  if (credentialWords.some((word) => text.includes(word))) indicators.push('Asks for account access, credentials, or verification codes.');
  if (paymentWords.some((word) => text.includes(word))) indicators.push('Mentions high-risk payment methods often used in scams.');
  if (urls.some((url) => isSuspiciousUrl(url))) indicators.push('Contains a URL with suspicious link patterns.');

  const isThreat = indicators.length > 0;
  const riskScore = Math.min(95, urls.length > 0 ? 35 + indicators.length * 20 : indicators.length * 25);

  return {
    is_threat: isThreat,
    threat_type: urls.length > 0 ? 'suspicious_link' : isThreat ? 'scam' : 'other',
    severity: riskScore >= 75 ? 'high' : riskScore >= 45 ? 'medium' : 'low',
    title: isThreat ? 'Potential risk found' : 'No clear threat found',
    summary: isThreat
      ? 'Trust Shield could not complete the advanced AI scan, so it ran a basic safety check instead. The content includes common scam or hacking warning signs, so avoid opening links, sharing codes, or entering account details until you verify the source independently.'
      : 'Trust Shield could not complete the advanced AI scan, so it ran a basic safety check instead. No obvious scam or hacking indicators were found, but you should still verify unexpected links or requests before sharing private information.',
    indicators,
    suspicious_urls: urls.filter((url) => isSuspiciousUrl(url)),
    recommended_action: isThreat
      ? 'Do not click links or reply until you confirm the sender through an official website or trusted contact method.'
      : 'Proceed carefully and verify the source if the message was unexpected.',
    risk_score: riskScore,
    risk_level: riskScore >= 70 ? 'high' : riskScore >= 40 ? 'elevated' : riskScore > 0 ? 'low' : 'safe',
    risk_warnings: urls.length > 0 ? ['Links can still redirect or collect data even when they appear legitimate.'] : [],
  };
}

function extractUrls(content: string): string[] {
  const matches = content.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>]*)?/gi);
  return [...new Set(matches ?? [])];
}

function isSuspiciousUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    /bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|is\.gd/.test(lower) ||
    /login|verify|secure|account|password|wallet|prize|free|gift/.test(lower) ||
    /\.(zip|mov|scr|exe|js|msi)(?:$|[/?#])/.test(lower) ||
    /xn--/.test(lower)
  );
}