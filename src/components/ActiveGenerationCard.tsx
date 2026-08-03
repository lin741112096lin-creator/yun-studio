import React, { useEffect, useState, useRef } from "react";
import { Loader2, AlertTriangle, CheckCircle, Clock, Film } from "lucide-react";
import { VideoTask, ApiConfig } from "../types";
import { apiUrl, authHeaders } from "../lib/api";

interface ActiveGenerationCardProps {
  task: VideoTask;
  apiConfig: ApiConfig;
  onTaskUpdated: (updatedTask: VideoTask) => void;
}

export const ActiveGenerationCard: React.FC<ActiveGenerationCardProps> = ({
  task,
  apiConfig,
  onTaskUpdated,
}) => {
  const [seconds, setSeconds] = useState(0);

  // Keep latest mutable references to avoid effect dependency re-subscriptions
  const taskRef = useRef(task);
  taskRef.current = task;

  const onTaskUpdatedRef = useRef(onTaskUpdated);
  onTaskUpdatedRef.current = onTaskUpdated;

  const apiConfigRef = useRef(apiConfig);
  apiConfigRef.current = apiConfig;

  // Timer loop for elapsed seconds
  useEffect(() => {
    if (task.status === "completed" || task.status === "failed") return;
    const startTime = task.createdAt;
    const interval = setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [task.createdAt, task.status]);

  // Stable polling status loop
  useEffect(() => {
    if (task.status === "completed" || task.status === "failed") return;

    let isMounted = true;

    const checkStatus = async () => {
      const currentTask = taskRef.current;
      const currentConfig = apiConfigRef.current;

      if (currentTask.status === "completed" || currentTask.status === "failed") return;

      try {
        const res = await fetch(apiUrl("/api/video-status"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            taskId: currentTask.operationName,
            operationName: currentTask.operationName,
            provider: currentTask.provider,
            apiKey: currentConfig.apiKey,
            apiUrl: currentConfig.apiUrl,
            progress: currentTask.progress,
          }),
        });

        if (!res.ok) return;

        const data = await res.json();
        if (!isMounted) return;

        // A. Upstream Error or Task Failed
        if (data.failed || data.error) {
          onTaskUpdatedRef.current({
            ...currentTask,
            status: "failed",
            progress: currentTask.progress || 0,
            stage: `上游生成失败: ${data.error || "任务执行失败"}`,
            error: data.error,
          });
          return;
        }

        // B. Upstream Successfully Generated with Video URL
        const finalVideoUrl = data.videoUrl || data.videoUri;
        if (data.done && finalVideoUrl) {
          onTaskUpdatedRef.current({
            ...currentTask,
            status: "completed",
            progress: 100,
            stage: "上游生成完成",
            videoUrl: finalVideoUrl,
            thumbnailUrl: data.thumbnailUrl,
          });
          return;
        }

        // C. Upstream Still Processing
        const hasExplicitProgress = Boolean(data.hasExplicitProgress);
        const syncProgress = hasExplicitProgress && typeof data.progress === "number" ? data.progress : (currentTask.progress || 0);

        onTaskUpdatedRef.current({
          ...currentTask,
          status: "processing",
          progress: syncProgress,
          hasExplicitProgress,
          stage: data.stage || "与上游算力节点实时同步中...",
        });
      } catch (err) {
        console.error("Polling video status error:", err);
      }
    };

    // Immediate check
    checkStatus();

    // Recurring poll interval
    const pollInterval = setInterval(checkStatus, 3000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [task.id, task.status]); // Only re-run if task ID or status changes!

  const isCompleted = task.status === "completed";
  const isFailed = task.status === "failed";
  const cardTone = isFailed
    ? "border-rose-200 bg-gradient-to-br from-white via-rose-50/80 to-rose-100/70 shadow-rose-200/50"
    : isCompleted
      ? "border-emerald-200 bg-gradient-to-br from-white via-emerald-50/80 to-emerald-100/70 shadow-emerald-200/50"
      : "border-[#a8d5ff] bg-gradient-to-br from-white via-[#f5faff] to-[#e8f4ff] shadow-[#9ecfff]/45";
  const iconTone = isFailed
    ? "border-rose-200 bg-rose-100 text-rose-600"
    : isCompleted
      ? "border-emerald-200 bg-emerald-100 text-emerald-600"
      : "border-[#b9dcff] bg-[#e8f4ff] text-[#087be8]";
  const statusTone = isFailed
    ? "text-rose-700"
    : isCompleted
      ? "text-emerald-700"
      : "text-[#087be8]";
  const progressTone = isFailed
    ? "bg-gradient-to-r from-rose-400 to-orange-400"
    : isCompleted
      ? "bg-gradient-to-r from-emerald-400 to-teal-400"
      : "bg-gradient-to-r from-[#1687f5] via-[#25b7ed] to-[#35d0bd]";

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 shadow-xl animate-fade-in ${cardTone}`}>
      {/* Background Animated Glow Accent */}
      <div className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-2xl ${isFailed ? "bg-rose-300/25" : isCompleted ? "bg-emerald-300/25" : "bg-[#55b8ff]/25"}`} />

      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2.5">
          <div className={`relative flex h-10 w-10 items-center justify-center rounded-xl border ${iconTone}`}>
            {isCompleted ? (
              <CheckCircle className="h-5 w-5" />
            ) : isFailed ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-900">
                {task.mode === "image-to-video" ? "图生视频任务" : "文生视频任务"}
              </span>
              <span className="rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                {task.aspectRatio} | {task.resolution}
              </span>
            </div>
            <p className="mt-0.5 max-w-sm line-clamp-1 text-xs text-slate-600">
              {task.prompt}
            </p>
          </div>
        </div>

        {/* Timer Badge */}
        <div className="flex items-center space-x-1 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-mono text-slate-600 shadow-sm">
          <Clock className={`h-3.5 w-3.5 ${statusTone}`} />
          <span>{seconds}s</span>
        </div>
      </div>

      {/* Progress Bar & Status Text */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className={`flex items-center space-x-1.5 font-medium ${statusTone}`}>
            <Film className={`h-3.5 w-3.5 ${!isCompleted && !isFailed ? "animate-pulse" : ""}`} />
            <span>{isFailed ? "视频生成失败" : task.stage || "任务计算中..."}</span>
          </span>
          {task.hasExplicitProgress ? (
            <span className={`font-mono font-bold ${statusTone}`}>{task.progress}%</span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 font-mono text-[11px] text-cyan-700">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-cyan-500" />
              实时同步中
            </span>
          )}
        </div>

        {/* Progress Track */}
        <div className="h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-200/80 p-0.5">
          {task.hasExplicitProgress ? (
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressTone}`}
              style={{ width: `${Math.max(5, task.progress)}%` }}
            />
          ) : (
            <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-[#1687f5]/50 via-[#25b7ed] to-[#35d0bd]/50 transition-all" />
          )}
        </div>
      </div>

      {/* Info Notice */}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        {isFailed ? "上游返回了失败状态，请检查提示词或接口配置后重试。" : isCompleted ? "视频已生成完成，可以在任务库中查看或预览。" : "AI 正在与上游算力节点实时同步，请稍候。"}
      </p>

      {isFailed && task.error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-white/75 px-3 py-2 text-[11px] leading-relaxed text-rose-700">
          {task.error}
        </div>
      )}
    </div>
  );
};
