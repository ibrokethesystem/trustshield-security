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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Threat = {
  id: string;
  title: string;
  description: string | null;
  threat_type: "phishing" | "scam" | "hack" | "suspicious_link" | "other";
  severity: "low" | "medium" | "high" | "critical";
  source: string | null;
  status: "active" | "dismissed" | "blocked";
  details: {
    indicators?: string[];
    suspicious_urls?: string[];
    recommended_action?: string;
    original_snippet?: string;
  };
  created_at: string;
};

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Threats", icon: AlertTriangle },
  { label: "Scanner", icon: ScanLine },
];

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

const Index = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [threats, setThreats] = useState<Threat[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanText, setScanText] = useState("");

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

  const activeThreats = useMemo(() => (threats ?? []).filter((t) => t.status === "active"), [threats]);
  const dismissedCount = useMemo(() => (threats ?? []).filter((t) => t.status !== "active").length, [threats]);
  const criticalCount = useMemo(() => activeThreats.filter((t) => t.severity === "critical" || t.severity === "high").length, [activeThreats]);

  const runScan = async () => {
    const content = scanText.trim();
    if (!content) {
      toast.error("Nothing to scan", { description: "Paste an email, message, or URL first." });
      return;
    }
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-threat", {
        body: { content, source: "manual_scan" },
      });
      if (error) throw error;
      const analysis = (data as any)?.analysis;
      if (!analysis) throw new Error("No analysis returned");
      if (analysis.is_threat) {
        toast.error("Threat detected", { description: analysis.title });
        setScanText("");
        await loadThreats();
      } else {
        toast.success("Looks safe", { description: analysis.summary?.slice(0, 140) ?? "No threats found." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      toast.error("Scan failed", { description: msg });
    } finally {
      setScanning(false);
    }
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

  const displayName = user.email?.split("@")[0] ?? "there";
  const hasActive = activeThreats.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card/40 flex flex-col p-4 gap-2 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2 py-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-shield flex items-center justify-center glow-shield">
            <Shield className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">Trust Shield</h1>
            <p className="text-[11px] text-muted-foreground">Scam & Hack Detector</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                item.active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.label === "Threats" && activeThreats.length > 0 && (
                <span className="bg-destructive text-destructive-foreground text-[10px] font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                  {activeThreats.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto bg-card border border-border rounded-xl p-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{user.email}</p>
            <button onClick={signOut} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <LogOut className="w-3 h-3" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 space-y-6 max-w-[1100px]">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Hello, {displayName} 👋</h2>
            <p className="text-sm text-muted-foreground">
              {hasActive
                ? `${activeThreats.length} active threat${activeThreats.length === 1 ? "" : "s"} needs your attention`
                : "No active threats detected"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border",
              hasActive ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-green-500/10 text-green-400 border-green-500/30"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full", hasActive ? "bg-destructive animate-pulse" : "bg-green-400")} />
              {hasActive ? "AT RISK" : "PROTECTED"}
            </div>
          </div>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={AlertTriangle} iconClass="text-destructive bg-destructive/10" label="Active threats" value={activeThreats.length} />
          <StatCard icon={ShieldCheck} iconClass="text-orange-400 bg-orange-400/10" label="High / critical" value={criticalCount} />
          <StatCard icon={CheckCircle2} iconClass="text-green-400 bg-green-400/10" label="Resolved" value={dismissedCount} />
        </div>

        {/* Scanner */}
        <Card>
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-primary" /> Scan a message or link
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Paste an email, text message, or URL. Trust Shield's AI checks it for phishing, scams, and malicious links.
              </p>
            </div>
          </div>
          <Textarea
            value={scanText}
            onChange={(e) => setScanText(e.target.value)}
            placeholder="Paste suspicious email content, a text message, or a URL like https://example.com/login…"
            className="min-h-[120px] bg-secondary/50 border-border resize-none"
            maxLength={8000}
            disabled={scanning}
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">{scanText.length} / 8000</span>
            <Button
              onClick={runScan}
              disabled={scanning || scanText.trim().length < 3}
              className="bg-gradient-shield hover:opacity-90 glow-shield gap-2"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
              {scanning ? "Analyzing…" : "Scan now"}
            </Button>
          </div>
        </Card>

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
                No threats detected yet. Paste anything suspicious above to scan it, and confirmed threats will show up here.
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

        <footer className="text-xs text-muted-foreground pb-6">
          Trust Shield analyzes content you submit. It cannot access your device, messages, or accounts on its own.
        </footer>
      </main>
    </div>
  );
};

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-card border border-border rounded-2xl p-5">{children}</div>;
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
  const isActive = threat.status === "active";
  return (
    <li className={cn("bg-card border rounded-2xl p-4", isActive ? "border-border" : "border-border/50 opacity-60")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", severityStyles[threat.severity])}>
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm truncate">{threat.title}</h4>
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider", severityStyles[threat.severity])}>
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
          {threat.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{threat.description}</p>}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => setOpen((v) => !v)} className="text-xs text-primary hover:underline">
              {open ? "Hide details" : "View details"}
            </button>
            {isActive && (
              <>
                <Button size="sm" variant="outline" onClick={onBlock} className="h-7 gap-1 text-xs border-border bg-secondary hover:bg-secondary/80">
                  <Ban className="w-3 h-3" /> Block source
                </Button>
                <Button size="sm" variant="outline" onClick={onDismiss} className="h-7 gap-1 text-xs border-border bg-secondary hover:bg-secondary/80">
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
                    {threat.details.indicators.map((i, idx) => <li key={idx}>{i}</li>)}
                  </ul>
                </div>
              )}
              {threat.details.suspicious_urls && threat.details.suspicious_urls.length > 0 && (
                <div>
                  <p className="font-semibold mb-1 flex items-center gap-1"><Link2 className="w-3 h-3" /> Suspicious links</p>
                  <ul className="space-y-0.5 text-destructive font-mono break-all">
                    {threat.details.suspicious_urls.map((u, idx) => <li key={idx}>{u}</li>)}
                  </ul>
                </div>
              )}
              {threat.details.recommended_action && (
                <div>
                  <p className="font-semibold mb-1">What to do</p>
                  <p className="text-muted-foreground">{threat.details.recommended_action}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default Index;
