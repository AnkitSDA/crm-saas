"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

interface Lead {
  id: string; name: string | null; source: string; status: string;
  notes: string | null; utm_campaign: string | null; created_at: string; deal_value?: number | null;
}
interface RangeSel { start: Date; end: Date; label: string; }
interface Spend { id: string; month: string; source: string; amount: number; }

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
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function mKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtShort(d: Date) { return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
function money(n: number) { return "₹" + Math.round(n).toLocaleString("en-IN"); }

const SOURCE_META: Record<string, { label: string; color: string; light: string }> = {
  google_ads: { label: "Google Ads", color: "#10b981", light: "#6ee7b7" },
  meta_ads:   { label: "Meta Ads",   color: "#3b82f6", light: "#93c5fd" },
  website:    { label: "Website",    color: "#64748b", light: "#cbd5e1" },
  manual:     { label: "Manual",     color: "#f59e0b", light: "#fcd34d" },
};
function sourceInfo(s: string) { return SOURCE_META[s] || { label: s.replace("_", " "), color: "#a3a3a3", light: "#d4d4d4" }; }
const STATUS_ORDER = ["new", "contacted", "qualified", "won", "lost"];
const STATUS_COLOR: Record<string, string> = { new: "#3b82f6", contacted: "#eab308", qualified: "#a855f7", won: "#22c55e", lost: "#ef4444" };
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function CountUp({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const start = prev.current, end = value, dur = 600, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else prev.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const num = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString("en-IN");
  return <>{prefix}{num}{suffix}</>;
}

function GradBar({ pct, color, light, count, ready }: { pct: number; color: string; light: string; count: number; ready: boolean }) {
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
      <div className="h-6 rounded-full flex items-center justify-end pr-2 transition-all duration-700 ease-out hover:brightness-105"
        style={{ width: `${ready ? pct : 0}%`, background: `linear-gradient(90deg, ${light}, ${color})`, minWidth: count > 0 ? 26 : 0, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}>
        {count > 0 && <span className="text-[11px] text-white font-semibold drop-shadow">{count}</span>}
      </div>
    </div>
  );
}

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x} ${pts[0].y}` : "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function DateRangePicker({ range, onChange }: { range: RangeSel; onChange: (r: RangeSel) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(range.start.getFullYear(), range.start.getMonth(), 1));
  const [tStart, setTStart] = useState<Date | null>(null);
  const [tEnd, setTEnd] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const today = startOfDay(new Date());
  function openPicker() { setTStart(null); setTEnd(null); setHover(null); setView(new Date(range.start.getFullYear(), range.start.getMonth(), 1)); setOpen(true); }
  function applyRange(s: Date, eInc: Date, label?: string) {
    const start = startOfDay(s), end = addDays(startOfDay(eInc), 1);
    onChange({ start, end, label: label || `${fmtShort(start)} - ${fmtShort(startOfDay(eInc))}` });
    setOpen(false);
  }
  function pickPreset(id: string) {
    const n = new Date();
    if (id === "today") applyRange(today, today, "Today");
    else if (id === "yesterday") { const y = addDays(today, -1); applyRange(y, y, "Yesterday"); }
    else if (id === "7d") applyRange(addDays(today, -6), today, "Last 7 days");
    else if (id === "14d") applyRange(addDays(today, -13), today, "Last 14 days");
    else if (id === "30d") applyRange(addDays(today, -29), today, "Last 30 days");
    else if (id === "90d") applyRange(addDays(today, -89), today, "Last 90 days");
    else if (id === "this") applyRange(new Date(n.getFullYear(), n.getMonth(), 1), today, "This Month");
    else if (id === "last") applyRange(new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0), "Last Month");
    else if (id === "all") { onChange({ start: new Date(2000, 0, 1), end: addDays(today, 1), label: "All time" }); setOpen(false); }
  }
  function clickDay(d: Date) {
    if (d > today) return;
    if (!tStart || (tStart && tEnd)) { setTStart(d); setTEnd(null); return; }
    if (d < tStart) { setTStart(d); return; }
    setTEnd(d); applyRange(tStart, d);
  }
  const presets = [
    { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
    { id: "7d", label: "Last 7 days" }, { id: "14d", label: "Last 14 days" },
    { id: "30d", label: "Last 30 days" }, { id: "90d", label: "Last 90 days" },
    { id: "this", label: "This month" }, { id: "last", label: "Last month" }, { id: "all", label: "All time" },
  ];
  const y = view.getFullYear(), mo = view.getMonth();
  const startWd = new Date(y, mo, 1).getDay(), dim = new Date(y, mo + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let dn = 1; dn <= dim; dn++) cells.push(new Date(y, mo, dn));
  const effEnd = tEnd || hover;
  function inR(d: Date) { if (!tStart || !effEnd) return false; const lo = tStart < effEnd ? tStart : effEnd, hi = tStart < effEnd ? effEnd : tStart; return d > lo && d < hi; }
  return (
    <div className="relative inline-block">
      <button onClick={openPicker} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-white font-medium hover:border-gray-400 hover:shadow-sm transition">
        <span>📅</span><span>{range.label}</span><span className="text-gray-400">▾</span>
      </button>
      {open && (<>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div className="absolute z-50 mt-2 bg-white border rounded-2xl shadow-2xl flex overflow-hidden" style={{ minWidth: 480 }}>
          <div className="w-40 border-r py-2 max-h-[340px] overflow-y-auto">
            {presets.map((p) => (
              <button key={p.id} onClick={() => pickPreset(p.id)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition ${range.label === p.label ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}>{p.label}</button>
            ))}
          </div>
          <div className="p-4" style={{ width: 320 }}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setView(new Date(y, mo - 1, 1))} className="w-7 h-7 rounded hover:bg-gray-100 text-gray-600">‹</button>
              <span className="text-sm font-semibold">{MONTHS[mo]} {y}</span>
              <button onClick={() => setView(new Date(y, mo + 1, 1))} className="w-7 h-7 rounded hover:bg-gray-100 text-gray-600">›</button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAYS.map((w, i) => (<div key={i} className="text-[11px] text-gray-400 font-medium pb-1">{w}</div>))}
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const isStart = tStart && sameDay(d, tStart), isEnd = tEnd && sameDay(d, tEnd);
                const future = d > today, between = inR(d);
                let cls = "text-gray-700 hover:bg-gray-100";
                if (future) cls = "text-gray-300 cursor-default";
                else if (isStart || isEnd) cls = "bg-blue-600 text-white font-semibold";
                else if (between) cls = "bg-blue-100 text-blue-800";
                return (<button key={i} disabled={future} onClick={() => clickDay(d)} onMouseEnter={() => setHover(d)}
                  className={`mx-auto w-8 h-8 rounded-full text-xs flex items-center justify-center transition ${cls}`}>{d.getDate()}</button>);
              })}
            </div>
            {tStart && !tEnd && <p className="text-[11px] text-gray-400 mt-3 text-center">Select end date</p>}
          </div>
        </div>
      </>)}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [spends, setSpends] = useState<Spend[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverSrc, setHoverSrc] = useState<string | null>(null);
  const [roasOpen, setRoasOpen] = useState(false);
  const [range, setRange] = useState<RangeSel>(() => {
    const n = new Date();
    return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 1), label: "This Month" };
  });

  function loadLeads() { return api.get("/leads/?limit=500").then((r) => setLeads(r.data.items || [])); }
  function loadSpends() { return api.get("/leads/spends").then((r) => setSpends(r.data || [])).catch(() => {}); }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    Promise.all([loadLeads(), loadSpends()]).catch(() => router.push("/login")).finally(() => { setLoading(false); setTimeout(() => setReady(true), 60); });
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading dashboard...</div>;

  const periodLeads = leads.filter((l) => { const d = new Date(l.created_at); return d >= range.start && d < range.end; });
  const filtered = sourceFilter ? periodLeads.filter((l) => l.source === sourceFilter) : periodLeads;

  const rangeLen = range.end.getTime() - range.start.getTime();
  const prevStart = new Date(range.start.getTime() - rangeLen);
  const prevAll = leads.filter((l) => { const d = new Date(l.created_at); return d >= prevStart && d < range.start; });
  const prevFiltered = sourceFilter ? prevAll.filter((l) => l.source === sourceFilter) : prevAll;
  const prevTotal = prevFiltered.length;

  // months covered by range (for ad spend)
  const monthsSet = new Set<string>();
  { let d = new Date(range.start.getFullYear(), range.start.getMonth(), 1); const last = new Date(range.end.getTime() - 1);
    let g = 0; while (d <= last && g < 400) { monthsSet.add(mKey(d)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); g++; } }

  let trendRaw: string[] = [];
  const todayMid = startOfDay(new Date());
  const stop = range.end < addDays(todayMid, 1) ? range.end : addDays(todayMid, 1);
  let dd = new Date(range.start); let guard = 0;
  while (dd < stop && guard < 800) { trendRaw.push(dayKey(dd)); dd = addDays(dd, 1); guard++; }
  if (trendRaw.length === 0) trendRaw.push(dayKey(todayMid));
  const trendDates = trendRaw.length > 62 ? trendRaw.slice(-62) : trendRaw;

  const total = filtered.length;
  const won = filtered.filter((l) => l.status === "won").length;
  const convRate = total > 0 ? Math.round((won / total) * 100) : 0;
  const avgPerDay = total / Math.max(1, trendDates.length);
  const deltaPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  // ROAS
  const revenue = filtered.filter((l) => l.status === "won").reduce((sum, l) => sum + (l.deal_value || 0), 0);
  const adSpend = spends.filter((s) => monthsSet.has(s.month) && (sourceFilter ? s.source === sourceFilter : true)).reduce((sum, s) => sum + (s.amount || 0), 0);
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const cpl = adSpend > 0 && total > 0 ? adSpend / total : 0;
  const cpa = adSpend > 0 && won > 0 ? adSpend / won : 0;

  const sourceCounts: Record<string, number> = {};
  periodLeads.forEach((l) => { sourceCounts[l.source] = (sourceCounts[l.source] || 0) + 1; });
  const sourceTotal = periodLeads.length;
  const sourceData = Object.entries(sourceCounts).map(([s, c]) => ({ source: s, count: c, ...sourceInfo(s) })).sort((a, b) => b.count - a.count);

  const statusCounts: Record<string, number> = {};
  filtered.forEach((l) => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });
  const maxStatus = Math.max(1, ...STATUS_ORDER.map((s) => statusCounts[s] || 0));

  const cityCounts: Record<string, number> = {};
  filtered.forEach((l) => { const city = parseNotes(l.notes).city; if (city) { const k = city.trim(); cityCounts[k] = (cityCounts[k] || 0) + 1; } });
  const topCities = Object.entries(cityCounts).map(([c, n]) => ({ city: c, count: n })).sort((a, b) => b.count - a.count).slice(0, 8);
  const maxCity = Math.max(1, ...topCities.map((c) => c.count));

  const qtyCounts: Record<string, number> = {};
  filtered.forEach((l) => { const p = parseNotes(l.notes); const q = p.quantity || p.message || p.requirement; if (q) { const k = q.trim(); qtyCounts[k] = (qtyCounts[k] || 0) + 1; } });
  const qtyData = Object.entries(qtyCounts).map(([q, n]) => ({ qty: q, count: n })).sort((a, b) => b.count - a.count).slice(0, 6);
  const maxQty = Math.max(1, ...qtyData.map((q) => q.count));

  const dayMap: Record<string, number> = {};
  trendDates.forEach((d) => { dayMap[d] = 0; });
  filtered.forEach((l) => { const k = dayKey(new Date(l.created_at)); if (k in dayMap) dayMap[k]++; });
  const trend = trendDates.map((date) => ({ date, count: dayMap[date] }));
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  const campMap: Record<string, { total: number; won: number }> = {};
  filtered.forEach((l) => { const c = l.utm_campaign; if (!c) return; if (!campMap[c]) campMap[c] = { total: 0, won: 0 }; campMap[c].total++; if (l.status === "won") campMap[c].won++; });
  const campaigns = Object.entries(campMap).map(([c, v]) => ({ campaign: c, ...v })).sort((a, b) => b.total - a.total).slice(0, 6);

  const R = 68, C = 2 * Math.PI * R, GAP = sourceData.length > 1 ? 6 : 0;
  let cumulative = 0;
  const donutSegments = sourceData.map((s) => {
    const frac = sourceTotal > 0 ? s.count / sourceTotal : 0;
    const seg = { ...s, frac, dash: Math.max(0, frac * C - GAP), offset: -cumulative * C };
    cumulative += frac; return seg;
  });

  const W = 660, H = 230, PADX = 30, PADY = 24;
  const pts = trend.map((t, i) => {
    const x = PADX + (i * (W - 2 * PADX)) / Math.max(1, trend.length - 1);
    const yy = H - PADY - (t.count / maxTrend) * (H - 2 * PADY);
    return { x, y: yy, ...t };
  });
  const linePath = smoothPath(pts);
  const areaPath = pts.length ? `${linePath} L ${pts[pts.length - 1].x} ${H - PADY} L ${pts[0].x} ${H - PADY} Z` : "";
  const hp = hoverIdx != null && pts[hoverIdx] ? pts[hoverIdx] : null;
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxTrend * f));

  function toggleSource(s: string) { setSourceFilter((cur) => (cur === s ? "" : s)); }
  function onLineMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(trend.length - 1, Math.round(f * (trend.length - 1)))));
  }

  const wonLeadsInPeriod = filtered.filter((l) => l.status === "won");

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg,#f8fafc,#eef2f7)" }}>
      <div className="bg-white/80 backdrop-blur border-b px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex gap-4 items-center">
          <button onClick={() => router.push("/leads")} className="text-sm text-blue-600 hover:underline">Leads</button>
          <button onClick={() => router.push("/settings")} className="text-sm text-blue-600 hover:underline">Settings</button>
          <button onClick={() => { localStorage.clear(); router.push("/login"); }} className="text-sm text-red-500 hover:underline">Logout</button>
        </div>
      </div>

      <div className="px-6 lg:px-10 py-6 max-w-[1760px] mx-auto">
        {/* Toolbar */}
        <div className="bg-white border rounded-2xl p-3 mb-6 flex flex-wrap items-center gap-3 shadow-sm">
          <span className="text-sm text-gray-500 font-medium">Period:</span>
          <DateRangePicker range={range} onChange={(r) => setRange(r)} />
          <div className="h-6 w-px bg-gray-200 mx-1 hidden sm:block" />
          <span className="text-xs text-gray-400">Source:</span>
          <button onClick={() => setSourceFilter("")} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${sourceFilter === "" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>All</button>
          {sourceData.map((s) => (
            <button key={s.source} onClick={() => toggleSource(s.source)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${sourceFilter === s.source ? "text-white border-transparent shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
              style={sourceFilter === s.source ? { background: s.color } : {}}>
              <span className="w-2 h-2 rounded-full" style={{ background: sourceFilter === s.source ? "#fff" : s.color }} />{s.label}
            </button>
          ))}
          <button onClick={() => setRoasOpen(true)} className="ml-auto text-xs font-medium border rounded-lg px-3 py-1.5 bg-white hover:border-gray-400 transition">⚙ Manage ROAS</button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <KpiCard label="Total Leads" icon="👥" iconBg="#eff6ff" accent="text-gray-900" delta={deltaPct}><CountUp value={total} /></KpiCard>
          <KpiCard label="Won" icon="🏆" iconBg="#ecfdf5" accent="text-green-600"><CountUp value={won} suffix={` (${convRate}%)`} /></KpiCard>
          <KpiCard label="Avg / Day" icon="⚡" iconBg="#fffbeb" accent="text-amber-600"><CountUp value={avgPerDay} decimals={1} /></KpiCard>
          <KpiCard label="Active Sources" icon="📊" iconBg="#f5f3ff" accent="text-violet-600"><CountUp value={sourceData.length} /></KpiCard>
        </div>

        {/* ROAS row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <RoasCard label="Ad Spend" accent="text-rose-600"><CountUp value={adSpend} prefix="₹" /></RoasCard>
          <RoasCard label="Revenue (Won)" accent="text-green-600"><CountUp value={revenue} prefix="₹" /></RoasCard>
          <RoasCard label="ROAS" accent="text-indigo-600">{adSpend > 0 ? <CountUp value={roas} decimals={1} suffix="x" /> : "—"}</RoasCard>
          <RoasCard label="Cost / Lead" accent="text-gray-800">{cpl > 0 ? money(cpl) : "—"}</RoasCard>
          <RoasCard label="Cost / Sale" accent="text-gray-800">{cpa > 0 ? money(cpa) : "—"}</RoasCard>
        </div>

        {/* Trend + Donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="lg:col-span-2 bg-white border rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Leads Trend · {range.label}{sourceFilter ? ` (${sourceInfo(sourceFilter).label})` : ""}</h3>
            <div className="relative">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ maxHeight: 280 }} onMouseMove={onLineMove} onMouseLeave={() => setHoverIdx(null)}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.30" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient>
                </defs>
                {gridVals.map((v, i) => { const gy = H - PADY - (v / maxTrend) * (H - 2 * PADY);
                  return (<g key={i}><line x1={PADX} y1={gy} x2={W - PADX} y2={gy} stroke="#f1f5f9" strokeWidth="1" /><text x={PADX - 6} y={gy + 3} textAnchor="end" style={{ fontSize: 9 }} className="fill-gray-300">{v}</text></g>); })}
                <path d={areaPath} fill="url(#areaGrad)" style={{ opacity: ready ? 1 : 0, transition: "opacity 0.7s" }} />
                <path d={linePath} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={2000} strokeDashoffset={ready ? 0 : 2000} style={{ transition: "stroke-dashoffset 1.1s ease-out" }} />
                {hp && <line x1={hp.x} y1={PADY - 6} x2={hp.x} y2={H - PADY} stroke="#6366f1" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />}
                {pts.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 5.5 : 0} fill="#fff" stroke="#6366f1" strokeWidth="2.5" style={{ transition: "r 0.15s" }} />))}
                <line x1={PADX} y1={H - PADY} x2={W - PADX} y2={H - PADY} stroke="#e5e7eb" strokeWidth="1" />
              </svg>
              {hp && (
                <div className="absolute pointer-events-none bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap"
                  style={{ left: `${(hp.x / W) * 100}%`, top: `${(hp.y / H) * 100}%`, transform: "translate(-50%, -135%)" }}>
                  <div className="font-semibold">{hp.count} lead{hp.count !== 1 ? "s" : ""}</div>
                  <div className="text-gray-300">{new Date(hp.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Lead Sources</h3>
            {sourceTotal === 0 ? <p className="text-xs text-gray-400">No data in this period</p> : (
              <div className="flex flex-col items-center">
                <svg viewBox="0 0 180 180" className="w-44 h-44">
                  <defs>
                    <filter id="donutShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.18" /></filter>
                    {donutSegments.map((s, i) => (<linearGradient key={i} id={`grad-${s.source}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor={s.light} /><stop offset="100%" stopColor={s.color} /></linearGradient>))}
                  </defs>
                  <g transform="rotate(-90 90 90)" filter="url(#donutShadow)">
                    {donutSegments.map((s, i) => (
                      <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={`url(#grad-${s.source})`} strokeWidth={hoverSrc === s.source ? 24 : 20} strokeLinecap="round"
                        strokeDasharray={`${ready ? s.dash : 0} ${C}`} strokeDashoffset={s.offset} className="cursor-pointer"
                        onMouseEnter={() => setHoverSrc(s.source)} onMouseLeave={() => setHoverSrc(null)} onClick={() => toggleSource(s.source)}
                        style={{ opacity: hoverSrc && hoverSrc !== s.source ? 0.3 : (sourceFilter && sourceFilter !== s.source ? 0.35 : 1), transition: "stroke-dasharray 0.9s ease-out, opacity 0.2s, stroke-width 0.2s" }} />
                    ))}
                  </g>
                  <text x="90" y="85" textAnchor="middle" className="fill-gray-900" style={{ fontSize: 28, fontWeight: 800 }}>{hoverSrc ? (sourceCounts[hoverSrc] || 0) : sourceTotal}</text>
                  <text x="90" y="104" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>{hoverSrc ? sourceInfo(hoverSrc).label : "total leads"}</text>
                </svg>
                <div className="mt-4 w-full space-y-1.5">
                  {donutSegments.map((s, i) => (
                    <button key={i} onClick={() => toggleSource(s.source)} onMouseEnter={() => setHoverSrc(s.source)} onMouseLeave={() => setHoverSrc(null)}
                      className={`w-full flex items-center justify-between text-xs rounded-lg px-2 py-1.5 transition ${sourceFilter === s.source ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                      <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: `linear-gradient(135deg, ${s.light}, ${s.color})` }} />{s.label}</span>
                      <span className="text-gray-500 font-medium">{s.count} <span className="text-gray-400">({Math.round(s.frac * 100)}%)</span></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status + Quantity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Pipeline (Status)</h3>
            <div className="space-y-3">
              {STATUS_ORDER.map((s) => { const c = statusCounts[s] || 0; const col = STATUS_COLOR[s];
                return (<div key={s} className="flex items-center gap-3" title={`${c} ${s}`}><span className="w-20 text-xs capitalize text-gray-600">{s}</span><GradBar pct={(c / maxStatus) * 100} color={col} light={col + "99"} count={c} ready={ready} /></div>); })}
            </div>
          </div>
          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Quantity Requested</h3>
            {qtyData.length === 0 ? <p className="text-xs text-gray-400">No quantity data</p> : (
              <div className="space-y-3">
                {qtyData.map((q) => (<div key={q.qty} className="flex items-center gap-3" title={`${q.qty}: ${q.count}`}><span className="w-28 text-xs text-gray-600 truncate">{q.qty}</span><GradBar pct={(q.count / maxQty) * 100} color="#d97706" light="#fcd34d" count={q.count} ready={ready} /></div>))}
              </div>
            )}
          </div>
        </div>

        {/* Cities + Campaigns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Cities</h3>
            {topCities.length === 0 ? <p className="text-xs text-gray-400">No city data</p> : (
              <div className="space-y-3">
                {topCities.map((c) => (<div key={c.city} className="flex items-center gap-3" title={`${c.city}: ${c.count}`}><span className="w-24 text-xs text-gray-600 truncate">{c.city}</span><GradBar pct={(c.count / maxCity) * 100} color="#2563eb" light="#93c5fd" count={c.count} ready={ready} /></div>))}
              </div>
            )}
          </div>
          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Campaign Performance</h3>
            {campaigns.length === 0 ? <p className="text-xs text-gray-400">No campaign data</p> : (
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500 border-b"><th className="text-left py-2 font-medium">Campaign</th><th className="text-right py-2 font-medium">Leads</th><th className="text-right py-2 font-medium">Won</th></tr></thead>
                <tbody>
                  {campaigns.map((c) => (<tr key={c.campaign} className="border-b last:border-0 hover:bg-gray-50 transition"><td className="py-2 truncate max-w-[160px]" title={c.campaign}>{c.campaign}</td><td className="py-2 text-right font-medium">{c.total}</td><td className="py-2 text-right text-green-600 font-medium">{c.won}</td></tr>))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">Showing {range.label.toLowerCase()} · {total} leads · {leads.length} total in system</p>
      </div>

      {roasOpen && (
        <RoasModal spends={spends} wonLeads={wonLeadsInPeriod} onClose={() => setRoasOpen(false)}
          onSpendSaved={loadSpends} onDealSaved={loadLeads} />
      )}
    </div>
  );
}

function KpiCard({ label, icon, iconBg, accent, delta, children }: { label: string; icon: string; iconBg: string; accent: string; delta?: number | null; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm transition hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-2"><span className="text-xs text-gray-500">{label}</span><span className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: iconBg }}>{icon}</span></div>
      <div className={`text-2xl font-bold ${accent}`}>{children}</div>
      {delta !== undefined && delta !== null && (<div className={`text-[11px] mt-1 font-medium ${delta >= 0 ? "text-green-600" : "text-red-500"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs prev period</div>)}
    </div>
  );
}

function RoasCard({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${accent}`}>{children}</div>
    </div>
  );
}

function RoasModal({ spends, wonLeads, onClose, onSpendSaved, onDealSaved }: {
  spends: Spend[]; wonLeads: Lead[]; onClose: () => void; onSpendSaved: () => Promise<void> | void; onDealSaved: () => Promise<void> | void;
}) {
  const now = new Date();
  const monthOpts: string[] = [];
  for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); monthOpts.push(mKey(d)); }
  const [sMonth, setSMonth] = useState(monthOpts[0]);
  const [sSource, setSSource] = useState("google_ads");
  const [sAmount, setSAmount] = useState("");
  const [dealVals, setDealVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {}; wonLeads.forEach((l) => { o[l.id] = l.deal_value ? String(l.deal_value) : ""; }); return o;
  });
  const [busy, setBusy] = useState(false);

  async function saveSpend() {
    if (!sAmount) return;
    setBusy(true);
    try { await api.post("/leads/spends", { month: sMonth, source: sSource, amount: parseFloat(sAmount) }); setSAmount(""); await onSpendSaved(); } finally { setBusy(false); }
  }
  async function delSpend(id: string) { await api.delete(`/leads/spends/${id}`); await onSpendSaved(); }
  async function saveDeal(id: string) {
    const v = dealVals[id]; setBusy(true);
    try { await api.patch(`/leads/${id}`, { deal_value: v ? parseFloat(v) : null }); await onDealSaved(); } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-3 flex justify-between items-center">
          <h2 className="font-semibold">Manage ROAS</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">Close ✕</button>
        </div>

        <div className="p-5 space-y-6">
          {/* Ad Spend */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">💸 Ad Spend (per month)</h3>
            <div className="flex flex-wrap gap-2 items-end mb-3">
              <div><label className="text-[11px] text-gray-500 block mb-1">Month</label>
                <select value={sMonth} onChange={(e) => setSMonth(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                  {monthOpts.map((m) => (<option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</option>))}
                </select></div>
              <div><label className="text-[11px] text-gray-500 block mb-1">Source</label>
                <select value={sSource} onChange={(e) => setSSource(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                  <option value="google_ads">Google Ads</option><option value="meta_ads">Meta Ads</option><option value="website">Website</option><option value="all">All / Other</option>
                </select></div>
              <div><label className="text-[11px] text-gray-500 block mb-1">Amount (₹)</label>
                <input type="number" value={sAmount} onChange={(e) => setSAmount(e.target.value)} placeholder="e.g. 40000" className="border rounded-lg px-2 py-1.5 text-sm w-32" /></div>
              <button onClick={saveSpend} disabled={busy || !sAmount} className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50">Save</button>
            </div>
            {spends.length === 0 ? <p className="text-xs text-gray-400">No ad spend entered yet.</p> : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {spends.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-1.5">
                    <span>{new Date(s.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })} · {sourceInfo(s.source).label}</span>
                    <span className="flex items-center gap-3"><span className="font-medium">{money(s.amount)}</span><button onClick={() => delSpend(s.id)} className="text-red-500 hover:underline">delete</button></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deal values */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">🏆 Won Deals — Order Value (this period)</h3>
            {wonLeads.length === 0 ? <p className="text-xs text-gray-400">No "won" leads in the selected period. Mark leads as Won on the Leads page first.</p> : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {wonLeads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-sm bg-gray-50 rounded px-3 py-1.5">
                    <span className="truncate flex-1">{l.name || "Unknown"} <span className="text-gray-400 text-xs">{sourceInfo(l.source).label}</span></span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs">₹</span>
                      <input type="number" value={dealVals[l.id] || ""} onChange={(e) => setDealVals({ ...dealVals, [l.id]: e.target.value })} placeholder="value" className="border rounded px-2 py-1 text-xs w-24" />
                      <button onClick={() => saveDeal(l.id)} disabled={busy} className="text-xs bg-green-600 text-white rounded px-2 py-1 disabled:opacity-50">Save</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
