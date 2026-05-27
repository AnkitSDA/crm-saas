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
  created_at: string;
}

// Parse notes like "Form: X Message: Y City: Z" into structured fields.
// Handles both newline-separated and space-separated formats.
function parseNotes(notes: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!notes) return result;

  const text = notes.replace(/\s+/g, " ").trim();
  const knownKeys = ["Form", "Message", "Quantity", "Requirement", "City"];
  const keyAlt = knownKeys.join("|");
  const regex = new RegExp(
    `(${keyAlt})\\s*:\\s*(.+?)(?=\\s+(?:${keyAlt})\\s*:|$)`,
    "gi"
  );

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    result[key] = value;
  }
  return result;
}

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
  });

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    fetchLeads();
  }, []);

  useEffect(() => {
    const id = setTimeout(fetchLeads, search ? 350 : 0);
    return () => clearTimeout(id);
  }, [search, statusFilter, sourceFilter]);

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

  async function createLead() {
    try {
      await api.post("/leads/", { ...form, source: "manual" });
      toast.success("Lead added");
      setForm({ name: "", phone: "", email: "", notes: "" });
      setShowForm(false);
      fetchLeads();
    } catch {
      toast.error("Failed to add lead");
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await api.patch(`/leads/${id}`, { status });
      fetchLeads();
    } catch {
      toast.error("Update failed");
    }
  }

  function exportCsv() {
    const rows = [
      [
        "Date",
        "Name",
        "Phone",
        "Email",
        "City",
        "Quantity",
        "Source",
        "UTM Campaign",
        "Status",
        "Form",
        "Notes",
      ],
      ...leads.map((l) => {
        const p = parseNotes(l.notes);
        return [
          new Date(l.created_at).toLocaleString(),
          l.name || "",
          l.phone || "",
          l.email || "",
          p.city || "",
          p.quantity || p.message || p.requirement || "",
          l.source,
          l.utm_campaign || "",
          l.status,
          p.form || "",
          (l.notes || "").replace(/\n/g, " | "),
        ];
      }),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function waLink(phone: string | null) {
    if (!phone) return "#";
    // Take only digits, strip leading 91 if present, then prefix 91 for India
    const digits = phone.replace(/\D/g, "").replace(/^91/, "");
    return `https://wa.me/91${digits.slice(-10)}`;
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Leads</h1>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-blue-600 hover:underline"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="text-sm text-blue-600 hover:underline"
          >
            Settings
          </button>
          <button
            onClick={() => {
              localStorage.clear();
              router.push("/login");
            }}
            className="text-sm text-red-500 hover:underline"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Filter bar */}
        <div className="bg-white border rounded-lg p-3 mb-4 flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All sources</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta_ads">Meta Ads</option>
            <option value="website">Website</option>
            <option value="manual">Manual</option>
          </select>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button onClick={() => setShowForm(!showForm)}>+ Add Lead</Button>
          </div>
        </div>

        <p className="text-gray-500 text-sm mb-3">
          Showing {leads.length} of {total} leads · Click any row for full details
        </p>

        {showForm && (
          <div className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
            <Input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <Button onClick={createLead}>Save Lead</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Campaign</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-400">
                    No leads match these filters
                  </td>
                </tr>
              )}
              {leads.map((lead) => {
                const parsed = parseNotes(lead.notes);
                const quantity = parsed.quantity || parsed.message || parsed.requirement || "";
                const isExpanded = expandedRow === lead.id;
                return (
                  <Fragment key={lead.id}>
                    <tr
                      className={`border-b hover:bg-gray-50 cursor-pointer ${isExpanded ? "bg-blue-50/40" : ""}`}
                      onClick={() => setExpandedRow(isExpanded ? null : lead.id)}
                    >
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString()}
                        <div className="text-[10px] text-gray-400">
                          {new Date(lead.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {lead.name || "-"}
                        {lead.gclid && (
                          <span
                            className="ml-2 inline-block bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded"
                            title="Came from a Google Ads click"
                          >
                            gclid
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {lead.phone ? (
                          <a
                            href={`tel:${lead.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:underline"
                          >
                            {lead.phone}
                          </a>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[180px] truncate" title={lead.email || ""}>
                        {lead.email || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{parsed.city || "-"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {quantity ? (
                          <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded font-medium">
                            {quantity}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 capitalize text-xs whitespace-nowrap">
                        {lead.source.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate" title={lead.utm_campaign || ""}>
                        {lead.utm_campaign || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColors[lead.status] || "bg-gray-100 text-gray-700"}`}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          className="text-xs border rounded px-2 py-1"
                          value={lead.status}
                          onChange={(e) => updateStatus(lead.id, e.target.value)}
                        >
                          <option value="new">New</option>
                          <option value="contacted">Contacted</option>
                          <option value="qualified">Qualified</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                        </select>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr className="bg-blue-50/30 border-b">
                        <td colSpan={10} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <div className="text-gray-500 mb-0.5">Submitted</div>
                              <div className="font-medium">{new Date(lead.created_at).toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 mb-0.5">Form</div>
                              <div className="font-medium">{parsed.form || "-"}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 mb-0.5">UTM Source</div>
                              <div className="font-medium">{lead.utm_source || "-"}</div>
                            </div>
                            <div>
                              <div className="text-gray-500 mb-0.5">UTM Campaign</div>
                              <div className="font-medium">{lead.utm_campaign || "-"}</div>
                            </div>
                            <div className="col-span-2">
                              <div className="text-gray-500 mb-0.5">GCLID</div>
                              <div className="font-mono text-[10px] truncate" title={lead.gclid || ""}>
                                {lead.gclid || "-"}
                              </div>
                            </div>
                            <div className="md:col-span-4">
                              <div className="text-gray-500 mb-0.5">Notes (raw)</div>
                              <div className="font-medium whitespace-pre-line bg-white border rounded p-2">
                                {lead.notes || "-"}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex gap-2 flex-wrap">
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
                              >
                                📞 Call {lead.phone}
                              </a>
                            )}
                            {lead.phone && (
                              <a
                                href={waLink(lead.phone)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
                              >
                                💬 WhatsApp
                              </a>
                            )}
                            {lead.email && (
                              <a
                                href={`mailto:${lead.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded hover:bg-gray-700"
                              >
                                ✉️ Email
                              </a>
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
      </div>
    </div>
  );
}