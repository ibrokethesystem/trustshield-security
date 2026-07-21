import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createOpenAICompatible } from 'npm:@ai-sdk/openai-compatible';
import { generateObject, NoObjectGeneratedError } from 'npm:ai';
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
  indicators: z.array(z.unknown()),
  suspicious_urls: z.array(z.unknown()),
  recommended_action: z.string(),
  risk_score: z.number(),
  risk_level: z.string(),
  risk_warnings: z.array(z.unknown()),
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

function toDisplayString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value === '[object Object]' ? '' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toDisplayString).filter(Boolean).join(' — ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferred = [
      'reason',
      'text',
      'description',
      'indicator',
      'message',
      'label',
      'detail',
      'evidence',
      'finding',
      'warning',
      'risk',
      'url',
      'href',
      'link',
    ];
    for (const key of preferred) {
      const rendered = toDisplayString(record[key]);
      if (rendered) return rendered;
    }
    const renderedValues = Object.values(record).map(toDisplayString).filter(Boolean);
    if (renderedValues.length) return renderedValues.join(' — ');
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function normalize(raw: z.infer<typeof AnalysisSchema>): Analysis {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.risk_score) || 0)));
  const severity = pickEnum(raw.severity, SEVERITIES, 'medium');
  const threat_type = pickEnum(raw.threat_type, THREAT_TYPES, 'other');
  const indicators = (raw.indicators ?? []).map(toDisplayString).filter(Boolean);
  const suspicious_urls = (raw.suspicious_urls ?? []).map(toDisplayString).filter(Boolean);
  const summary = (raw.summary || '').slice(0, 1200);
  // Trust the model's is_threat by default. Only override to TRUE on strong,
  // unambiguous evidence — score >= 70, high/critical severity, or the model
  // itself listed suspicious URLs while also scoring the item as risky.
  // Keyword scanning ("malicious", "scam") caused false alarms because the
  // summary often uses those words in a NEGATIVE context ("no signs of
  // phishing", "not a scam"). Also override to FALSE when the score is clearly
  // safe, so a stray is_threat=true from the model doesn't create a fake alert.
  let is_threat = !!raw.is_threat;
  if (score >= 70 || severity === 'high' || severity === 'critical') is_threat = true;
  if (suspicious_urls.length > 0 && score >= 60) is_threat = true;
  if (score < 40 && severity !== 'high' && severity !== 'critical' && suspicious_urls.length === 0) {
    is_threat = false;
  }
  return {
    is_threat,
    threat_type: is_threat && threat_type === 'other' ? (suspicious_urls.length > 0 ? 'suspicious_link' : 'scam') : threat_type,
    severity: is_threat && severity === 'low' && score >= 60 ? 'medium' : severity,
    title: (raw.title || (is_threat ? 'Potential threat detected' : 'Scan result')).slice(0, 90),
    summary,
    indicators,
    suspicious_urls,
    recommended_action: (raw.recommended_action || '').slice(0, 700),
    risk_score: is_threat ? Math.max(score, 60) : Math.min(score, 39),
    risk_level: pickEnum(raw.risk_level, RISK_LEVELS, score >= 70 ? 'high' : score >= 40 ? 'elevated' : score > 0 ? 'low' : 'safe'),
    risk_warnings: (raw.risk_warnings ?? []).map(toDisplayString).filter(Boolean),
  };
}

const SYSTEM_PROMPT =
  `You are Trust Shield, a security analyst. Analyze any user-provided content — email bodies, SMS/text messages, chat messages, social DMs, decoded QR code text, screenshots-of-login-page text, domains, or URLs — for the full range of consumer threats:
phishing, fake login pages, brand impersonation, tech-support scams, romance/pig-butchering scams, cryptocurrency scams, investment/pump-and-dump scams, fake shopping sites, fake shipping/USPS/UPS/DHL scams, IRS/government/tax scams, job/employment scams, gift-card scams, sextortion, malware droppers, credential theft, account-takeover attempts, and hacking indicators.
Also assess residual risk even for legitimate sites (tracking, data harvesting, aggressive redirects, look-alike domains, weak TLS, suspicious download prompts).
Use cautious, evidence-based language. Never invent identities, attackers, or countries.
Every summary must consist of 2-4 complete sentences and end with a period.
CRITICAL CONSISTENCY RULE: is_threat MUST be true whenever your summary, indicators, title, or recommended_action describe the content as malicious, phishing, a scam, fraudulent, credential-harvesting, spoofed, or otherwise dangerous — or whenever suspicious_urls is non-empty, severity is high/critical, or risk_score >= 60. Only set is_threat=false when the content is genuinely benign and no malicious indicators are present.`;

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
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: claimsData } = await supabase.auth.getClaims(token);
    const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub as string } : null;
    if (!user) return json({ error: 'Not signed in' }, 401);

    const body = await req.json().catch(() => ({}));
    const content: string = (body.content ?? '').toString().trim();
    const source: string = (body.source ?? 'manual').toString().slice(0, 200);
    const imageDataUrl: string | null =
      typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : null;

    if ((!content || content.length < 3) && !imageDataUrl) {
      return json({ error: 'Paste text or attach a screenshot to scan.' }, 400);
    }
    if (content.length > 8000) {
      return json({ error: 'Content too long (max 8000 characters).' }, 400);
    }
    // Rough cap ~8MB base64 payload
    if (imageDataUrl && imageDataUrl.length > 11_000_000) {
      return json({ error: 'Screenshot too large (max ~8MB).' }, 400);
    }

    if (!LOVABLE_API_KEY) return json({ error: 'AI service unavailable' }, 500);

    const gateway = createGateway(LOVABLE_API_KEY);
    let parsed: Analysis;
    const promptText =
      `Analyze the provided content for security threats. Keep the summary to 2-4 complete sentences. ` +
      `Return evidence-based results only; do not invent identities or attackers.` +
      (imageDataUrl
        ? ` A screenshot is attached — read visible sender addresses, subject, body copy, buttons, and any URLs shown; treat suspicious visual cues (spoofed logos, urgent language, mismatched sender domains) as indicators.`
        : '') +
      (content ? `\n\nText content:\n"""\n${content}\n"""` : '');

    const userContent: any[] = [{ type: 'text', text: promptText }];
    if (imageDataUrl) userContent.push({ type: 'image', image: imageDataUrl });

    const runModel = async (modelId: string) => {
      try {
        const { object } = await generateObject({
          model: gateway(modelId),
          schema: AnalysisSchema,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        });
        return normalize(object as z.infer<typeof AnalysisSchema>);
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          const raw = (error as { text?: string }).text ?? '';
          const salvaged = salvageJson(raw);
          if (salvaged) return normalize(salvaged);
        }
        throw error;
      }
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

    // Apply shared URL heuristics (same rules as the Chrome extension) so any
    // URL the extension would warn on also boosts Trust Shield's verdict.
    if (content) parsed = applyHeuristics(parsed, content);

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
  return _extractUrls(content);
}

function salvageJson(text: string): any | null {
  if (!text) return null;
  let s = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  s = s.slice(start, end + 1);
  try {
    const obj = JSON.parse(s);
    return {
      is_threat: !!obj.is_threat,
      threat_type: String(obj.threat_type ?? 'other'),
      severity: String(obj.severity ?? 'medium'),
      title: String(obj.title ?? 'Scan result'),
      summary: String(obj.summary ?? ''),
      indicators: Array.isArray(obj.indicators) ? obj.indicators.map(toDisplayString).filter(Boolean) : [],
      suspicious_urls: Array.isArray(obj.suspicious_urls) ? obj.suspicious_urls.map(toDisplayString).filter(Boolean) : [],
      recommended_action: String(obj.recommended_action ?? ''),
      risk_score: Number(obj.risk_score ?? 0),
      risk_level: String(obj.risk_level ?? 'safe'),
      risk_warnings: Array.isArray(obj.risk_warnings) ? obj.risk_warnings.map(toDisplayString).filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}

function _extractUrls(content: string): string[] {
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

// ============================================================================
// Shared URL heuristics — mirrors extension/background.js analyzeUrl().
// Keeps the in-app scanner and the Chrome extension in verdict-lockstep so any
// URL the extension would warn on also raises Trust Shield's risk score.
// ============================================================================
const SUSPICIOUS_TLDS = ['zip','mov','xyz','top','tk','ml','ga','cf','gq','click','country','kim','work','loan','review','science','party'];
const SHORTENERS = ['bit.ly','tinyurl.com','t.co','goo.gl','ow.ly','is.gd','buff.ly','cutt.ly','rebrand.ly','shorte.st'];
const BRAND_KEYWORDS = ['paypal','apple','microsoft','amazon','google','facebook','instagram','netflix','chase','wellsfargo','bankofamerica','coinbase','binance','usps','ups','fedex','dhl','irs'];
const RISKY_PATH_WORDS = ['login','verify','secure','account','update','confirm','wallet','gift','prize','free','password','signin','unlock'];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
  }
  return dp[m][n];
}

function analyzeUrlHeuristics(rawUrl: string): { risk: number; reasons: string[]; host: string | null } {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `http://${rawUrl}`);
  } catch {
    return { risk: 0, reasons: [], host: null };
  }
  const host = u.hostname.toLowerCase();
  const path = (u.pathname + u.search).toLowerCase();
  const reasons: string[] = [];
  let risk = 0;

  if (u.protocol === 'http:' && /^https?:\/\//i.test(rawUrl)) {
    risk += 20; reasons.push('Site does not use HTTPS encryption.');
  }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    risk += 40; reasons.push('URL uses a raw IP address instead of a domain name.');
  }
  if (host.includes('xn--')) {
    risk += 35; reasons.push('Hostname uses punycode — can disguise look-alike domains.');
  }
  const tld = host.split('.').pop() ?? '';
  if (SUSPICIOUS_TLDS.includes(tld)) {
    risk += 25; reasons.push(`Uncommon or abuse-prone top-level domain (.${tld}).`);
  }
  if (SHORTENERS.includes(host)) {
    risk += 30; reasons.push('Link shortener hides the real destination.');
  }
  const parts = host.split('.');
  if (parts.length >= 5) { risk += 15; reasons.push('Unusually deep subdomain chain.'); }

  const registrable = parts.slice(-2).join('.');
  const sld = parts.length >= 2 ? parts[parts.length - 2] : host;
  for (const brand of BRAND_KEYWORDS) {
    if (host.includes(brand) && !registrable.startsWith(brand + '.')) {
      risk += 30; reasons.push(`Contains the "${brand}" brand outside its real domain.`); break;
    }
    if (sld.length >= 4 && sld !== brand && levenshtein(sld, brand) === 1) {
      risk += 35; reasons.push(`Domain looks like a misspelling of "${brand}".`); break;
    }
  }

  const pathHits = RISKY_PATH_WORDS.filter((w) => path.includes(w));
  if (pathHits.length) {
    risk += 10 + pathHits.length * 5;
    reasons.push('URL path uses credential-harvesting keywords (' + pathHits.slice(0, 3).join(', ') + ').');
  }
  if (/\.(exe|scr|msi|bat|cmd|zip|mov|js)(\?|$)/i.test(u.pathname)) {
    risk += 30; reasons.push('URL points to an executable or archive download.');
  }
  if (rawUrl.includes('@') && rawUrl.indexOf('@') < (rawUrl.indexOf('?') === -1 ? rawUrl.length : rawUrl.indexOf('?'))) {
    risk += 25; reasons.push("URL contains an '@' — can redirect to a different host than it appears.");
  }

  return { risk: Math.min(100, risk), reasons, host };
}

function applyHeuristics(analysis: Analysis, content: string): Analysis {
  const urls = _extractUrls(content);
  if (!urls.length) return analysis;

  let bestRisk = 0;
  const newReasons: string[] = [];
  const flaggedUrls: string[] = [];
  for (const url of urls) {
    const { risk, reasons, host } = analyzeUrlHeuristics(url);
    if (risk >= 30) {
      flaggedUrls.push(url);
      for (const r of reasons) if (!newReasons.includes(r)) newReasons.push(r);
    }
    if (risk > bestRisk) bestRisk = risk;
    // silence unused
    void host;
  }
  if (bestRisk < 30 && !flaggedUrls.length) return analysis;

  // Merge: raise score to at least the heuristic verdict; add indicators/urls.
  const mergedIndicators = [...analysis.indicators];
  for (const r of newReasons) if (!mergedIndicators.includes(r)) mergedIndicators.push(r);
  const mergedUrls = [...analysis.suspicious_urls];
  for (const u of flaggedUrls) if (!mergedUrls.includes(u)) mergedUrls.push(u);

  const raisedScore = Math.max(analysis.risk_score, bestRisk);
  const isThreat = analysis.is_threat || bestRisk >= 30;
  const severity: Analysis['severity'] = raisedScore >= 75 ? 'high' : raisedScore >= 45 ? 'medium' : analysis.severity;

  return {
    ...analysis,
    is_threat: isThreat,
    indicators: mergedIndicators,
    suspicious_urls: mergedUrls,
    risk_score: raisedScore,
    risk_level: raisedScore >= 70 ? 'high' : raisedScore >= 40 ? 'elevated' : raisedScore > 0 ? 'low' : 'safe',
    severity,
    threat_type: isThreat && analysis.threat_type === 'other' ? 'suspicious_link' : analysis.threat_type,
    title: isThreat && !analysis.is_threat ? 'Suspicious link detected' : analysis.title,
  };
}