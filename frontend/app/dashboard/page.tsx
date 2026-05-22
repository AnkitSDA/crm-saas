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

interface SourceRow {
  source: string;
  count: number;
}

interface CampaignRow {
  campaign: string;
  total: number;
  won: number;
}

const sourceLabel: Record<string, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  website: "Website",
  manual: "Manual",
  unknown: "Unknown",
};

const sourceBarColor: Record<string, string> = {
  google_ads: "bg-emerald-500",
  meta_ads: "bg-blue-500",
  website: "bg-slate-500",
  manual: "bg-amber-500",
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    total: 0,
    new: 0,
    contacted: 0,
    won: 0,
  });
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    Promise.all([
      api.get("/leads/?limit=500"),
      api.get("/leads/stats/sources?days=30"),
      api.get("/leads/stats/campaigns?days=30"),
    ])
      .then(([leadsRes, sourcesRes, campaignsRes]) => {
        const leads = leadsRes.data.items || [];
        setStats({
          total: leadsRes.data.total ?? leads.length,
          new: leads.filter((l: any) => l.status === "new").length,
          contacted: leads.filter((l: any) => l.status === "contacted").length,
          won: leads.filter((l: any) => l.status === "won").length,
        });
        setSources(sourcesRes.data);
        setCampaigns(campaignsRes.data);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    localStorage.clear();
    router.push("/login");
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );

  const sourcesTotal = sources.reduce((a, r) => a + r.count, 0) || 1;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">CRM Dashboard</h1>
        <div className="flex gap-4">
          <button
            onClick={() => router.push("/leads")}
            className="text-sm text-blue-600 hover:underline"
          >
            Leads
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="text-sm text-blue-600 hover:underline"
          >
            Settings
          </button>
          <button
            onClick={logout}
            className="text-sm text-red-500 hover:underline"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div>
          <p className="text-gray-500 text-sm mb-3">Overview</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-6">
              <p className="text-sm text-gray-500">Total Leads</p>
              <p className="text-3xl font-semibold mt-1">{stats.total}</p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-gray-500">New</p>
              <p className="text-3xl font-semibold mt-1 text-blue-600">
                {stats.new}
              </p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-gray-500">Contacted</p>
              <p className="text-3xl font-semibold mt-1 text-yellow-600">
                {stats.contacted}
              </p>
            </Card>
            <Card className="p-6">
              <p className="text-sm text-gray-500">Won</p>
              <p className="text-3xl font-semibold mt-1 text-green-600">
                {stats.won}
              </p>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Source breakdown */}
          <Card className="p-6">
            <div className="flex justify-between items-baseline mb-4">
              <h2 className="text-base font-semibold">Lead Sources</h2>
              <span className="text-xs text-gray-400">Last 30 days</span>
            </div>
            {sources.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">
                No leads yet
              </p>
            ) : (
              <div className="space-y-3">
                {sources.map((row) => {
                  const pct = Math.round((row.count / sourcesTotal) * 100);
                  return (
                    <div key={row.source}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>
                          {sourceLabel[row.source] ||
                            row.source.replace("_", " ")}
                        </span>
                        <span className="text-gray-500">
                          {row.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${sourceBarColor[row.source] || "bg-gray-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Top campaigns */}
          <Card className="p-6">
            <div className="flex justify-between items-baseline mb-4">
              <h2 className="text-base font-semibold">Top Ads Campaigns</h2>
              <span className="text-xs text-gray-400">Last 30 days</span>
            </div>
            {campaigns.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">
                No campaign data yet. Add{" "}
                <code className="text-xs">?utm_campaign=...</code> to your ad
                URLs.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs">
                    <th className="pb-2 font-medium">Campaign</th>
                    <th className="pb-2 font-medium text-right">Leads</th>
                    <th className="pb-2 font-medium text-right">Won</th>
                    <th className="pb-2 font-medium text-right">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 8).map((c) => {
                    const rate = c.total
                      ? Math.round((c.won / c.total) * 100)
                      : 0;
                    return (
                      <tr key={c.campaign} className="border-t">
                        <td
                          className="py-2 truncate max-w-[180px]"
                          title={c.campaign}
                        >
                          {c.campaign}
                        </td>
                        <td className="py-2 text-right">{c.total}</td>
                        <td className="py-2 text-right text-green-600">
                          {c.won}
                        </td>
                        <td className="py-2 text-right text-gray-500">
                          {rate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
