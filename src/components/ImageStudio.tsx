import React, { useState } from "react";
import { Image as ImageIcon, Sparkles, RefreshCw, Download, Trash2, Settings, Wand2, Maximize2, X, Upload, Layers } from "lucide-react";
import { ApiEndpointConfig, ImageTask, ImageAspectRatio } from "../types";
import { fetchJson } from "../lib/api";

interface ImageStudioProps {
  imageConfig: ApiEndpointConfig;
  chatConfig?: ApiEndpointConfig;
  onOpenApiConfig: () => void;
  onOpenTemplates?: () => void;
  tasks: ImageTask[];
  onSaveTasks: (tasks: ImageTask[]) => void;
  prefilledPrompt?: {
    prompt: string;
    style?: string;
    aspectRatio?: string;
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
  onOpenApiConfig,
  onOpenTemplates,
  tasks,
  onSaveTasks,
  prefilledPrompt,
}) => {
  const [prompt, setPrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>("1:1");
  const [selectedStyle, setSelectedStyle] = useState<string>("photorealistic");
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [previewTask, setPreviewTask] = useState<ImageTask | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  React.useEffect(() => {
    if (prefilledPrompt) {
      if (prefilledPrompt.prompt) setPrompt(prefilledPrompt.prompt);
      if (prefilledPrompt.style) setSelectedStyle(prefilledPrompt.style);
      if (prefilledPrompt.aspectRatio) {
        const match = IMAGE_ASPECT_RATIOS.find((r) => r.id === prefilledPrompt.aspectRatio);
        if (match) setAspectRatio(match.id);
      }
    }
  }, [prefilledPrompt]);

  // Handle AI Prompt Polish / Enhance
  const handleEnhancePrompt = async () => {
    if (!prompt.trim() || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const data = await fetchJson<{ enhancedPrompt?: string }>("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          style: selectedStyle,
          type: "image",
          apiKey: imageConfig?.apiKey,
          chatConfig,
        }),
      });
      if (data.enhancedPrompt) {
        setPrompt(data.enhancedPrompt);
      }
    } catch (err) {
      console.error("Failed to enhance prompt:", err);
    } finally {
      setIsEnhancing(false);
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
      });

      const completedTask: ImageTask = {
        ...newTask,
        status: "completed",
        imageUrl: data.imageUrl,
      };

      onSaveTasks([completedTask, ...tasks.filter((t) => t.id !== taskId)]);
      setPreviewTask(completedTask);
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

  const handleDeleteTask = (taskId: string) => {
    onSaveTasks(tasks.filter((t) => t.id !== taskId));
    if (previewTask?.id === taskId) {
      setPreviewTask(null);
    }
  };

  const handleCopyPrompt = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
    <div className="space-y-6">
      {/* Main Studio Grid: Left Controls + Right Gallery */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Controls Panel */}
        <div className="lg:col-span-5 space-y-5 home-glass-card-dark p-6 rounded-[24px] shadow-xl">
          {/* Main Prompt Area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-900">
                画面生成提示词 (Prompt)
              </label>
              <div className="flex items-center space-x-2.5">
                {onOpenTemplates && (
                  <button
                    type="button"
                    onClick={onOpenTemplates}
                    className="flex items-center space-x-1 text-[11px] font-semibold text-purple-600 hover:underline transition-colors cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    <span>灵感词库</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleEnhancePrompt}
                  disabled={!prompt.trim() || isEnhancing}
                  className="flex items-center space-x-1 text-[11px] font-semibold text-[#0084FF] hover:underline disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Wand2 className={`h-3 w-3 ${isEnhancing ? "animate-spin" : ""}`} />
                  <span>{isEnhancing ? "智能润色中..." : "AI 智能扩充润色"}</span>
                </button>
              </div>
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
          <div>
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
              <div className="relative h-24 w-full rounded-[16px] overflow-hidden border border-slate-200/80 bg-slate-100">
                <img src={referenceImage} alt="Reference" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-[16px] border border-dashed border-slate-300/80 bg-white/60 hover:border-[#0084FF] transition-colors">
                  <div className="flex items-center space-x-2 text-xs text-slate-700">
                    <Upload className="h-4 w-4 text-[#0084FF]" />
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

          {/* Style Presets Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
              选取艺术风格
            </label>
            <div className="flex flex-wrap gap-2">
              {IMAGE_STYLE_PRESETS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStyle(st.id)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                    selectedStyle === st.id
                      ? "border-[#0084FF] bg-[#0084FF]/10 text-slate-900 font-bold shadow-md shadow-[#0084FF]/15 scale-105"
                      : "border-slate-200/80 bg-white/60 text-slate-700 hover:border-slate-300 hover:text-slate-900 hover:bg-white"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
              画幅比例 (Aspect Ratio)
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {IMAGE_ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.id}
                  type="button"
                  onClick={() => setAspectRatio(ar.id)}
                  className={`flex flex-col items-start rounded-[16px] border p-3 text-left transition-all ${
                    aspectRatio === ar.id
                      ? "border-[#0084FF] bg-[#0084FF]/10 text-slate-900 font-bold shadow-md shadow-[#0084FF]/15 scale-105"
                      : "border-slate-200/80 bg-white/60 text-slate-700 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  <span className="text-xs font-bold text-[#0084FF]">{ar.icon} {ar.label}</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">{ar.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Negative Prompt */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              反向提示词 (Negative Prompt - 排除元素)
            </label>
            <input
              type="text"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="变形、模糊、多余手指、低质量、乱码文本..."
              className="home-glass-input w-full px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400"
            />
          </div>

          {/* Submit Button */}
          <button
            type="button"
            onClick={handleGenerateImage}
            disabled={!prompt.trim() || isGenerating}
            className="home-glass-button w-full py-4 text-sm shadow-xl flex items-center justify-center space-x-2 disabled:opacity-50"
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

        {/* Right Gallery / Showcase Panel */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center space-x-2">
              <Layers className="h-4 w-4 text-[#0084FF]" />
              <h3 className="font-bold text-sm text-slate-900">作品画廊与历史创作 ({tasks.length})</h3>
            </div>
            {tasks.length > 0 && (
              <button
                onClick={() => onSaveTasks([])}
                className="text-xs text-slate-500 hover:text-rose-600 transition-colors"
              >
                清空作品
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300/80 bg-white/60 py-16 text-center shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0084FF]/10 text-[#0084FF] mb-3 border border-[#0084FF]/20">
                <ImageIcon className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">暂无生成的图像作品</p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                在左侧输入提示词，选取理想的艺术风格与画幅比例，即刻体验 AI 画作生成！
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {tasks.map((task) => {
                const isDone = task.status === "completed" && Boolean(task.imageUrl);
                return (
                  <div
                    key={task.id}
                    className="group relative flex flex-col ios-glass-card overflow-hidden shadow-md transition-all hover:border-[#0084FF]/40 border border-slate-200/80 bg-white/80"
                  >
                    {/* Image Container */}
                    <div className="relative aspect-square w-full bg-slate-100 overflow-hidden flex items-center justify-center">
                      {isDone ? (
                        <>
                          <img
                            src={task.imageUrl}
                            alt={task.prompt}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          {/* Hover Overlay Actions */}
                          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                            <button
                              onClick={() => setPreviewTask(task)}
                              className="rounded-full bg-white/20 p-2.5 text-white hover:bg-white/30 backdrop-blur-md"
                              title="全屏查看"
                            >
                              <Maximize2 className="h-4 w-4" />
                            </button>
                            {task.imageUrl && (
                              <a
                                href={task.imageUrl}
                                download={`ai_image_${task.id}.jpg`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full bg-white/20 p-2.5 text-white hover:bg-white/30 backdrop-blur-md"
                                title="下载大图"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </>
                      ) : task.status === "processing" ? (
                        <div className="flex flex-col items-center p-4 text-center">
                          <RefreshCw className="h-8 w-8 text-[#0084FF] animate-spin mb-2" />
                          <span className="text-xs font-medium text-[#0084FF]">高质计算渲染中...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center p-4 text-center text-rose-500 text-xs">
                          <span>生成失败</span>
                          <span className="text-[10px] text-slate-500 mt-1">{task.error}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer Details */}
                    <div className="p-3 bg-slate-50/90 border-t border-slate-200/80">
                      <p className="line-clamp-2 text-xs font-medium text-slate-800">
                        {task.prompt}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-slate-700 font-mono font-medium">
                          {task.aspectRatio}
                        </span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleCopyPrompt(task.prompt, task.id)}
                            className="hover:text-slate-900 transition-colors"
                          >
                            {copiedId === task.id ? "已复制" : "复制词"}
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Fullscreen Preview Modal */}
      {previewTask && previewTask.imageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
          <div className="relative max-w-4xl w-full ios-glass-card p-5 shadow-2xl overflow-hidden border border-white/20">
            {/* iOS Modal Drag Handle */}
            <div className="w-9 h-1 rounded-full bg-zinc-600/60 mx-auto mb-3" />

            <button
              onClick={() => setPreviewTask(null)}
              className="absolute top-4 right-4 z-10 rounded-full bg-black/70 p-2 text-zinc-300 hover:text-white border border-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="max-h-[70vh] w-full flex items-center justify-center overflow-hidden rounded-2xl bg-black">
              <img
                src={previewTask.imageUrl}
                alt={previewTask.prompt}
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-white">{previewTask.prompt}</p>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>比例: {previewTask.aspectRatio} | 风格: {previewTask.style || "默认"} | 模型: {previewTask.model}</span>
                <a
                  href={previewTask.imageUrl}
                  download={`ai_image_${previewTask.id}.jpg`}
                  target="_blank"
                  rel="noreferrer"
                  className="ios-blue-button px-5 py-2 flex items-center space-x-1.5 font-bold text-white shadow-lg"
                >
                  <Download className="h-4 w-4" />
                  <span>下载高清大图</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
