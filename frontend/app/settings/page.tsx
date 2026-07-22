"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  api_key?: string;
  brand_name?: string;
  logo_url?: string;
  accent_color?: string;
}

/* ---------- Inline SVG icons (shared style with dashboard) ---------- */
const ic = {
  dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  leads:     <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  team:      <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  settings:  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  building:  <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" /></>,
  key:       <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /></>,
  broom:     <path d="M19.4 20l-5.7-5.7M22 2l-8 8M9.5 14.5L3 21m0 0h4l3-3m-6.5 3l3-6.5" />,
  copy:      <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  wordpress: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
};
function Icon({ d, size = 15, className = "" }: { d: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealKey, setRevealKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [brand, setBrand] = useState<{ name: string; logo: string; color: string }>({ name: "", logo: "", color: "#111827" });

  const isAdmin = (typeof window !== "undefined" && localStorage.getItem("role") !== "member");
  const webhookUrl =
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/webhooks/form";

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    if (localStorage.getItem("role") === "super_admin") { router.push("/agency"); return; }
    api
      .get("/tenant/me")
      .then((r) => {
        setTenant(r.data);
        setBrand({
          name: r.data.brand_name || r.data.name || "",
          logo: r.data.logo_url || "",
          color: r.data.accent_color || "#111827",
        });
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, []);

  async function regenerate() {
    if (!confirm("Regenerate API key? Your WordPress integration will stop working until you update the key there."))
      return;
    setRegenerating(true);
    try {
      const r = await api.post("/tenant/regenerate-key");
      setTenant((t) => (t ? { ...t, api_key: r.data.api_key } : t));
      toast.success("API key regenerated. Update your WordPress site now.");
    } catch {
      toast.error("Failed to regenerate key");
    } finally {
      setRegenerating(false);
    }
  }

  async function cleanupDuplicates() {
    if (!confirm("Scan all leads for duplicates (same phone number) and delete older copies?\n\nThis keeps the newest version of each lead and cannot be undone."))
      return;
    setCleaningDuplicates(true);
    try {
      const r = await api.post("/leads/cleanup/duplicates");
      const { deleted, kept } = r.data;
      if (deleted === 0) {
        toast.success("No duplicates found. Your leads are clean!");
      } else {
        toast.success(`Removed ${deleted} duplicate${deleted > 1 ? "s" : ""}. ${kept} unique leads kept.`);
      }
    } catch {
      toast.error("Cleanup failed. Try again.");
    } finally {
      setCleaningDuplicates(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(label + " copied");
  }

  const logout = () => { sessionStorage.removeItem("reminderPopupShown"); localStorage.clear(); router.push("/login"); };
  const nav = [
    { label: "Dashboard", path: "/dashboard", icon: ic.dashboard },
    { label: "Leads", path: "/leads", icon: ic.leads },
    ...(isAdmin ? [{ label: "Team", path: "/team", icon: ic.team }] : []),
    { label: "Settings", path: "/settings", icon: ic.settings },
  ];

  if (loading)
    return <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm bg-[#f4f5f7]">Loading…</div>;
  if (!tenant) return null;

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
            const isActive = n.path === "/settings";
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
            <button onClick={logout} className="text-slate-300 hover:text-white"><Icon d={ic.logout} size={16} /></button>
          </div>
          <nav className="px-2 flex gap-1 overflow-x-auto border-t border-white/10">
            {nav.map((n) => (
              <button key={n.path} onClick={() => router.push(n.path)}
                className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 ${n.path === "/settings" ? "border-blue-400 text-white" : "border-transparent text-slate-400"}`}>{n.label}</button>
            ))}
          </nav>
        </header>

        {/* Page top bar */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-20">
          <h1 className="text-[15px] font-semibold text-slate-800">Settings</h1>
        </div>

        <div className="px-4 sm:px-6 py-5 max-w-[820px] w-full mx-auto flex-1 space-y-4">
          {/* Business info */}
          <div className="bg-white border border-slate-200 rounded-md">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
              <Icon d={ic.building} size={14} className="text-slate-400" />
              <h2 className="text-[13px] font-semibold text-slate-700">Business</h2>
            </div>
            <div className="p-4 text-[13px] space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Name</span>
                <span className="font-medium text-slate-800">{tenant.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Plan</span>
                <span className="font-medium text-slate-800 capitalize">{tenant.plan}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Tenant ID</span>
                <span className="font-mono text-[11px] text-slate-500">{tenant.id}</span>
              </div>
            </div>
          </div>

          {/* API key — admin only */}
          {isAdmin && (
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                <Icon d={ic.key} size={14} className="text-slate-400" />
                <h2 className="text-[13px] font-semibold text-slate-700">Website Integration Key</h2>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-[12px] text-slate-500">
                  Use this key on your WordPress site so form submissions land in your CRM. Treat it like a password.
                </p>

                {tenant.api_key && (
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">API key</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={revealKey ? tenant.api_key : "•".repeat(Math.min(tenant.api_key.length, 32))}
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 font-mono text-xs bg-slate-50"
                      />
                      <button onClick={() => setRevealKey((v) => !v)} className="text-[13px] border border-slate-300 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 transition">
                        {revealKey ? "Hide" : "Reveal"}
                      </button>
                      <button onClick={() => copy(tenant.api_key!, "API key")} className="text-[13px] border border-slate-300 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 transition">
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Webhook URL</label>
                  <div className="flex gap-2">
                    <input readOnly value={webhookUrl} className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs bg-slate-50" />
                    <button onClick={() => copy(webhookUrl, "Webhook URL")} className="text-[13px] border border-slate-300 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 transition">
                      Copy
                    </button>
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    onClick={regenerate}
                    disabled={regenerating}
                    className="text-[13px] border border-red-200 text-red-600 rounded-lg px-3 py-2 hover:bg-red-50 disabled:opacity-50 transition"
                  >
                    {regenerating ? "Regenerating..." : "Regenerate Key"}
                  </button>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Use this only if your key has leaked. The old key stops working immediately.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cleanup Duplicates — admin only (deletes leads) */}
          {isAdmin && (
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                <Icon d={ic.broom} size={14} className="text-slate-400" />
                <h2 className="text-[13px] font-semibold text-slate-700">Lead Cleanup</h2>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-[12px] text-slate-500">
                  Find leads with the same phone number and keep only the newest one. Useful when users accidentally submit a form twice.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900">
                  <strong>How it works:</strong> Phones are matched after normalizing
                  (so <code className="bg-amber-100 px-1 rounded">9711110147</code>, <code className="bg-amber-100 px-1 rounded">09711110147</code>, and{" "}
                  <code className="bg-amber-100 px-1 rounded">+91 9711 110147</code> are treated as the same number). The newest submission is kept, older ones are deleted permanently.
                </div>
                <div>
                  <button
                    onClick={cleanupDuplicates}
                    disabled={cleaningDuplicates}
                    className="text-[13px] bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 disabled:opacity-50 transition"
                  >
                    {cleaningDuplicates ? "Scanning..." : "Cleanup Duplicate Leads"}
                  </button>
                  <p className="text-[11px] text-slate-400 mt-2">
                    New form submissions are auto-deduplicated within 1 hour. This button cleans up older duplicates.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* WordPress instructions — admin only */}
          {isAdmin && (
            <div className="bg-white border border-slate-200 rounded-md">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                <Icon d={ic.wordpress} size={14} className="text-slate-400" />
                <h2 className="text-[13px] font-semibold text-slate-700">Connect WordPress</h2>
              </div>
              <ol className="p-4 text-[13px] text-slate-600 space-y-2 list-decimal pl-8">
                <li>Install <span className="font-medium text-slate-800">WPCode</span> (or Code Snippets) plugin on WordPress.</li>
                <li>Add the PHP snippet provided by your CRM administrator and replace the placeholder Webhook URL and API key with values from above.</li>
                <li>Add hidden UTM fields to your Elementor or CF7 form (utm_source, utm_medium, utm_campaign, gclid, fbclid, etc.).</li>
                <li>Enqueue the UTM-capture JS so Google Ads / Meta Ads click data flows through.</li>
                <li>Submit a test form &mdash; it should appear in Leads within seconds.</li>
              </ol>
            </div>
          )}

          {/* Staff note */}
          {!isAdmin && (
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <p className="text-[13px] text-slate-500">
                Integration keys aur settings sirf account admin dekh sakte hain. Aap saari leads dekh aur manage kar sakte hain — Leads page pe jaayein.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}