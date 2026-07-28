import React, { useState, useEffect } from "react";
import { X, Sparkles, Search, Check, Filter, Image as ImageIcon, Video } from "lucide-react";
import { PROMPT_TEMPLATES, IMAGE_PROMPT_TEMPLATES } from "../data/presets";
import { PromptTemplate, AspectRatio, ActiveTab } from "../types";

interface PromptTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: { prompt: string; style?: string; aspectRatio?: AspectRatio }) => void;
  activeTab?: ActiveTab;
}

export const PromptTemplatesModal: React.FC<PromptTemplatesModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  activeTab = "image",
}) => {
  const [activeType, setActiveType] = useState<"image" | "video">("image");
  const [selectedCategory, setSelectedCategory] = useState<string>("全部");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [appliedId, setAppliedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "video") {
      setActiveType("video");
    } else {
      setActiveType("image");
    }
    setSelectedCategory("全部");
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const currentDataset = activeType === "image" ? IMAGE_PROMPT_TEMPLATES : PROMPT_TEMPLATES;
  const categories = ["全部", ...Array.from(new Set(currentDataset.map((t) => t.category)))];

  const filteredTemplates = currentDataset.filter((t) => {
    const matchCategory = selectedCategory === "全部" || t.category === selectedCategory;
    const matchSearch =
      !searchQuery ||
      t.title.includes(searchQuery) ||
      t.prompt.includes(searchQuery) ||
      t.tags.some((tag) => tag.includes(searchQuery));
    return matchCategory && matchSearch;
  });

  const handleApply = (t: PromptTemplate) => {
    setAppliedId(t.id);
    onSelectTemplate({
      prompt: t.prompt,
      style: t.style,
      aspectRatio: t.aspectRatio,
    });
    setTimeout(() => {
      setAppliedId(null);
      onClose();
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                {activeType === "image" ? "AI 图像生图灵感词库" : "AI 视频灵感提示词库"}
              </h3>
              <p className="text-xs text-slate-400">
                {activeType === "image"
                  ? "精选大师级人像写真、二次元插画、商业产品与艺术 CG 生图提示词"
                  : "精选顶级视觉风格与高清高连贯度视频运镜提示词模板"}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            {/* Type Switcher */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
              <button
                onClick={() => {
                  setActiveType("image");
                  setSelectedCategory("全部");
                }}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
                  activeType === "image"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>生图词库</span>
              </button>
              <button
                onClick={() => {
                  setActiveType("video");
                  setSelectedCategory("全部");
                }}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg font-semibold transition-all ${
                  activeType === "video"
                    ? "bg-[#0084FF] text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Video className="h-3.5 w-3.5" />
                <span>视频词库</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search & Category Filter */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索灵感分类、标签或关键词..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
            <Filter className="h-3.5 w-3.5 text-slate-500 mr-1 hidden sm:inline" />
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? activeType === "image"
                      ? "bg-purple-600 text-white"
                      : "bg-[#0084FF] text-white"
                    : "bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Templates Grid */}
        <div className="mt-4 max-h-[380px] overflow-y-auto space-y-3 pr-1">
          {filteredTemplates.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              没有找到匹配的灵感模板，请尝试其他关键词。
            </div>
          ) : (
            filteredTemplates.map((item) => (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 transition-all hover:border-slate-700 hover:bg-slate-950"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                        activeType === "image" 
                          ? "bg-purple-500/20 text-purple-300"
                          : "bg-blue-500/20 text-blue-300"
                      }`}>
                        {item.category}
                      </span>
                      <h4 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                        {item.title}
                      </h4>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">{item.aspectRatio}</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {item.prompt}
                  </p>

                  <div className="mt-2.5 flex items-center space-x-1.5 flex-wrap gap-y-1">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => handleApply(item)}
                    className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow transition-all active:scale-95 ${
                      activeType === "image"
                        ? "bg-purple-600/80 hover:bg-purple-600"
                        : "bg-[#0084FF]/80 hover:bg-[#0084FF]"
                    }`}
                  >
                    {appliedId === item.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>已填入创作面板</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>套用此提示词</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
