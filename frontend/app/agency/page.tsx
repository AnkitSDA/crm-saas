"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";

interface ClientRow {
  id: string; name: string; slug: string; plan: string;
  is_active: boolean; monthly_rate: number;
  leads: number; won: number; revenue: number; spend: number;
  roas: number | null; created_at: string;
}
interface Totals {
  clients: number; leads: number; won: number;
  revenue: number; spend: number; mrr: number; roas: number | null;
}

const inr = (n: number) =>
  "₹" + Math.round(n || 0).toLocaleString("en-IN");
const roasTxt = (r: number | null) => (r == null ? "—" : r.toFixed(1) + "x");

export default function AgencyDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [created, setCreated] = useState<any>(null);

  const webhookUrl =
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/webhooks/form";

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
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null);
    try { const r = await api.get(`/admin/clients/${id}`); setDetail(r.data); }
    catch { toast.error("Failed to load client"); }
  }

  async function createClient() {
    if (!bn || !em || !pw) { toast.error("Fill business name, email, password"); return; }
    setSaving(true);
    try {
      const r = await api.post("/admin/clients", {
        business_name: bn, email: em, password: pw,
        monthly_rate: parseFloat(rate) || 0,
      });
      setCreated({ ...r.data, password: pw });
      setBn(""); setEm(""); setPw(""); setRate("3500");
      toast.success("Client created!");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Failed to create client");
    } finally { setSaving(false); }
  }

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast.success(l + " copied"); };

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* header */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b px-6 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Agency Dashboard</h1>
          <p className="text-xs text-slate-400">Brandbanalo · all clients</p>
        </div>
        <div className="flex gap-3 items-center">
          <button onClick={() => setShowAdd(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            + Add Client
          </button>
          <button onClick={() => { localStorage.clear(); router.push("/login"); }}
            className="text-sm text-slate-400 hover:text-red-500">Logout</button>
        </div>
      </div>

      <div className="max-w-[1500px] mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-xs text-slate-400">{k.label}</div>
              <div className="text-2xl font-semibold text-slate-800 mt-1">{k.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* clients table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b text-sm font-semibold text-slate-700">All Clients</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  {["Client", "Leads", "Won", "Revenue", "Spend", "ROAS", "Rate/mo", "Status", ""].map(h => (
                    <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    No clients yet. Click “+ Add Client” to onboard your first one.
                  </td></tr>
                )}
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
                          (c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {c.is_active ? "active" : "inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => openClient(c.id)}
                          className="text-indigo-600 hover:underline text-sm">
                          {openId === c.id ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {openId === c.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={9} className="px-6 py-4">
                          {!detail ? <div className="text-slate-400 text-sm">Loading…</div> : (
                            <div className="grid md:grid-cols-3 gap-5">
                              <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">SOURCES</div>
                                {detail.sources.length === 0 && <div className="text-xs text-slate-400">No leads yet</div>}
                                {detail.sources.map((s: any) => (
                                  <div key={s.source} className="flex justify-between text-sm py-0.5">
                                    <span className="capitalize text-slate-600">{s.source.replace("_", " ")}</span>
                                    <span className="text-slate-500">{s.leads} leads · {s.won} won</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">INTEGRATION</div>
                                <div className="text-xs text-slate-500 mb-1">API key</div>
                                <div className="flex gap-2 mb-2">
                                  <code className="text-xs bg-white border rounded px-2 py-1 truncate flex-1">{detail.api_key}</code>
                                  <button onClick={() => copy(detail.api_key, "API key")} className="text-xs text-indigo-600">Copy</button>
                                </div>
                                <div className="text-xs text-slate-500 mb-1">Webhook URL</div>
                                <div className="flex gap-2">
                                  <code className="text-xs bg-white border rounded px-2 py-1 truncate flex-1">{webhookUrl}</code>
                                  <button onClick={() => copy(webhookUrl, "Webhook")} className="text-xs text-indigo-600">Copy</button>
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-slate-500 mb-2">RECENT LEADS</div>
                                {detail.recent.length === 0 && <div className="text-xs text-slate-400">None</div>}
                                {detail.recent.slice(0, 6).map((l: any, i: number) => (
                                  <div key={i} className="flex justify-between text-sm py-0.5">
                                    <span className="text-slate-600 truncate">{l.name || l.phone || "—"}</span>
                                    <span className="text-xs text-slate-400 capitalize">{l.status}</span>
                                  </div>
                                ))}
                              </div>
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

      {/* Add Client modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowAdd(false); setCreated(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            {!created ? (
              <>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">Add New Client</h2>
                <p className="text-sm text-slate-400 mb-4">Creates a tenant + login + API key in one go.</p>
                <div className="space-y-3">
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Business name (e.g. JK Machines)"
                    value={bn} onChange={(e) => setBn(e.target.value)} />
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Login email (client@xyz.in)"
                    value={em} onChange={(e) => setEm(e.target.value)} />
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Password (min 6 chars)"
                    value={pw} onChange={(e) => setPw(e.target.value)} />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">₹</span>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Monthly rate" type="number"
                      value={rate} onChange={(e) => setRate(e.target.value)} />
                    <span className="text-xs text-slate-400">/mo</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setShowAdd(false)} className="flex-1 border rounded-lg py-2 text-sm text-slate-600">Cancel</button>
                  <button onClick={createClient} disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                    {saving ? "Creating…" : "Create Client"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-emerald-600 mb-1">✓ Client Created!</h2>
                <p className="text-sm text-slate-400 mb-4">Handover yeh details client ko (ya save kar lo).</p>
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
