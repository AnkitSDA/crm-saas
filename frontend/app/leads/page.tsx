"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import api from "@/lib/api";

const statusColors: any = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  qualified: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }
    fetchLeads();
  }, []);

  async function fetchLeads() {
    try {
      const res = await api.get("/leads/");
      setLeads(res.data);
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  }

  async function createLead() {
    try {
      await api.post("/leads/", { ...form, source: "manual" });
      toast.success("Lead added!");
      setForm({ name: "", phone: "", email: "", notes: "" });
      setShowForm(false);
      fetchLeads();
    } catch {
      toast.error("Failed to add lead");
    }
  }

  async function updateStatus(id: string, status: string) {
    await api.patch(`/leads/${id}`, { status });
    fetchLeads();
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Leads</h1>
        <div className="flex gap-4 items-center">
          <button onClick={() => router.push("/dashboard")} className="text-sm text-blue-600 hover:underline">Dashboard</button>
          <button onClick={() => { localStorage.clear(); router.push("/login"); }} className="text-sm text-red-500 hover:underline">Logout</button>
        </div>
      </div>

      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <p className="text-gray-500 text-sm">{leads.length} total leads</p>
          <Button onClick={() => setShowForm(!showForm)}>+ Add Lead</Button>
        </div>

        {showForm && (
          <div className="bg-white border rounded-lg p-4 mb-4 grid grid-cols-2 gap-3">
            <Input placeholder="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Input placeholder="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            <Input placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            <Input placeholder="Notes" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <Button onClick={createLead}>Save Lead</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        )}

        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No leads yet</td></tr>
              )}
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{lead.name || "-"}</td>
                  <td className="px-4 py-3">{lead.phone || "-"}</td>
                  <td className="px-4 py-3">{lead.email || "-"}</td>
                  <td className="px-4 py-3 capitalize">{lead.source}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[lead.status]}`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="text-xs border rounded px-2 py-1"
                      value={lead.status}
                      onChange={e => updateStatus(lead.id, e.target.value)}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </select>
                  </td>
                </tr>
                
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}