"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import api from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    setLoading(true);
    try {
      const res = await api.post("/auth/register", {
        business_name: businessName,
        email,
        password,
      });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role);
      toast.success("Account created!");
      router.push("/dashboard");
    } catch {
      toast.error("Registration failed. Email may already exist.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">Start managing your leads</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Business Name</label>
            <Input
              placeholder="Brandbanalo"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleRegister}
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </div>
        <p className="text-sm text-center text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="text-blue-600 hover:underline">
            Login
          </a>
        </p>
      </Card>
    </div>
  );
}