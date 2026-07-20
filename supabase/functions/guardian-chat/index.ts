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
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) return json({ error: 'Not signed in' }, 401);

    const body = await req.json().catch(() => ({}));
    const threatId: string | undefined = body.threat_id;
    const mode: string = typeof body.mode === 'string' ? body.mode : (threatId ? 'threat' : 'general');
    const messages: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (messages.length === 0) return json({ error: 'Empty conversation' }, 400);

    const stringify = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (Array.isArray(v)) return v.map(stringify).filter(Boolean).join(' | ');
      try { return JSON.stringify(v); } catch { return String(v); }
    };

    let context = '';
    if (mode === 'threat' && threatId) {
      const { data: threat, error: tErr } = await supabase
        .from('threats')
        .select('title, description, threat_type, severity, source, details')
        .eq('id', threatId)
        .maybeSingle();
      if (tErr || !threat) return json({ error: 'Threat not found' }, 404);
      const details: any = threat.details ?? {};
      context = [
        `Threat: ${threat.title}`,
        `Type: ${threat.threat_type} | Severity: ${threat.severity}`,
        threat.description ? `Summary: ${threat.description}` : '',
        details.indicators?.length ? `Indicators: ${stringify(details.indicators)}` : '',
        details.suspicious_urls?.length ? `Suspicious URLs: ${stringify(details.suspicious_urls)}` : '',
        details.recommended_action ? `Recommended action: ${stringify(details.recommended_action)}` : '',
        details.original_snippet ? `Original snippet: ${String(details.original_snippet).slice(0, 800)}` : '',
      ].filter(Boolean).join('\n');
    } else {
      // "all" or "general/emergency" — load the user's recent threats to give overview help.
      const { data: list } = await supabase
        .from('threats')
        .select('title, threat_type, severity, status, description, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      const items = (list ?? []).map((t: any, i: number) =>
        `${i + 1}. [${t.severity}/${t.status}] ${t.threat_type} — ${t.title}${t.description ? ' — ' + String(t.description).slice(0, 160) : ''}`,
      );
      const activeCount = (list ?? []).filter((t: any) => t.status === 'active').length;
      context = items.length
        ? `User's recent Trust Shield threats (${activeCount} still active):\n${items.join('\n')}`
        : `The user currently has no threats logged in Trust Shield.`;
    }

    const modeGuidance =
      mode === 'emergency'
        ? `The user is asking for EMERGENCY safety guidance. Give clear, prioritized, numbered steps for what to do RIGHT NOW to keep their computer, accounts, and identity safe (disconnect from Wi-Fi, change critical passwords from a clean device, enable 2FA, run a reputable antivirus scan, freeze credit if financial info leaked, contact banks, report to authorities where relevant). Keep it calm and actionable.`
        : mode === 'all'
        ? `The user wants an overview of ALL of their alerts. Summarize patterns (types, severity, what to prioritize), and suggest next actions. If they ask about a specific one, focus on that.`
        : mode === 'general'
        ? `The user is asking general online-safety questions. Answer helpfully and concretely.`
        : `Answer ONLY about this single threat and general online-safety guidance.`;

    const systemPrompt = `You are Cyber Guardian, the friendly AI assistant inside Trust Shield. You help everyday users stay safe online.
Rules:
- Explain in plain language. No jargon unless you define it in the same sentence.
- Be honest about uncertainty. Do not invent attacker names, countries, or evidence.
- Trust Shield is a web app; it cannot reach into the user's OS, email, or accounts. Do not promise device-level actions.
- Keep replies focused, 1-5 short paragraphs or a short numbered list when giving steps.

${modeGuidance}

ABOUT TRUST SHIELD (facts about this app — use these when the user asks what Trust Shield can do):
- Trust Shield is a web app dashboard where users scan suspicious content and see detected threats.
- Scanner: users can paste an email, text/SMS, chat message, URL, or QR-code text into "Scan a message or link" on the dashboard. The AI checks for phishing, fake login pages, scams, impersonation, and risky links. Even legitimate-looking sites are checked for tracking, weak TLS, and residual risk.
- Screenshot scanning: users can attach a screenshot (e.g. of an email or DM) and Trust Shield analyzes the image with vision AI.
- File scanning: the "Scan a file" button uploads a file to VirusTotal via Trust Shield's backend and returns a verdict and risk score.
- Website rating: URLs are cross-checked against VirusTotal for known-malicious/suspicious verdicts.
- Threats list: confirmed threats appear on the dashboard. Each threat can be Dismissed (mark as false alarm/resolved) or Block source (mark as blocked so it stops counting as active). Neither literally severs a network connection — Trust Shield is a web app.
- Scan history tab: shows every scan the user has run.
- Cyber Guardian (that's you): an in-app AI assistant. There is a button on each threat row ("Ask Cyber Guardian") and a dedicated Cyber Guardian tab in the sidebar with modes: All alerts, One alert, Emergency, and Stay safe.
- Chrome extension: YES, Trust Shield ships a Chrome extension. It's downloadable from a "Download Chrome extension" button in the sidebar (public/trust-shield-extension.zip). Users unzip, open chrome://extensions, enable Developer mode, and Load unpacked. It warns before loading dangerous URLs using local heuristics (HTTPS, punycode, look-alike brand domains, suspicious TLDs, shorteners, risky paths) blended with VirusTotal's URL rating.
- Mac app: Trust Shield can be installed as a Mac app (Electron build, downloadable zip).
- PWA install: the app can be installed via the browser's built-in "Install app" button in the address bar (Chrome, Edge).
- Accounts: users sign up with email/password or Google. They can change their display name and upload a profile picture from the profile dialog. Account activity shows days since sign-in, items scanned, threats found, and resolved.
- Language switcher: the UI can translate to languages like Spanish, French, Hindi, Tamil, etc.
- Security score, "AT RISK / PROTECTED" banner, and a 14-day threat trend chart live on the dashboard.
- What Trust Shield CANNOT do: read the user's Gmail, phone SMS, or files on their computer on its own; monitor traffic; automatically activate a VPN; or delete files. Everything is user-submitted content the user pastes, uploads, or clicks (extension case).

CONTEXT:
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