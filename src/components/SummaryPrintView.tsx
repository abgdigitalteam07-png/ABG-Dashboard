import { format } from "date-fns";
import { Brand } from "@/lib/brands";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  AreaChart, Area, ResponsiveContainer,
} from "recharts";

// ── Hard-coded design tokens (no CSS variables) ────────────────────────────
const RED      = "#C0272D";
const BLACK    = "#111827";
const MUTED    = "#6b7280";
const BORDER   = "#e5e7eb";
const CARD_BG  = "#ffffff";
const MUTED_BG = "#f9fafb";
const FONT     = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
const MONO     = "ui-monospace, 'Courier New', monospace";

const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search":   "#16a34a",
  "Direct":           "#2563eb",
  "Referral":         "#7c3aed",
  "Email":            "#ea580c",
  "Unassigned":       "#94a3b8",
  "Paid Search":      "#dc2626",
  "Organic Social":   "#db2777",
  "Organic Shopping": "#d97706",
  "Organic Video":    "#0891b2",
  "AI Assistant":     "#0891b2",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null): string {
  if (n == null) return "—";
  if (n === 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 100_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtPct(n: number | string | undefined | null, d = 1): string {
  if (n == null) return "—";
  return parseFloat(String(n)).toFixed(d) + "%";
}

function buildSummary(brand: string, ga4: any, gsc: any, dateFrom: Date, dateTo: Date): string {
  const parts: string[] = [];
  if (ga4?.sessionsDelta != null) {
    const dir = ga4.sessionsDelta >= 0 ? "up" : "down";
    parts.push(`Traffic is ${dir} ${Math.abs(ga4.sessionsDelta).toFixed(1)}% vs. the prior period — ${fmt(ga4.sessions)} sessions with ${fmt(ga4.pageViews)} pageviews.`);
  }
  if (ga4?.organicSessionsDelta != null) {
    if (ga4.organicSessionsDelta >= 5) parts.push(`Organic search is driving growth at +${ga4.organicSessionsDelta.toFixed(1)}%, indicating strong SEO momentum.`);
    else if (ga4.organicSessionsDelta < -5) parts.push(`Organic traffic is down ${Math.abs(ga4.organicSessionsDelta).toFixed(1)}%, warranting a closer look at search rankings.`);
  }
  if (gsc?.totalImpressions > 0) {
    const ctr = parseFloat(gsc.averageCTR ?? 0);
    parts.push(`Search visibility: ${fmt(gsc.totalImpressions)} impressions, ${fmt(gsc.totalClicks)} clicks${ctr ? ` (${ctr.toFixed(1)}% CTR)` : ""}${gsc.averagePosition ? `, avg. position #${gsc.averagePosition.toFixed(1)}` : ""}.`);
  }
  if (!parts.length) return `Performance report for ${brand} — ${format(dateFrom, "MMM d")}–${format(dateTo, "MMM d, yyyy")}.`;
  return parts.join(" ");
}

// ── Sub-components (inline styles only) ──────────────────────────────────

function SectionHeader({ label, source }: { label: string; source?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderLeft: `3px solid ${RED}`, paddingLeft: 10, paddingTop: 2, paddingBottom: 2, marginBottom: 12 }}>
      <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: BLACK, fontFamily: FONT }}>{label}</span>
      {source && <span style={{ fontSize: 10, color: MUTED, fontFamily: FONT }}>{source}</span>}
    </div>
  );
}

interface KpiProps { label: string; value: string; delta?: number | null; sub?: string; invertDelta?: boolean; }
function KpiTile({ label, value, delta, sub, invertDelta }: KpiProps) {
  const good = invertDelta ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0;
  const deltaColor = good ? "#059669" : "#dc2626";
  return (
    <div style={{ flex: 1, minWidth: 110, padding: "18px 20px", borderRight: `1px solid ${BORDER}`, boxSizing: "border-box" }}>
      <div style={{ fontSize: 30, fontWeight: 900, fontFamily: FONT, color: BLACK, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: MUTED, fontFamily: FONT, marginTop: 8 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT, marginTop: 2 }}>{sub}</div>}
      {delta != null && (
        <div style={{ fontSize: 11, fontWeight: 600, color: deltaColor, fontFamily: FONT, marginTop: 4 }}>
          {delta >= 0 ? "↗" : "↘"} {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% WoW
        </div>
      )}
    </div>
  );
}

function TrafficBars({ channels }: { channels: any[] }) {
  const total = channels.reduce((s: number, c: any) => s + (c.sessions ?? c.users ?? 0), 0);
  const top = [...channels].sort((a, b) => (b.sessions ?? b.users ?? 0) - (a.sessions ?? a.users ?? 0)).slice(0, 7);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {top.map((ch) => {
        const v = ch.sessions ?? ch.users ?? 0;
        const pct = total > 0 ? (v / total) * 100 : 0;
        const color = CHANNEL_COLORS[ch.channel] ?? "#9ca3af";
        return (
          <div key={ch.channel} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 110, textAlign: "right", fontSize: 11, color: MUTED, fontFamily: FONT, flexShrink: 0 }}>{ch.channel}</div>
            <div style={{ flex: 1, height: 14, backgroundColor: BORDER, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 2 }} />
            </div>
            <div style={{ width: 52, textAlign: "right", fontSize: 11, fontWeight: 600, fontFamily: FONT, color: BLACK, fontVariantNumeric: "tabular-nums" }}>
              {v.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Print View Root ────────────────────────────────────────────────────────

export interface SummaryPrintViewProps {
  brand: Brand;
  dateFrom: Date;
  dateTo: Date;
  ga4: any;
  gsc: any;
  channels: any[];
  recommendations: any[];
}

export function SummaryPrintView({ brand, dateFrom, dateTo, ga4, gsc, channels, recommendations }: SummaryPrintViewProps) {
  const execSummary = buildSummary(brand.name, ga4, gsc, dateFrom, dateTo);
  const axisStyle = { fontSize: 10, fill: MUTED, fontFamily: FONT };
  const gridColor = BORDER;

  const section: React.CSSProperties = { marginBottom: 28 };
  const card: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 6, backgroundColor: CARD_BG, overflow: "hidden" };
  const cardHeader: React.CSSProperties = { padding: "10px 18px", borderBottom: `1px solid ${BORDER}` };
  const th: React.CSSProperties = { padding: "7px 14px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: MUTED, fontFamily: FONT, backgroundColor: MUTED_BG, textAlign: "left", borderBottom: `1px solid ${BORDER}` };
  const td: React.CSSProperties = { padding: "9px 14px", fontSize: 11, fontFamily: FONT, color: BLACK, borderBottom: `1px solid ${BORDER}` };

  return (
    <div style={{ width: 794, backgroundColor: "#fff", fontFamily: FONT, padding: "36px 40px", boxSizing: "border-box", color: BLACK }}>

      {/* ── HEADER ── */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: RED, marginBottom: 6, fontFamily: FONT }}>
              Performance Report Brief
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: BLACK, lineHeight: 1.1, fontFamily: FONT }}>{brand.name}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 5, fontFamily: FONT }}>
              Week of {format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")} · weekly edition
            </div>
          </div>
          <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT, textAlign: "right", paddingTop: 4 }}>
            Issued {format(new Date(), "MMM d, yyyy")}
          </div>
        </div>
      </div>

      {/* Meta bar */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, fontFamily: FONT, marginBottom: 22, paddingTop: 4 }}>
        <span>{brand.name}</span>
        <span style={{ display: "flex", gap: 14 }}>
          {brand.hasGA4 && <span>Google Analytics 4</span>}
          {brand.hasGSC && <span>Search Console</span>}
          {brand.hasHubSpot && <span>HubSpot</span>}
        </span>
        <span>Direct-to-Consumer + Trade</span>
      </div>

      {/* ── EXECUTIVE SUMMARY ── */}
      <div style={{ borderLeft: `4px solid ${RED}`, backgroundColor: MUTED_BG, padding: "14px 18px", borderRadius: "0 4px 4px 0", marginBottom: 28 }}>
        <p style={{ fontSize: 13, color: BLACK, lineHeight: 1.65, margin: 0, fontFamily: FONT, fontWeight: 500 }}>{execSummary}</p>
      </div>

      {/* ── KPI STRIP ── */}
      {(brand.hasGA4 || brand.hasGSC) && (
        <div style={{ ...card, display: "flex", marginBottom: 24 }}>
          {brand.hasGA4 && ga4 && <>
            <KpiTile label="Active Users" value={fmt(ga4.activeUsers1Day)} delta={ga4.activeUsers1DayDelta} sub={`${fmt(ga4.sessions)} sessions`} />
            <KpiTile label="Sessions" value={fmt(ga4.sessions)} delta={ga4.sessionsDelta} sub={`${fmt(ga4.pageViews)} pageviews`} />
            <KpiTile label="Organic Sessions" value={fmt(ga4.organicSessions)} delta={ga4.organicSessionsDelta} />
          </>}
          {brand.hasGSC && gsc && <>
            <KpiTile label="Search Impressions" value={fmt(gsc.totalImpressions)} delta={gsc.totalImpressionsDelta} />
            <KpiTile label="Search Clicks" value={fmt(gsc.totalClicks)} delta={gsc.totalClicksDelta} />
            <KpiTile label="Avg. Position" value={gsc.averagePosition?.toFixed(1) ?? "—"} delta={gsc.averagePositionDelta} invertDelta sub={`${fmtPct(gsc.averageCTR)} CTR`} />
          </>}
        </div>
      )}

      {/* ── CHARTS: Sessions + Traffic Sources ── */}
      {brand.hasGA4 && (ga4?.sessionsOverTime?.length > 0 || channels.length > 0) && (
        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          {ga4?.sessionsOverTime?.length > 0 && (
            <div style={{ ...card, flex: 1, padding: "14px 16px" }}>
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT, marginBottom: 12 }}>
                Sessions — Daily
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ga4.sessionsOverTime} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, fontFamily: FONT, border: `1px solid ${BORDER}`, borderRadius: 4 }} />
                  <Bar dataKey="value" name="Sessions" fill={RED} radius={[2, 2, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {channels.length > 0 && (
            <div style={{ ...card, flex: 1, padding: "14px 16px" }}>
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT, marginBottom: 3 }}>
                Where Visitors Came From <span style={{ fontWeight: 400, color: MUTED, textTransform: "none" as const, letterSpacing: "normal" }}>(Users)</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, fontFamily: FONT, marginBottom: 14 }}>Session primary channel group</div>
              <TrafficBars channels={channels} />
            </div>
          )}
        </div>
      )}

      {/* ── SEARCH & DISCOVERY ── */}
      {brand.hasGSC && gsc && (
        <div style={section}>
          <SectionHeader label="Search & Discovery" source="Google Search Console" />

          {gsc.clicksImpressionsOverTime?.length > 0 && (
            <div style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT, marginBottom: 12 }}>
                Search Impressions — Daily
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={gsc.clicksImpressionsOverTime} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="imprGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={RED} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={RED} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={axisStyle} tickFormatter={(v) => v.slice(5)} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ fontSize: 11, fontFamily: FONT, border: `1px solid ${BORDER}`, borderRadius: 4 }} />
                  <Area type="monotone" dataKey="impressions" name="Impressions" stroke={RED} strokeWidth={2} fill="url(#imprGrad)" dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: RED }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ display: "flex", gap: 16 }}>
            {gsc.topQueries?.length > 0 && (
              <div style={{ ...card, flex: 1 }}>
                <div style={cardHeader}>
                  <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT }}>Top Search Queries</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Query</th>
                      <th style={{ ...th, textAlign: "right" }}>Clicks</th>
                      <th style={{ ...th, textAlign: "right" }}>Pos.</th>
                      <th style={{ ...th, textAlign: "right" }}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.topQueries.slice(0, 8).map((row: any) => (
                      <tr key={row.query}>
                        <td style={{ ...td, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.query}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.clicks}</td>
                        <td style={{ ...td, textAlign: "right", color: MUTED, fontVariantNumeric: "tabular-nums" }}>{row.position?.toFixed(1)}</td>
                        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.ctr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {gsc.opportunityQueries?.length > 0 && (
              <div style={{ ...card, flex: 1 }}>
                <div style={cardHeader}>
                  <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT }}>Biggest Ranking Opportunities</div>
                  <div style={{ fontSize: 10, color: MUTED, fontFamily: FONT, marginTop: 2 }}>Impr. / Avg Pos.</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Query</th>
                      <th style={{ ...th, textAlign: "right" }}>Impr.</th>
                      <th style={{ ...th, textAlign: "right" }}>Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gsc.opportunityQueries.slice(0, 8).map((row: any) => (
                      <tr key={row.query}>
                        <td style={{ ...td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.query}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(row.impressions)}</td>
                        <td style={{ ...td, textAlign: "right", color: RED, fontVariantNumeric: "tabular-nums" }}>#{row.position?.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SITE HEALTH & ENGAGEMENT ── */}
      {brand.hasGA4 && ga4?.topPages?.length > 0 && (
        <div style={section}>
          <SectionHeader label="Site Health & Engagement" source="GSC · GA4" />
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ ...card, flex: 1 }}>
              <div style={cardHeader}>
                <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT }}>Top Pages by Sessions</div>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Page</th>
                    <th style={{ ...th, textAlign: "right" }}>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {ga4.topPages.slice(0, 8).map((row: any, i: number) => (
                    <tr key={row.page}>
                      <td style={{ ...td, fontFamily: MONO, fontSize: 10 }}>
                        <span style={{ color: MUTED, marginRight: 8 }}>{i + 1}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{row.page}</span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{row.sessions?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...card, flex: 1 }}>
              <div style={cardHeader}>
                <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: BLACK, fontFamily: FONT }}>Engagement Quality</div>
              </div>
              {[
                { label: "Total Sessions",       value: fmt(ga4.sessions) },
                { label: "Page Views",            value: fmt(ga4.pageViews) },
                { label: "Active Users (1-day)",  value: fmt(ga4.activeUsers1Day) },
                { label: "Organic Sessions",      value: fmt(ga4.organicSessions) },
                ...(gsc ? [
                  { label: "Avg. Search CTR",  value: fmtPct(gsc.averageCTR) },
                  { label: "Avg. Position",    value: `#${gsc.averagePosition?.toFixed(1) ?? "—"}` },
                ] : []),
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 12, color: MUTED, fontFamily: FONT }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: BLACK, fontFamily: FONT, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── RECOMMENDATIONS ── */}
      {recommendations.length > 0 && (
        <div style={section}>
          <SectionHeader label="Recommendations — Next 30 Days" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recommendations.slice(0, 5).map((rec: any, i: number) => {
              const lc =
                rec.status === "action_required" ? "#ef4444" :
                rec.status === "attention"        ? "#f59e0b" :
                rec.status === "strong"           ? "#10b981" : "#60a5fa";
              return (
                <div key={rec.id} style={{ border: `1px solid ${BORDER}`, borderLeft: `4px solid ${lc}`, borderRadius: 4, backgroundColor: CARD_BG, padding: "12px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", backgroundColor: BLACK, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, fontFamily: FONT, flexShrink: 0 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: BLACK, fontFamily: FONT, lineHeight: 1.4 }}>{rec.headline}</div>
                    <div style={{ fontSize: 11, color: MUTED, fontFamily: FONT, marginTop: 4, lineHeight: 1.6 }}>{rec.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 10, color: MUTED, fontFamily: FONT }}>
        <span>
          {brand.name} — Weekly Performance Brief
        </span>
        <span>
          {[brand.hasGA4 && "GA4", brand.hasGSC && "Search Console", brand.hasHubSpot && "HubSpot"].filter(Boolean).join(" · ")}
          {" · "}{format(dateFrom, "MMM d")} – {format(dateTo, "MMM d, yyyy")} · GSC data lags 48–72 hours · Confidential
        </span>
      </div>
    </div>
  );
}
