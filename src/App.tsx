import React, { useState, useEffect, useRef } from "react";
import { Info, Video, Play, Image as ImageIcon, Layers, Sparkles, ShieldCheck, ArrowRight, Trash2, Maximize2, X, UserRound, GripHorizontal, ChevronDown, Plus, History } from "lucide-react";
import { AUTH_SESSION_STORAGE_KEY, fetchJson } from "./lib/api";
import {
  VideoTask,
  VideoGenerationRequest,
  MultiApiConfig,
  ActiveTab,
  ChatSession,
  ImageTask,
  AspectRatio,
  AuthUser,
} from "./types";
import {
  STORAGE_KEY_MULTI_CONFIG,
  STORAGE_KEY_TASKS,
  STORAGE_KEY_CHAT,
  STORAGE_KEY_IMAGE_TASKS,
  DEFAULT_MULTI_CONFIG,
} from "./data/initialData";

import { LiquidGlassHero } from "./components/LiquidGlassHero";
import { Navbar } from "./components/Navbar";
import { VideoStudio } from "./components/VideoStudio";
import { ChatStudio } from "./components/ChatStudio";
import { ImageStudio } from "./components/ImageStudio";
import { ProductWorkflowStudio } from "./components/ProductWorkflowStudio";
import { TaskManager } from "./components/TaskManager";
import { ApiConfigModal } from "./components/ApiConfigModal";
import { VideoPlayerModal } from "./components/VideoPlayerModal";
import ClickSpark from "./components/ClickSpark";
import { LoginScreen } from "./components/LoginScreen";
import { AdminAccountManager } from "./components/AdminAccountManager";
import { ProfileSettingsModal } from "./components/ProfileSettingsModal";
import { PixelPet } from "./components/PixelPet";
import CursorGrid from "./components/CursorGrid";

interface AuthSessionState {
  token: string;
  user: AuthUser;
}

const scopedStorageKey = (key: string, userId: string) => `${key}:${userId}`;

function readUserScopedState<T>(key: string, userId: string): T | null {
  try {
    const scoped = localStorage.getItem(scopedStorageKey(key, userId));
    if (scoped) return JSON.parse(scoped) as T;
    if (userId !== "admin") return null;
    const legacy = localStorage.getItem(key);
    return legacy ? JSON.parse(legacy) as T : null;
  } catch {
    return null;
  }
}

function AuthGate() {
  const [session, setSession] = useState<AuthSessionState | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || "null");
    } catch {
      return null;
    }
  });
  const [isChecking, setIsChecking] = useState(Boolean(session));

  useEffect(() => {
    if (!session?.token) {
      setIsChecking(false);
      return;
    }
    fetchJson<{ user: AuthUser }>("/api/auth/me")
      .then((data) => setSession((current) => current ? { ...current, user: data.user } : current))
      .catch(() => {
        localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
        setSession(null);
      })
      .finally(() => setIsChecking(false));
  }, []);

  const handleAuthenticated = (nextSession: AuthSessionState) => {
    localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  };

  const handleLogout = async () => {
    try {
      await fetchJson("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear the local session even when the server is temporarily unavailable.
    }
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    setSession(null);
  };

  if (isChecking) {
    return <div className="flex min-h-screen items-center justify-center bg-[#eaf4ff] text-sm text-slate-500">正在检查登录状态...</div>;
  }
  if (!session) return <LoginScreen onAuthenticated={handleAuthenticated} />;
  return <StudioApp authUser={session.user} onLogout={handleLogout} />;
}

export default function App() {
  return <AuthGate />;
}

function StudioApp({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
  const initialHash = window.location.hash.replace("#", "");
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "chat") return "home";
    if (["home", "workflow", "video", "chat", "image", "tasks"].includes(hash)) {
      return hash as ActiveTab;
    }
    return "home";
  });
  const [isChatOpen, setIsChatOpen] = useState(() => initialHash === "chat");
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [chatPosition, setChatPosition] = useState({ x: 0, y: 0 });
  const chatDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);

  const openChat = () => {
    setChatPosition({ x: 0, y: 0 });
    setIsChatMenuOpen(false);
    setIsChatOpen(true);
  };

  const dispatchChatCommand = (command: "new" | "clear" | "history") => {
    window.dispatchEvent(new CustomEvent(`yunwang-chat-${command}`));
    setIsChatMenuOpen(false);
  };

  useEffect(() => {
    if (!isChatMenuOpen) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!chatMenuRef.current?.contains(target)) setIsChatMenuOpen(false);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [isChatMenuOpen]);

  const handleChatDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    chatDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: chatPosition.x,
      originY: chatPosition.y,
    };
  };

  const handleChatDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = chatDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.originX + event.clientX - drag.startX;
    const nextY = drag.originY + event.clientY - drag.startY;
    setChatPosition({
      x: Math.max(-window.innerWidth + 160, Math.min(24, nextX)),
      y: Math.max(-window.innerHeight + 160, Math.min(24, nextY)),
    });
  };

  const handleChatDragEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (chatDragRef.current?.pointerId !== event.pointerId) return;
    chatDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const setActiveTab = (tab: ActiveTab) => {
    setIsChatOpen(false);
    setActiveTabState(tab);
    window.location.hash = tab;
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (["home", "workflow", "video", "chat", "image", "tasks"].includes(hash)) {
        if (hash === "chat") {
          setIsChatOpen(true);
          setActiveTabState("home");
        } else {
          setIsChatOpen(false);
          setActiveTabState(hash as ActiveTab);
        }
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [apiModalModule, setApiModalModule] = useState<"video" | "chat" | "image">("video");
  const [selectedTaskForPreview, setSelectedTaskForPreview] = useState<VideoTask | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const [selectedImagePreviewError, setSelectedImagePreviewError] = useState(false);

  // Prefilled prompt payload when reusing params
  const [prefilledPrompt, setPrefilledPrompt] = useState<{
    prompt: string;
    style?: string;
    aspectRatio?: AspectRatio | any;
    imageUrl?: string;
    mode?: "text-to-video" | "image-to-video";
  } | undefined>(undefined);

  // Multi-API Config State (Video, Chat, Image)
  const [multiConfig, setMultiConfig] = useState<MultiApiConfig>(() => {
    try {
      const saved = readUserScopedState<MultiApiConfig>(STORAGE_KEY_MULTI_CONFIG, authUser.id);
      if (saved) {
        return {
          ...saved,
          video: {
            ...saved.video,
            provider: saved.video.provider === "custom-rest" && saved.video.apiUrl?.trim() ? "custom-rest" : "ycvip-grok",
            apiUrl: saved.video.provider === "custom-rest" && saved.video.apiUrl?.trim() ? saved.video.apiUrl : "",
          },
        };
      }

      const oldSaved = localStorage.getItem("visioncraft_api_config_v2");
      if (oldSaved) {
        const oldObj = JSON.parse(oldSaved);
        return {
          video: {
            ...oldObj,
            provider: oldObj.provider === "custom-rest" && oldObj.apiUrl?.trim() ? "custom-rest" : "ycvip-grok",
            apiUrl: oldObj.provider === "custom-rest" && oldObj.apiUrl?.trim() ? oldObj.apiUrl : "",
          },
          chat: { ...DEFAULT_MULTI_CONFIG.chat, apiKey: oldObj.apiKey || "" },
          image: { ...DEFAULT_MULTI_CONFIG.image, apiKey: oldObj.apiKey || "" },
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_MULTI_CONFIG;
  });

  // Video Tasks State
  const [tasks, setTasks] = useState<VideoTask[]>(() => {
    return readUserScopedState<VideoTask[]>(STORAGE_KEY_TASKS, authUser.id) || [];
  });

  // Chat Sessions State
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    return readUserScopedState<ChatSession[]>(STORAGE_KEY_CHAT, authUser.id) || [];
  });

  // Image Tasks State
  const [imageTasks, setImageTasks] = useState<ImageTask[]>(() => {
    return readUserScopedState<ImageTask[]>(STORAGE_KEY_IMAGE_TASKS, authUser.id) || [];
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isAdminAccountManagerOpen, setIsAdminAccountManagerOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(true);

  const dismissPrivacyNotice = () => {
    setShowPrivacyNotice(false);
  };

  // LocalStorage sync
  useEffect(() => {
    try {
      localStorage.setItem(scopedStorageKey(STORAGE_KEY_MULTI_CONFIG, authUser.id), JSON.stringify(multiConfig));
    } catch (err) {
      console.error("Failed to save multiConfig:", err);
    }
  }, [authUser.id, multiConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(scopedStorageKey(STORAGE_KEY_TASKS, authUser.id), JSON.stringify(tasks));
    } catch (err) {
      console.error("Failed to save tasks:", err);
    }
  }, [authUser.id, tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(scopedStorageKey(STORAGE_KEY_CHAT, authUser.id), JSON.stringify(chatSessions));
    } catch (err) {
      console.error("Failed to save chat sessions:", err);
    }
  }, [authUser.id, chatSessions]);

  useEffect(() => {
    try {
      localStorage.setItem(scopedStorageKey(STORAGE_KEY_IMAGE_TASKS, authUser.id), JSON.stringify(imageTasks));
    } catch (err) {
      console.error("Failed to save image tasks:", err);
    }
  }, [authUser.id, imageTasks]);

  useEffect(() => {
    if (authUser.id !== "admin") return;
    [STORAGE_KEY_MULTI_CONFIG, STORAGE_KEY_TASKS, STORAGE_KEY_CHAT, STORAGE_KEY_IMAGE_TASKS].forEach((key) => localStorage.removeItem(key));
  }, [authUser.id]);

  const handleOpenApiConfig = (module?: "video" | "chat" | "image") => {
    if (module) setApiModalModule(module);
    else setApiModalModule(activeTab === "chat" ? "chat" : activeTab === "image" ? "image" : "video");
    setIsApiModalOpen(true);
  };

  const handleSaveMultiConfig = (newConfig: MultiApiConfig) => {
    setMultiConfig(newConfig);
  };

  // Submit Video Generation Request
  const handleSubmitTask = async (request: VideoGenerationRequest) => {
    setIsSubmitting(true);
    try {
      const data = await fetchJson<{
        taskId?: string;
        operationName?: string;
        provider?: string;
        directVideoUrl?: string;
        status?: "pending" | "processing" | "completed" | "failed";
        progress?: number;
        stage?: string;
        error?: string;
        success?: boolean;
      }>("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }, 180000);

      if (data.success === false) {
        throw new Error(data.error || "上游视频接口提交失败");
      }

      const newTask: VideoTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        operationName: data.operationName || data.taskId || `op_${Date.now()}`,
        provider: data.provider || request.provider,
        mode: request.mode,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        style: request.style,
        cameraMotion: request.cameraMotion,
        aspectRatio: request.aspectRatio,
        resolution: request.resolution,
        duration: request.duration,
        status: data.status || (data.directVideoUrl ? "completed" : "processing"),
        progress: data.progress ?? (data.directVideoUrl ? 100 : 10),
        stage: data.stage || (data.directVideoUrl ? "已生成视频" : "已提交任务，正在分配生成节点..."),
        createdAt: Date.now(),
        videoUrl: data.directVideoUrl,
        error: data.error,
        source: request.source || "standalone-video",
      };

      setTasks((prev) => [newTask, ...prev]);
    } catch (err: any) {
      alert(`创建任务时发生错误: ${err.message || "请求失败"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTask = (updatedTask: VideoTask) => {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleUpdateImageTask = (updatedTask: ImageTask) => {
    setImageTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
  };

  const handleDeleteImageTask = (taskId: string) => {
    setImageTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const [clearHistoryType, setClearHistoryType] = useState<"all" | "video" | "image">("all");
  const [showTaskClearConfirm, setShowTaskTaskClearConfirm] = useState<boolean>(false);

  const handleClearHistory = (type: "all" | "video" | "image" = "all") => {
    setClearHistoryType(type);
    setShowTaskTaskClearConfirm(true);
  };

  const executeClearTaskHistory = () => {
    if (clearHistoryType === "all" || clearHistoryType === "video") setTasks([]);
    if (clearHistoryType === "all" || clearHistoryType === "image") setImageTasks([]);
    setShowTaskTaskClearConfirm(false);
  };

  const handleReuseParams = (task: VideoTask) => {
    setPrefilledPrompt({
      prompt: task.prompt,
      style: task.style,
      aspectRatio: task.aspectRatio,
      mode: "text-to-video",
    });
    setActiveTab("video");
  };

  const handleReuseImageParams = (task: ImageTask) => {
    setPrefilledPrompt({
      prompt: task.prompt,
      style: task.style,
      aspectRatio: task.aspectRatio as any,
    });
    setActiveTab("image");
  };

  const handleImageToVideo = (task: ImageTask) => {
    setPrefilledPrompt({
      prompt: task.prompt,
      style: task.style,
      aspectRatio: task.aspectRatio as any,
      imageUrl: task.imageUrl,
      mode: "image-to-video",
    });
    setActiveTab("video");
  };

  const standaloneVideoTasks = tasks.filter((task) => task.source !== "product-workflow");
  const workflowVideoTasks = tasks.filter((task) => task.source === "product-workflow");
  const standaloneImageTasks = imageTasks.filter((task) => task.source !== "product-workflow");

  const activeTasks = standaloneVideoTasks.filter(
    (t) => t.status === "processing" || t.status === "pending"
  );
  const completedTasks = standaloneVideoTasks.filter((t) => t.status === "completed");
  const latestWorkflowVideoTask = workflowVideoTasks[0] ?? null;

  const activeConfig = multiConfig[(activeTab === "tasks" || activeTab === "home" || activeTab === "workflow") ? "video" : activeTab];

  return (
    <ClickSpark
      sparkColor="#0084FF"
      sparkSize={9}
      sparkRadius={22}
      sparkCount={8}
      duration={430}
      easing="ease-out"
      extraScale={1}
    >
    <PixelPet placement={activeTab === "home" ? "home" : "workspace"} onOpenChat={openChat} />
    <div className="min-h-screen bg-[#eaf4ff] font-sans text-slate-900 antialiased selection:bg-[#0084FF]/20 selection:text-[#0084FF]">
      
      {/* 1. Independent Page View: Landing Page */}
      {activeTab === "home" ? (
        <LiquidGlassHero
          activeTab={activeTab}
          onNavigate={(tab) => setActiveTab(tab)}
          onOpenProfile={() => setIsProfileSettingsOpen(true)}
        />
      ) : (
        /* 2. Independent Page View: Dedicated AI Studio Workspace View */
        <div id="ai-studio-workspace" className={`workspace-shell workspace-shell--${activeTab} relative z-20 min-h-screen border-t border-white/80 bg-gradient-to-b from-[#eaf4ff] via-[#f4f9ff] to-[#ffffff] pt-2 pb-20 overflow-hidden ${activeTab === "video" ? "video-page-shell" : ""}`}>
          {["video", "image", "tasks", "workflow"].includes(activeTab) && (
            <div className="workspace-grid-background pointer-events-none absolute inset-0 z-0" aria-hidden="true">
              <CursorGrid
                cellSize={76}
                color="#2d9dff"
                radius={170}
                falloff="smooth"
                holdTime={80}
                fadeDuration={650}
                lineWidth={1}
                maxOpacity={0.42}
                fillOpacity={0.035}
                gridOpacity={0.018}
                cellRadius={12}
                clickPulse
                pulseSpeed={680}
              />
            </div>
          )}
          {/* Liquid Glass Background Orbs matching Landing Page */}
          <div className="absolute top-10 left-10 w-[600px] h-[600px] rounded-full bg-[#60B1FF]/20 blur-[130px] pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-[600px] h-[600px] rounded-full bg-[#0084FF]/15 blur-[140px] pointer-events-none" />
          
          {/* Workspace Navigation Header */}
          <Navbar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            historyCount={completedTasks.length}
            processingCount={activeTasks.length}
            currentUser={authUser}
            onOpenAdmin={() => setIsAdminAccountManagerOpen(true)}
            onOpenProfile={() => setIsProfileSettingsOpen(true)}
          />

        {/* Main Workspace Container */}
        <main className={`workspace-main mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 relative z-10 ${activeTab === "video" ? "video-workspace-main" : ""}`}>
          <div className={activeTab === "workflow" ? "workspace-page workspace-page--workflow block" : "hidden"}>
            <ProductWorkflowStudio
              multiConfig={multiConfig}
              imageTasks={imageTasks}
              onSaveImageTasks={setImageTasks}
              onSubmitTask={handleSubmitTask}
              onOpenTaskLibrary={() => setActiveTab("tasks")}
              onUpdateVideoConfig={(updates) => {
                handleSaveMultiConfig({
                  ...multiConfig,
                  video: { ...multiConfig.video, ...updates },
                });
              }}
              isSubmitting={isSubmitting}
              activeTask={latestWorkflowVideoTask}
              onTaskUpdated={handleUpdateTask}
              storageNamespace={authUser.id}
            />
          </div>

          {/* 🎬 Video Studio View */}
          {activeTab === "video" && (
            <div className="workspace-page workspace-page--video video-page">
              {/* Dedicated Video View Header */}
              <div className="workspace-page-intro video-page-header">
                <div className="video-page-header__copy">
                  <div className="video-page-eyebrow">
                    <Video className="h-3.5 w-3.5" />
                    <span>AI VIDEO WORKSPACE</span>
                  </div>
                  <h2 className="video-page-title">把想法变成一条视频</h2>
                  <p className="video-page-description">
                    从文字或首帧开始，设置画幅与运镜，交给模型完成视觉表达。
                  </p>
                </div>
                <div className="video-page-header__meta">
                  <div className="video-page-status"><span />接口已连接</div>
                  <div className="video-page-meta-line">作品统一保存在任务库</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
                {/* Left/Main Column: Video Studio Form */}
                <div className="lg:col-span-12">
                  <VideoStudio
                    apiConfig={multiConfig.video}
                    chatConfig={multiConfig.chat}
                    onUpdateApiConfig={(updates) => {
                      handleSaveMultiConfig({
                        ...multiConfig,
                        video: {
                          ...multiConfig.video,
                          ...updates,
                        },
                      });
                    }}
                    onSubmitTask={handleSubmitTask}
                    taskSource="standalone-video"
                    isSubmitting={isSubmitting}
                    prefilledPrompt={prefilledPrompt}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 💬 AI Chat View */}
          {/* 🎨 AI Image Studio View */}
          {activeTab === "image" && (
            <div className="workspace-page workspace-page--image">
              {/* Dedicated Image View Header */}
              <div className="workspace-page-intro image-page-header">
                <div className="image-page-header__layout">
                  <div className="image-page-header__copy">
                    <div className="image-page-eyebrow">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>云往AI 图像创作 • Imagen-3.0 美学模型</span>
                    </div>
                    <h2 className="image-page-title">
                      摆烂式-AI图像创作和渲染
                    </h2>
                    <p className="image-page-description">
                      配备提示词智能润色、负向提示词排除、赛博朋克/写实胶片风格预设与多种画幅一键导出。
                    </p>
                  </div>
                  <div className="image-page-header__meta">
                    <div className="image-page-status"><span />接口已连接</div>
                    <div className="image-page-meta-line">图像作品统一保存到任务库</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:items-start">
                <div className="workspace-image-studio md:col-span-12">
                  <ImageStudio
                    imageConfig={multiConfig.image}
                    chatConfig={multiConfig.chat}
                    tasks={standaloneImageTasks}
                    taskSource="standalone-image"
                    onSaveTasks={setImageTasks}
                    prefilledPrompt={prefilledPrompt}
                  />
                </div>

                <aside className="hidden">
                  <div className="rounded-[24px] border border-white/90 bg-white/80 p-6 shadow-xl shadow-purple-500/5 backdrop-blur-2xl">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">图像生成进度</h3>
                        <p className="mt-1 text-xs text-slate-500">实时查看最近的图像任务</p>
                      </div>
                      <span className="rounded-full bg-purple-500/10 px-2.5 py-1 text-[10px] font-semibold text-purple-700">
                        {standaloneImageTasks.filter((task) => task.status === "processing" || task.status === "pending").length} 个处理中
                      </span>
                    </div>

                    {standaloneImageTasks.length === 0 ? (
                      <div className="py-10 text-center">
                        <ImageIcon className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 text-xs font-medium text-slate-600">还没有图像生成任务</p>
                        <p className="mt-1 text-[11px] text-slate-400">填写左侧提示词后即可开始生成</p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {standaloneImageTasks.slice(0, 5).map((task) => {
                          const isProcessing = task.status === "processing" || task.status === "pending";
                          const isFailed = task.status === "failed";

                          return (
                            <div key={task.id} className="rounded-[16px] border border-slate-200/80 bg-white/70 p-4">
                              <div className="flex items-start gap-3">
                                <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                  {task.imageUrl ? (
                                    <button
                                      type="button"
                                      title="放大查看图片"
                                      aria-label="放大查看图片"
                                      onClick={() => {
                                        setSelectedImagePreviewError(false);
                                        setSelectedImagePreview(task.imageUrl || null);
                                      }}
                                      className="group relative h-full w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                                    >
                                      <img src={task.imageUrl} alt="生成结果，点击放大查看" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                      <span className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/65 text-white opacity-80 transition group-hover:bg-purple-600/90 group-hover:opacity-100">
                                        <Maximize2 className="h-3.5 w-3.5" />
                                      </span>
                                    </button>
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                      <ImageIcon className={`h-5 w-5 ${isFailed ? "text-rose-400" : "text-purple-400"}`} />
                                    </div>
                                  )}
                                  {isProcessing && <span className="absolute inset-0 animate-pulse bg-purple-500/15" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold text-purple-700">
                                      {isProcessing ? "生成中" : isFailed ? "生成失败" : "生成完成"}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{task.aspectRatio}</span>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-700">{task.prompt}</p>
                                </div>
                              </div>
                              {isProcessing && <div className="mt-3 h-1 overflow-hidden rounded-full bg-purple-100"><div className="h-full w-2/5 animate-pulse rounded-full bg-purple-500" /></div>}
                              {isFailed && task.error && <p className="mt-2 line-clamp-2 text-[10px] text-rose-500">{task.error}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {standaloneImageTasks.length > 5 && (
                      <button type="button" onClick={() => setActiveTab("tasks")} className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-purple-300 hover:text-purple-700">
                        查看全部图像任务
                      </button>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          )}

          {/* 📂 Task Manager Library View */}
          {activeTab === "tasks" && (
            <div className="workspace-page workspace-page--tasks">
              {showPrivacyNotice && <div className="tasks-privacy-notice mb-6 flex items-start gap-3 rounded-2xl border-2 border-orange-300 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 px-4 py-4 text-orange-950 shadow-lg shadow-orange-200/50">
                <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-orange-600" />
                <div className="min-w-0">
                  <p className="text-base font-extrabold">隐私公告：请及时下载作品</p>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-orange-800">图片和视频不会保存在本站服务器，生成完成后请及时下载。</p>
                </div>
                <button type="button" onClick={dismissPrivacyNotice} className="ml-auto shrink-0 rounded-full p-1.5 text-orange-700 transition hover:bg-orange-200/70" aria-label="关闭隐私公告" title="关闭提醒"><X className="h-4 w-4" /></button>
              </div>}

              {/* Dedicated Task Library View Header */}
              <div className="workspace-page-intro tasks-page-header">
                <div className="tasks-page-header__copy tasks-page-header__copy--custom-title">
                  <div className="tasks-page-eyebrow">
                    <Layers className="h-3.5 w-3.5" />
                    <span>TASK LIBRARY / LOCAL WORKSPACE</span>
                  </div>
                  <h2 className="tasks-page-title tasks-page-title--custom">我的小金库我来打理</h2>
                  <h2 className="tasks-page-title">任务库 · 作品管理</h2>
                  <p className="tasks-page-description">
                    集中查看图片与视频生成结果，追踪任务状态，并快速下载或复用创作参数。
                  </p>
                </div>
                <div className="tasks-page-header__meta">
                  <div className="tasks-page-status"><span />本地资产库</div>
                  <div className="tasks-page-meta-line">作品完成后请及时下载保存</div>
                </div>
              </div>

              <div className="workspace-task-content">
                <TaskManager
                tasks={tasks}
                imageTasks={imageTasks}
                apiConfig={multiConfig.video}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onUpdateImageTask={handleUpdateImageTask}
                onDeleteImageTask={handleDeleteImageTask}
                onClearHistory={handleClearHistory}
                onReuseParams={handleReuseParams}
                onReuseImageParams={handleReuseImageParams}
                onImageToVideo={handleImageToVideo}
                onSelectTaskForPreview={(task) => setSelectedTaskForPreview(task)}
                onStartCreate={(tab) => setActiveTab(tab || "video")}
                />
              </div>
            </div>
          )}
        </main>
      </div>
      )}

      {isChatOpen && (
        <div className="chat-float-layer">
          <section
            className="chat-float-window"
            role="dialog"
            aria-modal="false"
            aria-label="AI 对话"
            style={{ transform: `translate3d(${chatPosition.x}px, ${chatPosition.y}px, 0)` }}
          >
            <div
              className="chat-float-drag-handle"
              onPointerDown={handleChatDragStart}
              onPointerMove={handleChatDragMove}
              onPointerUp={handleChatDragEnd}
              onPointerCancel={handleChatDragEnd}
              aria-label="移动 AI 对话窗口"
            >
              <GripHorizontal className="h-4 w-4" />
              <div className="chat-float-menu-shell" ref={chatMenuRef} onPointerDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="chat-float-menu-trigger"
                  onClick={() => setIsChatMenuOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isChatMenuOpen}
                >
                  <span>AI 对话</span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isChatMenuOpen ? "rotate-180" : ""}`} />
                </button>
                  {isChatMenuOpen && (
                  <div className="chat-float-menu" role="menu">
                    <button type="button" onClick={() => dispatchChatCommand("history")}>
                      <History className="h-3.5 w-3.5" />
                      <span>查看历史对话</span>
                    </button>
                    <button type="button" onClick={() => dispatchChatCommand("new")}>
                      <Plus className="h-3.5 w-3.5" />
                      <span>新建对话</span>
                    </button>
                    <button type="button" onClick={() => dispatchChatCommand("clear")}>
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>清空记录</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              className="chat-float-close"
              onClick={() => setIsChatOpen(false)}
              aria-label="关闭 AI 对话"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
            <ChatStudio
              chatConfig={multiConfig.chat}
              sessions={chatSessions}
              onSaveSessions={setChatSessions}
              floating
            />
          </section>
        </div>
      )}

      {/* Modals */}
      <ApiConfigModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        multiConfig={multiConfig}
        onSaveMultiConfig={handleSaveMultiConfig}
        initialModule={apiModalModule}
      />

      <VideoPlayerModal
        isOpen={Boolean(selectedTaskForPreview)}
        onClose={() => setSelectedTaskForPreview(null)}
        task={selectedTaskForPreview}
        apiConfig={multiConfig.video}
        onReuseParams={handleReuseParams}
      />

      {selectedImagePreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="生成图片预览"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImagePreview(null)}
        >
          <button
            type="button"
            aria-label="关闭图片预览"
            title="关闭"
            onClick={() => setSelectedImagePreview(null)}
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={selectedImagePreview}
            alt="生成图片大图"
            onError={() => setSelectedImagePreviewError(true)}
            onClick={(event) => event.stopPropagation()}
            className={`${selectedImagePreviewError ? "hidden" : "max-h-[90vh] max-w-[min(94vw,1200px)] object-contain"}`}
          />
          {selectedImagePreviewError && (
            <div className="rounded-2xl border border-rose-300/30 bg-slate-900/80 px-6 py-5 text-center text-sm text-rose-200">
              图片地址已失效或上游拒绝访问，请重新生成图片。
            </div>
          )}
        </div>
      )}

      {/* Task History Clear Confirm Modal */}
      {showTaskClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white/95 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-white/80 text-center space-y-4 font-sans">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">清空历史任务</h3>
              <p className="text-xs text-slate-500 mt-1">确定要清空所有的历史作品生成记录吗？此操作无法撤销。</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowTaskTaskClearConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={executeClearTaskHistory}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white transition-all shadow-md shadow-rose-500/25 active:scale-95 cursor-pointer"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

      {authUser.role === "admin" && (
        <AdminAccountManager
          isOpen={isAdminAccountManagerOpen}
          onClose={() => setIsAdminAccountManagerOpen(false)}
        />
      )}
      <ProfileSettingsModal
        isOpen={isProfileSettingsOpen}
        user={authUser}
        onClose={() => setIsProfileSettingsOpen(false)}
        onLogout={onLogout}
        onOpenApiConfig={handleOpenApiConfig}
      />
    </div>
    </ClickSpark>
  );
}
