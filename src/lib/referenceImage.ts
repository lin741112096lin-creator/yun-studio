import { ApiEndpointConfig } from "../types";
import { fetchJson } from "./api";

type ReferenceAnalysisContext = "image" | "video";

interface ReferenceAnalysisResponse {
  response?: string;
  error?: string;
}

function parseNegativePrompt(response: string): string {
  const cleaned = response.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { negativePrompt?: string; negative_prompt?: string };
    return (parsed.negativePrompt || parsed.negative_prompt || "").trim();
  } catch {
    const match = cleaned.match(/(?:negativePrompt|negative_prompt)\s*[:：]\s*["']?(.+?)["']?\s*[,}]/i);
    return match?.[1]?.trim() || cleaned;
  }
}

export async function analyzeReferenceImage(
  imageUrl: string,
  chatConfig: ApiEndpointConfig | undefined,
  context: ReferenceAnalysisContext,
): Promise<string> {
  if (!chatConfig?.apiKey || !imageUrl) return "";

  const contextInstruction = context === "video"
    ? "用于图生视频：重点识别人物、服装、产品主体、颜色、材质、纹理、图案、结构、口型和容易出现的时序变化。"
    : "用于参考图生图：重点识别产品主体、颜色、材质、纹理、图案、结构、包装和容易被重新设计的细节。";

  const data = await fetchJson<ReferenceAnalysisResponse>("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: chatConfig.provider,
      apiUrl: chatConfig.apiUrl,
      apiKey: chatConfig.apiKey,
      model: chatConfig.selectedModel,
      messages: [{
        role: "user",
        content: `请分析这张参考图，${contextInstruction}只返回 JSON：{"negativePrompt":"用中文逗号分隔的反向提示词"}。反向提示词只能描述必须禁止的变化或错误，例如改变颜色、改变材质、改变图案、改变结构、改变版型、产品变形、细节缺失、人物遮挡主体、画面闪烁、人物换脸、口型跳变。不要写正向描述，不要编造图片中看不清的内容，不要使用 Markdown。`,
        imageUrl,
      }],
      systemInstruction: "你是参考图一致性检查员。你的唯一任务是从图片中识别可能被图像或视频模型改动的视觉细节，并生成简洁、可直接用于 Negative Prompt 的禁止项。必须以参考图为准，不能凭空添加产品属性。",
      temperature: 0.2,
    }),
  });

  if (!data.response) throw new Error(data.error || "参考图识别失败");
  return parseNegativePrompt(data.response);
}

export function appendNegativePrompt(current: string, generated: string): string {
  const existing = current.split(/[，,；;]/).map((item) => item.trim()).filter(Boolean);
  const additions = generated.split(/[，,；;]/).map((item) => item.trim()).filter(Boolean);
  return [...existing, ...additions.filter((item) => !existing.includes(item))].join("，");
}
