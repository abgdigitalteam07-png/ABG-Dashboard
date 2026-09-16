// Print-only layout for the SEO/AEO/GEO audit PDF.
//
// Deliberately mirrors SummaryPrintView's kit so both exports look like the same
// document family: fixed 794px A4 width, hard-coded tokens (html2canvas can't be
// trusted to resolve CSS variables), the same red accent and type scale, and <Gap />
// sentinels marking the only places the page slicer is allowed to cut.
//
// Exists because the AEO tab used to export a raster screenshot of the live on-screen
// report, which produced a headerless PDF with half-empty pages, rows sliced through
// the middle, and a 76 MB file.
import { format } from "date-fns";
import { Brand } from "@/lib/brands";

// ── Design tokens — copied from SummaryPrintView on purpose (zero CSS variables) ──
const RED      = "#C0272D";
const BLACK    = "#111827";
const MUTED    = "#6b7280";
const BORDER   = "#e5e7eb";
const CARD_BG  = "#ffffff";
const MUTED_BG = "#f9fafb";
const FONT     = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const BREAK_GAP = 40;

// Status / priority colours, matching the on-screen pills.
const TONE: Record<string, { fg: string; bg: string }> = {
  good:    { fg: "#065f46", bg: "#d1fae5" },
  warn:    { fg: "#92400e", bg: "#fef3c7" },
  bad:     { fg: "#991b1b", bg: "#fee2e2" },
  high:    { fg: "#9a3412", bg: "#ffedd5" },
  neutral: { fg: MUTED,     bg: "#f3f4f6" },
};

function statusTone(status: string) {
  if (status === "Good") return TONE.good;
  if (status === "Missing") return TONE.bad;
  return TONE.warn;
}
function priorityTone(priority: string) {
  if (priority === "Critical" || priority === "HIGH") return TONE.bad;
  if (priority === "High") return TONE.high;
  if (priority === "Quick Win") return TONE.good;
  return TONE.warn;
}

// ── Shared style objects ──────────────────────────────────────────────────
const card: React.CSSProperties = {
  border: `1px solid ${BORDER}`, borderRadius: 6,
  backgroundColor: CARD_BG, overflow: "hidden",
};
const table: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", tableLayout: "fixed",
};
const th: React.CSSProperties = {
  padding: "6px 12px", fontSize: 9, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.12em",
  color: MUTED, fontFamily: FONT, backgroundColor: MUTED_BG,
  textAlign: "left", borderBottom: `1px solid ${BORDER}`,
};
const td: React.CSSProperties = {
  padding: "7px 12px", fontSize: 10.5, lineHeight: 1.45,
  fontFamily: FONT, color: BLACK, borderBottom: `1px solid ${BORDER}`,
  verticalAlign: "top", wordBreak: "break-word",
};

function Gap() {
  return <div data-pb="1" style={{ height: BREAK_GAP, backgroundColor: "#ffffff" }} />;
}

function SectionHeader({ label, score, note }: { label: string; score?: number | null; note?: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${RED}`, paddingLeft: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT }}>
          {label}
        </span>
        {score != null && (
          <span style={{ fontSize: 13, fontWeight: 900, color: RED, fontFamily: FONT }}>
            {score}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>/10</span>
          </span>
        )}
      </div>
      {note && <div style={{ fontSize: 9.5, color: MUTED, fontFamily: FONT, marginTop: 3, lineHeight: 1.5 }}>{note}</div>}
    </div>
  );
}

// Each sub-section is also a legal cut point, not just each top-level section —
// section-only breaks left 30–40% of most pages empty. The white band is the cut
// zone, and the label sits after it so a label is never stranded at a page foot.
//
// `first` must be set on the first sub-label of a section: without it the slicer
// could cut between a section heading ("SEO ANALYSIS 5/10") and its own first
// table, leaving the heading alone at the bottom of a page.
function SubLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <>
      {!first && <div data-pb="1" style={{ height: 20, backgroundColor: "#ffffff" }} />}
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: MUTED, fontFamily: FONT, marginTop: first ? 2 : 0, marginBottom: 6 }}>
        {children}
      </div>
    </>
  );
}

// Status is shown by tinting the whole cell, not by a small pill around the word.
//
// This is a rasteriser constraint, not a style preference. html2canvas draws text
// lower inside a box than the browser does, so any background fitted tightly around a
// word comes out visibly higher than the word itself. Pills were tried three ways —
// inline-block with line-height, inline-flex centring, and an inline table cell — and
// all three reproduced it at print resolution. Tinting the full cell removes the
// failure mode entirely: the coloured area is far larger than the text, so a baseline
// error of a pixel or two cannot read as misalignment. Do not reintroduce a pill.
function statusCell(tone: { fg: string; bg: string }): React.CSSProperties {
  return {
    ...td,
    backgroundColor: tone.bg, color: tone.fg,
    fontWeight: 700, fontSize: 9.5, letterSpacing: "0.04em",
    verticalAlign: "middle", textAlign: "center",
  };
}

type SignalRow = { signal: string; finding: string; status: string };

function SignalTable({ rows }: { rows: SignalRow[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ ...card, marginBottom: 4 }}>
      <table style={table}>
        <colgroup><col style={{ width: "26%" }} /><col style={{ width: "56%" }} /><col style={{ width: "18%" }} /></colgroup>
        <thead><tr><th style={th}>Signal</th><th style={th}>Finding</th><th style={th}>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 ? MUTED_BG : CARD_BG }}>
              <td style={{ ...td, fontWeight: 700 }}>{r.signal}</td>
              <td style={td}>{r.finding}</td>
              <td style={statusCell(statusTone(r.status))}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreTile({ label, score, last }: { label: string; score: number | null; last?: boolean }) {
  return (
    <div style={{ flex: 1, padding: "14px 18px", borderRight: last ? "none" : `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 28, fontWeight: 900, fontFamily: FONT, color: BLACK, lineHeight: 1 }}>
        {score ?? "—"}<span style={{ fontSize: 13, color: MUTED }}>/10</span>
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.14em", color: MUTED, fontFamily: FONT, marginTop: 7 }}>
        {label}
      </div>
    </div>
  );
}

export interface SeoAeoPrintViewProps {
  brand: Brand;
  weekOf: string;
  score: {
    seo_score: number | null; geo_score: number | null; aeo_score: number | null;
    pages_crawled?: number | null;
  } | null;
  findings: {
    executive_summary?: string;
    pages_audited?: Array<{ url: string; page_type: string; notes: string }>;
    seo?: { technical_on_page?: SignalRow[]; content_quality?: SignalRow[]; structured_data?: SignalRow[] };
    geo?: { eeat?: SignalRow[]; content_ai_synthesis?: SignalRow[]; technical_geo?: SignalRow[] };
    aeo?: { featured_snippet?: SignalRow[]; structured_answer_formats?: SignalRow[]; voice_search?: SignalRow[] };
    priority_recommendations?: Array<{ priority: string; issue: string; dimension: string; effort: string; impact: string }>;
    whats_working?: Array<{ item: string; evidence: string }>;
  };
  citations: Array<{ domain: string; frequency: number; brand_mentioned: boolean }>;
  recs: Array<{ title: string; rec_type: string; priority: string; status?: string }>;
  visibilityPct: number | null;
}

export function SeoAeoPrintView({
  brand, weekOf, score, findings, citations, recs, visibilityPct,
}: SeoAeoPrintViewProps) {
  const pages = findings.pages_audited ?? [];
  const priority = findings.priority_recommendations ?? [];
  const working = findings.whats_working ?? [];
  // Reddit-engagement items live in their own section on screen; keep the PDF's
  // recommendations table to the site/content actions so it isn't duplicated.
  const siteRecs = recs.filter(r => r.rec_type !== "Reddit engagement");

  return (
    <div style={{ width: 794, backgroundColor: "#fff", fontFamily: FONT, padding: "32px 40px", boxSizing: "border-box", color: BLACK }}>

      {/* ── HEADER ── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.18em", color: RED, marginBottom: 5, fontFamily: FONT }}>
              SEO · AEO · GEO Audit
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: BLACK, lineHeight: 1.1, fontFamily: FONT }}>{brand.name}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 5, fontFamily: FONT }}>
              Week of {weekOf}
              {score?.pages_crawled ? ` · ${score.pages_crawled} pages audited` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT }}>Issued {format(new Date(), "MMM d, yyyy")}</div>
          </div>
        </div>
      </div>

      {/* Meta bar */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, fontFamily: FONT, paddingTop: 4, marginBottom: 20 }}>
        <span>{brand.gscSiteUrl ?? brand.name}</span>
        <span>Answer & Generative Engine Optimization</span>
        <span>{visibilityPct != null ? `AI visibility ${visibilityPct}%` : "Visibility not yet tracked"}</span>
      </div>

      {/* ── EXECUTIVE SUMMARY ── */}
      {findings.executive_summary && (
        <div style={{ borderLeft: `4px solid ${RED}`, backgroundColor: MUTED_BG, padding: "14px 18px", borderRadius: "0 4px 4px 0" }}>
          <p style={{ fontSize: 12.5, color: BLACK, lineHeight: 1.65, margin: 0, fontFamily: FONT, fontWeight: 500 }}>
            {findings.executive_summary}
          </p>
        </div>
      )}

      <Gap />

      {/* ── SCORE STRIP ── */}
      <div style={{ ...card, display: "flex" }}>
        <ScoreTile label="SEO" score={score?.seo_score ?? null} />
        <ScoreTile label="GEO" score={score?.geo_score ?? null} />
        <ScoreTile label="AEO" score={score?.aeo_score ?? null} last />
      </div>

      <Gap />

      {/* ── PAGES AUDITED ── */}
      {pages.length > 0 && (
        <>
          <SectionHeader label="Pages Audited" />
          <div style={card}>
            <table style={table}>
              <colgroup><col style={{ width: "34%" }} /><col style={{ width: "18%" }} /><col style={{ width: "48%" }} /></colgroup>
              <thead><tr><th style={th}>URL</th><th style={th}>Page Type</th><th style={th}>Notes</th></tr></thead>
              <tbody>
                {pages.map((p, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? MUTED_BG : CARD_BG }}>
                    <td style={{ ...td, color: RED, fontWeight: 600 }}>{p.url}</td>
                    <td style={td}>{p.page_type}</td>
                    <td style={td}>{p.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Gap />
        </>
      )}

      {/* ── SEO ── */}
      <SectionHeader label="SEO Analysis" score={score?.seo_score ?? null} />
      {!!findings.seo?.technical_on_page?.length && <><SubLabel first>Technical On-Page</SubLabel><SignalTable rows={findings.seo.technical_on_page} /></>}
      {!!findings.seo?.content_quality?.length && <><SubLabel>Content Quality</SubLabel><SignalTable rows={findings.seo.content_quality} /></>}
      {!!findings.seo?.structured_data?.length && <><SubLabel>Structured Data</SubLabel><SignalTable rows={findings.seo.structured_data} /></>}

      <Gap />

      {/* ── GEO ── */}
      <SectionHeader label="GEO Analysis" score={score?.geo_score ?? null} note="How well AI engines can recognise, trust and cite this brand." />
      {!!findings.geo?.eeat?.length && <><SubLabel first>E-E-A-T Assessment</SubLabel><SignalTable rows={findings.geo.eeat} /></>}
      {!!findings.geo?.content_ai_synthesis?.length && <><SubLabel>Content for AI Synthesis</SubLabel><SignalTable rows={findings.geo.content_ai_synthesis} /></>}
      {!!findings.geo?.technical_geo?.length && <><SubLabel>Technical GEO</SubLabel><SignalTable rows={findings.geo.technical_geo} /></>}

      <Gap />

      {/* ── AEO ── */}
      <SectionHeader label="AEO Analysis" score={score?.aeo_score ?? null} note="Eligibility for direct answers, featured snippets and voice results." />
      {!!findings.aeo?.featured_snippet?.length && <><SubLabel first>Featured Snippet Eligibility</SubLabel><SignalTable rows={findings.aeo.featured_snippet} /></>}
      {!!findings.aeo?.structured_answer_formats?.length && <><SubLabel>Structured Answer Formats</SubLabel><SignalTable rows={findings.aeo.structured_answer_formats} /></>}
      {!!findings.aeo?.voice_search?.length && <><SubLabel>Voice Search Readiness</SubLabel><SignalTable rows={findings.aeo.voice_search} /></>}

      <Gap />

      {/* ── PRIORITY RECOMMENDATIONS ── */}
      {priority.length > 0 && (
        <>
          <SectionHeader label="Priority Recommendations" />
          <div style={card}>
            <table style={table}>
              <colgroup><col style={{ width: "13%" }} /><col style={{ width: "53%" }} /><col style={{ width: "12%" }} /><col style={{ width: "11%" }} /><col style={{ width: "11%" }} /></colgroup>
              <thead><tr><th style={th}>Priority</th><th style={th}>Issue</th><th style={th}>Dimension</th><th style={th}>Effort</th><th style={th}>Impact</th></tr></thead>
              <tbody>
                {priority.map((p, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? MUTED_BG : CARD_BG }}>
                    <td style={statusCell(priorityTone(p.priority))}>{p.priority}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.issue}</td>
                    <td style={td}>{p.dimension}</td>
                    <td style={td}>{p.effort}</td>
                    <td style={td}>{p.impact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Gap />
        </>
      )}

      {/* ── WHAT'S WORKING ── */}
      {working.length > 0 && (
        <>
          <SectionHeader label="What's Working Well" />
          <div style={card}>
            <table style={table}>
              <colgroup><col style={{ width: "30%" }} /><col style={{ width: "70%" }} /></colgroup>
              <thead><tr><th style={th}>Strength</th><th style={th}>Evidence</th></tr></thead>
              <tbody>
                {working.map((w, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? MUTED_BG : CARD_BG }}>
                    <td style={{ ...td, fontWeight: 700 }}>{w.item}</td>
                    <td style={td}>{w.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Gap />
        </>
      )}

      {/* ── CITATIONS ── */}
      {citations.length > 0 && (
        <>
          <SectionHeader label="Citation Analysis" note="Domains AI engines cited while answering this brand's tracked prompts this week." />
          <div style={card}>
            <table style={table}>
              <colgroup><col style={{ width: "62%" }} /><col style={{ width: "19%" }} /><col style={{ width: "19%" }} /></colgroup>
              <thead><tr><th style={th}>Domain</th><th style={th}>Frequency</th><th style={th}>Brand Mentioned</th></tr></thead>
              <tbody>
                {citations.slice(0, 15).map((c, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? MUTED_BG : CARD_BG }}>
                    <td style={{ ...td, color: RED, fontWeight: 600 }}>{c.domain}</td>
                    <td style={td}>{c.frequency}</td>
                    <td style={statusCell(c.brand_mentioned ? TONE.good : TONE.neutral)}>{c.brand_mentioned ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Gap />
        </>
      )}

      {/* ── RECOMMENDATIONS ── */}
      {siteRecs.length > 0 && (
        <>
          <SectionHeader label="Recommendations" />
          <div style={card}>
            <table style={table}>
              <colgroup><col style={{ width: "60%" }} /><col style={{ width: "20%" }} /><col style={{ width: "12%" }} /><col style={{ width: "8%" }} /></colgroup>
              <thead><tr><th style={th}>Title</th><th style={th}>Type</th><th style={th}>Priority</th><th style={th}>Status</th></tr></thead>
              <tbody>
                {siteRecs.map((r, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 ? MUTED_BG : CARD_BG }}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                    <td style={td}>{r.rec_type}</td>
                    <td style={statusCell(priorityTone(r.priority))}>{r.priority}</td>
                    <td style={td}>{r.status ?? "New"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Gap />
        </>
      )}

      {/* ── FOOTER ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, fontFamily: FONT }}>
        <span>{brand.name} — SEO / AEO / GEO Audit</span>
        <span>Week of {weekOf} · Confidential</span>
      </div>
    </div>
  );
}
