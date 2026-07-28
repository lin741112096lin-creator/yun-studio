import React, { useRef, useState } from "react";
import { X, Download, Copy, Check, Play, Pause, RefreshCw, Share2, Sparkles, Film, Maximize } from "lucide-react";
import { VideoTask, ApiConfig } from "../types";

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: VideoTask | null;
  apiConfig: ApiConfig;
  onReuseParams?: (task: VideoTask) => void;
}

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  isOpen,
  onClose,
  task,
  apiConfig,
  onReuseParams,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  if (!isOpen || !task) return null;

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(task.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyVideoUrl = () => {
    const downloadUrl = task.videoUrl || `${window.location.origin}/api/video-download?url=${encodeURIComponent(task.videoUrl || "")}&operationName=${encodeURIComponent(task.operationName || "")}`;
    navigator.clipboard.writeText(downloadUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2500);
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 1000);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    const filename = `VisionCraft_${task.id}_${Date.now()}.mp4`;

    try {
      // 1. Try client-side direct blob fetch if videoUrl is accessible
      if (task.videoUrl) {
        try {
          const directRes = await fetch(task.videoUrl);
          if (directRes.ok) {
            const blob = await directRes.blob();
            triggerBlobDownload(blob, filename);
            setIsDownloading(false);
            return;
          }
        } catch (directErr) {
          console.warn("Direct blob fetch failed, trying proxy endpoint...", directErr);
        }
      }

      // 2. Try proxy endpoint via POST with x-api-key header
      const res = await fetch("/api/video-download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiConfig.apiKey || "",
        },
        body: JSON.stringify({
          videoUrl: task.videoUrl || "",
          operationName: task.operationName || "",
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        triggerBlobDownload(blob, filename);
        setIsDownloading(false);
        return;
      }

      alert("无法通过代理服务器下载视频，请在生成列表中重新试下。");
    } catch (err) {
      console.error("Download error:", err);
      alert("下载视频遇到问题，请重试。");
    } finally {
      setIsDownloading(false);
    }
  };

  const getAspectClass = (ratio: string) => {
    switch (ratio) {
      case "9:16":
        return "max-h-[70vh] aspect-[9/16]";
      case "1:1":
        return "max-h-[65vh] aspect-square";
      case "4:3":
        return "max-h-[65vh] aspect-[4/3]";
      case "21:9":
        return "max-h-[60vh] aspect-[21/9]";
      default:
        return "max-h-[65vh] aspect-video";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5 bg-slate-950/60">
          <div className="flex items-center space-x-2">
            <Film className="h-4 w-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">高清 AI 视频全屏预览</h3>
            <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300 font-mono">
              {task.aspectRatio} | {task.resolution}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Video Player Container */}
        <div className="relative flex items-center justify-center bg-black p-2 min-h-[320px]">
          {task.videoUrl ? (
            <div className={`relative overflow-hidden rounded-xl shadow-2xl ${getAspectClass(task.aspectRatio)}`}>
              <video
                ref={videoRef}
                src={task.videoUrl}
                autoPlay
                loop
                controls
                className="h-full w-full object-contain"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-400 mb-2" />
              <p className="text-xs">正在准备视频流通道...</p>
            </div>
          )}
        </div>

        {/* Video Metadata & Actions */}
        <div className="p-5 bg-slate-900 border-t border-slate-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 pr-4">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-[11px] font-semibold text-slate-400">视频提示词</span>
                {task.style && (
                  <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[10px] text-indigo-300">
                    风格: {task.style}
                  </span>
                )}
                {task.cameraMotion && (
                  <span className="rounded bg-cyan-500/20 px-1.5 py-0.2 text-[10px] text-cyan-300">
                    运镜: {task.cameraMotion}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-sans bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                {task.prompt}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
              >
                {isDownloading ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>{isDownloading ? "准备下载中..." : "下载 MP4 视频"}</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopyVideoUrl}
                  className="flex items-center space-x-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                  title="复制视频直接下载链接"
                >
                  {urlCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-indigo-400" />
                  )}
                  <span>{urlCopied ? "已复制视频链接" : "复制视频链接"}</span>
                </button>

                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center space-x-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copied ? "已复制提示词" : "复制提示词"}</span>
                </button>

                {onReuseParams && (
                  <button
                    onClick={() => {
                      onReuseParams(task);
                      onClose();
                    }}
                    className="flex items-center space-x-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>套用参数再创作</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
