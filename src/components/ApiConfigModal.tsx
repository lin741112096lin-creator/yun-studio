import React, { useState, useEffect } from "react";
import { X, Key, Globe, Cpu, Check, Eye, EyeOff, Sparkles, RefreshCw, AlertCircle, ShieldCheck, Video, MessageSquare, Image as ImageIcon } from "lucide-react";
import { MultiApiConfig, ApiEndpointConfig, PresetProvider } from "../types";
import { DEFAULT_PRESET_PROVIDERS, CHAT_PRESET_PROVIDERS, IMAGE_PRESET_PROVIDERS } from "../data/presets";

interface ApiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  multiConfig: MultiApiConfig;
  onSaveMultiConfig: (newConfig: MultiApiConfig) => void;
  initialModule?: "video" | "chat" | "image";
}

export const ApiConfigModal: React.FC<ApiConfigModalProps> = ({
  isOpen,
  onClose,
  multiConfig,
  onSaveMultiConfig,
  initialModule = "video",
}) => {
  const [activeTab, setActiveTab] = useState<"video" | "chat" | "image">(initialModule);
  const [currentMulti, setCurrentMulti] = useState<MultiApiConfig>({ ...multiConfig });
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    if (isOpen) {
      setCurrentMulti({ ...multiConfig });
      setActiveTab(initialModule);
      setTestStatus("idle");
    }
  }, [isOpen, multiConfig, initialModule]);

  if (!isOpen) return null;

  const currentTabConfig: ApiEndpointConfig = currentMulti[activeTab];

  const updateCurrentTabConfig = (updates: Partial<ApiEndpointConfig>) => {
    setCurrentMulti((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        ...updates,
      },
    }));
    setTestStatus("idle");
  };

  const getProvidersForActiveTab = (): PresetProvider[] => {
    if (activeTab === "video") return DEFAULT_PRESET_PROVIDERS;
    if (activeTab === "chat") return CHAT_PRESET_PROVIDERS;
    return IMAGE_PRESET_PROVIDERS;
  };

  const providers = getProvidersForActiveTab();
  const selectedProviderObj = providers.find((p) => p.id === currentTabConfig.provider) || providers[0];

  const handleProviderSelect = (provider: PresetProvider) => {
    updateCurrentTabConfig({
      provider: provider.id,
      apiUrl: provider.defaultUrl,
      selectedModel: provider.models[0] || currentTabConfig.selectedModel,
    });
  };

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestMessage("正在发起服务端健康与 API 接口连通性校验...");
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        setTestStatus("success");
        setTestMessage(`[${activeTab.toUpperCase()}] 接口服务端响应正常！可流畅发起创作请求。`);
      } else {
        setTestStatus("error");
        setTestMessage("服务端响应未通过，请核对接口配置。");
      }
    } catch (err: any) {
      setTestStatus("error");
      setTestMessage(`连通失败: ${err.message || "网络断开"}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveMultiConfig(currentMulti);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-indigo-950/50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">多功能 API 接口地址与 Key 配置中心</h3>
              <p className="text-xs text-slate-400">分别独立配置视频、对话与图像功能的调用接口及凭证</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feature Sub-Tabs Header */}
        <div className="mt-4 flex items-center space-x-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => { setActiveTab("video"); setTestStatus("idle"); }}
            className={`flex flex-1 items-center justify-center space-x-1.5 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "video"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            <span>🎬 视频接口</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("chat"); setTestStatus("idle"); }}
            className={`flex flex-1 items-center justify-center space-x-1.5 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "chat"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>💬 对话接口</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("image"); setTestStatus("idle"); }}
            className={`flex flex-1 items-center justify-center space-x-1.5 rounded-lg py-2 text-xs font-bold transition-all ${
              activeTab === "image"
                ? "bg-pink-600 text-white shadow-md shadow-pink-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>🎨 图像接口</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Provider Preset Picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              1. 选择 {activeTab === "video" ? "AI 视频" : activeTab === "chat" ? "AI 对话" : "AI 绘图"}服务商预设
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-48 overflow-y-auto custom-scrollbar p-0.5">
              {providers.map((provider) => {
                const isSelected = currentTabConfig.provider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleProviderSelect(provider)}
                    className={`relative flex flex-col items-start rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? "border-indigo-500 bg-indigo-950/40 text-white shadow-md shadow-indigo-500/10"
                        : "border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2 right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500 text-white">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-200">{provider.name}</span>
                    <span className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
                      {provider.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* API Endpoint URL Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
                <Globe className="h-3.5 w-3.5 text-indigo-400" />
                <span>2. [{activeTab.toUpperCase()}] API 接口基准地址 (Endpoint URL)</span>
              </label>
              {selectedProviderObj.defaultUrl && (
                <button
                  type="button"
                  onClick={() => updateCurrentTabConfig({ apiUrl: selectedProviderObj.defaultUrl })}
                  className="text-[11px] text-indigo-400 hover:underline"
                >
                  重置默认地址
                </button>
              )}
            </div>
            <input
              type="text"
              value={currentTabConfig.apiUrl}
              onChange={(e) => updateCurrentTabConfig({ apiUrl: e.target.value })}
              placeholder="https://generativelanguage.googleapis.com 或自定义接口代理地址"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            />
          </div>

          {/* API Key Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
                <Key className="h-3.5 w-3.5 text-amber-400" />
                <span>3. [{activeTab.toUpperCase()}] API Key 秘钥凭证</span>
              </label>
              <span className="text-[11px] text-slate-400">凭证安全储存在本地</span>
            </div>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={currentTabConfig.apiKey}
                onChange={(e) => updateCurrentTabConfig({ apiKey: e.target.value })}
                placeholder={
                  currentTabConfig.provider.includes("google")
                    ? "可选（若留空将自动调用系统内置 Key）"
                    : "请输入 API Key (如 sk-...)"
                }
                className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-3.5 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                {currentTabConfig.apiKey && (
                  <button
                    type="button"
                    onClick={() => updateCurrentTabConfig({ apiKey: "" })}
                    className="text-[10px] text-slate-400 hover:text-rose-400 px-1"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="flex items-center space-x-1.5 text-xs font-semibold text-slate-200 mb-1">
              <Cpu className="h-3.5 w-3.5 text-cyan-400" />
              <span>4. 选择模型 (Model)</span>
            </label>
            <select
              value={currentTabConfig.selectedModel}
              onChange={(e) => updateCurrentTabConfig({ selectedModel: e.target.value })}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
            >
              {selectedProviderObj.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Test Status Feedback */}
          {testStatus !== "idle" && (
            <div
              className={`flex items-start space-x-2 rounded-xl border p-2.5 text-xs ${
                testStatus === "testing"
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                  : testStatus === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300"
              }`}
            >
              {testStatus === "testing" ? (
                <RefreshCw className="h-4 w-4 animate-spin mt-0.5" />
              ) : testStatus === "success" ? (
                <ShieldCheck className="h-4 w-4 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5" />
              )}
              <span>{testMessage}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-3 mt-4">
            <button
              type="button"
              onClick={handleTestConnection}
              className="flex items-center space-x-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>测试 [{activeTab.toUpperCase()}] 连通性</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 active:scale-95 transition-all"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>保存全套接口配置</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
