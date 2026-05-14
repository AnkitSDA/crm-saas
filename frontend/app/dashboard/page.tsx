"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import api from "@/lib/api";

interface Stats {
  total: number;
  new: number;
  contacted: number;
  won: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ total: 0, new: 0, contacted: 0, won: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.push("/login"); return; }

    api.get("/leads/").then((res) => {
      const leads = res.data;
      setStats({
        total:     leads.length,
        new:       leads.filter((l: any) => l.status === "new").length,
        contacted: leads.filter((l: any) => l.status === "contacted").length,
        won:       leads.filter((l: any) => l.status === "won").length,
      });
    }).catch(() => {
      router.push("/login");
    }).finally(() => setLoading(false));
  }, []);

  function logout() {
    localStorage.clear();
    router.push("/login");
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">CRM Dashboard</h1>
        <div className="flex gap-4">
          <button onClick={() => router.push("/leads")} className="text-sm text-blue-600 hover:underline">
            Leads
          </button>
          <button onClick={logout} className="text-sm text-red-500 hover:underline">
            Logout
          </button>
        </div>
      </div>

      <div className="p-6">
        <p className="text-gray-500 text-sm mb-6">Overview</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <p className="text-sm text-gray-500">Total Leads</p>
            <p className="text-3xl font-semibold mt-1">{stats.total}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-gray-500">New</p>
            <p className="text-3xl font-semibold mt-1 text-blue-600">{stats.new}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-gray-500">Contacted</p>
            <p className="text-3xl font-semibold mt-1 text-yellow-600">{stats.contacted}</p>
          </Card>
          <Card className="p-6">
            <p className="text-sm text-gray-500">Won</p>
            <p className="text-3xl font-semibold mt-1 text-green-600">{stats.won}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}