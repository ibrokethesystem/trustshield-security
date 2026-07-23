import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Shield, Ban, Globe, Trash2, RefreshCw, Link2, Users, Eraser, GraduationCap } from "lucide-react";
import { toast } from "sonner";

type ChildLink = { child_id: string; child_email: string | null; edu_disabled: boolean; edu_games_disabled: boolean };
type Activity = { id: string; host: string; url: string; risk: number; blocked: boolean; created_at: string };
type Ban = { id: string; host: string; created_at: string };
type ChildStats = { activity: number; bans: number; lastSeen: string | null };

function normalizeHost(input: string) {
  const t = input.trim().toLowerCase();
  if (!t) return "";
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return t.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export function ChildMonitoring({ parentUserId }: { parentUserId: string | undefined }) {
  const [links, setLinks] = useState<ChildLink[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [newBan, setNewBan] = useState("");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [stats, setStats] = useState<Record<string, ChildStats>>({});
  const [clearing, setClearing] = useState(false);

  const loadLinks = useCallback(async () => {
    if (!parentUserId) return;
    const { data, error } = await supabase
      .from("child_links")
      .select("child_id,child_email,edu_disabled,edu_games_disabled")
      .eq("parent_id", parentUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return;
    setLinks((data ?? []) as ChildLink[]);
    if (!selected && data && data.length) setSelected(data[0].child_id);
  }, [parentUserId, selected]);

  const loadChildData = useCallback(async (childId: string) => {
    setLoading(true);
    try {
      const [{ data: acts }, { data: bs }] = await Promise.all([
        supabase
          .from("child_activity")
          .select("id,host,url,risk,blocked,created_at")
          .eq("user_id", childId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("child_banned_sites")
          .select("id,host,created_at")
          .eq("user_id", childId)
          .order("created_at", { ascending: false }),
      ]);
      setActivity((acts ?? []) as Activity[]);
      setBans((bs ?? []) as Ban[]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async (childIds: string[]) => {
    const out: Record<string, ChildStats> = {};
    await Promise.all(childIds.map(async (id) => {
      const [{ count: aCount }, { count: bCount }, { data: latest }] = await Promise.all([
        supabase.from("child_activity").select("id", { count: "exact", head: true }).eq("user_id", id),
        supabase.from("child_banned_sites").select("id", { count: "exact", head: true }).eq("user_id", id),
        supabase.from("child_activity").select("created_at").eq("user_id", id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      out[id] = {
        activity: aCount ?? 0,
        bans: bCount ?? 0,
        lastSeen: (latest?.created_at as string | undefined) ?? null,
      };
    }));
    setStats(out);
  }, []);

  useEffect(() => { loadLinks(); }, [loadLinks]);
  useEffect(() => { if (selected) loadChildData(selected); }, [selected, loadChildData]);
  useEffect(() => { if (links.length) loadStats(links.map((l) => l.child_id)); }, [links, loadStats]);

  // Realtime: notify the parent whenever a linked child visits a risky/blocked site.
  useEffect(() => {
    if (!links.length) return;
    const childIds = new Set(links.map((l) => l.child_id));
    const emailByChild = new Map(links.map((l) => [l.child_id, l.child_email ?? ""]));
    const channel = supabase
      .channel("child-activity-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "child_activity" },
        (payload) => {
          const row = payload.new as Activity & { user_id: string };
          if (!childIds.has(row.user_id)) return;
          const isRisky = row.blocked || (row.risk ?? 0) >= 30;
          if (!isRisky) return;
          const who = emailByChild.get(row.user_id) || "your child";
          toast.error(`CHILD ALERT: ${row.host}`, {
            description: `${who} tried to visit ${row.url}${row.blocked ? " (blocked)" : ` — risk ${row.risk}`}.`,
            duration: 12000,
          });
          if (selected === row.user_id) loadChildData(row.user_id);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [links, selected, loadChildData]);

  const linkExisting = async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("family-link-child", { body: {} });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Child linked for monitoring");
      await loadLinks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not link child");
    } finally {
      setLinking(false);
    }
  };

  const addBan = async () => {
    if (!selected) return;
    const host = normalizeHost(newBan);
    if (!host) return toast.error("Enter a valid domain");
    const { error } = await supabase
      .from("child_banned_sites")
      .insert({ user_id: selected, host });
    if (error) return toast.error(error.message);
    setNewBan("");
    toast.success(`Banned ${host} for your child`);
    loadChildData(selected);
  };

  const removeBan = async (id: string) => {
    const { error } = await supabase.from("child_banned_sites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (selected) loadChildData(selected);
  };

  const banFromActivity = async (host: string) => {
    if (!selected) return;
    const h = normalizeHost(host);
    if (!h) return;
    const { error } = await supabase.from("child_banned_sites").insert({ user_id: selected, host: h });
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    toast.success(`Banned ${h}`);
    loadChildData(selected);
  };

  const clearHistory = async () => {
    if (!selected) return;
    if (!confirm("Erase all browsing history for this child? This can't be undone.")) return;
    setClearing(true);
    const { error } = await supabase.from("child_activity").delete().eq("user_id", selected);
    setClearing(false);
    if (error) return toast.error("Couldn't clear history", { description: error.message });
    toast.success("Search history cleared");
    setActivity([]);
    loadStats(links.map((l) => l.child_id));
  };

  const toggleEdu = async (childId: string, disable: boolean) => {
    if (!parentUserId) return;
    const { error } = await supabase
      .from("child_links")
      .update({ edu_disabled: disable })
      .eq("parent_id", parentUserId)
      .eq("child_id", childId);
    if (error) return toast.error("Couldn't update CyberEdu access", { description: error.message });
    setLinks((prev) => prev.map((l) => (l.child_id === childId ? { ...l, edu_disabled: disable } : l)));
    toast.success(disable ? "CyberEdu turned off for this child" : "CyberEdu turned on for this child");
  };

  const toggleEduGames = async (childId: string, disable: boolean) => {
    if (!parentUserId) return;
    const { error } = await supabase
      .from("child_links")
      .update({ edu_games_disabled: disable })
      .eq("parent_id", parentUserId)
      .eq("child_id", childId);
    if (error) return toast.error("Couldn't update CyberEdu games access", { description: error.message });
    setLinks((prev) => prev.map((l) => (l.child_id === childId ? { ...l, edu_games_disabled: disable } : l)));
    toast.success(disable ? "CyberEdu games turned off for this child" : "CyberEdu games turned on for this child");
  };

  const selectedLink = links.find((l) => l.child_id === selected);

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">Child browsing monitor</h2>
          <p className="text-sm text-muted-foreground">
            View websites your child visits with the Trust Shield — Child Edition extension, and ban any site
            you don't want them to access. Banned sites are enforced by the extension in real time.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={linkExisting} disabled={linking}>
          {linking ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Link2 className="w-3 h-3 mr-1" />}
          Link existing child
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-4">
          No linked child accounts in the backend yet. Create a child account from the dashboard, or press
          "Link existing child" to attach one you created earlier.
        </p>
      ) : (
        <>
          <div className="mt-4 p-3 rounded-lg bg-secondary/40 border border-border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider">Your children ({links.length})</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {links.map((l) => {
                const s = stats[l.child_id];
                const isSel = selected === l.child_id;
                return (
                  <button
                    key={l.child_id}
                    onClick={() => setSelected(l.child_id)}
                    className={`text-left p-2.5 rounded-lg border transition ${
                      isSel ? "border-primary bg-primary/10" : "border-border bg-card/40 hover:border-primary/50"
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">{l.child_email ?? l.child_id.slice(0, 8)}</div>
                    <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{s?.activity ?? 0} searches</span>
                      <span>{s?.bans ?? 0} banned</span>
                      <span>
                        {s?.lastSeen ? `Last: ${new Date(s.lastSeen).toLocaleString()}` : "No activity yet"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {links.map((l) => (
              <button
                key={l.child_id}
                onClick={() => setSelected(l.child_id)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  selected === l.child_id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/40 border-border text-muted-foreground"
                }`}
              >
                {l.child_email ?? l.child_id.slice(0, 8)}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => selected && loadChildData(selected)}
              disabled={!selected || loading}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive hover:text-destructive"
              onClick={clearHistory}
              disabled={!selected || clearing || activity.length === 0}
            >
              {clearing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Eraser className="w-3 h-3 mr-1" />}
              Clear history
            </Button>
          </div>

          {selectedLink && (
            <div className="mt-4 p-3 rounded-lg border border-border bg-card/40 flex items-center gap-3 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="text-xs font-semibold uppercase tracking-wider">CyberEdu access</div>
                <p className="text-xs text-muted-foreground">
                  {selectedLink.edu_disabled
                    ? "CyberEdu is hidden from this child's sidebar. Turn it back on to let them keep learning."
                    : "This child can open CyberEdu lessons and minigames. Turn it off to hide the tab from them."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedLink.edu_disabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEdu(selectedLink.child_id, !selectedLink.edu_disabled)}
                >
                  {selectedLink.edu_disabled ? "Turn CyberEdu on" : "Turn CyberEdu off"}
                </Button>
                <Button
                  variant={selectedLink.edu_games_disabled ? "default" : "outline"}
                  size="sm"
                  disabled={selectedLink.edu_disabled}
                  onClick={() => toggleEduGames(selectedLink.child_id, !selectedLink.edu_games_disabled)}
                  title={selectedLink.edu_disabled ? "CyberEdu is already fully off" : undefined}
                >
                  {selectedLink.edu_games_disabled ? "Turn CyberEdu games on" : "Turn CyberEdu games off"}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="p-3 rounded-lg border border-border bg-card/40">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider">Recent searches</span>
              </div>
              {activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No activity yet. Install the child extension and pair it from its options page.
                </p>
              ) : (
                <ul className="space-y-1.5 max-h-72 overflow-auto">
                  {activity.map((a) => (
                    <li key={a.id} className="text-xs flex items-start gap-2">
                      <span
                        className={`inline-block w-1.5 h-1.5 mt-1.5 rounded-full shrink-0 ${
                          a.blocked ? "bg-destructive" : a.risk >= 30 ? "bg-yellow-500" : "bg-primary/60"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{a.host}</span>
                          {a.blocked && (
                            <span className="text-[9px] uppercase tracking-wider text-destructive">blocked</span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            risk {a.risk}
                          </span>
                        </div>
                        <div className="text-muted-foreground truncate">{a.url}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                        onClick={() => banFromActivity(a.host)}
                      >
                        <Ban className="w-3 h-3 mr-1" /> Ban
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-3 rounded-lg border border-border bg-card/40">
              <div className="flex items-center gap-2 mb-2">
                <Ban className="w-4 h-4 text-destructive" />
                <span className="text-xs font-semibold uppercase tracking-wider">Banned sites</span>
              </div>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="example.com"
                  value={newBan}
                  onChange={(e) => setNewBan(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addBan()}
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8" onClick={addBan}>Ban</Button>
              </div>
              {bans.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No banned sites yet. Sites you add here are enforced by your child's extension.
                </p>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-auto">
                  {bans.map((b) => (
                    <li key={b.id} className="text-xs flex items-center gap-2 justify-between">
                      <span className="truncate">{b.host}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-destructive hover:text-destructive"
                        onClick={() => removeBan(b.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}