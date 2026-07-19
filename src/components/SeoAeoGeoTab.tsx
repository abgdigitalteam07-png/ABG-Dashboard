import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brand } from "@/lib/brands";
import { supabase } from "@/integrations/supabase/client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import "./SeoAeoGeoTab.css";

// New aeo_* tables are not in the generated Database types yet — regenerate after
// the 20260717000000 migration is applied, then drop this cast.
const sb = supabase as any;

type ScanType = "full" | "quick";
type PageScope = "homepage" | "multi";

function mondayOfWeek(d = new Date()): string {
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const m = new Date(d);
  m.setUTCDate(d.getUTCDate() + diff);
  return m.toISOString().slice(0, 10);
}

// Same audit prompt the aeo-scan Edge Function sends to the API — used for the
// "Open in Claude" handoff so a manual run in the user's own claude.ai account
// asks for the exact same JSON shape our Import box expects.
function buildAuditPrompt(brand: Brand, pageScope: PageScope, siteUrl: string): string {
  const crawlScopeText = pageScope === "homepage"
    ? "Fetch only the homepage via web search"
    : "Fetch the homepage plus up to 6 high-signal pages (About/Team, Services, Case Studies, Blog, Contact, FAQ) via web search";
  return `You are an expert SEO/GEO/AEO auditor following a standard audit methodology. ${crawlScopeText} for ${siteUrl} (brand: ${brand.name}) — never flag something "missing" unless you actually checked for it across the pages you fetched.

Score each dimension 1-10 (1-3 critical issues, 4-5 below average, 6-7 decent foundation, 8-9 strong, 10 exemplary):
- SEO: Technical On-Page (title tags, meta descriptions, heading hierarchy, URL structure, canonical, robots meta, alt text, internal links, Open Graph), Content Quality (word count, keyword signals, freshness, readability), Structured Data (schema markup types, validity)
- GEO: E-E-A-T Assessment (author info, About page depth, contact info, trust signals, Organization schema), Content for AI Synthesis (factual density, clear claims, source citations, comprehensiveness, entity clarity, originality), Technical GEO (structured data depth, HTTPS, crawlability, social/brand-entity links)
- AEO: Featured Snippet Eligibility (direct-answer paragraphs, definition patterns, list/table content), Structured Answer Formats (FAQ schema, HowTo schema, question-phrased headings, Speakable schema), Voice Search Readiness (conversational language, long-tail question coverage, local/NAP signals)

Reply ONLY with this exact JSON shape (every signal array item is one row — Signal/Finding/Status, Status is exactly "Good", "Needs Attention", or "Missing"):
{"seo":n,"geo":n,"aeo":n,"pages_crawled":n,
"findings":{
 "executive_summary":"3-5 sentence summary — what's strong, most urgent issue, one key opportunity, specific to this site",
 "pages_audited":[{"url":"...","page_type":"Homepage|About|Services|Blog|...","notes":"..."}],
 "seo":{"technical_on_page":[{"signal":"...","finding":"...","status":"Good|Needs Attention|Missing"}],"content_quality":[...],"structured_data":[...]},
 "geo":{"eeat":[...],"content_ai_synthesis":[...],"technical_geo":[...]},
 "aeo":{"featured_snippet":[...],"structured_answer_formats":[...],"voice_search":[...]},
 "priority_recommendations":[{"priority":"Critical|High|Medium|Quick Win","issue":"...","dimension":"SEO|GEO|AEO","effort":"Low|Medium|High","impact":"Low|Medium|High"}],
 "whats_working":[{"item":"...","evidence":"..."}]
}}

Paste ONLY the JSON in your reply — no other text before or after it — so it can be copied straight back into the import box.`;
}

function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in pasted text");
  return JSON.parse(match[0]) as T;
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  return <span className={`aeo-pill ${tone}`}>{children}</span>;
}
function statusTone(status: string): "good" | "warn" | "bad" {
  if (status === "Good") return "good";
  if (status === "Missing") return "bad";
  return "warn";
}
function priorityTone(priority: string): "good" | "warn" | "bad" {
  if (priority === "Critical") return "bad";
  if (priority === "High") return "warn";
  if (priority === "Quick Win") return "good";
  return "warn";
}

function SignalTable({ rows, emptyReason }: { rows: Array<{ signal: string; finding: string; status: string }>; emptyReason: string }) {
  return (
    <div className="aeo-tscroll" style={{ marginBottom: 16 }}>
      <table>
        <thead><tr><th>Signal</th><th>Finding</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 600 }}>{r.signal}</td>
              <td>{r.finding}</td>
              <td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "14px 0" }}>{emptyReason}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

interface Props { brand: Brand; }

export const SeoAeoGeoTab = ({ brand }: Props) => {
  const [scanning, setScanning] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [scanType, setScanType] = useState<ScanType>("full");
  const [pageScope, setPageScope] = useState<PageScope>("multi");
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
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

  // Every past scan attempt (any status) — the "logged data" trail for this brand,
  // shown below the report so nothing about prior runs is lost.
  const { data: history } = useQuery({
    queryKey: ["aeo-history", brand.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from("aeo_scan_log")
        .select("*")
        .eq("brand_id", brand.id)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Array<{
        id: string; week_of: string; started_at: string; finished_at: string | null;
        status: string; scan_type: string; page_scope: string; api_calls_used: number; error: string | null;
      }>;
    },
  });

  const week = selectedWeek ?? weeks?.[0]?.week_of ?? null;
  const lastScan = weeks?.[0]?.started_at;

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
    queryKey: ["aeo-report", brand.id, week],
    enabled: !!week,
    queryFn: async () => {
      const [scoreRes, citationsRes, recsRes] = await Promise.all([
        sb.from("seo_audit_scores").select("*").eq("brand_id", brand.id).eq("week_of", week).maybeSingle(),
        sb.from("aeo_citations").select("*").eq("brand_id", brand.id).eq("week_of", week).order("frequency", { ascending: false }),
        sb.from("aeo_recommendations").select("*").eq("brand_id", brand.id).order("created_at", { ascending: false }),
      ]);
      if (scoreRes.error) throw scoreRes.error;
      if (citationsRes.error) throw citationsRes.error;
      if (recsRes.error) throw recsRes.error;
      return { score: scoreRes.data, citations: citationsRes.data ?? [], recs: recsRes.data ?? [] };
    },
  });

  const runScan = async () => {
    setShowDialog(false);
    setScanning(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("aeo-scan", {
        body: {
          brandId: brand.id,
          brandName: brand.name,
          siteUrl,
          landingPageId: brand.redditLandingPageId,
          scanType, pageScope,
        },
      });
      if (error || res?.error) throw new Error(res?.error ?? error?.message);

      toast.info(`${scanType === "full" ? "Full audit" : "Quick check"} started — this can take a few minutes.`);
      const deadline = Date.now() + 8 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 5000));
        const { data: log } = await sb.from("aeo_scan_log")
          .select("status, api_calls_used, error").eq("id", res.scanId).single();
        if (log?.status === "completed") {
          toast.success(`Scan complete — ${log.api_calls_used} API calls used`);
          qc.invalidateQueries({ queryKey: ["aeo-weeks", brand.id] });
          qc.invalidateQueries({ queryKey: ["aeo-report", brand.id] });
          qc.invalidateQueries({ queryKey: ["aeo-history", brand.id] });
          qc.invalidateQueries({ queryKey: ["aeo-last-attempt", brand.id] });
          return;
        }
        if (log?.status === "failed") throw new Error(log.error ?? "scan failed");
      }
      throw new Error("Scan timed out after 8 minutes — check aeo_scan_log.");
    } catch (e) {
      toast.error(`Scan failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setScanning(false);
      // Refresh even on failure/timeout so the Scan History table shows the failed attempt.
      qc.invalidateQueries({ queryKey: ["aeo-history", brand.id] });
      qc.invalidateQueries({ queryKey: ["aeo-last-attempt", brand.id] });
    }
  };

  const siteUrl = brand.gscSiteUrl ?? `https://${brand.id.replace(/-/g, "")}.com/`;

  // Free alternative to the paid API scan — opens the same audit prompt in the
  // user's own claude.ai session; they paste the resulting JSON back via Import.
  const openInClaude = () => {
    setShowDialog(false);
    const prompt = buildAuditPrompt(brand, pageScope, siteUrl);
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank", "noopener,noreferrer");
    toast.info("Opened in Claude — paste the JSON reply into the Import box below once it finishes.");
  };

  const importManualResult = async () => {
    setImporting(true);
    try {
      const parsed = extractJson<{ seo: number; geo: number; aeo: number; findings: unknown; pages_crawled?: number }>(pasteText);
      if (typeof parsed.seo !== "number" || typeof parsed.geo !== "number" || typeof parsed.aeo !== "number") {
        throw new Error("Pasted JSON is missing seo/geo/aeo scores — paste the full reply from Claude.");
      }
      const weekOf = mondayOfWeek();
      const nowIso = new Date().toISOString();
      const { error: scoreError } = await sb.from("seo_audit_scores").upsert({
        brand_id: brand.id, week_of: weekOf,
        seo_score: parsed.seo, geo_score: parsed.geo, aeo_score: parsed.aeo,
        findings: parsed.findings, pages_crawled: parsed.pages_crawled ?? 0,
      }, { onConflict: "brand_id,week_of" });
      if (scoreError) throw scoreError;

      const { error: logError } = await sb.from("aeo_scan_log").insert({
        brand_id: brand.id, week_of: weekOf, status: "completed",
        scan_type: "manual", page_scope: pageScope, api_calls_used: 0,
        started_at: nowIso, finished_at: nowIso,
      });
      if (logError) throw logError;

      toast.success("Manual report imported.");
      setPasteText("");
      qc.invalidateQueries({ queryKey: ["aeo-weeks", brand.id] });
      qc.invalidateQueries({ queryKey: ["aeo-report", brand.id] });
      qc.invalidateQueries({ queryKey: ["aeo-history", brand.id] });
      qc.invalidateQueries({ queryKey: ["aeo-last-attempt", brand.id] });
    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setImporting(false);
    }
  };

  const latestScore = data?.score;
  const auditFindings = (latestScore?.findings ?? {}) as {
    executive_summary?: string;
    pages_audited?: Array<{ url: string; page_type: string; notes: string }>;
    seo?: { technical_on_page?: any[]; content_quality?: any[]; structured_data?: any[] };
    geo?: { eeat?: any[]; content_ai_synthesis?: any[]; technical_geo?: any[] };
    aeo?: { featured_snippet?: any[]; structured_answer_formats?: any[]; voice_search?: any[] };
    priority_recommendations?: Array<{ priority: string; issue: string; dimension: string; effort: string; impact: string }>;
    whats_working?: Array<{ item: string; evidence: string }>;
  };

  const scanFailing = lastAttempt?.status === "failed";

  return (
    <div className="aeo-tab" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div className="aeo-header">
        <span className="aeo-beta">BETA · ADMIN ONLY</span>
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
        <button onClick={() => setShowDialog(true)} disabled={scanning} className="aeo-btn">
          {scanning ? "Scanning…" : "⟳ Run Scan"}
        </button>
      </div>

      {/* Pre-scan questions */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run SEO / AEO / GEO scan</DialogTitle>
            <DialogDescription>Choose what this scan should cover for {brand.name}.</DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>1. What type of scan?</p>
              <RadioGroup value={scanType} onValueChange={(v) => setScanType(v as ScanType)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <RadioGroupItem value="full" id="scan-full" />
                  <Label htmlFor="scan-full" style={{ fontWeight: 400 }}>
                    <div style={{ fontWeight: 600 }}>Full audit</div>
                    <div style={{ fontSize: 12.5, color: "var(--aeo-muted)" }}>SEO + GEO + AEO site audit, tracked prompts, Reddit visibility, and recommendations. Takes longer.</div>
                  </Label>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <RadioGroupItem value="quick" id="scan-quick" />
                  <Label htmlFor="scan-quick" style={{ fontWeight: 400 }}>
                    <div style={{ fontWeight: 600 }}>Quick check</div>
                    <div style={{ fontSize: 12.5, color: "var(--aeo-muted)" }}>Site audit only (SEO/GEO/AEO scores). Skips prompts, Reddit, and recommendations — finishes much faster.</div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>2. How much of the site should it check?</p>
              <RadioGroup value={pageScope} onValueChange={(v) => setPageScope(v as PageScope)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <RadioGroupItem value="multi" id="scope-multi" />
                  <Label htmlFor="scope-multi" style={{ fontWeight: 400 }}>
                    <div style={{ fontWeight: 600 }}>Homepage + key pages</div>
                    <div style={{ fontSize: 12.5, color: "var(--aeo-muted)" }}>Homepage plus up to 6 high-signal pages (About, Services, Blog, FAQ, etc.)</div>
                  </Label>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <RadioGroupItem value="homepage" id="scope-homepage" />
                  <Label htmlFor="scope-homepage" style={{ fontWeight: 400 }}>
                    <div style={{ fontWeight: 600 }}>Homepage only</div>
                    <div style={{ fontSize: 12.5, color: "var(--aeo-muted)" }}>Fastest — just the homepage.</div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter style={{ flexWrap: "wrap" }}>
            <button onClick={() => setShowDialog(false)} style={{ border: "1px solid var(--aeo-line)", borderRadius: 8, padding: "7px 14px", background: "var(--aeo-card)", color: "var(--aeo-ink)" }}>Cancel</button>
            <button
              onClick={openInClaude}
              title="Free — runs in your own claude.ai account, no API billing. Paste the result back via the Import box."
              style={{ border: "1px solid var(--aeo-line)", borderRadius: 8, padding: "7px 14px", background: "var(--aeo-card)", color: "var(--aeo-ink)" }}
            >
              Open in Claude (free)
            </button>
            <button onClick={runScan} className="aeo-btn">Start scan (uses API credits)</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {scanning && (
        <div className="aeo-section" style={{ textAlign: "center", padding: 24 }}>
          <WaterFillLoader />
          <p className="aeo-sub" style={{ marginTop: 8 }}>
            Running {scanType === "full" ? "full audit" : "quick check"} for {brand.name} — this runs the same live audit as the SEO/GEO/AEO skill, so it can take a few minutes.
          </p>
        </div>
      )}

      {!scanning && isLoading && <WaterFillLoader />}

      {!scanning && !isLoading && !week && (
        <div className="aeo-section" style={{ textAlign: "center", color: "var(--aeo-muted)", padding: 40 }}>
          No scans yet for {brand.name}. Click <b>Run Scan</b> to run the first SEO/AEO/GEO scan.
        </div>
      )}

      {!scanning && !isLoading && week && data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="aeo-section">
            <h2>Executive Summary</h2>
            <div style={{ background: "var(--aeo-accent-soft)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 13.5 }}>
                {auditFindings.executive_summary ?? "No audit run yet — click Run Scan to generate the executive summary for this site."}
              </p>
            </div>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>Dimension</th><th>Score</th><th>Status</th><th>Key takeaway</th></tr></thead>
                <tbody>
                  {([
                    ["SEO", latestScore?.seo_score],
                    ["GEO", latestScore?.geo_score],
                    ["AEO", latestScore?.aeo_score],
                  ] as const).map(([label, score]) => {
                    const n = Number(score) || 0;
                    const status = score == null ? "—" : n >= 8 ? "Strong" : n >= 6 ? "On Track" : "Needs Work";
                    return (
                      <tr key={label}>
                        <td style={{ fontWeight: 700 }}>{label}</td>
                        <td className="aeo-v" style={{ fontSize: 18 }}>{score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></td>
                        <td>{score != null && <Pill tone={n >= 8 ? "good" : n >= 6 ? "warn" : "bad"}>{status}</Pill>}</td>
                        <td style={{ color: "var(--aeo-muted)" }}>
                          {(auditFindings as any)[label.toLowerCase()]?.technical_on_page?.[0]?.finding
                            ?? (auditFindings as any)[label.toLowerCase()]?.eeat?.[0]?.finding
                            ?? (auditFindings as any)[label.toLowerCase()]?.featured_snippet?.[0]?.finding
                            ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 700 }}>
                    <td>Combined</td>
                    <td className="aeo-v" style={{ fontSize: 18 }}>
                      {latestScore ? Math.round(((latestScore.seo_score ?? 0) + (latestScore.geo_score ?? 0) + (latestScore.aeo_score ?? 0)) * 10) / 10 : "—"}
                      <span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/30</span>
                    </td>
                    <td></td><td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="aeo-section">
            <h2>Pages Audited</h2>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>URL</th><th>Page type</th><th>Notes</th></tr></thead>
                <tbody>
                  {(auditFindings.pages_audited ?? []).map((p, i) => (
                    <tr key={i}>
                      <td><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a></td>
                      <td>{p.page_type}</td>
                      <td>{p.notes}</td>
                    </tr>
                  ))}
                  {!auditFindings.pages_audited?.length && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "14px 0" }}>No pages audited yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="aeo-section">
            <h2>SEO Analysis <span className="aeo-v" style={{ fontSize: 16 }}>{latestScore?.seo_score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></span></h2>
            <p className="aeo-sub">Technical On-Page</p>
            <SignalTable rows={auditFindings.seo?.technical_on_page ?? []} emptyReason="No technical on-page findings yet." />
            <p className="aeo-sub">Content Quality</p>
            <SignalTable rows={auditFindings.seo?.content_quality ?? []} emptyReason="No content quality findings yet." />
            <p className="aeo-sub">Structured Data</p>
            <SignalTable rows={auditFindings.seo?.structured_data ?? []} emptyReason="No structured data findings yet." />
          </div>

          <div className="aeo-section">
            <h2>GEO Analysis <span className="aeo-v" style={{ fontSize: 16 }}>{latestScore?.geo_score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></span></h2>
            <p className="aeo-sub">E-E-A-T Assessment</p>
            <SignalTable rows={auditFindings.geo?.eeat ?? []} emptyReason="No E-E-A-T findings yet." />
            <p className="aeo-sub">Content for AI Synthesis</p>
            <SignalTable rows={auditFindings.geo?.content_ai_synthesis ?? []} emptyReason="No AI-synthesis findings yet." />
            <p className="aeo-sub">Technical GEO</p>
            <SignalTable rows={auditFindings.geo?.technical_geo ?? []} emptyReason="No technical GEO findings yet." />
          </div>

          <div className="aeo-section">
            <h2>AEO Analysis <span className="aeo-v" style={{ fontSize: 16 }}>{latestScore?.aeo_score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></span></h2>
            <p className="aeo-sub">Featured Snippet Eligibility</p>
            <SignalTable rows={auditFindings.aeo?.featured_snippet ?? []} emptyReason="No featured-snippet findings yet." />
            <p className="aeo-sub">Structured Answer Formats</p>
            <SignalTable rows={auditFindings.aeo?.structured_answer_formats ?? []} emptyReason="No structured-answer findings yet." />
            <p className="aeo-sub">Voice Search Readiness</p>
            <SignalTable rows={auditFindings.aeo?.voice_search ?? []} emptyReason="No voice-search findings yet." />
          </div>

          <div className="aeo-section">
            <h2>Priority Recommendations</h2>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>Priority</th><th>Issue</th><th>Dimension</th><th>Effort</th><th>Impact</th></tr></thead>
                <tbody>
                  {(auditFindings.priority_recommendations ?? []).map((r, i) => (
                    <tr key={i}>
                      <td><Pill tone={priorityTone(r.priority)}>{r.priority}</Pill></td>
                      <td style={{ fontWeight: 600 }}>{r.issue}</td>
                      <td>{r.dimension}</td>
                      <td>{r.effort}</td>
                      <td>{r.impact}</td>
                    </tr>
                  ))}
                  {!auditFindings.priority_recommendations?.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "14px 0" }}>No priority recommendations yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="aeo-section">
            <h2>What's Working Well</h2>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>Strength</th><th>Evidence</th></tr></thead>
                <tbody>
                  {(auditFindings.whats_working ?? []).map((w, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{w.item}</td>
                      <td>{w.evidence}</td>
                    </tr>
                  ))}
                  {!auditFindings.whats_working?.length && <tr><td colSpan={2} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "14px 0" }}>No confirmed strengths yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="aeo-section">
            <h2>Citation Analysis</h2>
            <p className="aeo-sub">Domains AI engines cited when answering tracked prompts this week. Empty on quick-check scans (prompts aren't run).</p>
            <div className="aeo-tscroll">
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
          </div>

          <div className="aeo-section">
            <h2>Recommendations</h2>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>Title</th><th>Type</th><th>Priority</th><th>Status</th></tr></thead>
                <tbody>
                  {(data.recs ?? []).slice(0, 10).map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.title}</td>
                      <td>{r.rec_type}</td>
                      <td><Pill tone={r.priority === "HIGH" ? "bad" : r.priority === "MED" ? "warn" : "neutral"}>{r.priority}</Pill></td>
                      <td>{r.status ?? "New"}</td>
                    </tr>
                  ))}
                  {!data.recs?.length && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No recommendations yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="aeo-section">
            <h2>Glossary</h2>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>Term</th><th>Definition</th></tr></thead>
                <tbody>
                  <tr><td style={{ fontWeight: 700 }}>SEO</td><td>Search Engine Optimization — improving a site's technical structure and content so traditional search engines (Google, Bing) rank it well.</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>GEO</td><td>Generative Engine Optimization — optimizing for AI-powered search engines (ChatGPT Search, Perplexity, Google AI Overviews) that synthesize answers from multiple sources and cite pages.</td></tr>
                  <tr><td style={{ fontWeight: 700 }}>AEO</td><td>Answer Engine Optimization — optimizing for featured snippets, People Also Ask boxes, and voice search, where engines extract one direct, concise answer.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Free path: run the audit prompt in the admin's own claude.ai account, then paste the JSON reply here */}
      <div className="aeo-section">
        <h2>Import Manual Scan</h2>
        <p className="aeo-sub">Ran the audit via "Open in Claude" instead of paying for API credits? Paste the JSON reply below to load it into this report.</p>
        <textarea
          rows={4}
          placeholder='Paste the JSON reply from Claude here, e.g. {"seo":7,"geo":6,"aeo":5,"findings":{...}}'
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12.5 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={importManualResult} disabled={importing || !pasteText.trim()} className="aeo-btn">
            {importing ? "Importing…" : "Import report"}
          </button>
        </div>
      </div>

      {/* Scan history — the logged data trail, kept regardless of which week's report is shown above */}
      <div className="aeo-section">
        <h2>Scan History</h2>
        <div className="aeo-tscroll">
          <table>
            <thead><tr><th>Started</th><th>Week of</th><th>Type</th><th>Scope</th><th>Status</th><th>API calls</th></tr></thead>
            <tbody>
              {(history ?? []).map(h => (
                <tr key={h.id}>
                  <td>{new Date(h.started_at).toLocaleString()}</td>
                  <td>{h.week_of}</td>
                  <td>{h.scan_type === "quick" ? "Quick check" : h.scan_type === "manual" ? "Manual (Claude)" : "Full audit"}</td>
                  <td>{h.page_scope === "homepage" ? "Homepage only" : "Homepage + key pages"}</td>
                  <td>
                    <Pill tone={h.status === "completed" ? "good" : h.status === "failed" ? "bad" : "warn"}>
                      {h.status}
                    </Pill>
                  </td>
                  <td>{h.api_calls_used}</td>
                </tr>
              ))}
              {!history?.length && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No scans logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
