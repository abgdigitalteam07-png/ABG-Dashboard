import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Brand } from "@/lib/brands";
import { supabase } from "@/integrations/supabase/client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { toast } from "sonner";

// New aeo_* tables are not in the generated Database types yet — regenerate after
// the 20260717000000 migration is applied, then drop this cast.
const sb = supabase as any;

// HubSpot data-viz palette (matches the approved prototype)
const HS = {
  orange: "#FF7A59", teal: "#0091AE", purple: "#6A78D1", mint: "#00BDA5",
  sand: "#F5C26B", slate: "#516F90", salmon: "#FEA58E", lavender: "#B49CDC",
  pink: "#EA90B1", sky: "#81C1FD", coral: "#E66E50", cyan: "#51D3D9",
};

const SUBTABS = ["Dashboard", "Prompts", "Citations", "Recommendations", "Reddit Visibility"] as const;
const MAX_PROMPTS = 10;

function scoreColor(score: number | undefined) {
  const n = Number(score) || 0;
  return n >= 7 ? HS.mint : n >= 5 ? HS.sand : HS.coral;
}

function DateChip({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground">{children}</span>;
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  const map = {
    good: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    warn: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    bad: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    neutral: "bg-muted text-muted-foreground",
  } as const;
  return <span className={`rounded px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${map[tone]}`}>{children}</span>;
}

interface Props { brand: Brand; }

export const SeoAeoGeoTab = ({ brand }: Props) => {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>("Dashboard");
  const [scanning, setScanning] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ prompt: "", product_service: "", icp: "", journey_phase: "Consideration" });
  const [recFilter, setRecFilter] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: weeks } = useQuery({
    queryKey: ["aeo-weeks", brand.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("aeo_scan_log")
        .select("week_of, started_at, status")
        .eq("brand_id", brand.id)
        .eq("status", "completed")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data as { week_of: string; started_at: string; status: string }[];
    },
  });

  const week = selectedWeek ?? weeks?.[0]?.week_of ?? null;
  const lastScan = weeks?.[0]?.started_at;

  const { data, isLoading } = useQuery({
    queryKey: ["aeo-data", brand.id, week],
    enabled: !!week,
    queryFn: async () => {
      const [scores, visibility, citations, recs, reddit, prompts, promptResults] = await Promise.all([
        sb.from("seo_audit_scores").select("*").eq("brand_id", brand.id).order("week_of"),
        sb.from("aeo_visibility_snapshots").select("*").eq("brand_id", brand.id).order("week_of"),
        sb.from("aeo_citations").select("*").eq("brand_id", brand.id).eq("week_of", week).order("frequency", { ascending: false }),
        sb.from("aeo_recommendations").select("*").eq("brand_id", brand.id).order("created_at", { ascending: false }),
        sb.from("reddit_threads").select("*").eq("brand_id", brand.id).eq("week_of", week).order("upvotes", { ascending: false }),
        sb.from("aeo_prompts").select("*").eq("brand_id", brand.id).eq("is_active", true).order("created_at"),
        sb.from("aeo_prompt_results").select("*").eq("brand_id", brand.id).eq("week_of", week),
      ]);
      const firstError = [scores, visibility, citations, recs, reddit, prompts, promptResults].find(r => r.error);
      if (firstError?.error) throw firstError.error;
      return {
        scores: scores.data, visibility: visibility.data, citations: citations.data,
        recs: recs.data, reddit: reddit.data, prompts: prompts.data, promptResults: promptResults.data,
      };
    },
  });

  // Scanning/HubSpot-publish logic is untouched — do not modify while root-causing
  // the earlier stuck-scan issue.
  const runScan = async () => {
    setScanning(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("aeo-scan", {
        body: {
          brandId: brand.id,
          brandName: brand.name,
          siteUrl: brand.gscSiteUrl ?? `https://${brand.id.replace(/-/g, "")}.com/`,
          landingPageId: brand.redditLandingPageId,
        },
      });
      if (error || res?.error) throw new Error(res?.error ?? error?.message);

      toast.info("Scan started — site audit, prompts and Reddit run in the background (1–3 min).");
      const deadline = Date.now() + 8 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: log } = await sb.from("aeo_scan_log")
          .select("status, api_calls_used, error").eq("id", res.scanId).single();
        if (log?.status === "completed") {
          toast.success(`Scan complete — ${log.api_calls_used} API calls used`);
          qc.invalidateQueries({ queryKey: ["aeo-weeks", brand.id] });
          qc.invalidateQueries({ queryKey: ["aeo-data", brand.id] });
          return;
        }
        if (log?.status === "failed") throw new Error(log.error ?? "scan failed");
      }
      throw new Error("Scan timed out after 8 minutes — check aeo_scan_log.");
    } catch (e) {
      toast.error(`Scan failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setScanning(false);
    }
  };

  const addPrompt = async () => {
    if (!newPrompt.prompt.trim()) return;
    if ((data?.prompts?.length ?? 0) >= MAX_PROMPTS) {
      toast.error(`Already at ${MAX_PROMPTS}/${MAX_PROMPTS} — deactivate a prompt first to stay inside API limits.`);
      return;
    }
    const { error } = await sb.from("aeo_prompts").insert({
      brand_id: brand.id,
      prompt: newPrompt.prompt.trim(),
      product_service: newPrompt.product_service || null,
      icp: newPrompt.icp || null,
      journey_phase: newPrompt.journey_phase,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Prompt added — it will be included in the next scan.");
    setShowAddPrompt(false);
    setNewPrompt({ prompt: "", product_service: "", icp: "", journey_phase: "Consideration" });
    qc.invalidateQueries({ queryKey: ["aeo-data", brand.id] });
  };

  const deactivatePrompt = async (id: string) => {
    const { error } = await sb.from("aeo_prompts").update({ is_active: false }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["aeo-data", brand.id] });
  };

  const latestScore = data?.scores?.at(-1);
  const prevScore = data?.scores?.at(-2);
  const ownVisibility = data?.visibility?.filter((v: any) => v.is_own_brand) ?? [];
  const currentVis = ownVisibility.find((v: any) => v.week_of === week)?.visibility_pct ?? 0;
  const prevVis = ownVisibility.at(-2)?.visibility_pct;

  const recTypes = [...new Set((data?.recs ?? []).map((r: any) => r.rec_type))] as string[];
  const filteredRecs = recFilter ? (data?.recs ?? []).filter((r: any) => r.rec_type === recFilter) : (data?.recs ?? []);

  const trend = (curr?: number, prev?: number) => {
    if (curr == null || prev == null) return null;
    const d = Math.round((curr - prev) * 10) / 10;
    if (d === 0) return <span className="text-muted-foreground text-xs">— flat</span>;
    return <span className={`text-xs font-semibold ${d > 0 ? "text-green-600" : "text-red-500"}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">BETA · ADMIN ONLY</span>
        <span className="text-sm text-muted-foreground">
          Last scanned: <b className="text-foreground">{lastScan ? new Date(lastScan).toLocaleString() : "never"}</b>
        </span>
        {weeks && weeks.length > 0 && (
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={week ?? ""}
            onChange={e => setSelectedWeek(e.target.value)}
          >
            {[...new Set(weeks.map(w => w.week_of))].map(w => (
              <option key={w} value={w}>Week of {w}</option>
            ))}
          </select>
        )}
        <div className="flex-1" />
        <button
          onClick={runScan}
          disabled={scanning}
          className="rounded-md bg-[#FF5C35] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {scanning ? "Scanning… (audit + prompts + Reddit)" : "⟳ Scan now"}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {SUBTABS.map(t => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap ${subtab === t ? "border-b-2 border-accent text-foreground" : "text-muted-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && <WaterFillLoader />}

      {!isLoading && !week && (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          No scans yet for {brand.name}. Click <b>Scan now</b> to run the first SEO/AEO/GEO scan.
        </div>
      )}

      {!isLoading && week && data && (
        <>
          {subtab === "Dashboard" && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-4">
                <h2 className="mb-1 flex items-center gap-2 font-semibold">
                  Weekly Audit Scores <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">from site crawl</span>
                </h2>
                <p className="mb-3 text-sm text-muted-foreground">SEO / GEO / AEO rubric scores for {brand.name} — re-scored on every scan.</p>
                <div className="grid gap-4 md:grid-cols-3">
                  {([
                    ["SEO — Traditional Search", latestScore?.seo_score, prevScore?.seo_score],
                    ["GEO — Generative Engines", latestScore?.geo_score, prevScore?.geo_score],
                    ["AEO — Answer Engines", latestScore?.aeo_score, prevScore?.aeo_score],
                  ] as const).map(([label, score, prev]) => (
                    <div key={label} className="rounded-lg border p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold tabular-nums">{score ?? "—"}<span className="text-sm text-muted-foreground">/10</span></span>
                        {trend(score, prev)}
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${(Number(score) || 0) * 10}%`, background: scoreColor(score) }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h2 className="mb-1 font-semibold">Brand Metrics</h2>
                <p className="mb-3 text-sm text-muted-foreground">How often {brand.name} appears in AI-generated answers. Weekly snapshots — not tied to the dashboard date filter.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand visibility</div>
                      <DateChip>WEEK OF {week}</DateChip>
                    </div>
                    <div className="py-6 text-center">
                      <span className="text-5xl font-bold tabular-nums">{currentVis}%</span>
                      <div className="mt-1">{trend(currentVis, prevVis)}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibility over time</div>
                      <DateChip>BY ENGINE</DateChip>
                    </div>
                    <ResponsiveContainer width="100%" height={190}>
                      <LineChart data={ownVisibility}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                        <XAxis dataKey="week_of" fontSize={11} />
                        <YAxis fontSize={11} unit="%" />
                        <Tooltip />
                        <Line type="monotone" dataKey="visibility_pct" name="Claude" stroke={HS.teal} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <h2 className="mb-1 font-semibold">Citation Analysis — Top domains</h2>
                <p className="mb-3 text-sm text-muted-foreground">The sites AI engines cite when answering the tracked prompts.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2">Domain</th><th className="text-right">Frequency</th><th>Brand mentioned</th>
                    </tr></thead>
                    <tbody>
                      {(data.citations ?? []).slice(0, 10).map((c: any) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 font-medium text-accent">{c.domain}</td>
                          <td className="text-right">{c.frequency}</td>
                          <td>{c.brand_mentioned ? <Pill tone="good">Yes</Pill> : "No"}</td>
                        </tr>
                      ))}
                      {!data.citations?.length && <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No citations captured this week.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {subtab === "Prompts" && (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  Tracked Prompts <span className="rounded bg-muted px-2 py-0.5 text-xs">{data.prompts?.length ?? 0} / {MAX_PROMPTS} used</span>
                </h2>
                <button
                  onClick={() => setShowAddPrompt(true)}
                  disabled={(data.prompts?.length ?? 0) >= MAX_PROMPTS}
                  className="rounded-md bg-[#FF5C35] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
                >
                  ＋ Add prompt
                </button>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">Questions we ask each AI engine weekly. Capped at {MAX_PROMPTS} per brand to stay inside API free limits.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Prompt</th><th>Visibility</th><th>Product</th><th>ICP</th><th>Journey phase</th><th></th>
                  </tr></thead>
                  <tbody>
                    {(data.prompts ?? []).map((p: any) => {
                      const r = data.promptResults?.find((x: any) => x.prompt_id === p.id);
                      return (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{p.prompt}</td>
                          <td>{r ? (r.brand_mentioned ? <Pill tone="good">Mentioned</Pill> : <Pill tone="bad">0%</Pill>) : <span className="text-muted-foreground">—</span>}</td>
                          <td>{p.product_service ?? "—"}</td>
                          <td>{p.icp ?? "—"}</td>
                          <td>{p.journey_phase ?? "—"}</td>
                          <td><button onClick={() => deactivatePrompt(p.id)} className="text-xs text-muted-foreground hover:text-red-500">Remove</button></td>
                        </tr>
                      );
                    })}
                    {!data.prompts?.length && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No prompts yet — click "Add prompt" or run a scan (auto-generates 10 on first run).</td></tr>}
                  </tbody>
                </table>
              </div>

              {showAddPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddPrompt(false)}>
                  <div className="w-full max-w-md rounded-lg border bg-card p-5" onClick={e => e.stopPropagation()}>
                    <h3 className="mb-1 font-semibold">Add a tracked prompt</h3>
                    <p className="mb-3 text-xs text-muted-foreground">{MAX_PROMPTS - (data.prompts?.length ?? 0)} slot(s) remaining this week.</p>
                    <textarea
                      className="mb-2 w-full rounded-md border bg-background p-2 text-sm"
                      rows={3}
                      placeholder="e.g. Which hot tub has the lowest maintenance cost?"
                      value={newPrompt.prompt}
                      onChange={e => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                    />
                    <input
                      className="mb-2 w-full rounded-md border bg-background p-2 text-sm"
                      placeholder="Product / Service"
                      value={newPrompt.product_service}
                      onChange={e => setNewPrompt({ ...newPrompt, product_service: e.target.value })}
                    />
                    <input
                      className="mb-2 w-full rounded-md border bg-background p-2 text-sm"
                      placeholder="Ideal customer profile"
                      value={newPrompt.icp}
                      onChange={e => setNewPrompt({ ...newPrompt, icp: e.target.value })}
                    />
                    <select
                      className="mb-4 w-full rounded-md border bg-background p-2 text-sm"
                      value={newPrompt.journey_phase}
                      onChange={e => setNewPrompt({ ...newPrompt, journey_phase: e.target.value })}
                    >
                      {["Awareness", "Consideration", "Decision"].map(j => <option key={j}>{j}</option>)}
                    </select>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowAddPrompt(false)} className="rounded-md border px-3 py-1.5 text-sm">Cancel</button>
                      <button onClick={addPrompt} className="rounded-md bg-[#FF5C35] px-3 py-1.5 text-sm font-semibold text-white">Save prompt</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {subtab === "Citations" && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-1 font-semibold">Citations — week of {week}</h2>
              <p className="mb-3 text-sm text-muted-foreground">Which domains AI engines cited most often when answering the tracked prompts this week.</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(data.citations ?? []).slice(0, 12)}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis dataKey="domain" fontSize={10} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="frequency" name="Citations" fill={HS.orange} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {subtab === "Recommendations" && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 font-semibold">Recommendations <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">auto-generated weekly</span></h2>
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <div className="flex md:flex-col gap-1 overflow-x-auto md:border-r md:pr-3">
                  <button
                    onClick={() => setRecFilter(null)}
                    className={`rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap ${!recFilter ? "bg-accent/10 font-semibold text-accent" : "text-muted-foreground"}`}
                  >
                    All <span className="float-right md:float-none md:ml-1">{data.recs?.length ?? 0}</span>
                  </button>
                  {recTypes.map(t => (
                    <button
                      key={t}
                      onClick={() => setRecFilter(t)}
                      className={`rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap ${recFilter === t ? "bg-accent/10 font-semibold text-accent" : "text-muted-foreground"}`}
                    >
                      {t} <span className="float-right md:float-none md:ml-1">{(data.recs ?? []).filter((r: any) => r.rec_type === t).length}</span>
                    </button>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2">Title</th><th>Type</th><th>Channel</th><th>Priority</th><th>Status</th>
                    </tr></thead>
                    <tbody>
                      {filteredRecs.map((r: any) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{r.title}</td>
                          <td>{r.rec_type}</td>
                          <td>{r.channel ?? "—"}</td>
                          <td><Pill tone={r.priority === "HIGH" ? "bad" : r.priority === "MED" ? "warn" : "neutral"}>{r.priority}</Pill></td>
                          <td>
                            <select
                              className="rounded border bg-background px-1 py-0.5 text-xs"
                              value={r.status}
                              onChange={async e => {
                                const { error } = await sb.from("aeo_recommendations").update({ status: e.target.value, updated_at: new Date().toISOString() }).eq("id", r.id);
                                if (error) toast.error(error.message);
                                else qc.invalidateQueries({ queryKey: ["aeo-data", brand.id] });
                              }}
                            >
                              {["New", "Not started", "In progress", "Completed"].map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                      {!filteredRecs.length && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No recommendations yet — run a scan.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {subtab === "Reddit Visibility" && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-1 flex items-center gap-2 font-semibold">
                Reddit Visibility <span className="rounded bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">feeds weekly dealer email</span>
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">Threads AI engines cite or that rank for category questions. Stored weekly — the same data is pushed to the HubSpot landing page and archived as a PDF.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Thread</th><th>Subreddit</th><th>▲ / 💬</th><th>Brand</th><th>Sentiment</th><th>Opportunity</th><th>Posted</th>
                  </tr></thead>
                  <tbody>
                    {(data.reddit ?? []).map((t: any) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="py-2"><a href={t.thread_url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{t.title}</a></td>
                        <td>{t.subreddit}</td>
                        <td>{t.upvotes} / {t.num_comments}</td>
                        <td>{t.brand_mentioned ? <Pill tone="good">Yes</Pill> : "No"}</td>
                        <td>{t.sentiment ? <Pill tone={t.sentiment === "Positive" ? "good" : t.sentiment === "Negative" ? "bad" : "neutral"}>{t.sentiment}</Pill> : "—"}</td>
                        <td>{t.opportunity ? <Pill tone={t.opportunity.startsWith("HIGH") ? "bad" : "warn"}>{t.opportunity}</Pill> : "—"}</td>
                        <td>{t.posted_at ? new Date(t.posted_at).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                    {!data.reddit?.length && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No Reddit threads captured this week.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
