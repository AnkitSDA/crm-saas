"use client";
import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import api from "@/lib/api";

const statusColors: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border border-blue-200",
  contacted: "bg-amber-50 text-amber-700 border border-amber-200",
  qualified: "bg-violet-50 text-violet-700 border border-violet-200",
  won: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  lost: "bg-red-50 text-red-700 border border-red-200",
};

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  status: string;
  notes: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid?: string | null;
  follow_up_at?: string | null;
  created_at: string;
}

interface Activity {
  id: string;
  note: string;
  activity_type: string;
  created_by: string | null;
  created_at: string | null;
}

interface Reminder {
  id: string;
  name: string | null;
  phone: string | null;
  follow_up_at: string | null;
  status: string;
  overdue: boolean;
}

interface RangeSel { start: Date; end: Date; label: string; }

function parseNotes(notes: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!notes) return result;
  const text = notes.replace(/\s+/g, " ").trim();
  const knownKeys = ["Form", "Message", "Quantity", "Requirement", "City"];
  const keyAlt = knownKeys.join("|");
  const regex = new RegExp(`(${keyAlt})\\s*:\\s*(.+?)(?=\\s+(?:${keyAlt})\\s*:|$)`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    result[match[1].toLowerCase()] = match[2].trim();
  }
  return result;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length >= 10) return digits.slice(-10);
  return digits || null;
}

const SOURCE_TABS = [
  { id: "",           label: "All" },
  { id: "google_ads", label: "Google Ads", dot: "#059669" },
  { id: "meta_ads",   label: "Meta Ads",   dot: "#2563eb" },
  { id: "website",    label: "Website",    dot: "#64748b" },
  { id: "manual",     label: "Manual",     dot: "#d97706" },
];

// Tabs that are always shown regardless of enabled_sources
const ALWAYS_TABS = ["", "manual"];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ---------- Inline SVG icons (shared style with dashboard) ---------- */
const ic = {
  dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  leads:     <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  settings:  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  bell:      <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  calendar:  <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  clock:     <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  phone:     <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />,
  mail:      <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  chat:      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  trash:     <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>,
  note:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></>,
};
function Icon({ d, size = 15, className = "" }: { d: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
  );
}

// Format an ISO datetime for the datetime-local input (local time, no seconds)
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date): boolean { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtShort(d: Date): string { return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }

// ---- Calendar date-range picker (same as dashboard) ----
function DateRangePicker({ range, onChange }: { range: RangeSel; onChange: (r: RangeSel) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => new Date(range.start.getFullYear(), range.start.getMonth(), 1));
  const [tStart, setTStart] = useState<Date | null>(null);
  const [tEnd, setTEnd] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const today = startOfDay(new Date());
  function openPicker() {
    setTStart(null); setTEnd(null); setHover(null);
    const base = range.start.getFullYear() > 2001 ? range.start : today;
    setView(new Date(base.getFullYear(), base.getMonth(), 1));
    setOpen(true);
  }
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

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [allTimeTotal, setAllTimeTotal] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showReminders, setShowReminders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  // Which lead sources this client has enabled (set by agency). Default: all on.
  const [enabledSources, setEnabledSources] = useState<string[]>(["google_ads", "meta_ads", "website"]);
  const [brand, setBrand] = useState<{ name: string; logo: string; color: string }>({ name: "", logo: "", color: "#111827" });

  // Per-expanded-lead state
  const [activities, setActivities] = useState<Activity[]>([]);
  const [newNote, setNewNote] = useState("");
  const [followUpInput, setFollowUpInput] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  // Date range filter (calendar picker). Default = All time (show everything).
  const [range, setRange] = useState<RangeSel>(() => {
    const today = startOfDay(new Date());
    return { start: new Date(2000, 0, 1), end: addDays(today, 1), label: "All time" };
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    if (localStorage.getItem("role") === "super_admin") { router.push("/agency"); return; }
    fetchTenant();
    fetchLeads();
    fetchSourceCounts();
    fetchReminders();
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchLeads, search ? 350 : 0);
    return () => clearTimeout(id);
  }, [search, statusFilter, sourceFilter]);

  async function fetchTenant() {
    try {
      const res = await api.get("/tenant/me");
      const raw = (res.data && res.data.enabled_sources) || "google_ads,meta_ads,website";
      setEnabledSources(String(raw).split(",").map((s: string) => s.trim()).filter(Boolean));
      setBrand({
        name: res.data.brand_name || res.data.name || "",
        logo: res.data.logo_url || "",
        color: res.data.accent_color || "#111827",
      });
    } catch {
      // if it fails, keep default (all sources shown)
    }
  }

  async function fetchLeads() {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      const res = await api.get("/leads/", { params });
      setLeads(res.data.items);
      setTotal(res.data.total);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSourceCounts() {
    try {
      const res = await api.get("/leads/stats/sources?days=365");
      const counts: Record<string, number> = {};
      let totalCount = 0;
      (res.data as Array<{ source: string; count: number }>).forEach((row) => {
        counts[row.source] = row.count;
        totalCount += row.count;
      });
      setSourceCounts(counts);
      setAllTimeTotal(totalCount);
    } catch {}
  }

  async function fetchReminders() {
    try {
      const res = await api.get("/leads/reminders/list");
      setReminders(res.data.items || []);
    } catch {}
  }

  async function fetchActivities(leadId: string) {
    try {
      const res = await api.get(`/leads/${leadId}/activities`);
      setActivities(res.data || []);
    } catch {
      setActivities([]);
    }
  }

  function openRow(lead: Lead) {
    const isOpen = expandedRow === lead.id;
    if (isOpen) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(lead.id);
    setNewNote("");
    setFollowUpInput(toLocalInput(lead.follow_up_at));
    fetchActivities(lead.id);
  }

  async function createLead() {
    try {
      await api.post("/leads/", { ...form, source: "manual" });
      toast.success("Lead added");
      setForm({ name: "", phone: "", email: "", notes: "" });
      setShowForm(false);
      fetchLeads();
      fetchSourceCounts();
    } catch {
      toast.error("Failed to add lead");
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api.patch(`/leads/${id}`, { status });
      fetchLeads();
      fetchReminders();
    } catch {
      toast.error("Update failed");
    }
  }

  async function saveFollowUp(leadId: string) {
    try {
      // Send as local naive datetime (no UTC conversion) so the displayed
      // time matches what was picked. App is single-timezone (India).
      const val = followUpInput ? followUpInput + ":00" : null;
      await api.patch(`/leads/${leadId}`, { follow_up_at: val });
      toast.success(val ? "Reminder set" : "Reminder cleared");
      fetchLeads();
      fetchReminders();
    } catch {
      toast.error("Could not save reminder");
    }
  }

  async function addNote(leadId: string) {
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/leads/${leadId}/activities`, { note: newNote.trim(), activity_type: "note" });
      setNewNote("");
      fetchActivities(leadId);
      toast.success("Note added");
    } catch {
      toast.error("Could not add note");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteLead(id: string, name: string | null) {
    const label = name || "this lead";
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await api.delete(`/leads/${id}`);
      toast.success("Lead deleted");
      setExpandedRow(null);
      fetchLeads();
      fetchSourceCounts();
      fetchReminders();
    } catch {
      toast.error("Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function buildDuplicateMap(): Set<string> {
    const phoneToCount: Record<string, number> = {};
    leads.forEach((l) => {
      const np = normalizePhone(l.phone);
      if (np) phoneToCount[np] = (phoneToCount[np] || 0) + 1;
    });
    const dupIds = new Set<string>();
    leads.forEach((l) => {
      const np = normalizePhone(l.phone);
      if (np && phoneToCount[np] > 1) dupIds.add(l.id);
    });
    return dupIds;
  }

  function exportCsv() {
    const slug = range.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "all";
    const rows = [
      ["Date", "Name", "Phone", "Email", "City", "Quantity", "Source", "UTM Campaign", "Status", "Follow-up", "Notes"],
      ...displayLeads.map((l) => {
        const p = parseNotes(l.notes);
        return [
          new Date(l.created_at).toLocaleString(),
          l.name || "", l.phone || "", l.email || "",
          p.city || "", p.quantity || p.message || p.requirement || "",
          l.source, l.utm_campaign || "", l.status,
          l.follow_up_at ? new Date(l.follow_up_at).toLocaleString() : "",
          (l.notes || "").replace(/\n/g, " | "),
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${sourceFilter || "all"}-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function waLink(phone: string | null) {
    if (!phone) return "#";
    const digits = phone.replace(/\D/g, "").replace(/^91/, "");
    return `https://wa.me/91${digits.slice(-10)}`;
  }

  function getTabCount(tabId: string) {
    if (tabId === "") return allTimeTotal;
    return sourceCounts[tabId] || 0;
  }

  // Only show tabs the agency has enabled (All + Manual always shown).
  const visibleTabs = SOURCE_TABS.filter(
    (t) => ALWAYS_TABS.includes(t.id) || enabledSources.includes(t.id)
  );

  // Follow-up badge for a lead row
  function followUpBadge(lead: Lead) {
    if (!lead.follow_up_at) return null;
    if (lead.status === "won" || lead.status === "lost") return null;
    const due = new Date(lead.follow_up_at);
    const now = new Date();
    const isOverdue = due < now;
    const isToday = due.toDateString() === now.toDateString();
    let cls = "bg-slate-100 text-slate-600";
    let label = due.toLocaleDateString();
    if (isOverdue) { cls = "bg-red-50 text-red-700 border border-red-200"; label = "Overdue"; }
    else if (isToday) { cls = "bg-amber-50 text-amber-800 border border-amber-200"; label = "Due today"; }
    return <span className={`ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
  }

  const nowTs = new Date();
  function isReminderOverdue(r: Reminder) {
    return !!(r.follow_up_at && new Date(r.follow_up_at) < nowTs);
  }
  const overdueCount = reminders.filter((r) => isReminderOverdue(r)).length;
  const todayCount = reminders.filter((r) => {
    if (!r.follow_up_at || isReminderOverdue(r)) return false;
    return new Date(r.follow_up_at).toDateString() === nowTs.toDateString();
  }).length;

  if (loading)
    return <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm bg-[#f4f5f7]">Loading...</div>;

  const duplicateIds = buildDuplicateMap();

  // ---- Date range filtering + day grouping ----
  const _today0 = startOfDay(new Date());
  const _yest0 = addDays(_today0, -1);

  function inRange(iso: string): boolean {
    const d = new Date(iso);
    return d >= range.start && d < range.end;
  }

  function dayLabel(iso: string): string {
    const c0 = startOfDay(new Date(iso));
    if (c0.getTime() === _today0.getTime()) return "Today";
    if (c0.getTime() === _yest0.getTime()) return "Yesterday";
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  const displayLeads = [...leads]
    .filter((l) => inRange(l.created_at))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const isAllTime = range.label === "All time";
  let lastDayLabel: string | null = null;

  const logout = () => { sessionStorage.removeItem("reminderPopupShown"); localStorage.clear(); router.push("/login"); };
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
            const isActive = n.path === "/leads";
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
          <button onClick={logout} className="w-full flex items-center gap-3 px-2 py-2 text-[13px] text-slate-400 hover:text-white rounded hover:bg-white/5 transition">
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
            <div className="flex items-center gap-4">
              <button onClick={() => setShowReminders((v) => !v)} className="relative text-slate-300 hover:text-white">
                <Icon d={ic.bell} size={16} />
                {reminders.length > 0 && (
                  <span className={`absolute -top-2 -right-2 text-[9px] text-white rounded-full px-1 py-0.5 min-w-[15px] text-center ${overdueCount > 0 ? "bg-red-600" : "bg-amber-500"}`}>{reminders.length}</span>
                )}
              </button>
              <button onClick={logout} className="text-slate-300 hover:text-white"><Icon d={ic.logout} size={16} /></button>
            </div>
          </div>
          <nav className="px-2 flex gap-1 overflow-x-auto border-t border-white/10">
            {nav.map((n) => (
              <button key={n.path} onClick={() => router.push(n.path)}
                className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 ${n.path === "/leads" ? "border-blue-400 text-white" : "border-transparent text-slate-400"}`}>{n.label}</button>
            ))}
          </nav>
        </header>

        {/* Page top bar */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 sticky top-0 z-20">
          <h1 className="text-[15px] font-semibold text-slate-800 mr-1">Leads</h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            {visibleTabs.map((tab) => {
              const isActive = sourceFilter === tab.id;
              return (
                <button key={tab.id} onClick={() => setSourceFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium border transition ${isActive ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"}`}>
                  {tab.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? "#fff" : tab.dot }} />}
                  <span>{tab.label}</span>
                  <span className={`tabular-nums ${isActive ? "text-white/70" : "text-slate-400"}`}>{getTabCount(tab.id)}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto hidden lg:block">
            <button onClick={() => setShowReminders((v) => !v)} className="relative text-slate-500 hover:text-slate-800 p-1" title="Follow-up reminders">
              <Icon d={ic.bell} size={17} />
              {reminders.length > 0 && (
                <span className={`absolute -top-1 -right-1 text-[9px] text-white rounded-full px-1 py-0.5 min-w-[15px] text-center ${overdueCount > 0 ? "bg-red-600" : "bg-amber-500"}`}>{reminders.length}</span>
              )}
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 max-w-[1600px] w-full mx-auto flex-1">
          {/* Reminders banner */}
          {(overdueCount > 0 || todayCount > 0) && (
            <div
              className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 cursor-pointer flex items-center gap-2"
              onClick={() => setShowReminders((v) => !v)}
            >
              <Icon d={ic.clock} size={14} className="text-amber-700" />
              <span className="text-[13px] text-amber-900 font-medium">
                {overdueCount > 0 && <span className="text-red-700">{overdueCount} overdue</span>}
                {overdueCount > 0 && todayCount > 0 && " · "}
                {todayCount > 0 && <span>{todayCount} due today</span>}
                {" "}— click to view follow-ups
              </span>
            </div>
          )}

          {/* Reminders panel */}
          {showReminders && (
            <div className="mb-3 rounded-md border border-slate-200 bg-white p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-[13px] text-slate-800">Pending Follow-ups ({reminders.length})</h3>
                <button onClick={() => setShowReminders(false)} className="text-xs text-slate-500 hover:underline">Close</button>
              </div>
              {reminders.length === 0 ? (
                <p className="text-[13px] text-slate-400 py-2">No follow-ups scheduled. Set one from any lead's detail view.</p>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {reminders.map((r) => {
                    const due = r.follow_up_at ? new Date(r.follow_up_at) : null;
                    const overdue = isReminderOverdue(r);
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between text-[13px] px-3 py-2 rounded ${overdue ? "bg-red-50" : "bg-slate-50"}`}
                      >
                        <div>
                          <span className="font-medium">{r.name || "Unknown"}</span>
                          <span className="text-slate-500 ml-2">{r.phone}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs ${overdue ? "text-red-700 font-medium" : "text-slate-600"}`}>
                            {due ? due.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                            {overdue && " (overdue)"}
                          </span>
                          {r.phone && (
                            <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="text-white bg-slate-700 hover:bg-slate-600 p-1.5 rounded transition"><Icon d={ic.phone} size={11} /></a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Filter bar — calendar date range + search + status + actions */}
          <div className="bg-white border border-slate-200 rounded-md p-2.5 mb-3 flex flex-wrap gap-2 items-center">
            <DateRangePicker range={range} onChange={(r) => setRange(r)} />
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <Input placeholder="Search name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-8 text-[13px]" />
            <select className="border border-slate-300 rounded px-2.5 py-1.5 text-[13px] bg-white text-slate-700" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={exportCsv} className="h-8 text-[13px]">Export CSV</Button>
              <Button onClick={() => setShowForm(!showForm)} className="h-8 text-[13px]">+ Add Lead</Button>
            </div>
          </div>

          <p className="text-slate-500 text-[12px] mb-2">
            Showing {displayLeads.length} of {total} leads
            {sourceFilter ? <span className="ml-2 text-slate-700 font-medium">· {SOURCE_TABS.find((t) => t.id === sourceFilter)?.label}</span> : null}
            <span className="ml-2 text-slate-700 font-medium">· {range.label}</span>
            {duplicateIds.size > 0 && <span className="ml-2 text-amber-700">· {duplicateIds.size} possible duplicate{duplicateIds.size > 1 ? "s" : ""}</span>}
          </p>

          {showForm && (
            <div className="bg-white border border-slate-200 rounded-md p-4 mb-3 grid grid-cols-2 gap-3">
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <Button onClick={createLead}>Save Lead</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          )}

          <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[11px] uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">City</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Quantity</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayLeads.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-slate-400">
                    {!isAllTime ? "No leads in this period" : (sourceFilter === "meta_ads" ? "No Meta Ads leads yet" : "No leads match these filters")}
                  </td></tr>
                )}
                {displayLeads.map((lead) => {
                  const parsed = parseNotes(lead.notes);
                  const quantity = parsed.quantity || parsed.message || parsed.requirement || "";
                  const isExpanded = expandedRow === lead.id;
                  const isDuplicate = duplicateIds.has(lead.id);
                  const grpLabel = dayLabel(lead.created_at);
                  const showGroup = grpLabel !== lastDayLabel;
                  lastDayLabel = grpLabel;
                  return (
                    <Fragment key={lead.id}>
                      {showGroup && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={9} className="px-4 py-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{grpLabel}</td>
                        </tr>
                      )}
                      <tr
                        className={`border-b border-slate-100 hover:bg-slate-50/70 cursor-pointer ${isExpanded ? "bg-blue-50/40" : ""} ${isDuplicate ? "bg-amber-50/40" : ""}`}
                        onClick={() => openRow(lead)}
                      >
                        <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(lead.created_at).toLocaleDateString()}
                          <div className="text-[10px] text-slate-400">{new Date(lead.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                        </td>
                        <td className="px-4 py-2 font-medium text-slate-800">
                          {lead.name || "-"}
                          {lead.gclid && <span className="ml-2 inline-block bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0.5 rounded">gclid</span>}
                          {lead.fbclid && <span className="ml-2 inline-block bg-blue-50 text-blue-700 border border-blue-200 text-[10px] px-1.5 py-0.5 rounded">fbclid</span>}
                          {followUpBadge(lead)}
                          {isDuplicate && <span className="ml-2 inline-block bg-amber-50 text-amber-800 border border-amber-200 text-[10px] px-1.5 py-0.5 rounded">duplicate</span>}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          {lead.phone ? <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="text-blue-700 hover:underline">{lead.phone}</a> : "-"}
                        </td>
                        <td className="px-4 py-2 text-xs text-slate-600 max-w-[180px] truncate" title={lead.email || ""}>{lead.email || "-"}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-slate-700">{parsed.city || "-"}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs">{quantity ? <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">{quantity}</span> : "-"}</td>
                        <td className="px-4 py-2 capitalize text-xs whitespace-nowrap text-slate-600">{lead.source.replace("_", " ")}</td>
                        <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap capitalize ${statusColors[lead.status] || "bg-slate-100 text-slate-700"}`}>{lead.status}</span></td>
                        <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                          <select className="text-xs border border-slate-300 rounded px-2 py-1 bg-white" value={lead.status} onChange={(e) => updateStatus(lead.id, e.target.value)}>
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="qualified">Qualified</option>
                            <option value="won">Won</option>
                            <option value="lost">Lost</option>
                          </select>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/60 border-b border-slate-100">
                          <td colSpan={9} className="px-6 py-4">
                            {/* Top: details + contact buttons */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
                              <div><div className="text-slate-500 mb-0.5">Submitted</div><div className="font-medium text-slate-800">{new Date(lead.created_at).toLocaleString()}</div></div>
                              <div><div className="text-slate-500 mb-0.5">Form</div><div className="font-medium text-slate-800">{parsed.form || "-"}</div></div>
                              <div><div className="text-slate-500 mb-0.5">UTM Source</div><div className="font-medium text-slate-800">{lead.utm_source || "-"}</div></div>
                              <div><div className="text-slate-500 mb-0.5">UTM Campaign</div><div className="font-medium text-slate-800">{lead.utm_campaign || "-"}</div></div>
                              <div className="md:col-span-4"><div className="text-slate-500 mb-0.5">Notes (raw)</div><div className="font-medium whitespace-pre-line bg-white border border-slate-200 rounded p-2 text-slate-800">{lead.notes || "-"}</div></div>
                            </div>

                            <div className="flex gap-2 flex-wrap items-center mb-4">
                              {lead.phone && <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700 transition"><Icon d={ic.phone} size={12} />Call</a>}
                              {lead.phone && <a href={waLink(lead.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs bg-emerald-700 text-white px-3 py-1.5 rounded hover:bg-emerald-600 transition"><Icon d={ic.chat} size={12} />WhatsApp</a>}
                              {lead.email && <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 text-xs bg-slate-600 text-white px-3 py-1.5 rounded hover:bg-slate-500 transition"><Icon d={ic.mail} size={12} />Email</a>}
                              <div className="ml-auto">
                                <button onClick={(e) => { e.stopPropagation(); deleteLead(lead.id, lead.name); }} disabled={deletingId === lead.id} className="flex items-center gap-1.5 text-xs bg-white border border-red-300 text-red-700 px-3 py-1.5 rounded hover:bg-red-50 disabled:opacity-50 transition">
                                  <Icon d={ic.trash} size={12} />{deletingId === lead.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>

                            {/* Follow-up reminder */}
                            <div className="bg-white border border-slate-200 rounded p-3 mb-4" onClick={(e) => e.stopPropagation()}>
                              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Icon d={ic.clock} size={12} className="text-slate-400" />Follow-up Reminder</div>
                              <div className="flex flex-wrap gap-2 items-center">
                                <input
                                  type="datetime-local"
                                  value={followUpInput}
                                  onChange={(e) => setFollowUpInput(e.target.value)}
                                  className="border border-slate-300 rounded px-2 py-1.5 text-xs"
                                />
                                <button onClick={() => saveFollowUp(lead.id)} className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700 transition">Set reminder</button>
                                {lead.follow_up_at && (
                                  <button onClick={() => { setFollowUpInput(""); saveFollowUp(lead.id); }} className="text-xs text-red-600 hover:underline">Clear</button>
                                )}
                                {lead.follow_up_at && (
                                  <span className="text-xs text-slate-500">Current: {new Date(lead.follow_up_at).toLocaleString()}</span>
                                )}
                              </div>
                            </div>

                            {/* Notes / Activity log */}
                            <div className="bg-white border border-slate-200 rounded p-3" onClick={(e) => e.stopPropagation()}>
                              <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Icon d={ic.note} size={12} className="text-slate-400" />Notes & Activity</div>
                              <div className="flex gap-2 mb-3">
                                <input
                                  type="text"
                                  placeholder="What was discussed? e.g. Called, interested in 500 pcs..."
                                  value={newNote}
                                  onChange={(e) => setNewNote(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") addNote(lead.id); }}
                                  className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-xs"
                                />
                                <button onClick={() => addNote(lead.id)} disabled={savingNote || !newNote.trim()} className="text-xs bg-slate-800 text-white px-3 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50 transition">
                                  {savingNote ? "..." : "Add"}
                                </button>
                              </div>
                              {activities.length === 0 ? (
                                <p className="text-xs text-slate-400">No notes yet. Add what was discussed with this lead.</p>
                              ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {activities.map((a) => (
                                    <div key={a.id} className="text-xs border-l-2 border-slate-300 pl-2">
                                      <div className="text-slate-700">{a.note}</div>
                                      <div className="text-[10px] text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-center text-[11px] text-slate-400 py-5">Powered by <span className="font-medium text-slate-500">Brandbanalo</span></div>
        </div>
      </div>
    </div>
  );
}