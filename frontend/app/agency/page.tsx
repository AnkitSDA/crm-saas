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
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading agency dashboard…</div>;

  const kpis = totals ? [
    { label: "Clients", value: totals.clients, sub: `${clients.filter(c => c.is_active).length} active` },
    { label: "Total Leads", value: totals.leads, sub: `${totals.won} won` },
    { label: "MRR", value: inr(totals.mrr), sub: "monthly recurring" },
    { label: "Collected (mo)", value: inr(totals.collected || 0), sub: `${totals.paid_count || 0}/${totals.clients} paid` },
    { label: "Revenue tracked", value: inr(totals.revenue), sub: "won deals" },
    { label: "Ad Spend", value: inr(totals.spend), sub: "all clients" },
    { label: "Blended ROAS", value: roasTxt(totals.roas), sub: "revenue / spend" },
  ] : [];

  const inputCls = "border rounded-lg px-3 py-2 text-sm w-full";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-6 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Agency Dashboard</h1>
          <p className="text-xs text-slate-400">Brandbanalo · all clients</p>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={() => { setShowAdd(true); setCreated(null); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg">+ Add Client</button>
          <button onClick={() => { localStorage.clear(); router.push("/login"); }}
            className="text-sm text-slate-400 hover:text-red-500">Logout</button>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-400">{k.label}</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">{k.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b text-sm font-semibold text-slate-700">All Clients</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>{["Client", "Leads", "Won", "Revenue", "Spend", "ROAS", "Rate/mo", "This Month", "Status", ""].map(h => (
                  <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>))}</tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No clients yet. Click “+ Add Client”.</td></tr>)}
                {clients.map((c) => (
                  <>
                    <tr key={c.id} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                      <td className="px-4 py-3">{c.leads}</td>
                      <td className="px-4 py-3">{c.won}</td>
                      <td className="px-4 py-3">{inr(c.revenue)}</td>
                      <td className="px-4 py-3">{inr(c.spend)}</td>
                      <td className="px-4 py-3 font-medium text-emerald-600">{roasTxt(c.roas)}</td>
                      <td className="px-4 py-3">{inr(c.monthly_rate)}</td>
                      <td className="px-4 py-3">
                        <span className={"text-xs px-2 py-0.5 rounded-full " +
                          (c.paid_this_month ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600")}>
                          {c.paid_this_month ? "✓ paid" : "unpaid"}</span>
                      </td>
                      <td className="px-4 py-3"><span className={"text-xs px-2 py-0.5 rounded-full " +
                        (c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {c.is_active ? "active" : "inactive"}</span></td>
                      <td className="px-4 py-3"><button onClick={() => openClient(c.id)}
                        className="text-indigo-600 hover:underline text-sm">{openId === c.id ? "Close" : "Manage"}</button></td>
                    </tr>
                    {openId === c.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={10} className="px-6 py-4">
                          {!detail ? <div className="text-slate-400 text-sm">Loading…</div> : (
                            <div>
                              {/* tabs */}
                              <div className="flex gap-2 mb-4 flex-wrap">
                                <button onClick={() => setTab("manage")}
                                  className={"text-sm px-3 py-1.5 rounded-lg " + (tab === "manage" ? "bg-indigo-600 text-white" : "bg-white border text-slate-600")}>Manage</button>
                                <button onClick={() => { setTab("leads"); loadLeads(c.id); }}
                                  className={"text-sm px-3 py-1.5 rounded-lg " + (tab === "leads" ? "bg-indigo-600 text-white" : "bg-white border text-slate-600")}>Leads ({c.leads})</button>
                                <button onClick={() => { setTab("email"); loadCampaignMeta(c.id); }}
                                  className={"text-sm px-3 py-1.5 rounded-lg " + (tab === "email" ? "bg-indigo-600 text-white" : "bg-white border text-slate-600")}>📧 Email</button>
                                <button onClick={() => { setTab("billing"); loadBilling(c.id); }}
                                  className={"text-sm px-3 py-1.5 rounded-lg " + (tab === "billing" ? "bg-indigo-600 text-white" : "bg-white border text-slate-600")}>💳 Billing</button>
                              </div>

                              {tab === "manage" && (
                                <div className="grid md:grid-cols-3 gap-5">
                                  {/* settings */}
                                  <div className="space-y-3">
                                    <div className="text-xs font-semibold text-slate-500">SETTINGS</div>
                                    <div>
                                      <label className="text-xs text-slate-400">Monthly rate (₹)</label>
                                      <input className={inputCls} type="number" value={eRate} onChange={(e) => setERate(e.target.value)} />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-400">Plan</label>
                                      <input className={inputCls} value={ePlan} onChange={(e) => setEPlan(e.target.value)} placeholder="active / basic / pro" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-400">Access mode</label>
                                      <div className="grid grid-cols-2 gap-2 mt-1">
                                        {[
                                          {k:"active",label:"🟢 Active",d:"leads + login ON"},
                                          {k:"block_all",label:"🔴 Block all",d:"leads + login OFF"},
                                          {k:"block_leads",label:"📥 Block leads",d:"login ON, no new leads"},
                                          {k:"block_login",label:"🔒 Block login",d:"leads ON, no access"},
                                        ].map((m)=>(
                                          <button key={m.k} onClick={()=>setEMode(m.k)} title={m.d}
                                            className={"text-xs px-2 py-2 rounded-lg border text-left " +
                                              (eMode===m.k ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "bg-white border-slate-200 text-slate-500")}>
                                            <div>{m.label}</div><div className="text-[10px] text-slate-400">{m.d}</div>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-400">Sources on/off</label>
                                      <div className="flex gap-2 mt-1">
                                        {SOURCES.map((s) => (
                                          <button key={s.key} onClick={() => toggleSource(s.key)}
                                            className={"text-xs px-3 py-1.5 rounded-lg border " +
                                              (eSources.includes(s.key) ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-400")}>
                                            {eSources.includes(s.key) ? "✓ " : ""}{s.label}</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="pt-2 mt-1 border-t border-slate-200">
                                      <div className="text-xs font-semibold text-slate-500 mb-2">BRANDING (white-label)</div>
                                      <label className="text-xs text-slate-400">Display name</label>
                                      <input className={inputCls} value={eBrand} onChange={(e) => setEBrand(e.target.value)} placeholder="Client brand name" />
                                      <label className="text-xs text-slate-400 mt-2 block">Logo URL</label>
                                      <input className={inputCls} value={eLogo} onChange={(e) => setELogo(e.target.value)} placeholder="https://...logo.png" />
                                      <div className="flex items-center gap-2 mt-2">
                                        <label className="text-xs text-slate-400">Accent color</label>
                                        <input type="color" value={eColor} onChange={(e) => setEColor(e.target.value)} className="h-8 w-12 border rounded" />
                                        <input className="border rounded-lg px-2 py-1 text-xs w-24" value={eColor} onChange={(e) => setEColor(e.target.value)} />
                                        {eLogo ? <img src={eLogo} alt="" className="h-8 ml-auto rounded" onError={(ev:any)=>{ev.target.style.display='none';}} /> : null}
                                      </div>
                                    </div>
                                    <button onClick={() => saveSettings(c.id)}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg w-full">Save Settings</button>
                                  </div>

                                  {/* login + password */}
                                  <div className="space-y-3">
                                    <div className="text-xs font-semibold text-slate-500">LOGIN</div>
                                    <div className="bg-white rounded-lg border px-3 py-2">
                                      <div className="text-xs text-slate-400">Login email</div>
                                      <div className="text-sm text-slate-700 truncate">{detail.login_email || "—"}</div>
                                    </div>
                                    <button onClick={() => resetPw(c.id)}
                                      className="border border-red-200 text-red-600 hover:bg-red-50 text-sm px-4 py-2 rounded-lg w-full">Reset Password</button>
                                    {savedPw && (
                                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        <div className="text-xs text-amber-600">New password (save it!)</div>
                                        <div className="flex gap-2 items-center">
                                          <code className="text-sm text-amber-800 flex-1">{savedPw}</code>
                                          <button onClick={() => copy(savedPw, "Password")} className="text-xs text-indigo-600">Copy</button>
                                        </div>
                                      </div>
                                    )}
                                    <div className="pt-2 mt-2 border-t border-slate-200">
                                      <div className="text-xs font-semibold text-red-400 mb-1">DANGER ZONE</div>
                                      <button onClick={() => deleteClient(c.id, c.name)}
                                        className="border border-red-300 text-red-600 hover:bg-red-50 text-sm px-4 py-2 rounded-lg w-full">
                                        Delete Client (permanent)</button>
                                    </div>
                                  </div>

                                  {/* integration */}
                                  <div className="space-y-3">
                                    <div className="text-xs font-semibold text-slate-500">INTEGRATION</div>
                                    <div>
                                      <div className="text-xs text-slate-400 mb-1">API key</div>
                                      <div className="flex gap-2">
                                        <code className="text-xs bg-white border rounded px-2 py-1 truncate flex-1">{detail.api_key}</code>
                                        <button onClick={() => copy(detail.api_key, "API key")} className="text-xs text-indigo-600">Copy</button>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-xs text-slate-400 mb-1">Webhook URL</div>
                                      <div className="flex gap-2">
                                        <code className="text-xs bg-white border rounded px-2 py-1 truncate flex-1">{webhookUrl}</code>
                                        <button onClick={() => copy(webhookUrl, "Webhook")} className="text-xs text-indigo-600">Copy</button>
                                      </div>
                                    </div>
                                    <div className="pt-1">
                                      <div className="text-xs text-slate-400 mb-1">Sources breakdown</div>
                                      {detail.sources.map((s: any) => (
                                        <div key={s.source} className="flex justify-between text-xs py-0.5">
                                          <span className="capitalize text-slate-600">{s.source.replace("_", " ")}</span>
                                          <span className="text-slate-400">{s.leads} leads · {s.won} won</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {tab === "leads" && (
                                <div className="bg-white rounded-lg border overflow-hidden">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-400 text-xs uppercase">
                                      <tr>{["Name", "Phone", "Source", "Status", "Deal ₹"].map(h => (
                                        <th key={h} className="text-left font-medium px-3 py-2">{h}</th>))}</tr>
                                    </thead>
                                    <tbody>
                                      {leads.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No leads</td></tr>}
                                      {leads.map((l) => (
                                        <tr key={l.id} className="border-t">
                                          <td className="px-3 py-2 text-slate-700">{l.name || "—"}</td>
                                          <td className="px-3 py-2 text-slate-500">{l.phone || "—"}</td>
                                          <td className="px-3 py-2 text-slate-500 capitalize">{(l.source || "").replace("_", " ")}</td>
                                          <td className="px-3 py-2">
                                            <select defaultValue={l.status}
                                              onChange={(e) => { updateLead(l.id, { status: e.target.value });
                                                setLeads((arr) => arr.map((x) => x.id === l.id ? { ...x, status: e.target.value } : x)); }}
                                              className="border rounded px-2 py-1 text-xs">
                                              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                          </td>
                                          <td className="px-3 py-2">
                                            {l.status === "won" ? (
                                              <input type="number" defaultValue={l.deal_value || ""} placeholder="value"
                                                onBlur={(e) => updateLead(l.id, { deal_value: parseFloat(e.target.value) || 0 })}
                                                className="border rounded px-2 py-1 text-xs w-24" />
                                            ) : <span className="text-slate-300 text-xs">—</span>}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {tab === "email" && (
                                <div className="grid md:grid-cols-3 gap-5">
                                  {/* compose */}
                                  <div className="md:col-span-2 space-y-3">
                                    <div className="text-xs font-semibold text-slate-500">COMPOSE EMAIL</div>
                                    <div>
                                      <label className="text-xs text-slate-400">Subject</label>
                                      <input className={inputCls} value={campSubject} onChange={(e) => setCampSubject(e.target.value)} placeholder="e.g. New eco-bag collection 🌿" />
                                    </div>
                                    <div>
                                      <label className="text-xs text-slate-400">Message</label>
                                      <textarea className={inputCls + " min-h-[170px]"} value={campBody} onChange={(e) => setCampBody(e.target.value)}
                                        placeholder={"Hi {{name}},\n\nApna message yahan likho...\n\n— Team " + (detail.branding?.brand_name || detail.name || "")} />
                                      <p className="text-[11px] text-slate-400 mt-1">
                                        Tip: <code>{"{{name}}"}</code> likho to lead ka naam aa jayega. Har email ke neeche unsubscribe link apne aap lagega.
                                      </p>
                                    </div>
                                    <div className="flex items-end gap-3 flex-wrap">
                                      <div>
                                        <label className="text-xs text-slate-400 block">Sirf in leads ko</label>
                                        <select className="border rounded-lg px-3 py-2 text-sm bg-white" value={campStatus}
                                          onChange={(e) => { setCampStatus(e.target.value); refreshRecipients(c.id, e.target.value); }}>
                                          <option value="">All statuses</option>
                                          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                      </div>
                                      <div className="ml-auto text-right">
                                        <div className="text-2xl font-semibold text-slate-800">{campRecipients ?? "—"}</div>
                                        <div className="text-[11px] text-slate-400">recipients (email + not unsubscribed)</div>
                                      </div>
                                    </div>
                                    <button onClick={() => sendCampaign(c.id)} disabled={campSending || !campRecipients}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg w-full disabled:opacity-50">
                                      {campSending ? "Sending…" : `Send to ${campRecipients ?? 0} leads`}</button>
                                    <p className="text-[11px] text-slate-400">Brevo free tier: ~300 emails/din. Isse zyada par baaki agle din chala jayega.</p>
                                  </div>

                                  {/* past campaigns */}
                                  <div className="space-y-2">
                                    <div className="text-xs font-semibold text-slate-500">PAST CAMPAIGNS</div>
                                    {pastCampaigns.length === 0 ? <p className="text-xs text-slate-400">Abhi tak koi campaign nahi.</p> : (
                                      <div className="space-y-2 max-h-[380px] overflow-y-auto">
                                        {pastCampaigns.map((p) => (
                                          <div key={p.id} className="bg-white border rounded-lg px-3 py-2">
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
                                <div className="grid md:grid-cols-3 gap-5">
                                  {/* mark paid / unpaid */}
                                  <div className="md:col-span-1 space-y-3">
                                    <div className="text-xs font-semibold text-slate-500">THIS MONTH ({detail.current_period})</div>
                                    <div className={"rounded-lg border px-3 py-3 " + (detail.paid_this_month ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")}>
                                      <div className="text-sm font-semibold">
                                        <span className={detail.paid_this_month ? "text-emerald-700" : "text-rose-600"}>
                                          {detail.paid_this_month ? "✓ Paid" : "● Unpaid"}
                                        </span>
                                      </div>
                                      <div className="text-[11px] text-slate-500 mt-0.5">Access: {detail.access_mode}</div>
                                    </div>

                                    <div className="bg-white border rounded-lg p-3 space-y-2">
                                      <div className="text-xs font-semibold text-slate-500">MARK PAID</div>
                                      <div>
                                        <label className="text-[11px] text-slate-400">Amount (₹)</label>
                                        <input className={inputCls} type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                                      </div>
                                      <div>
                                        <label className="text-[11px] text-slate-400">Method</label>
                                        <select className="border rounded-lg px-3 py-2 text-sm w-full bg-white" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                                          <option>UPI</option><option>Bank</option><option>Cash</option><option>Other</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-[11px] text-slate-400">Note (optional)</label>
                                        <input className={inputCls} value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. June invoice" />
                                      </div>
                                      <button onClick={() => markPaid(c.id)} disabled={payBusy}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded-lg w-full disabled:opacity-50">
                                        {payBusy ? "…" : "✓ Mark Paid (activate)"}</button>
                                    </div>

                                    <div className="bg-white border rounded-lg p-3 space-y-2">
                                      <div className="text-xs font-semibold text-slate-500">UNPAID / BLOCK</div>
                                      <button onClick={() => markUnpaid(c.id, "block_leads")} disabled={payBusy}
                                        className="border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm px-3 py-2 rounded-lg w-full">
                                        📥 Block leads (login chalu)</button>
                                      <button onClick={() => markUnpaid(c.id, "block_all")} disabled={payBusy}
                                        className="border border-red-300 text-red-600 hover:bg-red-50 text-sm px-3 py-2 rounded-lg w-full">
                                        🔴 Block all (login + leads)</button>
                                      <p className="text-[10px] text-slate-400">Payment aate hi “Mark Paid” se wapas active ho jayega.</p>
                                    </div>
                                  </div>

                                  {/* payment history */}
                                  <div className="md:col-span-2 space-y-2">
                                    <div className="text-xs font-semibold text-slate-500">PAYMENT HISTORY</div>
                                    {payments.length === 0 ? <p className="text-xs text-slate-400">Abhi tak koi payment record nahi.</p> : (
                                      <div className="bg-white border rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                          <thead className="bg-slate-50 text-slate-400 text-xs uppercase">
                                            <tr>{["Month", "Amount", "Method", "Note", "Date", ""].map(h => (
                                              <th key={h} className="text-left font-medium px-3 py-2">{h}</th>))}</tr>
                                          </thead>
                                          <tbody>
                                            {payments.map((p) => (
                                              <tr key={p.id} className="border-t">
                                                <td className="px-3 py-2 text-slate-700">{p.period}</td>
                                                <td className="px-3 py-2 font-medium text-emerald-700">{inr(p.amount)}</td>
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
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowAdd(false); setCreated(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
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
                  <button onClick={() => setShowAdd(false)} className="flex-1 border rounded-lg py-2 text-sm text-slate-600">Cancel</button>
                  <button onClick={createClient} disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
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
                    <div key={label as string} className="bg-slate-50 rounded-lg px-3 py-2">
                      <div className="text-xs text-slate-400">{label}</div>
                      <div className="flex gap-2 items-center">
                        <code className="text-xs text-slate-700 truncate flex-1">{val}</code>
                        <button onClick={() => copy(String(val), label as string)} className="text-xs text-indigo-600">Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { setShowAdd(false); setCreated(null); }}
                  className="w-full mt-5 bg-slate-800 text-white rounded-lg py-2 text-sm font-medium">Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}