import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileScan,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  UploadCloud,
  Trash2,
  Copy,
  Hash,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Verdict = "safe" | "caution" | "threat";

type ScanResult = {
  id: string;
  filename: string;
  size: number;
  type: string;
  sha256: string;
  verdict: Verdict;
  risk_score: number;
  stats: { malicious?: number; suspicious?: number; harmless?: number; undetected?: number; timeout?: number };
  total_engines: number;
  completed: boolean;
  scanned_at: string;
};

type QueueItem = {
  id: string;
  file: File;
  status: "pending" | "hashing" | "uploading" | "done" | "error";
  message?: string;
  result?: ScanResult;
};

const MAX_BYTES = 30 * 1024 * 1024;

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const verdictStyles: Record<Verdict, { label: string; badge: string; icon: React.ElementType; tone: string }> = {
  safe: { label: "Clean", badge: "bg-green-500/10 text-green-400 border-green-500/30", icon: ShieldCheck, tone: "text-green-400" },
  caution: { label: "Suspicious", badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", icon: AlertTriangle, tone: "text-yellow-400" },
  threat: { label: "Malicious", badge: "bg-destructive/10 text-destructive border-destructive/40", icon: ShieldAlert, tone: "text-destructive" },
};

export default function FileScannerView({ userId }: { userId?: string }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = results.length;
    const threats = results.filter((r) => r.verdict === "threat").length;
    const caution = results.filter((r) => r.verdict === "caution").length;
    const safe = results.filter((r) => r.verdict === "safe").length;
    return { total, threats, caution, safe };
  }, [results]);

  const processOne = useCallback(
    async (item: QueueItem): Promise<ScanResult | null> => {
      const setItem = (patch: Partial<QueueItem>) =>
        setQueue((cur) => cur.map((q) => (q.id === item.id ? { ...q, ...patch } : q)));
      try {
        setItem({ status: "hashing", message: "Computing SHA-256…" });
        const sha256 = await sha256Hex(item.file);
        setItem({ status: "uploading", message: "Uploading to scan engines…" });
        const b64 = await fileToBase64(item.file);
        const { data, error } = await supabase.functions.invoke("scan-file", {
          body: { file_base64: b64, filename: item.file.name },
        });
        if (error) throw error;
        const res = data as any;
        const verdict = (res?.verdict ?? "safe") as Verdict;
        const scan: ScanResult = {
          id: item.id,
          filename: item.file.name,
          size: item.file.size,
          type: item.file.type || "unknown",
          sha256,
          verdict,
          risk_score: Number(res?.risk_score ?? 0),
          stats: res?.stats ?? {},
          total_engines: Number(res?.total_engines ?? 0),
          completed: Boolean(res?.completed),
          scanned_at: new Date().toISOString(),
        };
        setItem({ status: "done", result: scan, message: undefined });

        // Persist to scan history if signed in
        if (userId) {
          const summary = `${scan.stats.malicious ?? 0} malicious / ${scan.stats.suspicious ?? 0} suspicious of ${scan.total_engines}`;
          await supabase.from("scan_history").insert({
            user_id: userId,
            verdict,
            risk_score: scan.risk_score,
            risk_level: verdict === "threat" ? "high" : verdict === "caution" ? "elevated" : "low",
            summary: `File scan: ${scan.filename}`,
            snippet: summary,
            had_image: false,
            threat_id: null,
          });
        }

        const desc = `${scan.filename} — ${scan.stats.malicious ?? 0} malicious of ${scan.total_engines} engines`;
        if (verdict === "threat") toast.error("Malicious file detected", { description: desc, duration: 10000 });
        else if (verdict === "caution") toast.warning("File looks suspicious", { description: desc, duration: 9000 });
        else toast.success("File looks clean", { description: desc, duration: 6000 });
        return scan;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Scan failed";
        setItem({ status: "error", message: msg });
        toast.error("File scan failed", { description: `${item.file.name}: ${msg}` });
        return null;
      }
    },
    [userId],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      const valid: QueueItem[] = [];
      for (const f of files) {
        if (f.size > MAX_BYTES) {
          toast.error("File too large", { description: `${f.name} exceeds the 30MB limit.` });
          continue;
        }
        valid.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file: f, status: "pending" });
      }
      if (!valid.length) return;
      setQueue((cur) => [...valid, ...cur]);
      setProcessing(true);
      try {
        for (const item of valid) {
          const r = await processOne(item);
          if (r) setResults((cur) => [r, ...cur]);
        }
      } finally {
        setProcessing(false);
      }
    },
    [processOne],
  );

  const clearAll = () => {
    setQueue([]);
    setResults([]);
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).then(
      () => toast.success("SHA-256 copied"),
      () => toast.error("Couldn't copy hash"),
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FileScan className="w-6 h-6 text-primary" />
          File Scanner
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Scan files against 70+ antivirus engines. Files are hashed locally, uploaded securely, and never stored by Trust Shield.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Scanned" value={stats.total} tone="text-foreground" />
        <StatCard label="Clean" value={stats.safe} tone="text-green-400" />
        <StatCard label="Suspicious" value={stats.caution} tone="text-yellow-400" />
        <StatCard label="Malicious" value={stats.threats} tone="text-destructive" />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length) addFiles(files);
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed p-8 flex flex-col items-center justify-center text-center transition",
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card",
        )}
      >
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <UploadCloud className="w-7 h-7 text-primary" />
        </div>
        <h3 className="font-semibold">Drag files here to scan</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Or pick multiple files below. Max 30MB each. Any format supported.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={processing}
            className="bg-gradient-shield hover:opacity-90 glow-shield gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileScan className="w-4 h-4" />}
            {processing ? "Scanning…" : "Choose files"}
          </Button>
          {(queue.length > 0 || results.length > 0) && (
            <Button variant="outline" onClick={clearAll} disabled={processing} className="gap-2">
              <Trash2 className="w-4 h-4" /> Clear
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) addFiles(files);
          }}
        />
      </div>

      {/* Active queue (in progress) */}
      {queue.some((q) => q.status !== "done" && q.status !== "error") && (
        <section>
          <h3 className="font-semibold mb-2">In progress</h3>
          <div className="space-y-2">
            {queue
              .filter((q) => q.status !== "done" && q.status !== "error")
              .map((q) => (
                <div key={q.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{q.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSize(q.file.size)} · {q.message ?? "Queued"}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Results */}
      {results.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">Scan results</h3>
          <div className="space-y-3">
            {results.map((r) => <ResultCard key={r.id} r={r} onCopyHash={copyHash} />)}
          </div>
        </section>
      )}

      {results.length === 0 && !queue.length && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center text-center">
          <FileText className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground max-w-md">
            No files scanned yet. Drop a file or pick one to check it against dozens of antivirus engines.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold", tone)}>{value}</p>
    </div>
  );
}

function ResultCard({ r, onCopyHash }: { r: ScanResult; onCopyHash: (h: string) => void }) {
  const style = verdictStyles[r.verdict];
  const Icon = style.icon;
  const mal = r.stats.malicious ?? 0;
  const sus = r.stats.suspicious ?? 0;
  const harm = r.stats.harmless ?? 0;
  const und = r.stats.undetected ?? 0;
  const total = r.total_engines || Math.max(1, mal + sus + harm + und);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", style.badge)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{r.filename}</p>
            <span className={cn("text-xs px-2 py-0.5 rounded-full border", style.badge)}>{style.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatSize(r.size)} · {r.type || "unknown"} · risk score {r.risk_score}/100
            {!r.completed && " · analysis still finalizing"}
          </p>
        </div>
      </div>

      {/* Engine breakdown */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Engine verdicts</span>
          <span>{total} engines</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-secondary/40">
          {mal > 0 && <div className="bg-destructive" style={{ width: pct(mal) }} title={`${mal} malicious`} />}
          {sus > 0 && <div className="bg-yellow-500" style={{ width: pct(sus) }} title={`${sus} suspicious`} />}
          {harm > 0 && <div className="bg-green-500" style={{ width: pct(harm) }} title={`${harm} harmless`} />}
          {und > 0 && <div className="bg-muted-foreground/40" style={{ width: pct(und) }} title={`${und} undetected`} />}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
          <Legend color="bg-destructive" label="Malicious" value={mal} />
          <Legend color="bg-yellow-500" label="Suspicious" value={sus} />
          <Legend color="bg-green-500" label="Harmless" value={harm} />
          <Legend color="bg-muted-foreground/40" label="Undetected" value={und} />
        </div>
      </div>

      {/* Hash */}
      <div className="mt-3 flex items-center gap-2 bg-secondary/30 border border-border rounded-lg p-2">
        <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <code className="text-[11px] font-mono truncate flex-1">{r.sha256}</code>
        <button
          onClick={() => onCopyHash(r.sha256)}
          className="text-xs px-2 py-1 rounded-md hover:bg-secondary/60 inline-flex items-center gap-1"
          title="Copy SHA-256"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2.5 h-2.5 rounded-sm", color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium">{value}</span>
    </div>
  );
}