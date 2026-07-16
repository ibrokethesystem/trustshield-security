import { useEffect, useState } from "react";
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
  Database,
  MonitorSmartphone,
  Ban,
  Zap,
  MessageCircle,
  Chrome,
  HeadphonesIcon,
  Crown,
  CheckCircle2,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThreatState = "safe" | "danger";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, active: true },
  { label: "Threats", icon: AlertTriangle, badge: 3 },
  { label: "Scam Alerts", icon: Mail, badge: 2 },
  { label: "Network Monitor", icon: Wifi },
  { label: "Device Scan", icon: ScanLine },
  { label: "Privacy Guard", icon: Lock },
  { label: "People & Apps", icon: Users },
  { label: "Settings", icon: Settings },
];

const recentAlerts = [
  { icon: AlertTriangle, title: "Remote Access Attempt", desc: "Blocked connection from 203.0.113.45", time: "Just now", color: "text-destructive" },
  { icon: Globe, title: "Fake Website Detected", desc: "Phishing attempt blocked: fake-bank-login.com", time: "2m ago", color: "text-orange-400" },
  { icon: MessageCircle, title: "Suspicious Message", desc: "Scam message detected on WhatsApp", time: "10m ago", color: "text-green-400" },
  { icon: Chrome, title: "Unusual Login Detected", desc: "New login attempt on Google from unknown device", time: "1h ago", color: "text-blue-400" },
];

const protectionStatus = [
  "Real-time Threat Detection",
  "Web Protection",
  "Phishing Protection",
  "Network Protection",
  "Device Firewall",
  "Privacy Protection",
];

const liveActivity = [
  { icon: Ban, title: "Malicious Connection Blocked", desc: "IP: 203.0.113.45", time: "Just now", color: "text-destructive" },
  { icon: AlertTriangle, title: "Phishing Attempt Detected", desc: "fake-bank-login.com", time: "2m ago", color: "text-orange-400" },
  { icon: MonitorSmartphone, title: "Suspicious App Behavior", desc: "ScreenRecorder Pro", time: "5m ago", color: "text-yellow-400" },
];

const Index = () => {
  const [state, setState] = useState<ThreatState>("danger");
  const [vpnActive, setVpnActive] = useState(false);
  const [threatsBlocked, setThreatsBlocked] = useState(37);

  const activateDangerProtocol = () => {
    setState("danger");
    setVpnActive(true);
    setThreatsBlocked((n) => n + 1);

    toast.error("⚠️ ACTIVE THREAT DETECTED", {
      description: "Remote intrusion attempt from Moscow, Russia (203.0.113.45)",
      duration: 6000,
    });

    setTimeout(() => {
      toast("🛡️ VPN Activated", {
        description: "Traffic rerouted through secure tunnel. Your IP is now masked.",
        duration: 5000,
      });
    }, 900);

    setTimeout(() => {
      toast.success("Threat Source Neutralized", {
        description: "Malicious process terminated. Connection severed.",
        duration: 5000,
      });
    }, 2000);

    setTimeout(() => {
      toast("Hacker Identified: John Doe", {
        description: "IP 203.0.113.45 — Moscow ISP. Report filed with authorities.",
        duration: 6000,
      });
    }, 3200);
  };

  const resetToSafe = () => {
    setState("safe");
    setVpnActive(false);
    toast.success("All Clear", { description: "No active threats. Device is protected." });
  };

  // Simulated background scans
  useEffect(() => {
    const t = setInterval(() => {
      if (state === "safe") setThreatsBlocked((n) => n + (Math.random() > 0.7 ? 1 : 0));
    }, 4000);
    return () => clearInterval(t);
  }, [state]);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-card/40 flex flex-col p-4 gap-2 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-2 py-3 mb-2">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-shield flex items-center justify-center glow-shield">
              <Shield className="w-6 h-6 text-primary-foreground" strokeWidth={2.5} />
            </div>
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
              {item.badge && (
                <span className="bg-destructive text-destructive-foreground text-[10px] font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {/* Protection ring */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-semibold mb-2">Device Protection</h3>
            <div className="relative w-24 h-24 mx-auto my-2">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" strokeWidth="7" className="stroke-secondary" fill="none" />
                <circle
                  cx="50" cy="50" r="42" strokeWidth="7" fill="none"
                  strokeLinecap="round"
                  className={cn(state === "danger" ? "stroke-destructive" : "stroke-green-400")}
                  strokeDasharray={`${2 * Math.PI * 42}`}
                  strokeDashoffset={`${2 * Math.PI * 42 * (1 - (state === "danger" ? 0.94 : 1))}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold">{state === "danger" ? "94%" : "100%"}</span>
                <span className="text-[9px] tracking-wider text-green-400 font-semibold">PROTECTED</span>
              </div>
            </div>
            <p className="text-[11px] text-center text-muted-foreground">Real-time protection is active</p>
          </div>

          <div className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground">Subscription</p>
              <p className="text-sm font-semibold">Premium Plan</p>
            </div>
            <Crown className="w-4 h-4 text-yellow-400 ml-auto" />
          </div>

          <div className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-3">
            <HeadphonesIcon className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Need Help?</p>
              <p className="text-[10px] text-muted-foreground">24/7 Support</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 space-y-6 max-w-[1200px]">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Hello, Alex 👋</h2>
            <p className="text-sm text-muted-foreground">
              {state === "danger" ? "Threat mitigation in progress" : "Your device is being protected"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={state === "danger" ? resetToSafe : activateDangerProtocol}
              className={cn(
                "gap-2 font-semibold",
                state === "danger"
                  ? "bg-secondary hover:bg-secondary/80 text-foreground"
                  : "bg-gradient-danger hover:opacity-90 text-white glow-danger"
              )}
            >
              <Zap className="w-4 h-4" />
              {state === "danger" ? "Reset to Safe" : "Activate Danger Protocol"}
            </Button>
            <button className="relative w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80">
              <Bell className="w-4 h-4" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-destructive" />
            </button>
            <button className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80">
              <User className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Threat banner */}
        {state === "danger" ? (
          <div className="relative overflow-hidden rounded-2xl border border-destructive/40 bg-destructive/5 p-6 glow-danger">
            <div className="absolute inset-0 pointer-events-none opacity-30">
              <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-destructive/20 to-transparent animate-scan-sweep" />
            </div>
            <div className="relative flex items-center gap-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-destructive/20 border border-destructive/40 flex items-center justify-center animate-pulse-ring">
                  <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold tracking-widest text-destructive">ACTIVE THREAT DETECTED</p>
                <h3 className="text-2xl font-bold mt-1">You are being scammed!</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  A suspicious remote connection was detected attempting to access your device.
                </p>
                <div className="flex gap-3 mt-4">
                  <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    View Details
                  </Button>
                  <Button variant="outline" className="border-border bg-secondary hover:bg-secondary/80">
                    Block & Protect
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-4 pr-2">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-secondary border-2 border-destructive/60 flex items-center justify-center overflow-hidden">
                    <User className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-destructive animate-ping-slow" />
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Hacker/Scammer Identified</p>
                  <p className="font-bold text-base">John Doe</p>
                  <p className="text-xs text-muted-foreground mt-1">IP: 203.0.113.45</p>
                  <p className="text-xs text-muted-foreground">🇷🇺 Location: Russia, Moscow</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-400" />
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-green-400">ALL SYSTEMS SECURE</p>
              <h3 className="text-xl font-bold mt-1">No active threats</h3>
              <p className="text-sm text-muted-foreground">Trust Shield is monitoring your device in real time.</p>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={Shield} iconClass="text-purple-400 bg-purple-400/10" label="Threats Blocked" value={threatsBlocked} delta="+12%" />
          <StatCard icon={AlertTriangle} iconClass="text-orange-400 bg-orange-400/10" label="Scam Alerts" value={5} delta="+25%" />
          <StatCard icon={Lock} iconClass="text-blue-400 bg-blue-400/10" label="Data Protected" value="2.4 GB" delta="+18%" />
          <StatCard icon={MonitorSmartphone} iconClass="text-green-400 bg-green-400/10" label="Devices Protected" value={3} deltaLabel="All Devices" deltaClass="text-green-400" delta="Online" />
        </div>

        {/* Live monitor + Recent alerts */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg">Live Threat Monitor</h3>
                <p className="text-xs text-muted-foreground">Real-time detection of suspicious activity</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-destructive/10 text-destructive px-2 py-1 rounded-md">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" /> LIVE
              </span>
            </div>

            {/* World map placeholder with pings */}
            <div className="relative h-40 rounded-xl bg-secondary/40 border border-border overflow-hidden mb-3">
              <svg viewBox="0 0 400 160" className="absolute inset-0 w-full h-full opacity-30">
                <path
                  d="M20,80 Q60,40 100,70 T180,60 Q220,80 260,50 T340,70 L380,90"
                  fill="none"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <circle cx="60" cy="60" r="20" fill="hsl(var(--muted-foreground))" opacity="0.15" />
                <circle cx="180" cy="70" r="30" fill="hsl(var(--muted-foreground))" opacity="0.15" />
                <circle cx="280" cy="55" r="25" fill="hsl(var(--muted-foreground))" opacity="0.15" />
                <circle cx="340" cy="90" r="18" fill="hsl(var(--muted-foreground))" opacity="0.15" />
              </svg>
              {[
                { x: "18%", y: "40%" },
                { x: "42%", y: "55%" },
                { x: "68%", y: "35%" },
                { x: "82%", y: "62%" },
                { x: "30%", y: "72%" },
              ].map((p, i) => (
                <div key={i} className="absolute" style={{ left: p.x, top: p.y }}>
                  <span className="absolute inset-0 w-3 h-3 rounded-full bg-destructive animate-ping-slow" />
                  <span className="relative block w-3 h-3 rounded-full bg-destructive" />
                </div>
              ))}
            </div>

            <ul className="space-y-2">
              {liveActivity.map((a, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <div className={cn("w-8 h-8 rounded-lg bg-secondary flex items-center justify-center", a.color)}>
                    <a.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className={cn("font-medium text-sm", a.color)}>{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.desc}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{a.time}</span>
                </li>
              ))}
            </ul>
            <button className="w-full text-center text-primary text-sm mt-3 hover:underline">View All Activity</button>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Recent Alerts</h3>
              <button className="text-primary text-sm hover:underline">View All</button>
            </div>
            <ul className="space-y-4">
              {recentAlerts.map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className={cn("w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0", a.color)}>
                    <a.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className={cn("font-semibold text-sm", a.color)}>{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.desc}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{a.time}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Who is behind this + Protection status */}
        <div className="grid grid-cols-2 gap-4 pb-6">
          <Card>
            <h3 className="font-semibold text-lg mb-4">Who is behind this?</h3>
            <div className="flex gap-4">
              <div className="w-24 h-24 rounded-xl bg-secondary border border-destructive/50 flex items-center justify-center shrink-0">
                <User className="w-12 h-12 text-muted-foreground" />
              </div>
              <div className="text-sm space-y-1.5 flex-1">
                <Row k="Name:" v="John Doe" />
                <Row k="IP Address:" v="203.0.113.45" />
                <Row k="Location:" v="🇷🇺 Russia, Moscow" />
                <Row k="ISP:" v="Moscow ISP" />
                <Row k="Last Seen:" v="Just now" />
                <Row k="Threat Level:" v={<span className="text-destructive font-semibold">High Risk</span>} />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">This person is attempting to:</p>
              <ul className="text-sm space-y-1 list-disc list-inside text-foreground/90">
                <li>Gain unauthorized access to your device</li>
                <li>Steal personal information</li>
                <li>Monitor your activity</li>
              </ul>
              <Button className="w-full mt-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                Block This Person
              </Button>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-lg mb-4">Protection Status</h3>
            <ul className="space-y-3">
              {protectionStatus.map((p) => (
                <li key={p} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    {p}
                  </span>
                  <span className="text-green-400 text-xs font-semibold">Active</span>
                </li>
              ))}
              <li className="flex items-center justify-between text-sm pt-2 border-t border-border mt-2">
                <span className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  VPN Tunnel
                </span>
                <span className={cn("text-xs font-semibold", vpnActive ? "text-green-400" : "text-muted-foreground")}>
                  {vpnActive ? "Rerouted" : "Standby"}
                </span>
              </li>
            </ul>
          </Card>
        </div>
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
  delta,
  deltaLabel,
  deltaClass,
}: {
  icon: React.ElementType;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  delta: string;
  deltaLabel?: string;
  deltaClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconClass)}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs text-muted-foreground text-right">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-3">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-muted-foreground">{deltaLabel ?? "Today"}</span>
        <span className={cn("text-xs font-semibold", deltaClass ?? "text-green-400")}>↑ {delta}</span>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-24 shrink-0">{k}</span>
      <span>{v}</span>
    </div>
  );
}

export default Index;
