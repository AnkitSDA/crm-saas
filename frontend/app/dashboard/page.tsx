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
  google_ads: { label: "Google Ads", color: "#059669", light: "#34d399" },
  meta_ads:   { label: "Meta Ads",   color: "#2563eb", light: "#60a5fa" },
  website:    { label: "Website",    color: "#64748b", light: "#94a3b8" },
  manual:     { label: "Manual",     color: "#d97706", light: "#fbbf24" },
};
function sourceInfo(s: string) { return SOURCE_META[s] || { label: s.replace("_", " "), color: "#94a3b8", light: "#cbd5e1" }; }
const STATUS_ORDER = ["new", "contacted", "qualified", "won", "lost"];
const STATUS_COLOR: Record<string, string> = { new: "#2563eb", contacted: "#d97706", qualified: "#7c3aed", won: "#059669", lost: "#dc2626" };
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/* ---------- Inline SVG icons (no emojis) ---------- */
const ic = {
  dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  leads:     <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  settings:  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  users:     <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  trophy:    <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2z" /></>,
  activity:  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  layers:    <><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></>,
  calendar:  <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  sliders:   <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></>,
  rupee:     <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3c4 0 6-2 6-5" />,
};
function Icon({ d, size = 15, className = "" }: { d: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
  );
}

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

function GradBar({ pct, color, count, ready }: { pct: number; color: string; count: number; ready: boolean }) {
  return (
    <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden">
      <div className="h-4 rounded flex items-center justify-end pr-1.5 transition-all duration-700 ease-out"
        style={{ width: `${ready ? pct : 0}%`, background: color, minWidth: count > 0 ? 22 : 0 }}>
        {count > 0 && <span className="text-[10px] text-white font-semibold">{count}</span>}
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
      <button onClick={openPicker} className="flex items-center gap-2 border border-slate-300 rounded px-3 py-1.5 text-[13px] bg-white font-medium text-slate-700 hover:border-slate-400 transition">
        <Icon d={ic.calendar} size={13} className="text-slate-500" /><span>{range.label}</span><span className="text-slate-400 text-[10px]">▾</span>
      </button>
      {open && (<>
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        <div className="absolute z-50 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl flex overflow-hidden" style={{ minWidth: 480 }}>
          <div className="w-40 border-r border-slate-100 py-2 max-h-[340px] overflow-y-auto">
            {presets.map((p) => (
              <button key={p.id} onClick={() => pickPreset(p.id)}
                className={`w-full text-left px-4 py-1.5 text-[13px] hover:bg-slate-50 transition ${range.label === p.label ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600"}`}>{p.label}</button>
            ))}
          </div>
          <div className="p-4" style={{ width: 320 }}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setView(new Date(y, mo - 1, 1))} className="w-7 h-7 rounded hover:bg-slate-100 text-slate-600">‹</button>
              <span className="text-[13px] font-semibold text-slate-800">{MONTHS[mo]} {y}</span>
              <button onClick={() => setView(new Date(y, mo + 1, 1))} className="w-7 h-7 rounded hover:bg-slate-100 text-slate-600">›</button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAYS.map((w, i) => (<div key={i} className="text-[10px] text-slate-400 font-medium pb-1">{w}</div>))}
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const isStart = tStart && sameDay(d, tStart), isEnd = tEnd && sameDay(d, tEnd);
                const future = d > today, between = inR(d);
                let cls = "text-slate-700 hover:bg-slate-100";
                if (future) cls = "text-slate-300 cursor-default";
                else if (isStart || isEnd) cls = "bg-slate-800 text-white font-semibold";
                else if (between) cls = "bg-slate-100 text-slate-800";
                return (<button key={i} disabled={future} onClick={() => clickDay(d)} onMouseEnter={() => setHover(d)}
                  className={`mx-auto w-8 h-8 rounded text-xs flex items-center justify-center transition ${cls}`}>{d.getDate()}</button>);
              })}
            </div>
            {tStart && !tEnd && <p className="text-[10px] text-slate-400 mt-3 text-center">Select end date</p>}
          </div>
        </div>
      </>)}
    </div>
  );
}

/* ---------- App shell: dark sidebar (desktop) + top bar ---------- */
function AppShell({ brand, active, onLogout, children, router }: {
  brand: { name: string; logo: string; color: string }; active: string;
  onLogout: () => void; children: React.ReactNode; router: any;
}) {
  const nav = [
    { label: "Dashboard", path: "/dashboard", icon: ic.dashboard },
    { label: "Leads", path: "/leads", icon: ic.leads },
    { label: "Settings", path: "/settings", icon: ic.settings },
  ];
  return (
    <div className="min-h-screen bg-[#f4f5f7] flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 bg-[#1b2431] text-slate-300 sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-white/10 flex items-center gap-2.5 min-h-[57px]">
          {brand.logo ? <img src={brand.logo} alt="" className="h-7 w-7 rounded object-cover shrink-0" onError={(e: any) => { e.target.style.display = "none"; }} /> : null}
          <span className="text-[13px] font-semibold text-white truncate leading-tight">{brand.name || "CRM"}</span>
        </div>
        <nav className="flex-1 py-3">
          {nav.map((n) => {
            const isActive = n.path === active;
            return (
              <button key={n.path} onClick={() => router.push(n.path)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition border-l-2 ${isActive ? "bg-white/10 text-white" : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
                style={isActive ? { borderColor: brand.color === "#111827" ? "#3b82f6" : brand.color } : undefined}>
                <Icon d={n.icon} size={15} />{n.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-2 py-2 text-[13px] text-slate-400 hover:text-white rounded hover:bg-white/5 transition">
            <Icon d={ic.logout} size={15} />Sign out
          </button>
          <p className="text-[10px] text-slate-500 px-2 pt-2">Powered by Brandbanalo</p>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="lg:hidden bg-[#1b2431] text-white sticky top-0 z-30">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {brand.logo ? <img src={brand.logo} alt="" className="h-7 w-7 rounded object-cover shrink-0" onError={(e: any) => { e.target.style.display = "none"; }} /> : null}
              <span className="text-sm font-semibold truncate">{brand.name || "CRM"}</span>
            </div>
            <button onClick={onLogout} className="text-slate-300 hover:text-white"><Icon d={ic.logout} size={16} /></button>
          </div>
          <nav className="px-2 flex gap-1 overflow-x-auto border-t border-white/10">
            {nav.map((n) => (
              <button key={n.path} onClick={() => router.push(n.path)}
                className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 ${n.path === active ? "border-blue-400 text-white" : "border-transparent text-slate-400"}`}>{n.label}</button>
            ))}
          </nav>
        </header>
        {children}
      </div>
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
  const [brand, setBrand] = useState<{ name: string; logo: string; color: string }>({ name: "", logo: "", color: "#111827" });
  const [range, setRange] = useState<RangeSel>(() => {
    const n = new Date();
    return { start: new Date(n.getFullYear(), n.getMonth(), 1), end: new Date(n.getFullYear(), n.getMonth() + 1, 1), label: "This Month" };
  });

  function loadLeads() { return api.get("/leads/?limit=500").then((r) => setLeads(r.data.items || [])); }
  function loadSpends() { return api.get("/leads/spends").then((r) => setSpends(r.data || [])).catch(() => {}); }
  function loadTenant() {
    return api.get("/tenant/me").then((r) => {
      setBrand({
        name: r.data.brand_name || r.data.name || "",
        logo: r.data.logo_url || "",
        color: r.data.accent_color || "#111827",
      });
    }).catch(() => {});
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    if (localStorage.getItem("role") === "super_admin") { router.push("/agency"); return; }
    loadTenant();
    Promise.all([loadLeads(), loadSpends()]).catch(() => router.push("/login")).finally(() => { setLoading(false); setTimeout(() => setReady(true), 60); });
  }, []);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm bg-[#f4f5f7]">Loading dashboard...</div>;

  const periodLeads = leads.filter((l) => { const d = new Date(l.created_at); return d >= range.start && d < range.end; });
  const filtered = sourceFilter ? periodLeads.filter((l) => l.source === sourceFilter) : periodLeads;

  const rangeLen = range.end.getTime() - range.start.getTime();
  const prevStart = new Date(range.start.getTime() - rangeLen);
  const prevAll = leads.filter((l) => { const d = new Date(l.created_at); return d >= prevStart && d < range.start; });
  const prevFiltered = sourceFilter ? prevAll.filter((l) => l.source === sourceFilter) : prevAll;
  const prevTotal = prevFiltered.length;

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

  const revenue = filtered.filter((l) => l.status === "won").reduce((sum, l) => sum + (l.deal_value || 0), 0);
  const adSpend = spends.filter((s) => monthsSet.has(s.month) && (sourceFilter ? s.source === sourceFilter : true)).reduce((sum, s) => sum + (s.amount || 0), 0);

  const roasOrder = ["google_ads", "meta_ads", "website", "manual"];
  const presentSources = roasOrder.filter((s) => periodLeads.some((l) => l.source === s));
  const roasRows = presentSources.map((src) => {
    const srcLeads = periodLeads.filter((l) => l.source === src);
    const leadsN = srcLeads.length;
    const wonN = srcLeads.filter((l) => l.status === "won").length;
    const rev = srcLeads.filter((l) => l.status === "won").reduce((a, l) => a + (l.deal_value || 0), 0);
    const sp = spends.filter((s) => monthsSet.has(s.month) && s.source === src).reduce((a, s) => a + (s.amount || 0), 0);
    return { src, info: sourceInfo(src), leadsN, wonN, rev, sp,
      roas: sp > 0 ? rev / sp : null, cpl: sp > 0 && leadsN > 0 ? sp / leadsN : null, cpa: sp > 0 && wonN > 0 ? sp / wonN : null };
  });
  const tLeads = periodLeads.length;
  const tWon = periodLeads.filter((l) => l.status === "won").length;
  const tRev = periodLeads.filter((l) => l.status === "won").reduce((a, l) => a + (l.deal_value || 0), 0);
  const tSpend = spends.filter((s) => monthsSet.has(s.month)).reduce((a, s) => a + (s.amount || 0), 0);
  const totalsRow = { leadsN: tLeads, wonN: tWon, rev: tRev, sp: tSpend,
    roas: tSpend > 0 ? tRev / tSpend : null, cpl: tSpend > 0 && tLeads > 0 ? tSpend / tLeads : null, cpa: tSpend > 0 && tWon > 0 ? tSpend / tWon : null };

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

  const R = 68, C = 2 * Math.PI * R, GAP = sourceData.length > 1 ? 4 : 0;
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
  const logout = () => { localStorage.clear(); router.push("/login"); };

  return (
    <AppShell brand={brand} active="/dashboard" onLogout={logout} router={router}>
      {/* Page top bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 sticky top-0 lg:top-0 z-20">
        <h1 className="text-[15px] font-semibold text-slate-800 mr-2">Dashboard</h1>
        <DateRangePicker range={range} onChange={(r) => setRange(r)} />
        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setSourceFilter("")} className={`px-2.5 py-1 rounded text-[12px] font-medium border transition ${sourceFilter === "" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}>All</button>
          {sourceData.map((s) => (
            <button key={s.source} onClick={() => toggleSource(s.source)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium border transition ${sourceFilter === s.source ? "text-white border-transparent" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}
              style={sourceFilter === s.source ? { background: s.color } : {}}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sourceFilter === s.source ? "#fff" : s.color }} />{s.label}
            </button>
          ))}
        </div>
        <button onClick={() => setRoasOpen(true)} className="ml-auto flex items-center gap-1.5 text-[12px] font-medium border border-slate-300 rounded px-3 py-1.5 bg-white text-slate-700 hover:border-slate-400 transition">
          <Icon d={ic.sliders} size={13} />Manage ROAS
        </button>
      </div>

      <div className="px-4 sm:px-6 py-5 max-w-[1600px] w-full mx-auto">
        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiCard label="Total Leads" icon={ic.users} delta={deltaPct}><CountUp value={total} /></KpiCard>
          <KpiCard label="Won" icon={ic.trophy} accent="text-emerald-700"><CountUp value={won} suffix={` (${convRate}%)`} /></KpiCard>
          <KpiCard label="Avg / Day" icon={ic.activity}><CountUp value={avgPerDay} decimals={1} /></KpiCard>
          <KpiCard label="Active Sources" icon={ic.layers}><CountUp value={sourceData.length} /></KpiCard>
        </div>

        {/* ROAS by Source */}
        <div className="bg-white border border-slate-200 rounded-md mb-4">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <h3 className="text-[13px] font-semibold text-slate-700 flex items-center gap-2"><Icon d={ic.rupee} size={13} className="text-slate-400" />ROAS by Source · {range.label}</h3>
            <span className="text-[11px] text-slate-400 hidden sm:block">Spend & order values set via Manage ROAS</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-slate-500 bg-slate-50 text-[11px] uppercase tracking-wide">
                  <th className="text-left px-4 py-2 font-medium">Source</th>
                  <th className="text-right px-3 py-2 font-medium">Leads</th>
                  <th className="text-right px-3 py-2 font-medium">Won</th>
                  <th className="text-right px-3 py-2 font-medium">Ad Spend</th>
                  <th className="text-right px-3 py-2 font-medium">Revenue</th>
                  <th className="text-right px-3 py-2 font-medium">ROAS</th>
                  <th className="text-right px-3 py-2 font-medium">Cost/Lead</th>
                  <th className="text-right px-4 py-2 font-medium">Cost/Sale</th>
                </tr>
              </thead>
              <tbody>
                {roasRows.map((r) => (
                  <tr key={r.src} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                    <td className="px-4 py-2"><span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.info.color }} />{r.info.label}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leadsN}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.wonN}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.sp > 0 ? money(r.sp) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{r.rev > 0 ? money(r.rev) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{r.roas != null ? `${r.roas.toFixed(1)}x` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.cpl != null ? money(r.cpl) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.cpa != null ? money(r.cpa) : "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-semibold bg-slate-50/80">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalsRow.leadsN}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{totalsRow.wonN}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalsRow.sp > 0 ? money(totalsRow.sp) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{totalsRow.rev > 0 ? money(totalsRow.rev) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalsRow.roas != null ? `${totalsRow.roas.toFixed(1)}x` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{totalsRow.cpl != null ? money(totalsRow.cpl) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{totalsRow.cpa != null ? money(totalsRow.cpa) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Trend + Donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3">Leads Trend · {range.label}{sourceFilter ? ` (${sourceInfo(sourceFilter).label})` : ""}</h3>
            <div className="relative">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair" style={{ maxHeight: 280 }} onMouseMove={onLineMove} onMouseLeave={() => setHoverIdx(null)}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" /><stop offset="100%" stopColor="#3b82f6" stopOpacity="0" /></linearGradient>
                </defs>
                {gridVals.map((v, i) => { const gy = H - PADY - (v / maxTrend) * (H - 2 * PADY);
                  return (<g key={i}><line x1={PADX} y1={gy} x2={W - PADX} y2={gy} stroke="#f1f5f9" strokeWidth="1" /><text x={PADX - 6} y={gy + 3} textAnchor="end" style={{ fontSize: 9 }} className="fill-slate-300">{v}</text></g>); })}
                <path d={areaPath} fill="url(#areaGrad)" style={{ opacity: ready ? 1 : 0, transition: "opacity 0.7s" }} />
                <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeDasharray={2000} strokeDashoffset={ready ? 0 : 2000} style={{ transition: "stroke-dashoffset 1.1s ease-out" }} />
                {hp && <line x1={hp.x} y1={PADY - 6} x2={hp.x} y2={H - PADY} stroke="#2563eb" strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />}
                {pts.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r={hoverIdx === i ? 5 : 0} fill="#fff" stroke="#2563eb" strokeWidth="2" style={{ transition: "r 0.15s" }} />))}
                <line x1={PADX} y1={H - PADY} x2={W - PADX} y2={H - PADY} stroke="#e2e8f0" strokeWidth="1" />
              </svg>
              {hp && (
                <div className="absolute pointer-events-none bg-slate-900 text-white text-[11px] rounded px-2.5 py-1.5 shadow-lg whitespace-nowrap"
                  style={{ left: `${(hp.x / W) * 100}%`, top: `${(hp.y / H) * 100}%`, transform: "translate(-50%, -135%)" }}>
                  <div className="font-semibold">{hp.count} lead{hp.count !== 1 ? "s" : ""}</div>
                  <div className="text-slate-300">{new Date(hp.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3">Lead Sources</h3>
            {sourceTotal === 0 ? <p className="text-xs text-slate-400">No data in this period</p> : (
              <div className="flex flex-col items-center">
                <svg viewBox="0 0 180 180" className="w-40 h-40">
                  <g transform="rotate(-90 90 90)">
                    {donutSegments.map((s, i) => (
                      <circle key={i} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth={hoverSrc === s.source ? 22 : 18}
                        strokeDasharray={`${ready ? s.dash : 0} ${C}`} strokeDashoffset={s.offset} className="cursor-pointer"
                        onMouseEnter={() => setHoverSrc(s.source)} onMouseLeave={() => setHoverSrc(null)} onClick={() => toggleSource(s.source)}
                        style={{ opacity: hoverSrc && hoverSrc !== s.source ? 0.3 : (sourceFilter && sourceFilter !== s.source ? 0.35 : 1), transition: "stroke-dasharray 0.9s ease-out, opacity 0.2s, stroke-width 0.2s" }} />
                    ))}
                  </g>
                  <text x="90" y="85" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 700 }}>{hoverSrc ? (sourceCounts[hoverSrc] || 0) : sourceTotal}</text>
                  <text x="90" y="103" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10 }}>{hoverSrc ? sourceInfo(hoverSrc).label : "total leads"}</text>
                </svg>
                <div className="mt-3 w-full space-y-1">
                  {donutSegments.map((s, i) => (
                    <button key={i} onClick={() => toggleSource(s.source)} onMouseEnter={() => setHoverSrc(s.source)} onMouseLeave={() => setHoverSrc(null)}
                      className={`w-full flex items-center justify-between text-[12px] rounded px-2 py-1 transition ${sourceFilter === s.source ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                      <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>
                      <span className="text-slate-500 font-medium tabular-nums">{s.count} <span className="text-slate-400">({Math.round(s.frac * 100)}%)</span></span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status + Quantity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3">Pipeline (Status)</h3>
            <div className="space-y-2.5">
              {STATUS_ORDER.map((s) => { const c = statusCounts[s] || 0; const col = STATUS_COLOR[s];
                return (<div key={s} className="flex items-center gap-3" title={`${c} ${s}`}><span className="w-20 text-[12px] capitalize text-slate-600">{s}</span><GradBar pct={(c / maxStatus) * 100} color={col} count={c} ready={ready} /></div>); })}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3">Quantity Requested</h3>
            {qtyData.length === 0 ? <p className="text-xs text-slate-400">No quantity data</p> : (
              <div className="space-y-2.5">
                {qtyData.map((q) => (<div key={q.qty} className="flex items-center gap-3" title={`${q.qty}: ${q.count}`}><span className="w-28 text-[12px] text-slate-600 truncate">{q.qty}</span><GradBar pct={(q.count / maxQty) * 100} color="#d97706" count={q.count} ready={ready} /></div>))}
              </div>
            )}
          </div>
        </div>

        {/* Cities + Campaigns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3">Top Cities</h3>
            {topCities.length === 0 ? <p className="text-xs text-slate-400">No city data</p> : (
              <div className="space-y-2.5">
                {topCities.map((c) => (<div key={c.city} className="flex items-center gap-3" title={`${c.city}: ${c.count}`}><span className="w-24 text-[12px] text-slate-600 truncate">{c.city}</span><GradBar pct={(c.count / maxCity) * 100} color="#2563eb" count={c.count} ready={ready} /></div>))}
              </div>
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <h3 className="text-[13px] font-semibold text-slate-700 mb-3">Campaign Performance</h3>
            {campaigns.length === 0 ? <p className="text-xs text-slate-400">No campaign data</p> : (
              <table className="w-full text-[12px]">
                <thead><tr className="text-slate-500 border-b border-slate-100"><th className="text-left py-1.5 font-medium">Campaign</th><th className="text-right py-1.5 font-medium">Leads</th><th className="text-right py-1.5 font-medium">Won</th></tr></thead>
                <tbody>
                  {campaigns.map((c) => (<tr key={c.campaign} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition"><td className="py-1.5 truncate max-w-[160px]" title={c.campaign}>{c.campaign}</td><td className="py-1.5 text-right font-medium tabular-nums">{c.total}</td><td className="py-1.5 text-right text-emerald-700 font-medium tabular-nums">{c.won}</td></tr>))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-5">Showing {range.label.toLowerCase()} · {total} leads · {leads.length} total in system</p>
      </div>

      {roasOpen && (
        <RoasModal spends={spends} wonLeads={wonLeadsInPeriod} onClose={() => setRoasOpen(false)}
          onSpendSaved={loadSpends} onDealSaved={loadLeads} />
      )}
    </AppShell>
  );
}

function KpiCard({ label, icon, accent = "text-slate-900", delta, children }: { label: string; icon: React.ReactNode; accent?: string; delta?: number | null; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{label}</span>
        <span className="text-slate-400"><Icon d={icon} size={15} /></span>
      </div>
      <div className={`text-xl font-semibold tabular-nums ${accent}`}>{children}</div>
      {delta !== undefined && delta !== null && (<div className={`text-[11px] mt-0.5 font-medium ${delta >= 0 ? "text-emerald-700" : "text-red-600"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs prev period</div>)}
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto border border-slate-200">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex justify-between items-center">
          <h2 className="text-[14px] font-semibold text-slate-800">Manage ROAS</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
        </div>

        <div className="p-5 space-y-6">
          <div>
            <h3 className="text-[13px] font-semibold text-slate-700 mb-2">Ad Spend (per month)</h3>
            <div className="flex flex-wrap gap-2 items-end mb-3">
              <div><label className="text-[11px] text-slate-500 block mb-1">Month</label>
                <select value={sMonth} onChange={(e) => setSMonth(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 text-[13px]">
                  {monthOpts.map((m) => (<option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</option>))}
                </select></div>
              <div><label className="text-[11px] text-slate-500 block mb-1">Source</label>
                <select value={sSource} onChange={(e) => setSSource(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 text-[13px]">
                  <option value="google_ads">Google Ads</option><option value="meta_ads">Meta Ads</option><option value="website">Website</option><option value="all">All / Other</option>
                </select></div>
              <div><label className="text-[11px] text-slate-500 block mb-1">Amount (₹)</label>
                <input type="number" value={sAmount} onChange={(e) => setSAmount(e.target.value)} placeholder="e.g. 40000" className="border border-slate-300 rounded px-2 py-1.5 text-[13px] w-32" /></div>
              <button onClick={saveSpend} disabled={busy || !sAmount} className="bg-slate-800 text-white text-[13px] rounded px-4 py-2 disabled:opacity-50 hover:bg-slate-700 transition">Save</button>
            </div>
            {spends.length === 0 ? <p className="text-xs text-slate-400">No ad spend entered yet.</p> : (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {spends.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs bg-slate-50 rounded px-3 py-1.5">
                    <span>{new Date(s.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })} · {sourceInfo(s.source).label}</span>
                    <span className="flex items-center gap-3"><span className="font-medium tabular-nums">{money(s.amount)}</span><button onClick={() => delSpend(s.id)} className="text-red-600 hover:underline">delete</button></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-slate-700 mb-2">Won Deals — Order Value (this period)</h3>
            {wonLeads.length === 0 ? <p className="text-xs text-slate-400">No "won" leads in the selected period. Mark leads as Won on the Leads page first.</p> : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {wonLeads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 text-[13px] bg-slate-50 rounded px-3 py-1.5">
                    <span className="truncate flex-1">{l.name || "Unknown"} <span className="text-slate-400 text-xs">{sourceInfo(l.source).label}</span></span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 text-xs">₹</span>
                      <input type="number" value={dealVals[l.id] || ""} onChange={(e) => setDealVals({ ...dealVals, [l.id]: e.target.value })} placeholder="value" className="border border-slate-300 rounded px-2 py-1 text-xs w-24" />
                      <button onClick={() => saveDeal(l.id)} disabled={busy} className="text-xs bg-emerald-700 text-white rounded px-2 py-1 disabled:opacity-50 hover:bg-emerald-600 transition">Save</button>
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