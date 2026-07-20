import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brand } from "@/lib/brands";
import { supabase } from "@/integrations/supabase/client";
import { WaterFillLoader } from "@/components/WaterFillLoader";
import { toast } from "sonner";
import "./SeoAeoGeoTab.css";

// New aeo_* tables are not in the generated Database types yet — regenerate after
// the 20260717000000 migration is applied, then drop this cast.
const sb = supabase as any;

type PageScope = "homepage" | "multi";

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral" | "high"; children: React.ReactNode }) {
  return <span className={`aeo-pill ${tone}`}>{children}</span>;
}
function statusTone(status: string): "good" | "warn" | "bad" {
  if (status === "Good") return "good";
  if (status === "Missing") return "bad";
  return "warn";
}
// Matches the skill's own priority color coding exactly: Critical=red, High=orange, Medium=amber, Quick Win=green.
function priorityTone(priority: string): "good" | "warn" | "bad" | "high" {
  if (priority === "Critical") return "bad";
  if (priority === "High") return "high";
  if (priority === "Quick Win") return "good";
  return "warn"; // Medium
}
// Matches the skill's exact score bands: 1-4 red/Needs Work, 5-7 amber/On Track, 8-10 green/Strong.
function scoreStatus(score: number | null | undefined): { label: string; tone: "good" | "warn" | "bad" } {
  const n = Number(score);
  if (score == null || Number.isNaN(n)) return { label: "—", tone: "warn" };
  if (n >= 8) return { label: "Strong", tone: "good" };
  if (n >= 5) return { label: "On Track", tone: "warn" };
  return { label: "Needs Work", tone: "bad" };
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
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

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

  const { data, isLoading } = useQuery({
    queryKey: ["aeo-report", brand.id, week],
    enabled: !!week,
    queryFn: async () => {
      const [scoreRes, citationsRes, recsRes, scanRes] = await Promise.all([
        sb.from("seo_audit_scores").select("*").eq("brand_id", brand.id).eq("week_of", week).maybeSingle(),
        sb.from("aeo_citations").select("*").eq("brand_id", brand.id).eq("week_of", week).order("frequency", { ascending: false }),
        sb.from("aeo_recommendations").select("*").eq("brand_id", brand.id).order("created_at", { ascending: false }),
        sb.from("aeo_scan_log").select("page_scope").eq("brand_id", brand.id).eq("week_of", week).eq("status", "completed")
          .order("started_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (scoreRes.error) throw scoreRes.error;
      if (citationsRes.error) throw citationsRes.error;
      if (recsRes.error) throw recsRes.error;
      return {
        score: scoreRes.data, citations: citationsRes.data ?? [], recs: recsRes.data ?? [],
        pageScope: (scanRes.data?.page_scope as PageScope | undefined) ?? null,
      };
    },
  });

  const siteUrl = brand.gscSiteUrl ?? `https://${brand.id.replace(/-/g, "")}.com/`;

  const handleDownloadPdf = async () => {
    if (!reportRef.current || !week) return;
    setExportingPdf(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const el = reportRef.current;
      const scale = 2;
      const elW = el.offsetWidth;
      const elH = el.offsetHeight;

      // Collect safe break Y-positions from data-pb markers BEFORE capturing —
      // always cut between report sections, never mid-table.
      const pbEls = Array.from(el.querySelectorAll("[data-pb]")) as HTMLElement[];
      const safeBreaks: number[] = pbEls.map(e => Math.round((e.offsetTop + e.offsetHeight / 2) * scale));
      safeBreaks.unshift(0);
      safeBreaks.push(elH * scale);

      const canvas = await html2canvas(el, {
        scale, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", logging: false,
        width: elW, height: elH, windowWidth: elW, windowHeight: elH, scrollX: 0, scrollY: 0,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWmm = 210;
      const pageHmm = 297;
      const pxPerMm = canvas.width / pageWmm;
      const pageHpx = Math.round(pageHmm * pxPerMm);

      function pickBreak(fromY: number): number {
        const target = fromY + pageHpx;
        if (target >= canvas.height) return canvas.height;
        const candidates = safeBreaks.filter(b => b > fromY && b <= target);
        return candidates.length > 0 ? candidates[candidates.length - 1] : target;
      }

      let srcY = 0;
      let page = 0;
      while (srcY < canvas.height) {
        const breakY = pickBreak(srcY);
        const sliceH = breakY - srcY;
        if (sliceH <= 0) break;

        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, pageWmm, sliceH / pxPerMm);

        srcY = breakY;
        page++;
      }

      const safeName = brand.name.replace(/[^a-zA-Z0-9]/g, "_");
      pdf.save(`${safeName}_seo-audit-report_${week}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      toast.error("PDF export failed — see console for details.");
    } finally {
      setExportingPdf(false);
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
        {week && data && (
          <button
            onClick={handleDownloadPdf}
            disabled={exportingPdf}
            style={{ border: "1px solid var(--aeo-line)", borderRadius: 8, padding: "8px 16px", background: "var(--aeo-card)", color: "var(--aeo-ink)", fontWeight: 600, fontSize: 13.5 }}
          >
            {exportingPdf ? "Exporting…" : "⬇ Download PDF"}
          </button>
        )}
      </div>

      {isLoading && <WaterFillLoader />}

      {!isLoading && !week && (
        <div className="aeo-section" style={{ textAlign: "center", color: "var(--aeo-muted)" }}>
          No scans yet for {brand.name} — the report below is empty and ready to be filled in automatically by the scheduled SEO/AEO/GEO audit Routine.
        </div>
      )}

      {!isLoading && (
        <div ref={reportRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cover — mirrors the skill's DOCX cover page. */}
          <div className="aeo-cover">
            <div className="aeo-cover-domain">{siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</div>
            <h1>SEO / GEO / AEO Audit Report</h1>
            <span className="aeo-cover-badge">{data?.pageScope === "homepage" ? "QUICK AUDIT" : "FULL AUDIT"}</span>
            <div className="aeo-cover-scores">
              {([
                ["SEO", latestScore?.seo_score],
                ["GEO", latestScore?.geo_score],
                ["AEO", latestScore?.aeo_score],
              ] as const).map(([label, score]) => (
                <div key={label} className="aeo-cover-score">
                  <div className="aeo-cover-k">{label}</div>
                  <div className="aeo-cover-v">{score ?? "—"}<span style={{ fontSize: 14, fontWeight: 400, opacity: .7 }}>/10</span></div>
                </div>
              ))}
            </div>
            <div className="aeo-cover-date">{week ? `Week of ${week}` : "No scan yet"} · {brand.name}</div>
          </div>

          <div className="aeo-section" data-pb>
            <h2>Executive Summary</h2>
            <div style={{ background: "var(--aeo-accent-soft)", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 13.5 }}>
                {auditFindings.executive_summary ?? "No audit run yet — this will populate once the scheduled Routine runs."}
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
                    const status = scoreStatus(score);
                    return (
                      <tr key={label}>
                        <td style={{ fontWeight: 700 }}>{label}</td>
                        <td className="aeo-v" style={{ fontSize: 18 }}>{score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></td>
                        <td>{score != null && <Pill tone={status.tone}>{status.label}</Pill>}</td>
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

          <div className="aeo-section" data-pb>
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

          <div className="aeo-section" data-pb>
            <h2>SEO Analysis <span className="aeo-v" style={{ fontSize: 16 }}>{latestScore?.seo_score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></span></h2>
            <p className="aeo-sub">Technical On-Page</p>
            <SignalTable rows={auditFindings.seo?.technical_on_page ?? []} emptyReason="No technical on-page findings yet." />
            <p className="aeo-sub">Content Quality</p>
            <SignalTable rows={auditFindings.seo?.content_quality ?? []} emptyReason="No content quality findings yet." />
            <p className="aeo-sub">Structured Data</p>
            <SignalTable rows={auditFindings.seo?.structured_data ?? []} emptyReason="No structured data findings yet." />
          </div>

          <div className="aeo-section" data-pb>
            <h2>GEO Analysis <span className="aeo-v" style={{ fontSize: 16 }}>{latestScore?.geo_score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></span></h2>
            <p className="aeo-sub">E-E-A-T Assessment</p>
            <SignalTable rows={auditFindings.geo?.eeat ?? []} emptyReason="No E-E-A-T findings yet." />
            <p className="aeo-sub">Content for AI Synthesis</p>
            <SignalTable rows={auditFindings.geo?.content_ai_synthesis ?? []} emptyReason="No AI-synthesis findings yet." />
            <p className="aeo-sub">Technical GEO</p>
            <SignalTable rows={auditFindings.geo?.technical_geo ?? []} emptyReason="No technical GEO findings yet." />
          </div>

          <div className="aeo-section" data-pb>
            <h2>AEO Analysis <span className="aeo-v" style={{ fontSize: 16 }}>{latestScore?.aeo_score ?? "—"}<span style={{ fontSize: 12, color: "var(--aeo-muted)", fontWeight: 400 }}>/10</span></span></h2>
            <p className="aeo-sub">Featured Snippet Eligibility</p>
            <SignalTable rows={auditFindings.aeo?.featured_snippet ?? []} emptyReason="No featured-snippet findings yet." />
            <p className="aeo-sub">Structured Answer Formats</p>
            <SignalTable rows={auditFindings.aeo?.structured_answer_formats ?? []} emptyReason="No structured-answer findings yet." />
            <p className="aeo-sub">Voice Search Readiness</p>
            <SignalTable rows={auditFindings.aeo?.voice_search ?? []} emptyReason="No voice-search findings yet." />
          </div>

          <div className="aeo-section" data-pb>
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

          <div className="aeo-section" data-pb>
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

          <div className="aeo-section" data-pb>
            <h2>Citation Analysis</h2>
            <p className="aeo-sub">Domains AI engines cited when answering tracked prompts this week. Empty on quick-check scans (prompts aren't run).</p>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>Domain</th><th style={{ textAlign: "right" }}>Frequency</th><th>Brand mentioned</th></tr></thead>
                <tbody>
                  {(data?.citations ?? []).slice(0, 10).map((c: any) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}><a href={`https://${c.domain}`} target="_blank" rel="noreferrer">{c.domain}</a></td>
                      <td style={{ textAlign: "right" }}>{c.frequency}</td>
                      <td>{c.brand_mentioned ? <Pill tone="good">Yes</Pill> : "No"}</td>
                    </tr>
                  ))}
                  {!data?.citations?.length && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No citations captured this week.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="aeo-section" data-pb>
            <h2>Recommendations</h2>
            <div className="aeo-tscroll">
              <table>
                <thead><tr><th>Title</th><th>Type</th><th>Priority</th><th>Status</th></tr></thead>
                <tbody>
                  {(data?.recs ?? []).slice(0, 10).map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.title}</td>
                      <td>{r.rec_type}</td>
                      <td><Pill tone={r.priority === "HIGH" ? "bad" : r.priority === "MED" ? "warn" : "neutral"}>{r.priority}</Pill></td>
                      <td>{r.status ?? "New"}</td>
                    </tr>
                  ))}
                  {!data?.recs?.length && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--aeo-muted)", padding: "16px 0" }}>No recommendations yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Glossary only appears on a Full Audit, matching the skill's own rule. */}
          {data?.pageScope !== "homepage" && (
            <div className="aeo-section" data-pb>
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
          )}
        </div>
      )}


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
                  <td>{
                    h.scan_type === "quick" ? "Quick check"
                    : h.scan_type === "manual" ? "Manual (Claude)"
                    : h.scan_type === "routine" ? "Automated (Routine)"
                    : "Full audit"
                  }</td>
                  <td>{h.page_scope === "homepage" ? "Quick Audit" : "Full Audit"}</td>
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
