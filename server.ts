import express from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, GenerateVideosOperation } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Allow the GitHub Pages frontend to call this separately hosted API server.
const frontendOrigin = process.env.FRONTEND_ORIGIN;
app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (!frontendOrigin || requestOrigin === frontendOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin || "*");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Helper to instantiate GoogleGenAI lazily
function getGenAIClient(apiKey?: string) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Helper function to check if a URL is a valid video URL (excluding images, endpoints & schemas)
function isValidVideoUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("data:video/")) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.includes("schema.org") ||
    lower.includes("w3.org") ||
    lower.includes("docs.") ||
    lower.includes("swagger") ||
    lower.includes("github.com")
  ) {
    return false;
  }

  // Filter out API route/status endpoints which are not actual video files
  const cleanPath = lower.split("?")[0].split("#")[0];
  const isDirectVideoExt =
    cleanPath.endsWith(".mp4") ||
    cleanPath.endsWith(".webm") ||
    cleanPath.endsWith(".mov") ||
    cleanPath.endsWith(".m3u8") ||
    trimmed.startsWith("data:video/");

  if (!isDirectVideoExt) {
    if (
      cleanPath.includes("/status") ||
      cleanPath.includes("/query") ||
      cleanPath.includes("/generate") ||
      cleanPath.includes("/tasks") ||
      cleanPath.includes("/jobs") ||
      cleanPath.includes("/callback") ||
      cleanPath.includes("/detail")
    ) {
      return false;
    }
  }

  // Filter out pure static image extensions
  const pureImageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".bmp", ".ico"];
  if (pureImageExts.some((ext) => cleanPath.endsWith(ext))) {
    return false;
  }

  // Filter out pure image indicator paths unless direct video extensions exist
  if (
    cleanPath.includes("cover") ||
    cleanPath.includes("thumbnail") ||
    cleanPath.includes("avatar") ||
    cleanPath.includes("poster") ||
    cleanPath.includes("preview") ||
    cleanPath.includes("icon")
  ) {
    if (!isDirectVideoExt) {
      return false;
    }
  }

  return true;
}

// Helper function to thoroughly extract video URL from various JSON response formats
function extractVideoUrl(data: any): string | undefined {
  if (!data) return undefined;

  if (typeof data === "string") {
    return isValidVideoUrl(data) ? data.trim() : undefined;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      const url = extractVideoUrl(item);
      if (url) return url;
    }
    return undefined;
  }

  if (typeof data === "object") {
    // 1. Direct check of common video field names
    const preferredKeys = [
      "video_url",
      "videoUrl",
      "video_uri",
      "videoUri",
      "mp4_url",
      "mp4",
      "media_url",
      "mediaUrl",
      "file_url",
      "fileUrl",
      "output_url",
      "outputUrl",
      "download_url",
      "downloadUrl",
      "result_url",
      "resultUrl",
      "cdn_url",
      "play_url",
      "src",
    ];

    for (const key of preferredKeys) {
      const val = data[key];
      if (typeof val === "string" && isValidVideoUrl(val)) {
        return val.trim();
      }
    }

    // 2. Scan preferred nested objects first
    const preferredObjKeys = ["data", "result", "output", "response", "video", "videos", "media", "task_result"];
    for (const key of preferredObjKeys) {
      if (data[key] && typeof data[key] === "object") {
        const found = extractVideoUrl(data[key]);
        if (found) return found;
      }
    }

    // 3. Only scan string properties if they strictly end with video extensions or data URLs
    for (const key of Object.keys(data)) {
      if (preferredObjKeys.includes(key) || preferredKeys.includes(key)) continue;
      // Skip API config keys that might be present in debug responses
      if (key.includes("apiUrl") || key.includes("targetUrl") || key.includes("endpoint") || key.includes("statusUrl")) continue;

      const val = data[key];
      if (typeof val === "object" && val !== null) {
        const found = extractVideoUrl(val);
        if (found) return found;
      } else if (typeof val === "string") {
        const lowerVal = val.trim().toLowerCase();
        if (
          lowerVal.endsWith(".mp4") ||
          lowerVal.endsWith(".webm") ||
          lowerVal.endsWith(".mov") ||
          lowerVal.endsWith(".m3u8") ||
          lowerVal.startsWith("data:video/")
        ) {
          if (isValidVideoUrl(val)) return val.trim();
        }
      }
    }
  }

  return undefined;
}

// Helper to extract Task/Operation ID from API response
function extractTaskId(data: any): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const keys = [
    "id",
    "task_id",
    "taskId",
    "operation",
    "operation_id",
    "operationId",
    "operationName",
    "job_id",
    "jobId",
    "request_id",
    "requestId",
    "uuid",
  ];

  for (const k of keys) {
    const val = data[k];
    if (val && (typeof val === "string" || typeof val === "number")) {
      const strVal = String(val).trim();
      if (strVal && !strVal.startsWith("http://") && !strVal.startsWith("https://")) {
        return strVal;
      }
    }
  }

  const subObjs = [data.data, data.result, data.output, data.response];
  for (const sub of subObjs) {
    if (sub && typeof sub === "object") {
      const found = extractTaskId(sub);
      if (found) return found;
    }
  }

  return undefined;
}

// Helper to check if API response is a route not found error
function isInvalidRouteResponse(data: any): boolean {
  if (!data || typeof data !== "object") return true;

  const code = Number(data.code || data.status || data.statusCode);
  if (code === 404 || code === 405 || code === 400 || code === 500) {
    return true;
  }

  const msg = String(data.message || data.msg || data.error || data.detail || "").toLowerCase();
  if (
    msg.includes("not found") ||
    msg.includes("invalid route") ||
    msg.includes("route not found") ||
    msg.includes("cannot get") ||
    msg.includes("cannot post") ||
    msg.includes("unsupported endpoint") ||
    msg.includes("does not exist")
  ) {
    return true;
  }

  return false;
}

// 1. Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 2. Preset Endpoints Info
app.get("/api/presets", (_req, res) => {
  res.json({
    presets: [
      {
        id: "google-veo",
        name: "Google Veo (Built-in GenAI)",
        description: "Google 官方高质量视频生成模型 (veo-3.1-lite / veo-3.1)",
        defaultUrl: "https://generativelanguage.googleapis.com",
        supportsImageToVideo: true,
        supportsPromptEnhancer: true,
        models: ["veo-3.1-lite-generate-preview", "veo-3.1-generate-preview"],
      },
      {
        id: "openai-sora",
        name: "OpenAI Sora API / Compatible",
        description: "OpenAI 官方及 OpenAI 格式第三方中转 API",
        defaultUrl: "https://api.openai.com/v1/videos/generations",
        supportsImageToVideo: true,
        supportsPromptEnhancer: true,
        models: ["sora-1.0", "sora-turbo"],
      },
      {
        id: "runway-gen3",
        name: "Runway Gen-3 Alpha",
        description: "Runway 电影级画面视频生成 API",
        defaultUrl: "https://api.runwayml.com/v1/tasks",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["gen3a_turbo"],
      },
      {
        id: "luma-dream-machine",
        name: "Luma Dream Machine",
        description: "Luma AI 极速高逼真视频生成 API",
        defaultUrl: "https://api.lumalabs.ai/dream-machine/v1/generations",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["dream-machine-v1"],
      },
      {
        id: "minimax-video",
        name: "MiniMax 海螺视频",
        description: "MiniMax 高逼真动作与人物视频 API",
        defaultUrl: "https://api.minimax.chat/v1/video_generation",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["video-01"],
      },
      {
        id: "kling-ai",
        name: "Kling AI 快手可灵",
        description: "可灵 AI 视频生成 REST API 接口",
        defaultUrl: "https://api.klingai.com/v1/videos/text2video",
        supportsImageToVideo: true,
        supportsPromptEnhancer: false,
        models: ["kling-v1", "kling-v1-5"],
      },
      {
        id: "custom-rest",
        name: "自定义通用 REST 接口",
        description: "支持任意格式的自定义 API 接口代理",
        defaultUrl: "",
        supportsImageToVideo: true,
        supportsPromptEnhancer: true,
        models: ["custom-model"],
      },
    ],
  });
});

// 3. AI Prompt Polish & Expansion Route
app.post("/api/enhance-prompt", async (req, res) => {
  try {
    const { prompt, style, cameraMotion, type = "image", targetLanguage = "zh", apiKey, chatConfig } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "提示词不能为空" });
      return;
    }

    const systemInstruction = type === "video"
      ? `你是一位顶级 AI 视频导演与视觉艺术专家（专精 Veo, Sora, Runway, Kling 等视频大模型）。
请将用户的原始描述扩充为具备极高画质与专业运镜的视频生成 Prompt。
要求：
1. 丰富主体姿态与动态动作、背景空间细节与环境光影。
2. 加入专业运镜语言（如：${cameraMotion || "镜头平滑推进、微距特写、戏剧性打光"}）。
3. 描述画面美感与质感（如：${style || "电影级质感、物理真实光影、细腻纹理、无噪点"}）。
4. 必须直接输出润色后的最佳提示词文本，不要包含任何多余解释、问候或 Markdown 代码块。`
      : `你是一位顶级 AI 商业摄影师与视觉美学大师（专精 Midjourney, Flux, Imagen 等图像大模型）。
请将用户的初始画面概念描述扩充为一个具备极高细节与艺术感官的专业图像 Prompt。
要求：
1. 丰富主体的材质细节、造型面部、服饰动态与情感氛围。
2. 描述环境空间、构图层次、背景与自然光线。
3. 强化光影打光与艺术风格（如：${style || "写实摄影、自然大片光影、体积光、细腻纹理、8K超清画质"}）。
4. 必须直接输出润色后的精炼最佳提示词文本，不要包含任何多余解释、前缀标号或 Markdown 代码块。`;

    const userContent = `原始描述: "${prompt}"\n艺术风格: "${style || "无"}"\n运镜指示: "${cameraMotion || "无"}"\n输出语言: "${targetLanguage}"`;

    let enhancedPrompt: string | null = null;

    // A. Try Gemini API
    const ai = getGenAIClient(apiKey || chatConfig?.apiKey);
    if (ai) {
      enhancedPrompt = await callGeminiGenerateText(ai, systemInstruction, userContent, 0.7);
    }

    // B. Try Chat API proxy if Gemini didn't return text
    if (!enhancedPrompt && chatConfig && chatConfig.apiKey) {
      try {
        const chatRes = await fetch(resolveChatTargetUrl(chatConfig.provider, chatConfig.apiUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${chatConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: chatConfig.selectedModel || "gpt-4o-mini",
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: userContent },
            ],
            temperature: 0.7,
            stream: false,
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const reply = chatData?.choices?.[0]?.message?.content?.trim();
          if (reply && reply.length > 5) {
            enhancedPrompt = reply.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
          }
        }
      } catch (cErr: any) {
        console.warn("[Enhance Prompt] Chat API proxy failed:", cErr?.message || cErr);
      }
    }

    // C. Smart Dynamic Enhancer Fallback
    if (!enhancedPrompt) {
      const styleSuffix = style ? `，${style}` : "，电影级光影质感";
      const cameraSuffix = cameraMotion ? `，${cameraMotion}` : "";
      if (type === "video") {
        enhancedPrompt = `${prompt}${styleSuffix}${cameraSuffix}，主体与环境细节生动逼真，超清8K画质，动态流畅连贯，极致视觉冲击力`;
      } else {
        enhancedPrompt = `${prompt}${styleSuffix}，高精细节刻画，自然光影透射，极佳景深与构图，超写实质感，8K分辨率`;
      }
    }

    res.json({ enhancedPrompt });
  } catch (err: any) {
    console.error("Enhance prompt error:", err);
    res.status(500).json({
      error: err.message || "提示词润色失败",
      enhancedPrompt: req.body.prompt,
    });
  }
});

// Helper for calling Gemini with fallback models
async function callGeminiGenerateText(
  ai: GoogleGenAI,
  systemInstruction: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<string | null> {
  const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.5-pro"];
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction,
          temperature,
        },
      });
      const text = response.text?.trim();
      if (text && text.length > 3) {
        return text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
      }
    } catch (e: any) {
      console.warn(`[Gemini Text] Model ${model} failed:`, e?.message || e);
    }
  }
  return null;
}

function resolveChatTargetUrl(provider: string, apiUrl?: string): string {
  if (apiUrl?.trim()) return apiUrl.trim();

  const builtInUrls: Record<string, string> = {
    "openai-chat": "https://api.openai.com/v1/chat/completions",
    "anthropic-claude": "https://api.anthropic.com/v1/messages",
    "deepseek-chat": "https://api.deepseek.com/v1/chat/completions",
    "ycvip-chat": "https://ycvip.net/v1/chat/completions",
  };

  return builtInUrls[provider] || "https://api.openai.com/v1/chat/completions";
}

function resolveImageTargetUrl(provider: string, apiUrl?: string): string {
  if (apiUrl?.trim()) return apiUrl.trim();
  if (provider === "flux-ycvip") return "https://ycvip.net/v1/images/generations";
  return "https://api.openai.com/v1/images/generations";
}

function resolveVideoTargetUrl(provider: string, apiUrl?: string): string | undefined {
  if (apiUrl?.trim()) return apiUrl.trim();

  const builtInUrls: Record<string, string> = {
    "ycvip-grok": "https://ycvip.net/v1/media/generate",
    "openai-sora": "https://api.openai.com/v1/videos/generations",
    "runway-gen3": "https://api.runwayml.com/v1/tasks",
    "luma-dream-machine": "https://api.lumalabs.ai/dream-machine/v1/generations",
    "minimax-video": "https://api.minimax.chat/v1/video_generation",
    "kling-ai": "https://api.klingai.com/v1/videos/text2video",
  };

  return builtInUrls[provider];
}

// 3.1 AI Prompt Writer Assistant Route (AI 帮写提示词)
app.post("/api/ai-writer-prompt", async (req, res) => {
  try {
    const { topic, theme, cameraPreference, targetLanguage = "zh", apiKey, chatConfig } = req.body;
    if (!topic) {
      res.status(400).json({ error: "创意主题或想法不能为空" });
      return;
    }

    const systemInstruction = `你是一位顶级 AI 视频生成导播与视觉艺术专家（专精 Google Veo、OpenAI Sora、Runway 等核心模型）。
你的任务是根据用户的灵感点子或短语，自动帮写出一段具备极高连贯性、画面美感、逼真物理与动作细节的专业 AI 视频生成提示词 (Prompt)。

撰写要求：
1. **画面主体与动态**：细节生动，动作流畅逼真。
2. **环境空间与光影**：精准构图，丰富的空间质感与符合主题的光影效果 (${theme || "电影大片氛围"})。
3. **镜头运镜**：体现专业电影镜头语言 (${cameraPreference || "平滑推镜头"})。
4. **输出规范**：直接输出完整的一段精炼提示词段落，不要带有标签、说明文字或 Markdown 列表。
如果目标语言为英文 (en)，请生成精湛英文提示词；如果为中文 (zh)，请生成高水准中文提示词。`;

    const userContent = `创意主题: "${topic}"\n期望氛围风格: "${theme || "默认"}"\n运镜偏好: "${
      cameraPreference || "默认"
    }"\n语言: "${targetLanguage}"`;

    let generatedPrompt: string | null = null;

    // A. Try Gemini
    const ai = getGenAIClient(apiKey || chatConfig?.apiKey);
    if (ai) {
      generatedPrompt = await callGeminiGenerateText(ai, systemInstruction, userContent, 0.8);
    }

    // B. Try Chat API proxy if Gemini unavailable
    if (!generatedPrompt && chatConfig && chatConfig.apiKey) {
      try {
        const chatRes = await fetch(resolveChatTargetUrl(chatConfig.provider, chatConfig.apiUrl), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${chatConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: chatConfig.selectedModel || "gpt-4o-mini",
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: userContent },
            ],
            temperature: 0.8,
            stream: false,
          }),
        });

        if (chatRes.ok) {
          const chatData = await chatRes.json();
          const reply = chatData?.choices?.[0]?.message?.content?.trim();
          if (reply && reply.length > 5) {
            generatedPrompt = reply.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
          }
        }
      } catch (cErr: any) {
        console.warn("[AI Writer Prompt] Chat API proxy failed:", cErr?.message || cErr);
      }
    }

    // C. Dynamic Fallback
    if (!generatedPrompt) {
      generatedPrompt = `${topic}，${theme || "电影级视觉质感"}，${
        cameraPreference || "镜头平滑推近"
      }，高清8K质感，极具视觉冲击力与逼真细节，画面连贯自然`;
    }

    res.json({ generatedPrompt });
  } catch (err: any) {
    console.error("AI Writer prompt error:", err);
    res.status(500).json({
      error: err.message || "AI 帮写提示词生成失败",
      generatedPrompt: req.body.topic,
    });
  }
});

function extractMessageFromObject(obj: any): { text: string; reasoning: string; error?: string } {
  if (!obj) return { text: "", reasoning: "" };
  if (typeof obj === "string") return { text: obj, reasoning: "" };

  const error = obj.error?.message || obj.error?.details || (typeof obj.error === "string" ? obj.error : "");
  let text = "";
  let reasoning = "";

  const choices = Array.isArray(obj.choices) ? obj.choices : [];
  if (choices.length > 0) {
    const choice = choices[0];
    const target = choice.delta || choice.message || choice;

    if (typeof target === "string") {
      text = target;
    } else if (typeof target.content === "string") {
      text = target.content;
    } else if (Array.isArray(target.content)) {
      text = target.content
        .map((item: any) => (typeof item === "string" ? item : item?.text || item?.content || ""))
        .join("");
    } else if (typeof target.text === "string") {
      text = target.text;
    } else if (typeof choice.text === "string") {
      text = choice.text;
    }

    if (typeof target.reasoning_content === "string") {
      reasoning = target.reasoning_content;
    } else if (typeof target.reasoning === "string") {
      reasoning = target.reasoning;
    } else if (typeof target.thinking === "string") {
      reasoning = target.thinking;
    }
  } else {
    if (typeof obj.content === "string") text = obj.content;
    else if (Array.isArray(obj.content)) {
      text = obj.content
        .map((item: any) => (typeof item === "string" ? item : item?.text || ""))
        .join("");
    } else if (typeof obj.response === "string") text = obj.response;
    else if (typeof obj.text === "string") text = obj.text;
    else if (typeof obj.output === "string") text = obj.output;

    if (typeof obj.reasoning_content === "string") reasoning = obj.reasoning_content;
    else if (typeof obj.reasoning === "string") reasoning = obj.reasoning;
  }

  return { text, reasoning, error };
}

function parseProxyResponseBody(rawText: string): string {
  const trimmedRaw = rawText.trim();
  if (!trimmedRaw) return "（接口未返回内容）";

  // 1. Try single JSON
  try {
    const json = JSON.parse(trimmedRaw);
    const { text, reasoning, error } = extractMessageFromObject(json);
    if (error) return `接口错误: ${error}`;

    let result = "";
    if (reasoning) result += `> 💭 思考过程:\n${reasoning}\n\n`;
    if (text) result += text;

    if (result) return result;
    return typeof json === "string" ? json : JSON.stringify(json);
  } catch (_) {}

  // 2. Stream / SSE lines / line-by-line parsing
  const lines = trimmedRaw.split(/\r?\n/);
  let accumulatedText = "";
  let accumulatedReasoning = "";
  let lastError = "";

  for (const line of lines) {
    const l = line.trim();
    if (!l || l.startsWith(":")) continue;

    let payload = l;
    if (l.startsWith("data:")) {
      payload = l.slice(5).trim();
    }

    if (payload === "[DONE]" || payload === "DONE" || payload === "data: [DONE]") continue;

    try {
      const parsed = JSON.parse(payload);
      const { text, reasoning, error } = extractMessageFromObject(parsed);
      if (error) lastError = error;
      if (text) accumulatedText += text;
      if (reasoning) accumulatedReasoning += reasoning;
    } catch (_) {
      if (!l.startsWith("data:") && !l.startsWith("event:")) {
        accumulatedText += l + "\n";
      }
    }
  }

  let finalReply = "";
  if (accumulatedReasoning.trim()) {
    finalReply += `> 💭 思考过程:\n${accumulatedReasoning.trim()}\n\n`;
  }
  if (accumulatedText.trim()) {
    finalReply += accumulatedText.trim();
  } else if (lastError) {
    finalReply = `接口报错: ${lastError}`;
  } else {
    // Sanitize any leftover raw SSE formatting or [DONE] markers
    finalReply = trimmedRaw
      .replace(/^data:\s*/gm, "")
      .replace(/\[DONE\]/g, "")
      .trim();
  }

  if (!finalReply || finalReply === "[DONE]") {
    finalReply = "（上游接口完成响应，但未接收到有效文本）";
  }

  return finalReply;
}

// 3.2 AI Chat / Dialogue Endpoint (支持自定义接口与 API Key)
app.post("/api/chat", async (req, res) => {
  try {
    const {
      messages = [],
      systemInstruction = "你是一位博学、严谨且富有创造力的 AI 智能对话助理。",
      temperature = 0.7,
      provider = "google-gemini",
      apiUrl,
      apiKey,
      model = "gemini-3.6-flash",
    } = req.body;

    if (!messages || messages.length === 0) {
      res.status(400).json({ error: "消息列表不能为空" });
      return;
    }

    // Google Gemini GenAI
    if (provider === "google-gemini" || (!apiUrl && model.includes("gemini"))) {
      const ai = getGenAIClient(apiKey);
      if (!ai) {
        res.status(400).json({
          error: "未配置 Gemini API Key，请在顶部【接口配置】中设置正确的 API Key。",
        });
        return;
      }

      const contents = messages.map((m: any) => {
        const img = m.imageUrl || m.image_url;
        const textContent = m.content || "";
        const parts: any[] = [{ text: textContent }];
        if (img) {
          parts.push({ text: `\n[用户提供图片/参考图 URL: ${img}]` });
        }
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts,
        };
      });

      const response = await ai.models.generateContent({
        model: model || "gemini-3.6-flash",
        contents,
        config: {
          systemInstruction,
          temperature: Number(temperature) || 0.7,
        },
      });

      res.json({
        success: true,
        response: response.text || "（未收到模型响应文本）",
        provider: "google-gemini",
      });
      return;
    }

    // C. OpenAI / Anthropic / Custom REST proxy format
    const targetUrl = resolveChatTargetUrl(provider, apiUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["x-api-key"] = apiKey;
    }

    const formattedMessages = [
      ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
      ...messages.map((m: any) => {
        const imageUrl = m.imageUrl || m.image_url;
        if (imageUrl && m.role === "user") {
          return {
            role: m.role,
            content: [
              {
                type: "text",
                text: m.content || "描述这张图片",
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          };
        }
        return {
          role: m.role,
          content: m.content,
        };
      }),
    ];

    const activeModel = model || "gpt-5.6-luna";
    const reqBodyBase = {
      model: activeModel,
      messages: formattedMessages,
      temperature: Number(temperature) || 0.7,
    };

    let replyContent: string | undefined = undefined;

    // Helper to send chat fetch
    const tryFetchChat = async (requestModel: string, isStream: boolean) => {
      const resp = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...reqBodyBase,
          model: requestModel,
          stream: isStream,
        }),
      });
      return resp;
    };

    // Attempt 1: Stream mode with requested model
    let proxyRes = await tryFetchChat(activeModel, true);
    
    // Attempt 2: If stream failed (non-200), try non-stream mode with requested model
    if (!proxyRes.ok) {
      const streamErrText = await proxyRes.text();
      // If error is all_vendors_failed and model is not gpt-4o-mini, try gpt-4o-mini fallback
      if ((streamErrText.includes("all_vendors_failed") || streamErrText.includes("no available candidates")) && activeModel !== "gpt-4o-mini") {
        console.warn(`[Chat Proxy] Model '${activeModel}' failed with all_vendors_failed. Retrying with fallback model 'gpt-4o-mini'...`);
        proxyRes = await tryFetchChat("gpt-4o-mini", false);
      } else {
        proxyRes = await tryFetchChat(activeModel, false);
      }

      if (!proxyRes.ok) {
        const finalErrText = await proxyRes.text();
        if (finalErrText.includes("all_vendors_failed") || finalErrText.includes("no available candidates")) {
          throw new Error(`上游服务商未提供该模型（${activeModel}）的可用中转通道（all_vendors_failed）。请在顶部【接口配置】中更换模型（如 gpt-4o-mini / deepseek-chat），或切换为 Gemini 官方接口。`);
        }
        throw new Error(`Chat API 响应异常 (${proxyRes.status}): ${finalErrText.slice(0, 250)}`);
      }
    }

    let rawText = await proxyRes.text();
    replyContent = parseProxyResponseBody(rawText);

    // Attempt 3: If response body had no content, try non-stream
    if (!replyContent || replyContent === "（上游接口完成响应，但未接收到有效文本）") {
      try {
        const retryRes = await tryFetchChat(activeModel, false);
        if (retryRes.ok) {
          const retryText = await retryRes.text();
          const retryReply = parseProxyResponseBody(retryText);
          if (retryReply && retryReply !== "（上游接口完成响应，但未接收到有效文本）") {
            replyContent = retryReply;
          }
        }
      } catch (retryErr) {
        console.error("Chat retry with stream: false failed:", retryErr);
      }
    }

    res.json({
      success: true,
      response: replyContent,
      provider: provider || "custom-chat",
    });
  } catch (err: any) {
    console.error("Chat API error:", err);
    res.status(500).json({ error: err.message || "对话接口调用失败" });
  }
});

// 3.3 AI Image Generation Endpoint (支持自定义接口与 API Key)
app.post("/api/generate-image", async (req, res) => {
  try {
    const {
      prompt,
      negativePrompt,
      aspectRatio = "1:1",
      style,
      provider = "google-imagen",
      apiUrl,
      apiKey,
      model = "imagen-3.0-generate-002",
      referenceImage,
    } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "绘图提示词不能为空" });
      return;
    }

    // Google Imagen GenAI
    if (provider === "google-imagen" || (!apiUrl && model.includes("imagen"))) {
      const ai = getGenAIClient(apiKey);
      if (!ai) {
        res.status(400).json({
          error: "未配置 Gemini API Key，请在顶部【接口配置】中设置正确的 API Key。",
        });
        return;
      }

      let fullPrompt = prompt;
      if (style) fullPrompt += `, in ${style} style`;
      if (negativePrompt) fullPrompt += `, avoid: ${negativePrompt}`;

      // Enhance prompt with reference image visual elements via Gemini vision model if provided
      if (referenceImage && typeof referenceImage === "string") {
        try {
          const mimeMatch = referenceImage.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (mimeMatch) {
            const [, mimeType, base64Data] = mimeMatch;
            const visionRes = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [
                {
                  role: "user",
                  parts: [
                    { inlineData: { mimeType, data: base64Data } },
                    { text: `Analyze the visual style, subject, composition, and color palette of this reference image. Synthesize a concise image generation prompt in English that blends these reference visual elements with the user request: "${prompt}". Return ONLY the resulting prompt text.` }
                  ]
                }
              ]
            });
            const synthesizedPrompt = visionRes.text?.trim();
            if (synthesizedPrompt) {
              fullPrompt = synthesizedPrompt;
            }
          }
        } catch (refErr) {
          console.warn("Failed to synthesize reference image prompt with Gemini vision model, using original prompt:", refErr);
        }
      }

      const selectedModel = model.includes("imagen") ? model : "imagen-3.0-generate-002";

      let base64Img: string | undefined;
      try {
        const response = await ai.models.generateImages({
          model: selectedModel,
          prompt: fullPrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: "image/jpeg",
            aspectRatio: aspectRatio === "16:9" ? "16:9" : aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:3" ? "4:3" : aspectRatio === "3:4" ? "3:4" : "1:1",
          },
        });
        base64Img = response.generatedImages?.[0]?.image?.imageBytes;
      } catch (primaryErr: any) {
        console.warn(`Primary Imagen model (${selectedModel}) failed:`, primaryErr?.message || primaryErr);
        // Fallback to imagen-3.0-fast-generate-001 if primary model fails
        if (selectedModel !== "imagen-3.0-fast-generate-001") {
          try {
            const fallbackRes = await ai.models.generateImages({
              model: "imagen-3.0-fast-generate-001",
              prompt: fullPrompt,
              config: {
                numberOfImages: 1,
                outputMimeType: "image/jpeg",
                aspectRatio: aspectRatio === "16:9" ? "16:9" : aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:3" ? "4:3" : aspectRatio === "3:4" ? "3:4" : "1:1",
              },
            });
            base64Img = fallbackRes.generatedImages?.[0]?.image?.imageBytes;
          } catch (fallbackErr: any) {
            throw new Error(`Google Imagen 绘图失败: ${primaryErr?.message || fallbackErr?.message || "请确认 API Key 是否具备 Imagen 权限"}`);
          }
        } else {
          throw new Error(`Google Imagen 绘图失败: ${primaryErr?.message || "请确认 API Key 是否具备 Imagen 权限"}`);
        }
      }

      if (base64Img) {
        res.json({
          success: true,
          imageUrl: `data:image/jpeg;base64,${base64Img}`,
          provider: "google-imagen",
          prompt,
        });
        return;
      } else {
        throw new Error("Imagen 接口未返回有效图片数据，请确认提示词未触发安全过滤。");
      }
    }

    // C. OpenAI DALL-E / Custom REST API Proxy
    const targetUrl = resolveImageTargetUrl(provider, apiUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["x-api-key"] = apiKey;
    }

    let size = "1024x1024";
    if (aspectRatio === "16:9") size = "1792x1024";
    else if (aspectRatio === "9:16") size = "1024x1792";

    let fullPrompt = prompt;
    if (style) fullPrompt += `, ${style} style`;
    if (negativePrompt) fullPrompt += `, avoid: ${negativePrompt}`;

    const isYcvipOrCustom =
      !targetUrl.includes("api.openai.com") ||
      (model && (model.includes("gpt-image") || model.includes("flux") || model.includes("midjourney")));

    // Build payload according to endpoint provider specifications
    const requestPayload: Record<string, any> = {
      model: model || "gpt-image-2",
      prompt: fullPrompt,
      n: 1,
      size,
      response_format: "url",
    };

    if (isYcvipOrCustom) {
      if (referenceImage) {
        requestPayload.mode = "image-edit";
        requestPayload.quality = "low";
        requestPayload.images = [referenceImage];
        requestPayload.image_url = referenceImage;
        requestPayload.reference_image = referenceImage;
      } else {
        requestPayload.quality = "low";
      }
    } else if (referenceImage) {
      requestPayload.image_url = referenceImage;
    }

    const targetRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload),
    });

    if (!targetRes.ok) {
      const errText = await targetRes.text();
      throw new Error(`图像 API 接口状态异常 (${targetRes.status}): ${errText.slice(0, 200)}`);
    }

    const data: any = await targetRes.json();
    let resultUrl =
      data.data?.[0]?.url ||
      (data.data?.[0]?.b64_json ? `data:image/png;base64,${data.data[0].b64_json}` : null) ||
      data.image_url ||
      data.url ||
      data.result;

    if (!resultUrl) {
      // Fallback search
      resultUrl = extractVideoUrl(data);
    }

    if (!resultUrl) {
      throw new Error("图像 API 返回结果中未解析到有效图片 URL");
    }

    res.json({
      success: true,
      imageUrl: resultUrl,
      provider: provider || "custom-image",
      prompt,
    });
  } catch (err: any) {
    console.error("Generate image error:", err);
    res.status(500).json({ error: err.message || "图像生成请求失败" });
  }
});

// 4. AI Video Generation & Sync Task Manager Architecture

interface ServerTaskRecord {
  taskId: string;
  operationName: string;
  provider: string;
  model: string;
  prompt: string;
  mode: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  apiKey?: string;
  apiUrl?: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  hasExplicitProgress?: boolean;
  stage: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  lastPolledAt?: number;
  cachedStatusUrl?: string;
  cachedStatusMethod?: "GET" | "POST";
  rawResponse?: any;
}

class ServerVideoTaskManager {
  private tasks = new Map<string, ServerTaskRecord>();

  register(record: Partial<ServerTaskRecord> & { operationName: string; provider: string }): ServerTaskRecord {
    const taskId = record.taskId || record.operationName;
    const now = Date.now();
    const existing = this.tasks.get(taskId) || this.tasks.get(record.operationName);

    const fullRecord: ServerTaskRecord = {
      taskId,
      operationName: record.operationName,
      provider: record.provider,
      model: record.model || "veo-3.1",
      prompt: record.prompt || "",
      mode: record.mode || "text-to-video",
      aspectRatio: record.aspectRatio,
      resolution: record.resolution,
      duration: record.duration,
      apiKey: record.apiKey,
      apiUrl: record.apiUrl,
      status: record.status || (record.videoUrl ? "completed" : "processing"),
      progress: record.progress !== undefined ? record.progress : (record.videoUrl ? 100 : 0),
      hasExplicitProgress: record.hasExplicitProgress !== undefined ? record.hasExplicitProgress : existing?.hasExplicitProgress,
      stage: record.stage || (record.videoUrl ? "上游生成已完成" : "任务已创建，正在与上游集群对接..."),
      videoUrl: record.videoUrl,
      thumbnailUrl: record.thumbnailUrl,
      error: record.error,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      cachedStatusUrl: record.cachedStatusUrl || existing?.cachedStatusUrl,
      cachedStatusMethod: record.cachedStatusMethod || existing?.cachedStatusMethod,
      rawResponse: record.rawResponse || existing?.rawResponse,
    };

    this.tasks.set(taskId, fullRecord);
    if (record.operationName !== taskId) {
      this.tasks.set(record.operationName, fullRecord);
    }
    return fullRecord;
  }

  get(id?: string): ServerTaskRecord | undefined {
    if (!id) return undefined;
    return this.tasks.get(id);
  }

  update(id: string, updates: Partial<ServerTaskRecord>): ServerTaskRecord | undefined {
    const record = this.tasks.get(id);
    if (!record) return undefined;
    Object.assign(record, updates, { updatedAt: Date.now() });
    return record;
  }
}

const videoTaskManager = new ServerVideoTaskManager();

// 4.1 Create Video Generation Task Route
app.post("/api/generate-video", async (req, res) => {
  try {
    const {
      mode = "text-to-video",
      provider = "google-veo",
      apiUrl,
      apiKey,
      prompt,
      negativePrompt,
      image, // { data: base64, mimeType: string }
      lastFrame,
      aspectRatio = "16:9",
      resolution = "720p",
      duration = 5,
      cameraMotion,
      style,
      model = "veo-3.1-lite-generate-preview",
    } = req.body;

    if (!prompt && !image) {
      res.status(400).json({ error: "请输入提示词或上传初始图片" });
      return;
    }

    // A. Simulation Mode Task Creation
    if (provider === "simulation") {
      const mockOpName = `mock_op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const taskRecord = videoTaskManager.register({
        taskId: mockOpName,
        operationName: mockOpName,
        provider: "simulation",
        model,
        prompt: prompt || "模拟生成视频",
        mode,
        aspectRatio,
        resolution,
        duration,
        status: "processing",
        progress: 10,
        stage: "模拟算力节点初始化中...",
      });

      res.json({
        success: true,
        provider: "simulation",
        taskId: taskRecord.taskId,
        operationName: taskRecord.operationName,
        status: "processing",
        progress: 10,
        stage: taskRecord.stage,
      });
      return;
    }

    // B. Google Veo Integration
    if (provider === "google-veo") {
      const ai = getGenAIClient(apiKey);
      if (!ai) {
        res.status(400).json({
          error: "尚未配置 Gemini API Key，请在顶部【接口配置】中设置正确的 API Key。",
        });
        return;
      }

      let imagePayload = undefined;
      if (image && image.data) {
        const cleanData = image.data.replace(/^data:image\/\w+;base64,/, "");
        imagePayload = {
          imageBytes: cleanData,
          mimeType: image.mimeType || "image/png",
        };
      }

      let finalPrompt = prompt || "";
      if (style) finalPrompt += `, ${style} style`;
      if (cameraMotion) finalPrompt += `, camera motion: ${cameraMotion}`;
      if (negativePrompt) finalPrompt += `. Avoid: ${negativePrompt}`;

      const selectedModel = model.includes("veo") ? model : "veo-3.1-lite-generate-preview";

      const config: any = {
        numberOfVideos: 1,
        resolution: resolution === "1080p" ? "1080p" : "720p",
        aspectRatio: aspectRatio === "9:16" ? "9:16" : "16:9",
      };

      if (lastFrame && lastFrame.data) {
        config.lastFrame = {
          imageBytes: lastFrame.data.replace(/^data:image\/\w+;base64,/, ""),
          mimeType: lastFrame.mimeType || "image/png",
        };
      }

      const operation = await ai.models.generateVideos({
        model: selectedModel,
        prompt: finalPrompt,
        image: imagePayload,
        config,
      });

      const taskRecord = videoTaskManager.register({
        taskId: operation.name,
        operationName: operation.name,
        provider: "google-veo",
        model: selectedModel,
        prompt: prompt || "",
        mode,
        apiKey,
        aspectRatio,
        resolution,
        duration,
        status: "processing",
        progress: 10,
        stage: "任务已成功提交至 Google Veo 算力节点...",
      });

      res.json({
        success: true,
        provider: "google-veo",
        taskId: taskRecord.taskId,
        operationName: taskRecord.operationName,
        status: "processing",
        progress: 10,
        stage: taskRecord.stage,
      });
      return;
    }

    // C. REST API / YCVIP / Grok / Sora / Kling / MiniMax Integration
    const targetUrl = resolveVideoTargetUrl(provider, apiUrl);
    const isYcvipMedia = provider === "ycvip-grok" || (targetUrl && targetUrl.includes("ycvip.net")) || model.includes("grok") || model.includes("sora") || model.includes("veo");

    if (targetUrl) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
          headers["x-api-key"] = apiKey;
        }

        let payload: any;
        if (isYcvipMedia) {
          payload = {
            model: model || "veo-3.1",
            prompt: prompt,
            params: {
              aspect_ratio: aspectRatio || "9:16",
              duration: String(duration || 8),
              quality: "快速",
              resolution: resolution ? resolution.toLowerCase() : "720p",
              mode: mode === "image-to-video" ? "first-frame" : "text-to-video",
              images: image && image.data ? [image.data] : []
            }
          };
        } else {
          payload = {
            model,
            prompt,
            negative_prompt: negativePrompt,
            aspect_ratio: aspectRatio,
            resolution,
            duration,
            image_url: image ? image.data : undefined,
            camera_motion: cameraMotion,
          };
        }

        const targetRes = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!targetRes.ok) {
          const errText = await targetRes.text();
          throw new Error(`上游接口创建失败 (${targetRes.status}): ${errText.slice(0, 200) || targetRes.statusText}`);
        }

        const data: any = await targetRes.json();
        const extractedUrl = extractVideoUrl(data);
        const taskName =
          extractTaskId(data) || data.id || data.task_id || data.operation_id || data.operationName || data.name || `task_${Date.now()}`;

        const statusStr = String(data.status || data.state || data.task_status || "").toLowerCase();
        const isExplicitDone = ["completed", "success", "succeeded", "finished", "done"].includes(statusStr) || data.done === true;
        const isDirectVideoAvailable = isExplicitDone && Boolean(extractedUrl);

        // Pre-determine status URL if ycvip or standard REST pattern
        let initialCachedStatusUrl: string | undefined = undefined;
        if (isYcvipMedia) {
          initialCachedStatusUrl = `https://ycvip.net/v1/media/status/${taskName}`;
        }

        const taskRecord = videoTaskManager.register({
          taskId: taskName,
          operationName: taskName,
          provider: isYcvipMedia ? "ycvip-grok" : (provider || "custom"),
          model,
          prompt: prompt || "",
          mode,
          apiUrl: targetUrl,
          apiKey,
          aspectRatio,
          resolution,
          duration,
          status: isDirectVideoAvailable ? "completed" : "processing",
          progress: isDirectVideoAvailable ? 100 : 15,
          stage: isDirectVideoAvailable ? "上游生成已完成" : "已完成上游集群节点调度，正在生成关键帧...",
          videoUrl: isDirectVideoAvailable ? extractedUrl : undefined,
          cachedStatusUrl: initialCachedStatusUrl,
          rawResponse: data,
        });

        res.json({
          success: true,
          provider: taskRecord.provider,
          taskId: taskRecord.taskId,
          operationName: taskRecord.operationName,
          status: taskRecord.status,
          progress: taskRecord.progress,
          stage: taskRecord.stage,
          directVideoUrl: isDirectVideoAvailable ? extractedUrl : undefined,
          rawResponse: data,
        });
      } catch (proxyErr: any) {
        console.error("Upstream API generate video error:", proxyErr);
        res.status(502).json({
          error: `调用上游 API 失败: ${proxyErr.message}`,
        });
      }
      return;
    }

    res.status(400).json({ error: "未知的服务商类型或缺少 API 接口配置" });
  } catch (err: any) {
    console.error("Generate video route error:", err);
    res.status(500).json({ error: err.message || "视频生成任务创建失败" });
  }
});

// 4.2 Query & Synchronize Video Status Route
app.post("/api/video-status", async (req, res) => {
  try {
    const { provider = "google-veo", operationName, taskId: reqTaskId, apiKey, apiUrl, progress: clientProgress } = req.body;
    const lookupId = reqTaskId || operationName;

    if (!lookupId) {
      res.status(400).json({ error: "缺少任务标识 (operationName 或 taskId)" });
      return;
    }

    // 1. Resolve or Register Task Record in Server State Manager
    let task = videoTaskManager.get(lookupId);
    if (!task) {
      task = videoTaskManager.register({
        taskId: lookupId,
        operationName: lookupId,
        provider: provider || "custom",
        apiKey,
        apiUrl,
        status: "processing",
        progress: Number(clientProgress) || 10,
        stage: "正在恢复并与上游节点进行同步...",
      });
    } else {
      // Update config if updated credentials provided by client
      if (apiKey) task.apiKey = apiKey;
      if (apiUrl) task.apiUrl = apiUrl;
    }

    // 2. Return cached terminal state if already completed or failed
    if (task.status === "completed" && task.videoUrl) {
      res.json({
        done: true,
        failed: false,
        progress: 100,
        stage: task.stage || "上游生成已完成",
        videoUrl: task.videoUrl,
        thumbnailUrl: task.thumbnailUrl,
      });
      return;
    }

    if (task.status === "failed") {
      res.json({
        done: false,
        failed: true,
        error: task.error || "上游生成失败",
        stage: task.stage || "任务执行异常",
      });
      return;
    }

    // 3. Deduplicate rapid polling requests (< 1000ms threshold)
    const now = Date.now();
    if (task.lastPolledAt && (now - task.lastPolledAt < 1000)) {
      res.json({
        done: task.status === "completed",
        failed: false,
        progress: task.progress,
        stage: task.stage,
        videoUrl: task.videoUrl,
        error: task.error,
      });
      return;
    }

    task.lastPolledAt = now;

    // A. Simulation Mode Sync
    if (task.provider === "simulation" || lookupId.startsWith("mock_op_")) {
      const elapsedSeconds = (now - task.createdAt) / 1000;
      if (elapsedSeconds < 10) {
        const prog = Math.min(98, Math.round((elapsedSeconds / 10) * 100));
        let stage = "正在构建 3D 神经网络潜空间...";
        if (prog > 30) stage = "正在生成关键帧光影与动作矢量...";
        if (prog > 60) stage = "正在进行帧间插值与平滑渲染...";
        if (prog > 85) stage = "正在合成高码率视频编码...";

        videoTaskManager.update(task.taskId, { progress: prog, stage });
        res.json({
          done: false,
          progress: prog,
          stage,
          elapsedSeconds: Math.round(elapsedSeconds),
        });
        return;
      }

      const mockVideos = [
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
        "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      ];
      const selectedVideo = mockVideos[Math.abs(lookupId.length) % mockVideos.length];

      videoTaskManager.update(task.taskId, {
        status: "completed",
        progress: 100,
        stage: "视频生成完成！",
        videoUrl: selectedVideo,
        thumbnailUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80",
      });

      res.json({
        done: true,
        progress: 100,
        stage: "视频生成完成！",
        videoUrl: selectedVideo,
      });
      return;
    }

    // B. Google Veo Status Sync
    if (task.provider === "google-veo") {
      const ai = getGenAIClient(apiKey || task.apiKey);
      if (!ai) {
        res.status(400).json({ error: "缺少 Gemini API Key" });
        return;
      }

      const op = new GenerateVideosOperation();
      op.name = task.operationName;
      const updated = await ai.operations.getVideosOperation({ operation: op });

      if (updated.done) {
        if (updated.error) {
          const errMsg = String((updated.error as any)?.message || "Google Veo 渲染失败");
          videoTaskManager.update(task.taskId, {
            status: "failed",
            error: errMsg,
            stage: "Google Veo 任务失败",
          });
          res.json({
            done: false,
            failed: true,
            error: errMsg,
            stage: "Google Veo 任务失败",
          });
          return;
        }

        const videoObj = updated.response?.generatedVideos?.[0]?.video;
        const finalUrl = videoObj?.uri || `/api/video-download?operationName=${encodeURIComponent(task.operationName)}`;
        videoTaskManager.update(task.taskId, {
          status: "completed",
          progress: 100,
          hasExplicitProgress: true,
          stage: "Google Veo 渲染成功",
          videoUrl: finalUrl,
        });

        res.json({
          done: true,
          failed: false,
          progress: 100,
          hasExplicitProgress: true,
          stage: "Google Veo 渲染成功",
          videoUrl: finalUrl,
        });
      } else {
        videoTaskManager.update(task.taskId, {
          hasExplicitProgress: false,
          stage: "Google Veo 算力节点渲染中...",
        });

        res.json({
          done: false,
          failed: false,
          hasExplicitProgress: false,
          progress: task.progress || 0,
          stage: "Google Veo 算力节点渲染中...",
        });
      }
      return;
    }

    // C. REST API / YCVIP / Sora / Custom Provider Upstream Sync
    if (lookupId.startsWith("http://") || lookupId.startsWith("https://") || lookupId.startsWith("data:video/")) {
      videoTaskManager.update(task.taskId, {
        status: "completed",
        progress: 100,
        stage: "渲染完成",
        videoUrl: lookupId,
      });

      res.json({
        done: true,
        failed: false,
        progress: 100,
        stage: "渲染完成",
        videoUrl: lookupId,
      });
      return;
    }

    const targetApiUrl = apiUrl || task.apiUrl || (task.provider === "ycvip-grok" ? "https://ycvip.net/v1/media/generate" : "https://ycvip.net/v1/media/generate");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const effectiveKey = apiKey || task.apiKey;
    if (effectiveKey) {
      headers["Authorization"] = `Bearer ${effectiveKey}`;
      headers["x-api-key"] = effectiveKey;
    }

    const cleanBaseUrl = targetApiUrl.replace(/\/+$/, "");
    const parentBaseUrl = cleanBaseUrl
      .replace(/\/generate$/, "")
      .replace(/\/generations$/, "")
      .replace(/\/media$/, "")
      .replace(/\/videos$/, "/v1")
      .replace(/\/video$/, "/v1");

    let upstreamData: any = null;
    let successfulStatusUrl: string | undefined = task.cachedStatusUrl;

    // 1. Check cached status URL first if available
    if (successfulStatusUrl) {
      try {
        const statusRes = await fetch(successfulStatusUrl, { headers });
        if (statusRes.ok) {
          const data: any = await statusRes.json();
          if (data && typeof data === "object" && !isInvalidRouteResponse(data)) {
            upstreamData = data;
          }
        }
      } catch (e) {
        // Cached URL failed, reset
        successfulStatusUrl = undefined;
      }
    }

    // 2. Build candidate endpoints in deterministic priority order if not found via cached URL
    if (!upstreamData) {
      const getCandidateUrls: string[] = [];

      // A. Special YCVIP / Grok / Sora endpoints
      if (task.provider === "ycvip-grok" || targetApiUrl.includes("ycvip.net")) {
        getCandidateUrls.push(
          `https://ycvip.net/v1/media/status/${task.operationName}`,
          `https://ycvip.net/v1/media/status?id=${encodeURIComponent(task.operationName)}`,
          `https://ycvip.net/v1/media/generate?id=${encodeURIComponent(task.operationName)}`
        );
      }

      // B. Standard OpenAPI / REST path parameters
      getCandidateUrls.push(
        `${cleanBaseUrl}/${task.operationName}`,
        `${cleanBaseUrl}/status/${task.operationName}`,
        `${cleanBaseUrl}/tasks/${task.operationName}`,
        `${cleanBaseUrl}/jobs/${task.operationName}`,
        `${cleanBaseUrl}/query/${task.operationName}`,
        `${parentBaseUrl}/tasks/${task.operationName}`,
        `${parentBaseUrl}/videos/${task.operationName}`,
        `${parentBaseUrl}/media/status/${task.operationName}`
      );

      // C. Query string parameters
      getCandidateUrls.push(
        `${cleanBaseUrl}?id=${encodeURIComponent(task.operationName)}`,
        `${cleanBaseUrl}?task_id=${encodeURIComponent(task.operationName)}`,
        `${cleanBaseUrl}/status?id=${encodeURIComponent(task.operationName)}`,
        `${cleanBaseUrl}/status?task_id=${encodeURIComponent(task.operationName)}`
      );

      for (const url of getCandidateUrls) {
        try {
          const statusRes = await fetch(url, { headers });
          if (statusRes.ok) {
            const data: any = await statusRes.json();
            if (data && typeof data === "object" && !isInvalidRouteResponse(data)) {
              upstreamData = data;
              successfulStatusUrl = url;
              break;
            }
          }
        } catch (_) {}
      }

      // D. Try POST endpoints if GET candidates returned nothing
      if (!upstreamData) {
        const postCandidates = [
          `${cleanBaseUrl}/query`,
          `${cleanBaseUrl}/status`,
          `${cleanBaseUrl}/detail`,
          `${parentBaseUrl}/media/status`,
          `${parentBaseUrl}/status`,
        ];

        for (const postUrl of postCandidates) {
          try {
            const statusRes = await fetch(postUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                id: task.operationName,
                task_id: task.operationName,
                operation_id: task.operationName,
              }),
            });
            if (statusRes.ok) {
              const data: any = await statusRes.json();
              if (data && typeof data === "object" && !isInvalidRouteResponse(data)) {
                upstreamData = data;
                successfulStatusUrl = postUrl;
                break;
              }
            }
          } catch (_) {}
        }
      }
    }

    // 3. Process matched upstream response
    if (upstreamData) {
      const data = upstreamData;
      const extractedUrl = extractVideoUrl(data);
      const statusStr = String(data.status || data.state || data.task_status || data.code || "").toLowerCase();

      // Cache successful endpoint URL for subsequent polls
      if (successfulStatusUrl) {
        videoTaskManager.update(task.taskId, { cachedStatusUrl: successfulStatusUrl });
      }

      const isFailed =
        statusStr === "failed" ||
        statusStr === "error" ||
        statusStr === "fail" ||
        statusStr === "rejected" ||
        data.failed === true ||
        Boolean(data.error) ||
        Boolean(data.fail_reason);

      if (isFailed) {
        const errMsg = data.error || data.fail_reason || data.message || "上游渲染失败";
        videoTaskManager.update(task.taskId, {
          status: "failed",
          error: errMsg,
          stage: "上游任务执行异常",
        });

        res.json({
          done: false,
          failed: true,
          error: errMsg,
          stage: "上游任务执行异常",
          rawResponse: data,
        });
        return;
      }

      const isPendingOrProcessing =
        ["processing", "in_progress", "in-progress", "pending", "queued", "starting", "running", "waiting", "generating", "executing"].includes(statusStr) ||
        data.done === false ||
        data.completed === false ||
        data.status === 1 ||
        data.state === "processing";

      const isExplicitCompleted =
        ["completed", "success", "succeeded", "finished", "done"].includes(statusStr) ||
        data.done === true ||
        data.completed === true;

      const isDone = !isPendingOrProcessing && (isExplicitCompleted || Boolean(extractedUrl));

      if (isDone && extractedUrl) {
        videoTaskManager.update(task.taskId, {
          status: "completed",
          progress: 100,
          hasExplicitProgress: true,
          stage: "上游生成已完成",
          videoUrl: extractedUrl,
        });

        res.json({
          done: true,
          failed: false,
          progress: 100,
          hasExplicitProgress: true,
          stage: "上游生成已完成",
          videoUrl: extractedUrl,
          rawResponse: data,
        });
        return;
      }

      // Parse numerical progress if explicitly returned by upstream
      let realProgress: number | undefined = undefined;
      let hasExplicitProgress = false;

      const rawProg = data.progress ?? data.percentage ?? data.task_progress ?? data.data?.progress;
      if (typeof rawProg === "number") {
        realProgress = Math.min(100, Math.max(0, Math.round(rawProg)));
        hasExplicitProgress = true;
      } else if (typeof rawProg === "string") {
        const parsed = parseFloat(rawProg.replace("%", ""));
        if (!isNaN(parsed)) {
          realProgress = Math.min(100, Math.max(0, Math.round(parsed)));
          hasExplicitProgress = true;
        }
      }

      const rawStatusStr = data.status || data.state || data.task_status || data.data?.status || "";
      const upstreamMsg = data.message || data.stage || rawStatusStr || data.data?.message || data.msg;
      const stageMsg = upstreamMsg ? `[上游节点] ${upstreamMsg}` : "与上游算力节点实时同步中...";
      const finalProg = realProgress !== undefined ? realProgress : (task.progress || 0);

      videoTaskManager.update(task.taskId, {
        progress: finalProg,
        hasExplicitProgress,
        stage: stageMsg,
      });

      res.json({
        done: false,
        failed: false,
        hasExplicitProgress,
        progress: finalProg,
        stage: stageMsg,
        rawResponse: data,
      });
      return;
    }

    // Fallback status when waiting for upstream data
    const stageMsg = "正在轮询与同步上游数据中...";

    videoTaskManager.update(task.taskId, {
      hasExplicitProgress: false,
      stage: stageMsg,
    });

    res.json({
      done: false,
      failed: false,
      hasExplicitProgress: false,
      progress: task.progress || 0,
      stage: stageMsg,
    });
  } catch (err: any) {
    console.error("Video status check error:", err);
    res.status(500).json({ error: err.message || "检查视频生成状态失败" });
  }
});

// Helper to check SSRF safety for video download URL proxy
function isSafeDownloadUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();

    // Block localhost, internal hostnames, and metadata endpoints
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".lan") ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "::" ||
      hostname.includes("metadata")
    ) {
      return false;
    }

    // Parse IPv4 address variations (decimal, octal, hex)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
      const [, p1, p2] = match.map(Number);
      if (p1 === 127) return false; // Loopback
      if (p1 === 10) return false;  // Private 10.0.0.0/8
      if (p1 === 172 && p2 >= 16 && p2 <= 31) return false; // Private 172.16.0.0/12
      if (p1 === 192 && p2 === 168) return false; // Private 192.168.0.0/16
      if (p1 === 169 && p2 === 254) return false; // Link-local / AWS/GCP Metadata
      if (p1 === 100 && p2 >= 64 && p2 <= 127) return false; // CGNAT
      if (p1 === 0) return false;
    }

    // Block integer / hex encoded loopback/private IPs
    if (/^(0x[0-9a-f]+|\d+)$/i.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Safe fetch wrapper that handles redirects manually and validates every hop against SSRF rules
async function safeFetch(urlStr: string, options: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let currentUrl = urlStr;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    if (!isSafeDownloadUrl(currentUrl)) {
      throw new Error("下载目标地址属于禁止访问的网络段 (SSRF拦截)");
    }

    const response = await fetch(currentUrl, {
      ...options,
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return response;
      }
      const nextUrl = new URL(location, currentUrl).toString();
      if (!isSafeDownloadUrl(nextUrl)) {
        throw new Error("跳转目标地址属于禁止访问的网络段 (SSRF拦截)");
      }
      currentUrl = nextUrl;
      redirects++;
    } else {
      return response;
    }
  }

  throw new Error("HTTP 重定向次数过多");
}

// 6. Video Proxy Download Route (Avoid CORS for Veo & Remote URLs)
const handleVideoDownload = async (req: express.Request, res: express.Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
    return;
  }

  try {
    const videoUrl = (req.body?.videoUrl || req.query?.videoUrl || req.query?.url) as string | undefined;
    const operationName = (req.body?.operationName || req.query?.operationName) as string | undefined;
    
    // Safely extract API Key from Headers (x-api-key / Authorization) or body/query fallback
    const authHeader = req.headers["authorization"];
    const bearerKey = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    const headerKey = (req.headers["x-api-key"] as string) || bearerKey;
    const apiKey = headerKey || req.body?.apiKey || (req.query?.apiKey as string);

    let targetUrl = videoUrl;
    if (!targetUrl && typeof operationName === "string" && (operationName.startsWith("http://") || operationName.startsWith("https://"))) {
      targetUrl = operationName;
    }

    // SSRF validation if targetUrl is present
    if (targetUrl && !isSafeDownloadUrl(targetUrl)) {
      res.status(400).json({ error: "非法或受保护的网络下载地址 (SSRF拦截)" });
      return;
    }

    // If targetUrl is missing but operationName is a Veo operation name ("operations/...")
    if (!targetUrl && operationName && typeof operationName === "string" && operationName.startsWith("operations/")) {
      try {
        const ai = getGenAIClient(apiKey);
        if (ai) {
          const op = new GenerateVideosOperation();
          op.name = operationName;
          const updated = await ai.operations.getVideosOperation({ operation: op });
          const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
          if (uri && isSafeDownloadUrl(uri)) {
            targetUrl = uri;
          }
        }
      } catch (e) {
        console.warn("Could not retrieve video URI from Veo operation:", e);
      }
    }

    // Fallback sample MP4 if simulation or missing URL
    if (!targetUrl && operationName && (operationName.startsWith("mock_op_") || operationName.includes("mock"))) {
      targetUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
    }

    // A. Direct Video URL Proxy Download using safeFetch
    if (targetUrl && isSafeDownloadUrl(targetUrl)) {
      try {
        const effectiveKey = apiKey || process.env.GEMINI_API_KEY || "";
        const fetchHeaders: Record<string, string> = {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };
        if (effectiveKey) {
          fetchHeaders["x-goog-api-key"] = effectiveKey;
          fetchHeaders["Authorization"] = `Bearer ${effectiveKey}`;
          fetchHeaders["x-api-key"] = effectiveKey;
        }

        let fetchUrl = targetUrl;
        if (effectiveKey && fetchUrl.includes("generativelanguage.googleapis.com") && !fetchUrl.includes("key=")) {
          fetchUrl += (fetchUrl.includes("?") ? "&" : "?") + `key=${encodeURIComponent(effectiveKey)}`;
        }

        const mediaRes = await safeFetch(fetchUrl, { headers: fetchHeaders });
        if (mediaRes.ok) {
          const contentType = mediaRes.headers.get("content-type") || "video/mp4";
          res.setHeader("Content-Type", contentType.includes("video") ? contentType : "video/mp4");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="ai_video_${Date.now()}.mp4"`
          );
          
          const arrayBuffer = await mediaRes.arrayBuffer();
          res.setHeader("Content-Length", arrayBuffer.byteLength.toString());
          res.send(Buffer.from(arrayBuffer));
          return;
        }
      } catch (proxyErr: any) {
        console.warn("Direct video URL safeFetch failed:", proxyErr?.message || proxyErr);
      }
    }

    // B. Google Veo Operations Video Fetching
    if (operationName && typeof operationName === "string" && operationName.startsWith("operations/")) {
      try {
        const ai = getGenAIClient(apiKey);
        if (ai) {
          const op = new GenerateVideosOperation();
          op.name = operationName;
          const updated = await ai.operations.getVideosOperation({ operation: op });
          const uri = updated.response?.generatedVideos?.[0]?.video?.uri;

          if (uri && isSafeDownloadUrl(uri)) {
            const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
            const videoRes = await safeFetch(uri, {
              headers: { "x-goog-api-key": effectiveKey || "" },
            });

            if (videoRes.ok) {
              res.setHeader("Content-Type", "video/mp4");
              res.setHeader(
                "Content-Disposition",
                `attachment; filename="veo_video_${Date.now()}.mp4"`
              );
              const arrayBuffer = await videoRes.arrayBuffer();
              res.setHeader("Content-Length", arrayBuffer.byteLength.toString());
              res.send(Buffer.from(arrayBuffer));
              return;
            }
          }
        }
      } catch (veoErr: any) {
        console.warn("Google Veo operation query failed (404/expired):", veoErr?.message || veoErr);
      }
    }

    res.status(404).json({
      error: "未查找到有效的视频资源，请确认生成已完成或网络地址正确。",
    });
  } catch (err: any) {
    console.error("Video download proxy error:", err);
    res.status(500).json({ error: err.message || "视频下载代理异常" });
  }
};

app.get("/api/video-download", handleVideoDownload);
app.post("/api/video-download", handleVideoDownload);

// 7. Vite / Production Fallback Handler
async function startServer() {
  const isProd = process.env.NODE_ENV === "production" || fs.existsSync(path.join(process.cwd(), "dist", "index.html"));

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`VisionCraft Studio server running on http://0.0.0.0:${PORT}`);
  });
}

export { app };

if (!process.env.CLOUDBASE_FUNCTION) {
  startServer();
}
