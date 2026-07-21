import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Eye, EyeOff, KeyRound, Lock, Plus, Trash2, ShieldCheck, ShieldAlert,
  Fingerprint, Unlock, LockKeyhole, Cloud, Loader2, Globe, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type VaultEntry = {
  id: string;
  label: string;
  username: string;
  password: string;
  notes: string;
  url: string;
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

function localVaultKey(userId: string | undefined) {
  return `trust-shield:vault:${userId ?? "anon"}`;
}

// SHA-256 hex
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ===== Client-side vault encryption (AES-GCM, key derived from PIN) =====
// Vault entry fields (password / username / notes) are encrypted in the
// browser before they reach the database, so the stored values are
// ciphertext at rest. Only a user who knows the vault unlock code can
// derive the key and read them.

const ENC_PREFIX = "enc:v1:";

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function deriveVaultKey(pin: string, saltHex: string): Promise<CryptoKey> {
  const salt = hexToBytes(saltHex);
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 200_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptField(key: CryptoKey, plain: string): Promise<string> {
  if (!plain) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(plain) as BufferSource,
  ));
  return `${ENC_PREFIX}${bytesToB64(iv)}:${bytesToB64(ct)}`;
}

async function decryptField(key: CryptoKey, value: string): Promise<string> {
  if (!value || !value.startsWith(ENC_PREFIX)) return value ?? "";
  const rest = value.slice(ENC_PREFIX.length);
  const [ivB64, ctB64] = rest.split(":");
  if (!ivB64 || !ctB64) return "";
  try {
    const iv = b64ToBytes(ivB64);
    const ct = b64ToBytes(ctB64);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return "";
  }
}

async function encryptEntryFields(
  key: CryptoKey,
  fields: { password: string; username: string; notes: string },
) {
  return {
    password: await encryptField(key, fields.password),
    username: fields.username ? await encryptField(key, fields.username) : "",
    notes: fields.notes ? await encryptField(key, fields.notes) : "",
  };
}

async function decryptEntry(key: CryptoKey, e: VaultEntry): Promise<VaultEntry> {
  return {
    ...e,
    password: await decryptField(key, e.password),
    username: await decryptField(key, e.username),
    notes: await decryptField(key, e.notes),
  };
}

const WEBAUTHN_LOCAL_KEY = (uid: string) => `trust-shield:webauthn:${uid}`;

function isWebAuthnSupported() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window;
}

// Detects when this document (typically an embedded preview iframe) has been
// denied the `publickey-credentials-create` / `-get` Permissions Policy.
function webAuthnPermissionBlocked(kind: "create" | "get"): boolean {
  try {
    const feature = kind === "create" ? "publickey-credentials-create" : "publickey-credentials-get";
    // Modern API
    // @ts-ignore - permissionsPolicy is not in lib.dom yet
    const pp = document.permissionsPolicy || document.featurePolicy;
    if (pp && typeof pp.allowsFeature === "function") {
      return !pp.allowsFeature(feature);
    }
  } catch {}
  return false;
}

function isTopWindow() {
  try { return window.top === window.self; } catch { return false; }
}

async function registerFingerprintCredential(userId: string, userLabel: string): Promise<string> {
  if (!isWebAuthnSupported()) throw new Error("Fingerprint / biometric not supported on this device");
  if (webAuthnPermissionBlocked("create")) {
    throw new Error(
      "This preview frame blocks fingerprint enrollment. Open Trust Shield in its own tab (use the ⧉ button in the preview, or your published URL) and try again."
    );
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Trust Shield" },
      user: { id: userIdBytes, name: userLabel, displayName: userLabel },
      pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Registration cancelled");
  const idB64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
  return idB64;
}

async function verifyFingerprintCredential(credentialIdB64: string): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  if (webAuthnPermissionBlocked("get")) {
    toast.error("Fingerprint unlock blocked in preview", {
      description: "Open Trust Shield in its own tab to use fingerprint unlock.",
    });
    return false;
  }
  const raw = Uint8Array.from(atob(credentialIdB64), (c) => c.charCodeAt(0));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: raw, type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export default function PasswordsView({ userId, onAskGuardian }: { userId: string | undefined; onAskGuardian?: (browser: "Chrome" | "Edge") => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const strength = useMemo(() => analyzePassword(pw), [pw]);

  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<{ label: string; username: string; password: string; notes: string }>({
    label: "", username: "", password: "", notes: "",
  });
  const [loading, setLoading] = useState<boolean>(!!userId);

  // Lock state
  const [lockEnabled, setLockEnabled] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [pinSalt, setPinSalt] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [fingerprintReady, setFingerprintReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Derived AES-GCM key from the PIN. Kept in memory only. When set, new
  // writes are encrypted before being sent to the database.
  const [derivedKey, setDerivedKey] = useState<CryptoKey | null>(null);

  // Setup form
  const [setupOpen, setSetupOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [enrollFinger, setEnrollFinger] = useState(false);

  // Change-password form
  const [changeOpen, setChangeOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [changePin, setChangePin] = useState("");
  const [changePin2, setChangePin2] = useState("");

  const updateSummary = useCallback((next: VaultEntry[]) => {
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
  }, [userId]);

  // Load entries + settings when signed in
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) {
        try {
          const raw = localStorage.getItem(localVaultKey(undefined));
          const list: VaultEntry[] = raw ? JSON.parse(raw) : [];
          if (!cancelled) {
            const norm = list.map((e) => ({ ...e, url: e.url ?? "" }));
            setEntries(norm); updateSummary(norm);
          }
        } catch { if (!cancelled) setEntries([]); }
        setLoading(false);
        return;
      }
      setLoading(true);

      // Migrate any pre-existing local entries to cloud (one-time)
      try {
        const legacyRaw = localStorage.getItem(localVaultKey(userId));
        if (legacyRaw) {
          const legacy: VaultEntry[] = JSON.parse(legacyRaw);
          if (Array.isArray(legacy) && legacy.length > 0) {
            const rows = legacy.map((e) => ({
              user_id: userId, label: e.label, username: e.username || "", password: e.password, notes: e.notes || "",
            }));
            await supabase.from("vault_entries").insert(rows);
          }
          localStorage.removeItem(localVaultKey(userId));
        }
      } catch {}

      const { data: setting } = await supabase
        .from("vault_settings").select("*").eq("user_id", userId).maybeSingle();
      if (cancelled) return;

      const enabled = !!setting?.lock_enabled;
      setLockEnabled(enabled);
      setPinHash(setting?.pin_hash ?? null);
      setPinSalt(setting?.pin_salt ?? null);
      setUnlocked(!enabled); // if lock off, treat as unlocked

      // Only fetch entries when the lock is off. When the lock is on we wait
      // for the user to enter the PIN and fetch through the server route so
      // passwords are never loaded into memory before verification.
      if (!enabled) {
        const { data: rows } = await supabase
          .from("vault_entries").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
        if (cancelled) return;
        const list: VaultEntry[] = (rows ?? []).map((r: any) => ({
          id: r.id, label: r.label, username: r.username ?? "", password: r.password, notes: r.notes ?? "", url: r.url ?? "", updated_at: r.updated_at,
        }));
        setEntries(list);
        updateSummary(list);
      } else {
        setEntries([]);
      }

      // Fingerprint registered on this device?
      try {
        const local = localStorage.getItem(WEBAUTHN_LOCAL_KEY(userId));
        setFingerprintReady(!!local && isWebAuthnSupported());
      } catch {}

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [userId, updateSummary]);

  const add = async () => {
    if (!form.label.trim() || !form.password) {
      toast.error("Add at least a label and a password.");
      return;
    }
    if (userId) {
      // Generate the id client-side so the vault also works when the lock is
      // on (in that case RLS blocks the SELECT that would normally return the
      // inserted row).
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const plainFields = {
        password: form.password,
        username: form.username.trim(),
        notes: form.notes.trim(),
      };
      const stored = derivedKey
        ? await encryptEntryFields(derivedKey, plainFields)
        : plainFields;
      const { error } = await supabase
        .from("vault_entries")
        .insert({ id, user_id: userId, label: form.label.trim(), ...stored } as any);
      if (error) { toast.error("Couldn't save", { description: error.message }); return; }
      const entry: VaultEntry = { id, label: form.label.trim(), ...plainFields, url: "", updated_at: now };
      const next = [entry, ...entries];
      setEntries(next); updateSummary(next);
      toast.success(derivedKey ? "Saved (encrypted) and synced" : "Saved and synced to your account");
    } else {
      const entry: VaultEntry = { id: crypto.randomUUID(), label: form.label.trim(), username: form.username.trim(), password: form.password, notes: form.notes.trim(), url: "", updated_at: new Date().toISOString() };
      const next = [entry, ...entries];
      setEntries(next); updateSummary(next);
      try { localStorage.setItem(localVaultKey(undefined), JSON.stringify(next)); } catch {}
      toast.success("Saved locally (sign in to sync across devices)");
    }
    setForm({ label: "", username: "", password: "", notes: "" });
  };

  const remove = async (id: string) => {
    if (userId) {
      const { error } = await supabase.from("vault_entries").delete().eq("id", id).eq("user_id", userId);
      if (error) { toast.error("Couldn't delete", { description: error.message }); return; }
    }
    const next = entries.filter((e) => e.id !== id);
    setEntries(next); updateSummary(next);
    if (!userId) { try { localStorage.setItem(localVaultKey(undefined), JSON.stringify(next)); } catch {} }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); }
    catch { toast.error("Couldn't copy"); }
  };

  // ===== Autofill =====
  const [autofillEditId, setAutofillEditId] = useState<string | null>(null);
  const [autofillUrl, setAutofillUrl] = useState("");

  const openAutofill = (entry: VaultEntry) => {
    setAutofillEditId(entry.id);
    setAutofillUrl(entry.url || "");
  };

  const saveAutofill = async (id: string) => {
    let normalized = autofillUrl.trim();
    if (normalized && !/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;
    if (normalized) {
      try { new URL(normalized); } catch { toast.error("Enter a valid URL like https://example.com"); return; }
    }
    if (userId) {
      const { error } = await supabase.from("vault_entries").update({ url: normalized } as any).eq("id", id).eq("user_id", userId);
      if (error) { toast.error("Couldn't save", { description: error.message }); return; }
    }
    const next = entries.map((e) => e.id === id ? { ...e, url: normalized } : e);
    setEntries(next);
    if (!userId) { try { localStorage.setItem(localVaultKey(undefined), JSON.stringify(next)); } catch {} }
    setAutofillEditId(null); setAutofillUrl("");
    toast.success(normalized ? "Autofill set up" : "Autofill cleared", {
      description: normalized ? "Install the Chrome or Edge extension and sync to autofill on this site." : undefined,
    });
  };

  const deleteAutofill = async (id: string) => {
    if (userId) {
      const { error } = await supabase.from("vault_entries").update({ url: "" } as any).eq("id", id).eq("user_id", userId);
      if (error) { toast.error("Couldn't delete autofill", { description: error.message }); return; }
    }
    const next = entries.map((e) => e.id === id ? { ...e, url: "" } : e);
    setEntries(next);
    if (!userId) { try { localStorage.setItem(localVaultKey(undefined), JSON.stringify(next)); } catch {} }
    if (autofillEditId === id) { setAutofillEditId(null); setAutofillUrl(""); }
    toast.success("Autofill deleted", {
      description: "Reopen the Trust Shield extension and press \"Sync autofill\" to remove it from your browser too.",
    });
  };

  const copyAutofillPayload = async () => {
    const items = entries
      .filter((e) => e.url)
      .map((e) => ({ url: e.url, username: e.username, password: e.password, label: e.label }));
    if (items.length === 0) { toast.error("No entries have an autofill URL yet."); return; }
    const payload = { v: 1, kind: "trust-shield-autofill", items, exported_at: new Date().toISOString() };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      toast.success("Autofill data copied", { description: "Open the Trust Shield extension popup and paste it into 'Autofill sync'." });
    } catch { toast.error("Couldn't copy"); }
  };

  // ===== Lock helpers =====
  const enableLock = async () => {
    if (!userId) { toast.error("Sign in to enable the vault lock across devices."); return; }
    if (newPin.length < 4) { toast.error("Use at least 4 characters for the unlock code."); return; }
    if (newPin !== newPin2) { toast.error("Codes don't match."); return; }
    setBusy(true);
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
      const hash = await sha256Hex(saltHex + ":" + newPin);
      // Derive the vault encryption key from the new PIN and re-encrypt every
      // existing entry so cleartext values never remain in the database.
      const key = await deriveVaultKey(newPin, saltHex);
      for (const e of entries) {
        const enc = await encryptEntryFields(key, {
          password: e.password, username: e.username, notes: e.notes,
        });
        await supabase.from("vault_entries")
          .update(enc as any).eq("id", e.id).eq("user_id", userId);
      }
      const { error } = await supabase.from("vault_settings").upsert({
        user_id: userId, lock_enabled: true, pin_hash: hash, pin_salt: saltHex,
      });
      if (error) throw error;
      setLockEnabled(true); setPinHash(hash); setPinSalt(saltHex); setUnlocked(true);
      setDerivedKey(key);

      if (enrollFinger) {
        try {
          const credId = await registerFingerprintCredential(userId, "Trust Shield vault");
          localStorage.setItem(WEBAUTHN_LOCAL_KEY(userId), credId);
          setFingerprintReady(true);
          toast.success("Fingerprint enrolled on this device");
        } catch (e) {
          toast.error("Couldn't enroll fingerprint", { description: e instanceof Error ? e.message : "" });
        }
      }

      setSetupOpen(false); setNewPin(""); setNewPin2(""); setEnrollFinger(false);
      toast.success("Vault lock enabled");
    } catch (e) {
      toast.error("Couldn't enable lock", { description: e instanceof Error ? e.message : "" });
    } finally { setBusy(false); }
  };

  const disableLock = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      // Decrypt every entry back to plaintext before removing the lock, so
      // the vault keeps working (and stays readable) after the PIN is gone.
      for (const e of entries) {
        await supabase.from("vault_entries")
          .update({ password: e.password, username: e.username, notes: e.notes } as any)
          .eq("id", e.id).eq("user_id", userId);
      }
      const { error } = await supabase.from("vault_settings").upsert({
        user_id: userId, lock_enabled: false, pin_hash: null, pin_salt: null,
      });
      if (error) throw error;
      try { localStorage.removeItem(WEBAUTHN_LOCAL_KEY(userId)); } catch {}
      setLockEnabled(false); setPinHash(null); setPinSalt(null); setUnlocked(true); setFingerprintReady(false);
      setDerivedKey(null);
      toast.success("Vault lock removed");
    } catch (e) {
      toast.error("Couldn't disable lock", { description: e instanceof Error ? e.message : "" });
    } finally { setBusy(false); }
  };

  const changeLockPassword = async () => {
    if (!userId || !pinHash || !pinSalt) return;
    if (changePin.length < 4) { toast.error("New code must be at least 4 characters."); return; }
    if (changePin !== changePin2) { toast.error("New codes don't match."); return; }
    setBusy(true);
    try {
      const currentHash = await sha256Hex(pinSalt + ":" + currentPin);
      if (currentHash !== pinHash) { toast.error("Current password is incorrect"); setBusy(false); return; }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
      const hash = await sha256Hex(saltHex + ":" + changePin);
      // Re-encrypt every entry with the key derived from the new PIN.
      const newKey = await deriveVaultKey(changePin, saltHex);
      for (const e of entries) {
        const enc = await encryptEntryFields(newKey, {
          password: e.password, username: e.username, notes: e.notes,
        });
        await supabase.from("vault_entries")
          .update(enc as any).eq("id", e.id).eq("user_id", userId);
      }
      const { error } = await supabase.from("vault_settings").upsert({
        user_id: userId, lock_enabled: true, pin_hash: hash, pin_salt: saltHex,
      });
      if (error) throw error;
      setPinHash(hash); setPinSalt(saltHex); setDerivedKey(newKey);
      setChangeOpen(false); setCurrentPin(""); setChangePin(""); setChangePin2("");
      toast.success("Lock password changed");
    } catch (e) {
      toast.error("Couldn't change password", { description: e instanceof Error ? e.message : "" });
    } finally { setBusy(false); }
  };

  const tryUnlockPin = async () => {
    if (!unlockPin) { toast.error("Enter your vault password"); return; }
    // The server re-hashes and verifies the PIN, then returns entries. We
    // rely on the server response (not a local hash check) so the unlock
    // works even if the client couldn't read pin_hash for any reason.
    try {
      const { data, error } = await supabase.functions.invoke("vault-fetch", {
        body: { pin: unlockPin },
      });
      if (error) {
        const msg = (error as { message?: string })?.message || "";
        if (/invalid_pin|401/i.test(msg)) toast.error("Wrong code");
        else toast.error("Couldn't unlock vault", { description: msg });
        return;
      }
      if (!data || (data as { error?: string }).error) {
        const err = (data as { error?: string })?.error;
        if (err === "invalid_pin" || err === "pin_required") toast.error("Wrong code");
        else toast.error("Couldn't unlock vault", { description: err });
        return;
      }
      const rows = ((data as { entries?: unknown[] }).entries ?? []) as any[];
      let list: VaultEntry[] = rows.map((r) => ({
        id: r.id, label: r.label, username: r.username ?? "", password: r.password, notes: r.notes ?? "", url: r.url ?? "", updated_at: r.updated_at,
      }));
      // Derive the decryption key from the PIN and unwrap any encrypted
      // fields client-side. Legacy plaintext entries pass through untouched.
      let key: CryptoKey | null = null;
      if (pinSalt) {
        try {
          key = await deriveVaultKey(unlockPin, pinSalt);
          list = await Promise.all(list.map((e) => decryptEntry(key!, e)));
        } catch {}
      }
      setDerivedKey(key);
      setEntries(list);
      updateSummary(list);
      setUnlocked(true);
      setUnlockPin("");
      toast.success("Vault unlocked");
    } catch (e) {
      toast.error("Couldn't unlock vault", { description: e instanceof Error ? e.message : "" });
    }
  };

  const tryUnlockFingerprint = async () => {
    if (!userId) return;
    const credId = localStorage.getItem(WEBAUTHN_LOCAL_KEY(userId));
    if (!credId) { toast.error("No fingerprint enrolled on this device"); return; }
    const ok = await verifyFingerprintCredential(credId);
    if (!ok) { toast.error("Fingerprint check failed"); return; }
    if (entries.length === 0) {
      toast.message("Enter your vault password once to load your saved logins on this device.");
      return;
    }
    setUnlocked(true);
    toast.success("Vault unlocked");
  };

  const enrollFingerprintNow = async () => {
    if (!userId) return;
    try {
      const credId = await registerFingerprintCredential(userId, "Trust Shield vault");
      localStorage.setItem(WEBAUTHN_LOCAL_KEY(userId), credId);
      setFingerprintReady(true);
      toast.success("Fingerprint enrolled on this device");
    } catch (e) {
      toast.error("Couldn't enroll fingerprint", { description: e instanceof Error ? e.message : "" });
    }
  };

  return (
    <section className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-primary" /> Password security
        </h2>
        <p className="text-sm text-muted-foreground">
          {userId
            ? "Check password strength and keep a synced vault across your devices."
            : "Check password strength and keep a local vault. Sign in to sync across devices."}
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-medium flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" /> Password reference vault
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {userId ? (
              <span className="inline-flex items-center gap-1"><Cloud className="h-3.5 w-3.5" /> Synced to your account</span>
            ) : (
              <span>Local only — sign in to sync</span>
            )}
            <span>· {entries.length} saved</span>
          </div>
        </div>

        {/* Lock controls */}
        {userId && (
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 flex-wrap gap-2">
            <div className="text-sm flex items-center gap-2">
              {lockEnabled ? <LockKeyhole className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4 text-muted-foreground" />}
              <div>
                <div className="font-medium">
                  {lockEnabled ? (unlocked ? "Vault unlocked" : "Vault locked") : "Vault lock is off"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lockEnabled
                    ? "Requires your unlock code or fingerprint before showing saved passwords."
                    : "Turn on a lock so a code or fingerprint is required to open the vault."}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {!lockEnabled ? (
                <Button size="sm" onClick={() => setSetupOpen(true)}><LockKeyhole className="h-3.5 w-3.5 mr-1" /> Turn on lock</Button>
              ) : (
                <>
                  {unlocked && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setUnlocked(false)}>Lock now</Button>
                      <Button size="sm" variant="outline" onClick={() => setChangeOpen((v) => !v)}>Change lock password</Button>
                      {isWebAuthnSupported() && !fingerprintReady && (
                        <Button size="sm" variant="outline" onClick={enrollFingerprintNow}>
                          <Fingerprint className="h-3.5 w-3.5 mr-1" /> Add fingerprint on this device
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={disableLock} disabled={busy}>Remove lock</Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Setup lock dialog (inline) */}
        {setupOpen && (
          <div className="rounded-lg border border-primary/40 bg-card p-4 space-y-3">
            <div className="font-medium flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /> Set a vault unlock code</div>
            <p className="text-xs text-muted-foreground">You'll enter this code (or use your fingerprint on supported devices) each time you open the vault. Choose something you can remember — it can't be recovered if lost.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Unlock code</Label>
                <PasswordInput value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="At least 4 characters" />
              </div>
              <div>
                <Label className="text-xs">Confirm code</Label>
                <PasswordInput value={newPin2} onChange={(e) => setNewPin2(e.target.value)} placeholder="Repeat" />
              </div>
            </div>
            {isWebAuthnSupported() && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enrollFinger} onChange={(e) => setEnrollFinger(e.target.checked)} />
                <Fingerprint className="h-4 w-4" /> Also enroll fingerprint / device biometrics on this device
              </label>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setSetupOpen(false); setNewPin(""); setNewPin2(""); }}>Cancel</Button>
              <Button size="sm" onClick={enableLock} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Enable lock
              </Button>
            </div>
          </div>
        )}

        {/* Change lock password (inline) */}
        {changeOpen && lockEnabled && unlocked && (
          <div className="rounded-lg border border-primary/40 bg-card p-4 space-y-3">
            <div className="font-medium flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /> Change lock password</div>
            <p className="text-xs text-muted-foreground">Enter your current unlock code, then set a new one. Fingerprint cannot be used to authorize this change.</p>
            <div>
              <Label className="text-xs">Current unlock code</Label>
              <PasswordInput value={currentPin} onChange={(e) => setCurrentPin(e.target.value)} placeholder="Current code" autoComplete="current-password" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">New code</Label>
                <PasswordInput value={changePin} onChange={(e) => setChangePin(e.target.value)} placeholder="At least 4 characters" autoComplete="new-password" />
              </div>
              <div>
                <Label className="text-xs">Confirm new code</Label>
                <PasswordInput value={changePin2} onChange={(e) => setChangePin2(e.target.value)} placeholder="Repeat" autoComplete="new-password" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setChangeOpen(false); setCurrentPin(""); setChangePin(""); setChangePin2(""); }}>Cancel</Button>
              <Button size="sm" onClick={changeLockPassword} disabled={busy}>
                {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Change password
              </Button>
            </div>
          </div>
        )}

        {/* Lock gate */}
        {userId && lockEnabled && !unlocked ? (
          <div className="rounded-lg border border-border/60 bg-muted/10 p-6 text-center space-y-4">
            <LockKeyhole className="h-8 w-8 mx-auto text-primary" />
            <div>
              <div className="font-medium">Vault is locked</div>
              <div className="text-xs text-muted-foreground">Enter your unlock code {fingerprintReady ? "or use your fingerprint" : ""} to view saved passwords.</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
              <PasswordInput
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") tryUnlockPin(); }}
                placeholder="Unlock code"
                autoFocus
              />
              <Button onClick={tryUnlockPin}>Unlock</Button>
            </div>
            {fingerprintReady && (
              <Button variant="outline" onClick={tryUnlockFingerprint} className="gap-2">
                <Fingerprint className="h-4 w-4" /> Use fingerprint
              </Button>
            )}
          </div>
        ) : (
        <>
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
            <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="password to remember" autoComplete="off" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" />
          </div>
        </div>
        <Button onClick={add} className="gap-2"><Plus className="h-4 w-4" /> Save to vault</Button>

        {loading ? (
          <p className="text-sm text-muted-foreground pt-2 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading vault…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground pt-2">Nothing saved yet.</p>
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
                      {e.url && (
                        <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                          <Globe className="h-3 w-3" /> Autofill on
                        </span>
                      )}
                    </div>
                    {e.username && <div className="text-xs text-muted-foreground truncate">{e.username}</div>}
                    {e.url && <div className="text-xs text-muted-foreground truncate">{e.url}</div>}
                    <div className="mt-1 flex items-center gap-2">
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded font-mono truncate max-w-[24ch]">
                        {isShown ? e.password : "•".repeat(Math.min(e.password.length, 12))}
                      </code>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setReveal({ ...reveal, [e.id]: !isShown })}>
                        {isShown ? "Hide" : "Show"}
                      </button>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => copy(e.password)}>Copy</button>
                      <button className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={() => openAutofill(e)}>
                        <Globe className="h-3 w-3" /> {e.url ? "Edit autofill" : "Set up autofill"}
                      </button>
                      {e.url && (
                        <button
                          className="text-xs text-destructive hover:underline inline-flex items-center gap-1"
                          onClick={() => deleteAutofill(e.id)}
                        >
                          <Trash2 className="h-3 w-3" /> Delete autofill
                        </button>
                      )}
                    </div>
                    {e.notes && <div className="text-xs text-muted-foreground mt-1">{e.notes}</div>}
                    {autofillEditId === e.id && (
                      <div className="mt-2 rounded-lg border border-primary/40 bg-card p-3 space-y-2">
                        <Label className="text-xs">Website URL for autofill</Label>
                        <Input
                          value={autofillUrl}
                          onChange={(ev) => setAutofillUrl(ev.target.value)}
                          placeholder="https://example.com/login"
                          autoComplete="off"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          The Trust Shield Chrome / Edge extension will autofill this password when you visit a page on this URL's domain. Autofill only works after you install the extension and press "Sync autofill" in its popup.
                        </p>
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => { setAutofillEditId(null); setAutofillUrl(""); }}>Cancel</Button>
                          <Button size="sm" onClick={() => saveAutofill(e.id)}>Save autofill</Button>
                        </div>
                        {onAskGuardian && (
                          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                            Don't know how to set up autofill? Ask{" "}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button type="button" className="text-primary hover:underline font-medium">
                                  Cyber Guardian
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => onAskGuardian("Chrome")}>Chrome</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onAskGuardian("Edge")}>Edge</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            !
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(e.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {entries.some((e) => e.url) && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{entries.filter((e) => e.url).length} autofill entries ready.</span> Copy the data, then paste it into the Trust Shield Chrome or Edge extension popup to enable autofill on those sites.
            </div>
            <Button size="sm" variant="outline" onClick={copyAutofillPayload} className="gap-2">
              <Copy className="h-3.5 w-3.5" /> Copy autofill data for extension
            </Button>
          </div>
        )}
        </>
        )}

        <div className="text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded-lg p-3">
          {userId
            ? "Vault entries sync securely to your Trust Shield account so they appear on every device you sign in to. Cyber Guardian only sees anonymized counts, never the passwords themselves."
            : "Sign in to sync your vault across devices. Until then, entries stay in this browser only."}
        </div>
      </div>
    </section>
  );
}