"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";

interface ClientRow {
  id: string; name: string; slug: string; plan: string;
  is_active: boolean; monthly_rate: number; enabled_sources: string;
  paid_this_month?: boolean;
  leads: number; won: number; revenue: number; spend: number;
  roas: number | null; created_at: string;
}
interface Totals {
  clients: number; leads: number; won: number;
  revenue: number; spend: number; mrr: number; roas: number | null;
  collected?: number; paid_count?: number;
}

const SOURCES = [
  { key: "google_ads", label: "Google" },
  { key: "meta_ads", label: "Meta" },
  { key: "website", label: "Website" },
];
const STATUSES = ["new", "contacted", "qualified", "won", "lost"];

const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const roasTxt = (r: number | null) => (r == null ? "—" : r.toFixed(1) + "x");

/* ---------- Inline SVG icons (shared style with client dashboard) ---------- */
const ic = {
  users:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  leads:    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  rupee:    <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3c4 0 6-2 6-5" />,
  wallet:   <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></>,
  trophy:   <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2z" /></>,
  chart:    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  gauge:    <><path d="M12 12l4-4" /><circle cx="12" cy="12" r="9" /></>,
  logout:   <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  plus:     <path d="M12 5v14M5 12h14" />,
  copy:     <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  mail:     <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  card:     <><rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
};
function Icon({ d, size = 15, className = "" }: { d: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
  );
}

export default function AgencyDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [created, setCreated] = useState<any>(null);
  const [tab, setTab] = useState<"manage" | "leads" | "email" | "billing">("manage");

  // editable settings (for open client)
  const [eRate, setERate] = useState(""); const [ePlan, setEPlan] = useState("");
  const [eMode, setEMode] = useState("active"); const [eSources, setESources] = useState<string[]>([]);
  const [savedPw, setSavedPw] = useState<string | null>(null);
  const [eBrand, setEBrand] = useState(""); const [eLogo, setELogo] = useState(""); const [eColor, setEColor] = useState("#4f46e5");

  // email campaign state
  const [campSubject, setCampSubject] = useState("");
  const [campBody, setCampBody] = useState("");
  const [campStatus, setCampStatus] = useState("");
  const [campRecipients, setCampRecipients] = useState<number | null>(null);
  const [campSending, setCampSending] = useState(false);
  const [pastCampaigns, setPastCampaigns] = useState<any[]>([]);

  // billing state
  const [payments, setPayments] = useState<any[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("UPI");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const webhookUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/webhooks/form";

  // add-client form
  const [bn, setBn] = useState(""); const [em, setEm] = useState("");
  const [pw, setPw] = useState(""); const [rate, setRate] = useState("3500");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    if (!token) { router.push("/login"); return; }
    if (role !== "super_admin") { router.push("/dashboard"); return; }
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/admin/clients");
      setClients(r.data.clients); setTotals(r.data.totals);
    } catch { toast.error("Failed to load clients"); }
    finally { setLoading(false); }
  }

  function resetOpenState() {
    setDetail(null); setLeads([]); setSavedPw(null);
    setCampSubject(""); setCampBody(""); setCampStatus(""); setCampRecipients(null); setPastCampaigns([]);
    setPayments([]); setPayAmount(""); setPayNote(""); setPayMethod("UPI");
  }

  async function openClient(id: string) {
    if (openId === id) { setOpenId(null); resetOpenState(); return; }
    setOpenId(id); resetOpenState(); setTab("manage");
    try {
      const r = await api.get(`/admin/clients/${id}`);
      setDetail(r.data);
      setERate(String(r.data.monthly_rate || 0));
      setEPlan(r.data.plan || "");
      setEMode(r.data.access_mode || (r.data.is_active ? "active" : "block_all"));
      setESources((r.data.enabled_sources || "").split(",").filter(Boolean));
      const b = r.data.branding || {};
      setEBrand(b.brand_name || r.data.name || "");
      setELogo(b.logo_url || "");
      setEColor(b.accent_color || "#4f46e5");
      setPayAmount(String(r.data.monthly_rate || 0));
    } catch { toast.error("Failed to load client"); }
  }

  async function loadLeads(id: string) {
    try { const r = await api.get(`/admin/clients/${id}/leads?limit=200`); setLeads(r.data); }
    catch { toast.error("Failed to load leads"); }
  }

  async function loadCampaignMeta(id: string) {
    try {
      const q = campStatus ? `&status=${campStatus}` : "";
      const [rec, list] = await Promise.all([
        api.get(`/admin/campaigns/recipients?tenant_id=${id}${q}`),
        api.get(`/admin/campaigns?tenant_id=${id}`),
      ]);
      setCampRecipients(rec.data.count);
      setPastCampaigns(list.data);
    } catch { /* ignore */ }
  }

  async function refreshRecipients(id: string, status: string) {
    try {
      const q = status ? `&status=${status}` : "";
      const rec = await api.get(`/admin/campaigns/recipients?tenant_id=${id}${q}`);
      setCampRecipients(rec.data.count);
    } catch { /* ignore */ }
  }

  async function sendCampaign(id: string) {
    if (!campSubject.trim() || !campBody.trim()) { toast.error("Subject aur message dono likho"); return; }
    if (!confirm(`${campRecipients ?? 0} leads ko yeh email bheja jaye?`)) return;
    setCampSending(true);
    try {
      const r = await api.post("/admin/campaigns/send", {
        tenant_id: id, subject: campSubject, body: campBody, status: campStatus || null,
      });
      toast.success(`Bhej rahe hain ${r.data.recipients} leads ko… (background mein)`);
      setCampSubject(""); setCampBody("");
      setTimeout(() => loadCampaignMeta(id), 2000);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Send failed");
    } finally { setCampSending(false); }
  }

  // ---- billing ----
  async function loadBilling(id: string) {
    try { const r = await api.get(`/admin/clients/${id}/payments`); setPayments(r.data); }
    catch { toast.error("Failed to load payments"); }
  }

  async function refreshDetail(id: string) {
    try { const r = await api.get(`/admin/clients/${id}`); setDetail(r.data); } catch { /* ignore */ }
  }

  async function markPaid(id: string) {
    setPayBusy(true);
    try {
      await api.post(`/admin/clients/${id}/mark-paid`, {
        amount: parseFloat(payAmount) || 0,
        method: payMethod || null,
        note: payNote || null,
      });
      toast.success("Paid mark ho gaya — client ACTIVE");
      setPayNote("");
      await loadBilling(id); await refreshDetail(id); load();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setPayBusy(false); }
  }

  async function markUnpaid(id: string, mode: string) {
    const msg = mode === "block_all"
      ? "Client ko FULLY block karein? (login + naye leads dono band)"
      : "Client ko unpaid mark karein? (naye leads band, login chalu rahega — payment leverage)";
    if (!confirm(msg)) return;
    setPayBusy(true);
    try {
      await api.post(`/admin/clients/${id}/mark-unpaid`, { mode });
      toast.success(mode === "block_all" ? "Fully blocked" : "Leads blocked (unpaid)");
      await refreshDetail(id); load();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setPayBusy(false); }
  }

  async function deletePayment(id: string, paymentId: string) {
    if (!confirm("Yeh payment entry delete karein? (galat entry sudharne ke liye)")) return;
    try { await api.delete(`/admin/payments/${paymentId}`); await loadBilling(id); await refreshDetail(id); load(); }
    catch { toast.error("Delete failed"); }
  }

  async function saveSettings(id: string) {
    try {
      await api.patch(`/admin/clients/${id}`, {
        monthly_rate: parseFloat(eRate) || 0,
        plan: ePlan,
        access_mode: eMode,
        enabled_sources: eSources.join(","),
        brand_name: eBrand,
        logo_url: eLogo,
        accent_color: eColor,
      });
      toast.success("Settings saved");
      load();
    } catch { toast.error("Save failed"); }
  }

  async function resetPw(id: string) {
    if (!confirm("Reset this client's password? Purana password band ho jayega.")) return;
    try {
      const r = await api.post(`/admin/clients/${id}/reset-password`, {});
      setSavedPw(r.data.new_password);
      toast.success("Password reset — naya password niche dikh raha hai");
    } catch { toast.error("Reset failed"); }
  }

  async function updateLead(leadId: string, patch: any) {
    try { await api.patch(`/admin/leads/${leadId}`, patch); }
    catch { toast.error("Update failed"); }
  }

  async function deleteClient(id: string, name: string) {
    const typed = prompt(`⚠️ PERMANENT DELETE\n\n"${name}" ka tenant + login + saare leads delete ho jayenge. Wapas nahi aayenge.\n\nConfirm karne ke liye client ka naam type karo:`);
    if (typed === null) return;
    if (typed.trim() !== name.trim()) { toast.error("Naam match nahi hua — delete cancel"); return; }
    try {
      const r = await api.delete(`/admin/clients/${id}`);
      toast.success(`Deleted (${r.data.deleted_leads} leads removed)`);
      setOpenId(null); setDetail(null); load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  }

  async function createClient() {
    if (!bn || !em || !pw) { toast.error("Fill business name, email, password"); return; }
    setSaving(true);
    try {
      const r = await api.post("/admin/clients", {
        business_name: bn, email: em, password: pw, monthly_rate: parseFloat(rate) || 0,
      });
      setCreated({ ...r.data, password: pw });
      setBn(""); setEm(""); setPw(""); setRate("3500");
      toast.success("Client created!"); load();
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Failed to create client"); }
    finally { setSaving(false); }
  }

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast.success(l + " copied"); };
  const toggleSource = (k: string) =>
    setESources((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  if (loading)
    return <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm bg-[#f4f5f7]">Loading agency dashboard…</div>;

  const activeCount = clients.filter(c => c.is_active).length;
  const kpis = totals ? [
    { label: "Clients",         value: String(totals.clients),          sub: `${activeCount} active`,        icon: ic.users,  accent: "text-slate-900" },
    { label: "Total Leads",     value: totals.leads.toLocaleString("en-IN"), sub: `${totals.won} won`,       icon: ic.leads,  accent: "text-slate-900" },
    { label: "MRR",             value: inr(totals.mrr),                 sub: "monthly recurring",            icon: ic.rupee,  accent: "text-indigo-700" },
    { label: "Collected (mo)",  value: inr(totals.collected || 0),      sub: `${totals.paid_count || 0}/${totals.clients} paid`, icon: ic.wallet, accent: "text-emerald-700" },
    { label: "Revenue tracked", value: inr(totals.revenue),             sub: "won deals",                    icon: ic.trophy, accent: "text-emerald-700" },
    { label: "Ad Spend",        value: inr(totals.spend),               sub: "all clients",                  icon: ic.chart,  accent: "text-slate-900" },
    { label: "Blended ROAS",    value: roasTxt(totals.roas),            sub: "revenue / spend",              icon: ic.gauge,  accent: "text-slate-900" },
  ] : [];

  const inputCls = "border border-slate-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition";

  return (
    <div className="min-h-screen bg-[#f4f5f7]">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#1b2431] text-white">
        <div className="max-w-[1500px] mx-auto px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <Icon d={ic.users} size={17} className="text-indigo-300" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold leading-tight">Agency Dashboard</h1>
              <p className="text-[11px] text-slate-400">Brandbanalo · all clients</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => { setShowAdd(true); setCreated(null); }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition">
              <Icon d={ic.plus} size={14} />Add Client</button>
            <button onClick={() => { sessionStorage.removeItem("reminderPopupShown"); localStorage.clear(); router.push("/login"); }}
              className="flex items-center gap-1.5 text-[13px] text-slate-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition">
              <Icon d={ic.logout} size={14} />Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-6 py-6">
        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 hover:shadow-sm transition">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{k.label}</span>
                <span className="text-slate-300"><Icon d={k.icon} size={15} /></span>
              </div>
              <div className={`text-xl font-semibold tabular-nums ${k.accent}`}>{k.value}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Clients table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-slate-700 flex items-center gap-2">
              <Icon d={ic.users} size={14} className="text-slate-400" />All Clients
            </div>
            <span className="text-[11px] text-slate-400">{clients.length} total · {activeCount} active</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                <tr>{["Client", "Leads", "Won", "Revenue", "Spend", "ROAS", "Rate/mo", "This Month", "Status", ""].map(h => (
                  <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>))}</tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">
                    No clients yet. Click “+ Add Client”.</td></tr>)}
                {clients.map((c) => (
                  <>
                    <tr key={c.id} className={`border-t border-slate-100 transition ${openId === c.id ? "bg-indigo-50/40" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-semibold text-slate-500 shrink-0">
                            {(c.name || "?").slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{c.leads}</td>
                      <td className="px-4 py-3 tabular-nums text-emerald-700">{c.won}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{inr(c.revenue)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{inr(c.spend)}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">{roasTxt(c.roas)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{inr(c.monthly_rate)}</td>
                      <td className="px-4 py-3">
                        <span className={"text-[11px] font-medium px-2 py-0.5 rounded-full " +
                          (c.paid_this_month ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200")}>
                          {c.paid_this_month ? "✓ paid" : "unpaid"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={"text-[11px] font-medium px-2 py-0.5 rounded-full " +
                          (c.is_active ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500 border border-slate-200")}>
                          {c.is_active ? "active" : "inactive"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openClient(c.id)}
                          className={"text-[13px] font-medium px-3 py-1.5 rounded-lg transition " +
                            (openId === c.id ? "bg-slate-800 text-white" : "text-indigo-600 hover:bg-indigo-50")}>
                          {openId === c.id ? "Close" : "Manage"}</button>
                      </td>
                    </tr>
                    {openId === c.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={10} className="px-6 py-5">
                          {!detail ? <div className="text-slate-400 text-sm">Loading…</div> : (
                            <div>
                              {/* tabs */}
                              <div className="flex gap-2 mb-4 flex-wrap">
                                {[
                                  { k: "manage",  label: "Manage",         icon: ic.settings, onClick: () => setTab("manage") },
                                  { k: "leads",   label: `Leads (${c.leads})`, icon: ic.leads, onClick: () => { setTab("leads"); loadLeads(c.id); } },
                                  { k: "email",   label: "Email",          icon: ic.mail,     onClick: () => { setTab("email"); loadCampaignMeta(c.id); } },
                                  { k: "billing", label: "Billing",        icon: ic.card,     onClick: () => { setTab("billing"); loadBilling(c.id); } },
                                ].map((t) => (
                                  <button key={t.k} onClick={t.onClick}
                                    className={"flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg border transition " +
                                      (tab === t.k ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300")}>
                                    <Icon d={t.icon} size={13} />{t.label}</button>
                                ))}
                              </div>

                              {tab === "manage" && (
                                <div className="space-y-4">
                                  {/* Login + Integration side by side */}
                                  <div className="grid md:grid-cols-2 gap-4 items-start">
                                    {/* login */}
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Login &amp; access</div>
                                      <div className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
                                        <div className="text-[11px] text-slate-400">Login email</div>
                                        <div className="text-sm text-slate-700 truncate">{detail.login_email || "—"}</div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button onClick={() => resetPw(c.id)}
                                          className="border border-amber-300 text-amber-700 hover:bg-amber-50 text-[13px] font-medium px-4 py-2 rounded-lg transition">Reset Password</button>
                                        <span className={"inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full " + (detail.paid_this_month ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200")}>
                                          {detail.paid_this_month ? "✓ paid this month" : "unpaid this month"}
                                        </span>
                                        <span className="inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                          {detail.access_mode}
                                        </span>
                                      </div>
                                      {savedPw && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                          <div className="text-[11px] text-amber-600">New password (save it!)</div>
                                          <div className="flex gap-2 items-center">
                                            <code className="text-sm text-amber-800 flex-1 break-all">{savedPw}</code>
                                            <button onClick={() => copy(savedPw, "Password")} className="text-[11px] text-indigo-600 hover:underline shrink-0">Copy</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* integration */}
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Integration</div>
                                      <div>
                                        <div className="text-[11px] text-slate-400 mb-1">API key</div>
                                        <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                                          <code className="text-[11px] truncate flex-1 text-slate-600">{detail.api_key}</code>
                                          <button onClick={() => copy(detail.api_key, "API key")} className="text-slate-400 hover:text-indigo-600 shrink-0"><Icon d={ic.copy} size={13} /></button>
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[11px] text-slate-400 mb-1">Webhook URL</div>
                                        <div className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                                          <code className="text-[11px] truncate flex-1 text-slate-600">{webhookUrl}</code>
                                          <button onClick={() => copy(webhookUrl, "Webhook")} className="text-slate-400 hover:text-indigo-600 shrink-0"><Icon d={ic.copy} size={13} /></button>
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[11px] text-slate-400 mb-1.5">Sources breakdown</div>
                                        {detail.sources.length === 0 ? (
                                          <p className="text-[12px] text-slate-400">No leads yet.</p>
                                        ) : (
                                          <div className="grid grid-cols-3 gap-2">
                                            {detail.sources.map((s: any) => (
                                              <div key={s.source} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                                                <div className="text-[10px] uppercase tracking-wide text-slate-400 capitalize truncate">{s.source.replace("_", " ")}</div>
                                                <div className="text-[15px] font-semibold text-slate-800 tabular-nums leading-tight">{s.leads}</div>
                                                <div className="text-[10px] text-emerald-700">{s.won} won</div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Settings — full width */}
                                  <div className="bg-white rounded-xl border border-slate-200">
                                    <div className="px-4 py-2.5 border-b border-slate-100 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Settings</div>
                                    <div className="p-4 space-y-4">
                                      <div className="grid md:grid-cols-3 gap-4">
                                        <div className="space-y-3">
                                          <div>
                                            <label className="text-[11px] text-slate-400">Monthly rate (₹)</label>
                                            <input className={inputCls} type="number" value={eRate} onChange={(e) => setERate(e.target.value)} />
                                          </div>
                                          <div>
                                            <label className="text-[11px] text-slate-400">Plan</label>
                                            <input className={inputCls} value={ePlan} onChange={(e) => setEPlan(e.target.value)} placeholder="active / basic / pro" />
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-[11px] text-slate-400">Access mode</label>
                                          <div className="grid grid-cols-2 gap-2 mt-1">
                                            {[
                                              {k:"active",label:"🟢 Active",d:"leads + login ON"},
                                              {k:"block_all",label:"🔴 Block all",d:"leads + login OFF"},
                                              {k:"block_leads",label:"📥 Block leads",d:"login ON, no new leads"},
                                              {k:"block_login",label:"🔒 Block login",d:"leads ON, no access"},
                                            ].map((m)=>(
                                              <button key={m.k} onClick={()=>setEMode(m.k)} title={m.d}
                                                className={"text-[11px] px-2 py-2 rounded-lg border text-left transition " +
                                                  (eMode===m.k ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300")}>
                                                <div>{m.label}</div><div className="text-[10px] text-slate-400">{m.d}</div>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-[11px] text-slate-400">Sources on/off</label>
                                          <div className="flex flex-wrap gap-2 mt-1">
                                            {SOURCES.map((s) => (
                                              <button key={s.key} onClick={() => toggleSource(s.key)}
                                                className={"text-[11px] px-3 py-1.5 rounded-lg border transition " +
                                                  (eSources.includes(s.key) ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300")}>
                                                {eSources.includes(s.key) ? "✓ " : ""}{s.label}</button>
                                            ))}
                                          </div>
                                          <p className="text-[10px] text-slate-400 mt-2">Jo source off hai, client ko uska tab nahi dikhega.</p>
                                        </div>
                                      </div>

                                      <div className="pt-4 border-t border-slate-100">
                                        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Branding (white-label)</div>
                                        <div className="grid md:grid-cols-3 gap-3">
                                          <div>
                                            <label className="text-[11px] text-slate-400">Display name</label>
                                            <input className={inputCls} value={eBrand} onChange={(e) => setEBrand(e.target.value)} placeholder="Client brand name" />
                                          </div>
                                          <div>
                                            <label className="text-[11px] text-slate-400">Logo URL</label>
                                            <input className={inputCls} value={eLogo} onChange={(e) => setELogo(e.target.value)} placeholder="https://...logo.png" />
                                          </div>
                                          <div>
                                            <label className="text-[11px] text-slate-400">Accent color</label>
                                            <div className="flex items-center gap-2 mt-1">
                                              <input type="color" value={eColor} onChange={(e) => setEColor(e.target.value)} className="h-9 w-12 border border-slate-300 rounded cursor-pointer shrink-0" />
                                              <input className="border border-slate-300 rounded-lg px-2 py-2 text-xs w-24" value={eColor} onChange={(e) => setEColor(e.target.value)} />
                                              {eLogo ? <img src={eLogo} alt="" className="h-9 ml-auto rounded" onError={(ev:any)=>{ev.target.style.display='none';}} /> : null}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
                                      <button onClick={() => saveSettings(c.id)}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium px-5 py-2 rounded-lg transition">Save Settings</button>
                                    </div>
                                  </div>

                                  {/* Danger zone — slim strip */}
                                  <div className="bg-white rounded-xl border border-red-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <div className="text-[11px] font-semibold text-red-500 uppercase tracking-wide">Danger zone</div>
                                      <p className="text-[12px] text-slate-500">Tenant, login aur saare leads permanently delete ho jayenge.</p>
                                    </div>
                                    <button onClick={() => deleteClient(c.id, c.name)}
                                      className="border border-red-300 text-red-600 hover:bg-red-50 text-[13px] font-medium px-4 py-2 rounded-lg transition shrink-0">
                                      Delete Client (permanent)</button>
                                  </div>
                                </div>
                              )}

                              {tab === "leads" && (
                                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                  <table className="w-full text-[13px]">
                                    <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                                      <tr>{["Name", "Phone", "Source", "Status", "Deal ₹"].map(h => (
                                        <th key={h} className="text-left font-medium px-3 py-2.5">{h}</th>))}</tr>
                                    </thead>
                                    <tbody>
                                      {leads.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No leads</td></tr>}
                                      {leads.map((l) => (
                                        <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                                          <td className="px-3 py-2 font-medium text-slate-700">{l.name || "—"}</td>
                                          <td className="px-3 py-2 text-slate-500">{l.phone || "—"}</td>
                                          <td className="px-3 py-2 text-slate-500 capitalize">{(l.source || "").replace("_", " ")}</td>
                                          <td className="px-3 py-2">
                                            <select defaultValue={l.status}
                                              onChange={(e) => { updateLead(l.id, { status: e.target.value });
                                                setLeads((arr) => arr.map((x) => x.id === l.id ? { ...x, status: e.target.value } : x)); }}
                                              className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white">
                                              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                          </td>
                                          <td className="px-3 py-2">
                                            {l.status === "won" ? (
                                              <input type="number" defaultValue={l.deal_value || ""} placeholder="value"
                                                onBlur={(e) => updateLead(l.id, { deal_value: parseFloat(e.target.value) || 0 })}
                                                className="border border-slate-300 rounded-lg px-2 py-1 text-xs w-24" />
                                            ) : <span className="text-slate-300 text-xs">—</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {tab === "email" && (
                                <div className="grid md:grid-cols-3 gap-4">
                                  {/* compose */}
                                  <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Compose email</div>
                                    <div>
                                      <label className="text-[11px] text-slate-400">Subject</label>
                                      <input className={inputCls} value={campSubject} onChange={(e) => setCampSubject(e.target.value)} placeholder="e.g. New eco-bag collection 🌿" />
                                    </div>
                                    <div>
                                      <label className="text-[11px] text-slate-400">Message</label>
                                      <textarea className={inputCls + " min-h-[170px]"} value={campBody} onChange={(e) => setCampBody(e.target.value)}
                                        placeholder={"Hi {{name}},\n\nApna message yahan likho...\n\n— Team " + (detail.branding?.brand_name || detail.name || "")} />
                                      <p className="text-[11px] text-slate-400 mt-1">
                                        Tip: <code className="bg-slate-100 px-1 rounded">{"{{name}}"}</code> likho to lead ka naam aa jayega. Har email ke neeche unsubscribe link apne aap lagega.
                                      </p>
                                    </div>
                                    <div className="flex items-end gap-3 flex-wrap">
                                      <div>
                                        <label className="text-[11px] text-slate-400 block">Sirf in leads ko</label>
                                        <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" value={campStatus}
                                          onChange={(e) => { setCampStatus(e.target.value); refreshRecipients(c.id, e.target.value); }}>
                                          <option value="">All statuses</option>
                                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                      </div>
                                      <div className="ml-auto text-right">
                                        <div className="text-2xl font-semibold text-slate-800 tabular-nums">{campRecipients ?? "—"}</div>
                                        <div className="text-[11px] text-slate-400">recipients (email + not unsubscribed)</div>
                                      </div>
                                    </div>
                                    <button onClick={() => sendCampaign(c.id)} disabled={campSending || !campRecipients}
                                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-medium px-4 py-2 rounded-lg w-full disabled:opacity-50 transition">
                                      {campSending ? "Sending…" : `Send to ${campRecipients ?? 0} leads`}</button>
                                    <p className="text-[11px] text-slate-400">Brevo free tier: ~300 emails/din. Isse zyada par baaki agle din chala jayega.</p>
                                  </div>

                                  {/* past campaigns */}
                                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Past campaigns</div>
                                    {pastCampaigns.length === 0 ? <p className="text-xs text-slate-400">Abhi tak koi campaign nahi.</p> : (
                                      <div className="space-y-2 max-h-[380px] overflow-y-auto">
                                        {pastCampaigns.map((p) => (
                                          <div key={p.id} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                                            <div className="text-sm text-slate-700 truncate">{p.subject}</div>
                                            <div className="text-[11px] text-slate-400">
                                              {p.sent_count}/{p.recipients} sent{p.failed_count ? ` · ${p.failed_count} failed` : ""} · {p.status}
                                            </div>
                                            <div className="text-[10px] text-slate-300">{p.created_at ? new Date(p.created_at).toLocaleString() : ""}</div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {tab === "billing" && (
                                <div className="grid md:grid-cols-3 gap-4">
                                  {/* mark paid / unpaid */}
                                  <div className="md:col-span-1 space-y-3">
                                    <div className={"rounded-xl border px-4 py-3 " + (detail.paid_this_month ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
                                      <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">This month · {detail.current_period}</div>
                                      <div className="text-sm font-semibold">
                                        <span className={detail.paid_this_month ? "text-emerald-700" : "text-rose-600"}>
                                          {detail.paid_this_month ? "✓ Paid" : "● Unpaid"}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 mt-0.5">Access: {detail.access_mode}</div>
                                    </div>

                                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mark paid</div>
                                      <div>
                                        <label className="text-[11px] text-slate-400">Amount (₹)</label>
                                        <input className={inputCls} type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                                      </div>
                                      <div>
                                        <label className="text-[11px] text-slate-400">Method</label>
                                        <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full bg-white" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                                          <option>UPI</option><option>Bank</option><option>Cash</option><option>Other</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[11px] text-slate-400">Note (optional)</label>
                                        <input className={inputCls} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. June invoice" />
                                      </div>
                                      <button onClick={() => markPaid(c.id)} disabled={payBusy}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-medium px-4 py-2 rounded-lg w-full disabled:opacity-50 transition">
                                        {payBusy ? "…" : "✓ Mark Paid (activate)"}</button>
                                    </div>

                                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Unpaid / block</div>
                                      <button onClick={() => markUnpaid(c.id, "block_leads")} disabled={payBusy}
                                        className="border border-amber-300 text-amber-700 hover:bg-amber-50 text-[13px] px-3 py-2 rounded-lg w-full transition">
                                        📥 Block leads (login chalu)</button>
                                      <button onClick={() => markUnpaid(c.id, "block_all")} disabled={payBusy}
                                        className="border border-red-300 text-red-600 hover:bg-red-50 text-[13px] px-3 py-2 rounded-lg w-full transition">
                                        🔴 Block all (login + leads)</button>
                                      <p className="text-[10px] text-slate-400">Payment aate hi “Mark Paid” se wapas active ho jayega.</p>
                                    </div>
                                  </div>

                                  {/* payment history */}
                                  <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Payment history</div>
                                    {payments.length === 0 ? <p className="text-xs text-slate-400">Abhi tak koi payment record nahi.</p> : (
                                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-[13px]">
                                          <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                                            <tr>{["Month", "Amount", "Method", "Note", "Date", ""].map(h => (
                                              <th key={h} className="text-left font-medium px-3 py-2">{h}</th>))}</tr>
                                          </thead>
                                          <tbody>
                                            {payments.map((p) => (
                                              <tr key={p.id} className="border-t border-slate-100">
                                                <td className="px-3 py-2 text-slate-700">{p.period}</td>
                                                <td className="px-3 py-2 font-medium text-emerald-700 tabular-nums">{inr(p.amount)}</td>
                                                <td className="px-3 py-2 text-slate-500">{p.method || "—"}</td>
                                                <td className="px-3 py-2 text-slate-500 truncate max-w-[160px]" title={p.note || ""}>{p.note || "—"}</td>
                                                <td className="px-3 py-2 text-slate-400 text-xs">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : ""}</td>
                                                <td className="px-3 py-2">
                                                  <button onClick={() => deletePayment(c.id, p.id)} className="text-xs text-red-500 hover:underline">delete</button>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-6">Brandbanalo Agency · {clients.length} clients</p>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowAdd(false); setCreated(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {!created ? (
              <>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">Add New Client</h2>
                <p className="text-sm text-slate-400 mb-4">Tenant + login + API key — one go.</p>
                <div className="space-y-3">
                  <input className={inputCls} placeholder="Business name" value={bn} onChange={(e) => setBn(e.target.value)} />
                  <input className={inputCls} placeholder="Login email" value={em} onChange={(e) => setEm(e.target.value)} />
                  <input className={inputCls} placeholder="Password (min 6)" value={pw} onChange={(e) => setPw(e.target.value)} />
                  <input className={inputCls} type="number" placeholder="Monthly rate" value={rate} onChange={(e) => setRate(e.target.value)} />
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 transition">Cancel</button>
                  <button onClick={createClient} disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition">
                    {saving ? "Creating…" : "Create Client"}</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-emerald-600 mb-1">✓ Client Created!</h2>
                <p className="text-sm text-slate-400 mb-4">Handover details (save kar lo).</p>
                <div className="space-y-2 text-sm">
                  {[
                    ["Login URL", (typeof window !== "undefined" ? window.location.origin : "") + "/login"],
                    ["Login email", created.login_email],
                    ["Password", created.password],
                    ["API key", created.api_key],
                    ["Webhook URL", webhookUrl],
                  ].map(([label, val]) => (
                    <div key={label as string} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                      <div className="text-[11px] text-slate-400">{label}</div>
                      <div className="flex gap-2 items-center">
                        <code className="text-xs text-slate-700 truncate flex-1">{val}</code>
                        <button onClick={() => copy(String(val), label as string)} className="text-slate-400 hover:text-indigo-600 shrink-0"><Icon d={ic.copy} size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setShowAdd(false); setCreated(null); }}
                  className="w-full mt-5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium transition">Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}