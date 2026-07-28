import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Sparkles,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  Bot,
  User,
  Settings,
  Lightbulb,
  Image as ImageIcon,
  Film,
  X,
  Plus,
  Edit3,
  PanelLeft,
  History,
  Clock,
  ChevronRight,
  Wand2,
  Upload,
} from "lucide-react";
import { ApiEndpointConfig, ChatMessage, ChatSession } from "../types";
import { fetchJson } from "../lib/api";

interface ChatStudioProps {
  chatConfig: ApiEndpointConfig;
  onOpenApiConfig: () => void;
  sessions: ChatSession[];
  onSaveSessions: (sessions: ChatSession[]) => void;
}

const PRESET_SYSTEM_ROLES = [
  { id: "general", label: "🤖 通用智能", prompt: "你是一位博学、严谨且富有创造力的 AI 智能对话助理。" },
  { id: "coder", label: "💻 编程专家", prompt: "你是一位精通前端、后端及系统架构的资深全栈软件工程师。提供优雅、高效且结构严密的代码解答。" },
  { id: "writer", label: "🎨 文案策划", prompt: "你是一位金牌文案总监与故事策划大师。擅长撰写具备爆款潜质的社交媒体文案、剧本、广告脚本与公关稿件。" },
  { id: "translator", label: "🌐 翻译大师", prompt: "你是一位信达雅的高级同声传译与地道母语翻译专家。保持忠实地道的表达。" },
];

const INSPIRATION_QUESTIONS = [
  "描述这张图片",
  "帮我写一段引人入胜的 AI 视频脚本，主题是未来城市",
  "解释一下什么是 React 19 的 Server Components 核心原理",
  "如何用 Python 编写一段批量压缩图片并保存的脚本？",
];

const formatRelativeTime = (timestamp: number) => {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}天前`;
  return new Date(timestamp).toLocaleDateString();
};

export const ChatStudio: React.FC<ChatStudioProps> = ({
  chatConfig,
  onOpenApiConfig,
  sessions,
  onSaveSessions,
}) => {
  // Ensure default session exists if empty
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    if (sessions.length > 0) return sessions[0].id;
    return `session_${Date.now()}`;
  });

  const [inputPrompt, setInputPrompt] = useState<string>("");
  const [attachImageUrl, setAttachImageUrl] = useState<string>("");
  const [showImageInput, setShowImageInput] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<string>("general");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Sidebar visibility & session editing
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 768,
  );
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleEnhancePrompt = async () => {
    if (!inputPrompt.trim() || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const data = await fetchJson<{ enhancedPrompt?: string }>("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: inputPrompt,
          type: "text",
          apiKey: chatConfig?.apiKey,
          chatConfig,
        }),
      });
      if (data.enhancedPrompt) {
        setInputPrompt(data.enhancedPrompt);
      }
    } catch (err) {
      console.error("Failed to enhance prompt:", err);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleLocalFileUpload = (file: File) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        setAttachImageUrl(base64);
        setShowImageInput(true);
      }
    };
    reader.readAsDataURL(file);
  };

  // Initialize first session if none exists
  useEffect(() => {
    if (sessions.length === 0) {
      const initialId = `session_${Date.now()}`;
      const defaultSession: ChatSession = {
        id: initialId,
        title: "新对话",
        messages: [
          {
            id: "welcome_1",
            role: "assistant",
            content: "您好！我是您的 AI 对话助手，支持多模态图文对话与智能记忆。请问有什么我可以帮到您的吗？",
            timestamp: Date.now(),
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onSaveSessions([defaultSession]);
      setCurrentSessionId(initialId);
    }
  }, [sessions, onSaveSessions]);

  // Get active session or create fallback
  const activeSession = sessions.find((s) => s.id === currentSessionId) || {
    id: currentSessionId,
    title: "新对话",
    messages: [
      {
        id: "welcome_1",
        role: "assistant",
        content: "您好！我是您的 AI 对话助手，支持多模态图文对话与智能记忆。请问有什么我可以帮到您的吗？",
        timestamp: Date.now(),
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession.messages, isGenerating]);

  // Handler: Create New Chat
  const handleCreateNewSession = () => {
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: "新对话",
      messages: [
        {
          id: `welcome_${Date.now()}`,
          role: "assistant",
          content: "您好！已为您开启新的独立对话空间。我已经准备好了，请随时发送新的话题或提问！",
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    onSaveSessions([newSession, ...sessions]);
    setCurrentSessionId(newId);
  };

  // Handler: Delete Session
  const handleDeleteSession = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const remaining = sessions.filter((s) => s.id !== sessionId);
    onSaveSessions(remaining);

    if (currentSessionId === sessionId) {
      if (remaining.length > 0) {
        setCurrentSessionId(remaining[0].id);
      } else {
        const freshId = `session_${Date.now()}`;
        const freshSession: ChatSession = {
          id: freshId,
          title: "新对话",
          messages: [
            {
              id: `welcome_${Date.now()}`,
              role: "assistant",
              content: "您好！我是您的 AI 对话助手，支持多模态图文对话与智能记忆。有什么我可以帮到您的吗？",
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        onSaveSessions([freshSession]);
        setCurrentSessionId(freshId);
      }
    }
    setDeletingSessionId(null);
  };

  // Handler: Save Session Title
  const handleSaveTitle = (sessionId: string) => {
    if (!editingTitle.trim()) {
      setEditingSessionId(null);
      return;
    }
    const updated = sessions.map((s) =>
      s.id === sessionId ? { ...s, title: editingTitle.trim(), updatedAt: Date.now() } : s
    );
    onSaveSessions(updated);
    setEditingSessionId(null);
  };

  const handleSendMessage = async (textToSend?: string, imageUrlToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputPrompt).trim();
    const finalImageUrl = (imageUrlToSend !== undefined ? imageUrlToSend : attachImageUrl).trim();

    if ((!text && !finalImageUrl) || isGenerating) return;

    setInputPrompt("");
    setAttachImageUrl("");
    setShowImageInput(false);

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: text || "描述这张图片",
      imageUrl: finalImageUrl || undefined,
      timestamp: Date.now(),
    };

    const newMessages = [...activeSession.messages, userMsg];

    // Auto-generate title if session is brand new ("新对话")
    let newTitle = activeSession.title;
    if (activeSession.title === "新对话" || activeSession.messages.length <= 1) {
      newTitle = (text || "看图对话").slice(0, 18);
    }

    const updatedSession: ChatSession = {
      ...activeSession,
      title: newTitle,
      messages: newMessages,
      updatedAt: Date.now(),
    };

    const updatedSessions = sessions.some((s) => s.id === activeSession.id)
      ? sessions.map((s) => (s.id === activeSession.id ? updatedSession : s))
      : [updatedSession, ...sessions];

    onSaveSessions(updatedSessions);
    setIsGenerating(true);

    try {
      const selectedRoleObj = PRESET_SYSTEM_ROLES.find((r) => r.id === selectedRole);
      const systemInstruction = selectedRoleObj ? selectedRoleObj.prompt : undefined;

      const data = await fetchJson<{ response?: string }>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
            imageUrl: m.imageUrl,
          })),
          systemInstruction,
          provider: chatConfig.provider,
          apiUrl: chatConfig.apiUrl,
          apiKey: chatConfig.apiKey,
          model: chatConfig.selectedModel || "gpt-4o-mini",
        }),
      });

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: "assistant",
        content: data.response || "未返回任何回复内容",
        timestamp: Date.now(),
        model: chatConfig.selectedModel || "gpt-4o-mini",
      };

      const finalSession: ChatSession = {
        ...updatedSession,
        messages: [...newMessages, assistantMsg],
        updatedAt: Date.now(),
      };

      onSaveSessions(
        updatedSessions.map((s) => (s.id === finalSession.id ? finalSession : s))
      );
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg_${Date.now()}_err`,
        role: "assistant",
        content: `⚠️ 请求发生错误: ${err.message || "未能获取回复，请检查 API Key 与接口配置。"}`,
        timestamp: Date.now(),
        error: true,
      };

      onSaveSessions(
        updatedSessions.map((s) =>
          s.id === updatedSession.id
            ? { ...updatedSession, messages: [...newMessages, errorMsg] }
            : s
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const executeClearHistory = () => {
    const resetSession: ChatSession = {
      ...activeSession,
      messages: [
        {
          id: `welcome_${Date.now()}`,
          role: "assistant",
          content: "您好！我是您的 AI 对话助手，有什么我可以帮到您的吗？",
          timestamp: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    };
    onSaveSessions(sessions.map((s) => (s.id === resetSession.id ? resetSession : s)));
    setShowClearConfirm(false);
  };

  const handleCopyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] home-glass-card-dark rounded-[24px] border border-slate-200/80 overflow-hidden shadow-xl backdrop-blur-2xl relative">
      {/* Left Session History Sidebar */}
      <div
        className={`${
          isSidebarOpen ? "w-64 sm:w-72" : "w-0 hidden md:flex md:w-0"
        } transition-all duration-300 flex-shrink-0 border-r border-slate-200/80 bg-white/90 backdrop-blur-xl flex flex-col z-20 overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="p-3.5 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center space-x-2">
            <History className="h-4 w-4 text-[#0084FF]" />
            <span className="font-bold text-xs text-slate-800">对话历史</span>
            <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-[#0084FF] text-[10px] font-mono font-semibold">
              {sessions.length}
            </span>
          </div>

          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded-lg hover:bg-slate-200/60 text-slate-500 hover:text-slate-800 transition-colors"
            title="收起边栏"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Prominent New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleCreateNewSession}
            className="w-full flex items-center justify-center space-x-2 rounded-xl bg-[#0084FF] hover:bg-[#0073e6] active:scale-[0.98] text-white py-2.5 px-4 text-xs font-bold transition-all shadow-md shadow-[#0084FF]/25 cursor-pointer"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>新建对话</span>
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 custom-scrollbar">
          {sessions.map((s) => {
            const isActive = s.id === currentSessionId;
            const isEditing = editingSessionId === s.id;

            return (
              <div
                key={s.id}
                onClick={() => {
                  if (!isEditing) setCurrentSessionId(s.id);
                }}
                className={`group relative flex items-center justify-between rounded-xl px-3 py-2.5 text-xs transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#0084FF]/10 text-[#0084FF] font-bold border border-[#0084FF]/20 shadow-sm"
                    : "text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 border border-transparent"
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
                  <MessageSquare
                    className={`h-3.5 w-3.5 flex-shrink-0 ${
                      isActive ? "text-[#0084FF]" : "text-slate-400 group-hover:text-slate-600"
                    }`}
                  />

                  {isEditing ? (
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => handleSaveTitle(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTitle(s.id);
                      }}
                      autoFocus
                      className="w-full bg-white border border-[#0084FF] px-1.5 py-0.5 rounded text-xs text-slate-900 outline-none"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium leading-tight">{s.title}</p>
                      <span className="text-[10px] text-slate-400 font-normal flex items-center mt-0.5 space-x-1">
                        <Clock className="h-2.5 w-2.5 inline" />
                        <span>{formatRelativeTime(s.updatedAt)}</span>
                        <span>·</span>
                        <span>{s.messages.length}条</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Session Actions (Edit / Delete) */}
                {!isEditing && (
                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSessionId(s.id);
                        setEditingTitle(s.title);
                      }}
                      className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
                      title="重命名对话"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingSessionId(s.id);
                      }}
                      className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600"
                      title="删除对话"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-slate-50/50">
        {/* Top Chat Bar */}
        <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-3 sm:px-6 backdrop-blur-xl">
          <div className="flex items-center space-x-2.5 min-w-0">
            {!isSidebarOpen && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-1.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-100 text-slate-700 transition-all shadow-sm active:scale-95 cursor-pointer mr-1"
                title="展开对话历史"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}

            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0084FF] text-white shadow-md shadow-[#0084FF]/30 flex-shrink-0">
              <MessageSquare className="h-4 w-4" />
            </div>

            <div className="min-w-0">
              <h2 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                {activeSession.title}
              </h2>
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                独立上下文记忆 · 当前模型: {chatConfig.selectedModel || "gpt-4o-mini"}
              </p>
            </div>
          </div>

          {/* Right Top Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center space-x-1 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs text-slate-700 hover:text-rose-600 hover:border-rose-300 transition-all active:scale-95 shadow-sm cursor-pointer"
              title="清空当前会话消息"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">清空本页</span>
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6 custom-scrollbar bg-slate-50/50">
          {activeSession.messages.map((msg, idx) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id || idx}
                className={`flex items-start space-x-3 ${isUser ? "flex-row-reverse space-x-reverse" : ""}`}
              >
                {/* Avatar Icon */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl text-xs font-bold shadow-md ${
                    isUser
                      ? "bg-[#0084FF] text-white shadow-[#0084FF]/30"
                      : "bg-white text-[#0084FF] border border-slate-200/80"
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                {/* Message Bubble Container */}
                <div
                  className={`group relative max-w-[85%] rounded-[20px] px-5 py-3.5 text-xs sm:text-sm leading-relaxed shadow-sm ${
                    isUser
                      ? "bg-[#0084FF] text-white rounded-tr-md shadow-[#0084FF]/20"
                      : msg.error
                      ? "bg-rose-50 border border-rose-200 text-rose-800 rounded-tl-md"
                      : "bg-white border border-slate-200/80 text-slate-800 rounded-tl-md backdrop-blur-xl"
                  }`}
                >
                  {/* Attached Image/Video Preview if present */}
                  {msg.imageUrl && (
                    <div className="mb-2.5 overflow-hidden rounded-xl border border-white/30 max-w-xs shadow-sm bg-slate-900/10">
                      {msg.imageUrl.startsWith("data:video/") || msg.imageUrl.match(/\.(mp4|webm|mov|ogg)($|\?)/i) ? (
                        <video
                          src={msg.imageUrl}
                          controls
                          className="w-full h-auto object-cover max-h-52"
                        />
                      ) : (
                        <img
                          src={msg.imageUrl}
                          alt="附图"
                          className="w-full h-auto object-cover max-h-52"
                        />
                      )}
                    </div>
                  )}

                  {/* Text Content */}
                  <div className="whitespace-pre-wrap break-words font-sans">
                    {msg.content}
                  </div>

                  {/* Footer details & Copy button */}
                  <div
                    className={`mt-2 flex items-center justify-between text-[10px] ${
                      isUser ? "text-blue-100" : "text-slate-400"
                    }`}
                  >
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {!isUser && (
                      <button
                        onClick={() => handleCopyText(msg.content, idx)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 hover:text-slate-700 ml-2 cursor-pointer"
                      >
                        {copiedIndex === idx ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-600">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>复制</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Loading Indicator when AI is typing */}
          {isGenerating && (
            <div className="flex items-start space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-white text-[#0084FF] border border-slate-200/80">
                <Sparkles className="h-4 w-4 animate-spin text-[#0084FF]" />
              </div>
              <div className="rounded-[20px] rounded-tl-md bg-white border border-slate-200/80 px-4 py-3 text-xs text-slate-700 flex items-center space-x-2 shadow-sm">
                <span className="flex h-2 w-2 rounded-full bg-[#0084FF] animate-ping" />
                <span>AI 正在思考并撰写答复...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Inspiration Prompt Pills */}
        {activeSession.messages.length <= 2 && (
          <div className="px-4 py-2.5 border-t border-slate-200/80 bg-white/80">
            <div className="flex items-center space-x-1.5 text-xs text-slate-700 mb-1.5 font-medium">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              <span>快捷推荐提问：</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {INSPIRATION_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (q === "描述这张图片") {
                      setShowImageInput(true);
                      setAttachImageUrl("https://your-host.com/reference.jpg");
                    } else {
                      handleSendMessage(q);
                    }
                  }}
                  className="flex-shrink-0 rounded-full border border-slate-200/80 bg-slate-50 px-3.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all active:scale-95 shadow-sm cursor-pointer"
                >
                  {q === "描述这张图片" ? "🖼️ 描述图片（gpt-5.6-luna 看图）" : q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Form Bar */}
        <div className="p-3 sm:p-4 border-t border-slate-200/80 bg-white/90 backdrop-blur-xl space-y-2">
          {/* Action Toolbar */}
          {inputPrompt && (
            <div className="flex items-center justify-end px-1">
              <button
                type="button"
                onClick={() => setInputPrompt("")}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                清空输入
              </button>
            </div>
          )}

          {/* Attachment Bar: Local File Upload & Network URL */}
          {(showImageInput || attachImageUrl) && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files?.[0]) {
                  handleLocalFileUpload(e.dataTransfer.files[0]);
                }
              }}
              className="p-2.5 bg-slate-100/90 rounded-2xl border border-slate-200/90 text-xs animate-fade-in space-y-2 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 font-medium text-slate-700">
                  <Film className="h-4 w-4 text-[#0084FF]" />
                  <span>添加多媒体参考 (支持本地图片/视频上传、拖拽或网址)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAttachImageUrl("");
                    setShowImageInput(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200/70 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {attachImageUrl ? (
                <div className="flex items-center space-x-3 bg-white p-2 rounded-xl border border-slate-200/80">
                  <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0 border border-slate-300 relative group bg-slate-900/10">
                    {attachImageUrl.startsWith("data:video/") || attachImageUrl.match(/\.(mp4|webm|mov|ogg)($|\?)/i) ? (
                      <video src={attachImageUrl} className="h-full w-full object-cover" />
                    ) : (
                      <img
                        src={attachImageUrl}
                        alt="分析预览"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-slate-700 text-xs">
                    <p className="font-semibold text-emerald-600 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> 已加载参考文件
                    </p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {attachImageUrl.startsWith("data:") ? "本地多媒体文件 (Base64)" : attachImageUrl}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachImageUrl("")}
                    className="text-xs text-rose-500 hover:text-rose-700 font-medium px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 transition-colors"
                  >
                    移除
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-2">
                  {/* Local File Selector Button */}
                  <label className="flex-1 w-full flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 border border-dashed border-[#0084FF]/50 text-[#0084FF] py-2 px-3 rounded-xl cursor-pointer transition-all hover:border-[#0084FF] active:scale-98 shadow-2xs">
                    <Upload className="h-4 w-4" />
                    <span className="font-semibold">点击选择本地图片/视频上传</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleLocalFileUpload(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">或</span>

                  {/* Network URL Input */}
                  <div className="flex-1 w-full flex items-center bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      value={attachImageUrl}
                      onChange={(e) => setAttachImageUrl(e.target.value)}
                      placeholder="粘贴网络图片或视频 URL (https://...)"
                      className="w-full bg-transparent text-slate-800 placeholder-slate-400 outline-none text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex items-center"
          >
            <button
              type="button"
              onClick={() => setShowImageInput(!showImageInput)}
              className={`absolute left-3 top-3.5 z-10 p-1 rounded-lg transition-all ${
                attachImageUrl || showImageInput
                  ? "bg-[#0084FF]/10 text-[#0084FF]"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
              title="添加多媒体参考 (支持本地图片/视频文件或 URL)"
            >
              <ImageIcon className="h-4 w-4" />
            </button>

            <textarea
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="与 AI 助理畅所欲言... (点击左侧图标可上传本地图片/视频或粘贴 URL，Shift+Enter 换行)"
              rows={2}
              className="home-glass-input w-full pl-10 pr-24 py-3 text-xs sm:text-sm text-slate-900 placeholder-slate-400 font-sans resize-none"
            />

            <button
              type="submit"
              disabled={(!inputPrompt.trim() && !attachImageUrl.trim()) || isGenerating}
              className={`absolute right-3 bottom-3 flex items-center space-x-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white transition-all active:scale-95 ${
                (!inputPrompt.trim() && !attachImageUrl.trim()) || isGenerating
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-[#0084FF] hover:bg-[#0070e0] shadow-lg shadow-[#0084FF]/30 cursor-pointer"
              }`}
            >
              {isGenerating ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>发送</span>
            </button>
          </form>
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white/95 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-white/80 text-center space-y-4 font-sans">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">清空当前会话记录</h3>
              <p className="text-xs text-slate-500 mt-1">确定要清空「{activeSession.title}」的消息记录吗？</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={executeClearHistory}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white transition-all shadow-md shadow-rose-500/25 active:scale-95 cursor-pointer"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Session Modal */}
      {deletingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white/95 rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-white/80 text-center space-y-4 font-sans">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-500 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">删除对话会话</h3>
              <p className="text-xs text-slate-500 mt-1">确定要彻底删除该对话及其所有历史记忆吗？</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDeletingSessionId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteSession(deletingSessionId)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white transition-all shadow-md shadow-rose-500/25 active:scale-95 cursor-pointer"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
