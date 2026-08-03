export type VideoGenerationMode = "text-to-video" | "image-to-video";

export type TaskSource = "standalone-video" | "standalone-image" | "product-workflow";

export type AuthRole = "admin" | "user";

export interface AuthUser {
  id: string;
  username: string;
  role: AuthRole;
  active: boolean;
  createdAt: number;
  starBalance?: number | null;
}

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3" | "21:9" | "3:2";
export type VideoAspectRatio = "16:9" | "9:16";
export type ImageAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:2";

export type Resolution = "480p" | "720p";

export type ActiveTab = "home" | "workflow" | "video" | "chat" | "image" | "tasks";

export interface ApiEndpointConfig {
  provider: string;
  apiUrl: string;
  apiKey: string;
  selectedModel: string;
}

export interface MultiApiConfig {
  video: ApiEndpointConfig;
  chat: ApiEndpointConfig;
  image: ApiEndpointConfig;
}

// Legacy alias for compatibility
export type ApiConfig = ApiEndpointConfig;

export interface VideoGenerationRequest {
  mode: VideoGenerationMode;
  prompt: string;
  negativePrompt?: string;
  style?: string;
  cameraMotion?: string;
  aspectRatio: VideoAspectRatio;
  resolution: Resolution;
  duration: number; // in seconds
  image?: {
    data: string; // base64
    mimeType: string;
  };
  lastFrame?: {
    data: string;
    mimeType: string;
  };
  provider: string;
  apiUrl?: string;
  apiKey?: string;
  model: string;
  source?: TaskSource;
}

export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface VideoTask {
  id: string;
  operationName: string;
  provider: string;
  mode: VideoGenerationMode;
  prompt: string;
  negativePrompt?: string;
  style?: string;
  cameraMotion?: string;
  aspectRatio: VideoAspectRatio;
  resolution: Resolution;
  duration: number;
  status: TaskStatus;
  progress: number;
  hasExplicitProgress?: boolean;
  stage: string;
  createdAt: number;
  videoUrl?: string;
  videoUri?: string;
  thumbnailUrl?: string;
  error?: string;
  sourceImage?: string;
  source?: TaskSource;
}

// Chat types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  model?: string;
  error?: boolean;
  imageUrl?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  systemInstruction?: string;
  createdAt: number;
  updatedAt: number;
}

// Image types
export interface ImageTask {
  id: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: ImageAspectRatio;
  style?: string;
  model: string;
  provider: string;
  imageUrl?: string;
  status: TaskStatus;
  createdAt: number;
  error?: string;
  referenceImage?: string;
  source?: TaskSource;
}

export interface PresetProvider {
  id: string;
  name: string;
  description: string;
  defaultUrl: string;
  supportsImageToVideo?: boolean;
  supportsPromptEnhancer?: boolean;
  models: string[];
}

export interface StylePreset {
  id: string;
  label: string;
  iconName: string;
  promptSuffix: string;
  previewGradient: string;
}

export interface CameraMotion {
  id: string;
  label: string;
  description: string;
  iconName: string;
}

export interface PromptTemplate {
  id: string;
  category: string;
  title: string;
  prompt: string;
  style: string;
  aspectRatio: AspectRatio;
  tags: string[];
  coverImage?: string;
}
