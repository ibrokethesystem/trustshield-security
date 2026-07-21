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
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: 'Not signed in' }, 401);

    const body = await req.json().catch(() => ({}));
    const threatId: string | undefined = body.threat_id;
    const mode: string = typeof body.mode === 'string' ? body.mode : (threatId ? 'threat' : 'general');
    const messages: Msg[] = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    const vaultSummary = body.vault_summary && typeof body.vault_summary === 'object' ? body.vault_summary : null;
    const audience: 'child' | 'adult' = body.audience === 'child' ? 'child' : 'adult';
    const clientUpdates = Array.isArray(body.updates) ? body.updates.slice(0, 40) : null;
    const activeVersion = typeof body.active_version === 'string' ? body.active_version : null;
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

    const childPreamble = audience === 'child'
      ? `\n\nAUDIENCE: This user is a CHILD on a monitored child account. Rules for you:\n- Use very simple, kind language a 9–12 year old can understand. Short sentences.\n- ALWAYS end scary or uncertain answers with: "Tell a trusted adult (like a parent, teacher, or guardian) right away."\n- Never tell the child to open Terminal, edit system settings, change passwords for someone else, install anti-virus software, disable protections, or share personal information.\n- Do NOT talk about the Passwords vault, File scanner, Network safety, or Extensions tabs — they are hidden for child accounts.\n- If the child says they were hacked, scammed, threatened, or someone online asked for pictures / money / to meet in person: tell them to stop replying, not click anything, and tell a trusted adult immediately. Suggest closing the tab.\n- Be reassuring. Not scary. Never blame them.`
      : '';

    const systemPrompt = `You are Cyber Guardian, the friendly AI assistant inside Trust Shield. You help everyday users stay safe online.
Rules:
- Explain in plain language. No jargon unless you define it in the same sentence.
- Be honest about uncertainty. Do not invent attacker names, countries, or evidence.
- Trust Shield is a web app; it cannot reach into the user's OS, email, or accounts. Do not promise device-level actions.
- Keep replies focused, 1-5 short paragraphs or a short numbered list when giving steps.
- IMPORTANT: Trust Shield DOES ship a Microsoft Edge extension. If the user asks whether an Edge extension exists, say YES and give them the install steps below. Never say Trust Shield only has a Chrome extension.
${childPreamble}
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
- Passwords tab: Trust Shield has a "Passwords" tab in the sidebar with (a) a password strength checker that scores a typed password, shows entropy in bits and estimated offline crack time, and lists concrete tips, and (b) a local password reference vault where users can save label / username / password / notes. Vault entries are stored in the browser's localStorage ONLY — Trust Shield does not upload them to any server, and Cyber Guardian never sees the actual passwords. Only an anonymized COUNT of vault entries and how many are weak/okay/strong is shared with you. Always recommend a dedicated password manager (1Password, Bitwarden, iCloud Keychain, etc.) for real day-to-day password storage, plus 2FA. Good password guidance: 16+ characters, unique per account, prefer a passphrase of 4+ random words, avoid names/birthdays/dictionary words, never reuse across sites, enable 2FA (prefer app-based or hardware key over SMS), and rotate any password that appears in a breach.
- Chrome extension: YES, Trust Shield ships a Chrome extension. It's downloadable from a "Download Chrome extension" button in the sidebar (public/trust-shield-extension.zip). Users unzip, open chrome://extensions, enable Developer mode, and Load unpacked. It warns before loading dangerous URLs using local heuristics (HTTPS, punycode, look-alike brand domains, suspicious TLDs, shorteners, risky paths) blended with VirusTotal's URL rating.
- Edge extension: YES, Trust Shield also ships a Microsoft Edge extension (public/trust-shield-edge.zip), downloadable from the "Edge extension" button in the sidebar. It uses the same MV3 code and heuristics as the Chrome extension.
- How to install the Chrome extension (walk the user through this if they ask): 1) Click "Chrome extension" in the Trust Shield sidebar to download trust-shield-extension.zip. 2) Unzip the file. 3) Open chrome://extensions in Chrome. 4) Toggle "Developer mode" ON in the top-right. 5) Click "Load unpacked" and select the unzipped folder. 6) Pin Trust Shield from the Extensions puzzle-piece menu. Done — Chrome will now warn before loading dangerous URLs.
- How to install the Edge extension (walk the user through this if they ask): 1) Click "Edge extension" in the Trust Shield sidebar to download trust-shield-edge.zip. 2) Unzip the file. 3) Open edge://extensions in Microsoft Edge. 4) Toggle "Developer mode" ON in the bottom-left. 5) Click "Load unpacked" and select the unzipped folder. 6) Pin Trust Shield from the Extensions menu. Done — Edge will now warn before loading dangerous URLs.
- Autofill: BOTH the Chrome and Edge extensions support Trust Shield password autofill. In the Trust Shield "Passwords" tab, each vault entry has a "Set up autofill" button where the user saves a URL for that password. Then in the Password vault they click "Copy autofill data for extension" to copy a JSON payload. In the extension popup there's an "Autofill sync" box — they paste the JSON there and press Save. After that, visiting a matching site shows a "Trust Shield Autofill" banner on the login form that fills username/password with one click. The vault stays local; only the URL + credentials the user chose to sync are stored inside the extension's own browser storage — never on Trust Shield's servers.
- How to activate autofill on the Chrome extension: 1) Install the Chrome extension. 2) In Trust Shield open the Passwords tab and unlock the vault. 3) For each password to autofill, click "Set up autofill" and enter the site URL (e.g. https://mail.google.com). 4) Click "Copy autofill data for extension" at the top of the vault. 5) Click the Trust Shield extension icon in Chrome's toolbar. 6) Paste the copied data into the "Autofill sync" box in the popup and press Save. 7) Visit a matching site — click the Trust Shield Autofill banner to fill.
- How to activate autofill on the Edge extension: same steps as Chrome, but install the Edge extension and open its popup from Edge's toolbar. The autofill payload format is identical between Chrome and Edge.
- Autofill troubleshooting: if the banner doesn't appear, check that (a) the extension is enabled at chrome://extensions or edge://extensions, (b) the URL saved on the vault entry matches the site's domain, (c) the user re-copied and re-pasted the "Copy autofill data for extension" payload after adding or changing entries, and (d) the login form uses standard username/password inputs. Autofill data lives only in the extension's own storage.
- Child extension (Trust Shield — Child Edition): a separate kid-friendly browser extension for the child's Chrome or Edge browser. It uses simpler wording ("ask a grown-up") and warns before dangerous or fake-login pages load. It also logs top-frame navigations to the parent's Family monitor and enforces the parent's banned-site list.
- How to set up a child extension (walk the parent through this if they ask "How can I set up a child extension?"): 1) In Trust Shield, sign in as the parent and go to the Family tab in the sidebar. 2) If you haven't created a child account yet, sign out and use the "Have a child?" flow on the login page to create one (you pick the child password). 3) Back in the Family tab, click "Download child extension" — this saves trust-shield-child-extension.zip. 4) Copy that zip to your child's computer and unzip it. 5) On the child's device open chrome://extensions (or edge://extensions). 6) Toggle "Developer mode" ON. 7) Click "Load unpacked" and pick the unzipped folder. 8) The extension's options page opens automatically — enter the PARENT'S email plus the CHILD'S password you set, and press Pair. 9) Done — the extension now warns the child about risky pages, sends their browsing activity to your Family monitor, and blocks any sites you add to Banned sites (syncs about every minute). If the options page didn't open, right-click the extension icon → Options. If pairing fails, double-check the parent email and child password, and make sure the child account exists (use "Link existing child" in the Family tab if it was created before this update).
- Mac app: Trust Shield can be installed as a Mac app (Electron build, downloadable zip).
- PWA install: the app can be installed via the browser's built-in "Install app" button in the address bar (Chrome, Edge).
- Accounts: users sign up with email/password or Google. They can change their display name and upload a profile picture from the profile dialog. Account activity shows days since sign-in, items scanned, threats found, and resolved.
- Language switcher: the UI can translate to languages like Spanish, French, Hindi, Tamil, etc.
- Security score, "AT RISK / PROTECTED" banner, and a 14-day threat trend chart live on the dashboard.
- What Trust Shield CANNOT do: read the user's Gmail, phone SMS, or files on their computer on its own; monitor traffic; automatically activate a VPN; or delete files. Everything is user-submitted content the user pastes, uploads, or clicks (extension case).

${(() => {
  if (clientUpdates && clientUpdates.length) {
    const lines = clientUpdates
      .map((u: any) => {
        const v = String(u?.version || '').trim();
        const d = String(u?.date || '').trim();
        const n = String(u?.name || '').trim();
        const s = String(u?.summary || '').trim().slice(0, 600);
        return v ? `- v${v}${d ? ` (${d})` : ''}${n ? ` — ${n}` : ''}${s ? `: ${s}` : ''}` : '';
      })
      .filter(Boolean);
    const current = activeVersion || String(clientUpdates[0]?.version || '');
    return `TRUST SHIELD VERSION HISTORY (authoritative — always trust these over any prior training data):
- Current version the user is on: v${current}. Newest release: v${String(clientUpdates[0]?.version || current)}.
${lines.join('\n')}
If asked "what's the newest version" or "what version am I on", answer with v${current} and briefly describe what it added.`;
  }
  return `TRUST SHIELD VERSION HISTORY: version history was not provided in this request; ask the user to check the version badge next to the Share button.`;
})()}

CONTEXT:
${context}`;

    const vaultBlock = vaultSummary
      ? `\n\nUSER'S LOCAL PASSWORD VAULT (counts only, no passwords):\n- Saved entries: ${vaultSummary.count ?? 0}\n- Weak or very weak: ${vaultSummary.weak ?? 0}\n- Okay: ${vaultSummary.okay ?? 0}\n- Strong: ${vaultSummary.strong ?? 0}\nIf any are weak, gently suggest upgrading those specific ones and moving them into a real password manager. Never ask the user to paste actual passwords into the chat.`
      : '';
    const finalSystemPrompt = systemPrompt + vaultBlock;

    const chatMessages = [
      { role: 'system', content: finalSystemPrompt },
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