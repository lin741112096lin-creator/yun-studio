import { MultiApiConfig } from "../types";

export const STORAGE_KEY_MULTI_CONFIG = "visioncraft_multi_api_config_v3";
export const STORAGE_KEY_TASKS = "visioncraft_tasks_history_v2";
export const STORAGE_KEY_CHAT = "visioncraft_chat_sessions_v1";
export const STORAGE_KEY_IMAGE_TASKS = "visioncraft_image_tasks_v1";

export const DEFAULT_MULTI_CONFIG: MultiApiConfig = {
  video: {
    provider: "ycvip-grok",
    apiUrl: "",
    apiKey: "",
    selectedModel: "grok-imagine-video-special",
  },
  chat: {
    provider: "google-gemini",
    apiUrl: "",
    apiKey: "",
    selectedModel: "gemini-3.6-flash",
  },
  image: {
    provider: "ai2api-image",
    apiUrl: "",
    apiKey: "",
    selectedModel: "gpt-image-2",
  },
};
