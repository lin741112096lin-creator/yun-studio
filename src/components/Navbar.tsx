import React, { useEffect, useRef, useState } from "react";
import { Video, Layers, Image as ImageIcon, Home, Workflow, UserPlus, UserRound } from "lucide-react";
import { AuthUser, ActiveTab } from "../types";
import { YunwangLogo } from "./YunwangLogo";

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  historyCount?: number;
  processingCount?: number;
  currentUser: AuthUser;
  onOpenAdmin: () => void;
  onOpenProfile: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  processingCount = 0,
  currentUser,
  onOpenAdmin,
  onOpenProfile,
}) => {
  const scrollStateRef = useRef(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const syncScrollState = () => {
      const nextState = window.scrollY > 20;
      if (scrollStateRef.current === nextState) return;
      scrollStateRef.current = nextState;
      setIsScrolled(nextState);
    };

    syncScrollState();
    window.addEventListener("scroll", syncScrollState, { passive: true });
    return () => window.removeEventListener("scroll", syncScrollState);
  }, []);

  return (
    <header className={`workspace-navbar ${activeTab === "tasks" ? "workspace-navbar--tasks" : ""} ${isScrolled ? "workspace-navbar--scrolled" : ""} sticky top-0 z-40 w-full backdrop-blur-2xl bg-[#080d1a]/85 border-b border-white/10 shadow-lg`}>
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
            onClick={() => setActiveTab("workflow")}
            className={`flex items-center space-x-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === "workflow"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/35 scale-105"
                : "text-slate-200 hover:text-white hover:bg-white/10"
            }`}
          >
            <Workflow className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">商品视频</span>
            <span className="sm:hidden">商品</span>
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
            className={`workspace-nav-tasks flex items-center space-x-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
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
          {currentUser.role === "admin" && (
            <button type="button" onClick={onOpenAdmin} className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-white/20" title="生成客户账号">
              <UserPlus className="h-3.5 w-3.5 text-[#60B1FF]" />
              <span className="hidden sm:inline">账号</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenProfile}
            className="profile-nav-button"
            title="打开个人资料"
            aria-label="打开个人资料"
          >
            <span className="profile-nav-avatar">
              {currentUser.username.slice(0, 1).toUpperCase() || <UserRound className="h-4 w-4" />}
            </span>
            <span className="profile-nav-name">{currentUser.username}</span>
            <UserRound className="profile-nav-icon" />
          </button>
        </div>
      </div>
    </header>
  );
};
