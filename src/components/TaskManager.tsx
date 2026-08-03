import React, { useState } from "react";
import {
  VideoTask,
  ImageTask,
  ApiConfig,
} from "../types";
import {
  Clock,
  Play,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Layers,
  Film,
  RefreshCw,
  Image as ImageIcon,
  Maximize2,
  Wand2,
  X,
  ExternalLink,
  Sliders,
} from "lucide-react";
import { apiUrl, authHeaders } from "../lib/api";

interface TaskManagerProps {
  tasks: VideoTask[];
  imageTasks?: ImageTask[];
  apiConfig: ApiConfig;
  onUpdateTask: (task: VideoTask) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateImageTask?: (task: ImageTask) => void;
  onDeleteImageTask?: (taskId: string) => void;
  onClearHistory: (type?: "all" | "video" | "image") => void;
  onReuseParams: (task: VideoTask) => void;
  onReuseImageParams?: (task: ImageTask) => void;
  onImageToVideo?: (task: ImageTask) => void;
  onSelectTaskForPreview: (task: VideoTask) => void;
  onStartCreate: (tab?: "video" | "image") => void;
}

type MediaCategory = "all" | "video" | "image";
type StatusFilter = "all" | "processing" | "completed" | "failed";

export const TaskManager: React.FC<TaskManagerProps> = ({
  tasks,
  imageTasks = [],
  apiConfig,
  onUpdateTask,
  onDeleteTask,
  onUpdateImageTask,
  onDeleteImageTask,
  onClearHistory,
  onReuseParams,
  onReuseImageParams,
  onImageToVideo,
  onSelectTaskForPreview,
  onStartCreate,
}) => {
  const [mediaCategory, setMediaCategory] = useState<MediaCategory>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [downloadingTaskId, setDownloadingTaskId] = useState<string | null>(null);
  const [previewImageTask, setPreviewImageTask] = useState<ImageTask | null>(null);

  // Download Video Task handler
  const handleDownloadVideo = async (task: VideoTask) => {
    if (!task.videoUrl && !task.operationName) return;
    setDownloadingTaskId(task.id);
    const filename = `video_${task.id.slice(-6)}.mp4`;

    try {
      if (task.videoUrl) {
        try {
          const directRes = await fetch(task.videoUrl);
          if (directRes.ok) {
            const blob = await directRes.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setDownloadingTaskId(null);
            return;
          }
        } catch {
          // ignore & fallback to proxy
        }
      }

      const res = await fetch(apiUrl("/api/video-download"), {
        method: "POST",
        headers: authHeaders({
          "Content-Type": "application/json",
          "x-api-key": apiConfig.apiKey || "",
        }),
        body: JSON.stringify({
          videoUrl: task.videoUrl || "",
          operationName: task.operationName || "",
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || "视频下载失败，请稍后重试");
      }
    } catch (err) {
      console.error("Video download error:", err);
      alert("下载过程发生错误，请检查网络设置");
    } finally {
      setDownloadingTaskId(null);
    }
  };

  // Download Image Task handler
  const handleDownloadImage = async (task: ImageTask) => {
    if (!task.imageUrl) return;
    setDownloadingTaskId(task.id);
    const filename = `image_${task.id.slice(-6)}.png`;

    try {
      const res = await fetch(task.imageUrl);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        window.open(task.imageUrl, "_blank");
      }
    } catch {
      window.open(task.imageUrl, "_blank");
    } finally {
      setDownloadingTaskId(null);
    }
  };

  // Poll video task status
  const handleCheckVideoStatus = async (task: VideoTask) => {
    if (task.status === "completed" && task.videoUrl) return;

    setPollingTaskId(task.id);
    try {
      const res = await fetch(apiUrl("/api/video-status"), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          operationName: task.operationName,
          provider: task.provider,
          apiKey: apiConfig.apiKey,
          apiUrl: apiConfig.apiUrl,
          progress: task.progress,
        }),
      });

      const data = await res.json();
      const finalVideoUrl = data.videoUrl || data.videoUri;

      if (data.failed || data.error) {
        onUpdateTask({
          ...task,
          status: "failed",
          progress: task.progress || 0,
          stage: `上游生成失败: ${data.error || "任务执行失败"}`,
          error: data.error,
        });
      } else if (data.done && finalVideoUrl) {
        onUpdateTask({
          ...task,
          status: "completed",
          progress: 100,
          stage: "上游渲染已完成",
          videoUrl: finalVideoUrl,
          thumbnailUrl: data.thumbnailUrl,
        });
      } else {
        const hasExplicitProgress = Boolean(data.hasExplicitProgress);
        const syncProgress = hasExplicitProgress && typeof data.progress === "number" ? data.progress : (task.progress || 0);

        onUpdateTask({
          ...task,
          status: "processing",
          progress: syncProgress,
          hasExplicitProgress,
          stage: data.stage || data.message || "与上游节点实时同步中...",
          videoUrl: finalVideoUrl || task.videoUrl,
        });
      }
    } catch (err: any) {
      console.error("Poll task status error:", err);
    } finally {
      setPollingTaskId(null);
    }
  };

  const handleCopyPrompt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Combine video and image tasks into unified items
  interface CombinedTaskItem {
    mediaType: "video" | "image";
    id: string;
    prompt: string;
    createdAt: number;
    status: "processing" | "pending" | "completed" | "failed";
    videoTask?: VideoTask;
    imageTask?: ImageTask;
  }

  const combinedTasks: CombinedTaskItem[] = [
    ...tasks.map((t) => ({
      mediaType: "video" as const,
      id: t.id,
      prompt: t.prompt,
      createdAt: t.createdAt,
      status: t.status,
      videoTask: t,
    })),
    ...imageTasks.map((t) => ({
      mediaType: "image" as const,
      id: t.id,
      prompt: t.prompt,
      createdAt: t.createdAt,
      status: t.status,
      imageTask: t,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  // Statistics
  const videoProcessingCount = tasks.filter((t) => t.status === "processing" || t.status === "pending").length;
  const videoCompletedCount = tasks.filter((t) => t.status === "completed").length;
  const videoFailedCount = tasks.filter((t) => t.status === "failed").length;

  const imageProcessingCount = imageTasks.filter((t) => t.status === "processing" || t.status === "pending").length;
  const imageCompletedCount = imageTasks.filter((t) => t.status === "completed").length;
  const imageFailedCount = imageTasks.filter((t) => t.status === "failed").length;

  const totalTasks = tasks.length + imageTasks.length;
  const totalProcessing = videoProcessingCount + imageProcessingCount;
  const totalCompleted = videoCompletedCount + imageCompletedCount;
  const totalFailed = videoFailedCount + imageFailedCount;

  // Filter tasks based on media category, status, and search query
  const filteredItems = combinedTasks.filter((item) => {
    // 1. Media category filter
    if (mediaCategory === "video" && item.mediaType !== "video") return false;
    if (mediaCategory === "image" && item.mediaType !== "image") return false;

    // 2. Status filter
    if (filterStatus === "processing" && (item.status !== "processing" && item.status !== "pending")) return false;
    if (filterStatus === "completed" && item.status !== "completed") return false;
    if (filterStatus === "failed" && item.status !== "failed") return false;

    // 3. Search query filter
    const searchLower = searchTerm.toLowerCase().trim();
    if (searchLower) {
      const matchPrompt = item.prompt.toLowerCase().includes(searchLower);
      const matchId = item.id.toLowerCase().includes(searchLower);
      const matchProvider = item.videoTask?.provider?.toLowerCase().includes(searchLower) || item.imageTask?.provider?.toLowerCase().includes(searchLower);
      const matchStyle = item.videoTask?.style?.toLowerCase().includes(searchLower) || item.imageTask?.style?.toLowerCase().includes(searchLower);
      const matchModel = item.imageTask?.model?.toLowerCase().includes(searchLower);

      if (!matchPrompt && !matchId && !matchProvider && !matchStyle && !matchModel) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="task-manager-shell space-y-6">
      {/* Top Header & Overview */}
      <div className="hidden home-glass-card-dark flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center rounded-[24px] shadow-md border border-slate-200/80 bg-white/80">
        <div>
          <div className="flex items-center space-x-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0084FF] to-indigo-600 text-white shadow-lg shadow-[#0084FF]/25">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2 font-fustat">
                <span>全能生成资产与任务管理库</span>
                <span className="rounded-full bg-[#0084FF]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0084FF] border border-[#0084FF]/20">
                  视频 & 图像全图鉴
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                实时监控渲染进度、高清图文大图回放、一键复用参数与多模态转视频
              </p>
            </div>
          </div>
        </div>

        {/* Quick Create Buttons */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => onStartCreate("video")}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-[#0084FF] hover:bg-[#0073e6] text-white text-xs font-semibold shadow-md shadow-[#0084FF]/20 transition-all hover:scale-102"
          >
            <Film className="h-3.5 w-3.5" />
            <span>生成视频</span>
          </button>
          <button
            onClick={() => onStartCreate("image")}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-md shadow-purple-600/20 transition-all hover:scale-102"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>创作图像</span>
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="task-metrics-grid grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {/* Total Stats */}
        <div className="task-metric-card task-metric-card--total home-glass-card-dark p-5 rounded-[20px] bg-white/90">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>全部创作资产</span>
            <Layers className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">{totalTasks}</span>
            <span className="text-[10px] text-slate-500">
              ({tasks.length} 视频 / {imageTasks.length} 图像)
            </span>
          </div>
        </div>

        {/* Video Stats */}
        <div className="task-metric-card task-metric-card--video home-glass-card-dark p-5 rounded-[20px] border border-[#0084FF]/20 bg-[#0084FF]/5">
          <div className="text-[11px] font-medium text-[#b4533d] flex items-center justify-between">
            <span>🎬 视频作品库</span>
            <Film className="h-3.5 w-3.5 text-[#b4533d]" />
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-[#b4533d] font-mono">{tasks.length}</span>
            <span className="text-[10px] text-slate-500">
              (完成 {videoCompletedCount})
            </span>
          </div>
        </div>

        {/* Image Stats */}
        <div className="task-metric-card task-metric-card--image home-glass-card-dark p-5 rounded-[20px] border border-purple-500/20 bg-purple-500/5">
          <div className="text-[11px] font-medium text-[#c7564b] flex items-center justify-between">
            <span>🎨 图像作品库</span>
            <ImageIcon className="h-3.5 w-3.5 text-[#c7564b]" />
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-[#c7564b] font-mono">{imageTasks.length}</span>
            <span className="text-[10px] text-slate-500">
              (完成 {imageCompletedCount})
            </span>
          </div>
        </div>

        {/* Processing / Failed Stats */}
        <div className="task-metric-card task-metric-card--status home-glass-card-dark p-5 rounded-[20px]">
          <div className="text-[11px] font-medium text-slate-500 flex items-center justify-between">
            <span>实时计算与监控</span>
            {totalProcessing > 0 ? (
              <Loader2 className="h-3.5 w-3.5 text-[#b4533d] animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </div>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-800 font-mono">{totalProcessing}</span>
            <span className="text-[10px] text-slate-500">
              处理中 {totalProcessing} / 异常 {totalFailed}
            </span>
          </div>
        </div>
      </div>

      {/* Filters & Search Bar Toolbar */}
      <div className="task-library-toolbar home-glass-card-dark flex flex-col justify-between gap-3 p-3.5 lg:flex-row lg:items-center rounded-[20px]">
        {/* Media & Status Category Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Media Category Pill Group */}
          <div className="flex items-center space-x-1 p-1 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-medium">
            <button
              onClick={() => setMediaCategory("all")}
              className={`rounded-full px-3.5 py-1.5 transition-all ${
                mediaCategory === "all"
                  ? "bg-slate-900 text-white font-bold shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              全部作品 ({totalTasks})
            </button>
            <button
              onClick={() => setMediaCategory("video")}
              className={`rounded-full px-3.5 py-1.5 transition-all flex items-center space-x-1 ${
                mediaCategory === "video"
                  ? "bg-[#b4533d] text-white font-bold shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Film className="h-3 w-3" />
              <span>视频 ({tasks.length})</span>
            </button>
            <button
              onClick={() => setMediaCategory("image")}
              className={`rounded-full px-3.5 py-1.5 transition-all flex items-center space-x-1 ${
                mediaCategory === "image"
                  ? "bg-[#71815b] text-white font-bold shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ImageIcon className="h-3 w-3" />
              <span>图像 ({imageTasks.length})</span>
            </button>
          </div>

          {/* Divider */}
          <div className="hidden sm:block h-5 w-[1px] bg-slate-200" />

          {/* Status Filter Pill Group */}
          <div className="flex items-center space-x-1 p-1 rounded-full bg-slate-100/80 border border-slate-200/60 text-xs">
            <button
              onClick={() => setFilterStatus("all")}
              className={`rounded-full px-3 py-1 transition-all ${
                filterStatus === "all"
                  ? "bg-white text-slate-900 font-semibold shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              全部状态
            </button>
            <button
              onClick={() => setFilterStatus("processing")}
              className={`rounded-full px-3 py-1 transition-all flex items-center space-x-1 ${
                filterStatus === "processing"
                  ? "bg-white text-[#b4533d] font-semibold shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>生成中</span>
              {totalProcessing > 0 && (
                <span className="rounded-full bg-[#b4533d]/10 px-1.5 py-0.2 text-[10px] text-[#b4533d] font-mono">
                  {totalProcessing}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterStatus("completed")}
              className={`rounded-full px-3 py-1 transition-all ${
                filterStatus === "completed"
                  ? "bg-white text-emerald-600 font-semibold shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              已完成 ({totalCompleted})
            </button>
            {totalFailed > 0 && (
              <button
                onClick={() => setFilterStatus("failed")}
                className={`rounded-full px-3 py-1 transition-all ${
                  filterStatus === "failed"
                    ? "bg-white text-rose-600 font-semibold shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                异常 ({totalFailed})
              </button>
            )}
          </div>
        </div>

        {/* Search input & Clear history */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索提示词、风格或ID..."
              className="home-glass-input w-full py-1.5 pl-9 pr-4 text-xs text-slate-900 placeholder-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {totalTasks > 0 && (
            <button
              onClick={() => onClearHistory(mediaCategory)}
              className="rounded-full border border-slate-200/80 bg-white/80 p-2 text-xs text-slate-600 hover:border-rose-300 hover:text-rose-600 transition-colors shadow-sm"
              title={`清空${mediaCategory === "video" ? "视频" : mediaCategory === "image" ? "图像" : "全部"}历史`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Task List Rendering */}
      {filteredItems.length === 0 ? (
        <div className="home-glass-card-dark flex flex-col items-center justify-center border-dashed border-slate-300/80 py-16 text-center rounded-[24px]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
            {mediaCategory === "image" ? (
              <ImageIcon className="h-6 w-6" />
            ) : (
              <Film className="h-6 w-6" />
            )}
          </div>
          <h3 className="text-sm font-semibold text-slate-800">
            暂无符合条件的{mediaCategory === "video" ? "视频" : mediaCategory === "image" ? "图像" : "生成"}作品
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            尝试更改筛选或搜索项，或者通过左侧控制面板发起新的 AI 创作。
          </p>
        </div>
      ) : (
        <div className="task-list space-y-3.5">
          {filteredItems.map((item) => {
            const isVideo = item.mediaType === "video";
            const videoTask = item.videoTask;
            const imageTask = item.imageTask;

            const isProcessing = item.status === "processing" || item.status === "pending";
            const isCompleted = item.status === "completed";
            const isFailed = item.status === "failed";

            return (
              <div
                key={item.id}
                className="task-library-card group relative home-glass-card-dark p-4 sm:p-5 transition-all hover:border-[#0084FF]/40 rounded-[20px] shadow-sm bg-white/90"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  {/* Left: Media Thumbnail & Info */}
                  <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                    {/* Media Preview Box */}
                    <div
                      onClick={() => {
                        if (isCompleted) {
                          if (isVideo && videoTask) onSelectTaskForPreview(videoTask);
                          if (!isVideo && imageTask) setPreviewImageTask(imageTask);
                        }
                      }}
                      className={`relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-[16px] bg-slate-900 border border-slate-200/80 transition-all ${
                        isCompleted ? "cursor-pointer group-hover:border-[#b4533d] group-hover:shadow-md" : ""
                      }`}
                    >
                      {isVideo ? (
                        /* Video Thumbnail / Video Tag */
                        videoTask?.videoUrl ? (
                          <video
                            src={videoTask.videoUrl}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center text-slate-400 bg-slate-900">
                            {isProcessing ? (
                              <Loader2 className="h-6 w-6 text-[#b4533d] animate-spin" />
                            ) : (
                              <Film className="h-6 w-6 text-slate-500" />
                            )}
                            <span className="text-[10px] mt-1 font-mono text-slate-400">
                              {videoTask?.duration || 5}s | {videoTask?.aspectRatio}
                            </span>
                          </div>
                        )
                      ) : (
                        /* Image Thumbnail */
                        imageTask?.imageUrl ? (
                          <img
                            src={imageTask.imageUrl}
                            alt={imageTask.prompt}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center text-slate-400 bg-slate-900">
                            {isProcessing ? (
                              <Loader2 className="h-6 w-6 text-[#71815b] animate-spin" />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-slate-500" />
                            )}
                            <span className="text-[10px] mt-1 font-mono text-slate-400">
                              {imageTask?.aspectRatio}
                            </span>
                          </div>
                        )
                      )}

                      {/* Hover Overlay Play/Zoom Icon */}
                      {isCompleted && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isVideo ? (
                            <Play className="h-6 w-6 fill-white text-white" />
                          ) : (
                            <Maximize2 className="h-6 w-6 text-white" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Task Metadata & Prompt */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        {/* Type Badge */}
                        {isVideo ? (
                          <span className="inline-flex items-center space-x-1 rounded-full bg-[#b4533d]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#b4533d] border border-[#b4533d]/30">
                            <Film className="h-3 w-3" />
                            <span>AI 视频</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 rounded-full bg-[#f1f5ec] px-2.5 py-0.5 text-[10px] font-bold text-[#71815b] border border-[#d4dfc9]">
                            <ImageIcon className="h-3 w-3" />
                            <span>AI 图像</span>
                          </span>
                        )}

                        {/* Status Badge */}
                        {isProcessing && (
                          <span className="inline-flex items-center space-x-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                            <Loader2 className="h-3 w-3 text-amber-600 animate-spin" />
                            <span>生成计算中</span>
                          </span>
                        )}
                        {isCompleted && (
                          <span className="inline-flex items-center space-x-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>渲染完成</span>
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center space-x-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            <span>计算异常</span>
                          </span>
                        )}

                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-700 border border-slate-200/80">
                          ID: {item.id.slice(-8)}
                        </span>

                        {/* Provider / Model */}
                        <span className="text-[10px] text-slate-500 font-mono">
                          {isVideo
                            ? videoTask?.provider || "google-veo"
                            : imageTask?.style || imageTask?.model || "imagen-3.0"}
                        </span>

                        <span className="text-[10px] text-slate-400">•</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {/* Prompt Text */}
                      <p className="text-xs font-medium text-slate-900 line-clamp-2 leading-relaxed font-sans">
                        {item.prompt}
                      </p>

                      {/* Specs Tags */}
                      <div className="flex items-center space-x-2 text-[10px] text-slate-600 flex-wrap gap-y-1">
                        {isVideo ? (
                          <>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 border border-slate-200/80 font-mono">
                              {videoTask?.mode === "image-to-video" ? "图生视频" : "文生视频"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 border border-slate-200/80 font-mono">
                              {videoTask?.aspectRatio}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 border border-slate-200/80 font-mono">
                              {videoTask?.duration || 5}s
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 border border-slate-200/80 font-mono">
                              {videoTask?.resolution}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="rounded-full bg-[#f1f5ec] px-2 py-0.5 border border-[#d4dfc9] text-[#71815b] font-medium">
                              画幅 {imageTask?.aspectRatio}
                            </span>
                            {imageTask?.style && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 border border-slate-200/80 font-sans">
                                风格: {imageTask.style}
                              </span>
                            )}
                            {imageTask?.referenceImage && (
                              <span className="rounded-full bg-[#f1f5ec] px-2 py-0.5 border border-[#d4dfc9] text-[#71815b] font-sans">
                                垫图参考
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Center/Right: Stage/Progress & Action Buttons */}
                  <div className="flex flex-col justify-between gap-3 border-t border-slate-200/80 pt-3 md:w-64 md:border-t-0 md:pt-0">
                    {/* Live Progress / Stage Status */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-500 truncate max-w-[150px]">
                          {isVideo
                            ? videoTask?.stage || (isCompleted ? "视频已就绪" : "排队计算中")
                            : isCompleted
                            ? "图像高精渲染完成"
                            : isFailed
                            ? "计算失败"
                            : "AI 节点生成中..."}
                        </span>
                         <span className="font-bold text-[#b4533d]">
                          {isCompleted ? "100%" : isVideo ? `${videoTask?.progress || 10}%` : "渲染中"}
                        </span>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/80">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isCompleted
                              ? "bg-emerald-500"
                              : isFailed
                              ? "bg-rose-500"
                              : isVideo
                               ? "bg-[#b4533d]"
                               : "bg-[#71815b] animate-pulse"
                          }`}
                          style={{
                            width: isCompleted ? "100%" : isVideo ? `${videoTask?.progress || 10}%` : "60%",
                          }}
                        />
                      </div>
                    </div>

                    {/* Actions Toolbar */}
                    <div className="flex items-center justify-end space-x-1.5 pt-1">
                      {/* Video-specific: Refresh polling */}
                      {isVideo && videoTask && (
                        <button
                          onClick={() => handleCheckVideoStatus(videoTask)}
                          disabled={pollingTaskId === videoTask.id}
                           className="rounded-full border border-slate-200/80 bg-slate-50 p-1.5 text-slate-600 hover:border-[#b4533d] hover:text-[#b4533d] transition-colors"
                          title="查询最新计算进度"
                        >
                          <RefreshCw
                             className={`h-3.5 w-3.5 ${pollingTaskId === videoTask.id ? "animate-spin text-[#b4533d]" : ""}`}
                          />
                        </button>
                      )}

                      {/* Copy Prompt */}
                      <button
                        onClick={() => handleCopyPrompt(item.id, item.prompt)}
                         className="rounded-full border border-slate-200/80 bg-slate-50 p-1.5 text-slate-600 hover:border-[#b4533d] hover:text-[#b4533d] transition-colors"
                        title="复制提示词"
                      >
                        {copiedId === item.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {/* Reuse parameters */}
                      {isVideo && videoTask ? (
                        <button
                          onClick={() => onReuseParams(videoTask)}
                          className="rounded-full border border-[#b4533d]/30 bg-[#b4533d]/10 px-3 py-1 text-[11px] font-medium text-[#b4533d] hover:bg-[#b4533d]/20 transition-colors"
                          title="套用参数到视频工作室"
                        >
                          复用参数
                        </button>
                      ) : (
                        imageTask && onReuseImageParams && (
                          <button
                            onClick={() => onReuseImageParams(imageTask)}
                            className="rounded-full border border-[#71815b]/30 bg-[#71815b]/10 px-3 py-1 text-[11px] font-medium text-[#71815b] hover:bg-[#71815b]/20 transition-colors"
                            title="套用参数到图像工作室"
                          >
                            复用参数
                          </button>
                        )
                      )}

                      {/* Image to Video button */}
                      {!isVideo && imageTask && isCompleted && imageTask.imageUrl && onImageToVideo && (
                        <button
                          onClick={() => onImageToVideo(imageTask)}
                           className="rounded-full border border-[#b4533d]/30 bg-[#b4533d]/10 px-2.5 py-1 text-[11px] font-medium text-[#b4533d] hover:bg-[#b4533d]/20 transition-colors flex items-center space-x-1"
                          title="使用此图片作为参考生成 AI 视频"
                        >
                           <Film className="h-3 w-3 text-[#b4533d]" />
                          <span>转视频</span>
                        </button>
                      )}

                      {/* Completed Media Play/Preview & Download */}
                      {isCompleted && (
                        <>
                          {isVideo && videoTask?.videoUrl && (
                            <>
                              <button
                                onClick={() => onSelectTaskForPreview(videoTask)}
                                className="ios-blue-button px-3 py-1 text-[11px] flex items-center space-x-1"
                              >
                                <Play className="h-3 w-3 fill-white" />
                                <span>播放</span>
                              </button>

                              <button
                                onClick={() => handleDownloadVideo(videoTask)}
                                disabled={downloadingTaskId === videoTask.id}
                                className="rounded-full border border-slate-200/80 bg-slate-50 p-1.5 text-slate-600 hover:text-slate-900 hover:border-slate-300 disabled:opacity-50 transition-colors"
                                title="下载视频文件"
                              >
                                {downloadingTaskId === videoTask.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#b4533d]" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </>
                          )}

                          {!isVideo && imageTask?.imageUrl && (
                            <>
                              <button
                                onClick={() => setPreviewImageTask(imageTask)}
                                className="rounded-full bg-[#71815b] hover:bg-[#5f6d4c] text-white px-3 py-1 text-[11px] font-medium shadow-sm transition-colors flex items-center space-x-1"
                              >
                                <Maximize2 className="h-3 w-3" />
                                <span>大图</span>
                              </button>

                              <button
                                onClick={() => handleDownloadImage(imageTask)}
                                disabled={downloadingTaskId === imageTask.id}
                                className="rounded-full border border-slate-200/80 bg-slate-50 p-1.5 text-slate-600 hover:text-[#71815b] hover:border-[#b9c9a9] disabled:opacity-50 transition-colors"
                                title="下载高清图像"
                              >
                                {downloadingTaskId === imageTask.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#71815b]" />
                                ) : (
                                  <Download className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {/* Delete Task */}
                      <button
                        onClick={() => {
                          if (isVideo) onDeleteTask(item.id);
                          else if (onDeleteImageTask) onDeleteImageTask(item.id);
                        }}
                        className="rounded-full border border-slate-200/80 bg-slate-50 p-1.5 text-slate-500 hover:border-rose-300 hover:text-rose-600 transition-colors"
                        title="删除记录"
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

      {/* 🖼️ High-Res Image Preview Lightbox Modal */}
      {previewImageTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-5xl rounded-[28px] border border-white/20 bg-slate-900/95 text-white shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
            {/* Close Button */}
            <button
              onClick={() => setPreviewImageTask(null)}
              className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/80 hover:text-white transition-all backdrop-blur-md"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Left: Image Canvas Display */}
            <div className="relative flex-1 flex items-center justify-center bg-black/60 p-6 min-h-[320px] md:min-h-[500px] overflow-hidden">
              {previewImageTask.imageUrl ? (
                <img
                  src={previewImageTask.imageUrl}
                  alt={previewImageTask.prompt}
                  className="max-h-[75vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl transition-transform"
                />
              ) : (
                <div className="text-slate-400 text-xs">无可用图像 URL</div>
              )}
            </div>

            {/* Right: Info & Operations Panel */}
            <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-white/10 p-6 flex flex-col justify-between space-y-6 bg-slate-900/80 backdrop-blur-xl">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-semibold text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>AI 图像作品大图</span>
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    ID: {previewImageTask.id.slice(-8)}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    生成提示词 (Prompt)
                  </h4>
                  <div className="rounded-2xl bg-white/5 p-3.5 border border-white/10 text-xs leading-relaxed text-slate-200 max-h-36 overflow-y-auto custom-scrollbar">
                    {previewImageTask.prompt}
                  </div>
                </div>

                {previewImageTask.negativePrompt && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400/80 mb-1">
                      排除要素 (Negative Prompt)
                    </h4>
                    <p className="text-xs text-slate-400 bg-white/5 p-2 rounded-xl border border-white/5">
                      {previewImageTask.negativePrompt}
                    </p>
                  </div>
                )}

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                    <span className="text-[10px] text-slate-400 block">画幅比例</span>
                    <span className="font-mono font-bold text-slate-200">{previewImageTask.aspectRatio}</span>
                  </div>
                  <div className="rounded-xl bg-white/5 p-2.5 border border-white/10">
                    <span className="text-[10px] text-slate-400 block">生成模型</span>
                    <span className="font-mono font-bold text-purple-300 truncate block">
                      {previewImageTask.style || previewImageTask.model || "Imagen-3.0"}
                    </span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 font-mono">
                  生成时间: {new Date(previewImageTask.createdAt).toLocaleString()}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="space-y-2 pt-4 border-t border-white/10">
                {onImageToVideo && (
                  <button
                    onClick={() => {
                      const taskToConvert = previewImageTask;
                      setPreviewImageTask(null);
                      onImageToVideo(taskToConvert);
                    }}
                    className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition-all"
                  >
                    <Film className="h-4 w-4" />
                    <span>以此图生成视频作品</span>
                  </button>
                )}

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleDownloadImage(previewImageTask)}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium border border-white/10 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>下载高清原图</span>
                  </button>

                  <button
                    onClick={() => handleCopyPrompt(previewImageTask.id, previewImageTask.prompt)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs border border-white/10 transition-colors"
                    title="复制提示词"
                  >
                    {copiedId === previewImageTask.id ? (
                      <Check className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
