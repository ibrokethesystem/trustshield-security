import { useEffect, useRef, useState, useCallback } from "react";
import { Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "hi", label: "हिन्दी (Hindi)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ar", label: "العربية" },
  { code: "ru", label: "Русский" },
];

const NAME: Record<string, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.label.replace(/\s*\(.+\)$/, "")]),
);

const STORAGE_KEY = "ts_language";
// Bumped: v1 poisoned entries with English fallbacks when a chunk failed,
// which permanently broke Hindi/Tamil for existing users. v2 also never
// caches failed translations, so retries happen automatically.
const CACHE_KEY = "ts_translation_cache_v2";
// Cache of original English text per node, so we can restore or re-translate.
const originals = new WeakMap<Text, string>();
// { [lang]: { [english]: translated } }
let cache: Record<string, Record<string, string>> = {};
try {
  cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {};
} catch { cache = {}; }

const persistCache = () => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* ignore quota */ }
};

const shouldSkip = (node: Node) => {
  let el: Node | null = node.parentNode;
  while (el && el instanceof Element) {
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "CODE" || tag === "PRE" || tag === "TEXTAREA") return true;
    if (el.getAttribute("data-no-translate") !== null) return true;
    el = el.parentNode;
  }
  return false;
};

const collectTextNodes = (root: Node): Text[] => {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const t = n.nodeValue || "";
      if (!t.trim()) return NodeFilter.FILTER_REJECT;
      if (shouldSkip(n)) return NodeFilter.FILTER_REJECT;
      // Skip pure numbers / punctuation.
      if (!/[A-Za-z]/.test(t)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let cur: Node | null;
  while ((cur = walker.nextNode())) out.push(cur as Text);
  return out;
};

// Placeholders on inputs/textareas + button aria-labels.
const collectAttrTargets = (root: ParentNode) => {
  const items: { el: Element; attr: string; value: string }[] = [];
  const nodes = root.querySelectorAll("[placeholder], [aria-label], [title]");
  nodes.forEach((el) => {
    if (el.closest("[data-no-translate]")) return;
    (["placeholder", "aria-label", "title"] as const).forEach((a) => {
      const v = el.getAttribute(a);
      if (v && v.trim() && /[A-Za-z]/.test(v)) items.push({ el, attr: a, value: v });
    });
  });
  return items;
};

const attrOriginals = new WeakMap<Element, Record<string, string>>();

// Serialize apply runs so callers can await the *actual* completion, and
// so the "Translating…" indicator stays on for the full duration (including
// any queued re-run triggered by DOM mutations during translation).
let currentRun: Promise<void> = Promise.resolve();
let pendingTarget: string | null = null;
const busyListeners = new Set<(b: boolean) => void>();
let busyCount = 0;
const setGlobalBusy = (delta: number) => {
  busyCount = Math.max(0, busyCount + delta);
  const b = busyCount > 0;
  busyListeners.forEach((fn) => fn(b));
};

async function translateBatch(strings: string[], target: string): Promise<Record<string, string>> {
  if (!strings.length) return {};
  const langCache = cache[target] || (cache[target] = {});
  const need = Array.from(new Set(strings.filter((s) => !(s in langCache))));
  if (need.length === 0) return langCache;

  // Smaller chunks + parallel dispatch = much lower wall-clock latency.
  const chunks: string[][] = [];
  for (let i = 0; i < need.length; i += 30) chunks.push(need.slice(i, i + 30));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const { data, error } = await supabase.functions.invoke("translate-text", {
          body: { texts: chunk, target: NAME[target] || target },
        });
        if (error) throw error;
        const translations: string[] = data?.translations || [];
        chunk.forEach((src, i) => {
          const t = translations[i];
          if (typeof t === "string" && t.trim() && t.trim() !== src.trim()) {
            langCache[src] = t;
          }
        });
      } catch (err) {
        console.error("translate chunk failed", err);
      }
    }),
  );
  persistCache();
  return langCache;
}

async function applyLanguageInner(target: string) {
  setGlobalBusy(+1);
  try {
    // 1. Record originals for any nodes we haven't seen yet.
    const textNodes = collectTextNodes(document.body);
    textNodes.forEach((n) => {
      if (!originals.has(n)) originals.set(n, n.nodeValue || "");
    });
    const attrTargets = collectAttrTargets(document.body);
    attrTargets.forEach(({ el, attr, value }) => {
      let m = attrOriginals.get(el);
      if (!m) { m = {}; attrOriginals.set(el, m); }
      if (!(attr in m)) m[attr] = value;
    });

    // 2. Restoring to English = just write originals back.
    if (target === "en") {
      textNodes.forEach((n) => {
        const orig = originals.get(n);
        if (orig != null && n.nodeValue !== orig) n.nodeValue = orig;
      });
      attrTargets.forEach(({ el, attr }) => {
        const orig = attrOriginals.get(el)?.[attr];
        if (orig != null && el.getAttribute(attr) !== orig) el.setAttribute(attr, orig);
      });
      return;
    }

    // 3. Gather all original strings.
    const srcSet = new Set<string>();
    textNodes.forEach((n) => { const o = originals.get(n); if (o) srcSet.add(o.trim()); });
    attrTargets.forEach(({ el, attr }) => {
      const o = attrOriginals.get(el)?.[attr]; if (o) srcSet.add(o.trim());
    });

    const map = await translateBatch(Array.from(srcSet), target);

    // 4. Apply, preserving surrounding whitespace on text nodes.
    textNodes.forEach((n) => {
      const orig = originals.get(n) || "";
      const trimmed = orig.trim();
      const t = map[trimmed];
      if (!t) return;
      const leading = orig.match(/^\s*/)?.[0] ?? "";
      const trailing = orig.match(/\s*$/)?.[0] ?? "";
      const next = leading + t + trailing;
      if (n.nodeValue !== next) n.nodeValue = next;
    });
    attrTargets.forEach(({ el, attr }) => {
      const orig = attrOriginals.get(el)?.[attr] || "";
      const t = map[orig.trim()];
      if (t && el.getAttribute(attr) !== t) el.setAttribute(attr, t);
    });
  } finally {
    setGlobalBusy(-1);
  }
}

function applyLanguage(target: string): Promise<void> {
  // Coalesce concurrent requests: if a run is in-flight, remember the latest
  // target and chain a single follow-up run after it finishes.
  pendingTarget = target;
  const next = currentRun.then(async () => {
    const t = pendingTarget;
    pendingTarget = null;
    if (t == null) return;
    await applyLanguageInner(t);
  });
  currentRun = next.catch(() => {});
  return next;
}

export const LanguageSwitcher = () => {
  const [lang, setLang] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || "en");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const debounceRef = useRef<number | null>(null);

  const runApply = useCallback(async (target: string) => {
    await applyLanguage(target);
  }, []);

  // Subscribe to global busy state so the label stays "Translating…" for the
  // full duration, even across queued re-runs from DOM mutations.
  useEffect(() => {
    const fn = (b: boolean) => setBusy(b);
    busyListeners.add(fn);
    return () => { busyListeners.delete(fn); };
  }, []);

  // Re-apply on DOM mutations (new content, route changes, dialogs, toasts).
  useEffect(() => {
    const scheduleReapply = () => {
      if (lang === "en") return; // English == source, no work needed
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => runApply(lang), 120);
    };
    const obs = new MutationObserver(scheduleReapply);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    observerRef.current = obs;
    return () => { obs.disconnect(); if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [lang, runApply]);

  // Apply once on mount if a non-English preference was saved.
  useEffect(() => {
    if (lang !== "en") runApply(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (code: string) => {
    setOpen(false);
    setLang(code);
    localStorage.setItem(STORAGE_KEY, code);
    await runApply(code);
  };

  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  return (
    <div data-no-translate className="fixed bottom-4 right-4 z-[100]">
      <div className="relative">
        {open && (
          <div className="absolute bottom-14 right-0 w-56 max-h-80 overflow-y-auto rounded-xl border border-border bg-card shadow-2xl p-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => pick(l.code)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-secondary transition-colors ${
                  l.code === lang ? "bg-secondary text-foreground" : "text-muted-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-shield text-primary-foreground shadow-lg glow-shield hover:opacity-90 transition-opacity"
          aria-label="Change language"
        >
          <Languages className="w-4 h-4" />
          <span className="text-sm font-medium">{busy ? "Translating…" : current.label}</span>
        </button>
      </div>
    </div>
  );
};

export default LanguageSwitcher;