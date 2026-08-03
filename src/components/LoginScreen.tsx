import React, { useState } from "react";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { fetchJson } from "../lib/api";
import { AuthUser } from "../types";

interface LoginScreenProps {
  onAuthenticated: (session: { token: string; user: AuthUser }) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const session = await fetchJson<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      onAuthenticated(session);
    } catch (loginError: any) {
      setError(loginError?.message || "登录失败，请检查账号和密码");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#eaf4ff] px-4 py-10 text-slate-900">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#60B1FF]/25 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#0084FF]/20 blur-[100px]" />
      <section className="relative z-10 w-full max-w-md rounded-[28px] border border-white/90 bg-white/85 p-7 shadow-2xl shadow-blue-500/15 backdrop-blur-2xl sm:p-9">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0084FF]/10 text-[#0084FF]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">云往 AI 创作空间</h1>
          <p className="mt-2 text-sm text-slate-500">登录后进入你的本地创作工作区</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">账号</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="请输入账号"
              className="home-glass-input w-full px-4 py-3 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">密码</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                className="home-glass-input w-full px-10 py-3 text-sm"
              />
            </div>
          </label>
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0084FF] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#0084FF]/25 transition hover:bg-[#0070e0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {isSubmitting ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">作品图片和视频保存在当前设备，不上传到本站服务器。</p>
      </section>
    </main>
  );
};
