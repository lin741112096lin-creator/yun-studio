import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Film, Image as ImageIcon, Camera, Clock, Sliders, Play, Wand2, Upload, X, Maximize2, ChevronDown, ChevronUp, Cpu, Check } from "lucide-react";
import { ApiEndpointConfig, VideoAspectRatio, VideoGenerationRequest, TaskSource } from "../types";
import { AiPromptWriterModal } from "./AiPromptWriterModal";
import { fetchJson } from "../lib/api";
import { DEFAULT_PRESET_PROVIDERS } from "../data/presets";
import { analyzeReferenceImage, appendNegativePrompt } from "../lib/referenceImage";
import { optimizeImageFile } from "../lib/imageUpload";

const VIDEO_OUTPUT_LANGUAGES = [
  { id: "zh-CN", label: "中文", instruction: "Simplified Chinese" },
  { id: "en", label: "English", instruction: "English" },
  { id: "ms", label: "Bahasa Melayu", instruction: "Bahasa Melayu (Malay)" },
  { id: "th", label: "ไทย", instruction: "Thai" },
  { id: "ja", label: "日本語", instruction: "Japanese" },
  { id: "ko", label: "한국어", instruction: "Korean" },
  { id: "other", label: "其他语言", instruction: "the custom language specified by the customer" },
];

const getLanguageInstruction = (languageId: string) =>
  VIDEO_OUTPUT_LANGUAGES.find((language) => language.id === languageId)?.instruction || "Simplified Chinese";

interface VideoStudioProps {
  apiConfig: ApiEndpointConfig;
  chatConfig?: ApiEndpointConfig;
  videoTemplateOptions?: { id: string; label: string; goal: string }[];
  selectedVideoTemplateId?: string;
  onVideoTemplateChange?: (templateId: string) => void;
  onUpdateApiConfig?: (updates: Partial<ApiEndpointConfig>) => void;
  onSubmitTask: (request: VideoGenerationRequest) => void;
  isSubmitting: boolean;
  hideModeSwitcher?: boolean;
  taskSource?: TaskSource;
  prefilledPrompt?: {
    prompt: string;
    style?: string;
    aspectRatio?: VideoAspectRatio;
    imageUrl?: string;
    mode?: "text-to-video" | "image-to-video";
    duration?: number;
    outputLanguage?: string;
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

const VIDEO_TEXT_RESTRICTION = "画面中不生成任何字幕、文字、标题、贴纸或水印。";

export const VideoStudio: React.FC<VideoStudioProps> = ({
  apiConfig,
  chatConfig,
  videoTemplateOptions,
  selectedVideoTemplateId,
  onVideoTemplateChange,
  onUpdateApiConfig,
  onSubmitTask,
  isSubmitting,
  hideModeSwitcher = false,
  taskSource = "standalone-video" as TaskSource,
  prefilledPrompt,
}) => {
  const [mode, setMode] = useState<"text-to-video" | "image-to-video">("image-to-video");
  const [prompt, setPrompt] = useState<string>("");
  const [negativePrompt, setNegativePrompt] = useState<string>("");
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>("16:9");
  const [cameraMotion, setCameraMotion] = useState<string>("auto");
  const [resolution, setResolution] = useState<"480p" | "720p">("720p");
  const [duration, setDuration] = useState<number>(8);
  const [outputLanguage, setOutputLanguage] = useState<string>("zh-CN");
  const [customOutputLanguage, setCustomOutputLanguage] = useState<string>("");
  const [isTranslatingPrompt, setIsTranslatingPrompt] = useState(false);
  const prefilledTranslationKeyRef = useRef<string | null>(null);

  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isAnalyzingReference, setIsAnalyzingReference] = useState<boolean>(false);

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isAiWriterOpen, setIsAiWriterOpen] = useState<boolean>(false);

  useEffect(() => {
    if (prefilledPrompt) {
      if (prefilledPrompt.prompt) setPrompt(prefilledPrompt.prompt);
      if (prefilledPrompt.aspectRatio) setAspectRatio(prefilledPrompt.aspectRatio);
      if (prefilledPrompt.duration) setDuration(prefilledPrompt.duration);
      if (prefilledPrompt.outputLanguage) setOutputLanguage(prefilledPrompt.outputLanguage);
      if (prefilledPrompt.imageUrl) {
        setMode("image-to-video");
        setImagePreview(prefilledPrompt.imageUrl);
        setImageLoadError(false);
      } else if (prefilledPrompt.mode) {
        setMode(prefilledPrompt.mode);
      }
    }
  }, [
    prefilledPrompt?.prompt,
    prefilledPrompt?.aspectRatio,
    prefilledPrompt?.duration,
    prefilledPrompt?.imageUrl,
    prefilledPrompt?.mode,
    prefilledPrompt?.outputLanguage,
  ]);

  useEffect(() => {
    const sourcePrompt = prefilledPrompt?.prompt;
    const targetLanguageId = prefilledPrompt?.outputLanguage;
    if (
      !sourcePrompt ||
      !targetLanguageId ||
      targetLanguageId === "zh-CN" ||
      !/[一-鿿]/.test(sourcePrompt) ||
      !chatConfig?.apiKey
    ) return;

    const translationKey = `${targetLanguageId}:${sourcePrompt}`;
    if (prefilledTranslationKeyRef.current === translationKey) return;
    prefilledTranslationKeyRef.current = translationKey;

    const targetLanguage = getLanguageInstruction(targetLanguageId);
    let cancelled = false;
    setIsTranslatingPrompt(true);
    void fetchJson<{ response?: string; error?: string }>("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: chatConfig.provider,
        apiUrl: chatConfig.apiUrl,
        apiKey: chatConfig.apiKey,
        model: chatConfig.selectedModel,
        messages: [{
          role: "user",
          content: `Translate this AI video prompt into ${targetLanguage}. Preserve all time ranges, shot structure, product identity, character continuity, no-face restrictions, and no-subtitle rules. Keep brand names, product models, trademarks, and labels unchanged. Return only the translated prompt:\n\n${sourcePrompt}`,
        }],
      }),
    }).then((data) => {
      if (!cancelled && data.response) {
        setPrompt(data.response.replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim());
      }
    }).catch((error) => {
      if (!cancelled) {
        console.error("Initial prompt translation error:", error);
        setOutputLanguage("zh-CN");
      }
    }).finally(() => {
      if (!cancelled) setIsTranslatingPrompt(false);
    });

    return () => {
      cancelled = true;
    };
  }, [prefilledPrompt?.prompt, prefilledPrompt?.outputLanguage, chatConfig?.apiKey]);

  useEffect(() => {
    if (mode !== "image-to-video" || !imagePreview || !chatConfig?.apiKey) {
      setIsAnalyzingReference(false);
      return;
    }
    let cancelled = false;
    setIsAnalyzingReference(true);
    analyzeReferenceImage(imagePreview, chatConfig, "video")
      .then((generatedNegativePrompt) => {
        if (!cancelled && generatedNegativePrompt) {
          setNegativePrompt((current) => appendNegativePrompt(current, generatedNegativePrompt));
          setShowAdvanced(true);
        }
      })
      .catch((error) => {
        if (!cancelled) console.warn("Reference image analysis failed:", error);
      })
      .finally(() => {
        if (!cancelled) setIsAnalyzingReference(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, imagePreview, chatConfig]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      alert("上传文件大小不能超过 15MB");
      return;
    }

    const optimizedImage = await optimizeImageFile(file);
    {
      setSourceImage(file);
      setImagePreview(optimizedImage);
      setImageLoadError(false);
    }
  };

  const getVideoLanguageName = (languageId = outputLanguage, customLanguage = customOutputLanguage) => {
    const selectedLanguage = VIDEO_OUTPUT_LANGUAGES.find((language) => language.id === languageId);
    return languageId === "other" && customLanguage.trim()
      ? customLanguage.trim()
      : selectedLanguage?.instruction || "Simplified Chinese";
  };

  const handleOutputLanguageChange = async (nextLanguage: string) => {
    const previousLanguage = outputLanguage;
    setOutputLanguage(nextLanguage);
    if (nextLanguage !== "other") setCustomOutputLanguage("");

    if (!prefilledPrompt?.prompt || !prompt.trim() || nextLanguage === previousLanguage || nextLanguage === "other") return;

    setIsTranslatingPrompt(true);
    try {
      const targetLanguage = getVideoLanguageName(nextLanguage);
      const data = await fetchJson<{ response?: string; error?: string }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: chatConfig?.provider,
          apiUrl: chatConfig?.apiUrl,
          apiKey: chatConfig?.apiKey,
          model: chatConfig?.selectedModel,
          messages: [{
            role: "user",
            content: `Translate the following AI video prompt into ${targetLanguage}. Preserve the time ranges, shot structure, product identity rules, character continuity rules, no-face restrictions, and no-subtitle rule. Translate only the natural-language content; keep brand names, product models, trademarks, and labels unchanged. Return only the translated prompt:\n\n${prompt}`,
          }],
        }),
      });
      if (!data.response) throw new Error(data.error || "Translation returned no content");
      setPrompt(data.response.replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/i, "").trim());
    } catch (error) {
      console.error("Prompt translation error:", error);
      setOutputLanguage(previousLanguage);
      alert("提示词翻译失败，已恢复原语言。请检查对话接口配置后重试。");
    } finally {
      setIsTranslatingPrompt(false);
    }
  };

  const getVideoLanguageInstruction = () => {
    const languageName = getVideoLanguageName();
    return `Output language: ${languageName}. Use this language for any narration, dialogue, spoken lines, and human-readable prompt instructions. Keep brand names, product models, trademarks, and labels unchanged. Do not generate subtitles, captions, watermarks, or random text.`;
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
          targetLanguage: getLanguageInstruction(outputLanguage),
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

    if (mode === "image-to-video" && (!imagePreview || imageLoadError)) {
      alert(imageLoadError ? "当前起始帧图片地址已失效，请返回上一步重新生成或重新上传" : "请先上传起始帧图片");
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
      source: taskSource,
      image: mode === "image-to-video" && imagePreview ? {
        data: imagePreview,
         mimeType: imagePreview.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || sourceImage?.type || "image/png"
      } : undefined,
    };

    request.prompt = `${request.prompt}\n\n${getVideoLanguageInstruction()}`;
    request.prompt = request.prompt.includes(VIDEO_TEXT_RESTRICTION)
      ? request.prompt
      : `${request.prompt} ${VIDEO_TEXT_RESTRICTION}`;
    onSubmitTask(request);
  };

  const currentProviderObj = DEFAULT_PRESET_PROVIDERS.find((p) => p.id === apiConfig.provider) || DEFAULT_PRESET_PROVIDERS[0];
  const availableModels = currentProviderObj ? currentProviderObj.models : ["grok-imagine-video-special"];
  const currentModel = apiConfig.selectedModel || "grok-imagine-video-special";

  return (
    <div className={`video-studio-shell video-studio-shell--${mode} video-studio-shell--${taskSource}`}>
      {/* Primary creation mode */}
      {!hideModeSwitcher && (
      <div className="video-studio-modebar">
        <div>
          <p className="video-studio-kicker">CREATE MODE</p>
          <p className="video-studio-modehint">选择一种方式开始创作</p>
        </div>
        <div className="video-studio-segmented">
          <button
            type="button"
            onClick={() => setMode("image-to-video")}
            className={`video-studio-segment ${
              mode === "image-to-video"
                ? "video-studio-segment--active"
                : ""
            }`}
          >
            <ImageIcon className="h-4 w-4" />
            <span>图生视频</span>
          </button>

          <button
            type="button"
            onClick={() => setMode("text-to-video")}
            className={`video-studio-segment ${
              mode === "text-to-video"
                ? "video-studio-segment--active"
                : ""
            }`}
          >
            <Film className="h-4 w-4" />
            <span>文生视频</span>
          </button>
        </div>
      </div>
      )}

      <form onSubmit={handleSubmit} className="video-studio-form">
        {/* Image Upload Zone for Image to Video */}
        {mode === "image-to-video" && (
          <div className="video-studio-image-row grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="studio-panel studio-panel--compact">
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="flex items-center space-x-2 text-xs font-bold text-slate-900">
                  <ImageIcon className="h-4 w-4 text-[#0084FF]" />
                  <span>1. 上传起始帧图片 (First Frame)</span>
                </label>
                <span className="text-[11px] text-slate-500">支持 JPG / PNG / WebP, 最大 15MB</span>
              </div>

              {imagePreview ? (
                <div className="relative aspect-video max-h-64 w-full overflow-hidden rounded-[20px] border border-slate-200/80 bg-slate-100">
                  {imageLoadError ? (
                    <div className="flex h-full min-h-40 flex-col items-center justify-center px-6 text-center">
                      <ImageIcon className="mb-2 h-8 w-8 text-rose-400" />
                      <p className="text-xs font-semibold text-slate-700">图片地址已失效，暂时无法显示</p>
                      <p className="mt-1 text-[11px] text-slate-500">请返回上一步重新生成，或重新上传一张图片</p>
                    </div>
                  ) : (
                    <img
                      src={imagePreview}
                      alt="Source"
                      onClick={() => setPreviewImage(imagePreview)}
                      onError={() => setImageLoadError(true)}
                      className="h-full w-full cursor-zoom-in object-contain"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewImage(imagePreview)}
                    title="放大查看图片"
                    className="absolute bottom-3 left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/75 text-white shadow-lg transition hover:bg-slate-900"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceImage(null);
                      setImagePreview(null);
                      setImageLoadError(false);
                    }}
                    className="absolute right-3 top-3 rounded-full border border-white/20 bg-slate-900/80 p-2 text-slate-200 shadow-lg backdrop-blur-md transition-colors hover:text-rose-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-slate-300/80 bg-white/60 transition-all hover:border-[#0084FF] hover:bg-[#0084FF]/5">
                    <Upload className="mb-1.5 h-7 w-7 animate-bounce text-[#0084FF]" />
                    <span className="text-xs font-semibold text-slate-800">
                      点击选择本地图片或拖拽至此处上传
                    </span>
                    <span className="mt-0.5 text-[11px] text-slate-500">
                      图片将作为视频的首帧画面 (支持 PNG, JPG, WebP)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  <div className="flex items-center space-x-2 rounded-xl border border-slate-200/80 bg-white/70 px-3 py-1.5 text-xs">
                    <span className="flex-shrink-0 text-[11px] font-medium text-slate-400">或输入 URL:</span>
                    <input
                      type="text"
                      placeholder="粘贴网络图片地址 (https://...)"
                      onChange={(e) => {
                        const url = e.target.value.trim();
                        if (url) {
                          setImagePreview(url);
                          setSourceImage(null);
                          setImageLoadError(false);
                        }
                      }}
                      className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Prompt Input Box */}
        <div className="video-studio-prompt-panel studio-panel studio-panel--prompt">
          <div className="flex items-center justify-between mb-3">
            <label className="video-studio-section-title">
              <Sparkles className="h-4 w-4 text-[#0084FF]" />
              <span>视频分镜画面描述 (Prompt)</span>
            </label>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleEnhancePrompt}
                disabled={isEnhancing || !prompt.trim()}
                className="video-studio-ghost-action"
              >
                <Wand2 className={`h-3.5 w-3.5 ${isEnhancing ? "animate-spin" : ""}`} />
                <span>{isEnhancing ? "智扩润色中..." : "AI 智能润色"}</span>
              </button>

              {prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt("")}
                  className="video-studio-clear"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {videoTemplateOptions && onVideoTemplateChange && (
            <div className="video-studio-template-picker">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-800">选择视频版本</span>
                <span className="text-[10px] text-slate-500">选择后自动更新提示词</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {videoTemplateOptions.map((template, index) => {
                  const isSelected = selectedVideoTemplateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onVideoTemplateChange(template.id)}
                      className={`min-h-16 rounded-xl border px-3 py-2 text-left transition-all ${
                        isSelected
                          ? "border-[#0084FF] bg-[#0084FF]/10 text-[#0084FF]"
                          : "border-slate-200 bg-white/70 text-slate-700 hover:border-[#0084FF]/50"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-[11px] font-bold">
                        <span>版本 {index + 1} · {template.label}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </span>
                      <span className="mt-1 block text-[10px] text-slate-500">{template.goal}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="video-studio-language-row">
            <label htmlFor="video-output-language" className="shrink-0 text-xs font-semibold text-slate-800">生成语言</label>
            <select
              id="video-output-language"
              value={outputLanguage}
              onChange={(event) => void handleOutputLanguageChange(event.target.value)}
              disabled={isTranslatingPrompt}
              className="home-glass-input min-w-0 flex-1 px-3 py-2 text-xs text-slate-900"
            >
              {VIDEO_OUTPUT_LANGUAGES.map((language) => (
                <option key={language.id} value={language.id}>{language.label}</option>
              ))}
            </select>
            {isTranslatingPrompt ? (
              <span className="shrink-0 text-[11px] font-medium text-[#0084FF]">正在翻译提示词...</span>
            ) : outputLanguage === "other" ? (
              <input
                value={customOutputLanguage}
                onChange={(event) => setCustomOutputLanguage(event.target.value)}
                placeholder="请输入语言名称"
                className="home-glass-input min-w-0 flex-1 px-3 py-2 text-xs text-slate-900"
              />
            ) : null}
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
            className="video-studio-prompt-input"
          />

          <div className="mt-2 flex items-center justify-end text-[11px] text-slate-500">
            <span className="font-mono">{prompt.length} 字</span>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="video-studio-ratio-panel studio-panel">
          <label className="video-studio-section-title mb-3">
            画面比例 (Aspect Ratio)
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { ratio: "16:9", label: "横屏视频" },
              { ratio: "9:16", label: "竖屏视频" },
            ].map((item) => {
              const isSelected = aspectRatio === item.ratio;
              return (
                <button
                  key={item.ratio}
                  type="button"
                  onClick={() => setAspectRatio(item.ratio as VideoAspectRatio)}
                    className={`video-studio-ratio ${
                    isSelected
                        ? "video-studio-ratio--active"
                        : ""
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
        <div className="video-studio-settings-row grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Camera Motion */}
          <div className="studio-panel">
            <label className="video-studio-section-title mb-3">
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
          <div className="studio-panel">
            <label className="video-studio-section-title mb-3">
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
                    onClick={() => setResolution("480p")}
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-all ${
                      resolution === "480p"
                        ? "bg-[#0084FF] text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    480p
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-[11px] text-slate-600 font-medium mb-1.5">生成时长 (秒)</span>
                <div className="video-studio-duration-options">
                  {[8, 10, 12, 15].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDuration(s)}
                      className={`video-studio-duration-option ${
                        duration === s
                          ? "video-studio-duration-option--active"
                          : ""
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
        <div className="video-studio-advanced-panel studio-panel">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="video-studio-advanced-toggle"
          >
            <div className="flex items-center space-x-2">
              <Sliders className="h-4 w-4 text-[#0084FF]" />
              <span>高级参数</span>
            </div>
            {showAdvanced ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 border-t border-slate-200/80 pt-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="block text-[11px] font-semibold text-slate-700">
                    反向提示词 (Negative Prompt)
                  </label>
                  {isAnalyzingReference && <span className="text-[11px] text-[#0084FF]">AI 正在识别参考图...</span>}
                </div>
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
        <div className="video-studio-action-panel pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="video-studio-submit disabled:opacity-50"
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
          {false && (() => (
              <div className="video-studio-model-row">
                <span className="flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-[#1477d4]" />
                  <span>当前模型</span>
                </span>

                {onUpdateApiConfig ? (
                  <select
                    value={currentModel}
                    onChange={(e) => onUpdateApiConfig({ selectedModel: e.target.value })}
                    className="video-studio-model-select"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m} className="text-slate-900 font-sans">
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <strong className="video-studio-model-name">{currentModel}</strong>
                )}

                <button
                  type="button"
                  onClick={() => undefined}
                  className="hidden ml-1 text-[11px] text-slate-400 hover:text-[#0084FF] underline transition-colors cursor-pointer"
                >
                  高级配置
                </button>
              </div>
          ))()}
        </div>
      </form>

      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="首帧图片预览"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            aria-label="关闭图片预览"
            title="关闭"
            onClick={() => setPreviewImage(null)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={previewImage}
            alt="放大后的首帧图片"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-[min(92vw,1100px)] object-contain"
          />
        </div>
      )}

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
