import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronRight,
  Database,
  Gem,
  Key,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { fetchJson } from "../lib/api";
import { AuthUser } from "../types";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  user: AuthUser;
  onClose: () => void;
  onLogout: () => void;
  onOpenApiConfig: (module?: "video" | "chat" | "image") => void;
}

interface UsageStats {
  image: number;
  video: number;
  chat: number;
  total: number;
}

interface WalletStats {
  balance: number | null;
  unlimited?: boolean;
  enabled?: boolean;
}

const emptyUsage: UsageStats = { image: 0, video: 0, chat: 0, total: 0 };

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  user,
  onClose,
  onLogout,
  onOpenApiConfig,
}) => {
  const [usage, setUsage] = useState<UsageStats>(emptyUsage);
  const [wallet, setWallet] = useState<WalletStats>({ balance: 0 });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setError("");
    setSuccess("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setIsLoading(true);

    fetchJson<{ usage: UsageStats }>("/api/auth/me/usage")
      .then((data) => setUsage({ ...emptyUsage, ...data.usage }))
      .catch((loadError: any) => setError(loadError?.message || "无法读取使用量"))
      .finally(() => setIsLoading(false));

    fetchJson<{ wallet: WalletStats }>("/api/auth/me/wallet")
      .then((data) => setWallet(data.wallet))
      .catch((loadError: any) => setError(loadError?.message || "无法读取星币余额"));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword.length < 8) {
      setError("新密码至少需要 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    setIsSavingPassword(true);
    try {
      await fetchJson("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("密码已更新");
    } catch (saveError: any) {
      setError(saveError?.message || "密码修改失败");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleCopyAuthor = async () => {
    try {
      await navigator.clipboard?.writeText("woaitk207");
      setSuccess("作者账号已复制：woaitk207");
    } catch {
      setSuccess("联系作者：woaitk207");
    }
  };

  const usageItems = [
    { label: "图片", value: usage.image, color: "bg-sky-500" },
    { label: "视频", value: usage.video, color: "bg-blue-600" },
    { label: "对话", value: usage.chat, color: "bg-teal-500" },
  ];

  return (
    <div className="profile-settings-overlay fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <section
        className="profile-settings-modal max-h-[94vh] w-full max-w-3xl overflow-y-auto overflow-x-hidden rounded-[24px] border border-slate-200/90 bg-[#f7f9fc] text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="profile-settings-modal__header border-b border-slate-200/80 bg-white px-5 pb-5 pt-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-600">
                <UserRound className="h-5.5 w-5.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">Account center</div>
                <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-slate-950">个人资料</h2>
                <p className="mt-1 text-xs text-slate-500">管理账号、安全与创作资源</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="关闭">
              <X className="h-5 w-5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenApiConfig("video");
            }}
            className="profile-settings-api-card group flex w-full items-center justify-between rounded-2xl border border-sky-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Key className="h-5 w-5" /></span>
              <span>
                <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">API Key统一接口 <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-600">统一管理</span></span>
                <span className="mt-1 block text-[11px] text-slate-500">图片、视频和对话共用同一套接口配置</span>
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-sky-600 transition group-hover:translate-x-0.5">管理 <ChevronRight className="h-4 w-4" /></span>
          </button>

          <div className="profile-account-original mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#f8fbff] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/80">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">{user.username}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{user.role === "admin" ? "管理员账号" : "客户账号"}</div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />已登录
            </span>
          </div>

          {false && (
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-sky-100 bg-sky-50/70 px-3.5 py-2.5 text-[11px] text-slate-500">
            <Database className="h-4 w-4 shrink-0 text-sky-600" />
            <span>作品图片、视频和提示词仅保存在当前设备浏览器中，不上传本站服务器。</span>
            <Lock className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />
          </div>
          )}
        </header>

        <div className="profile-settings-modal__body space-y-4 p-4 sm:p-6">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenApiConfig("video");
            }}
            className="profile-api-original group flex w-full items-center justify-between rounded-2xl border border-sky-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><Key className="h-5 w-5" /></span>
              <span>
                <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900">API Key统一接口 <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-600">统一管理</span></span>
                <span className="mt-1 block text-[11px] text-slate-500">图片、视频和对话共用同一套接口配置</span>
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs font-bold text-sky-600 transition group-hover:translate-x-0.5">管理 <ChevronRight className="h-4 w-4" /></span>
          </button>

          <div className="profile-settings-account-card profile-account-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-[#f8fbff] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/80">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">{user.username}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{user.role === "admin" ? "管理员账号" : "客户账号"}</div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />已登录
            </span>
          </div>

          <div className="profile-settings-stats-grid grid gap-3 lg:grid-cols-1">
            <div className="profile-settings-resource-card rounded-2xl border border-sky-100 bg-[linear-gradient(135deg,#f5fcff,#eaf6fb)] p-4 shadow-sm">
              {wallet.enabled === false && <div className="mb-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-[11px] text-slate-600">星币功能暂未开放，当前不会扣费或充值。</div>}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold text-sky-700">创作资源</div>
                  <div className="mt-2 text-[10px] font-medium text-slate-500">星币余额</div>
                  <div className="mt-0.5 flex items-baseline gap-1.5"><strong className="text-3xl font-black tracking-tight text-slate-900">{wallet.unlimited ? "不限" : wallet.balance ?? 0}</strong><span className="text-[11px] text-slate-500">星币</span></div>
                </div>
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-sky-200 bg-white/80 text-sky-600 shadow-sm">
                  <div className="absolute inset-1.5 rounded-lg border border-sky-100" />
                  <Gem className="relative h-5 w-5" />
                </div>
              </div>
              <div className="profile-pricing-placeholder mt-4 border-t border-sky-200/70 pt-2.5 text-[10px] text-slate-500">
                <span className="rounded-full bg-white/70 px-2 py-0.5">对话 1 星币</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5">图片 5 星币</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5">视频 20 星币</span>
              </div>
            </div>

            <div className="profile-settings-usage-card hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-extrabold text-slate-900"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><BarChart3 className="h-3.5 w-3.5" /></span>使用量</div>
                {isLoading && <span className="text-[10px] text-slate-400">读取中...</span>}
              </div>
              <div className="mt-3 flex items-end justify-between border-b border-slate-100 pb-2.5"><div><div className="text-[10px] text-slate-500">累计创作</div><div className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">{usage.total}</div></div><span className="text-[10px] font-semibold text-slate-400">次</span></div>
              <div className="mt-2.5 space-y-2">
                {usageItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-[11px]">
                    <span className={`h-1.5 w-1.5 rounded-full ${item.color}`} />
                    <span className="w-7 text-slate-500">{item.label}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${usage.total ? Math.max(8, Math.min(100, (item.value / usage.total) * 100)) : 8}%` }} /></div>
                    <span className="w-5 text-right font-bold text-slate-700">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="profile-settings-password-card rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><KeyRound className="h-4 w-4" /></span>修改密码</div>
              <span className="text-[10px] text-slate-400">至少 8 位字符</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder="当前密码" className="home-glass-input w-full px-3.5 py-3 text-xs" />
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="新密码" className="home-glass-input w-full px-3.5 py-3 text-xs" />
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="确认新密码" className="home-glass-input w-full px-3.5 py-3 text-xs" />
            </div>
            <button type="submit" disabled={isSavingPassword || !currentPassword || !newPassword || !confirmPassword} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-3.5 w-3.5" />{isSavingPassword ? "保存中..." : "保存新密码"}</button>
          </form>

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
          {success && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{success}</p>}

          <div className="profile-settings-footer flex items-center justify-between border-t border-slate-200 pt-4">
            <button type="button" onClick={() => void handleCopyAuthor()} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold text-sky-600 transition hover:bg-sky-50"><MessageCircle className="h-3.5 w-3.5" />联系作者：woaitk207</button>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"><LogOut className="h-3.5 w-3.5" />退出登录</button>
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-900">完成</button>
          </div>
        </div>
      </section>
    </div>
  );
};
