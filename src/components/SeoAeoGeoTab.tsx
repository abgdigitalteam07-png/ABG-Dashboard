import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Brand } from "@/lib/brands";
import { supabase } from "@/integrations/supabase/client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { toast } from "sonner";
import "./SeoAeoGeoTab.css";

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
  return <span className="aeo-datechip">{children}</span>;
}

function EmptyChart({ reason }: { reason: string }) {
  return (
    <div className="aeo-empty">
      <span className="aeo-empty-title">No data yet</span>
      <span className="aeo-empty-reason">{reason}</span>
    </div>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral" | "acc"; children: React.ReactNode }) {
  return <span className={`aeo-pill ${tone}`}>{children}</span>;
}

// Admin-facing working-status sign: green = live with real data, red = not
// producing data yet (hover shows exactly what's needed to turn it green).
function Sign({ ok, why }: { ok: boolean; why: string }) {
  return (
    <span className={`aeo-sign ${ok ? "ok" : "off"}`} title={why}>
      <i /> {ok ? "WORKING" : "NOT ACTIVE"}
    </span>
  );
}

// Tile/table header row: label on the left, optional date chip, status sign on the right.
function TileHead({ label, chip, sign }: { label: string; chip?: string; sign: { ok: boolean; why: string } }) {
  return (
    <div className="aeo-tilehead">
      <span className="aeo-k">{label}</span>
      {chip && <span className="aeo-datechip">{chip}</span>}
      <span style={{ flex: 1 }} />
      <Sign ok={sign.ok} why={sign.why} />
    </div>
  );
}

function Gauge({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const angle = (clamped / 100) * 180;
  const rad = (Math.PI / 180) * angle;
  const x = 120 - 90 * Math.cos(rad);
  const y = 120 - 90 * Math.sin(rad);
  const largeArc = angle > 180 ? 1 : 0;
  return (
    <svg viewBox="0 0 240 140" width="200" aria-label={`Brand visibility gauge ${pct}%`}>
      <path d="M30 120 A90 90 0 0 1 210 120" fill="none" stroke="var(--aeo-line)" strokeWidth="16" strokeLinecap="round" />
      <path d={`M30 120 A90 90 0 ${largeArc} 1 ${x} ${y}`} fill="none" stroke="var(--aeo-accent)" strokeWidth="16" strokeLinecap="round" />
      <text x="120" y="100" textAnchor="middle" fontSize="34" fontWeight="750" fill="var(--aeo-ink)">{pct}%</text>
      <text x="120" y="122" textAnchor="middle" fontSize="12" fill="var(--aeo-muted)">Brand Visibility</text>
    </svg>
  );
}

interface Props { brand: Brand; }

export const SeoAeoGeoTab = ({ brand }: Props) => {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>("Dashboard");
  const [scanning, setScanning] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPrompt, setNewPrompt] = useState({ prompt: "", product_service: "", icp: "", journey_phase: "Consideration" });
  const [recFilter, setRecFilter] = useState<string | null>(null);
  const [recStatusFilter, setRecStatusFilter] = useState<string | null>(null);
  const [recSearch, setRecSearch] = useState("");
  const [selectedRecIds, setSelectedRecIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("In progress");
  const [promptSearch, setPromptSearch] = useState("");
  const [metricsSubtab, setMetricsSubtab] = useState<"visibility" | "sentiment">("visibility");
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
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

  // Latest scan attempt of ANY status — drives the scan-pipeline health sign.
  const { data: lastAttempt } = useQuery({
    queryKey: ["aeo-last-attempt", brand.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("aeo_scan_log")
        .select("status, error, started_at")
        .eq("brand_id", brand.id)
        .order("started_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as { status: string; error: string | null; started_at: string } | null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["aeo-data", brand.id, week],
    enabled: !!week,
    queryFn: async () => {
      const [scores, visibility, citations, allCitations, recs, reddit, prompts, promptResults] = await Promise.all([
        sb.from("seo_audit_scores").select("*").eq("brand_id", brand.id).order("week_of"),
        sb.from("aeo_visibility_snapshots").select("*").eq("brand_id", brand.id).order("week_of"),
        sb.from("aeo_citations").select("*").eq("brand_id", brand.id).eq("week_of", week).order("frequency", { ascending: false }),
        // All weeks (not just the selected one) — needed for the citation-rate-over-time trend charts.
        sb.from("aeo_citations").select("week_of, domain, frequency, brand_mentioned").eq("brand_id", brand.id).order("week_of"),
        sb.from("aeo_recommendations").select("*").eq("brand_id", brand.id).order("created_at", { ascending: false }),
        sb.from("reddit_threads").select("*").eq("brand_id", brand.id).eq("week_of", week).order("upvotes", { ascending: false }),
        sb.from("aeo_prompts").select("*").eq("brand_id", brand.id).eq("is_active", true).order("created_at"),
        sb.from("aeo_prompt_results").select("*").eq("brand_id", brand.id).eq("week_of", week),
      ]);
      const firstError = [scores, visibility, citations, allCitations, recs, reddit, prompts, promptResults].find(r => r.error);
      if (firstError?.error) throw firstError.error;
      return {
        scores: scores.data, visibility: visibility.data, citations: citations.data, allCitations: allCitations.data,
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

  // Fills remaining prompt slots via Claude without running the full scan.
  const generateWithAI = async () => {
    setGeneratingPrompts(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("aeo-scan", {
        body: { brandId: brand.id, brandName: brand.name, siteUrl: brand.gscSiteUrl ?? `https://${brand.id.replace(/-/g, "")}.com/`, promptsOnly: true },
      });
      if (error || res?.error) throw new Error(res?.error ?? error?.message);
      toast.success(`Generated ${res.added} new prompt(s).`);
      qc.invalidateQueries({ queryKey: ["aeo-data", brand.id] });
    } catch (e) {
      toast.error(`Generate failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGeneratingPrompts(false);
    }
  };

  const toggleRecSelected = (id: string) => {
    setSelectedRecIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const applyBulkStatus = async () => {
    if (!selectedRecIds.size) return;
    const { error } = await sb.from("aeo_recommendations")
      .update({ status: bulkStatus, updated_at: new Date().toISOString() })
      .in("id", [...selectedRecIds]);
    if (error) { toast.error(error.message); return; }
    toast.success(`Updated ${selectedRecIds.size} recommendation(s) to "${bulkStatus}".`);
    setSelectedRecIds(new Set());
    qc.invalidateQueries({ queryKey: ["aeo-data", brand.id] });
  };

  const latestScore = data?.scores?.at(-1);
  const prevScore = data?.scores?.at(-2);
  const ownVisibility = data?.visibility?.filter((v: any) => v.is_own_brand) ?? [];
  const currentVis = ownVisibility.find((v: any) => v.week_of === week)?.visibility_pct ?? 0;
  const prevVis = ownVisibility.at(-2)?.visibility_pct;

  const recTypes = [...new Set((data?.recs ?? []).map((r: any) => r.rec_type))] as string[];
  const filteredRecs = (data?.recs ?? [])
    .filter((r: any) => !recFilter || r.rec_type === recFilter)
    .filter((r: any) => !recStatusFilter || r.status === recStatusFilter)
    .filter((r: any) => !recSearch || r.title.toLowerCase().includes(recSearch.toLowerCase()));

  const recStatusCounts = {
    New: (data?.recs ?? []).filter((r: any) => r.status === "New").length,
    "In progress": (data?.recs ?? []).filter((r: any) => r.status === "In progress").length,
    Completed: (data?.recs ?? []).filter((r: any) => r.status === "Completed").length,
  };

  const filteredPrompts = (data?.prompts ?? []).filter((p: any) =>
    !promptSearch || p.prompt.toLowerCase().includes(promptSearch.toLowerCase()));

  // Share of voice: how often each competitor is mentioned vs. the brand itself, derived
  // from what was already captured during the scan (aeo_prompt_results.competitors_mentioned)
  // — no new API calls needed, this is a real aggregation of stored data.
  const shareOfVoice = (() => {
    const counts = new Map<string, number>();
    let brandMentions = 0;
    for (const r of data?.promptResults ?? []) {
      if (r.brand_mentioned) brandMentions++;
      for (const c of r.competitors_mentioned ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const rows = [...counts.entries()].map(([company, mentions]) => ({ company, mentions }));
    rows.push({ company: brand.name, mentions: brandMentions });
    const total = rows.reduce((s, r) => s + r.mentions, 0) || 1;
    return rows
      .map(r => ({ ...r, pct: Math.round((r.mentions / total) * 1000) / 10 }))
      .sort((a, b) => b.mentions - a.mentions);
  })();

  const redditStats = {
    tracked: data?.reddit?.length ?? 0,
    mentioned: (data?.reddit ?? []).filter((t: any) => t.brand_mentioned).length,
    cited: (data?.reddit ?? []).filter((t: any) => (t.cited_by_ai_count ?? 0) > 0).length,
    highOpportunity: (data?.reddit ?? []).filter((t: any) => (t.opportunity ?? "").startsWith("HIGH")).length,
  };

  // Real prompt-coverage numbers (replaces the prototype's fabricated "blind spots"
  // banner, which depended on an ICP/product-tracking concept that was never real).
  const activePrompts = data?.prompts?.length ?? 0;
  const distinctICPs = new Set((data?.prompts ?? []).map((p: any) => p.icp).filter(Boolean)).size;
  const distinctProducts = new Set((data?.prompts ?? []).map((p: any) => p.product_service).filter(Boolean)).size;
  const distinctPhases = new Set((data?.prompts ?? []).map((p: any) => p.journey_phase).filter(Boolean)).size;

  // Citation composition by content type / channel — schema supports this
  // (aeo_citations.content_type / .channel_type) but the scan doesn't classify
  // citations yet, so these will render empty until that's added.
  const byContentType = (() => {
    const counts = new Map<string, number>();
    for (const c of data?.citations ?? []) if (c.content_type) counts.set(c.content_type, (counts.get(c.content_type) ?? 0) + c.frequency);
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  })();
  const byChannelType = (() => {
    const counts = new Map<string, number>();
    for (const c of data?.citations ?? []) if (c.channel_type) counts.set(c.channel_type, (counts.get(c.channel_type) ?? 0) + c.frequency);
    return [...counts.entries()].map(([name, value]) => ({ name, value }));
  })();

  // Top URLs — schema-ready (aeo_citations.url), but the scan currently only
  // persists domain-level aggregate rows, never per-URL rows.
  const topUrls = (data?.citations ?? []).filter((c: any) => c.url);

  // Citation performance vs. competitors — real, computed per week from allCitations:
  // owned-domain rate = % of that week's citation frequency pointing at the brand's own
  // domain; brand-mention rate = % of citation frequency flagged brand_mentioned.
  // (We don't have competitor-domain identity, so this tracks the brand only —
  // no fabricated competitor lines.)
  const ownDomain = (() => {
    try { return new URL(brand.gscSiteUrl ?? "").hostname.replace(/^www\./, ""); } catch { return null; }
  })();
  const citationRateSeries = (() => {
    const byWeek = new Map<string, { total: number; owned: number; mentioned: number }>();
    for (const c of data?.allCitations ?? []) {
      const row = byWeek.get(c.week_of) ?? { total: 0, owned: 0, mentioned: 0 };
      row.total += c.frequency;
      if (ownDomain && c.domain?.replace(/^www\./, "") === ownDomain) row.owned += c.frequency;
      if (c.brand_mentioned) row.mentioned += c.frequency;
      byWeek.set(c.week_of, row);
    }
    return [...byWeek.entries()].map(([week_of, r]) => ({
      week_of,
      owned_pct: r.total ? Math.round((r.owned / r.total) * 1000) / 10 : 0,
      mention_pct: r.total ? Math.round((r.mentioned / r.total) * 1000) / 10 : 0,
    })).sort((a, b) => a.week_of.localeCompare(b.week_of));
  })();

  // Competitor visibility over time — schema-ready (aeo_visibility_snapshots has a
  // company + week_of column for any brand), but the scan only ever writes a row
  // for the brand itself, never competitors, so only one line will ever plot today.
  const competitorSeries = [...new Set((data?.visibility ?? []).map((v: any) => v.company))];
  const competitorColors = [HS.teal, HS.orange, HS.purple, HS.mint];

  const topRecs = [...(data?.recs ?? [])].sort((a: any, b: any) => {
    const rank = { HIGH: 0, MED: 1, LOW: 2 } as Record<string, number>;
    return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3);
  }).slice(0, 3);

  // One place that decides every report's green/red sign. Green = real data is
  // present and flowing; red = pipeline gap, with the exact fix in the tooltip.
  const scanFailing = lastAttempt?.status === "failed";
  const signs = {
    scan: {
      ok: !scanFailing,
      why: scanFailing
        ? `Last scan failed: ${(lastAttempt?.error ?? "unknown error").slice(0, 140)}`
        : "Scan pipeline healthy — last run completed.",
    },
    coverage: {
      ok: activePrompts > 0,
      why: activePrompts > 0 ? "Computed live from tracked prompts." : "Run a first scan — it auto-generates 10 prompts for this brand.",
    },
    audit: {
      ok: latestScore != null,
      why: latestScore != null ? "Real audit scores from the site crawl." : "Needs one successful scan (currently blocked: Anthropic API credits).",
    },
    brandMetrics: {
      ok: ownVisibility.length > 0,
      why: ownVisibility.length > 0 ? "Real visibility snapshots from prompt runs." : "Needs one successful scan to write the first visibility snapshot.",
    },
    shareOfVoice: {
      ok: shareOfVoice.some(r => r.mentions > 0),
      why: shareOfVoice.some(r => r.mentions > 0) ? "Real competitor mentions captured from this week's prompt answers." : "Needs prompt results with competitor mentions — run a scan.",
    },
    competitorTrend: {
      ok: competitorSeries.length > 1,
      why: competitorSeries.length > 1 ? "Tracking multiple companies over time." : "Scan doesn't write competitor visibility snapshots yet — needs a scan-code addition (store per-competitor visibility rows each week).",
    },
    topDomains: {
      ok: (data?.citations?.length ?? 0) > 0,
      why: (data?.citations?.length ?? 0) > 0 ? "Real cited domains captured from prompt answers." : "Needs one successful scan to capture citations.",
    },
    composition: {
      ok: byContentType.length > 0 || byChannelType.length > 0,
      why: byContentType.length > 0 ? "Citations classified by type/channel." : "Scan doesn't classify citations by content type or channel yet — needs one extra classification step in the scan.",
    },
    prompts: {
      ok: activePrompts > 0,
      why: activePrompts > 0 ? "Prompts stored and editable; used by every scan." : "Run a first scan to auto-generate prompts, or add one manually.",
    },
    recs: {
      ok: (data?.recs?.length ?? 0) > 0,
      why: (data?.recs?.length ?? 0) > 0 ? "Real recommendations generated from scan findings; statuses editable." : "Needs one successful scan to generate recommendations.",
    },
    topUrls: {
      ok: topUrls.length > 0,
      why: topUrls.length > 0 ? "Per-URL citations captured." : "Scan stores citations at domain level only — needs a small scan-code addition to persist per-URL rows.",
    },
    reddit: {
      ok: (data?.reddit?.length ?? 0) > 0,
      why: (data?.reddit?.length ?? 0) > 0 ? "Real Reddit threads (via Apify, scan-time only) — also feeds the HubSpot page + PDF." : "Needs one successful scan to fetch Reddit threads via Apify.",
    },
    citationRate: {
      ok: citationRateSeries.length > 0,
      why: citationRateSeries.length > 0 ? "Computed live from citations captured across scans." : "Needs one successful scan to capture citations.",
    },
    sentiment: {
      ok: false,
      why: "Not built yet — the scan doesn't rate sentiment of brand mentions in AI answers (only Reddit threads have sentiment today). Needs a classification step added to the prompt-answer scan step.",
    },
  };

  const trend = (curr?: number, prev?: number) => {
    if (curr == null || prev == null) return null;
    const d = Math.round((curr - prev) * 10) / 10;
    if (d === 0) return <span className="aeo-trend-flat">— flat</span>;
    return <span className={d > 0 ? "aeo-trend-up" : "aeo-trend-down"}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span>;
  };

  return (
    <div className="aeo-tab" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div className="aeo-header">
        <span className="aeo-beta">BETA · ADMIN ONLY</span>
        <Sign ok={signs.scan.ok} why={signs.scan.why} />
        <span className="aeo-lastscan">
          Last scanned: <b>{lastScan ? new Date(lastScan).toLocaleString() : "never"}</b>
        </span>
        {weeks && weeks.length > 0 && (
          <select
            className="aeo-select"
            value={week ?? ""}
            onChange={e => setSelectedWeek(e.target.value)}
          >
            {[...new Set(weeks.map(w => w.week_of))].map(w => (
              <option key={w} value={w}>Week of {w}</option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={runScan} disabled={scanning} className="aeo-btn">
          {scanning ? "Scanning… (audit + prompts + Reddit)" : "⟳ Scan now"}
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="aeo-subtabs">
        {SUBTABS.map(t => (
          <button key={t} onClick={() => setSubtab(t)} className={subtab === t ? "on" : ""}>
            {t}
          </button>
        ))}
      </div>

      {isLoading && <WaterFillLoader />}

      {!isLoading && !week && (
        <div className="aeo-section" style={{ textAlign: "center", color: "var(--aeo-muted)", padding: 40 }}>
          No scans yet for {brand.name}. Click <b>Scan now</b> to run the first SEO/AEO/GEO scan.
        </div>
      )}

      {!isLoading && week && data && (
        <>
          {subtab === "Dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="aeo-banner" style={{ background: "var(--aeo-card)" }}>
                <div>
                  <div className="aeo-tile-k" style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>Prompt coverage</div>
                  <div style={{ fontSize: 14 }}>
                    Tracking <b>{activePrompts}/{MAX_PROMPTS}</b> prompts across <b>{distinctProducts || 1}</b> product line(s), <b>{distinctICPs || 1}</b> ICP(s), <b>{distinctPhases || 1}</b> journey phase(s).
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <div className="aeo-meter"><i style={{ width: `${(activePrompts / MAX_PROMPTS) * 100}%` }} /></div>
                <Sign ok={signs.coverage.ok} why={signs.coverage.why} />
              </div>

              <div className="aeo-section">
                <h2>Weekly Audit Scores <Pill tone="acc">from site crawl</Pill> <Sign ok={signs.audit.ok} why={signs.audit.why} /></h2>
                <p className="aeo-sub">SEO / GEO / AEO rubric scores for {brand.name} — re-scored on every scan.</p>
                <div className="aeo-grid3">
                  {([
                    ["seo", "SEO — Traditional Search", latestScore?.seo_score, prevScore?.seo_score],
                    ["geo", "GEO — Generative Engines", latestScore?.geo_score, prevScore?.geo_score],
                    ["aeo", "AEO — Answer Engines", latestScore?.aeo_score, prevScore?.aeo_score],
                  ] as const).map(([key, label, score, prev]) => {
                    const findings: string[] = latestScore?.findings?.[key] ?? [];
                    return (
                      <div key={label} className="aeo-tile">
                        <div className="aeo-k">{label}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span className="aeo-v">{score ?? "—"}<span style={{ fontSize: 15, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></span>
                          {trend(score, prev)}
                        </div>
                        <div className="aeo-scorebar"><i style={{ width: `${(Number(score) || 0) * 10}%`, background: scoreColor(score) }} /></div>
                        <p className="aeo-sub" style={{ margin: "8px 0 0" }}>
                          {findings.length ? findings.slice(0, 2).join(" ") : "No findings yet — populated after the next scan."}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="aeo-section">
                <h2>Brand Metrics</h2>
                <p className="aeo-sub">How often {brand.name} appears in AI-generated answers. Weekly snapshots — not tied to the dashboard date filter.</p>
                <div className="aeo-subtabs" style={{ marginBottom: 12 }}>
                  <button onClick={() => setMetricsSubtab("visibility")} className={metricsSubtab === "visibility" ? "on" : ""}>Brand visibility</button>
                  <button onClick={() => setMetricsSubtab("sentiment")} className={metricsSubtab === "sentiment" ? "on" : ""}>Sentiment analysis</button>
                </div>
                {metricsSubtab === "visibility" ? (
                  <div className="aeo-grid2">
                    <div className="aeo-tile aeo-gauge-wrap">
                      <TileHead label="Brand visibility" chip={`WEEK OF ${week}`} sign={signs.brandMetrics} />
                      <Gauge pct={currentVis} />
                      <div>{trend(currentVis, prevVis)}</div>
                    </div>
                    <div className="aeo-tile">
                      <TileHead label="Visibility over time" chip="BY ENGINE" sign={signs.brandMetrics} />
                      <ResponsiveContainer width="100%" height={170}>
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
                ) : (
                  <div className="aeo-tile">
                    <TileHead label="Sentiment analysis" sign={signs.sentiment} />
                    <EmptyChart reason={signs.sentiment.why} />
                  </div>
                )}
              </div>

              <div className="aeo-section">
                <h2>Competitor Landscape</h2>
                <p className="aeo-sub">See how you track compared to your top competitors.</p>
                <div className="aeo-grid2">
                  <div>
                    <TileHead label="Share of voice" chip={`WEEK OF ${week}`} sign={signs.shareOfVoice} />
                    <div className="aeo-tscroll">
                    <table>
                      <thead><tr><th>Company</th><th style={{ textAlign: "right" }}>Mentions</th><th style={{ textAlign: "right" }}>Share of voice</th></tr></thead>
                      <tbody>
                        {shareOfVoice.map(row => (
                          <tr key={row.company} style={row.company === brand.name ? { fontWeight: 700 } : undefined}>
                            <td>{row.company}{row.company === brand.name && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 400, color: "var(--aeo-muted)" }}>(you)</span>}</td>
                            <td style={{ textAlign: "right" }}>{row.mentions}</td>
                            <td style={{ textAlign: "right" }}>{row.pct}%</td>
                          </tr>
                        ))}
                        {!shareOfVoice.some(r => r.mentions > 0) && (
                          <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No mentions captured this week.</td></tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                  <div>
                    <TileHead label="Visibility over time" sign={signs.competitorTrend} />
                    {competitorSeries.length > 1 ? (
                      <>
                        <div className="aeo-legend">
                          {competitorSeries.map((c, i) => <span key={c}><i style={{ background: competitorColors[i % 4] }} />{c}</span>)}
                        </div>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={data?.visibility ?? []}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                            <XAxis dataKey="week_of" fontSize={11} />
                            <YAxis fontSize={11} unit="%" />
                            <Tooltip />
                            {competitorSeries.map((c, i) => (
                              <Line key={c} type="monotone" dataKey="visibility_pct" data={(data?.visibility ?? []).filter((v: any) => v.company === c)} name={c} stroke={competitorColors[i % 4]} strokeWidth={2} />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    ) : (
                      <EmptyChart reason="The scan only tracks your own brand's visibility today — competitor visibility snapshots aren't captured yet." />
                    )}
                  </div>
                </div>
              </div>

              <div className="aeo-section">
                <h2>Citation analysis</h2>
                <p className="aeo-sub">The websites AI engines reference when generating answers. Tracking which sites get cited most, and whether your brand is mentioned in them, is key to understanding and improving your visibility.</p>
                <TileHead label="Top domains" chip={`WEEK OF ${week}`} sign={signs.topDomains} />
                <div className="aeo-tscroll" style={{ marginBottom: 20 }}>
                  <table>
                    <thead><tr><th>Domain</th><th style={{ textAlign: "right" }}>Frequency</th><th>Brand mentioned</th></tr></thead>
                    <tbody>
                      {(data.citations ?? []).slice(0, 10).map((c: any) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: 600 }}><a href={`https://${c.domain}`} target="_blank" rel="noreferrer">{c.domain}</a></td>
                          <td style={{ textAlign: "right" }}>{c.frequency}</td>
                          <td>{c.brand_mentioned ? <Pill tone="good">Yes</Pill> : "No"}</td>
                        </tr>
                      ))}
                      {!data.citations?.length && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No citations captured this week.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <TileHead label="Top URLs" chip={`WEEK OF ${week}`} sign={signs.topUrls} />
                {topUrls.length ? (
                  <div className="aeo-tscroll">
                    <table>
                      <thead><tr><th>URL</th><th style={{ textAlign: "right" }}>Frequency</th><th>Brand mentioned</th></tr></thead>
                      <tbody>
                        {topUrls.map((c: any) => (
                          <tr key={c.id}>
                            <td><a href={c.url} target="_blank" rel="noreferrer">{c.url}</a></td>
                            <td style={{ textAlign: "right" }}>{c.frequency}</td>
                            <td>{c.brand_mentioned ? <Pill tone="good">Yes</Pill> : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyChart reason={signs.topUrls.why} />
                )}
              </div>
            </div>
          )}

          {subtab === "Prompts" && (
            <div className="aeo-section">
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                <h2>Tracked Prompts <span className="aeo-pill neutral">{data.prompts?.length ?? 0} / {MAX_PROMPTS} used</span> <Sign ok={signs.prompts.ok} why={signs.prompts.why} /></h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={generateWithAI}
                    disabled={generatingPrompts || (data.prompts?.length ?? 0) >= MAX_PROMPTS}
                    className="aeo-btn"
                    style={{ padding: "6px 14px", fontSize: 13, background: "var(--aeo-card)", color: "var(--aeo-ink)", border: "1px solid var(--aeo-line)" }}
                  >
                    {generatingPrompts ? "Generating…" : "✦ Generate with AI"}
                  </button>
                  <button
                    onClick={() => setShowAddPrompt(true)}
                    disabled={(data.prompts?.length ?? 0) >= MAX_PROMPTS}
                    className="aeo-btn"
                    style={{ padding: "6px 14px", fontSize: 13 }}
                  >
                    ＋ Add prompt
                  </button>
                </div>
              </div>
              <p className="aeo-sub">Questions we ask each AI engine weekly. Capped at {MAX_PROMPTS} per brand to stay inside API free limits.</p>
              <input
                className="aeo-searchbox"
                style={{ maxWidth: 280, marginBottom: 12 }}
                placeholder="Search prompts"
                value={promptSearch}
                onChange={e => setPromptSearch(e.target.value)}
              />
              <div className="aeo-tscroll">
                <table>
                  <thead><tr><th>Prompt</th><th>Visibility</th><th>Group</th><th>Product</th><th>ICP</th><th>Journey phase</th><th>Location</th><th></th></tr></thead>
                  <tbody>
                    {filteredPrompts.map((p: any) => {
                      const r = data.promptResults?.find((x: any) => x.prompt_id === p.id);
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.prompt}</td>
                          <td>{r ? (r.brand_mentioned ? <Pill tone="good">Mentioned</Pill> : <Pill tone="bad">0%</Pill>) : <span style={{ color: "var(--aeo-muted)" }}>—</span>}</td>
                          <td>{p.prompt_group ?? "—"}</td>
                          <td>{p.product_service ?? "—"}</td>
                          <td>{p.icp ?? "—"}</td>
                          <td>{p.journey_phase ?? "—"}</td>
                          <td>{p.location ?? "—"}</td>
                          <td><button onClick={() => deactivatePrompt(p.id)} style={{ fontSize: 12, color: "var(--aeo-muted)", background: "none", border: 0 }}>Remove</button></td>
                        </tr>
                      );
                    })}
                    {!filteredPrompts.length && (
                      <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>
                        {data.prompts?.length ? "No prompts match your search." : 'No prompts yet — click "Add prompt" / "Generate with AI", or run a scan (auto-generates 10 on first run).'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {showAddPrompt && (
                <div className="aeo-modal" onClick={() => setShowAddPrompt(false)}>
                  <div className="aeo-box" onClick={e => e.stopPropagation()}>
                    <h3 style={{ margin: "0 0 4px", fontWeight: 700 }}>Add a tracked prompt</h3>
                    <p className="aeo-sub">{MAX_PROMPTS - (data.prompts?.length ?? 0)} slot(s) remaining this week.</p>
                    <textarea
                      rows={3}
                      placeholder="e.g. Which hot tub has the lowest maintenance cost?"
                      value={newPrompt.prompt}
                      onChange={e => setNewPrompt({ ...newPrompt, prompt: e.target.value })}
                    />
                    <input
                      placeholder="Product / Service"
                      value={newPrompt.product_service}
                      onChange={e => setNewPrompt({ ...newPrompt, product_service: e.target.value })}
                    />
                    <input
                      placeholder="Ideal customer profile"
                      value={newPrompt.icp}
                      onChange={e => setNewPrompt({ ...newPrompt, icp: e.target.value })}
                    />
                    <select
                      value={newPrompt.journey_phase}
                      onChange={e => setNewPrompt({ ...newPrompt, journey_phase: e.target.value })}
                    >
                      {["Awareness", "Consideration", "Decision"].map(j => <option key={j}>{j}</option>)}
                    </select>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                      <button onClick={() => setShowAddPrompt(false)} style={{ border: "1px solid var(--aeo-line)", borderRadius: 8, padding: "7px 14px", background: "var(--aeo-card)", color: "var(--aeo-ink)" }}>Cancel</button>
                      <button onClick={addPrompt} className="aeo-btn">Save prompt</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {subtab === "Citations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="aeo-section">
                <h2>Top recommendations this week <Sign ok={signs.recs.ok} why={signs.recs.why} /></h2>
                <div className="aeo-grid3">
                  {topRecs.map((r: any) => (
                    <div key={r.id} className="aeo-reccard">
                      <span className="aeo-cat">{r.rec_type}</span>
                      <span className="aeo-hi" style={{ float: "right" }}><Pill tone={r.priority === "HIGH" ? "bad" : r.priority === "MED" ? "warn" : "neutral"}>{r.priority}</Pill></span>
                      <b>{r.title}</b>
                    </div>
                  ))}
                  {!topRecs.length && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No recommendations yet — run a scan.</div>}
                </div>
              </div>

              <div className="aeo-section">
                <h2>Citation performance vs. competitors</h2>
                <p className="aeo-sub">How much of the week's citation activity points at your own domain, and how often your brand is mentioned in the citing content. (Named-competitor domain tracking isn't captured yet — this tracks your brand only, no fabricated competitor lines.)</p>
                <div className="aeo-grid2">
                  <div>
                    <TileHead label="Owned domain citation rate" chip="ALL WEEKS SCANNED" sign={signs.citationRate} />
                    {citationRateSeries.length ? (
                      <ResponsiveContainer width="100%" height={170}>
                        <LineChart data={citationRateSeries}>
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                          <XAxis dataKey="week_of" fontSize={11} />
                          <YAxis fontSize={11} unit="%" />
                          <Tooltip />
                          <Line type="monotone" dataKey="owned_pct" name={ownDomain ?? brand.name} stroke={HS.teal} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : <EmptyChart reason={signs.citationRate.why} />}
                  </div>
                  <div>
                    <TileHead label="Citations with brand mention rate" chip="ALL WEEKS SCANNED" sign={signs.citationRate} />
                    {citationRateSeries.length ? (
                      <ResponsiveContainer width="100%" height={170}>
                        <LineChart data={citationRateSeries}>
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                          <XAxis dataKey="week_of" fontSize={11} />
                          <YAxis fontSize={11} unit="%" />
                          <Tooltip />
                          <Line type="monotone" dataKey="mention_pct" name={brand.name} stroke={HS.orange} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : <EmptyChart reason={signs.citationRate.why} />}
                  </div>
                </div>
              </div>

              <div className="aeo-section">
                <h2>Citation Composition</h2>
                <p className="aeo-sub">Which content formats and channels shape the answers AI engines give.</p>
                <div className="aeo-grid2">
                  <div>
                    <TileHead label="By content type" sign={signs.composition} />
                    {byContentType.length ? (
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart data={byContentType}>
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                          <XAxis dataKey="name" fontSize={10} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="value" fill={HS.pink} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyChart reason="The scan doesn't classify citations by content type yet — this needs an extra classification step added to the scan." />}
                  </div>
                  <div>
                    <TileHead label="By channel" sign={signs.composition} />
                    {byChannelType.length ? (
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart data={byChannelType}>
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                          <XAxis dataKey="name" fontSize={10} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="value" fill={HS.sand} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyChart reason="The scan doesn't classify citations by channel (Owned/Earned/UGC/Competitor) yet — same fix as content type." />}
                  </div>
                </div>
              </div>

              <div className="aeo-section">
                <h2>Overview of top citations</h2>
                <p className="aeo-sub">Compare the content AI references most from your site versus the broader citation landscape.</p>
                <TileHead label="Top domains" chip={`WEEK OF ${week}`} sign={signs.topDomains} />
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={(data.citations ?? []).slice(0, 12)}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    <XAxis dataKey="domain" fontSize={10} interval={0} angle={-25} textAnchor="end" height={70} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="frequency" name="Citations" fill={HS.orange} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 20 }}>
                  <TileHead label="Top URLs" chip={`WEEK OF ${week}`} sign={signs.topUrls} />
                  {topUrls.length ? (
                    <div className="aeo-tscroll">
                      <table>
                        <thead><tr><th>URL</th><th style={{ textAlign: "right" }}>Frequency</th><th>Brand mentioned</th></tr></thead>
                        <tbody>
                          {topUrls.map((c: any) => (
                            <tr key={c.id}>
                              <td><a href={c.url} target="_blank" rel="noreferrer">{c.url}</a></td>
                              <td style={{ textAlign: "right" }}>{c.frequency}</td>
                              <td>{c.brand_mentioned ? <Pill tone="good">Yes</Pill> : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyChart reason={signs.topUrls.why} />
                  )}
                </div>
              </div>
            </div>
          )}

          {subtab === "Recommendations" && (
            <div className="aeo-section">
              <h2>Recommendations <Pill tone="acc">auto-generated weekly</Pill> <Sign ok={signs.recs.ok} why={signs.recs.why} /></h2>
              <div className="aeo-recwrap" style={{ marginTop: 12 }}>
                <div className="aeo-rail">
                  <button onClick={() => setRecFilter(null)} className={!recFilter ? "on" : ""}>
                    All <span className="aeo-cnt">{data.recs?.length ?? 0}</span>
                  </button>
                  {recTypes.map(t => (
                    <button key={t} onClick={() => setRecFilter(t)} className={recFilter === t ? "on" : ""}>
                      {t} <span className="aeo-cnt">{(data.recs ?? []).filter((r: any) => r.rec_type === t).length}</span>
                    </button>
                  ))}
                  <div style={{ borderTop: "1px solid var(--aeo-line)", margin: "8px 0" }} />
                  <button onClick={() => setRecStatusFilter(null)} className={!recStatusFilter ? "on" : ""}>
                    Any status
                  </button>
                  {(["New", "In progress", "Completed"] as const).map(s => (
                    <button key={s} onClick={() => setRecStatusFilter(s)} className={recStatusFilter === s ? "on" : ""}>
                      {s} <span className="aeo-cnt">{recStatusCounts[s]}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
                    <input
                      className="aeo-searchbox"
                      style={{ maxWidth: 280, margin: 0 }}
                      placeholder="Search recommendations"
                      value={recSearch}
                      onChange={e => setRecSearch(e.target.value)}
                    />
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12.5, color: "var(--aeo-muted)" }}>{selectedRecIds.size} selected</span>
                    <select className="aeo-status" value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
                      {["New", "In progress", "Completed"].map(s => <option key={s}>{s}</option>)}
                    </select>
                    <button onClick={applyBulkStatus} disabled={!selectedRecIds.size} className="aeo-btn" style={{ padding: "6px 12px", fontSize: 12.5 }}>
                      Change status
                    </button>
                  </div>
                  <div className="aeo-tscroll">
                    <table>
                      <thead><tr>
                        <th><input type="checkbox" checked={filteredRecs.length > 0 && filteredRecs.every((r: any) => selectedRecIds.has(r.id))} onChange={e => setSelectedRecIds(e.target.checked ? new Set(filteredRecs.map((r: any) => r.id)) : new Set())} /></th>
                        <th>Title</th><th>Type</th><th>Content type</th><th>Channel</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Created</th>
                      </tr></thead>
                      <tbody>
                        {filteredRecs.map((r: any) => (
                          <tr key={r.id}>
                            <td><input type="checkbox" checked={selectedRecIds.has(r.id)} onChange={() => toggleRecSelected(r.id)} /></td>
                            <td style={{ fontWeight: 600 }}>{r.title}</td>
                            <td>{r.rec_type}</td>
                            <td>{r.content_type ?? "—"}</td>
                            <td>{r.channel ?? "—"}</td>
                            <td><Pill tone={r.priority === "HIGH" ? "bad" : r.priority === "MED" ? "warn" : "neutral"}>{r.priority}</Pill></td>
                            <td>
                              <select
                                className="aeo-status"
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
                            <td style={{ color: "var(--aeo-muted)" }}>{r.assignee ?? "Unassigned"}</td>
                            <td style={{ color: "var(--aeo-muted)", whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {!filteredRecs.length && (
                          <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>
                            {data.recs?.length ? "No recommendations match your filters." : "No recommendations yet — run a scan."}
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {subtab === "Reddit Visibility" && (
            <div className="aeo-section">
              <h2>Reddit Visibility <Pill tone="acc">feeds weekly dealer email</Pill> <Sign ok={signs.reddit.ok} why={signs.reddit.why} /></h2>
              <p className="aeo-sub">Threads AI engines cite or that rank for category questions. Stored weekly — the same data is pushed to the HubSpot landing page and archived as a PDF.</p>
              <div className="aeo-grid3" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 16 }}>
                {([
                  ["Threads tracked", redditStats.tracked],
                  ["Brand mentioned", redditStats.mentioned],
                  ["Cited by AI", redditStats.cited],
                  ["High opportunity", redditStats.highOpportunity],
                ] as const).map(([label, val]) => (
                  <div key={label} className="aeo-tile">
                    <div className="aeo-k">{label}</div>
                    <div className="aeo-v" style={{ fontSize: 24 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div className="aeo-tscroll">
                <table>
                  <thead><tr><th>Thread</th><th>Subreddit</th><th>▲ / 💬</th><th>Brand</th><th>Competitors mentioned</th><th>Sentiment</th><th>Cited by AI</th><th>Opportunity</th><th>Posted</th></tr></thead>
                  <tbody>
                    {(data.reddit ?? []).map((t: any) => (
                      <tr key={t.id}>
                        <td><a href={t.thread_url} target="_blank" rel="noreferrer">{t.title}</a></td>
                        <td>{t.subreddit}</td>
                        <td>{t.upvotes} / {t.num_comments}</td>
                        <td>{t.brand_mentioned ? <Pill tone="good">Yes</Pill> : "No"}</td>
                        <td>{t.competitors_mentioned?.length ? t.competitors_mentioned.join(", ") : "—"}</td>
                        <td>{t.sentiment ? <Pill tone={t.sentiment === "Positive" ? "good" : t.sentiment === "Negative" ? "bad" : "neutral"}>{t.sentiment}</Pill> : "—"}</td>
                        <td>{t.cited_by_ai_count > 0 ? <Pill tone="good">Yes ×{t.cited_by_ai_count}</Pill> : <Pill tone="neutral">No</Pill>}</td>
                        <td>{t.opportunity ? <Pill tone={t.opportunity.startsWith("HIGH") ? "bad" : "warn"}>{t.opportunity}</Pill> : "—"}</td>
                        <td>{t.posted_at ? new Date(t.posted_at).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))}
                    {!data.reddit?.length && <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No Reddit threads captured this week.</td></tr>}
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
