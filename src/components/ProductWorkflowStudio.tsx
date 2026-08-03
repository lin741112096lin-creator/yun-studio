import React, { useState } from "react";
import { ArrowRight, Check, ChevronDown, Image as ImageIcon, Package, Sparkles, Upload, Video, X } from "lucide-react";
import { ApiEndpointConfig, ImageTask, MultiApiConfig, VideoGenerationRequest, VideoTask } from "../types";
import { fetchJson, normalizeImageUrl } from "../lib/api";
import { optimizeImageFile } from "../lib/imageUpload";
import { ImageStudio } from "./ImageStudio";
import { VideoStudio } from "./VideoStudio";

interface ProductWorkflowStudioProps {
  multiConfig: MultiApiConfig;
  imageTasks: ImageTask[];
  onSaveImageTasks: (tasks: ImageTask[]) => void;
  onSubmitTask: (request: VideoGenerationRequest) => void;
  onOpenTaskLibrary?: () => void;
  onUpdateVideoConfig: (updates: Partial<ApiEndpointConfig>) => void;
  isSubmitting: boolean;
  activeTask?: VideoTask | null;
  onTaskUpdated?: (updatedTask: VideoTask) => void;
  storageNamespace?: string;
}

type WorkflowStep = 1 | 2 | 3;

const FACE_RESTRICTED_IMAGE_RULES =
  "Human composition rule for the image-generation stage: the person must have a complete visible head and head silhouette, including hair, back of head, neck, and shoulders. Use a back view, side-back view, or deliberate framing that hides the face. Do not generate eyes, eyebrows, nose, mouth, facial features, front-facing portrait, face close-up, face blur, mosaic, or mask. Keep the person natural and keep the product fully visible.";

type VideoTemplateId = "real-use" | "feature-closeup" | "premium-ad";

const VIDEO_TEMPLATE_OPTIONS: { id: VideoTemplateId; label: string; goal: string; prompt: string }[] = [
  {
    id: "real-use",
    label: "真实使用版",
    goal: "真实转化",
    prompt: "请根据参考商品图生成一条真实自然的带货短视频。\n【0-3秒】展示完整场景与商品，人物自然进入画面，快速建立商品认知。\n【3-6秒】人物自然穿戴、手持或使用商品，展示真实使用动作。\n【6-9秒】镜头推进展示商品的核心卖点、材质、纹理和细节。\n【9-12秒】展示完整使用效果，人物做出自然满意的动作，突出商品价值。\n整体风格真实、生活化、可信赖，适合普通消费者观看。",
  },
  {
    id: "feature-closeup",
    label: "卖点特写版",
    goal: "卖点展示",
    prompt: "请根据参考商品图生成一条突出产品卖点的带货短视频。\n【0-3秒】用清晰构图展示商品主体与使用场景。\n【3-6秒】通过手部操作或人物使用动作展示商品的主要功能。\n【6-9秒】使用近距离特写展示材质、纹理、结构、做工和关键细节。\n【9-12秒】回到完整商品效果，展示商品在实际场景中的使用价值。\n镜头重点突出产品细节，画面清晰、稳定、有质感，避免无意义的快速转场。",
  },
  {
    id: "premium-ad",
    label: "质感广告版",
    goal: "品牌质感",
    prompt: "请根据参考商品图生成一条具有高级感和广告质感的带货短视频。\n【0-3秒】通过具有氛围感的场景和光影展示商品，快速吸引注意力。\n【3-6秒】人物以自然、优雅的动作展示商品，镜头进行平滑移动。\n【6-9秒】通过慢速推进、局部特写和光影变化突出商品的材质与核心卖点。\n【9-12秒】展示商品与人物、场景的完整关系，形成具有记忆点的收尾画面。\n整体风格高级、简洁、具有品牌广告感，运镜流畅，画面构图精致。",
  },
];

const VIDEO_TEMPLATE_NO_TEXT_RULES =
  "画面中不得生成字幕、文字、水印、乱码或额外Logo。";

const OPTIMIZED_VIDEO_TEMPLATE_PROMPTS: Record<VideoTemplateId, string> = {
  "real-use": `请根据参考商品图生成一条真实自然的商品短视频，商品始终是画面核心。
镜头一：展示完整场景和商品，快速建立商品认知。
镜头二：人物自然穿戴、手持或使用商品，只突出一个主要卖点。
镜头三：镜头缓慢推进展示商品细节，再回到完整使用效果，自然收尾。`,
  "feature-closeup": `请根据参考商品图生成一条突出商品卖点的短视频，保持单一连续场景。
镜头一：清晰展示商品整体和使用环境。
镜头二：通过一个自然使用动作展示核心功能。
镜头三：用稳定的近景展示材质、纹理、结构和关键细节，最后回到完整商品。`,
  "premium-ad": `请根据参考商品图生成一条简洁高级的品牌广告感短视频，保持构图精致和运镜流畅。
镜头一：用干净有质感的场景展示完整商品。
镜头二：人物以自然克制的动作展示商品，保持商品完整可见。
镜头三：缓慢推进到材质和细节，再以完整商品与场景关系自然收尾。`,
};

const getAdaptiveVideoTimingRules = (shortVideoModel: boolean) => shortVideoModel
  ? "总长8-10秒，三个镜头。10秒：0-3秒展示，3-7秒使用，7-10秒特写收尾；8秒按比例压缩。镜头自然衔接，不要硬切。"
  : "三个镜头自然衔接：展示商品、使用商品、细节收尾。不强制精确秒数。";

const COMPACT_VIDEO_PRODUCT_RULES =
  "参考图商品保持原样：外形、颜色、材质、纹理、图案、Logo和比例不变，不增删部件。";

const COMPACT_VIDEO_CONTINUITY_RULES =
  "商品和人物保持一致，动作自然，镜头平滑。";

const SCENE_OPTIONS = [
  "室内生活使用场景",
  "户外通勤场景",
  "办公学习场景",
  "旅行户外场景",
  "运动健身场景",
  "家庭日常场景",
  "商业门店展示场景",
  "节日礼物场景",
  "模特展示场景",
  "大胆创意场景",
];

const OUTPUT_LANGUAGE_OPTIONS = [
  { id: "zh-CN", label: "中文", instruction: "Simplified Chinese" },
  { id: "en", label: "English", instruction: "English" },
  { id: "ms", label: "Bahasa Melayu", instruction: "Bahasa Melayu (Malay)" },
  { id: "th", label: "ไทย", instruction: "Thai" },
  { id: "ja", label: "日本語", instruction: "Japanese" },
  { id: "ko", label: "한국어", instruction: "Korean" },
  { id: "other", label: "其他语言", instruction: "the custom language specified by the customer" },
];

const PRODUCT_IDENTITY_RULES =
  "【产品一致性硬性规则】参考图中的原产品是画面核心主体，但允许加入人物、模特、手部或消费者作为辅助主体，用于穿着、手持、操作和展示产品。不得改变产品类别、主体外形轮廓、比例结构、颜色色调、材质纹理、图案文字、Logo、包装和关键细节；不得替换、重绘、添加或删除产品部件；人物不能遮挡产品关键细节。服装类商品必须保留原图的版型、裙摆或衣摆轮廓、长度、褶皱、缝线、格纹或印花的大小与排列、面料质感和边缘细节，不得借加入人物之机重新设计服装。只能增加合理的使用场景、人物互动、光线和镜头运动。若场景与产品外观冲突，优先保持产品原样。";

const PRODUCT_NEGATIVE_PROMPT =
  "改款，换色，换面料，改变裙摆或衣摆，改变长度，改变版型，改变格纹或印花，改变褶皱，改变缝线，改变边缘轮廓，重绘服装，产品变形，产品缺失细节，新增产品部件，人物遮挡产品，错误图案，错误材质，低清晰度";

const VIDEO_CONTINUITY_RULES =
  "【视频时间轴与连续性硬性规则】必须使用分段结构：（0-3秒）开场展示；（3-6秒）人物使用或互动；（6-9秒）产品细节与卖点；（9-12秒）完整效果和行动引导。若总时长不足，按实际时长压缩。全程保持同一个人物的脸部、发型、肤色、体型、服装和配饰一致；保持同一个产品的主体、颜色、纹理、材质、结构、Logo、包装和比例一致；人物嘴型、口型和说话状态要连续自然，不得嘴部变形、随机换脸或口型跳变；保持手指、四肢、人物与产品的相对位置连续。";

const FACE_RESTRICTED_VIDEO_RULES =
  "无脸人物兼容规则：当前视频模型不支持可识别人脸生成。人物只能以肩部以下、背影、侧后方、手部、身体局部、人体模特或自然剪裁出画面的方式出现；不得生成眼睛、鼻子、嘴巴或正面脸部特写；不得使用马赛克或明显的模糊遮脸效果。优先突出商品主体、版型、材质、纹理、裙摆和使用动作。";

const FACE_RESTRICTED_NEGATIVE_PROMPT =
  "可识别人脸，正面人像，眼睛，鼻子，嘴巴，脸部特写，完整五官，口型，换脸，畸形脸，马赛克，明显模糊遮脸";

const getVideoModelKey = (config: MultiApiConfig["video"]) =>
  `${config.provider || "custom"}:${config.selectedModel || "未指定模型"}`;

const isFaceRestrictedVideoModel = (config: MultiApiConfig["video"]) => {
  const model = `${config.provider || ""}:${config.selectedModel || ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  return model.includes("omniflash10s") || model.includes("veo31");
};

const isShortVideoModel = (config: MultiApiConfig["video"]) => {
  const model = `${config.provider || ""}:${config.selectedModel || ""}`.toLowerCase();
  return model.includes("veo") || model.includes("omni");
};

const removeFaceRestrictedRule = (prompt: string) =>
  prompt.split("\n\n无脸人物兼容规则：")[0].trim();

interface ProductAnalysis {
  productName?: string;
  visibleFeatures?: string[] | string;
  advantages?: string[] | string;
  sellingPoints?: string[] | string;
  scenes?: string[] | string;
  targetAudience?: string[] | string;
  imagePrompt?: string;
  videoPrompt?: string;
  script?: string;
}

interface ProductWorkflowPersistedState {
  step?: WorkflowStep;
  productImage?: string | null;
  outputLanguage?: string;
  customOutputLanguage?: string;
  analysis?: ProductAnalysis | null;
  selectedVideoTemplateId?: VideoTemplateId;
  productName?: string;
  sellingPoints?: string;
  scene?: string;
  imagePrompt?: string;
  script?: string;
  selectedImageId?: string;
  selectedImageUrl?: string;
  selectedImageVideoModel?: string;
}

const PRODUCT_WORKFLOW_STORAGE_KEY = "cloudstudio_product_workflow_v1";

const analysisValueToText = (value?: string[] | string) =>
  Array.isArray(value) ? value.join("、") : value?.trim() || "";

const cleanStoredCustomerProductName = (value?: string) =>
  value?.trim() === "图片中的商品" ? "" : value?.trim() || "";

const cleanStoredCustomerSellingPoints = (value?: string) => {
  const text = value?.trim() || "";
  return text.includes("AI 未返回结构化卖点") || text === "请根据图片确认商品卖点" ? "" : text;
};

function loadProductWorkflowState(storageKey = PRODUCT_WORKFLOW_STORAGE_KEY, migrateLegacy = false): ProductWorkflowPersistedState {
  if (typeof window === "undefined") return {};
  try {
    const saved = window.localStorage.getItem(storageKey) || (migrateLegacy ? window.localStorage.getItem(PRODUCT_WORKFLOW_STORAGE_KEY) : null);
    return saved ? (JSON.parse(saved) as ProductWorkflowPersistedState) : {};
  } catch {
    return {};
  }
}

const STEPS = [
  { id: 1 as const, label: "上传商品图片", icon: Package },
  { id: 2 as const, label: "生成商品素材", icon: ImageIcon },
  { id: 3 as const, label: "生成带货视频", icon: Video },
];

export const ProductWorkflowStudio: React.FC<ProductWorkflowStudioProps> = ({
  multiConfig,
  imageTasks,
  onSaveImageTasks,
  onSubmitTask,
  onOpenTaskLibrary,
  onUpdateVideoConfig,
  isSubmitting,
  activeTask,
  onTaskUpdated,
  storageNamespace,
}) => {
  const workflowImageTasks = imageTasks.filter((task) => task.source === "product-workflow");
  const workflowStorageKey = `${PRODUCT_WORKFLOW_STORAGE_KEY}:${storageNamespace || "default"}`;
  const [initialWorkflowState] = useState<ProductWorkflowPersistedState>(() => loadProductWorkflowState(workflowStorageKey, storageNamespace === "admin"));
  const [step, setStep] = useState<WorkflowStep>(() => initialWorkflowState.step || 1);
  const [productImage, setProductImage] = useState<string | null>(() => initialWorkflowState.productImage || null);
  const [outputLanguage, setOutputLanguage] = useState(() => initialWorkflowState.outputLanguage || "zh-CN");
  const [customOutputLanguage, setCustomOutputLanguage] = useState(() => initialWorkflowState.customOutputLanguage || "");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ProductAnalysis | null>(() => initialWorkflowState.analysis || null);
  const [selectedVideoTemplateId, setSelectedVideoTemplateId] = useState<VideoTemplateId>(() => initialWorkflowState.selectedVideoTemplateId || "real-use");
  const [scene, setScene] = useState(() => initialWorkflowState.scene || "");
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const sceneMenuRef = React.useRef<HTMLDivElement>(null);
  const [imagePrompt, setImagePrompt] = useState(() => initialWorkflowState.imagePrompt || "");
  const [script, setScript] = useState(() => initialWorkflowState.script || "");
  const [selectedImage, setSelectedImage] = useState<ImageTask | null>(() =>
    initialWorkflowState.selectedImageId
      ? workflowImageTasks.find((task) => task.id === initialWorkflowState.selectedImageId) || null
      : null
  );
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(() => {
    const storedUrl = normalizeImageUrl(initialWorkflowState.selectedImageUrl);
    if (storedUrl) return storedUrl;
    if (!initialWorkflowState.selectedImageId) return null;
    return normalizeImageUrl(workflowImageTasks.find((task) => task.id === initialWorkflowState.selectedImageId)?.imageUrl);
  });
  const [selectedImageVideoModel, setSelectedImageVideoModel] = useState<string | undefined>(initialWorkflowState.selectedImageVideoModel);
  const pendingRestoreImageId = React.useRef(initialWorkflowState.selectedImageId);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [videoPrefill, setVideoPrefill] = useState<{
    prompt: string;
    imageUrl: string;
    mode: "image-to-video";
    aspectRatio: "9:16";
    outputLanguage?: string;
  } | undefined>();

  React.useEffect(() => {
    if (!sceneMenuOpen) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!sceneMenuRef.current?.contains(target)) setSceneMenuOpen(false);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [sceneMenuOpen]);

  const selectedLanguage = OUTPUT_LANGUAGE_OPTIONS.find((option) => option.id === outputLanguage) || OUTPUT_LANGUAGE_OPTIONS[0];
  const requestedLanguage = outputLanguage === "other" && customOutputLanguage.trim()
    ? customOutputLanguage.trim()
    : selectedLanguage.instruction;

  const productName = analysisValueToText(analysis?.productName) || "图片中的商品";
  const sellingPoints = [
    analysisValueToText(analysis?.sellingPoints),
    analysisValueToText(analysis?.advantages),
  ].filter(Boolean).join("；") || "根据产品图中的真实特点与用户价值进行展示";
  const selectedImageSource = normalizeImageUrl(selectedImage?.imageUrl) || selectedImageUrl;
  const currentVideoModelKey = getVideoModelKey(multiConfig.video);
  const faceRestricted = isFaceRestrictedVideoModel(multiConfig.video);
  const imagePromptWithoutFaceRule = removeFaceRestrictedRule(imagePrompt);
  const imageCompatibilityPrompt = !imagePromptWithoutFaceRule || !faceRestricted
    ? imagePromptWithoutFaceRule
    : `${imagePromptWithoutFaceRule}\n\n${FACE_RESTRICTED_IMAGE_RULES}`;
  const imageCompatibilityNegativePrompt = faceRestricted
    ? `${PRODUCT_NEGATIVE_PROMPT}，${FACE_RESTRICTED_NEGATIVE_PROMPT}`
    : PRODUCT_NEGATIVE_PROMPT;
  const applyVideoModelCompatibility = (prompt: string) => {
    const basePrompt = removeFaceRestrictedRule(prompt);
    if (!basePrompt) return basePrompt;
    return faceRestricted ? `${basePrompt}\n\n${FACE_RESTRICTED_VIDEO_RULES}` : basePrompt;
  };

  const generatedProductName = (sourceAnalysis = analysis) =>
    analysisValueToText(sourceAnalysis?.productName) || "图片中的商品";

  const generatedSellingPoints = (sourceAnalysis = analysis) => {
    const points = [
      analysisValueToText(sourceAnalysis?.sellingPoints),
      analysisValueToText(sourceAnalysis?.advantages),
    ].filter(Boolean);
    return points.join("；") || "根据产品图中的真实特点与用户价值进行展示";
  };

  const buildProductPrompt = (sourceAnalysis = analysis) =>
    `商品：${generatedProductName(sourceAnalysis)}。商品卖点：${generatedSellingPoints(sourceAnalysis)}。场景：${scene.trim()}。生成一张适合短视频带货的商品场景图，商品是核心主体，允许加入自然的人物、模特或手部互动来展示使用效果，保持商品外观、颜色、纹理和包装细节准确，人物不能遮挡产品关键区域，画面真实自然，竖屏构图。`;

  const buildScript = (sourceAnalysis = analysis) =>
    `视频提示词必须按时间轴组织：\n（0-3秒）开场展示${generatedProductName(sourceAnalysis)}，快速建立商品认知。\n（3-6秒）人物或模特自然使用、穿着或手持产品，展示${generatedSellingPoints(sourceAnalysis)}。\n（6-9秒）切换产品细节特写，展示材质、纹理和关键卖点。\n（9-12秒）展示完整使用效果并加入自然的带货行动引导。`;

  const buildTemplatePrompt = (templateId = selectedVideoTemplateId, sourceAnalysis = analysis) => {
    const template = VIDEO_TEMPLATE_OPTIONS.find((option) => option.id === templateId) || VIDEO_TEMPLATE_OPTIONS[0];
    const optimizedTemplatePrompt = OPTIMIZED_VIDEO_TEMPLATE_PROMPTS[template.id];
    const timingRules = getAdaptiveVideoTimingRules(isShortVideoModel(multiConfig.video));
    if (optimizedTemplatePrompt) {
      return `${optimizedTemplatePrompt}\n\n${timingRules}\n\n商品：${generatedProductName(sourceAnalysis)}。核心卖点：${generatedSellingPoints(sourceAnalysis)}。使用场景：${scene.trim() || "根据商品特点选择合适的生活化场景"}。\n\n${VIDEO_TEMPLATE_NO_TEXT_RULES}`;
    }
    return `${template.prompt}\n\n商品：${generatedProductName(sourceAnalysis)}。核心卖点：${generatedSellingPoints(sourceAnalysis)}。使用场景：${scene.trim() || "根据商品特点自动选择最合适的生活化场景"}。\n\n${VIDEO_TEMPLATE_NO_TEXT_RULES}`;
  };

  const lockProductIdentity = (prompt: string) =>
    prompt.includes("产品一致性硬性规则") ? prompt : `${prompt.trim()}\n\n${PRODUCT_IDENTITY_RULES}`;

  const lockVideoContinuity = (prompt: string) =>
    prompt.includes("视频时间轴与连续性硬性规则") ? prompt : `${prompt.trim()}\n\n${VIDEO_CONTINUITY_RULES}`;

  const lockShortVideoPrompt = (prompt: string) =>
    prompt.includes("视频总时长约8-10秒") || prompt.includes("三个连续镜头")
      ? prompt.trim()
      : lockVideoContinuity(prompt);

  const buildCompactVideoPrompt = (templateId = selectedVideoTemplateId) => {
    const promptParts = [
      buildTemplatePrompt(templateId),
      COMPACT_VIDEO_PRODUCT_RULES,
      COMPACT_VIDEO_CONTINUITY_RULES,
    ];
    return promptParts.join("\n\n").trim();
  };

  const buildSelectedVideoPrompt = (templateId = selectedVideoTemplateId) =>
    buildCompactVideoPrompt(templateId);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(workflowStorageKey, JSON.stringify({
        step,
        productImage: productImage && productImage.length <= 4_000_000 ? productImage : null,
        outputLanguage,
        customOutputLanguage,
        analysis,
        selectedVideoTemplateId,
        scene,
        imagePrompt,
        script,
        selectedImageId: selectedImage?.id,
        selectedImageUrl: selectedImageSource || undefined,
        selectedImageVideoModel,
      } satisfies ProductWorkflowPersistedState));
      if (storageNamespace === "admin") window.localStorage.removeItem(PRODUCT_WORKFLOW_STORAGE_KEY);
    } catch {
      // Large images or restricted storage must not interrupt the workflow.
    }
  }, [workflowStorageKey, step, productImage, outputLanguage, customOutputLanguage, analysis, selectedVideoTemplateId, scene, imagePrompt, script, selectedImage, selectedImageSource, selectedImageVideoModel]);

  React.useEffect(() => {
    const restoreId = pendingRestoreImageId.current;
    if (!restoreId) return;
    const restoredTask = workflowImageTasks.find((task) => task.id === restoreId);
    if (!restoredTask) return;
    pendingRestoreImageId.current = undefined;
    setSelectedImage(restoredTask);
    const restoredUrl = normalizeImageUrl(restoredTask.imageUrl);
    if (restoredUrl) setSelectedImageUrl(restoredUrl);
  }, [workflowImageTasks]);

  React.useEffect(() => {
    if (step === 3 && !selectedImageSource) {
      setStep(2);
    }
  }, [step, selectedImageSource]);

  React.useEffect(() => {
    if (step === 3 && selectedImageSource) {
      const nextPrompt = buildSelectedVideoPrompt();
      setVideoPrefill((current) => {
        if (current?.imageUrl === selectedImageSource && current.prompt === nextPrompt) return current;
        return {
          prompt: nextPrompt,
          imageUrl: selectedImageSource,
          mode: "image-to-video",
          aspectRatio: "9:16",
          outputLanguage,
        };
      });
    }
  }, [step, selectedImageSource, script, productName, sellingPoints, selectedVideoTemplateId, outputLanguage]);

  const getSelectedSceneValues = () =>
    scene
      .split(/[；,，]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const handleSceneOptionToggle = (sceneOption: string) => {
    setScene(sceneOption);
    setSceneMenuOpen(false);
  };

  const resetGeneratedWorkflow = () => {
    setAnalysis(null);
    setScene("");
    setImagePrompt("");
    setScript("");
    setSelectedImage(null);
    setSelectedImageUrl(null);
    setSelectedImageVideoModel(undefined);
    setVideoPrefill(undefined);
    setPreviewImage(null);
    pendingRestoreImageId.current = undefined;
    setStep(1);
  };

  const handleOutputLanguageChange = (nextLanguage: string) => {
    if (nextLanguage === outputLanguage) return;
    if (analysis || step > 1) resetGeneratedWorkflow();
    setOutputLanguage(nextLanguage);
  };

  const handleCustomOutputLanguageChange = (value: string) => {
    if (outputLanguage === "other" && (analysis || step > 1)) resetGeneratedWorkflow();
    setCustomOutputLanguage(value);
  };

  const handleVideoTemplateChange = (templateId: VideoTemplateId) => {
    setSelectedVideoTemplateId(templateId);
    const nextPrompt = buildSelectedVideoPrompt(templateId);
    setScript(nextPrompt);
    if (selectedImageSource) {
      setVideoPrefill({
        prompt: nextPrompt,
        imageUrl: selectedImageSource,
        mode: "image-to-video",
        aspectRatio: "9:16",
        outputLanguage,
      });
    }
  };

  const handleReplaceProductImage = () => {
    resetGeneratedWorkflow();
    setProductImage(null);
  };

  const handleProductImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      alert("产品图片不能超过 15MB");
      return;
    }
    const optimizedImage = await optimizeImageFile(file);
    {
      resetGeneratedWorkflow();
      setProductImage(optimizedImage);
    }
  };

  const handleAnalyzeProduct = async () => {
    if (!productImage || isAnalyzing) {
      if (!productImage) alert("请先上传一张产品图片");
      return;
    }
    setIsAnalyzing(true);
    const languageInstruction = `Output language: ${requestedLanguage}. Write all product analysis values, selling points, scene suggestions, image prompts, video prompts, and scripts in this language. Keep JSON keys exactly as requested. Keep brand names, product models, trademarks, and labels unchanged. Do not generate subtitles, captions, watermarks, or random text. Be concise: return key points only, no reasoning or explanations. Use at most 3 items per list, keep each item under 12 words, keep imagePrompt under 80 words, and keep videoPrompt/script under 120 words. Do not repeat product identity, continuity, face, or no-text rules because the app adds those rules automatically.`;
    try {
      const data = await fetchJson<{ response?: string; error?: string }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: multiConfig.chat.provider,
          apiUrl: multiConfig.chat.apiUrl,
          apiKey: multiConfig.chat.apiKey,
          model: multiConfig.chat.selectedModel,
          messages: [{ role: "system", content: languageInstruction }, {
            role: "user",
            content: "请先完成商品分析，再生成提示词。第一部分必须提取图片中能够确认的商品类别、外观特征、材质、功能、可见卖点和用户利益；卖点要写成商品能为用户带来的好处，不要只写颜色、构图或摄影语言。第二部分推荐 2 到 4 个真实适合的使用场景，并说明每个场景适合展示什么优势。第三部分生成 imagePrompt：必须保留原商品的外观、颜色、结构和包装，不得凭空改变商品，只增加合适的生活化使用场景。第四部分生成 videoPrompt：描述商品展示动作、使用动作、镜头运动和带货节奏。只返回 JSON，不要 Markdown，格式为：{\"productName\":\"\",\"visibleFeatures\":[\"\"],\"advantages\":[\"\"],\"sellingPoints\":[\"\"],\"scenes\":[\"场景：适合展示的优势\"],\"targetAudience\":[\"\"],\"imagePrompt\":\"保留原商品外观并放入生活化场景的图像提示词\",\"videoPrompt\":\"商品带货视频提示词\",\"script\":\"短视频文案\"}。不能编造图片中看不出来的参数；看不清或无法确认的内容写为未知。",
            imageUrl: productImage,
          }],
          systemInstruction: "你是电商商品视觉分析师和短视频导演。先分析商品事实和用户利益，再写场景图与视频提示词。卖点必须和商品用途或用户收益有关，不能把颜色、光线、构图当成卖点；imagePrompt 必须保留原商品，不得把商品改成另一种产品，同时可以安排人物、模特、手部或消费者自然使用和展示商品。只根据图片中能确认的信息回答，卖点不确定时使用谨慎措辞。",
          temperature: 0.4,
        }),
      });
      if (!data.response) throw new Error(data.error || "AI 没有返回分析结果");
      const cleaned = data.response.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      let analysis: ProductAnalysis;
      try {
        analysis = JSON.parse(cleaned) as ProductAnalysis;
      } catch {
        analysis = {
          productName: "图片中的商品",
          visibleFeatures: cleaned,
          advantages: "AI 未返回结构化卖点，请根据图片和商品实际情况确认",
          sellingPoints: "",
          scenes: "干净明亮的生活化商品展示场景",
          imagePrompt: "",
          videoPrompt: "",
          script: "",
        };
      }
      setAnalysis(analysis);
      const scenes = Array.isArray(analysis.scenes) ? analysis.scenes.join("；") : analysis.scenes || "干净明亮的商品展示场景";
      const selectedSceneText = scene.trim() || scenes;
      setScene(selectedSceneText);
      setImagePrompt(applyVideoModelCompatibility(lockProductIdentity(`${analysis.imagePrompt || buildProductPrompt(analysis)}\n\n重点展示场景：${selectedSceneText}。`)));
      setScript(applyVideoModelCompatibility(lockVideoContinuity(lockProductIdentity(analysis.videoPrompt || analysis.script || buildScript(analysis)))));
      setStep(2);
    } catch (error: any) {
      alert(`产品分析失败：${error.message || "请检查对话接口配置"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStart = () => {
    if (!productImage) {
      alert("请先上传一张产品图片");
      return;
    }
    if (!analysis) {
      void handleAnalyzeProduct();
      return;
    }
    const selectedSceneText = scene.trim() || "干净明亮的生活化商品展示场景";
    setScene(selectedSceneText);
    setImagePrompt(applyVideoModelCompatibility(lockProductIdentity(`${analysis.imagePrompt || buildProductPrompt(analysis)}\n\n重点展示场景：${selectedSceneText}。`)));
    setScript(applyVideoModelCompatibility(lockVideoContinuity(lockProductIdentity(analysis.videoPrompt || analysis.script || buildScript(analysis)))));
    setStep(2);
  };

  const handleImageGenerated = (task: ImageTask) => {
    const imageUrl = normalizeImageUrl(task.imageUrl);
    if (!imageUrl) return;
    const completedTask = { ...task, imageUrl };
    setSelectedImage(completedTask);
    setSelectedImageUrl(imageUrl);
    setSelectedImageVideoModel(currentVideoModelKey);
    setStep(3);
    const nextPrompt = buildSelectedVideoPrompt();
    setScript(nextPrompt);
    setVideoPrefill({
      prompt: nextPrompt,
      imageUrl,
      mode: "image-to-video",
      aspectRatio: "9:16",
      outputLanguage,
    });
  };

  const formatAnalysisValue = (value?: string[] | string) =>
    Array.isArray(value) ? value.join("、") : value || "未识别到，请手动确认";

  const handleStepClick = (targetStep: WorkflowStep) => {
    if (targetStep < step) {
      setStep(targetStep);
      return;
    }

    if (targetStep !== step + 1) return;
    if (step === 1 && productImage) handleStart();
    if (step === 2 && selectedImageSource) {
      if (selectedImageVideoModel && selectedImageVideoModel !== currentVideoModelKey) {
        alert("当前视频模型已变化，请重新生成兼容当前模型的商品图片");
        return;
      }
      setStep(3);
    }
  };

  return (
    <div className="product-workflow-shell">
      <div className="product-workflow-page space-y-6">
      <section className="product-workflow-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="product-workflow-header__eyebrow mb-2 inline-flex items-center gap-2 rounded-full border border-[#0084FF]/30 bg-[#0084FF]/10 px-3 py-1 text-xs font-semibold text-[#0084FF]">
              <Sparkles className="h-3.5 w-3.5" />
              商品短视频工作流
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">从商品图片到带货视频</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">上传一张商品图，AI 会自动识别商品特点、推荐场景并生成带货视频素材。</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          {STEPS.map(({ id, label, icon: Icon }) => {
            const imageReadyForCurrentVideo = Boolean(selectedImageSource) && (!selectedImageVideoModel || selectedImageVideoModel === currentVideoModelKey);
            const canOpen = id <= step || (id === step + 1 && (step === 1 ? Boolean(productImage) : imageReadyForCurrentVideo));
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleStepClick(id)}
                disabled={!canOpen}
                aria-current={step === id ? "step" : undefined}
                className={`flex items-center gap-2 rounded-lg border-b-2 bg-white px-3 pb-3 pt-2.5 text-left text-xs font-semibold shadow-sm ring-1 ring-slate-200/80 transition-colors ${
                  step >= id
                    ? "border-[#0084FF] text-[#0084FF]"
                    : canOpen
                      ? "border-slate-200 text-slate-500 hover:border-[#0084FF]/50 hover:text-[#0084FF]"
                      : "cursor-not-allowed border-slate-200 text-slate-400"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step > id ? "bg-emerald-500 text-white" : step === id ? "bg-[#0084FF] text-white" : "bg-slate-100 text-slate-400"}`}>
                  {step > id ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{id}</span>
              </button>
            );
          })}
        </div>
      </section>

      {step === 1 && (
        <section className="product-workflow-step product-workflow-step--setup mx-auto max-w-3xl rounded-[24px] border border-white/90 bg-white/85 p-6 shadow-xl shadow-blue-500/5 backdrop-blur-2xl sm:p-8">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-bold text-slate-800">上传产品图片</label>
              {productImage ? (
                <div className="relative overflow-hidden rounded-2xl border border-[#0084FF]/30 bg-slate-100">
                  <img src={productImage} alt="产品预览" onClick={() => setPreviewImage(productImage)} className="max-h-80 w-full cursor-zoom-in object-contain" />
                  <button type="button" onClick={handleReplaceProductImage} className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-white">重新上传</button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 px-4 py-10 text-center hover:border-[#0084FF] hover:bg-[#0084FF]/5">
                  <Upload className="mb-2 h-7 w-7 text-[#0084FF]" />
                  <span className="text-sm font-semibold text-slate-800">点击上传一张产品图</span>
                  <span className="mt-1 text-xs text-slate-500">AI 会自动识别商品卖点和适合的使用场景</span>
                  <input type="file" accept="image/*" onChange={handleProductImageUpload} className="hidden" />
                </label>
              )}
            </div>
            <div className="product-workflow-language-panel rounded-2xl border border-[#0084FF]/20 bg-[#0084FF]/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="product-output-language" className="text-xs font-bold text-slate-800">生成语言</label>
                <span className="text-[11px] text-slate-500">卖点、提示词和旁白统一使用</span>
              </div>
              <select
                id="product-output-language"
                value={outputLanguage}
                onChange={(event) => handleOutputLanguageChange(event.target.value)}
                className="home-glass-input w-full px-4 py-3 text-sm text-slate-900"
              >
                {OUTPUT_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              {outputLanguage === "other" && (
                <input
                  value={customOutputLanguage}
                  onChange={(event) => handleCustomOutputLanguageChange(event.target.value)}
                  placeholder="请输入语言名称，例如：越南语"
                  className="home-glass-input mt-2 w-full px-4 py-3 text-sm text-slate-900"
                />
              )}
            </div>
            <div className="product-workflow-scene-panel relative rounded-2xl border border-[#0084FF]/20 bg-[#0084FF]/5 p-4" ref={sceneMenuRef}>
              <label className="mb-2 block text-xs font-bold text-slate-800">希望展示的场景</label>
              <div className="relative">
                <input
                  value={scene}
                  onChange={(event) => setScene(event.target.value)}
                  onClick={() => setSceneMenuOpen(true)}
                  placeholder="可选，不填写时由 AI 自动推荐场景"
                  className="home-glass-input w-full px-4 py-3 pr-12 text-sm text-slate-900"
                />
                <button
                  type="button"
                  aria-label="选择展示场景"
                  aria-expanded={sceneMenuOpen}
                  onClick={() => setSceneMenuOpen((open) => !open)}
                  className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-[#0084FF]"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${sceneMenuOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {sceneMenuOpen && (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10">
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <span className="text-xs font-bold text-slate-800">选择场景（单选）</span>
                    <span className="text-[11px] text-slate-500">
                      已选 {scene.trim() ? 1 : 0} 个
                    </span>
                  </div>
                  <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                    {SCENE_OPTIONS.map((sceneOption) => {
                      const isSelected = getSelectedSceneValues().includes(sceneOption);
                      return (
                        <label
                          key={sceneOption}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition ${isSelected ? "border-[#0084FF]/50 bg-[#0084FF]/10 text-slate-900" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-[#0084FF]/40"}`}
                        >
                          <input
                            type="radio"
                            name="product-scene"
                            checked={isSelected}
                            onChange={() => handleSceneOptionToggle(sceneOption)}
                            className="h-4 w-4 shrink-0 accent-[#0084FF]"
                          />
                          <span>{sceneOption}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSceneMenuOpen(false)}
                    className="mt-3 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
                  >
                    完成选择
                  </button>
                </div>
              )}
            </div>
            <button type="button" onClick={handleAnalyzeProduct} disabled={isAnalyzing || !productImage} className="product-workflow-analyze-button flex w-full items-center justify-center gap-2 rounded-[16px] bg-[#0084FF] px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#0084FF]/25 transition hover:bg-[#0070e0] disabled:cursor-not-allowed disabled:opacity-50">
              {isAnalyzing ? "AI 正在识别产品并生成方案..." : "AI 自动分析并生成方案"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className={`product-workflow-step product-workflow-step--image space-y-4 ${analysis ? "product-workflow-image-step product-workflow-image-step--with-analysis" : ""}`}>
          {analysis && (
            <div className="product-workflow-analysis rounded-[20px] border border-emerald-500/20 bg-emerald-50/80 p-5 text-sm text-slate-700">
              <div className="font-bold text-slate-900">AI 商品分析结果</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><div className="text-[11px] font-semibold text-emerald-700">商品识别</div><p className="mt-1">{analysis.productName || productName}</p></div>
                <div><div className="text-[11px] font-semibold text-emerald-700">适用人群</div><p className="mt-1">{formatAnalysisValue(analysis.targetAudience)}</p></div>
                <div><div className="text-[11px] font-semibold text-emerald-700">可见特征</div><p className="mt-1">{formatAnalysisValue(analysis.visibleFeatures)}</p></div>
                <div><div className="text-[11px] font-semibold text-emerald-700">卖点和用户优势</div><p className="mt-1">{formatAnalysisValue(analysis.sellingPoints)}{analysis.advantages ? `；${formatAnalysisValue(analysis.advantages)}` : ""}</p></div>
                <div className="sm:col-span-2"><div className="text-[11px] font-semibold text-emerald-700">推荐使用场景</div><p className="mt-1">{formatAnalysisValue(analysis.scenes)}</p></div>
              </div>
            </div>
          )}
          <div className="product-workflow-image-studio">
            <ImageStudio
              imageConfig={multiConfig.image}
              chatConfig={multiConfig.chat}
              onImageGenerated={handleImageGenerated}
              tasks={workflowImageTasks}
              taskSource="product-workflow"
              showAiWriter={false}
              onSaveTasks={(workflowTasks) => {
                onSaveImageTasks([
                  ...workflowTasks,
                  ...imageTasks.filter((task) => task.source !== "product-workflow"),
                ]);
              }}
              prefilledPrompt={{ prompt: imageCompatibilityPrompt, style: "photorealistic", aspectRatio: "9:16", referenceImage: productImage || undefined, negativePrompt: imageCompatibilityNegativePrompt }}
            />
          </div>
        </section>
      )}

      {step === 3 && selectedImageSource && (
        <section className="product-workflow-step product-workflow-step--video space-y-5">
          {(isSubmitting || activeTask?.status === "pending" || activeTask?.status === "processing") && (
            <div className="product-video-generation-notice" role="status" aria-live="polite">
              <div className="product-video-generation-notice__icon"><Video className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <strong>视频生成中</strong>
                <p>请移至任务库查看生成进度和最终结果。</p>
              </div>
              {onOpenTaskLibrary && (
                <button type="button" onClick={onOpenTaskLibrary} className="product-video-generation-notice__action">
                  查看任务库 <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <div className="hidden product-workflow-template-gallery rounded-[24px] border border-white/90 bg-white/85 p-5 shadow-xl shadow-blue-500/5 backdrop-blur-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">选择视频版本</h3>
                <p className="mt-1 text-xs text-slate-500">选择一个方向，下面的时间轴提示词会自动更新</p>
              </div>
              <span className="rounded-full bg-[#0084FF]/10 px-2.5 py-1 text-[10px] font-semibold text-[#0084FF]">三选一</span>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {VIDEO_TEMPLATE_OPTIONS.map((template, index) => {
                const isSelected = selectedVideoTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleVideoTemplateChange(template.id)}
                    className={`min-h-24 rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-[#0084FF] bg-[#0084FF]/10 shadow-md shadow-[#0084FF]/15"
                        : "border-slate-200 bg-white/70 hover:border-[#0084FF]/50 hover:bg-[#0084FF]/5"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold ${isSelected ? "text-[#0084FF]" : "text-slate-800"}`}>
                        版本 {index + 1} · {template.label}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-[#0084FF]" />}
                    </div>
                    <span className="mt-2 block text-[11px] text-slate-500">{template.goal}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <VideoStudio
            apiConfig={multiConfig.video}
            chatConfig={multiConfig.chat}
            videoTemplateOptions={VIDEO_TEMPLATE_OPTIONS}
            selectedVideoTemplateId={selectedVideoTemplateId}
            onVideoTemplateChange={(templateId) => handleVideoTemplateChange(templateId as VideoTemplateId)}
            onUpdateApiConfig={onUpdateVideoConfig}
            onSubmitTask={onSubmitTask}
            taskSource="product-workflow"
            isSubmitting={isSubmitting}
            hideModeSwitcher
            activeTask={activeTask}
            onTaskUpdated={onTaskUpdated}
            prefilledPrompt={videoPrefill || {
              prompt: buildSelectedVideoPrompt(),
              imageUrl: selectedImageSource,
              mode: "image-to-video",
              aspectRatio: "9:16",
              outputLanguage,
            }}
          />
        </section>
      )}

      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
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
            alt="放大后的商品图片"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-[min(92vw,900px)] object-contain"
          />
        </div>
      )}
      </div>

    </div>
  );
};
