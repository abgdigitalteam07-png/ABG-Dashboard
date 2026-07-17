import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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

interface Props { brand: Brand; }

export const SeoAeoGeoTab = ({ brand }: Props) => {
  const [subtab, setSubtab] = useState<(typeof SUBTABS)[number]>("Dashboard");
  const [scanning, setScanning] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
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
        sb.from("aeo_prompts").select("*").eq("brand_id", brand.id).eq("is_active", true),
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

  const runScan = async () => {
    setScanning(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("aeo-scan", {
        body: {
          brandId: brand.id,
          brandName: brand.name,
          siteUrl: brand.gscSiteUrl ?? `https://${brand.id.replace(/-/g, "")}.com/`,
        },
      });
      if (error || res?.error) throw new Error(res?.error ?? error?.message);

      // The scan runs in the background — poll the scan log until it finishes (max 8 min).
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

  const latestScore = data?.scores?.at(-1);
  const ownVisibility = data?.visibility?.filter((v: any) => v.is_own_brand) ?? [];
  const currentVis = ownVisibility.find((v: any) => v.week_of === week)?.visibility_pct ?? 0;

  return (
    <div className="space-y-4">
      {/* Header: last scanned + week selector + scan */}
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
      <div className="flex gap-1 border-b">
        {SUBTABS.map(t => (
          <button
            key={t}
            onClick={() => setSubtab(t)}
            className={`px-4 py-2 text-sm font-semibold ${subtab === t ? "border-b-2 border-accent text-foreground" : "text-muted-foreground"}`}
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
              {/* Audit scores */}
              <div className="grid gap-4 md:grid-cols-3">
                {([["SEO — Traditional Search", latestScore?.seo_score], ["GEO — Generative Engines", latestScore?.geo_score], ["AEO — Answer Engines", latestScore?.aeo_score]] as const).map(([label, score]) => (
                  <div key={label} className="rounded-lg border bg-card p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
                    <div className="text-3xl font-bold tabular-nums">{score ?? "—"}<span className="text-sm text-muted-foreground">/10</span></div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${(Number(score) || 0) * 10}%`, background: Number(score) >= 7 ? HS.mint : Number(score) >= 5 ? HS.sand : HS.coral }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Visibility */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand visibility · week of {week}</div>
                  <div className="py-6 text-center text-5xl font-bold tabular-nums">{currentVis}%</div>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand visibility over time</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={ownVisibility}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                      <XAxis dataKey="week_of" fontSize={11} />
                      <YAxis fontSize={11} unit="%" />
                      <Tooltip />
                      <Line type="monotone" dataKey="visibility_pct" name="Claude" stroke={HS.teal} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top domains */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="mb-2 font-semibold">Citation analysis — Top domains</h3>
                <table className="w-full text-sm tabular-nums">
                  <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Domain</th><th>Frequency</th><th>Brand mentioned</th>
                  </tr></thead>
                  <tbody>
                    {(data.citations ?? []).slice(0, 10).map((c: any) => (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-2 font-medium text-accent">{c.domain}</td>
                        <td>{c.frequency}</td>
                        <td>{c.brand_mentioned ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                    {!data.citations?.length && <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No citations captured this week.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {subtab === "Prompts" && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold">Tracked Prompts <span className="ml-1 rounded bg-muted px-2 py-0.5 text-xs">{data.prompts?.length ?? 0} / 10 used</span></h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Prompt</th><th>Visibility</th><th>Product</th><th>ICP</th><th>Journey phase</th>
                </tr></thead>
                <tbody>
                  {(data.prompts ?? []).map((p: any) => {
                    const r = data.promptResults?.find((x: any) => x.prompt_id === p.id);
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{p.prompt}</td>
                        <td>{r ? (r.brand_mentioned ? <span className="font-semibold text-green-600">● Mentioned</span> : <span className="text-red-500">● 0%</span>) : "—"}</td>
                        <td>{p.product_service ?? "—"}</td>
                        <td>{p.icp ?? "—"}</td>
                        <td>{p.journey_phase ?? "—"}</td>
                      </tr>
                    );
                  })}
                  {!data.prompts?.length && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No prompts yet — add rows to aeo_prompts (Add-prompts UI lands with the next iteration).</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {subtab === "Citations" && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold">Citations — week of {week}</h3>
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
              <h3 className="mb-2 font-semibold">Recommendations</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Title</th><th>Type</th><th>Channel</th><th>Priority</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {(data.recs ?? []).map((r: any) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{r.title}</td>
                      <td>{r.rec_type}</td>
                      <td>{r.channel ?? "—"}</td>
                      <td><span className={`rounded px-2 py-0.5 text-xs font-bold ${r.priority === "HIGH" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.priority}</span></td>
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
                  {!data.recs?.length && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No recommendations yet — run a scan.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {subtab === "Reddit Visibility" && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 font-semibold">Reddit Visibility <span className="ml-1 rounded bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">feeds weekly dealer email</span></h3>
              <table className="w-full text-sm tabular-nums">
                <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2">Thread</th><th>Subreddit</th><th>▲ / 💬</th><th>Brand</th><th>Posted</th>
                </tr></thead>
                <tbody>
                  {(data.reddit ?? []).map((t: any) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="py-2"><a href={t.thread_url} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{t.title}</a></td>
                      <td>{t.subreddit}</td>
                      <td>{t.upvotes} / {t.num_comments}</td>
                      <td>{t.brand_mentioned ? <span className="font-semibold text-green-600">Yes</span> : "No"}</td>
                      <td>{t.posted_at ? new Date(t.posted_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                  {!data.reddit?.length && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No Reddit threads captured this week.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
