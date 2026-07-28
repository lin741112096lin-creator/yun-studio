import React from "react";
import { Video, Settings, Sparkles, Key, CheckCircle2, AlertCircle, Layers, MessageSquare, Image as ImageIcon, Home } from "lucide-react";
import { MultiApiConfig, ActiveTab } from "../types";
import { YunwangLogo } from "./YunwangLogo";

interface NavbarProps {
  multiConfig: MultiApiConfig;
  onOpenApiConfig: (module?: "video" | "chat" | "image") => void;
  onOpenTemplates: () => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  historyCount?: number;
  processingCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  multiConfig,
  onOpenApiConfig,
  onOpenTemplates,
  activeTab,
  setActiveTab,
  processingCount = 0,
}) => {
  const moduleKey = (activeTab === "tasks" || activeTab === "home") ? "video" : activeTab;
  const activeConfig = multiConfig[moduleKey];
  const hasKey = Boolean(activeConfig.apiKey) || activeConfig.provider.includes("google");

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-2xl bg-[#080d1a]/85 border-b border-white/10 shadow-lg">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand Logo & Title - Navigates to Home Page */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab("home")}>
          <div className="flex items-center justify-center filter drop-shadow-[0_2px_8px_rgba(0,132,255,0.4)]">
            <YunwangLogo className="w-9 h-9" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="font-fustat font-extrabold text-lg tracking-tight text-white sm:text-xl">
                云往AI
              </h1>
            </div>
          </div>
        </div>

        {/* Liquid Glass Segmented Navigation Control */}
        <div className="flex items-center space-x-1 p-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl shadow-inner">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex items-center space-x-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === "home"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/35 scale-105"
                : "text-slate-200 hover:text-white hover:bg-white/10"
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">首页</span>
          </button>

          <button
            onClick={() => setActiveTab("video")}
            className={`flex items-center space-x-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === "video"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/35 scale-105"
                : "text-slate-200 hover:text-white hover:bg-white/10"
            }`}
          >
            <Video className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI 视频</span>
            <span className="sm:hidden">视频</span>
          </button>

          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center space-x-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === "chat"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/35 scale-105"
                : "text-slate-200 hover:text-white hover:bg-white/10"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI 对话</span>
            <span className="sm:hidden">对话</span>
          </button>

          <button
            onClick={() => setActiveTab("image")}
            className={`flex items-center space-x-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === "image"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/35 scale-105"
                : "text-slate-200 hover:text-white hover:bg-white/10"
            }`}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI 图像</span>
            <span className="sm:hidden">图像</span>
          </button>

          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex items-center space-x-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === "tasks"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/35 scale-105"
                : "text-slate-200 hover:text-white hover:bg-white/10"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">任务库</span>
            {processingCount > 0 && (
              <span className="ml-1 flex h-2 w-2 rounded-full bg-cyan-300 animate-ping" />
            )}
          </button>
        </div>

        {/* Right Actions: Liquid Glass Buttons */}
        <div className="flex items-center space-x-2">
          {/* Inspiration Templates Button - Hide in AI Chat (图1) */}
          {activeTab !== "chat" && (
            <button
              onClick={onOpenTemplates}
              className="hidden items-center space-x-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-white/20 transition-all md:flex active:scale-95 backdrop-blur-md cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>灵感词库</span>
            </button>
          )}

          {/* Unified API Configuration Button - ONLY in Tasks (任务库) */}
          {(
            <button
              onClick={() => onOpenApiConfig(moduleKey as "video" | "chat" | "image")}
              className="group relative flex items-center space-x-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-slate-100 shadow-sm transition-all hover:bg-white/20 active:scale-95 backdrop-blur-md cursor-pointer"
              title="管理并配置多功能 API 统一接口"
            >
              <div className="flex items-center space-x-1.5">
                <Key className="h-3.5 w-3.5 text-[#60B1FF] group-hover:rotate-12 transition-transform" />
                <span className="text-slate-300">统一接口</span>
              </div>

              {/* Status Indicator Pill */}
              {hasKey ? (
                <span className="flex items-center space-x-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span className="hidden sm:inline">就绪</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300 border border-rose-500/30">
                  <AlertCircle className="h-3 w-3 text-rose-400" />
                  <span>未设Key</span>
                </span>
              )}

              <Settings className="h-3.5 w-3.5 text-slate-300 group-hover:text-white ml-0.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
