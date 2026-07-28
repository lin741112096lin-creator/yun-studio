import React, { useState } from "react";
import { Star, ArrowRight, Check, Sparkles, X, Video, MessageSquare, Image as ImageIcon, Layers } from "lucide-react";
import { ActiveTab } from "../types";
import { YunwangLogo } from "./YunwangLogo";

interface LiquidGlassHeroProps {
  onOpenApp?: () => void;
  activeTab?: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
}

export const LiquidGlassHero: React.FC<LiquidGlassHeroProps> = ({ onOpenApp, activeTab = "home", onNavigate }) => {
  const [isSignUpOpen, setIsSignUpOpen] = useState<boolean>(false);
  const [emailInput, setEmailInput] = useState<string>("");
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<boolean>(false);

  // Modal handler for Sign Up / Get Started
  const handleSignUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setIsSignUpOpen(false);
      setEmailInput("");
      onNavigate("video");
    }, 1200);
  };

  const handleStartWorkspace = (tab: ActiveTab = "video") => {
    onNavigate(tab);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-inter relative overflow-hidden antialiased selection:bg-[#0084FF]/20 selection:text-[#0084FF]">
      {/* 1. Subtle, Layered Gradient Glow in Top-Left (Blurred Ellipses #60B1FF and #319AFF) */}
      <div className="absolute top-0 left-0 w-full h-[900px] pointer-events-none overflow-hidden z-0">
        {/* Light Blue #60B1FF Ellipse */}
        <div 
          className="absolute -top-[140px] -left-[120px] w-[650px] h-[650px] rounded-full blur-[140px] opacity-70 pointer-events-none"
          style={{ backgroundColor: "#60B1FF" }}
        />
        {/* Deeper Blue #319AFF Ellipse */}
        <div 
          className="absolute top-[60px] left-[140px] w-[480px] h-[480px] rounded-full blur-[120px] opacity-50 pointer-events-none"
          style={{ backgroundColor: "#319AFF" }}
        />
        {/* Accent Soft Radial highlight */}
        <div 
          className="absolute top-[280px] left-[380px] w-[320px] h-[320px] rounded-full blur-[100px] opacity-25 pointer-events-none bg-sky-200"
        />
      </div>

      {/* Main z-10 Container */}
      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 flex flex-col min-h-screen justify-between">
        
        {/* 2. The "Strong Liquid Glass" Navbar */}
        <header className="sticky top-[30px] z-50 w-fit mx-auto pt-2">
          <nav 
            className="home-hero-nav flex items-center gap-2 sm:gap-8 px-3 sm:px-6 py-3 rounded-[16px] backdrop-blur-[50px] border border-black/10 transition-all duration-300"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.3)",
              boxShadow: "inset 0px 4px 4px 0px rgba(255, 255, 255, 0.25), 0px 10px 30px -10px rgba(0, 0, 0, 0.05)"
            }}
          >
            {/* Logo "云往AI" (Fustat Bold) */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleStartWorkspace("video")}>
              <div className="flex items-center justify-center filter drop-shadow-[0_2px_8px_rgba(0,132,255,0.3)]">
                <YunwangLogo className="w-9 h-9" />
              </div>
              <span className="font-fustat font-extrabold text-xl sm:text-2xl tracking-tight text-slate-900">
                云往AI
              </span>
            </div>

            {/* Nav Links (AI 视频, AI 对话, AI 图像, 任务库) */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium">
              <button
                onClick={() => handleStartWorkspace("video")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 ${
                  activeTab === "video"
                    ? "bg-[#0084FF] text-white font-semibold shadow-md shadow-[#0084FF]/30 scale-105"
                    : "text-slate-700 hover:text-slate-950 hover:bg-white/50"
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>AI 视频</span>
              </button>

              <button
                onClick={() => handleStartWorkspace("chat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 ${
                  activeTab === "chat"
                    ? "bg-[#0084FF] text-white font-semibold shadow-md shadow-[#0084FF]/30 scale-105"
                    : "text-slate-700 hover:text-slate-950 hover:bg-white/50"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>AI 对话</span>
              </button>

              <button
                onClick={() => handleStartWorkspace("image")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 ${
                  activeTab === "image"
                    ? "bg-[#0084FF] text-white font-semibold shadow-md shadow-[#0084FF]/30 scale-105"
                    : "text-slate-700 hover:text-slate-950 hover:bg-white/50"
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>AI 图像</span>
              </button>

              <button
                onClick={() => handleStartWorkspace("tasks")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200 ${
                  activeTab === "tasks"
                    ? "bg-[#0084FF] text-white font-semibold shadow-md shadow-[#0084FF]/30 scale-105"
                    : "text-slate-700 hover:text-slate-950 hover:bg-white/50"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>任务库</span>
              </button>
            </div>
          </nav>
        </header>

        {/* 3. Hero Content Area: Dual-Column Desktop / Single-Column Mobile */}
        <main className="py-12 lg:py-20 my-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          
          {/* HERO LEFT: Hero Content */}
          <div className="flex flex-col items-start text-left max-w-2xl">
            
            {/* Social Proof Badge */}
            <div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium text-slate-700 mb-8 border border-black/5 backdrop-blur-md shadow-sm"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.6)",
                boxShadow: "inset 0px 2px 4px 0px rgba(255, 255, 255, 0.6), 0px 4px 12px rgba(0,0,0,0.03)"
              }}
            >
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 fill-[#FF801E] text-[#FF801E]"
                  />
                ))}
              </div>
              <span className="ml-1 font-semibold text-slate-800">
                Rated 4.9/5 by 2700+ customers
              </span>
            </div>

            {/* Hero Headline: "云往AI，更懂你的创意。" */}
            <h1 
              className="font-fustat font-bold text-slate-900 mb-6 tracking-[-1px] text-[44px] sm:text-[62px] lg:text-[72px]"
              style={{ lineHeight: 1.1 }}
            >
              <span className="block">云往AI，</span>
              <span className="block">更懂你的创意。</span>
            </h1>

            {/* Subheadline */}
            <p className="font-fustat text-base sm:text-lg lg:text-xl text-slate-700 leading-relaxed mb-10 max-w-xl">
              电影级 AI 视频创作套件，用一句话生成可发布的视频/图像素材，适合营销、广告和内容团队。
            </p>

            {/* Primary CTA: "AI 视频", "AI 对话", "AI 图像" (Equal size buttons) */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleStartWorkspace("video")}
                className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-[16px] text-white font-medium text-sm sm:text-base cursor-pointer select-none shadow-md shadow-[#0084FF]/25 transition-all duration-200"
                style={{
                  backgroundColor: "rgba(0, 132, 255, 0.9)",
                  backdropFilter: "blur(2px)",
                  WebkitBackdropFilter: "blur(2px)",
                  boxShadow: "inset 0px 3px 3px 0px rgba(255, 255, 255, 0.35), 0px 8px 20px -4px rgba(0, 132, 255, 0.35)"
                }}
              >
                <Video className="w-4 h-4 text-white" />
                <span>AI 视频</span>
              </button>

              <button
                type="button"
                onClick={() => handleStartWorkspace("chat")}
                className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-[16px] text-slate-700 hover:text-slate-900 font-medium text-sm sm:text-base border border-slate-200/80 bg-white/60 hover:bg-white/90 transition-all duration-200 cursor-pointer select-none backdrop-blur-sm"
              >
                <MessageSquare className="w-4 h-4 text-[#0084FF]" />
                <span>AI 对话</span>
              </button>

              <button
                type="button"
                onClick={() => handleStartWorkspace("image")}
                className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-[16px] text-slate-700 hover:text-slate-900 font-medium text-sm sm:text-base border border-slate-200/80 bg-white/60 hover:bg-white/90 transition-all duration-200 cursor-pointer select-none backdrop-blur-sm"
              >
                <ImageIcon className="w-4 h-4 text-[#0084FF]" />
                <span>AI 图像</span>
              </button>
            </div>

            {/* Subtle feature bullets */}
            <div className="mt-10 flex flex-wrap items-center gap-6 text-xs sm:text-sm font-medium text-slate-500">
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#0084FF]" />
                <span>几分钟成片</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#0084FF]" />
                <span>无需剪辑经验</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-[#0084FF]" />
                <span>随时调整</span>
              </div>
            </div>

          </div>

          {/* HERO RIGHT: The Glassy Orb */}
          <div className="relative flex items-center justify-center overflow-visible lg:pl-4">
            
            {/* Ambient Background Glow Behind Orb */}
            <div className="absolute w-[450px] h-[450px] bg-gradient-to-tr from-[#0084FF]/30 to-[#60B1FF]/40 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative w-full max-w-[560px] aspect-square flex items-center justify-center">
              
              {!videoError ? (
                /* High-Fidelity Glassy Orb Video with exact CSS filters & blending mode */
                <video
                  src="https://future.co/images/homepage/glassy-orb/orb-purple.webm"
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={() => setVideoError(true)}
                  className="w-full h-full object-contain scale-125 pointer-events-none drop-shadow-2xl transition-all duration-700"
                  style={{
                    mixBlendMode: "screen",
                    filter: "hue-rotate(-55deg) saturate(250%) brightness(1.2) contrast(1.1)",
                  }}
                />
              ) : (
                /* High-Precision Canvas Glassy Orb Fallback if network blocks webm */
                <div 
                  className="relative w-[420px] h-[420px] rounded-full flex items-center justify-center p-8 select-none"
                >
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#60B1FF] via-[#0084FF] to-[#319AFF] blur-[40px] opacity-60 animate-pulse" />
                  <div 
                    className="relative w-full h-full rounded-full border border-white/40 flex items-center justify-center shadow-2xl backdrop-blur-2xl"
                    style={{
                      background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9) 0%, rgba(96,177,255,0.6) 35%, rgba(0,132,255,0.8) 70%, rgba(49,154,255,0.9) 100%)",
                      boxShadow: "inset -15px -15px 40px rgba(0,84,180,0.5), inset 15px 15px 40px rgba(255,255,255,0.8), 0 25px 50px -12px rgba(0,132,255,0.3)"
                    }}
                  >
                    <div className="w-1/2 h-1/2 rounded-full border-2 border-white/60 blur-[2px] bg-white/20" />
                  </div>
                </div>
              )}

              {/* Floating Glass UI Card overlay on the Orb (Static visual element) */}
              <div 
                className="absolute -bottom-4 -left-4 sm:left-4 p-4 rounded-2xl border border-white/60 shadow-xl backdrop-blur-xl bg-white/60 max-w-[240px] hidden sm:block animate-bounce-slow select-none transition-all"
                style={{
                  boxShadow: "0 20px 40px -15px rgba(0,132,255,0.15), inset 0px 2px 4px rgba(255,255,255,0.8)"
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0084FF] flex items-center justify-center text-white text-xs font-bold shadow-md shadow-[#0084FF]/30">
                    98%
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800">AI Task Engine</div>
                    <div className="text-[10px] text-slate-500">全能 AI 平台</div>
                  </div>
                </div>
                <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-[#60B1FF] to-[#0084FF] h-full rounded-full w-[88%]" />
                </div>
              </div>

            </div>
          </div>

        </main>



      </div>
    </div>
  );
};
