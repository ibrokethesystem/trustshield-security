import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Radar, Plus, RefreshCw, Trash2, Loader2, ShieldCheck, AlertTriangle, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type WatchStatus = "pending" | "clean" | "suspicious" | "malicious" | "error";

type WatchEntry = {
  id: string;
  target: string;
  target_type: "domain" | "ip";
  label: string;
  status: WatchStatus;
  detections: number;
  sources: string[];
  notes: string;
  last_checked_at: string | null;
  created_at: string;
};

const statusStyles: Record<WatchStatus, { chip: string; label: string; Icon: React.ElementType }> = {
  pending: { chip: "bg-muted/40 text-muted-foreground border-border", label: "Not checked", Icon: Clock },
  clean: { chip: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", label: "Clean", Icon: ShieldCheck },
  suspicious: { chip: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", label: "Suspicious", Icon: AlertTriangle },
  malicious: { chip: "bg-destructive/10 text-destructive border-destructive/40", label: "Malicious", Icon: ShieldAlert },
  error: { chip: "bg-muted/40 text-muted-foreground border-border", label: "Check failed", Icon: AlertTriangle },
};

function normalizeTarget(raw: string): { target: string; type: "domain" | "ip" } | null {
  let t = raw.trim().toLowerCase();
  if (!t) return null;
  t = t.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(t);
  const ipv6 = t.includes(":") && /^[0-9a-f:]+$/i.test(t);
  if (ipv4 || ipv6) return { target: t, type: "ip" };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t)) return null;
  return { target: t, type: "domain" };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ThreatRadarView({ userId }: { userId?: string }) {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("watchlist")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Couldn't load Threat Radar", { description: error.message });
      setLoading(false);
      return;
    }
    setEntries((data ?? []) as WatchEntry[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = entries.length;
    const malicious = entries.filter((e) => e.status === "malicious").length;
    const suspicious = entries.filter((e) => e.status === "suspicious").length;
    const clean = entries.filter((e) => e.status === "clean").length;
    return { total, malicious, suspicious, clean };
  }, [entries]);

  const addEntry = async () => {
    if (!userId) return;
    const parsed = normalizeTarget(target);
    if (!parsed) {
      toast.error("Enter a valid domain (example.com) or IP address");
      return;
    }
    setAdding(true);
    const { data, error } = await supabase
      .from("watchlist")
      .insert({
        user_id: userId,
        target: parsed.target,
        target_type: parsed.type,
        label: label.trim().slice(0, 80),
      })
      .select("*")
      .maybeSingle();
    setAdding(false);
    if (error) {
      toast.error(error.code === "23505" ? "That target is already on your radar" : "Couldn't add target", {
        description: error.code === "23505" ? undefined : error.message,
      });
      return;
    }
    setEntries((cur) => [data as WatchEntry, ...cur]);
    setTarget("");
    setLabel("");
    toast.success("Added to Threat Radar", { description: parsed.target });
    // Auto-check the new entry.
    if (data?.id) runCheck([data.id]);
  };

  const removeEntry = async (id: string) => {
    const prev = entries;
    setEntries((cur) => cur.filter((e) => e.id !== id));
    const { error } = await supabase.from("watchlist").delete().eq("id", id);
    if (error) {
      setEntries(prev);
      toast.error("Couldn't remove", { description: error.message });
    }
  };

  const runCheck = async (ids: string[]) => {
    if (!ids.length) return;
    setCheckingIds((s) => new Set([...s, ...ids]));
    try {
      const { data, error } = await supabase.functions.invoke("check-watchlist", { body: { ids } });
      if (error) throw error;
      const results: Array<{ id: string; status: WatchStatus; detections: number; sources: string[]; notes: string }> =
        data?.results ?? [];
      setEntries((cur) =>
        cur.map((e) => {
          const r = results.find((x) => x.id === e.id);
          if (!r) return e;
          return {
            ...e,
            status: r.status,
            detections: r.detections,
            sources: r.sources,
            notes: r.notes,
            last_checked_at: new Date().toISOString(),
          };
        }),
      );
      const bad = results.filter((r) => r.status === "malicious" || r.status === "suspicious");
      if (bad.length) {
        toast.warning(`${bad.length} target${bad.length === 1 ? "" : "s"} flagged`, {
          description: bad.map((r) => entries.find((e) => e.id === r.id)?.target).filter(Boolean).join(", "),
          duration: 10000,
          position: "bottom-left",
          className: "trust-bottom-toast text-base",
        });
      } else {
        toast.success("Threat Radar check complete", { description: "No new detections." });
      }
    } catch (err) {
      toast.error("Check failed", { description: err instanceof Error ? err.message : "Try again shortly." });
    } finally {
      setCheckingIds((s) => {
        const next = new Set(s);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  return (
    <div className="space-y-4 bg-card border border-border rounded-2xl p-5 h-full">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Radar className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Threat Radar</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!entries.length || checkingIds.size > 0}
          onClick={() => runCheck(entries.map((e) => e.id))}
        >
          {checkingIds.size > 0 ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Check all
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Watched", value: stats.total, color: "text-foreground" },
          { label: "Malicious", value: stats.malicious, color: "text-destructive" },
          { label: "Suspicious", value: stats.suspicious, color: "text-yellow-400" },
          { label: "Clean", value: stats.clean, color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card/40 p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Add to watchlist</h3>
        </div>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") addEntry();
            }}
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label"
            onKeyDown={(e) => {
              if (e.key === "Enter") addEntry();
            }}
          />
          <Button onClick={addEntry} disabled={adding || !target.trim()}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Radar className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Your radar is empty. Add a domain or IP above to start watching it.
            </p>
          </div>
        ) : (
          entries.map((e) => {
            const s = statusStyles[e.status];
            const checking = checkingIds.has(e.id);
            return (
              <div key={e.id} className="rounded-lg border border-border bg-card/40 p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 rounded-md border px-2 py-1 text-[11px] font-medium inline-flex items-center gap-1", s.chip)}>
                    <s.Icon className="w-3 h-3" />
                    {s.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-sm break-all">{e.target}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{e.target_type}</span>
                      {e.label && <span className="text-xs text-muted-foreground">— {e.label}</span>}
                    </div>
                    {e.notes && <p className="text-xs text-muted-foreground mt-1">{e.notes}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                      <span>Last checked: {timeAgo(e.last_checked_at)}</span>
                      {e.detections > 0 && (
                        <span className="text-destructive">
                          {e.detections} detection{e.detections === 1 ? "" : "s"}
                        </span>
                      )}
                      {e.sources.length > 0 && <span>Sources: {e.sources.join(", ")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" disabled={checking} onClick={() => runCheck([e.id])}>
                      {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeEntry(e.id)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Sources: URLhaus by abuse.ch (free, no key) and VirusTotal (aggregates 70+ engines). Checks are rate-limited by the
        providers — public VirusTotal allows ~4 lookups per minute.
      </p>
    </div>
  );
}