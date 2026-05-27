"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import api from "@/lib/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  api_key?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealKey, setRevealKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);

  const webhookUrl =
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/webhooks/form";

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    api
      .get("/tenant/me")
      .then((r) => setTenant(r.data))
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, []);

  async function regenerate() {
    if (
      !confirm(
        "Regenerate API key? Your WordPress integration will stop working until you update the key there."
      )
    )
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
    if (
      !confirm(
        "Scan all leads for duplicates (same phone number) and delete older copies?\n\nThis keeps the newest version of each lead and cannot be undone."
      )
    )
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

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">Loading...</div>
    );

  if (!tenant) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Settings</h1>
        <div className="flex gap-4 items-center">
          <button onClick={() => router.push("/dashboard")} className="text-sm text-blue-600 hover:underline">Dashboard</button>
          <button onClick={() => router.push("/leads")} className="text-sm text-blue-600 hover:underline">Leads</button>
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

      <div className="p-6 max-w-3xl space-y-6">
        {/* Business info */}
        <Card className="p-6 space-y-3">
          <h2 className="text-base font-semibold">Business</h2>
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span>{tenant.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Plan</span>
              <span className="capitalize">{tenant.plan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tenant ID</span>
              <span className="font-mono text-xs">{tenant.id}</span>
            </div>
          </div>
        </Card>

        {/* API key */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Website Integration Key</h2>
            <p className="text-sm text-gray-500 mt-1">
              Use this key on your WordPress site so form submissions land in your CRM. Treat it like a password.
            </p>
          </div>

          {tenant.api_key && (
            <div className="flex gap-2">
              <Input
                readOnly
                value={revealKey ? tenant.api_key : "•".repeat(Math.min(tenant.api_key.length, 32))}
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={() => setRevealKey((v) => !v)}>
                {revealKey ? "Hide" : "Reveal"}
              </Button>
              <Button variant="outline" onClick={() => copy(tenant.api_key!, "API key")}>
                Copy
              </Button>
            </div>
          )}

          <div className="pt-2 border-t">
            <p className="text-sm text-gray-500 mb-2">Webhook URL</p>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="text-xs" />
              <Button variant="outline" onClick={() => copy(webhookUrl, "Webhook URL")}>
                Copy
              </Button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              onClick={regenerate}
              disabled={regenerating}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {regenerating ? "Regenerating..." : "Regenerate Key"}
            </Button>
            <p className="text-xs text-gray-400 mt-2">
              Use this only if your key has leaked. The old key stops working immediately.
            </p>
          </div>
        </Card>

        {/* Cleanup Duplicates */}
        <Card className="p-6 space-y-3">
          <h2 className="text-base font-semibold">Lead Cleanup</h2>
          <p className="text-sm text-gray-500">
            Find leads with the same phone number and keep only the newest one.
            Useful when users accidentally submit a form twice.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
            <strong>How it works:</strong> Phones are matched after normalizing
            (so <code>9711110147</code>, <code>09711110147</code>, and{" "}
            <code>+91 9711 110147</code> are treated as the same number). The
            newest submission is kept, older ones are deleted permanently.
          </div>
          <div className="pt-2">
            <Button
              onClick={cleanupDuplicates}
              disabled={cleaningDuplicates}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {cleaningDuplicates ? "Scanning..." : "🧹 Cleanup Duplicate Leads"}
            </Button>
            <p className="text-xs text-gray-400 mt-2">
              New form submissions are auto-deduplicated within 1 hour. This button cleans up older duplicates.
            </p>
          </div>
        </Card>

        {/* WordPress instructions */}
        <Card className="p-6 space-y-3">
          <h2 className="text-base font-semibold">Connect WordPress</h2>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5">
            <li>
              Install <span className="font-medium">WPCode</span> (or Code Snippets) plugin on WordPress.
            </li>
            <li>
              Add the PHP snippet provided by your CRM administrator and replace the placeholder Webhook URL and API key with values from above.
            </li>
            <li>
              Add hidden UTM fields to your Elementor or CF7 form (utm_source, utm_medium, utm_campaign, gclid, fbclid, etc.).
            </li>
            <li>
              Enqueue the UTM-capture JS so Google Ads / Meta Ads click data flows through.
            </li>
            <li>
              Submit a test form &mdash; it should appear in Leads within seconds.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
