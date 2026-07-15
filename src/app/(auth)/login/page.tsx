"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Sparkles, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(form.email, form.password);

    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-id="AUTH-LOGIN">
      {/* Left hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-500 via-blue-600 to-emerald-600">
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-emerald-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">DentaCore</span>
            <span className="text-sm font-medium text-white/70">Dental Clinic</span>
          </div>
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Dental Workspace</span>
            </div>
            <h1 className="text-4xl font-bold leading-tight mb-4">Your dental clinic,<br />beautifully managed.</h1>
            <p className="text-lg text-white/80 leading-relaxed">A focused workspace for modern dental practices. Less clutter, more care.</p>
          </div>
          <div className="flex gap-8">
            {[{ value: "2min", label: "Avg check-in time" }, { value: "98%", label: "Staff satisfaction" }, { value: "1-click", label: "Key actions" }].map((s) => (
              <div key={s.label}><p className="text-2xl font-bold">{s.value}</p><p className="text-sm text-white/60">{s.label}</p></div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center px-6 lg:px-16 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10">
            <span className="text-2xl font-bold tracking-tight text-blue-700">DentaCore</span>
          </div>

          <h2 className="text-2xl font-bold text-stone-900 mb-1">Welcome</h2>
          <p className="text-stone-500 mb-8">Sign in to your clinic workspace</p>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}


          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">Email</label>
              <input type="email" placeholder="you@clinic.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-stone-700">Password</label>
              </div>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-4 py-3 pr-11 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all" required minLength={4} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-blue-200 active:scale-[0.98]">
              {loading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in...</span> : "Sign in"}
            </button>
          </form>
          <p className="text-center text-sm text-stone-500 mt-8">
            New to DentaCore? <Link href="/signup" className="text-sky-600 font-medium hover:text-sky-700">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
