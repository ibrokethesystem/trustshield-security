import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Shield,
  AlertTriangle,
  Mail,
  Wifi,
  ScanLine,
  Lock,
  Users,
  Settings,
  LayoutDashboard,
  Bell,
  User,
  MonitorSmartphone,
  CheckCircle2,
  LogOut,
  ShieldCheck,
  Link2,
  Loader2,
  Trash2,
  Ban,
  Camera,
  Pencil,
  Activity,
  Calendar,
  Inbox,
  Sparkles,
  Send,
  Gauge,
  History,
  Download,
  FileScan,
  Puzzle,
  Share2,
  Copy,
  MessageSquare,
  KeyRound,
  QrCode,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as ReTooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import trustShieldAd from "@/assets/trust-shield-ad.mp4.asset.json";
import trustShieldLogo from "@/assets/trust-shield-logo.png";
import PasswordsView from "@/components/PasswordsView";
import FileScannerView from "@/components/FileScannerView";
import ThreatRadarView from "@/components/ThreatRadarView";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

type UpdateNote = { id: string; version: string; name: string; date: string; summary: string };

const UPDATES: UpdateNote[] = [
  {
    id: "2.1.0",
    version: "2.1.0",
    name: "Version switcher actually reverts",
    date: "2026-07-21",
    summary:
      "Selecting an older version from the version pill now truly rolls back the UI to that release — features introduced later (QR scanner, File scanner tab, Threat Radar, Inbox, Device scanner, and more) hide themselves. Your newer code is saved and one click on \"Return to current\" brings it all back.",
  },
  {
    id: "2.0.0",
    version: "2.0.0",
    name: "QR scanner + Trust Shield Extension 2.0",
    date: "2026-07-21",
    summary:
      "Added a QR code scanner tab (mobile) that uses your camera to warn about malicious links. Renamed the Chrome and Edge extensions to Trust Shield Extension 2.0 and added on-page fake login page detection — the extensions now warn you when a sign-in form looks like phishing (HTTP logins, brand-name spoofing, cross-origin form submits, punycode/lookalike domains).",
  },
  {
    id: "1.9.9",
    version: "1.9.9",
    name: "Device scanner in Network safety",
    date: "2026-07-21",
    summary:
      "Network safety now includes a Device scanner that discovers this device's local network address via WebRTC, infers your Wi-Fi subnet and likely router IP, and flags what browsers can and can't see about other devices on the LAN.",
  },
  {
    id: "1.9.8",
    version: "1.9.8",
    name: "Guardian knows the changelog",
    date: "2026-07-21",
    summary:
      "Cyber Guardian now knows Trust Shield's current version and every past release note, so you can ask it what changed in any update.",
  },
  {
    id: "1.9.7",
    version: "1.9.7",
    name: "New shield logo",
    date: "2026-07-21",
    summary:
      "Refreshed the Trust Shield brand — the sidebar and Chrome, Edge, and Safari extensions now use the new metallic shield-and-padlock icon.",
  },
  {
    id: "1.9.6",
    version: "1.9.6",
    name: "Version indicator",
    date: "2026-07-21",
    summary:
      "Added a version badge next to the Share button so you always know which build of Trust Shield you're running.",
  },
  {
    id: "1.9.5",
    version: "1.9.5",
    name: "Inbox & release notes",
    date: "2026-07-20",
    summary:
      "Added an inbox next to your profile so you'll always see what's new in Trust Shield. A red badge appears when a fresh update ships.",
  },
  {
    id: "1.9.4",
    version: "1.9.4",
    name: "Autofill for Chrome & Edge",
    date: "2026-07-15",
    summary:
      "Password vault entries can now sync a URL to the Chrome and Edge extensions and autofill logins with one click.",
  },
  {
    id: "1.9.3",
    version: "1.9.3",
    name: "Threat Radar",
    date: "2026-07-10",
    summary:
      "Watch a list of domains and IPs and get toast alerts when they show up in URLhaus or VirusTotal threat feeds.",
  },
  {
    id: "1.9.2",
    version: "1.9.2",
    name: "File Scanner tab",
    date: "2026-07-05",
    summary:
      "File scanning moved into its own sidebar tab with batch uploads, SHA-256 hashing, and VirusTotal analytics.",
  },
];

type Threat = {
  id: string;
  title: string;
  description: string | null;
  threat_type: "phishing" | "scam" | "hack" | "suspicious_link" | "other";
  severity: "low" | "medium" | "high" | "critical";
  source: string | null;
  status: "active" | "dismissed" | "blocked";
  details: {
    indicators?: unknown[];
    suspicious_urls?: unknown[];
    recommended_action?: unknown;
    original_snippet?: string;
  };
  created_at: string;
};

type ScanRecord = {
  id: string;
  verdict: string;
  risk_score: number;
  risk_level: string | null;
  summary: string | null;
  snippet: string | null;
  had_image: boolean;
  threat_id: string | null;
  created_at: string;
};

type ViewKey = "dashboard" | "history" | "guardian" | "network" | "extensions" | "passwords" | "files" | "qr";
const navItems: { key: ViewKey; label: string; icon: React.ElementType; minVersion?: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "guardian", label: "Cyber Guardian", icon: Sparkles },
  { key: "passwords", label: "Passwords", icon: KeyRound },
  { key: "files", label: "File scanner", icon: FileScan, minVersion: "1.9.2" },
  { key: "network", label: "Network safety", icon: Wifi },
  { key: "qr", label: "QR scanner", icon: QrCode, minVersion: "2.0.0" },
  { key: "history", label: "Scan history", icon: History },
  { key: "extensions", label: "Extensions", icon: Puzzle },
];

// Compare semver strings ("1.9.9" vs "2.0.0"). Module-level so NetworkScanView etc. can use it.
const compareVersion = (a: string, b: string) => {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
};
const getActiveVersion = () => {
  if (typeof window === "undefined") return UPDATES[0]?.version ?? "2.0.0";
  return localStorage.getItem("ts_active_version") || (UPDATES[0]?.version ?? "2.0.0");
};
const hasFeatureAt = (minVer: string, activeVer?: string) =>
  compareVersion(activeVer ?? getActiveVersion(), minVer) >= 0;

const severityStyles: Record<Threat["severity"], string> = {
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critical: "bg-destructive/10 text-destructive border-destructive/40",
};

const typeLabels: Record<Threat["threat_type"], string> = {
  phishing: "Phishing",
  scam: "Scam",
  hack: "Hack attempt",
  suspicious_link: "Suspicious link",
  other: "Suspicious",
};

const displayReason = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value === "[object Object]" ? "Suspicious pattern detected." : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayReason).filter(Boolean).join(" — ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = [
      "reason",
      "text",
      "description",
      "indicator",
      "message",
      "label",
      "detail",
      "evidence",
      "finding",
      "warning",
      "risk",
      "url",
      "href",
      "link",
    ];
    for (const key of keys) {
      const rendered = displayReason(record[key]);
      if (rendered && rendered !== "Suspicious pattern detected.") return rendered;
    }
    const renderedValues = Object.values(record).map(displayReason).filter(Boolean);
    return renderedValues[0] ?? "Suspicious pattern detected.";
  }
  return String(value);
};

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [threats, setThreats] = useState<Threat[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanText, setScanText] = useState("");
  const [scanImage, setScanImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [submissions, setSubmissions] = useState(0);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [guardianPrefill, setGuardianPrefill] = useState<string>("");
  const [history, setHistory] = useState<ScanRecord[] | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [appInstalled, setAppInstalled] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);
  const [devUnlocked, setDevUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ts_dev_unlocked") === "1";
  });
  const [devInput, setDevInput] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<string>(() => {
    if (typeof window === "undefined") return UPDATES[0]?.version ?? "2.0.0";
    return localStorage.getItem("ts_active_version") || (UPDATES[0]?.version ?? "2.0.0");
  });
  const latestVersion = UPDATES[0]?.version ?? "2.0.0";
  const cmpVersion = compareVersion;
  const hasFeature = (minVer: string) => cmpVersion(selectedVersion, minVer) >= 0;
  // Features gated by the active version marker. Reverting to an older version hides them.
  const showInbox = hasFeature("1.9.5");
  const showThreatRadar = hasFeature("1.9.3");
  const showVersionPill = hasFeature("1.9.6");
  const visibleNavItems = navItems.filter((n) => !n.minVersion || hasFeature(n.minVersion));
  // Dev feature auto-removes at v2.5.0 per spec.
  const devFeatureAvailable = cmpVersion(latestVersion, "2.5.0") < 0;
  const effectiveDevUnlocked = devUnlocked && devFeatureAvailable;
  const visibleVersions = UPDATES.filter((u) =>
    effectiveDevUnlocked ? true : cmpVersion(u.version, "2.0.0") >= 0,
  );
  const applyVersion = (v: string) => {
    setSelectedVersion(v);
    localStorage.setItem("ts_active_version", v);
    setVersionMenuOpen(false);
    // If the current view was introduced after this version, fall back to Dashboard.
    const current = navItems.find((n) => n.key === view);
    if (current?.minVersion && compareVersion(v, current.minVersion) < 0) {
      setView("dashboard");
    }
    // Force NetworkScanView / other version-aware children to re-read localStorage.
    window.dispatchEvent(new CustomEvent("ts:version-change", { detail: v }));
    if (v === latestVersion) {
      toast.success(`On the latest version (v${v})`, {
        description: "All the newest Trust Shield features are active.",
      });
    } else {
      toast(`Reverted to v${v}`, {
        description: "Features added after this version are hidden. Your newer code is saved — return anytime.",
      });
    }
  };
  const tryDevUnlock = () => {
    if (devInput === "TrustShieldDevs1357908642)*^$@!#%&(") {
      localStorage.setItem("ts_dev_unlocked", "1");
      setDevUnlocked(true);
      setDevInput("");
      toast.success("Developer mode unlocked — all past versions visible.");
    } else {
      toast.error("Incorrect developer code");
    }
  };
  useEffect(() => {
    if (devUnlocked && !devFeatureAvailable) {
      localStorage.removeItem("ts_dev_unlocked");
      setDevUnlocked(false);
    }
  }, [devUnlocked, devFeatureAvailable]);
  const [lastReadUpdateId, setLastReadUpdateId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("ts_last_read_update") ?? null;
  });
  const unreadUpdates = (() => {
    if (!lastReadUpdateId) return UPDATES.length;
    const idx = UPDATES.findIndex((u) => u.id === lastReadUpdateId);
    return idx < 0 ? UPDATES.length : idx;
  })();
  const markInboxRead = () => {
    const latest = UPDATES[0]?.id;
    if (!latest) return;
    localStorage.setItem("ts_last_read_update", latest);
    setLastReadUpdateId(latest);
  };

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      setAppInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Detect if already running as an installed app
    if (window.matchMedia?.("(display-mode: standalone)").matches) {
      setAppInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const submissionsKey = user ? `ts_submissions_${user.id}` : "";
  useEffect(() => {
    if (!submissionsKey) return;
    const v = parseInt(localStorage.getItem(submissionsKey) || "0", 10);
    setSubmissions(isNaN(v) ? 0 : v);
  }, [submissionsKey]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    document.title = "Trust Shield — Dashboard";
  }, []);

  const loadThreats = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("threats")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("Couldn't load threats", { description: error.message });
      return;
    }
    setThreats((data ?? []) as Threat[]);
  }, [user]);

  useEffect(() => {
    if (user) loadThreats();
  }, [user, loadThreats]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("scan_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Couldn't load scan history", { description: error.message });
      return;
    }
    setHistory((data ?? []) as ScanRecord[]);
  }, [user]);

  useEffect(() => {
    if (user && view === "history") loadHistory();
  }, [user, view, loadHistory]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_path")
      .eq("id", user.id)
      .maybeSingle();
    const name = data?.display_name ?? user.email?.split("@")[0] ?? "";
    setDisplayName(name);
    setNameDraft(name);
    setAvatarPath(data?.avatar_path ?? null);
    if (data?.avatar_path) {
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(data.avatar_path, 3600);
      setAvatarUrl(signed?.signedUrl ?? null);
    } else {
      setAvatarUrl(null);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadProfile();
  }, [user, loadProfile]);

  const saveName = async () => {
    if (!user) return;
    const name = nameDraft.trim();
    if (!name) {
      toast.error("Name cannot be empty");
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").upsert({ id: user.id, display_name: name });
    setSavingProfile(false);
    if (error) {
      toast.error("Couldn't save", { description: error.message });
      return;
    }
    setDisplayName(name);
    toast.success("Name updated");
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setUploadingAvatar(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) {
      setUploadingAvatar(false);
      toast.error("Upload failed", { description: upErr.message });
      return;
    }
    // remove old
    if (avatarPath) {
      await supabase.storage.from("avatars").remove([avatarPath]);
    }
    const { error: profErr } = await supabase.from("profiles").upsert({ id: user.id, avatar_path: path });
    if (profErr) {
      setUploadingAvatar(false);
      toast.error("Couldn't save avatar", { description: profErr.message });
      return;
    }
    setAvatarPath(path);
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 3600);
    setAvatarUrl(signed?.signedUrl ?? null);
    setUploadingAvatar(false);
    toast.success("Profile picture updated");
  };

  const activeThreats = useMemo(() => (threats ?? []).filter((t) => t.status === "active"), [threats]);
  const dismissedCount = useMemo(() => (threats ?? []).filter((t) => t.status !== "active").length, [threats]);
  const criticalCount = useMemo(
    () => activeThreats.filter((t) => t.severity === "critical" || t.severity === "high").length,
    [activeThreats],
  );

  const securityScore = useMemo(() => {
    const active = activeThreats.length;
    const crit = activeThreats.filter((t) => t.severity === "critical").length;
    const high = activeThreats.filter((t) => t.severity === "high").length;
    const med = activeThreats.filter((t) => t.severity === "medium").length;
    const low = activeThreats.filter((t) => t.severity === "low").length;
    const penalty = crit * 25 + high * 15 + med * 7 + low * 3;
    return Math.max(0, Math.min(100, 100 - penalty - Math.max(0, active - 4) * 2));
  }, [activeThreats]);

  const trendData = useMemo(() => {
    const days: { day: string; threats: number; date: string }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        threats: 0,
      });
    }
    (threats ?? []).forEach((t) => {
      const key = t.created_at.slice(0, 10);
      const bucket = days.find((d) => d.date === key);
      if (bucket) bucket.threats += 1;
    });
    return days;
  }, [threats]);

  const runScan = async () => {
    const content = scanText.trim();
    if (!content && !scanImage) {
      toast.error("Nothing to scan", { description: "Paste text or attach a screenshot first." });
      return;
    }
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-threat", {
        body: {
          content,
          image: scanImage?.dataUrl ?? null,
          source: scanImage ? "screenshot_scan" : "manual_scan",
        },
      });
      if (error) throw error;
      const analysis = (data as any)?.analysis;
      if (!analysis) throw new Error("No analysis returned");
      // Track submission count locally
      if (submissionsKey) {
        const next = submissions + 1;
        setSubmissions(next);
        localStorage.setItem(submissionsKey, String(next));
      }
      const level = analysis.risk_level as string | undefined;
      const score: number = typeof analysis.risk_score === "number" ? analysis.risk_score : 0;
      const verdict = analysis.is_threat
        ? "threat"
        : level === "elevated" || level === "high" || score >= 40
          ? "caution"
          : "safe";
      const snippet = content ? content.slice(0, 240) : null;
      const { data: histRow } = await supabase
        .from("scan_history")
        .insert({
          user_id: user!.id,
          verdict,
          risk_score: score,
          risk_level: level ?? null,
          summary: analysis.title || analysis.summary || null,
          snippet,
          had_image: !!scanImage,
          threat_id: null,
        })
        .select("id")
        .maybeSingle();
      if (analysis.is_threat) {
        toast.error("Threat detected", { description: analysis.title });
        setScanText("");
        setScanImage(null);
        await loadThreats();
        if (histRow?.id) {
          // best-effort link to the newest threat
          const { data: latest } = await supabase
            .from("threats")
            .select("id")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latest?.id) {
            await supabase.from("scan_history").update({ threat_id: latest.id }).eq("id", histRow.id);
          }
        }
        if (view === "history") loadHistory();
      } else {
        const warnings: string[] = analysis.risk_warnings ?? [];
        if ((level === "elevated" || level === "high" || score >= 40) && warnings.length > 0) {
          toast.warning("Legitimate — but proceed with caution", {
            description: `Risk ${score}/100. ${warnings.slice(0, 3).join(" ")}`,
            duration: 12000,
            position: "bottom-left",
            className: "trust-bottom-toast text-base",
          });
        } else {
          toast.success("Looks safe", {
            description: analysis.summary ?? "No threats found.",
            duration: 10000,
            position: "bottom-left",
            className: "trust-bottom-toast text-base",
          });
        }
        setScanImage(null);
        if (view === "history") loadHistory();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      toast.error("Scan failed", { description: msg });
    } finally {
      setScanning(false);
    }
  };

  const handleImagePick = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Screenshot must be under 8MB");
      return;
    }
    setImageLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setScanImage({ dataUrl: String(reader.result), name: file.name });
      setImageLoading(false);
    };
    reader.onerror = () => {
      setImageLoading(false);
      toast.error("Couldn't read that image");
    };
    reader.readAsDataURL(file);
  };

  const updateStatus = async (id: string, status: "dismissed" | "blocked") => {
    const prev = threats;
    setThreats((cur) => (cur ?? []).map((t) => (t.id === id ? { ...t, status } : t)));
    const { error } = await supabase.from("threats").update({ status }).eq("id", id);
    if (error) {
      setThreats(prev);
      toast.error("Update failed", { description: error.message });
      return;
    }
    toast.success(status === "blocked" ? "Source blocked" : "Threat dismissed");
  };

  const deleteThreat = async (id: string) => {
    const prev = threats;
    setThreats((cur) => (cur ?? []).filter((t) => t.id !== id));
    const { error } = await supabase.from("threats").delete().eq("id", id);
    if (error) {
      setThreats(prev);
      toast.error("Delete failed", { description: error.message });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasActive = activeThreats.length > 0;
  const initial = (displayName || user.email || "?").charAt(0).toUpperCase();
  const signInIso = user.last_sign_in_at ?? user.created_at;
  const daysSinceSignIn = signInIso
    ? Math.max(0, Math.floor((Date.now() - new Date(signInIso).getTime()) / 86400000))
    : 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card/40 flex flex-col p-4 gap-2 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2 py-3 mb-2">
          <img
            src={trustShieldLogo}
            alt="Trust Shield logo"
            className="w-10 h-10 rounded-xl object-contain"
          />
          <div>
            <h1 className="font-bold text-base leading-tight">Trust Shield</h1>
            <p className="text-[11px] text-muted-foreground">Scam & Hack Detector</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {visibleNavItems.map((item) => (
            <button
              key={item.label}
              onClick={() => setView(item.key)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                view === item.key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </nav>

        {!appInstalled && (
          <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Download className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">Install Trust Shield</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug mb-2">
              {installPrompt
                ? "Get the full app on your device for faster access and offline use."
                : "Tap the install icon in your browser's address bar to add Trust Shield as an app."}
            </p>
            {installPrompt && (
              <button
                onClick={async () => {
                  try {
                    await installPrompt.prompt();
                    const choice = await installPrompt.userChoice;
                    if (choice?.outcome === "accepted") {
                      toast.success("Installing Trust Shield…");
                    }
                    setInstallPrompt(null);
                  } catch {
                    /* noop */
                  }
                }}
                className="w-full text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition"
              >
                Install app
              </button>
            )}
          </div>
        )}

        <div className="mt-auto bg-card border border-border rounded-xl p-3 flex items-center gap-2">
          <button
            onClick={() => setProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0 hover:ring-2 hover:ring-primary/50 transition"
            aria-label="Edit profile"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-semibold">{initial}</span>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <button
              onClick={() => setProfileOpen(true)}
              className="text-xs font-semibold truncate hover:underline block max-w-full text-left"
            >
              {displayName || user.email}
            </button>
            <button
              onClick={signOut}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
          {showInbox && (
          <Popover
            open={inboxOpen}
            onOpenChange={(o) => {
              setInboxOpen(o);
              if (o) markInboxRead();
            }}
          >
            <PopoverTrigger asChild>
              <button
                className="relative w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center shrink-0 transition"
                aria-label="Inbox"
              >
                <Inbox className="w-4 h-4" />
                {unreadUpdates > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-card">
                    {unreadUpdates}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-80 p-0">
              <div className="p-3 border-b border-border">
                <div className="text-sm font-semibold">Inbox</div>
                <div className="text-[11px] text-muted-foreground">
                  What's new in Trust Shield
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {UPDATES.map((u) => (
                  <div key={u.id} className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold">
                        Update {u.version} — {u.name}
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {u.date}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      {u.summary}
                    </p>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 space-y-6 max-w-[1100px]">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Hello, {displayName || "there"} 👋</h2>
            <p className="text-sm text-muted-foreground">
              {hasActive
                ? `${activeThreats.length} active threat${activeThreats.length === 1 ? "" : "s"} needs your attention`
                : "No active threats detected"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="gap-1.5"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
            <Popover open={versionMenuOpen} onOpenChange={setVersionMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="Change version"
                  className="flex items-center px-2.5 py-1.5 rounded-full text-xs font-mono border border-border bg-muted/40 text-muted-foreground hover:bg-muted/70 transition-colors"
                >
                  v{selectedVersion}
                  {selectedVersion === latestVersion && (
                    <span className="ml-1 text-green-400">(current)</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-80 p-0">
                <div className="p-3 border-b border-border">
                  <div className="text-sm font-semibold">Switch version</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Revert the Trust Shield UI to a previous release.
                  </div>
                </div>
                {selectedVersion !== latestVersion && (
                  <div className="p-2 border-b border-border bg-muted/30">
                    <button
                      onClick={() => applyVersion(latestVersion)}
                      className="w-full text-left px-2 py-2 rounded hover:bg-muted/60 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-primary">Return to current</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          Jump back to the latest release
                        </div>
                      </div>
                      <span className="text-xs font-mono text-primary shrink-0">v{latestVersion}</span>
                    </button>
                  </div>
                )}
                <div className="max-h-72 overflow-y-auto py-1">
                  {visibleVersions.map((u) => {
                    const isActive = u.version === selectedVersion;
                    const isLatest = u.version === latestVersion;
                    return (
                      <button
                        key={u.id}
                        onClick={() => applyVersion(u.version)}
                        className={cn(
                          "w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-start gap-2",
                          isActive && "bg-muted/40",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            v{u.version}
                            {isLatest && <span className="text-[10px] text-green-400">(current)</span>}
                            {isActive && !isLatest && (
                              <span className="text-[10px] text-primary">(active)</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.name}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {devFeatureAvailable && !effectiveDevUnlocked && (
                  <div className="p-3 border-t border-border space-y-2">
                    <div className="text-[11px] text-muted-foreground">
                      Only versions 2.0.0 and newer are shown. Developers can unlock all past versions.
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="password"
                        value={devInput}
                        onChange={(e) => setDevInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") tryDevUnlock();
                        }}
                        placeholder="Developer code"
                        className="flex-1 min-w-0 px-2 py-1 rounded border border-border bg-background text-xs"
                      />
                      <Button size="sm" variant="outline" onClick={tryDevUnlock}>
                        Unlock
                      </Button>
                    </div>
                  </div>
                )}
                {effectiveDevUnlocked && (
                  <div className="p-2 border-t border-border text-[11px] text-primary text-center">
                    Developer mode — all versions unlocked
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border",
                hasActive
                  ? "bg-destructive/10 text-destructive border-destructive/30"
                  : "bg-green-500/10 text-green-400 border-green-500/30",
              )}
            >
              <span
                className={cn("w-1.5 h-1.5 rounded-full", hasActive ? "bg-destructive animate-pulse" : "bg-green-400")}
              />
              {hasActive ? "AT RISK" : "PROTECTED"}
            </div>
          </div>
        </header>

        {view === "dashboard" ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4">
              <SecurityScoreCard score={securityScore} />
              <StatCard
                icon={AlertTriangle}
                iconClass="text-destructive bg-destructive/10"
                label="Active threats"
                value={activeThreats.length}
              />
              <StatCard
                icon={ShieldCheck}
                iconClass="text-orange-400 bg-orange-400/10"
                label="High / critical"
                value={criticalCount}
              />
              <StatCard
                icon={CheckCircle2}
                iconClass="text-green-400 bg-green-400/10"
                label="Resolved"
                value={dismissedCount}
              />
            </div>

            {/* Trend chart */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" /> Threats over the last 14 days
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Every confirmed threat you've scanned, grouped by day.
                  </p>
                </div>
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={36}
                      tickMargin={6}
                    />
                    <ReTooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="threats"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Scanner + Threat Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Card>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <ScanLine className="w-5 h-5 text-primary" /> Scan a message or link
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste an email, text/SMS, chat message, URL, or QR-code text. Trust Shield's AI checks it for
                    phishing, fake login pages, crypto/investment scams, impersonation, and other threats.
                  </p>
                </div>
              </div>
              <Textarea
                value={scanText}
                onChange={(e) => setScanText(e.target.value)}
                placeholder="Paste suspicious email content, a text message, a URL — or attach a screenshot below…"
                className="min-h-[120px] bg-secondary/50 border-border resize-none"
                maxLength={8000}
                disabled={scanning}
              />
              {scanImage ? (
                <div className="mt-3 flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                  <img
                    src={scanImage.dataUrl}
                    alt=""
                    className="w-20 h-20 rounded-md object-cover border border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{scanImage.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Screenshot attached — will be analyzed with your text.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScanImage(null)}
                    disabled={scanning}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3">
                  <label
                    className={cn(
                      "inline-flex items-center gap-2 text-xs px-3 py-2 rounded-md border border-border cursor-pointer transition",
                      scanning || imageLoading
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-secondary/60 bg-secondary/30",
                    )}
                  >
                    {imageLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    {scanImage ? "Replace screenshot" : "Attach screenshot"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={scanning || imageLoading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImagePick(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">{scanText.length} / 8000</span>
                </div>
                <Button
                  onClick={runScan}
                  disabled={scanning || (scanText.trim().length < 3 && !scanImage)}
                  className="bg-gradient-shield hover:opacity-90 glow-shield gap-2"
                >
                  {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                  {scanning ? "Analyzing…" : "Scan now"}
                </Button>
              </div>
            </Card>
            {showThreatRadar && <ThreatRadarView userId={user?.id} />}
            </div>

            {/* Threats list */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">Detected threats</h3>
                {threats && threats.length > 0 && (
                  <p className="text-xs text-muted-foreground">{threats.length} total</p>
                )}
              </div>

              {threats === null ? (
                <div className="bg-card border border-border rounded-2xl p-10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : threats.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mb-3">
                    <ShieldCheck className="w-7 h-7 text-green-400" />
                  </div>
                  <h4 className="font-semibold">You're all clear</h4>
                  <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    No threats detected yet. Paste anything suspicious above to scan it, and confirmed threats will show
                    up here.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {threats.map((t) => (
                    <ThreatRow
                      key={t.id}
                      threat={t}
                      onDismiss={() => updateStatus(t.id, "dismissed")}
                      onBlock={() => updateStatus(t.id, "blocked")}
                      onDelete={() => deleteThreat(t.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : view === "history" ? (
          <ScanHistoryView
            history={history}
            onRefresh={loadHistory}
            onClear={async () => {
              if (!user) return;
              const { error } = await supabase.from("scan_history").delete().eq("user_id", user.id);
              if (error) {
                toast.error("Couldn't clear history", { description: error.message });
                return;
              }
              setHistory([]);
              toast.success("Scan history cleared");
            }}
          />
        ) : view === "network" ? (
          <NetworkScanView />
        ) : view === "qr" ? (
          <QrScannerView />
        ) : view === "passwords" ? (
          <PasswordsView
            userId={user?.id}
            onAskGuardian={(browser) => {
              setGuardianPrefill(`How can I activate my autofill on the ${browser} extension?`);
              setView("guardian");
            }}
          />
        ) : view === "files" ? (
          <FileScannerView userId={user?.id} />
        ) : view === "extensions" ? (
          <ExtensionsView
            onAskGuardian={(browser) => {
              if (browser) {
                setGuardianPrefill(
                  `How can I install the Trust Shield ${browser} extension?`,
                );
              }
              setView("guardian");
            }}
          />
        ) : (
          <GuardianView
            threats={threats ?? []}
            prefill={guardianPrefill}
            onPrefillConsumed={() => setGuardianPrefill("")}
          />
        )}

        <footer className="text-xs text-muted-foreground pb-6">
          Trust Shield analyzes content you submit. It cannot access your device, messages, or accounts on its own.
        </footer>
      </main>

      {/* Profile dialog */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your profile</DialogTitle>
            <DialogDescription>Change your display name and profile picture.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-secondary overflow-hidden flex items-center justify-center border border-border">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-semibold">{initial}</span>
                )}
              </div>
              <div>
                <label className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 cursor-pointer border border-border">
                  {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  {uploadingAvatar ? "Uploading…" : "Upload picture"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingAvatar}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadAvatar(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="text-[11px] text-muted-foreground mt-1">PNG or JPG, up to 5MB</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={50}
                placeholder="Your name"
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <div className="pt-3 border-t border-border">
              <p className="text-sm font-semibold mb-3">Account activity</p>
              <div className="grid grid-cols-2 gap-3">
                <AccountStat icon={Calendar} label="Days since sign-in" value={daysSinceSignIn} />
                <AccountStat icon={Inbox} label="Items scanned" value={submissions} />
                <AccountStat icon={AlertTriangle} label="Threats found" value={(threats ?? []).length} />
                <AccountStat icon={CheckCircle2} label="Resolved" value={dismissedCount} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>
              Close
            </Button>
            <Button onClick={saveName} disabled={savingProfile || nameDraft.trim() === displayName}>
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
};

function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const shareUrl = "https://trustshield-security.lovable.app/";
  const videoUrl = "https://drive.google.com/file/d/1Pr8k1u1KQx60MMgYHaKPxFHg22nG64Nm/view?t=3.028";
  const subject = "Check out Trust Shield — real-time scam & hack protection";
  const body =
    `I've been using Trust Shield to catch phishing, scam messages, and dangerous links before they hit me. ` +
    `Watch the quick demo: ${videoUrl}\n\nTry it here: ${shareUrl}`;

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const nativeShare = async () => {
    try {
      await navigator.share({ title: "Trust Shield", text: body, url: shareUrl });
    } catch {
      /* user cancelled */
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${body}`);
      toast.success("Link + message copied");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  const open_ = (href: string) => window.open(href, "_blank", "noopener,noreferrer");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" /> Share Trust Shield
          </DialogTitle>
          <DialogDescription>
            Send friends and family a quick video so they can see how Trust Shield protects them.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl overflow-hidden border border-border bg-black">
          <video
            src={trustShieldAd.url}
            controls
            playsInline
            className="w-full aspect-video"
          />
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
          {body}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" className="gap-2" onClick={copyLink}>
            <Copy className="w-4 h-4" /> Copy message + link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SecurityScoreCard({ score }: { score: number }) {
  // score summary card
  const tone =
    score >= 80
      ? { ring: "text-green-400", bg: "bg-green-400/10", label: "Healthy" }
      : score >= 60
        ? { ring: "text-yellow-400", bg: "bg-yellow-400/10", label: "Watch" }
        : score >= 40
          ? { ring: "text-orange-400", bg: "bg-orange-400/10", label: "At risk" }
          : { ring: "text-destructive", bg: "bg-destructive/10", label: "Critical" };
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", tone.ring, tone.bg)}>
        <Gauge className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold mt-3">
        {score}
        <span className="text-sm text-muted-foreground font-normal">/100</span>
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">Security score · {tone.label}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-card border border-border rounded-2xl p-5">{children}</div>;
}

function ScanHistoryView({
  history,
  onRefresh,
  onClear,
}: {
  history: ScanRecord[] | null;
  onRefresh: () => void;
  onClear: () => void;
}) {
  const verdictStyles: Record<string, string> = {
    threat: "bg-destructive/10 text-destructive border-destructive/30",
    caution: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    safe: "bg-green-500/10 text-green-400 border-green-500/30",
  };
  const verdictLabel: Record<string, string> = {
    threat: "Threat",
    caution: "Caution",
    safe: "Safe",
  };
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> Scan history
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Everything you've scanned, safe or otherwise. Newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRefresh} className="h-8 text-xs">
            Refresh
          </Button>
          {history && history.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={onClear}
              className="h-8 text-xs text-destructive hover:text-destructive"
            >
              Clear all
            </Button>
          )}
        </div>
      </div>
      {history === null ? (
        <div className="bg-card border border-border rounded-2xl p-10 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : history.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3">
            <History className="w-7 h-7 text-muted-foreground" />
          </div>
          <h4 className="font-semibold">No scans yet</h4>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Run a scan from the dashboard and it'll show up here with its verdict and risk score.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li key={h.id} className="bg-card border border-border rounded-xl p-3 flex items-start gap-3">
              <div
                className={cn(
                  "text-[10px] font-semibold px-2 py-1 rounded border uppercase tracking-wider shrink-0",
                  verdictStyles[h.verdict] ?? verdictStyles.safe,
                )}
              >
                {verdictLabel[h.verdict] ?? h.verdict}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{h.summary || "Scan"}</p>
                  <span className="text-[10px] text-muted-foreground">Risk {h.risk_score}/100</span>
                  {h.had_image && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex items-center gap-1">
                      <Camera className="w-3 h-3" /> screenshot
                    </span>
                  )}
                </div>
                {h.snippet && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap break-words">
                    {h.snippet}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">{new Date(h.created_at).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconClass)}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold mt-3">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function AccountStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="bg-secondary/40 border border-border rounded-lg p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

function ThreatRow({
  threat,
  onDismiss,
  onBlock,
  onDelete,
}: {
  threat: Threat;
  onDismiss: () => void;
  onBlock: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const isActive = threat.status === "active";

  const sendGuardian = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("guardian-chat", {
        body: { threat_id: threat.id, messages: next },
      });
      if (error) throw error;
      const reply = (data as any)?.reply as string | undefined;
      if (!reply) throw new Error("No reply");
      setMessages((cur) => [...cur, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      toast.error("Cyber Guardian error", { description: msg });
      setMessages((cur) => cur.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <li className={cn("bg-card border rounded-2xl p-4", isActive ? "border-border" : "border-border/50 opacity-60")}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
            severityStyles[threat.severity],
          )}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm truncate">{threat.title}</h4>
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider",
                severityStyles[threat.severity],
              )}
            >
              {threat.severity}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {typeLabels[threat.threat_type]}
            </span>
            {threat.status !== "active" && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase">
                {threat.status}
              </span>
            )}
          </div>
          {threat.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{threat.description}</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => setOpen((v) => !v)} className="text-xs text-primary hover:underline">
              {open ? "Hide details" : "View details"}
            </button>
            <button
              onClick={() => setGuardianOpen((v) => !v)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              {guardianOpen ? "Close Cyber Guardian" : "Ask Cyber Guardian"}
            </button>
            {isActive && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onBlock}
                  className="h-7 gap-1 text-xs border-border bg-secondary hover:bg-secondary/80"
                >
                  <Ban className="w-3 h-3" /> Block source
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onDismiss}
                  className="h-7 gap-1 text-xs border-border bg-secondary hover:bg-secondary/80"
                >
                  <CheckCircle2 className="w-3 h-3" /> Dismiss
                </Button>
              </>
            )}
            <button onClick={onDelete} className="ml-auto text-muted-foreground hover:text-destructive p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {open && (
            <div className="mt-3 pt-3 border-t border-border space-y-2 text-xs">
              {threat.details.indicators && threat.details.indicators.length > 0 && (
                <div>
                  <p className="font-semibold mb-1">Why it looks suspicious</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    {threat.details.indicators.map((i: unknown, idx) => {
                      const text = displayReason(i);
                      return <li key={idx}>{text}</li>;
                    })}
                  </ul>
                </div>
              )}
              {threat.details.suspicious_urls && threat.details.suspicious_urls.length > 0 && (
                <div>
                  <p className="font-semibold mb-1 flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> Suspicious links
                  </p>
                  <ul className="space-y-0.5 text-destructive font-mono break-all">
                    {threat.details.suspicious_urls.map((u: unknown, idx) => {
                      const text = displayReason(u);
                      return <li key={idx}>{text}</li>;
                    })}
                  </ul>
                </div>
              )}
              {threat.details.recommended_action && (
                <div>
                  <p className="font-semibold mb-1">What to do</p>
                  <p className="text-muted-foreground">{displayReason(threat.details.recommended_action)}</p>
                </div>
              )}
            </div>
          )}
          {guardianOpen && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md bg-primary/15 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-xs font-semibold">Cyber Guardian</p>
                <span className="text-[10px] text-muted-foreground">AI assistant for this threat</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {messages.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ask anything about this alert — "Why is this dangerous?", "What if I already clicked?", "How do I
                    check if my account is safe?"
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "text-xs rounded-lg px-3 py-2 whitespace-pre-wrap",
                      m.role === "user" ? "bg-primary/10 text-foreground ml-8" : "bg-secondary/60 text-foreground mr-8",
                    )}
                  >
                    {m.content}
                  </div>
                ))}
                {sending && (
                  <div className="bg-secondary/60 text-xs rounded-lg px-3 py-2 mr-8 inline-flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendGuardian();
                    }
                  }}
                  placeholder="Ask about this threat…"
                  disabled={sending}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  onClick={sendGuardian}
                  disabled={sending || !input.trim()}
                  className="h-8 px-3 bg-gradient-shield hover:opacity-90"
                >
                  <Send className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default Index;

function ExtensionsView({
  onAskGuardian,
}: {
  onAskGuardian: (browser?: "Chrome" | "Edge") => void;
}) {
  const downloadZip = (path: string, filename: string, browser: string, storeUrl: string) => {
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success(`${browser} extension downloaded`, {
          description: `Unzip it, open ${storeUrl}, enable Developer mode, then click 'Load unpacked'.`,
          duration: 9000,
        });
      })
      .catch((err) => toast.error(err.message));
  };

  const extensions = [
    {
      key: "chrome",
      name: "Chrome extension",
      description: "Warns you before loading dangerous URLs in Google Chrome.",
      zip: "/trust-shield-extension.zip",
      filename: "trust-shield-extension.zip",
      browser: "Chrome",
      storeUrl: "chrome://extensions",
    },
    {
      key: "edge",
      name: "Microsoft Edge extension",
      description: "Warns you before loading dangerous URLs in Microsoft Edge.",
      zip: "/trust-shield-edge.zip",
      filename: "trust-shield-edge.zip",
      browser: "Edge",
      storeUrl: "edge://extensions",
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Puzzle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Extensions</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Download Trust Shield browser extensions to get warned before you load a dangerous URL.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {extensions.map((ext) => (
          <Card key={ext.key}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Puzzle className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold">{ext.name}</h4>
                <p className="text-xs text-muted-foreground mt-1">{ext.description}</p>
                <button
                  onClick={() => downloadZip(ext.zip, ext.filename, ext.browser, ext.storeUrl)}
                  className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-gradient-shield text-primary-foreground hover:opacity-90 transition"
                >
                  <Download className="w-4 h-4" />
                  <span className="font-medium">Download</span>
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <p className="text-sm text-center text-muted-foreground">
          Don't know how to install the{" "}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="underline text-primary hover:opacity-80 font-medium"
              >
                extension
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              <DropdownMenuItem onClick={() => onAskGuardian("Chrome")}>
                Chrome
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAskGuardian("Edge")}>
                Edge
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          ? Ask Cyber Guardian!
        </p>
      </Card>
    </div>
  );
}

function GuardianView({
  threats,
  prefill,
  onPrefillConsumed,
}: {
  threats: Threat[];
  prefill?: string;
  onPrefillConsumed?: () => void;
}) {
  const activeThreats = threats.filter((t) => t.status === "active");
  const [mode, setMode] = useState<"all" | "emergency" | "threat" | "general">(
    activeThreats.length > 0 ? "all" : "general",
  );
  const [selectedThreatId, setSelectedThreatId] = useState<string | "">("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (prefill) {
      setInput(prefill);
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);

  const suggestions =
    mode === "emergency"
      ? [
          "I think I was just hacked — what do I do first?",
          "My password may be leaked. Steps right now?",
          "I clicked a phishing link. What now?",
        ]
      : mode === "all"
        ? [
            "Summarize all my alerts and what to fix first.",
            "Which of my threats is the most dangerous?",
            "What patterns do you see in my alerts?",
          ]
        : mode === "threat"
          ? [
              "Why is this dangerous?",
              "What should I do about this specific alert?",
              "Is my account compromised because of this?",
            ]
          : [
              "How do I spot a phishing email?",
              "How do I keep my computer safe day-to-day?",
              "What is 2FA and how do I turn it on?",
            ];

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || sending) return;
    if (mode === "threat" && !selectedThreatId) {
      toast.error("Pick an alert to discuss first.");
      return;
    }
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("guardian-chat", {
        body: {
          mode,
          threat_id: mode === "threat" ? selectedThreatId : undefined,
          messages: next,
          vault_summary: (() => {
            try {
              const raw = localStorage.getItem(`trust-shield:vault-summary:current`);
              return raw ? JSON.parse(raw) : null;
            } catch { return null; }
          })(),
        },
      });
      if (error) throw error;
      const reply = (data as any)?.reply as string | undefined;
      if (!reply) throw new Error("No reply");
      setMessages((cur) => [...cur, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chat failed";
      toast.error("Cyber Guardian error", { description: msg });
      setMessages((cur) => cur.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const modes: { key: typeof mode; label: string; desc: string }[] = [
    { key: "all", label: "All alerts", desc: "Overview of every threat you've scanned" },
    { key: "threat", label: "One alert", desc: "Deep-dive on a specific threat" },
    { key: "emergency", label: "Emergency", desc: "Something bad is happening RIGHT NOW" },
    { key: "general", label: "Stay safe", desc: "General online-safety advice" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">Cyber Guardian</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Ask about all your alerts, dig into a specific one, or get emergency safety steps if something bad is
              happening right now.
            </p>
          </div>
          <button
            onClick={() => setMessages([])}
            disabled={sending || messages.length === 0}
            className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-secondary/50 hover:bg-secondary disabled:opacity-40"
          >
            Clear chat
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          {modes.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMode(m.key);
                setMessages([]);
              }}
              className={cn(
                "text-left p-3 rounded-xl border transition",
                mode === m.key
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-secondary/30 hover:bg-secondary/60",
              )}
            >
              <p className="text-sm font-semibold">{m.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
        {mode === "threat" && (
          <div className="mt-3">
            <Label className="text-xs">Pick an alert</Label>
            <select
              value={selectedThreatId}
              onChange={(e) => setSelectedThreatId(e.target.value)}
              className="mt-1 w-full bg-secondary/50 border border-border rounded-md px-3 py-2 text-sm"
            >
              <option value="">— select a threat —</option>
              {threats.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.severity}] {t.title}
                </option>
              ))}
            </select>
            {threats.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                You have no threats yet. Scan something on the dashboard first.
              </p>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="space-y-3 min-h-[280px] max-h-[520px] overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div>
              <p className="text-xs text-muted-foreground mb-3">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-secondary/40 hover:bg-secondary/70"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "text-sm rounded-lg px-3 py-2 whitespace-pre-wrap",
                  m.role === "user" ? "bg-primary/10 text-foreground ml-10" : "bg-secondary/60 text-foreground mr-10",
                )}
              >
                {m.content}
              </div>
            ))
          )}
          {sending && (
            <div className="bg-secondary/60 text-xs rounded-lg px-3 py-2 mr-10 inline-flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              mode === "emergency"
                ? "Describe what just happened…"
                : mode === "threat"
                  ? "Ask about the selected alert…"
                  : mode === "all"
                    ? "Ask about your alerts…"
                    : "Ask a safety question…"
            }
            disabled={sending}
            className="h-10"
          />
          <Button
            onClick={() => send()}
            disabled={sending || !input.trim()}
            className="h-10 px-4 bg-gradient-shield hover:opacity-90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}

function NetworkScanView() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [https, setHttps] = useState<boolean>(typeof window !== "undefined" && window.location.protocol === "https:");
  const [connInfo, setConnInfo] = useState<{
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  } | null>(null);
  const [showDevices, setShowDevices] = useState<boolean>(() => hasFeatureAt("1.9.9"));
  useEffect(() => {
    const update = () => setShowDevices(hasFeatureAt("1.9.9"));
    window.addEventListener("ts:version-change", update);
    return () => window.removeEventListener("ts:version-change", update);
  }, []);

  useEffect(() => {
    setHttps(window.location.protocol === "https:");
    const nav: any = navigator;
    const c = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (c) {
      setConnInfo({ type: c.type, effectiveType: c.effectiveType, downlink: c.downlink, rtt: c.rtt });
    }
  }, []);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("scan-network", { body: {} });
      if (error) throw error;
      setResult(data);
      const verdict = (data as any)?.verdict;
      if (verdict === "unsafe") {
        toast.error("Network flagged as unsafe", {
          description: "See details below.",
          duration: 8000,
          position: "bottom-left",
          className: "trust-bottom-toast text-base",
        });
      } else if (verdict === "caution") {
        toast.warning("Proceed with caution", {
          description: "Some risk signals on your network.",
          duration: 8000,
          position: "bottom-left",
          className: "trust-bottom-toast text-base",
        });
      } else {
        toast.success("Network looks safe", {
          description: "No malicious signals detected.",
          duration: 6000,
          position: "bottom-left",
          className: "trust-bottom-toast text-base",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      setError(msg);
      toast.error("Network scan failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const verdictStyles: Record<string, string> = {
    safe: "bg-green-500/10 text-green-400 border-green-500/30",
    caution: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    unsafe: "bg-destructive/10 text-destructive border-destructive/30",
  };
  const verdictLabel: Record<string, string> = { safe: "Safe", caution: "Caution", unsafe: "Unsafe" };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Wifi className="w-5 h-5 text-primary" /> Network safety scan
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Checks your current internet path — your public IP's reputation, ISP, geolocation, and whether it's a
              known VPN, proxy, or malicious host. Note: browsers can't see your Wi-Fi's SSID, encryption, or signal —
              this scans the network you're going through, not the Wi-Fi radio itself.
            </p>
          </div>
          <Button
            onClick={runScan}
            disabled={loading}
            className="bg-gradient-shield hover:opacity-90 glow-shield gap-2 shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {loading ? "Scanning…" : "Scan network"}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
          <MiniInfo
            label="Page transport"
            value={https ? "HTTPS ✓" : "HTTP (insecure)"}
            tone={https ? "good" : "bad"}
          />
          {connInfo?.effectiveType && (
            <MiniInfo label="Connection quality" value={connInfo.effectiveType.toUpperCase()} />
          )}
          {connInfo?.type && <MiniInfo label="Connection type" value={connInfo.type} />}
          {connInfo?.downlink != null && <MiniInfo label="Downlink" value={`${connInfo.downlink} Mbps`} />}
          {connInfo?.rtt != null && <MiniInfo label="Round-trip time" value={`${connInfo.rtt} ms`} />}
        </div>
      </Card>

      {error && (
        <Card>
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {result && (
        <Card>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div
              className={cn(
                "text-xs font-bold px-3 py-1.5 rounded-full border uppercase tracking-wider",
                verdictStyles[result.verdict] ?? verdictStyles.safe,
              )}
            >
              {verdictLabel[result.verdict] ?? result.verdict}
            </div>
            <p className="text-sm text-muted-foreground">Risk score {result.risk_score}/100</p>
            {result.ip && <p className="text-sm font-mono text-muted-foreground">IP: {result.ip}</p>}
          </div>

          {result.reasons && result.reasons.length > 0 ? (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Signals</p>
              <ul className="space-y-1.5">
                {result.reasons.map((r: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              No malicious or proxy/VPN signals found.
            </div>
          )}

          {result.geo && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Location & ISP
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {result.geo.city && <MiniInfo label="City" value={result.geo.city} />}
                {result.geo.region && <MiniInfo label="Region" value={result.geo.region} />}
                {result.geo.country && <MiniInfo label="Country" value={result.geo.country} />}
                {result.geo.org && <MiniInfo label="ISP / Org" value={result.geo.org} />}
                {result.geo.asn && <MiniInfo label="ASN" value={result.geo.asn} />}
              </div>
            </div>
          )}

          {result.virustotal && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                VirusTotal reputation
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MiniInfo
                  label="Malicious"
                  value={result.virustotal.malicious}
                  tone={result.virustotal.malicious > 0 ? "bad" : undefined}
                />
                <MiniInfo
                  label="Suspicious"
                  value={result.virustotal.suspicious}
                  tone={result.virustotal.suspicious > 0 ? "warn" : undefined}
                />
                <MiniInfo label="Harmless" value={result.virustotal.harmless} />
                <MiniInfo label="Undetected" value={result.virustotal.undetected} />
              </div>
            </div>
          )}
        </Card>
      )}

      {showDevices && <DeviceScanner />}

      <Card>
        <h4 className="font-semibold text-sm mb-2">What this can't check</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Browsers don't expose your Wi-Fi's name, password strength, WPA2/WPA3 encryption, or nearby devices — those
          require a native OS-level scanner. For full Wi-Fi audits, use your router admin page (usually{" "}
          <span className="font-mono">192.168.1.1</span>) and confirm: WPA3 or WPA2 with a strong password, firmware up
          to date, remote admin disabled, and guest network isolated.
        </p>
      </Card>
    </div>
  );
}

function MiniInfo({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "good" | "bad" | "warn" }) {
  const toneClass =
    tone === "good" ? "text-green-400" : tone === "bad" ? "text-destructive" : tone === "warn" ? "text-yellow-400" : "";
  return (
    <div className="bg-secondary/40 border border-border rounded-lg p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-medium mt-1 truncate", toneClass)}>{value}</p>
    </div>
  );
}

type DiscoveredDevice = {
  ip: string;
  label: string;
  role: "this" | "gateway" | "peer";
  note?: string;
};

async function getLocalIps(timeoutMs = 2000): Promise<{ ips: string[]; mdns: string[] }> {
  return new Promise((resolve) => {
    const ips = new Set<string>();
    const mdns = new Set<string>();
    let pc: RTCPeerConnection | null = null;
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
    } catch {
      resolve({ ips: [], mdns: [] });
      return;
    }
    const done = () => {
      try { pc?.close(); } catch { /* ignore */ }
      resolve({ ips: Array.from(ips), mdns: Array.from(mdns) });
    };
    const timer = setTimeout(done, timeoutMs);
    pc.onicecandidate = (e) => {
      if (!e.candidate) { clearTimeout(timer); done(); return; }
      const parts = e.candidate.candidate.split(" ");
      const addr = parts[4];
      if (!addr) return;
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(addr) && !addr.startsWith("0.")) ips.add(addr);
      else if (/\.local$/i.test(addr)) mdns.add(addr);
    };
    try { pc.createDataChannel("d"); } catch { /* ignore */ }
    pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true } as RTCOfferOptions)
      .then((o) => pc?.setLocalDescription(o))
      .catch(() => { clearTimeout(timer); done(); });
  });
}

function subnetFrom(ip: string): string | null {
  const m = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  return m ? m[1] : null;
}

function describeThisDevice(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux device";
  return "This device";
}

function DeviceScanner() {
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredDevice[] | null>(null);
  const [subnet, setSubnet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    setScanning(true);
    setError(null);
    setDevices(null);
    try {
      const { ips, mdns } = await getLocalIps();
      const localIp = ips.find((i) =>
        /^10\./.test(i) || /^192\.168\./.test(i) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(i),
      ) || ips[0];

      const sub = localIp ? subnetFrom(localIp) : "192.168.1";
      setSubnet(sub);

      const thisIpDisplay = localIp
        ? localIp
        : mdns[0]
        ? `${mdns[0]} (hidden by browser)`
        : "Hidden by browser";
      const thisNote = localIp
        ? undefined
        : "Your browser masks the exact local IP for privacy (mDNS). The subnet below is the most common default.";

      const list: DiscoveredDevice[] = [
        { ip: thisIpDisplay, label: `${describeThisDevice()} (you)`, role: "this", note: thisNote },
      ];

      if (sub) {
        list.push({
          ip: `${sub}.1`,
          label: "Router / gateway (likely)",
          role: "gateway",
          note: "Common default gateway address for this subnet.",
        });
        if (localIp !== `${sub}.254`) {
          list.push({
            ip: `${sub}.254`,
            label: "Alternate gateway (some ISPs)",
            role: "gateway",
            note: "Some ISP routers use .254 instead of .1.",
          });
        }
      }

      setDevices(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Device scan failed");
    } finally {
      setScanning(false);
    }
  };

  const roleStyles: Record<DiscoveredDevice["role"], string> = {
    this: "bg-primary/10 text-primary border-primary/30",
    gateway: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    peer: "bg-secondary/40 text-foreground border-border",
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <MonitorSmartphone className="w-5 h-5 text-primary" /> Devices on this network
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Discovers this device's local address using WebRTC and infers your Wi-Fi subnet and likely router IP.
            Browsers can't actively probe other computers on your LAN — that requires the router admin page or a native
            scanner (Fing, Angry IP Scanner, arp -a).
          </p>
        </div>
        <Button
          onClick={scan}
          disabled={scanning}
          variant="outline"
          className="gap-2 shrink-0"
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
          {scanning ? "Scanning…" : "Scan devices"}
        </Button>
      </div>

      {error && <p className="text-sm text-yellow-400 mt-2">{error}</p>}

      {devices && devices.length > 0 && (
        <div className="mt-4 space-y-2">
          {subnet && (
            <p className="text-xs text-muted-foreground">
              Detected subnet: <span className="font-mono text-foreground">{subnet}.0/24</span>
            </p>
          )}
          <ul className="space-y-2">
            {devices.map((d) => (
              <li
                key={d.ip}
                className="flex items-start gap-3 bg-secondary/40 border border-border rounded-lg p-3"
              >
                <div className={cn("text-[10px] font-bold px-2 py-1 rounded-full border uppercase tracking-wider shrink-0", roleStyles[d.role])}>
                  {d.role === "this" ? "You" : d.role === "gateway" ? "Router" : "Peer"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{d.label}</p>
                  <p className="text-xs font-mono text-muted-foreground">{d.ip}</p>
                  {d.note && <p className="text-[11px] text-muted-foreground mt-1">{d.note}</p>}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground pt-2">
            To see every device connected right now, open your router admin page (try{" "}
            <span className="font-mono">http://{subnet ? `${subnet}.1` : "192.168.1.1"}</span>) and check the "Connected
            devices" or "DHCP clients" section.
          </p>
        </div>
      )}
    </Card>
  );
}

function QrScannerView() {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [supported, setSupported] = useState<boolean>(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string>("");
  const [verdict, setVerdict] = useState<null | { safe: boolean; reason: string }>(null);
  const [error, setError] = useState<string>("");
  const videoRef = (useMemo(() => ({ current: null as HTMLVideoElement | null }), []));
  const streamRef = useMemo(() => ({ current: null as MediaStream | null }), []);
  const rafRef = useMemo(() => ({ current: 0 as number }), []);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const touch = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0;
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touch > 1;
    setIsMobile(mobile);
    setSupported(typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector !== "undefined");
    if (!mobile) {
      toast("QR scanner is mobile-only", {
        description: "Open Trust Shield on your phone to scan QR codes with the camera.",
      });
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const evaluate = (text: string) => {
    const t = text.trim();
    let url: URL | null = null;
    try {
      url = new URL(t);
    } catch {
      // not a URL
    }
    const suspicious = [
      /bit\.ly|tinyurl|t\.co|shorte\.st|is\.gd|goo\.gl/i,
      /login|verify|update|account|secure|wallet|reset/i,
      /free.*(gift|prize|bitcoin|crypto)/i,
      /@/, // credentials in URL
    ];
    if (url) {
      if (url.protocol === "http:") return { safe: false, reason: "Unencrypted http:// link — data can be intercepted." };
      if (suspicious.some((r) => r.test(url!.href))) return { safe: false, reason: "URL matches known phishing / shortener patterns." };
      return { safe: true, reason: `Looks like a normal ${url.protocol.replace(":", "")} link to ${url.hostname}.` };
    }
    if (/^(tel:|sms:|mailto:)/i.test(t)) return { safe: true, reason: "Contact link — verify the number/address before using it." };
    if (/BEGIN:VCARD/i.test(t)) return { safe: true, reason: "Contact card (vCard)." };
    return { safe: true, reason: "Plain text QR — no link detected." };
  };

  const startScan = async () => {
    setError("");
    setResult("");
    setVerdict(null);
    if (!isMobile) {
      toast("QR scanner is mobile-only", { description: "Please use your phone." });
      return;
    }
    if (!supported) {
      setError("Your browser does not support in-browser QR scanning. Try the latest Chrome on Android.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      // wait a tick for the <video> to mount
      setTimeout(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        // @ts-expect-error - BarcodeDetector is not in lib.dom
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          if (!streamRef.current) return;
          try {
            const codes = await detector.detect(video);
            if (codes && codes[0]?.rawValue) {
              const raw = codes[0].rawValue as string;
              setResult(raw);
              const v = evaluate(raw);
              setVerdict(v);
              if (v.safe) toast.success("QR code scanned", { description: raw });
              else toast.error("Suspicious QR code", { description: v.reason });
              stopCamera();
              return;
            }
          } catch {
            // ignore per-frame errors
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }, 50);
    } catch (e) {
      setError((e as Error).message || "Could not access the camera.");
      setScanning(false);
    }
  };

  return (
    <Card>
      <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
          <QrCode className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">QR code scanner</h2>
          <p className="text-sm text-muted-foreground">
            Scan a QR code with your camera. Trust Shield checks the encoded link before you open it.
          </p>
        </div>
      </div>

      {!isMobile && (
        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-300">QR scanner is mobile-only</p>
            <p className="text-muted-foreground">
              Open Trust Shield on your phone (or install it as a PWA) to use the camera-based QR scanner.
            </p>
          </div>
        </div>
      )}

      {isMobile && !scanning && (
        <Button onClick={startScan} className="w-full">
          <Camera className="w-4 h-4 mr-2" /> Start scanning
        </Button>
      )}

      {scanning && (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden border border-border bg-black aspect-square max-w-sm mx-auto">
            <video
              ref={(el) => {
                videoRef.current = el;
              }}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
            <div className="absolute inset-6 border-2 border-primary/60 rounded-lg pointer-events-none" />
          </div>
          <Button variant="outline" onClick={stopCamera} className="w-full">
            Cancel
          </Button>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {result && verdict && (
        <div
          className={cn(
            "rounded-lg border p-4 space-y-2",
            verdict.safe
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-destructive/10 border-destructive/40",
          )}
        >
          <div className="flex items-center gap-2 font-semibold">
            {verdict.safe ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-destructive" />
            )}
            {verdict.safe ? "Looks safe" : "Suspicious QR code"}
          </div>
          <p className="text-sm text-muted-foreground">{verdict.reason}</p>
          <div className="text-xs font-mono break-all bg-secondary/40 border border-border rounded p-2">
            {result}
          </div>
          {/^https?:\/\//i.test(result) && verdict.safe && (
            <Button asChild variant="outline" size="sm">
              <a href={result} target="_blank" rel="noopener noreferrer">
                Open link
              </a>
            </Button>
          )}
        </div>
      )}
      </div>
    </Card>
  );
}
