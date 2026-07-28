import React, { useState } from "react";
import { X, Sparkles, Wand2, Copy, Check, ArrowRight, RefreshCw } from "lucide-react";
import { ApiConfig, ApiEndpointConfig } from "../types";
import { apiUrl } from "../lib/api";

interface AiPromptWriterModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiConfig: ApiConfig;
  chatConfig?: ApiEndpointConfig;
  onApplyPrompt: (generatedPrompt: string) => void;
}

export const AiPromptWriterModal: React.FC<AiPromptWriterModalProps> = ({
  isOpen,
  onClose,
  apiConfig,
  chatConfig,
  onApplyPrompt,
}) => {
  const [topic, setTopic] = useState<string>("");
  const [theme, setTheme] = useState<string>("电影大片");
  const [cameraPreference, setCameraPreference] = useState<string>("镜头平滑推近");
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const quickIdeas = [
    "雨夜赛博朋克街头",
    "防晒霜水感爆珠与光芒特写",
    "高端香水瓶光影流动展示",
    "晨曦手冲咖啡流淌细节",
    "运动鞋悬浮科技碰撞展示",
    "浩瀚星空游弋的深海鲸鱼",
  ];

  const handleGenerate = async () => {
    if (!topic.trim()) {
      alert("请输入您的视频创意主题或简单灵感");
      return;
    }

    setIsGenerating(true);
    setGeneratedPrompt("");
    try {
      const res = await fetch(apiUrl("/api/ai-writer-prompt"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          theme,
          cameraPreference,
          targetLanguage: language,
          apiKey: apiConfig.apiKey,
          chatConfig,
        }),
      });

      const data = await res.json();
      if (data.generatedPrompt) {
        setGeneratedPrompt(data.generatedPrompt);
      } else if (data.error) {
        alert(`生成失败: ${data.error}`);
      }
    } catch (err: any) {
      alert(`生成发生错误: ${err.message || "请求失败"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleApply = () => {
    if (!generatedPrompt) return;
    onApplyPrompt(generatedPrompt);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-indigo-500/30 bg-slate-900 p-6 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>AI 帮写提示词</span>
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                  Gemini 3.6 Flash 驱动
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                输入简单的灵感点子，AI 导播将自动帮您撰写高连贯度与画质感的专业提示词
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="mt-5 space-y-4">
          {/* Topic Input */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              1. 创意点子 / 基础主题 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：雨夜霓虹街道、海边看日落的少女、极光下的木屋..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Quick Inspiration Pills */}
            <div className="mt-2.5 flex items-center space-x-1.5 flex-wrap gap-y-1 text-[11px]">
              <span className="text-slate-500 mr-1">灵感推荐:</span>
              {quickIdeas.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setTopic(idea)}
                  className="rounded-lg border border-slate-800/80 bg-slate-950/60 px-2.5 py-1 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 transition-all"
                >
                  + {idea}
                </button>
              ))}
            </div>
          </div>

          {/* Theme Mood & Camera Options */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                2. 画面氛围调性
              </label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="电商营销">🛍️ 电商营销 (E-Commerce Product Commercial)</option>
                <option value="电影大片">🎬 电影大片 (Cinematic Film)</option>
                <option value="科幻未来">🚀 科幻未来 (Cyber & Sci-Fi)</option>
                <option value="治愈唯美">🌸 治愈唯美 (Warm & Soft)</option>
                <option value="国风奇幻">🎋 国风奇幻 (Oriental Fantasy)</option>
                <option value="写实纪实">📷 写实纪实 (Photorealistic)</option>
                <option value="二次元动画">🎨 二次元动画 (Anime Style)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                3. 镜头运镜偏好
              </label>
              <select
                value={cameraPreference}
                onChange={(e) => setCameraPreference(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="镜头平滑推近">平滑推近 (Pan Forward)</option>
                <option value="环绕 360 度旋转">环绕旋转 (Orbit 360°)</option>
                <option value="低角度仰拍上升">低视角仰摇 (Tilt Up)</option>
                <option value="特写微距拉远">特写平滑拉远 (Zoom Out)</option>
                <option value="临场手持轻摇">手持轻摇 (Handheld)</option>
              </select>
            </div>
          </div>

          {/* Output Language */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-slate-300">提示词生成语言:</span>
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
              <button
                type="button"
                onClick={() => setLanguage("zh")}
                className={`rounded-md px-3 py-1 ${
                  language === "zh" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                中文提示词
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`rounded-md px-3 py-1 ${
                  language === "en" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                English Prompt
              </button>
            </div>
          </div>

          {/* Generate Action Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="w-full flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>AI 导播正在撰写专业提示词...</span>
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                <span>生成专业 AI 视频提示词</span>
              </>
            )}
          </button>

          {/* Result Output Box */}
          {generatedPrompt && (
            <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-4 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center space-x-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>AI 帮写成果:</span>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center space-x-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-100 leading-relaxed font-sans bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                {generatedPrompt}
              </p>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-500 transition-all"
                >
                  <span>套用到视频描述框</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
