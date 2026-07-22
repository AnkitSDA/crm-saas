"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import api from "@/lib/api";

interface Member {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

/* ---------- Inline SVG icons (shared style with dashboard) ---------- */
const ic = {
  dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  leads:     <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  team:      <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  settings:  <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  logout:    <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  plus:      <path d="M12 5v14M5 12h14" />,
  trash:     <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>,
  copy:      <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
};
function Icon({ d, size = 15, className = "" }: { d: React.ReactNode; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={className}>{d}</svg>
  );
}

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState<{ name: string; logo: string; color: string }>({ name: "", logo: "", color: "#111827" });

  const [showAdd, setShowAdd] = useState(false);
  const [fName, setFName] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fPass, setFPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; pass: string } | null>(null);

  function loadTenant() {
    return api.get("/tenant/me").then((r) => {
      setBrand({
        name: r.data.brand_name || r.data.name || "",
        logo: r.data.logo_url || "",
        color: r.data.accent_color || "#111827",
      });
    }).catch(() => {});
  }
  function loadTeam() {
    return api.get("/leads/team").then((r) => setMembers(r.data || []));
  }

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    const role = localStorage.getItem("role");
    if (role === "super_admin") { router.push("/agency"); return; }
    // staff (member) cannot manage team — send them to dashboard
    if (role === "member") { router.push("/dashboard"); return; }
    loadTenant();
    loadTeam().catch(() => router.push("/dashboard")).finally(() => setLoading(false));
  }, []);

  async function addMember() {
    if (!fName.trim() || !fEmail.trim()) { toast.error("Naam aur email dono zaroori hain"); return; }
    if (fPass.length < 6) { toast.error("Password kam se kam 6 characters ka ho"); return; }
    setSaving(true);
    try {
      await api.post("/leads/team", { full_name: fName.trim(), email: fEmail.trim(), password: fPass });
      setCreated({ name: fName.trim(), email: fEmail.trim().toLowerCase(), pass: fPass });
      setFName(""); setFEmail(""); setFPass("");
      toast.success("Team member add ho gaya");
      loadTeam();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Add failed");
    } finally { setSaving(false); }
  }

  async function removeMember(id: string, name: string | null) {
    if (!confirm(`${name || "Is member"} ko team se hata dein? Iska login band ho jayega.`)) return;
    try {
      await api.delete(`/leads/team/${id}`);
      toast.success("Member removed");
      loadTeam();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Remove failed");
    }
  }

  const copy = (t: string, l: string) => { navigator.clipboard.writeText(t); toast.success(l + " copied"); };
  const logout = () => { sessionStorage.removeItem("reminderPopupShown"); localStorage.clear(); router.push("/login"); };

  const nav = [
    { label: "Dashboard", path: "/dashboard", icon: ic.dashboard },
    { label: "Leads", path: "/leads", icon: ic.leads },
    { label: "Team", path: "/team", icon: ic.team },
    { label: "Settings", path: "/settings", icon: ic.settings },
  ];

  if (loading)
    return <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm bg-[#f4f5f7]">Loading…</div>;

  const admins = members.filter((m) => m.role === "tenant_admin");
  const staff = members.filter((m) => m.role === "member");

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
            const isActive = n.path === "/team";
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
                className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 ${n.path === "/team" ? "border-blue-400 text-white" : "border-transparent text-slate-400"}`}>{n.label}</button>
            ))}
          </nav>
        </header>

        {/* Page top bar */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 sticky top-0 z-20">
          <h1 className="text-[15px] font-semibold text-slate-800 mr-2">Team</h1>
          <span className="text-[12px] text-slate-400">{members.length} member{members.length !== 1 ? "s" : ""}</span>
          <button onClick={() => { setShowAdd(true); setCreated(null); }}
            className="ml-auto flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition">
            <Icon d={ic.plus} size={14} />Add Member
          </button>
        </div>

        <div className="px-4 sm:px-6 py-5 max-w-[900px] w-full mx-auto flex-1">
          <div className="bg-white border border-slate-200 rounded-md overflow-hidden mb-4">
            <div className="px-4 py-2.5 border-b border-slate-100 text-[13px] font-semibold text-slate-700">Members</div>
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Email</th>
                  <th className="text-left font-medium px-4 py-2.5">Role</th>
                  <th className="text-right font-medium px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{m.full_name || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">Admin</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] text-slate-300">—</td>
                  </tr>
                ))}
                {staff.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{m.full_name || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Staff</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => removeMember(m.id, m.full_name)}
                        className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:bg-red-50 px-2 py-1 rounded transition">
                        <Icon d={ic.trash} size={12} />Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-[13px]">
                      Abhi koi staff nahi. "Add Member" se apni team ke logon ko add karo — wo apne login se saari leads dekh aur manage kar sakenge.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[12px] text-slate-400">
            Staff members saari leads dekh aur manage kar sakte hain (call, WhatsApp, notes, follow-up, status).
            Lead delete, CSV export, aur Manage ROAS sirf admin (aap) kar sakte hain.
          </p>
        </div>
      </div>

      {/* Add member modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowAdd(false); setCreated(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {!created ? (
              <>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">Add Team Member</h2>
                <p className="text-sm text-slate-400 mb-4">Staff ka login banao. Ye details unhe de dena — wo isse login karenge.</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-slate-500">Full name</label>
                    <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full mt-0.5" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Rahul Sharma" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Login email</label>
                    <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full mt-0.5" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="rahul@example.com" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500">Password (min 6)</label>
                    <input className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full mt-0.5" value={fPass} onChange={(e) => setFPass(e.target.value)} placeholder="Set a password" />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-300 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50 transition">Cancel</button>
                  <button onClick={addMember} disabled={saving}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 transition">
                    {saving ? "Adding…" : "Add Member"}</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-emerald-600 mb-1">✓ Member Added!</h2>
                <p className="text-sm text-slate-400 mb-4">Ye details {created.name} ko de do — inse wo login karenge.</p>
                <div className="space-y-2 text-sm">
                  {[
                    ["Login URL", (typeof window !== "undefined" ? window.location.origin : "") + "/login"],
                    ["Email", created.email],
                    ["Password", created.pass],
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