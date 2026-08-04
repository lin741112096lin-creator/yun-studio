import React, { useState } from "react";
import { Sparkles, RefreshCw, Maximize2, X, Upload, Wand2 } from "lucide-react";
import { ApiEndpointConfig, ImageTask, ImageAspectRatio, TaskSource } from "../types";
import { fetchJson, normalizeImageUrl } from "../lib/api";
import { AiPromptWriterModal } from "./AiPromptWriterModal";

interface ImageStudioProps {
  imageConfig: ApiEndpointConfig;
  chatConfig?: ApiEndpointConfig;
  onImageGenerated?: (task: ImageTask) => void;
  tasks: ImageTask[];
  onSaveTasks: (tasks: ImageTask[]) => void;
  taskSource?: TaskSource;
  showAiWriter?: boolean;
  prefilledPrompt?: {
    prompt: string;
    style?: string;
    aspectRatio?: string;
    referenceImage?: string;
    negativePrompt?: string;
  } | null;
}

const IMAGE_ASPECT_RATIOS: { id: ImageAspectRatio; label: string; icon: string; desc: string }[] = [
  { id: "1:1", label: "1:1 正方形", icon: "🎯", desc: "头像 / 推荐海报" },
  { id: "16:9", label: "16:9 宽屏", icon: "🖥️", desc: "壁纸 / 视频封面" },
  { id: "9:16", label: "9:16 竖屏", icon: "📱", desc: "手机壁纸 / 社交媒体" },
  { id: "4:3", label: "4:3 相框", icon: "📷", desc: "标准摄影 / 宣传页" },
  { id: "3:2", label: "3:2 经典", icon: "🖼️", desc: "单反相片 / 展册" },
];

const IMAGE_STYLE_PRESETS = [
  { id: "photorealistic", label: "写实摄影", promptSuffix: "Ultra photorealistic, 8k resolution, 35mm lens, natural studio lighting, hyperdetailed" },
  { id: "cyberpunk", label: "赛博朋克", promptSuffix: "Cyberpunk neon lights, rainy city reflection, futuristic aesthetic, glowing details, octane render" },
  { id: "3d-render", label: "3D 渲染", promptSuffix: "3D Pixar style character render, subsurface scattering, vibrant colors, clean digital artwork" },
  { id: "watercolor", label: "水彩插画", promptSuffix: "Soft watercolor painting, elegant ink bleeds, artistic brush strokes, ethereal aesthetic" },
  { id: "anime", label: "二次元风", promptSuffix: "Makoto Shinkai style anime art, high aesthetic, vivid sky, hand-drawn keyframe quality" },
  { id: "vintage-film", label: "胶片复古", promptSuffix: "Vintage 1970s film grain, Kodak tone, nostalgic warmth, light leaks, film camera texture" },
  { id: "surreal", label: "梦幻奇幻", promptSuffix: "Surreal dreamlike landscape, bioluminescent soft glow, floating elements, whimsical fantasy" },
];

export const ImageStudio: React.FC<ImageStudioProps> = ({
  imageConfig,
  chatConfig,
  onImageGenerated,
  tasks,
  onSaveTasks,
  taskSource = "standalone-image" as TaskSource,
  showAiWriter = true,
  prefilledPrompt,
}) => {
  const [prompt, setPrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("1:1");
  const [selectedStyle, setSelectedStyle] = useState<string>("photorealistic");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isWritingNegativePrompt, setIsWritingNegativePrompt] = useState<boolean>(false);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [isAiWriterOpen, setIsAiWriterOpen] = useState(false);

  React.useEffect(() => {
    if (prefilledPrompt) {
      if (prefilledPrompt.prompt) setPrompt(prefilledPrompt.prompt);
      if (prefilledPrompt.style) setSelectedStyle(prefilledPrompt.style);
      if (prefilledPrompt.aspectRatio) {
        const match = IMAGE_ASPECT_RATIOS.find((r) => r.id === prefilledPrompt.aspectRatio);
        if (match) setAspectRatio(match.id);
      }
      if (prefilledPrompt.referenceImage) setReferenceImage(prefilledPrompt.referenceImage);
      if (prefilledPrompt.negativePrompt) setNegativePrompt(prefilledPrompt.negativePrompt);
    }
  }, [
    prefilledPrompt?.prompt,
    prefilledPrompt?.style,
    prefilledPrompt?.aspectRatio,
    prefilledPrompt?.referenceImage,
    prefilledPrompt?.negativePrompt,
  ]);

  const handleWriteNegativePrompt = async () => {
    if (!referenceImage || isWritingNegativePrompt || !showAiWriter) return;

    setIsWritingNegativePrompt(true);
    try {
      const data = await fetchJson<{ generatedPrompt?: string; error?: string }>("/api/ai-writer-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "请分析这张参考图",
          targetLanguage: "zh",
          mode: "image-negative",
          imageUrl: referenceImage,
          apiKey: imageConfig.apiKey,
          chatConfig,
        }),
      }, 180000);

      if (data.generatedPrompt?.trim()) {
        setNegativePrompt(data.generatedPrompt.trim());
      }
    } catch (error) {
      console.warn("Reference image negative prompt generation failed:", error);
    } finally {
      setIsWritingNegativePrompt(false);
    }
  };

  // Submit Image Generation
  const handleGenerateImage = async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);

    const taskId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const styleObj = IMAGE_STYLE_PRESETS.find((s) => s.id === selectedStyle);

    const newTask: ImageTask = {
      id: taskId,
      prompt,
      negativePrompt,
      aspectRatio,
      style: styleObj ? styleObj.label : undefined,
      model: imageConfig.selectedModel,
      provider: imageConfig.provider,
      status: "processing",
      createdAt: Date.now(),
      referenceImage: referenceImage || undefined,
      source: taskSource,
    };

    onSaveTasks([newTask, ...tasks]);

    try {
      const data = await fetchJson<{ imageUrl: string }>("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negativePrompt,
          aspectRatio,
          style: styleObj ? styleObj.promptSuffix : undefined,
          provider: imageConfig.provider,
          apiUrl: imageConfig.apiUrl,
          apiKey: imageConfig.apiKey,
          model: imageConfig.selectedModel,
          referenceImage: referenceImage || undefined,
        }),
      }, 180000);

      const imageUrl = normalizeImageUrl(data.imageUrl);
      if (!imageUrl) {
        throw new Error("图像接口已返回，但没有找到可显示的图片数据或图片地址");
      }

      const completedTask: ImageTask = {
        ...newTask,
        status: "completed",
        imageUrl,
      };

      onSaveTasks([completedTask, ...tasks.filter((t) => t.id !== taskId)]);
      onImageGenerated?.(completedTask);
    } catch (err: any) {
      const failedTask: ImageTask = {
        ...newTask,
        status: "failed",
        error: err.message || "请求异常",
      };
      onSaveTasks([failedTask, ...tasks.filter((t) => t.id !== taskId)]);
      alert(`生成出错: ${err.message || "未能生成图像，请检查 Key 或接口配置"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReferenceImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="image-studio-shell image-studio-shell--standalone">
      <div className="image-studio-form">
          {/* Main Prompt Area */}
          <div className="image-studio-prompt-panel image-studio-panel">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-900">
                画面生成提示词 (Prompt)
              </label>
              {showAiWriter && (
                <button
                  type="button"
                  onClick={() => setIsAiWriterOpen(true)}
                  className="image-studio-ai-write"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>AI 帮写</span>
                </button>
              )}
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述您想创作的画面，例如：一位身穿唐装的赛博朋克少女，伫立在雨夜霓虹璀璨的重庆街头，8k超写实..."
              rows={4}
              className="home-glass-input w-full p-4 text-xs sm:text-sm text-slate-900 placeholder-slate-400 resize-none font-sans"
            />
          </div>

          {/* Reference Image Upload (Optional) */}
          <div className="image-studio-reference-panel image-studio-panel">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-800">
                参考图 / 图生图 (可选)
              </label>
              {referenceImage && (
                <button
                  type="button"
                  onClick={() => setReferenceImage(null)}
                  className="text-[11px] text-rose-500 hover:underline"
                >
                  移除参考图
                </button>
              )}
            </div>
            {referenceImage ? (
              <div className="relative h-56 w-full overflow-hidden rounded-[16px] border border-slate-200/80 bg-slate-100 p-2 sm:h-64">
                <button
                  type="button"
                  onClick={() => setReferencePreview(referenceImage)}
                  title="放大查看参考图"
                  aria-label="放大查看参考图"
                  className="group relative h-full w-full cursor-zoom-in rounded-[12px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2"
                >
                  <img src={referenceImage} alt="参考图，点击放大查看" className="h-full w-full object-contain" />
                  <span className="pointer-events-none absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/65 text-white opacity-80 shadow-sm transition group-hover:bg-[#0f766e]/90 group-hover:opacity-100">
                    <Maximize2 className="h-4 w-4" />
                  </span>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-[16px] border border-dashed border-slate-300/80 bg-white/60 hover:border-[#0084FF] transition-colors">
                  <div className="flex items-center space-x-2 text-xs text-slate-700">
                    <Upload className="h-4 w-4 text-[#0f766e]" />
                    <span className="font-medium">点击上传本地参考图 (PNG / JPG / WebP)</span>
                  </div>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
                <div className="flex items-center space-x-2 bg-white/70 px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs">
                  <span className="text-slate-400 text-[11px] flex-shrink-0">或粘贴 URL:</span>
                  <input
                    type="text"
                    placeholder="粘贴网络图片地址 (https://...)"
                    onChange={(e) => {
                      const url = e.target.value.trim();
                      if (url) setReferenceImage(url);
                    }}
                    className="w-full bg-transparent text-slate-800 placeholder-slate-400 outline-none text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Aspect Ratio Picker */}
          <div className="image-studio-ratio-panel image-studio-panel">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
              画幅比例 (Aspect Ratio)
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {IMAGE_ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.id}
                  type="button"
                  onClick={() => setAspectRatio(ar.id)}
                  className={`image-studio-ratio-card flex flex-col items-start rounded-[16px] border p-3 text-left transition-all ${
                      aspectRatio === ar.id
                      ? "image-studio-ratio-card--active border-[#0f766e] bg-[#0f766e]/10 text-slate-900 font-bold shadow-md shadow-[#0f766e]/15 scale-105"
                      : "border-slate-200/80 bg-white/60 text-slate-700 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  <span className="text-xs font-bold text-[#0f766e]">{ar.icon} {ar.label}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{ar.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Negative Prompt */}
          <div className="image-studio-negative-panel image-studio-panel">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-xs font-semibold text-slate-800">
                反向提示词 (Negative Prompt - 排除元素)
              </label>
            </div>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="变形、模糊、多余手指、低质量、乱码文本..."
              className="home-glass-input w-full px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400"
            />
            <button
              type="button"
              onClick={handleWriteNegativePrompt}
              disabled={isWritingNegativePrompt}
              aria-busy={isWritingNegativePrompt}
              className="image-studio-ai-write mt-2"
              hidden={!showAiWriter}
            >
              {isWritingNegativePrompt ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              <span>{isWritingNegativePrompt ? "正在识别图片..." : "AI 帮写"}</span>
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleGenerateImage}
            disabled={!prompt.trim() || isGenerating}
            className="image-studio-submit w-full py-4 text-sm shadow-xl flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>正在为您绘制 AI 艺术图像...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>立即生成高质量 AI 图像</span>
              </>
            )}
          </button>
        </div>

      {showAiWriter && (
        <AiPromptWriterModal
          isOpen={isAiWriterOpen}
          onClose={() => setIsAiWriterOpen(false)}
          apiConfig={imageConfig}
          chatConfig={chatConfig}
          promptType="image"
          onApplyPrompt={(generated) => setPrompt(generated)}
        />
      )}

      {referencePreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="参考图预览"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setReferencePreview(null)}
        >
          <button
            type="button"
            aria-label="关闭参考图预览"
            title="关闭"
            onClick={() => setReferencePreview(null)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={referencePreview}
            alt="放大后的参考图"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-[min(92vw,1100px)] object-contain"
          />
        </div>
      )}
    </div>
  );
};
