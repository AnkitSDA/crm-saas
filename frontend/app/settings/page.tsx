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

  const webhookUrl =
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") +
    "/webhooks/form";

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

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(label + " copied");
  }

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );

  if (!tenant) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Settings</h1>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-blue-600 hover:underline"
          >
            Dashboard
          </button>
          <button
            onClick={() => router.push("/leads")}
            className="text-sm text-blue-600 hover:underline"
          >
            Leads
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
              Use this key on your WordPress site so form submissions land in
              your CRM. Treat it like a password.
            </p>
          </div>

          {tenant.api_key && (
            <div className="flex gap-2">
              <Input
                readOnly
                value={
                  revealKey
                    ? tenant.api_key
                    : "•".repeat(Math.min(tenant.api_key.length, 32))
                }
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={() => setRevealKey((v) => !v)}>
                {revealKey ? "Hide" : "Reveal"}
              </Button>
              <Button
                variant="outline"
                onClick={() => copy(tenant.api_key!, "API key")}
              >
                Copy
              </Button>
            </div>
          )}

          <div className="pt-2 border-t">
            <p className="text-sm text-gray-500 mb-2">Webhook URL</p>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="text-xs" />
              <Button
                variant="outline"
                onClick={() => copy(webhookUrl, "Webhook URL")}
              >
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
              Use this only if your key has leaked. The old key stops working
              immediately.
            </p>
          </div>
        </Card>

        {/* WordPress instructions */}
        <Card className="p-6 space-y-3">
          <h2 className="text-base font-semibold">Connect WordPress</h2>
          <ol className="text-sm text-gray-700 space-y-2 list-decimal pl-5">
            <li>
              Install <span className="font-medium">Contact Form 7</span> and{" "}
              <span className="font-medium">Code Snippets</span> plugins on
              WordPress.
            </li>
            <li>
              In Code Snippets, add the PHP snippet provided by your CRM
              administrator (<code>crm-cf7-webhook.php</code>).
            </li>
            <li>
              Replace the placeholder values in the snippet with your{" "}
              <span className="font-medium">Webhook URL</span> and{" "}
              <span className="font-medium">API key</span> from above.
            </li>
            <li>
              Add the hidden UTM fields to your CF7 form (see{" "}
              <code>crm-cf7-webhook.php</code> comments for the exact tags).
            </li>
            <li>
              Enqueue <code>crm-utm-capture.js</code> on your landing page so
              Google Ads click data flows through.
            </li>
            <li>Submit a test form &mdash; it should appear in Leads within seconds.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
