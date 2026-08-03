import React, { useEffect, useState } from "react";
import { Activity, Coins, Copy, KeyRound, RefreshCw, Search, X } from "lucide-react";
import { fetchJson } from "../lib/api";
import { AuthUser } from "../types";

interface AdminAccountManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GeneratedCredentials {
  username: string;
  password: string;
}

interface AdminUsageLog {
  id: string;
  username: string;
  kind: "image" | "video" | "chat";
  provider?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  stars: number;
  status: string;
  createdAt: number;
}

export const AdminAccountManager: React.FC<AdminAccountManagerProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [requestedUsername, setRequestedUsername] = useState("");
  const [credentials, setCredentials] = useState<GeneratedCredentials | null>(null);
  const [resetUsername, setResetUsername] = useState("");
  const [starUsername, setStarUsername] = useState("");
  const [starAmount, setStarAmount] = useState("");
  const [starAccount, setStarAccount] = useState<AuthUser | null>(null);
  const [starBalance, setStarBalance] = useState<number | null>(null);
  const [starsEnabled, setStarsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStarAccount, setIsCheckingStarAccount] = useState(false);
  const [isChargingStars, setIsChargingStars] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"accounts" | "logs">("accounts");
  const [usageLogs, setUsageLogs] = useState<AdminUsageLog[]>([]);
  const [logUsername, setLogUsername] = useState("");
  const [logKind, setLogKind] = useState<"" | "image" | "video" | "chat">("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await fetchJson<{ users: AuthUser[]; starsEnabled?: boolean }>("/api/auth/admin/users");
      setUsers(data.users);
      setStarsEnabled(data.starsEnabled === true);
    } catch (loadError: any) {
      setError(loadError?.message || "无法读取账号列表");
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsageLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const params = new URLSearchParams({ limit: "300" });
      if (logUsername.trim()) params.set("username", logUsername.trim());
      if (logKind) params.set("kind", logKind);
      const data = await fetchJson<{ logs: AdminUsageLog[] }>(`/api/auth/admin/usage-logs?${params.toString()}`);
      setUsageLogs(data.logs);
    } catch (loadError: any) {
      setError(loadError?.message || "无法读取使用日志");
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setCredentials(null);
    setStarAccount(null);
    setStarBalance(null);
    setActiveView("accounts");
    void loadUsers();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeView === "logs") void loadUsageLogs();
  }, [isOpen, activeView]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError("");
    setCredentials(null);
    try {
      const data = await fetchJson<{ user: AuthUser; credentials: GeneratedCredentials }>("/api/auth/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: requestedUsername.trim() || undefined }),
      });
      setCredentials(data.credentials);
      setRequestedUsername("");
      await loadUsers();
    } catch (generateError: any) {
      setError(generateError?.message || "账号生成失败");
    } finally {
      setIsLoading(false);
    }
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    await navigator.clipboard?.writeText(`账号：${credentials.username}\n密码：${credentials.password}`);
  };

  const handleResetPassword = async () => {
    const username = resetUsername.trim();
    if (!username) {
      setError("请输入客户账号");
      return;
    }
    const target = users.find((user) => user.username.toLowerCase() === username.toLowerCase());
    if (!target) {
      setError("未找到这个客户账号");
      return;
    }
    if (!window.confirm(`确定要重置账号 ${target.username} 的密码吗？`)) return;
    setResettingUserId(target.id);
    setError("");
    setCredentials(null);
    try {
      const data = await fetchJson<{ user: AuthUser; credentials: GeneratedCredentials }>(`/api/auth/admin/users/${encodeURIComponent(target.id)}/reset-password`, { method: "POST" });
      setCredentials(data.credentials);
      setResetUsername("");
    } catch (resetError: any) {
      setError(resetError?.message || "密码重置失败");
    } finally {
      setResettingUserId(null);
    }
  };

  const handleCheckStarAccount = async () => {
    if (!starsEnabled) {
      setError("星币功能暂未开放，当前不支持充值或扣费");
      return;
    }
    const username = starUsername.trim();
    setError("");
    setStarAccount(null);
    setStarBalance(null);
    if (!username) {
      setError("请输入客户账号");
      return;
    }
    setIsCheckingStarAccount(true);
    try {
      const data = await fetchJson<{ user: AuthUser; wallet: { balance: number } }>("/api/auth/admin/users/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      setStarAccount(data.user);
      setStarBalance(data.wallet.balance);
    } catch (lookupError: any) {
      setError(lookupError?.message || "账号不存在");
    } finally {
      setIsCheckingStarAccount(false);
    }
  };

  const handleRechargeStars = async () => {
    if (!starsEnabled) {
      setError("星币功能暂未开放，当前不支持充值或扣费");
      return;
    }
    const amount = Number(starAmount || 0);
    if (!starAccount) {
      setError("请先检测客户账号");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("请输入要充值的星币数量");
      return;
    }
    setIsChargingStars(true);
    setError("");
    try {
      const data = await fetchJson<{ wallet: { balance: number } }>("/api/auth/admin/stars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: starAccount.username, amount, reason: "admin recharge" }),
      });
      setStarBalance(data.wallet.balance);
      setStarAmount("");
    } catch (rechargeError: any) {
      setError(rechargeError?.message || "星币充值失败");
    } finally {
      setIsChargingStars(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[24px] border border-white/90 bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#0084FF]"><KeyRound className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">账号管理</span></div>
            <h2 className="mt-2 text-xl font-extrabold text-slate-900">客户账号</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">服务器只保存账号信息和星币账务，作品仍保存在客户当前设备。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="关闭"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setActiveView("accounts")}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${activeView === "accounts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            账号管理
          </button>
          <button
            type="button"
            onClick={() => setActiveView("logs")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${activeView === "logs" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            <Activity className="h-3.5 w-3.5" />使用日志
          </button>
        </div>

        <div className={activeView === "accounts" ? "" : "hidden"}>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-xs font-semibold text-slate-700">新建客户账号（可选账号名）</label>
          <div className="mt-2 flex gap-2">
            <input value={requestedUsername} onChange={(event) => setRequestedUsername(event.target.value)} placeholder="留空自动生成" className="home-glass-input min-w-0 flex-1 px-3 py-2.5 text-xs" />
            <button type="button" onClick={handleGenerate} disabled={isLoading} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0084FF] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"><RefreshCw className="h-3.5 w-3.5" />生成</button>
          </div>
        </div>

        {credentials && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-bold text-emerald-800">账号或密码已生成，请立即保存</div>
            <div className="mt-3 space-y-2 font-mono text-sm text-slate-800"><div>账号：{credentials.username}</div><div>密码：{credentials.password}</div></div>
            <button type="button" onClick={copyCredentials} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800"><Copy className="h-3.5 w-3.5" />复制账号密码</button>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-bold text-amber-900">客户忘记密码？</div>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">填写客户账号后点击重置，密码固定为 12345678。</p>
          <div className="mt-3 flex gap-2">
            <input value={resetUsername} onChange={(event) => setResetUsername(event.target.value)} placeholder="填写客户账号" className="home-glass-input min-w-0 flex-1 px-3 py-2.5 text-xs" />
            <button type="button" onClick={handleResetPassword} disabled={resettingUserId !== null || !resetUsername.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${resettingUserId ? "animate-spin" : ""}`} />重置密码</button>
          </div>
        </div>

        {!starsEnabled && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">星币功能暂未开放，当前不会扣费或充值。</div>}
        <div className={`${starsEnabled ? "" : "hidden"} mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4`}>
          <div className="flex items-center gap-2 text-xs font-bold text-sky-900"><Coins className="h-4 w-4 text-sky-600" />星币充值</div>
          <p className="mt-1 text-[11px] text-sky-800">填写客户账号，检测存在后输入充值数量。</p>
          <div className="mt-3 flex gap-2">
            <input value={starUsername} onChange={(event) => { setStarUsername(event.target.value); setStarAccount(null); setStarBalance(null); }} placeholder="填写客户账号" className="home-glass-input min-w-0 flex-1 px-3 py-2.5 text-xs" />
            <button type="button" onClick={handleCheckStarAccount} disabled={isCheckingStarAccount || !starUsername.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"><Search className="h-3.5 w-3.5" />{isCheckingStarAccount ? "检测中" : "检测账号"}</button>
          </div>
          {starAccount && (
            <div className="mt-3 rounded-xl border border-sky-200 bg-white/80 p-3">
              <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-700">账号存在：{starAccount.username}</span><span className="font-bold text-sky-700">当前 {starBalance ?? 0} 星币</span></div>
              <div className="mt-2 flex gap-2"><input value={starAmount} onChange={(event) => setStarAmount(event.target.value)} inputMode="numeric" placeholder="充值数量" className="home-glass-input min-w-0 flex-1 px-3 py-2 text-xs" /><button type="button" onClick={handleRechargeStars} disabled={isChargingStars || !starAmount.trim()} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"><Coins className="h-3.5 w-3.5" />{isChargingStars ? "充值中" : "充值"}</button></div>
            </div>
          )}
        </div>

        {error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="mt-6 flex items-center justify-between border-b border-slate-100 pb-2"><h3 className="text-xs font-bold text-slate-800">账号统计</h3><div className="flex items-center gap-2 text-[11px]"><span className="text-amber-600">{users.filter((user) => user.role === "admin").length} 个管理员</span><span className="text-slate-400">·</span><span className="text-slate-500">{users.filter((user) => user.role === "user").length} 个客户</span></div></div>
        <div className="mt-2 space-y-2">{users.filter((user) => user.role === "admin").map((user) => <div key={user.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 text-xs"><span className="font-mono text-slate-700">{user.username}</span><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700">管理员</span></div>)}</div>
        </div>

        <div className={activeView === "logs" ? "mt-6" : "hidden"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">使用日志</h3>
              <p className="mt-1 text-[11px] text-slate-500">仅记录账号、模型和用量，不保存作品内容或 API Key。</p>
            </div>
            <button type="button" onClick={() => void loadUsageLogs()} disabled={isLoadingLogs} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLogs ? "animate-spin" : ""}`} />刷新
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_150px_auto]">
            <input value={logUsername} onChange={(event) => setLogUsername(event.target.value)} placeholder="按客户账号筛选" className="home-glass-input px-3 py-2.5 text-xs" />
            <select value={logKind} onChange={(event) => setLogKind(event.target.value as typeof logKind)} className="home-glass-input px-3 py-2.5 text-xs">
              <option value="">全部功能</option>
              <option value="video">AI 视频</option>
              <option value="image">AI 图像</option>
              <option value="chat">AI 对话</option>
            </select>
            <button type="button" onClick={() => void loadUsageLogs()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800">查询</button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3">时间</th>
                  <th className="px-3 py-3">账号</th>
                  <th className="px-3 py-3">功能</th>
                  <th className="px-3 py-3">模型</th>
                  <th className="px-3 py-3">参数</th>
                  <th className="px-3 py-3">消耗</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usageLogs.map((log) => (
                  <tr key={log.id} className="text-slate-700">
                    <td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-500">{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="px-3 py-3 font-semibold">{log.username}</td>
                    <td className="px-3 py-3">{log.kind === "video" ? "AI 视频" : log.kind === "image" ? "AI 图像" : "AI 对话"}</td>
                    <td className="max-w-[180px] truncate px-3 py-3 font-mono text-[11px]">{log.model || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-500">{[log.aspectRatio, log.resolution, log.duration ? `${log.duration}s` : ""].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="px-3 py-3 font-bold text-amber-600">{log.stars} 星币</td>
                  </tr>
                ))}
                {!isLoadingLogs && usageLogs.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-xs text-slate-400">暂无使用记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
              退出日志
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
