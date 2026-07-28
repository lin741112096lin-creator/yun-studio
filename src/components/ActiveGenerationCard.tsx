import React, { useEffect, useState, useRef } from "react";
import { Loader2, AlertTriangle, CheckCircle, Clock, Film } from "lucide-react";
import { VideoTask, ApiConfig } from "../types";

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
        const res = await fetch("/api/video-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId: currentTask.id,
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
    const pollInterval = setInterval(checkStatus, 1600);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [task.id, task.status]); // Only re-run if task ID or status changes!

  return (
    <div className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-slate-900 via-indigo-950/20 to-slate-900 p-5 shadow-xl shadow-indigo-950/20 animate-fade-in">
      {/* Background Animated Glow Accent */}
      <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />

      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400">
            {task.status === "completed" ? (
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            ) : task.status === "failed" ? (
              <AlertTriangle className="h-5 w-5 text-rose-400" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white">
                {task.mode === "image-to-video" ? "图生视频任务" : "文生视频任务"}
              </span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300 font-mono">
                {task.aspectRatio} | {task.resolution}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 line-clamp-1 max-w-sm">
              {task.prompt}
            </p>
          </div>
        </div>

        {/* Timer Badge */}
        <div className="flex items-center space-x-1 rounded-lg bg-slate-950/60 px-2.5 py-1 text-xs font-mono text-slate-300 border border-slate-800">
          <Clock className="h-3.5 w-3.5 text-indigo-400" />
          <span>{seconds}s</span>
        </div>
      </div>

      {/* Progress Bar & Status Text */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-medium text-indigo-300 flex items-center space-x-1.5">
            <Film className="h-3.5 w-3.5 animate-pulse text-indigo-400" />
            <span>{task.stage || "任务计算中..."}</span>
          </span>
          {task.hasExplicitProgress ? (
            <span className="font-mono font-bold text-white">{task.progress}%</span>
          ) : (
            <span className="font-mono text-[11px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
              真实同步中
            </span>
          )}
        </div>

        {/* Progress Track */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80 p-0.5 border border-slate-700/50">
          {task.hasExplicitProgress ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-teal-300 transition-all duration-500 shadow-sm shadow-cyan-500/50"
              style={{ width: `${Math.max(5, task.progress)}%` }}
            />
          ) : (
            <div className="h-full w-full rounded-full bg-gradient-to-r from-indigo-500/40 via-cyan-400/80 to-indigo-500/40 animate-pulse transition-all" />
          )}
        </div>
      </div>

      {/* Info Notice */}
      <p className="mt-3 text-[11px] text-slate-400">
        AI 正在与上游算力节点实时同步。请稍候，视频就绪后系统将自动呈现...
      </p>
    </div>
  );
};
