"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";

interface ClientRow {
  id: string; name: string; slug: string; plan: string;
  is_active: boolean; monthly_rate: number; enabled_sources: string;
  leads: number; won: number; revenue: number; spend: number;
  roas: number | null; created_at: string;
}
interface Totals {
  clients: number; leads: number; won: number;
  revenue: number; spend: number; mrr: number; roas: number | null;
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
  const [tab, setTab] = useState<"manage" | "leads">("manage");

  // editable settings (for open client)
  const [eRate, setERate] = useState(""); const [ePlan, setEPlan] = useState("");
  const [eMode, setEMode] = useState("active"); const [eSources, setESources] = useState<string[]>([]);
  const [savedPw, setSavedPw] = useState<string | null>(null);
  const [eBrand, setEBrand] = useState(""); const [eLogo, setELogo] = useState(""); const [eColor, setEColor] = useState("#4f46e5");

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

  async function openClient(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); setLeads([]); setSavedPw(null); return; }
    setOpenId(id); setDetail(null); setLeads([]); setSavedPw(null); setTab("manage");
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
    } catch { toast.error("Failed to load client"); }
  }

  async function loadLeads(id: string) {
    try { const r = await api.get(`/admin/clients/${id}/leads?limit=200`); setLeads(r.data); }
    catch { toast.error("Failed to load leads"); }
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
                <tr>{["Client", "Leads", "Won", "Revenue", "Spend", "ROAS", "Rate/mo", "Status", ""].map(h => (
                  <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>))}</tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">
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
                      <td className="px-4 py-3"><span className={"text-xs px-2 py-0.5 rounded-full " +
                        (c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                        {c.is_active ? "active" : "inactive"}</span></td>
                      <td className="px-4 py-3"><button onClick={() => openClient(c.id)}
                        className="text-indigo-600 hover:underline text-sm">{openId === c.id ? "Close" : "Manage"}</button></td>
                    </tr>
                    {openId === c.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={9} className="px-6 py-4">
                          {!detail ? <div className="text-slate-400 text-sm">Loading…</div> : (
                            <div>
                              {/* tabs */}
                              <div className="flex gap-2 mb-4">
                                <button onClick={() => setTab("manage")}
                                  className={"text-sm px-3 py-1.5 rounded-lg " + (tab === "manage" ? "bg-indigo-600 text-white" : "bg-white border text-slate-600")}>Manage</button>
                                <button onClick={() => { setTab("leads"); loadLeads(c.id); }}
                                  className={"text-sm px-3 py-1.5 rounded-lg " + (tab === "leads" ? "bg-indigo-600 text-white" : "bg-white border text-slate-600")}>Leads ({c.leads})</button>
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