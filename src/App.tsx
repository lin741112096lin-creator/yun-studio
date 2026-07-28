import React, { useState, useEffect } from "react";
import { Info, Video, Play, MessageSquare, Image as ImageIcon, Layers, Sparkles, Wand2, ShieldCheck, ArrowRight, Trash2 } from "lucide-react";
import { fetchJson } from "./lib/api";
import {
  VideoTask,
  VideoGenerationRequest,
  MultiApiConfig,
  ActiveTab,
  ChatSession,
  ImageTask,
  AspectRatio,
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
import { TaskManager } from "./components/TaskManager";
import { ActiveGenerationCard } from "./components/ActiveGenerationCard";
import { ApiConfigModal } from "./components/ApiConfigModal";
import { PromptTemplatesModal } from "./components/PromptTemplatesModal";
import { VideoPlayerModal } from "./components/VideoPlayerModal";

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    const hash = window.location.hash.replace("#", "");
    if (["home", "video", "chat", "image", "tasks"].includes(hash)) {
      return hash as ActiveTab;
    }
    return "home";
  });

  const setActiveTab = (tab: ActiveTab) => {
    setActiveTabState(tab);
    window.location.hash = tab;
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (["home", "video", "chat", "image", "tasks"].includes(hash)) {
        setActiveTabState(hash as ActiveTab);
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [apiModalModule, setApiModalModule] = useState<"video" | "chat" | "image">("video");
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState<boolean>(false);
  const [selectedTaskForPreview, setSelectedTaskForPreview] = useState<VideoTask | null>(null);

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
      const saved = localStorage.getItem(STORAGE_KEY_MULTI_CONFIG);
      if (saved) return JSON.parse(saved);

      const oldSaved = localStorage.getItem("visioncraft_api_config_v2");
      if (oldSaved) {
        const oldObj = JSON.parse(oldSaved);
        return {
          video: oldObj,
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
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TASKS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Chat Sessions State
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CHAT);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Image Tasks State
  const [imageTasks, setImageTasks] = useState<ImageTask[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_IMAGE_TASKS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // LocalStorage sync
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MULTI_CONFIG, JSON.stringify(multiConfig));
    } catch (err) {
      console.error("Failed to save multiConfig:", err);
    }
  }, [multiConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    } catch (err) {
      console.error("Failed to save tasks:", err);
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(chatSessions));
    } catch (err) {
      console.error("Failed to save chat sessions:", err);
    }
  }, [chatSessions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_IMAGE_TASKS, JSON.stringify(imageTasks));
    } catch (err) {
      console.error("Failed to save image tasks:", err);
    }
  }, [imageTasks]);

  const handleOpenApiConfig = (module?: "video" | "chat" | "image") => {
    if (module) setApiModalModule(module);
    else setApiModalModule(activeTab === "tasks" ? "video" : activeTab);
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
        operationName?: string;
        provider?: string;
        directVideoUrl?: string;
        success?: boolean;
        error?: string;
      }>("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (data.success === false) {
        throw new Error(data.error || "上游视频接口提交失败");
      }

      const newTask: VideoTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        operationName: data.operationName || `op_${Date.now()}`,
        provider: data.provider || request.provider,
        mode: request.mode,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        style: request.style,
        cameraMotion: request.cameraMotion,
        aspectRatio: request.aspectRatio,
        resolution: request.resolution,
        duration: request.duration,
        status: data.directVideoUrl ? "completed" : "processing",
        progress: data.directVideoUrl ? 100 : 10,
        stage: data.directVideoUrl ? "已生成视频" : "已提交任务，正在分配生成节点...",
        createdAt: Date.now(),
        videoUrl: data.directVideoUrl,
      };

      setTasks((prev) => [newTask, ...prev]);

      if (data.directVideoUrl) {
        setSelectedTaskForPreview(newTask);
      }
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

  const handleSelectTemplate = (template: {
    prompt: string;
    style?: string;
    aspectRatio?: AspectRatio;
  }) => {
    setPrefilledPrompt(template);
    if (activeTab !== "image" && activeTab !== "video") {
      setActiveTab("image");
    }
  };

  const activeTasks = tasks.filter(
    (t) => t.status === "processing" || t.status === "pending"
  );
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const activeConfig = multiConfig[(activeTab === "tasks" || activeTab === "home") ? "video" : activeTab];

  return (
    <div className="min-h-screen bg-[#eaf4ff] font-sans text-slate-900 antialiased selection:bg-[#0084FF]/20 selection:text-[#0084FF]">
      
      {/* 1. Independent Page View: Landing Page */}
      {activeTab === "home" ? (
        <LiquidGlassHero
          activeTab={activeTab}
          onNavigate={(tab) => setActiveTab(tab)}
        />
      ) : (
        /* 2. Independent Page View: Dedicated AI Studio Workspace View */
        <div id="ai-studio-workspace" className="relative z-20 min-h-screen border-t border-white/80 bg-gradient-to-b from-[#eaf4ff] via-[#f4f9ff] to-[#ffffff] pt-2 pb-20 overflow-hidden">
          {/* Liquid Glass Background Orbs matching Landing Page */}
          <div className="absolute top-10 left-10 w-[600px] h-[600px] rounded-full bg-[#60B1FF]/20 blur-[130px] pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-[600px] h-[600px] rounded-full bg-[#0084FF]/15 blur-[140px] pointer-events-none" />
          
          {/* Workspace Navigation Header */}
          <Navbar
            multiConfig={multiConfig}
            onOpenApiConfig={handleOpenApiConfig}
            onOpenTemplates={() => setIsTemplatesModalOpen(true)}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            historyCount={completedTasks.length}
            processingCount={activeTasks.length}
          />

        {/* Main Workspace Container */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 relative z-10">
          {/* 🎬 Video Studio View */}
          {activeTab === "video" && (
            <div>
              {/* Dedicated Video View Header */}
              <div className="mb-8 rounded-[24px] border border-white/90 bg-white/80 p-6 sm:p-8 backdrop-blur-2xl shadow-xl shadow-blue-500/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-[#0084FF]/10 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#0084FF]/30 bg-[#0084FF]/10 px-3.5 py-1 text-xs font-semibold text-[#0084FF] backdrop-blur-md">
                      <Video className="w-3.5 h-3.5" />
                      <span>云往AI 电影视效引擎 • Kling / Grok-3 强力渲染</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-fustat font-bold tracking-tight text-slate-900">
                      电影级 AI 视频创作套件
                    </h2>
                    <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                      支持高质量文本生成视频、图生视频、首尾帧自然过渡与专业运镜逻辑，打造沉浸式视觉视效。
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                {/* Left/Main Column: Video Studio Form */}
                <div className="lg:col-span-8">
                  <VideoStudio
                    apiConfig={multiConfig.video}
                    onOpenApiConfig={() => handleOpenApiConfig("video")}
                    onOpenTemplates={() => setIsTemplatesModalOpen(true)}
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
                    isSubmitting={isSubmitting}
                    prefilledPrompt={prefilledPrompt}
                  />
                </div>

                {/* Right Column: Active Generations & Quick History Side Panel */}
                <div className="space-y-6 lg:col-span-4">
                  {/* Active Generating Tasks Section */}
                  {activeTasks.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#0084FF] flex items-center space-x-1.5">
                          <span className="h-2 w-2 rounded-full bg-[#0084FF] animate-ping" />
                          <span>正在生成的视频任务 ({activeTasks.length})</span>
                        </h3>
                      </div>

                      <div className="space-y-3">
                        {activeTasks.map((task) => (
                          <ActiveGenerationCard
                            key={task.id}
                            task={task}
                            apiConfig={multiConfig.video}
                            onTaskUpdated={handleUpdateTask}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Recent Video Generations */}
                  <div className="rounded-[24px] border border-white/90 bg-white/80 backdrop-blur-2xl p-5 shadow-xl shadow-blue-500/5">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
                      <h3 className="text-xs font-semibold text-slate-900">最新创作视频成果</h3>
                      {completedTasks.length > 0 && (
                        <button
                          onClick={() => setActiveTab("tasks")}
                          className="text-[11px] text-[#0084FF] hover:underline font-medium"
                        >
                          查看全部 ({completedTasks.length})
                        </button>
                      )}
                    </div>

                    {completedTasks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500">
                        还未生成过视频，填写左侧描述点击生成吧！
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
                        {completedTasks.slice(0, 3).map((task) => (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTaskForPreview(task)}
                            className="group flex cursor-pointer items-center space-x-3 rounded-[16px] border border-slate-200/80 bg-slate-50/80 p-3 transition-all hover:border-[#0084FF]/40 hover:bg-white shadow-sm"
                          >
                            <div className="relative h-14 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-slate-900">
                              {task.videoUrl ? (
                                <video
                                  src={task.videoUrl}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-slate-400">
                                  <Video className="h-6 w-6" />
                                </div>
                              )}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                                <Play className="h-4 w-4 fill-white text-white" />
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-800 font-medium line-clamp-1">
                                {task.prompt}
                              </p>
                              <div className="mt-1 flex items-center space-x-2 text-[10px] text-slate-500">
                                <span className="font-mono">{task.aspectRatio}</span>
                                <span>•</span>
                                <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 💬 AI Chat View */}
          {activeTab === "chat" && (
            <div>
              {/* Dedicated Chat View Header */}
              <div className="mb-8 rounded-[24px] border border-white/90 bg-white/80 p-6 sm:p-8 backdrop-blur-2xl shadow-xl shadow-emerald-500/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-700 backdrop-blur-md">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>云往AI 智能对话 • Gemini-3.6-Flash 强力驱动</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-fustat font-bold tracking-tight text-slate-900">
                      全能 AI 智能对话与思考助理
                    </h2>
                    <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                      预设全栈工程师、爆款文案策划、同声翻译等多角色，支持多轮深度思考与长文本流畅交互。
                    </p>
                  </div>
                </div>
              </div>

              <ChatStudio
                chatConfig={multiConfig.chat}
                onOpenApiConfig={() => handleOpenApiConfig("chat")}
                sessions={chatSessions}
                onSaveSessions={setChatSessions}
              />
            </div>
          )}

          {/* 🎨 AI Image Studio View */}
          {activeTab === "image" && (
            <div>
              {/* Dedicated Image View Header */}
              <div className="mb-8 rounded-[24px] border border-white/90 bg-white/80 p-6 sm:p-8 backdrop-blur-2xl shadow-xl shadow-purple-500/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1 text-xs font-semibold text-purple-700 backdrop-blur-md">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>云往AI 图像创作 • Imagen-3.0 美学模型</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-fustat font-bold tracking-tight text-slate-900">
                      艺术级 AI 图像创作与渲染套件
                    </h2>
                    <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                      配备提示词智能润色、负向提示词排除、赛博朋克/写实胶片风格预设与多种画幅一键导出。
                    </p>
                  </div>
                </div>
              </div>

              <ImageStudio
                imageConfig={multiConfig.image}
                chatConfig={multiConfig.chat}
                onOpenApiConfig={() => handleOpenApiConfig("image")}
                onOpenTemplates={() => setIsTemplatesModalOpen(true)}
                tasks={imageTasks}
                onSaveTasks={setImageTasks}
                prefilledPrompt={prefilledPrompt}
              />
            </div>
          )}

          {/* 📂 Task Manager Library View */}
          {activeTab === "tasks" && (
            <div>
              {/* Dedicated Task Library View Header */}
              <div className="mb-8 rounded-[24px] border border-white/90 bg-white/80 p-6 sm:p-8 backdrop-blur-2xl shadow-xl shadow-amber-500/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-semibold text-amber-700 backdrop-blur-md">
                      <Layers className="w-3.5 h-3.5" />
                      <span>云往AI 成果与创作资产库</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-fustat font-bold tracking-tight text-slate-900">
                      全能任务生成历史与作品管理
                    </h2>
                    <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
                      实时监控生成进度、管理完成与处理中任务、参数一键重用与全屏高清播放回放。
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => setActiveTab("video")}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-[16px] bg-[#0084FF] hover:bg-[#0070e0] text-xs font-semibold text-white transition-all shadow-lg shadow-[#0084FF]/30"
                    >
                      <Wand2 className="w-4 h-4" />
                      <span>新建视频作品</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("image")}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-[16px] bg-purple-600 hover:bg-purple-700 text-xs font-semibold text-white transition-all shadow-lg shadow-purple-600/30"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>新建图像作品</span>
                    </button>
                  </div>
                </div>
              </div>

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
          )}
        </main>
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

      <PromptTemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        activeTab={activeTab}
      />

      <VideoPlayerModal
        isOpen={Boolean(selectedTaskForPreview)}
        onClose={() => setSelectedTaskForPreview(null)}
        task={selectedTaskForPreview}
        apiConfig={multiConfig.video}
        onReuseParams={handleReuseParams}
      />

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
    </div>
  );
}
