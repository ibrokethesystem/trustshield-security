import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Lock, Plus, Trash2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type VaultEntry = {
  id: string;
  label: string;
  username: string;
  password: string;
  notes: string;
  updated_at: string;
};

const COMMON = new Set([
  "password", "123456", "12345678", "qwerty", "letmein", "welcome", "admin",
  "iloveyou", "monkey", "dragon", "abc123", "111111", "password1", "qwerty123",
  "trustno1", "sunshine", "princess", "football", "baseball", "master",
]);

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  entropyBits: number;
  crackTime: string;
  tips: string[];
};

export function analyzePassword(pw: string): PasswordStrength {
  const tips: string[] = [];
  if (!pw) {
    return { score: 0, label: "Empty", color: "bg-muted", entropyBits: 0, crackTime: "—", tips: ["Type a password to check it."] };
  }
  const len = pw.length;
  const lower = /[a-z]/.test(pw);
  const upper = /[A-Z]/.test(pw);
  const digit = /\d/.test(pw);
  const symbol = /[^A-Za-z0-9]/.test(pw);
  let pool = 0;
  if (lower) pool += 26;
  if (upper) pool += 26;
  if (digit) pool += 10;
  if (symbol) pool += 33;
  const entropy = Math.log2(Math.max(pool, 1)) * len;

  const lc = pw.toLowerCase();
  const isCommon = COMMON.has(lc);
  const hasSequence = /(?:abcdef|qwerty|123456|password|iloveyou|admin|letmein)/i.test(pw);
  const repeated = /(.)\1{3,}/.test(pw);

  if (len < 8) tips.push("Use at least 12 characters — 16+ is much safer.");
  else if (len < 12) tips.push("Aim for 12+ characters. Longer is stronger than complex.");
  if (!upper) tips.push("Add uppercase letters (A–Z).");
  if (!lower) tips.push("Add lowercase letters (a–z).");
  if (!digit) tips.push("Include a digit (0–9).");
  if (!symbol) tips.push("Include a symbol like ! @ # $ % ^ & *.");
  if (isCommon) tips.push("This is one of the most-guessed passwords. Never use it.");
  if (hasSequence) tips.push("Avoid common sequences like 'qwerty', '123456', or dictionary words.");
  if (repeated) tips.push("Avoid repeating the same character 4+ times.");
  if (/^[A-Za-z]+$/.test(pw)) tips.push("Letters only is weak — mix in numbers and symbols.");
  if (/^\d+$/.test(pw)) tips.push("Digits only is very weak. Add letters and symbols.");

  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (isCommon || len < 6) score = 0;
  else if (entropy < 36) score = 1;
  else if (entropy < 60) score = 2;
  else if (entropy < 90) score = 3;
  else score = 4;
  if (hasSequence || repeated) score = Math.max(0, score - 1) as 0 | 1 | 2 | 3 | 4;

  const labels = ["Very weak", "Weak", "Okay", "Strong", "Excellent"];
  const colors = ["bg-destructive", "bg-orange-500", "bg-yellow-500", "bg-emerald-500", "bg-emerald-400"];

  // Rough crack time assuming 10^10 guesses/sec offline.
  const guesses = Math.pow(2, entropy);
  const seconds = guesses / 1e10;
  const crackTime =
    seconds < 1 ? "instant"
    : seconds < 60 ? `${Math.round(seconds)} sec`
    : seconds < 3600 ? `${Math.round(seconds / 60)} min`
    : seconds < 86400 ? `${Math.round(seconds / 3600)} hr`
    : seconds < 86400 * 365 ? `${Math.round(seconds / 86400)} days`
    : seconds < 86400 * 365 * 1000 ? `${Math.round(seconds / (86400 * 365))} years`
    : "centuries+";

  if (tips.length === 0) tips.push("Great password. Store it in a password manager and enable 2FA.");

  return { score, label: labels[score], color: colors[score], entropyBits: Math.round(entropy), crackTime, tips };
}

function storageKey(userId: string | undefined) {
  return `trust-shield:vault:${userId ?? "anon"}`;
}

export default function PasswordsView({ userId }: { userId: string | undefined }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const strength = useMemo(() => analyzePassword(pw), [pw]);

  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<{ label: string; username: string; password: string; notes: string }>({
    label: "", username: "", password: "", notes: "",
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      setEntries(raw ? JSON.parse(raw) : []);
    } catch { setEntries([]); }
  }, [userId]);

  const persist = (next: VaultEntry[]) => {
    setEntries(next);
    try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch {}
    try {
      const summary = {
        count: next.length,
        weak: next.filter((e) => analyzePassword(e.password).score <= 1).length,
        okay: next.filter((e) => analyzePassword(e.password).score === 2).length,
        strong: next.filter((e) => analyzePassword(e.password).score >= 3).length,
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem(`trust-shield:vault-summary:${userId ?? "anon"}`, JSON.stringify(summary));
      localStorage.setItem(`trust-shield:vault-summary:current`, JSON.stringify(summary));
    } catch {}
  };

  const add = () => {
    if (!form.label.trim() || !form.password) {
      toast.error("Add at least a label and a password.");
      return;
    }
    const entry: VaultEntry = {
      id: crypto.randomUUID(),
      label: form.label.trim(),
      username: form.username.trim(),
      password: form.password,
      notes: form.notes.trim(),
      updated_at: new Date().toISOString(),
    };
    persist([entry, ...entries]);
    setForm({ label: "", username: "", password: "", notes: "" });
    toast.success("Saved to your local vault");
  };

  const remove = (id: string) => {
    persist(entries.filter((e) => e.id !== id));
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-primary" /> Password security
        </h2>
        <p className="text-sm text-muted-foreground">
          Check password strength and keep a private reference vault. Nothing here leaves your browser.
        </p>
      </header>

      {/* Strength checker */}
      <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Strength checker</h3>
          <button type="button" onClick={() => setShow((s) => !s)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? "Hide" : "Show"}
          </button>
        </div>
        <Input
          type={show ? "text" : "password"}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Type a password to test…"
          autoComplete="new-password"
        />
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full transition-all", strength.color)} style={{ width: `${(strength.score / 4) * 100}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{strength.label}</span>
            <span>Entropy: {strength.entropyBits} bits</span>
            <span>Est. offline crack time: {strength.crackTime}</span>
          </div>
        </div>
        <ul className="text-sm space-y-1 list-disc pl-5">
          {strength.tips.map((t, i) => (
            <li key={i} className={strength.score >= 3 ? "text-emerald-400" : "text-muted-foreground"}>{t}</li>
          ))}
        </ul>
        <div className="text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded-lg p-3 flex gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>General tips: use 16+ characters, a unique password per account, a passphrase you can remember, and enable two-factor authentication. Prefer a real password manager for daily use.</span>
        </div>
      </div>

      {/* Vault */}
      <div className="rounded-xl border border-border/60 bg-card/50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /> Password reference vault</h3>
          <span className="text-xs text-muted-foreground">{entries.length} saved · local only</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Label</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Gmail" />
          </div>
          <div>
            <Label className="text-xs">Username / email</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="optional" autoComplete="off" />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="password to remember" autoComplete="off" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
          </div>
        </div>
        <Button onClick={add} className="gap-2"><Plus className="h-4 w-4" /> Save to vault</Button>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground pt-2">Nothing saved yet. Entries stay on this device only.</p>
        ) : (
          <ul className="divide-y divide-border/60 pt-2">
            {entries.map((e) => {
              const s = analyzePassword(e.password);
              const isShown = !!reveal[e.id];
              return (
                <li key={e.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{e.label}</span>
                      <span className={cn("text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded", s.color, "text-background")}>{s.label}</span>
                    </div>
                    {e.username && <div className="text-xs text-muted-foreground truncate">{e.username}</div>}
                    <div className="mt-1 flex items-center gap-2">
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded font-mono truncate max-w-[24ch]">
                        {isShown ? e.password : "•".repeat(Math.min(e.password.length, 12))}
                      </code>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setReveal({ ...reveal, [e.id]: !isShown })}>
                        {isShown ? "Hide" : "Show"}
                      </button>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => copy(e.password)}>Copy</button>
                    </div>
                    {e.notes && <div className="text-xs text-muted-foreground mt-1">{e.notes}</div>}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(e.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded-lg p-3">
          Vault entries are saved in this browser's local storage only. They are never uploaded to Trust Shield's servers or shared with Cyber Guardian. Clear your browser data to remove them.
        </div>
      </div>
    </section>
  );
}