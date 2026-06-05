"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

interface Lead {
  id: string;
  name: string | null;
  source: string;
  status: string;
  notes: string | null;
  utm_campaign: string | null;
  created_at: string;
}

function parseNotes(notes: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!notes) return result;
  const text = notes.replace(/\s+/g, " ").trim();
  const knownKeys = ["Form", "Message", "Quantity", "Requirement", "City"];
  const keyAlt = knownKeys.join("|");
  const regex = new RegExp(`(${keyAlt})\\s*:\\s*(.+?)(?=\\s+(?:${keyAlt})\\s*:|$)`, "gi");
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) result[m[1].toLowerCase()] = m[2].trim();
  return result;
}

const SOURCE_META: Record<string, { label: string; color: string }> = {
  google_ads: { label: "Google Ads", color: "#10b981" },
  meta_ads:   { label: "Meta Ads",   color: "#3b82f6" },
  website:    { label: "Website",    color: "#64748b" },
  manual:     { label: "Manual",     color: "#f59e0b" },
};
function sourceInfo(s: string) {
  return SOURCE_META[s] || { label: s.replace("_", " "), color: "#a3a3a3" };
}

const STATUS_ORDER = ["new", "contacted", "qualified", "won", "lost"];
const STATUS_COLOR: Record<string, string> = {
  new: "#3b82f6", contacted: "#eab308", qualified: "#a855f7", won: "#22c55e", lost: "#ef4444",
};

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
  { id: 3650, label: "All time" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(30);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    api.get("/leads/?limit=500")
      .then((r) => setLeads(r.data.items || []))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  // ---- Filter by range ----
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const inRange = leads.filter((l) => new Date(l.created_at) >= cutoff);

  // ---- KPIs ----
  const total = inRange.length;
  const now = new Date();
  const thisMonth = inRange.filter((l) => {
    const d = new Date(l.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const won = inRange.filter((l) => l.status === "won").length;
  const convRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const daysSpan = Math.max(1, Math.min(rangeDays, 90));
  const avgPerDay = (total / daysSpan).toFixed(1);

  // ---- Source breakdown ----
  const sourceCounts: Record<string, number> = {};
  inRange.forEach((l) => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
  const sourceData = Object.entries(sourceCounts)
    .map(([s, c]) => ({ source: s, count: c, ...sourceInfo(s) }))
    .sort((a, b) => b.count - a.count);

  // ---- Status funnel ----
  const statusCounts: Record<string, number> = {};
  inRange.forEach((l) => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
  const maxStatus = Math.max(1, ...STATUS_ORDER.map((s) => statusCounts[s] || 0));

  // ---- Top cities ----
  const cityCounts: Record<string, number> = {};
  inRange.forEach((l) => {
    const city = parseNotes(l.notes).city;
    if (city) {
      const key = city.trim();
      cityCounts[key] = (cityCounts[key] || 0) + 1;
    }
  });
  const topCities = Object.entries(cityCounts).map(([c, n]) => ({ city: c, count: n }))
    .sort((a, b) => b.count - a.count).slice(0, 8);
  const maxCity = Math.max(1, ...topCities.map((c) => c.count));

  // ---- Quantity distribution ----
  const qtyCounts: Record<string, number> = {};
  inRange.forEach((l) => {
    const p = parseNotes(l.notes);
    const q = p.quantity || p.message || p.requirement;
    if (q) { const key = q.trim(); qtyCounts[key] = (qtyCounts[key] || 0) + 1; }
  });
  const qtyData = Object.entries(qtyCounts).map(([q, n]) => ({ qty: q, count: n }))
    .sort((a, b) => b.count - a.count).slice(0, 6);
  const maxQty = Math.max(1, ...qtyData.map((q) => q.count));

  // ---- Daily trend ----
  const dayMap: Record<string, number> = {};
  const trendDays = Math.min(rangeDays, 30);
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dayMap[d.toISOString().slice(0, 10)] = 0;
  }
  inRange.forEach((l) => {
    const key = new Date(l.created_at).toISOString().slice(0, 10);
    if (key in dayMap) dayMap[key]++;
  });
  const trend = Object.entries(dayMap).map(([date, count]) => ({ date, count }));
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  // ---- Campaign performance ----
  const campMap: Record<string, { total: number; won: number }> = {};
  inRange.forEach((l) => {
    const c = l.utm_campaign;
    if (!c) return;
    if (!campMap[c]) campMap[c] = { total: 0, won: 0 };
    campMap[c].total++;
    if (l.status === "won") campMap[c].won++;
  });
  const campaigns = Object.entries(campMap).map(([c, v]) => ({ campaign: c, ...v }))
    .sort((a, b) => b.total - a.total).slice(0, 6);

  // ---- Donut geometry ----
  const R = 70, C = 2 * Math.PI * R;
  let cumulative = 0;
  const donutSegments = sourceData.map((s) => {
    const frac = total > 0 ? s.count / total : 0;
    const seg = { ...s, frac, dash: frac * C, offset: -cumulative * C };
    cumulative += frac;
    return seg;
  });

  // ---- Line chart geometry ----
  const W = 640, H = 180, PAD = 24;
  const pts = trend.map((t, i) => {
    const x = PAD + (i * (W - 2 * PAD)) / Math.max(1, trend.length - 1);
    const y = H - PAD - (t.count / maxTrend) * (H - 2 * PAD);
    return { x, y, ...t };
  });
  const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = pts.length
    ? `M ${PAD},${H - PAD} L ${pts.map((p) => `${p.x},${p.y}`).join(" L ")} L ${W - PAD},${H - PAD} Z`
    : "";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex gap-4 items-center">
          <button onClick={() => router.push("/leads")} className="text-sm text-blue-600 hover:underline">Leads</button>
          <button onClick={() => router.push("/settings")} className="text-sm text-blue-600 hover:underline">Settings</button>
          <button onClick={() => { localStorage.clear(); router.push("/login"); }} className="text-sm text-red-500 hover:underline">Logout</button>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        {/* Range filter */}
        <div className="flex gap-2 mb-5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRangeDays(r.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${rangeDays === r.id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Total Leads" value={total} accent="text-gray-900" />
          <KpiCard label="This Month" value={thisMonth} accent="text-blue-600" />
          <KpiCard label="Won" value={`${won} (${convRate}%)`} accent="text-green-600" />
          <KpiCard label="Avg / Day" value={avgPerDay} accent="text-amber-600" />
        </div>

        {/* Row: Trend + Source donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Leads Trend (last {trendDays} days)</h3>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
              <path d={areaPath} fill="#3b82f6" opacity="0.08" />
              <polyline points={polyline} fill="none" stroke="#3b82f6" strokeWidth="2" />
              {pts.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />))}
              <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e5e7eb" strokeWidth="1" />
            </svg>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
              <span>{trend[0]?.date.slice(5)}</span>
              <span>{trend[Math.floor(trend.length / 2)]?.date.slice(5)}</span>
              <span>{trend[trend.length - 1]?.date.slice(5)}</span>
            </div>
          </div>

          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Lead Sources</h3>
            {total === 0 ? (
              <p className="text-xs text-gray-400">No data</p>
            ) : (
              <div className="flex flex-col items-center">
                <svg viewBox="0 0 180 180" className="w-40 h-40">
                  <g transform="rotate(-90 90 90)">
                    {donutSegments.map((s, i) => (
                      <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={s.color}
                        strokeWidth="22" strokeDasharray={`${s.dash} ${C}`} strokeDashoffset={s.offset} />
                    ))}
                  </g>
                  <text x="90" y="86" textAnchor="middle" className="fill-gray-900" style={{ fontSize: 26, fontWeight: 700 }}>{total}</text>
                  <text x="90" y="104" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>leads</text>
                </svg>
                <div className="mt-3 w-full space-y-1.5">
                  {donutSegments.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="text-gray-500">{s.count} ({Math.round(s.frac * 100)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Row: Status funnel + Quantity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Pipeline (Status)</h3>
            <div className="space-y-2.5">
              {STATUS_ORDER.map((s) => {
                const c = statusCounts[s] || 0;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-20 text-xs capitalize text-gray-600">{s}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full flex items-center justify-end pr-2" style={{ width: `${(c / maxStatus) * 100}%`, background: STATUS_COLOR[s], minWidth: c > 0 ? 24 : 0 }}>
                        {c > 0 && <span className="text-[10px] text-white font-medium">{c}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Quantity Requested</h3>
            {qtyData.length === 0 ? <p className="text-xs text-gray-400">No quantity data</p> : (
              <div className="space-y-2.5">
                {qtyData.map((q) => (
                  <div key={q.qty} className="flex items-center gap-3">
                    <span className="w-28 text-xs text-gray-600 truncate" title={q.qty}>{q.qty}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full bg-amber-500 flex items-center justify-end pr-2" style={{ width: `${(q.count / maxQty) * 100}%`, minWidth: 24 }}>
                        <span className="text-[10px] text-white font-medium">{q.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row: Top cities + Campaigns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Cities</h3>
            {topCities.length === 0 ? <p className="text-xs text-gray-400">No city data</p> : (
              <div className="space-y-2.5">
                {topCities.map((c) => (
                  <div key={c.city} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-gray-600 truncate" title={c.city}>{c.city}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="h-5 rounded-full bg-blue-500 flex items-center justify-end pr-2" style={{ width: `${(c.count / maxCity) * 100}%`, minWidth: 24 }}>
                        <span className="text-[10px] text-white font-medium">{c.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Campaign Performance</h3>
            {campaigns.length === 0 ? <p className="text-xs text-gray-400">No campaign data</p> : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-1.5 font-medium">Campaign</th>
                    <th className="text-right py-1.5 font-medium">Leads</th>
                    <th className="text-right py-1.5 font-medium">Won</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.campaign} className="border-b last:border-0">
                      <td className="py-1.5 truncate max-w-[160px]" title={c.campaign}>{c.campaign}</td>
                      <td className="py-1.5 text-right">{c.total}</td>
                      <td className="py-1.5 text-right text-green-600">{c.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Showing data for {RANGES.find((r) => r.id === rangeDays)?.label.toLowerCase()} · {leads.length} total leads in system
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}