"use client";
import { useEffect, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import api from "@/lib/api";

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  qualified: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
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
  { id: "",           label: "All",         emoji: "📋" },
  { id: "google_ads", label: "Google Ads",  emoji: "🟢" },
  { id: "meta_ads",   label: "Meta Ads",    emoji: "🔵" },
  { id: "website",    label: "Website",     emoji: "🌐" },
  { id: "manual",     label: "Manual",      emoji: "✍️" },
];

// Tabs that are always shown regardless of enabled_sources
const ALWAYS_TABS = ["", "manual"];

// Date quick-filter chips
const DATE_TABS = [
  { id: "",          label: "Sab" },
  { id: "today",     label: "Aaj" },
  { id: "yesterday", label: "Kal" },
  { id: "7d",        label: "Last 7 din" },
];

// Format an ISO datetime for the datetime-local input (local time, no seconds)
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Start-of-day helper (local time)
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
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
  const [dateFilter, setDateFilter] = useState(""); // "" | today | yesterday | 7d

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
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
    a.download = `leads-${sourceFilter || "all"}-${dateFilter || "alltime"}-${new Date().toISOString().slice(0, 10)}.csv`;
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

  function tabClasses(tabId: string) {
    const isActive = sourceFilter === tabId;
    if (isActive) return "bg-gray-900 text-white border-gray-900";
    return "bg-white text-gray-700 border-gray-200 hover:border-gray-400 hover:bg-gray-50";
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
    let cls = "bg-gray-100 text-gray-600";
    let label = "⏰ " + due.toLocaleDateString();
    if (isOverdue) { cls = "bg-red-100 text-red-700"; label = "⏰ Overdue"; }
    else if (isToday) { cls = "bg-amber-100 text-amber-800"; label = "⏰ Today"; }
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
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  const duplicateIds = buildDuplicateMap();

  // ---- Date filtering + grouping ----
  const _today0 = startOfDay(new Date());
  const _yest0 = new Date(_today0); _yest0.setDate(_yest0.getDate() - 1);
  const _week0 = new Date(_today0); _week0.setDate(_week0.getDate() - 6); // last 7 days incl today

  function inDateFilter(iso: string): boolean {
    const c = new Date(iso);
    if (dateFilter === "today") return c >= _today0;
    if (dateFilter === "yesterday") return c >= _yest0 && c < _today0;
    if (dateFilter === "7d") return c >= _week0;
    return true;
  }

  function dayLabel(iso: string): string {
    const c0 = startOfDay(new Date(iso));
    if (c0.getTime() === _today0.getTime()) return "Aaj";
    if (c0.getTime() === _yest0.getTime()) return "Kal";
    return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  // Counts for the date chips (based on currently fetched leads)
  const dateCounts = { today: 0, yesterday: 0, week: 0 };
  leads.forEach((l) => {
    const c = new Date(l.created_at);
    if (c >= _today0) dateCounts.today++;
    if (c >= _yest0 && c < _today0) dateCounts.yesterday++;
    if (c >= _week0) dateCounts.week++;
  });

  const displayLeads = [...leads]
    .filter((l) => inDateFilter(l.created_at))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  let lastDayLabel: string | null = null;

  function dateChipCount(id: string): number | null {
    if (id === "today") return dateCounts.today;
    if (id === "yesterday") return dateCounts.yesterday;
    if (id === "7d") return dateCounts.week;
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-1 w-full" style={{ backgroundColor: brand.color }} />

      {/* ---- Responsive header: brand + bell/logout on top, nav row below ---- */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {brand.logo ? <img src={brand.logo} alt="" className="h-8 w-auto rounded shrink-0" onError={(e: any) => { e.target.style.display = "none"; }} /> : null}
            <h1 className="text-lg sm:text-xl font-semibold truncate" style={{ color: brand.color }}>{brand.name || "Leads"}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Reminder bell */}
            <button
              onClick={() => setShowReminders((v) => !v)}
              className="relative text-gray-600 hover:text-gray-900"
              title="Follow-up reminders"
            >
              🔔
              {reminders.length > 0 && (
                <span className={`absolute -top-2 -right-2 text-[10px] text-white rounded-full px-1.5 py-0.5 ${overdueCount > 0 ? "bg-red-600" : "bg-amber-500"}`}>
                  {reminders.length}
                </span>
              )}
            </button>
            <button onClick={() => { localStorage.clear(); router.push("/login"); }} className="text-sm text-red-500 hover:underline">Logout</button>
          </div>
        </div>
        <nav className="px-2 sm:px-4 flex gap-1 border-t overflow-x-auto">
          {[
            { label: "Dashboard", path: "/dashboard", active: false },
            { label: "Leads", path: "/leads", active: true },
            { label: "Settings", path: "/settings", active: false },
          ].map((n) => (
            <button
              key={n.path}
              onClick={() => router.push(n.path)}
              className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${n.active ? "" : "border-transparent text-gray-500 hover:text-gray-800"}`}
              style={n.active ? { borderColor: brand.color, color: brand.color } : undefined}
            >
              {n.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="p-6">
        {/* Reminders banner */}
        {(overdueCount > 0 || todayCount > 0) && (
          <div
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 cursor-pointer"
            onClick={() => setShowReminders((v) => !v)}
          >
            <span className="text-sm text-amber-900 font-medium">
              ⏰ {overdueCount > 0 && <span className="text-red-700">{overdueCount} overdue</span>}
              {overdueCount > 0 && todayCount > 0 && " · "}
              {todayCount > 0 && <span>{todayCount} due today</span>}
              {" "}— click to view follow-ups
            </span>
          </div>
        )}

        {/* Reminders panel */}
        {showReminders && (
          <div className="mb-4 rounded-lg border bg-white p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-sm">Pending Follow-ups ({reminders.length})</h3>
              <button onClick={() => setShowReminders(false)} className="text-xs text-gray-500 hover:underline">Close</button>
            </div>
            {reminders.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No follow-ups scheduled. Set one from any lead's detail view.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {reminders.map((r) => {
                  const due = r.follow_up_at ? new Date(r.follow_up_at) : null;
                  const overdue = isReminderOverdue(r);
                  return (
                    <div
                      key={r.id}
                      className={`flex items-center justify-between text-sm px-3 py-2 rounded ${overdue ? "bg-red-50" : "bg-gray-50"}`}
                    >
                      <div>
                        <span className="font-medium">{r.name || "Unknown"}</span>
                        <span className="text-gray-500 ml-2">{r.phone}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs ${overdue ? "text-red-700 font-medium" : "text-gray-600"}`}>
                          {due ? due.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                          {overdue && " (overdue)"}
                        </span>
                        {r.phone && (
                          <a href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">📞</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Source Tabs (filtered by enabled_sources) */}
        <div className="flex flex-wrap gap-2 mb-4">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSourceFilter(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition ${tabClasses(tab.id)}`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              <span className={`inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-xs font-semibold ${sourceFilter === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                {getTabCount(tab.id)}
              </span>
            </button>
          ))}
        </div>

        {/* Date quick-filter chips: Sab / Aaj / Kal / Last 7 din */}
        <div className="flex flex-wrap gap-2 mb-4">
          {DATE_TABS.map((c) => {
            const active = dateFilter === c.id;
            const cnt = dateChipCount(c.id);
            return (
              <button
                key={c.id || "all"}
                onClick={() => setDateFilter(c.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
              >
                {c.label}
                {cnt !== null && <span className="ml-1 opacity-70">({cnt})</span>}
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="bg-white border rounded-lg p-3 mb-4 flex flex-wrap gap-2 items-center">
          <Input placeholder="Search name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <select className="border rounded-md px-3 py-2 text-sm bg-white" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
            <Button onClick={() => setShowForm(!showForm)}>+ Add Lead</Button>
          </div>
        </div>

        <p className="text-gray-500 text-sm mb-3">
          Showing {displayLeads.length} of {total} leads
          {sourceFilter ? <span className="ml-2 text-gray-700 font-medium">· {SOURCE_TABS.find((t) => t.id === sourceFilter)?.label}</span> : null}
          {dateFilter ? <span className="ml-2 text-gray-700 font-medium">· {DATE_TABS.find((t) => t.id === dateFilter)?.label}</span> : null}
          {duplicateIds.size > 0 && <span className="ml-2 text-amber-700">· ⚠️ {duplicateIds.size} possible duplicate{duplicateIds.size > 1 ? "s" : ""}</span>}
        </p>

        {showForm && (
          <div className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <Button onClick={createLead}>Save Lead</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        )}

        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">City</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Quantity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayLeads.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                  {dateFilter ? "Is duration mein koi lead nahi" : (sourceFilter === "meta_ads" ? "No Meta Ads leads yet" : "No leads match these filters")}
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
                      <tr className="bg-gray-100/70">
                        <td colSpan={9} className="px-4 py-2 text-xs font-semibold text-gray-600">{grpLabel}</td>
                      </tr>
                    )}
                    <tr
                      className={`border-b hover:bg-gray-50 cursor-pointer ${isExpanded ? "bg-blue-50/40" : ""} ${isDuplicate ? "bg-amber-50/30" : ""}`}
                      onClick={() => openRow(lead)}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString()}
                        <div className="text-[10px] text-gray-400">{new Date(lead.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {lead.name || "-"}
                        {lead.gclid && <span className="ml-2 inline-block bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded">gclid</span>}
                        {lead.fbclid && <span className="ml-2 inline-block bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 rounded">fbclid</span>}
                        {followUpBadge(lead)}
                        {isDuplicate && <span className="ml-2 inline-block bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded">duplicate</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {lead.phone ? <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="text-blue-600 hover:underline">{lead.phone}</a> : "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[180px] truncate" title={lead.email || ""}>{lead.email || "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{parsed.city || "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">{quantity ? <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded font-medium">{quantity}</span> : "-"}</td>
                      <td className="px-4 py-3 capitalize text-xs whitespace-nowrap">{lead.source.replace("_", " ")}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColors[lead.status] || "bg-gray-100 text-gray-700"}`}>{lead.status}</span></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select className="text-xs border rounded px-2 py-1" value={lead.status} onChange={(e) => updateStatus(lead.id, e.target.value)}>
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="qualified">Qualified</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                        </select>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-blue-50/30 border-b">
                        <td colSpan={9} className="px-6 py-4">
                          {/* Top: details + contact buttons */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
                            <div><div className="text-gray-500 mb-0.5">Submitted</div><div className="font-medium">{new Date(lead.created_at).toLocaleString()}</div></div>
                            <div><div className="text-gray-500 mb-0.5">Form</div><div className="font-medium">{parsed.form || "-"}</div></div>
                            <div><div className="text-gray-500 mb-0.5">UTM Source</div><div className="font-medium">{lead.utm_source || "-"}</div></div>
                            <div><div className="text-gray-500 mb-0.5">UTM Campaign</div><div className="font-medium">{lead.utm_campaign || "-"}</div></div>
                            <div className="md:col-span-4"><div className="text-gray-500 mb-0.5">Notes (raw)</div><div className="font-medium whitespace-pre-line bg-white border rounded p-2">{lead.notes || "-"}</div></div>
                          </div>

                          <div className="flex gap-2 flex-wrap items-center mb-4">
                            {lead.phone && <a href={`tel:${lead.phone}`} onClick={(e) => e.stopPropagation()} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">📞 Call</a>}
                            {lead.phone && <a href={waLink(lead.phone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700">💬 WhatsApp</a>}
                            {lead.email && <a href={`mailto:${lead.email}`} onClick={(e) => e.stopPropagation()} className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-700">✉️ Email</a>}
                            <div className="ml-auto">
                              <button onClick={(e) => { e.stopPropagation(); deleteLead(lead.id, lead.name); }} disabled={deletingId === lead.id} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50">
                                {deletingId === lead.id ? "Deleting..." : "🗑️ Delete"}
                              </button>
                            </div>
                          </div>

                          {/* Follow-up reminder */}
                          <div className="bg-white border rounded p-3 mb-4" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs font-semibold text-gray-700 mb-2">⏰ Follow-up Reminder</div>
                            <div className="flex flex-wrap gap-2 items-center">
                              <input
                                type="datetime-local"
                                value={followUpInput}
                                onChange={(e) => setFollowUpInput(e.target.value)}
                                className="border rounded px-2 py-1.5 text-xs"
                              />
                              <button onClick={() => saveFollowUp(lead.id)} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded hover:bg-gray-800">Set reminder</button>
                              {lead.follow_up_at && (
                                <button onClick={() => { setFollowUpInput(""); saveFollowUp(lead.id); }} className="text-xs text-red-600 hover:underline">Clear</button>
                              )}
                              {lead.follow_up_at && (
                                <span className="text-xs text-gray-500">Current: {new Date(lead.follow_up_at).toLocaleString()}</span>
                              )}
                            </div>
                          </div>

                          {/* Notes / Activity log */}
                          <div className="bg-white border rounded p-3" onClick={(e) => e.stopPropagation()}>
                            <div className="text-xs font-semibold text-gray-700 mb-2">📝 Notes & Activity</div>
                            <div className="flex gap-2 mb-3">
                              <input
                                type="text"
                                placeholder="What was discussed? e.g. Called, interested in 500 pcs..."
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addNote(lead.id); }}
                                className="flex-1 border rounded px-2 py-1.5 text-xs"
                              />
                              <button onClick={() => addNote(lead.id)} disabled={savingNote || !newNote.trim()} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
                                {savingNote ? "..." : "Add"}
                              </button>
                            </div>
                            {activities.length === 0 ? (
                              <p className="text-xs text-gray-400">No notes yet. Add what was discussed with this lead.</p>
                            ) : (
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {activities.map((a) => (
                                  <div key={a.id} className="text-xs border-l-2 border-blue-200 pl-2">
                                    <div className="text-gray-700">{a.note}</div>
                                    <div className="text-[10px] text-gray-400">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</div>
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
        <div className="text-center text-xs text-gray-400 py-6">Powered by <span className="font-medium text-gray-500">Brandbanalo</span></div>
      </div>
    </div>
  );
}