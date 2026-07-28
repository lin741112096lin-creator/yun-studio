import React, { useState, useEffect } from "react";
import { Sparkles, Film, Image as ImageIcon, Camera, Clock, Sliders, Play, Wand2, Upload, X, ChevronDown, ChevronUp, Layers, Cpu } from "lucide-react";
import { ApiEndpointConfig, AspectRatio, VideoGenerationRequest } from "../types";
import { AiPromptWriterModal } from "./AiPromptWriterModal";
import { fetchJson } from "../lib/api";
import { DEFAULT_PRESET_PROVIDERS } from "../data/presets";

interface VideoStudioProps {
  apiConfig: ApiEndpointConfig;
  chatConfig?: ApiEndpointConfig;
  onOpenApiConfig: () => void;
  onOpenTemplates: () => void;
  onUpdateApiConfig?: (updates: Partial<ApiEndpointConfig>) => void;
  onSubmitTask: (request: VideoGenerationRequest) => void;
  isSubmitting: boolean;
  prefilledPrompt?: {
    prompt: string;
    style?: string;
    aspectRatio?: AspectRatio;
    imageUrl?: string;
    mode?: "text-to-video" | "image-to-video";
  };
}

const CAMERA_MOTIONS = [
  { id: "auto", label: "自动智能运镜", description: "AI 根据情节自主选择最佳镜头语言" },
  { id: "pan_right", label: "右滑推镜头 (Pan Right)", description: "平稳横向右移展现广阔远景" },
  { id: "pan_left", label: "左滑推镜头 (Pan Left)", description: "平稳横向左移移动视野" },
  { id: "zoom_in", label: "拉近镜头 (Zoom In)", description: "聚焦主体呈现生动细节特写" },
  { id: "zoom_out", label: "拉远镜头 (Zoom Out)", description: "由局部推向宏大场景全景" },
  { id: "tilt_up", label: "仰角升镜头 (Tilt Up)", description: "垂直向上推升展现宏伟高大感" },
  { id: "tilt_down", label: "俯角降镜头 (Tilt Down)", description: "俯瞰视角呈现地面与细节" },
];

export const VideoStudio: React.FC<VideoStudioProps> = ({
  apiConfig,
  chatConfig,
  onOpenApiConfig,
  onOpenTemplates,
  onUpdateApiConfig,
  onSubmitTask,
  isSubmitting,
  prefilledPrompt,
}) => {
  const [mode, setMode] = useState<"text-to-video" | "image-to-video">("text-to-video");
  const [prompt, setPrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [cameraMotion, setCameraMotion] = useState<string>("auto");
  const [resolution, setResolution] = useState<"720p" | "1080p">("720p");
  const [duration, setDuration] = useState<number>(5);

  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [enableLastFrame, setEnableLastFrame] = useState<boolean>(false);
  const [lastFrameImage, setLastFrameImage] = useState<File | null>(null);
  const [lastFramePreview, setLastFramePreview] = useState<string | null>(null);

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isAiWriterOpen, setIsAiWriterOpen] = useState<boolean>(false);

  useEffect(() => {
    if (prefilledPrompt) {
      if (prefilledPrompt.prompt) setPrompt(prefilledPrompt.prompt);
      if (prefilledPrompt.aspectRatio) setAspectRatio(prefilledPrompt.aspectRatio);
      if (prefilledPrompt.imageUrl) {
        setMode("image-to-video");
        setImagePreview(prefilledPrompt.imageUrl);
      } else if (prefilledPrompt.mode) {
        setMode(prefilledPrompt.mode);
      }
    }
  }, [prefilledPrompt]);

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "source" | "lastFrame"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert("上传文件大小不能超过 15MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (type === "source") {
        setSourceImage(file);
        setImagePreview(event.target?.result as string);
      } else {
        setLastFrameImage(file);
        setLastFramePreview(event.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const data = await fetchJson<{ enhancedPrompt?: string }>("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          cameraMotion,
          type: "video",
          apiKey: apiConfig?.apiKey,
          chatConfig,
        }),
      });
      if (data.enhancedPrompt) {
        setPrompt(data.enhancedPrompt);
      }
    } catch (err) {
      console.error("Enhance error:", err);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "text-to-video" && !prompt.trim()) {
      alert("请输入视频描述 Prompt");
      return;
    }

    if (mode === "image-to-video" && !imagePreview) {
      alert("请先上传起始帧图片");
      return;
    }

    const request: VideoGenerationRequest = {
      provider: apiConfig.provider,
      apiUrl: apiConfig.apiUrl,
      apiKey: apiConfig.apiKey,
      model: apiConfig.selectedModel,
      mode,
      prompt: prompt.trim() || "图片动态演绎视频",
      negativePrompt,
      cameraMotion,
      aspectRatio,
      resolution,
      duration,
      image: mode === "image-to-video" && imagePreview ? {
        data: imagePreview,
        mimeType: sourceImage?.type || "image/png"
      } : undefined,
      lastFrame: enableLastFrame && lastFramePreview ? {
        data: lastFramePreview,
        mimeType: lastFrameImage?.type || "image/png"
      } : undefined,
    };

    onSubmitTask(request);
  };

  return (
    <div className="space-y-6">
      {/* Liquid Glass Segmented Switcher Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div className="flex items-center space-x-1.5 p-1.5 rounded-full bg-white/80 border border-slate-200/80 backdrop-blur-md shadow-sm">
          <button
            type="button"
            onClick={() => setMode("text-to-video")}
            className={`flex items-center space-x-2 rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 ${
              mode === "text-to-video"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/30 scale-105"
                : "text-slate-700 hover:text-slate-950 hover:bg-white/80"
            }`}
          >
            <Film className="h-4 w-4" />
            <span>文生视频 (Text to Video)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode("image-to-video")}
            className={`flex items-center space-x-2 rounded-full px-5 py-2 text-xs font-semibold transition-all duration-200 ${
              mode === "image-to-video"
                ? "bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/30 scale-105"
                : "text-slate-700 hover:text-slate-950 hover:bg-white/80"
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>图生视频 (Image to Video)</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Image Upload Zone for Image to Video */}
        {mode === "image-to-video" && (
          <div className="home-glass-card-dark p-6 rounded-[24px]">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center space-x-2 text-xs font-bold text-slate-900">
                <ImageIcon className="h-4 w-4 text-[#0084FF]" />
                <span>1. 上传起始帧图片 (First Frame)</span>
              </label>
              <span className="text-[11px] text-slate-500">支持 JPG / PNG / WebP, 最大 15MB</span>
            </div>

            {imagePreview ? (
              <div className="relative aspect-video max-h-64 w-full overflow-hidden rounded-[20px] border border-slate-200/80 bg-slate-100">
                <img
                  src={imagePreview}
                  alt="Source"
                  className="h-full w-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSourceImage(null);
                    setImagePreview(null);
                  }}
                  className="absolute right-3 top-3 rounded-full bg-slate-900/80 p-2 text-slate-200 hover:text-rose-400 transition-colors border border-white/20 backdrop-blur-md shadow-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex flex-col items-center justify-center h-40 w-full cursor-pointer rounded-[20px] border-2 border-dashed border-slate-300/80 bg-white/60 hover:border-[#0084FF] hover:bg-[#0084FF]/5 transition-all">
                  <Upload className="h-7 w-7 text-[#0084FF] mb-1.5 animate-bounce" />
                  <span className="text-xs font-semibold text-slate-800">
                    点击选择本地图片或拖拽至此处上传
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    图片将作为视频的首帧画面 (支持 PNG, JPG, WebP)
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "source")}
                    className="hidden"
                  />
                </label>
                <div className="flex items-center space-x-2 bg-white/70 px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs">
                  <span className="text-slate-400 text-[11px] font-medium flex-shrink-0">或输入 URL:</span>
                  <input
                    type="text"
                    placeholder="粘贴网络图片地址 (https://...)"
                    onChange={(e) => {
                      const url = e.target.value.trim();
                      if (url) {
                        setImagePreview(url);
                        setSourceImage(null);
                      }
                    }}
                    className="w-full bg-transparent text-slate-800 placeholder-slate-400 outline-none text-xs"
                  />
                </div>
              </div>
            )}

            {/* Optional End Frame Toggle */}
            <div className="mt-4 pt-3 border-t border-slate-200/80">
              <button
                type="button"
                onClick={() => setEnableLastFrame(!enableLastFrame)}
                className="flex items-center space-x-2 text-xs text-[#0084FF] hover:underline font-medium"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>{enableLastFrame ? "取消设置尾帧图片" : "+ 添加结束帧图片 (可实现转场过渡)"}</span>
              </button>

              {enableLastFrame && (
                <div className="mt-3">
                  {lastFramePreview ? (
                    <div className="relative aspect-video max-h-48 w-full overflow-hidden rounded-[20px] border border-slate-200/80 bg-slate-100">
                      <img
                        src={lastFramePreview}
                        alt="Last frame"
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setLastFrameImage(null);
                          setLastFramePreview(null);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-slate-900/80 p-1.5 text-slate-200 hover:text-rose-400 border border-white/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-32 w-full cursor-pointer rounded-[20px] border border-dashed border-slate-300/80 bg-white/60 hover:border-[#0084FF] transition-all">
                      <Upload className="h-5 w-5 text-slate-400 mb-1" />
                      <span className="text-xs text-slate-600">上传结束帧图片</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, "lastFrame")}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Prompt Input Box */}
        <div className="home-glass-card-dark p-6 rounded-[24px]">
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center space-x-2 text-xs font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-[#0084FF]" />
              <span>视频分镜画面描述 (Prompt)</span>
            </label>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleEnhancePrompt}
                disabled={isEnhancing || !prompt.trim()}
                className="flex items-center space-x-1.5 rounded-full border border-[#0084FF]/30 bg-[#0084FF]/10 px-3.5 py-1 text-xs font-semibold text-[#0084FF] hover:bg-[#0084FF]/20 transition-all disabled:opacity-40 active:scale-95"
              >
                <Wand2 className={`h-3.5 w-3.5 ${isEnhancing ? "animate-spin" : ""}`} />
                <span>{isEnhancing ? "智扩润色中..." : "AI 智能润色"}</span>
              </button>

              {prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt("")}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === "text-to-video"
                ? "详细描述您想要生成的视频画面，例如：一只戴着高科技风镜的雨夜黑猫，正驾驶着悬浮跑车穿越满是霓虹灯光与雨滴的赛博朋克都市..."
                : "描述图片在视频中的运动轨迹或变化过程，例如：镜头向前平滑推近，主角微微转过头，光影随风变幻..."
            }
            rows={4}
            className="home-glass-input w-full p-4 text-xs sm:text-sm text-slate-900 placeholder-slate-400 font-sans leading-relaxed resize-none"
          />

          <div className="mt-2 flex items-center justify-end text-[11px] text-slate-500">
            <span className="font-mono">{prompt.length} 字</span>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="home-glass-card-dark p-6 rounded-[24px]">
          <label className="block text-xs font-bold text-slate-900 mb-3">
            画面比例 (Aspect Ratio)
          </label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { ratio: "16:9", label: "16:9 宽屏大片", sub: "横屏 / YouTube" },
              { ratio: "9:16", label: "9:16 抖音短视频", sub: "竖屏 / TikTok" },
              { ratio: "1:1", label: "1:1 正方形", sub: "社交媒体" },
              { ratio: "4:3", label: "4:3 复古经典", sub: "传统显示" },
              { ratio: "21:9", label: "21:9 宽银幕", sub: "电影极客" },
            ].map((item) => {
              const isSelected = aspectRatio === item.ratio;
              return (
                <button
                  key={item.ratio}
                  type="button"
                  onClick={() => setAspectRatio(item.ratio as AspectRatio)}
                  className={`flex flex-col items-center justify-center rounded-[16px] border p-3.5 transition-all duration-200 ${
                    isSelected
                      ? "border-[#0084FF] bg-[#0084FF]/10 text-slate-900 font-bold shadow-md shadow-[#0084FF]/15 scale-105"
                      : "border-slate-200/80 bg-white/60 text-slate-700 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <span className="font-mono font-bold text-xs text-[#0084FF]">{item.ratio}</span>
                  <span className="mt-1 text-[11px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Camera Motion & Specs Row */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Camera Motion */}
          <div className="home-glass-card-dark p-6 rounded-[24px]">
            <label className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 mb-3">
              <Camera className="h-4 w-4 text-[#0084FF]" />
              <span>运镜轨迹指示 (Camera Motion)</span>
            </label>
            <select
              value={cameraMotion}
              onChange={(e) => setCameraMotion(e.target.value)}
              className="home-glass-input w-full px-4 py-3 text-xs text-slate-900 font-medium"
            >
              {CAMERA_MOTIONS.map((m) => (
                <option key={m.id} value={m.id} className="bg-white text-slate-900">
                  {m.label} - {m.description}
                </option>
              ))}
            </select>
          </div>

          {/* Specs: Resolution & Duration */}
          <div className="home-glass-card-dark p-6 rounded-[24px]">
            <label className="flex items-center space-x-1.5 text-xs font-bold text-slate-900 mb-3">
              <Clock className="h-4 w-4 text-[#0084FF]" />
              <span>分辨率与视频时长</span>
            </label>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-600 font-medium">清晰度</span>
                <div className="flex p-1 rounded-full bg-slate-100 border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setResolution("720p")}
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all ${
                      resolution === "720p"
                        ? "bg-[#0084FF] text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    720p
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolution("1080p")}
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all ${
                      resolution === "1080p"
                        ? "bg-[#0084FF] text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    1080p
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-[11px] text-slate-600 font-medium mb-1.5">生成时长 (秒)</span>
                <div className="grid grid-cols-5 gap-1.5 p-1 rounded-full bg-slate-100 border border-slate-200/80">
                  {[5, 8, 10, 12, 15].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDuration(s)}
                      className={`rounded-full py-1 text-xs font-bold font-mono transition-all ${
                        duration === s
                          ? "bg-[#0084FF] text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {s}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Parameters Accordion */}
        <div className="home-glass-card-dark p-6 rounded-[24px]">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-800"
          >
            <div className="flex items-center space-x-2">
              <Sliders className="h-4 w-4 text-[#0084FF]" />
              <span>高级渲染参数 (Negative Prompt & Model Customization)</span>
            </div>
            {showAdvanced ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 border-t border-slate-200/80 pt-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                  反向提示词 (Negative Prompt)
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="避免在视频中出现的元素，如：画面模糊, 变色, 画面卡顿, 低画质, 伪影..."
                  className="home-glass-input w-full px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Button Bar */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="home-glass-button w-full py-4 px-6 text-base shadow-xl flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            <Play className="h-5 w-5 fill-white text-white" />
            <span>
              {isSubmitting
                ? "正在提交视频生成任务..."
                : mode === "image-to-video"
                ? "立即由图生成 AI 视频"
                : "立即生成 AI 视频大片"}
            </span>
          </button>

          {/* Status Note & Quick Model Switcher */}
          {(() => {
            const currentProviderObj = DEFAULT_PRESET_PROVIDERS.find((p) => p.id === apiConfig.provider) || DEFAULT_PRESET_PROVIDERS[0];
            const availableModels = currentProviderObj ? currentProviderObj.models : ["grok-imagine-video-special"];
            const currentModel = apiConfig.selectedModel || "grok-imagine-video-special";

            return (
              <div className="mt-3 flex items-center justify-center space-x-2 text-xs text-slate-600">
                <span className="flex items-center space-x-1">
                  <Cpu className="h-3.5 w-3.5 text-[#0084FF]" />
                  <span>选定渲染模型:</span>
                </span>

                {onUpdateApiConfig ? (
                  <select
                    value={currentModel}
                    onChange={(e) => onUpdateApiConfig({ selectedModel: e.target.value })}
                    className="bg-white/90 border border-slate-200/90 text-[#0084FF] font-mono font-bold text-xs rounded-xl px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#0084FF]/30 cursor-pointer shadow-sm transition-all"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m} className="text-slate-900 font-sans">
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong className="text-[#0084FF] font-mono">{currentModel}</strong>
                )}

                <button
                  type="button"
                  onClick={onOpenApiConfig}
                  className="ml-1 text-[11px] text-slate-400 hover:text-[#0084FF] underline transition-colors cursor-pointer"
                >
                  高级配置
                </button>
              </div>
            );
          })()}
        </div>
      </form>

      {/* AI Prompt Writer Assistant Modal */}
      <AiPromptWriterModal
        isOpen={isAiWriterOpen}
        onClose={() => setIsAiWriterOpen(false)}
        apiConfig={apiConfig}
        chatConfig={chatConfig}
        onApplyPrompt={(generated) => setPrompt(generated)}
      />
    </div>
  );
};
