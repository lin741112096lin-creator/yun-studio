import React, { useEffect, useRef, useState } from "react";

interface PixelPetProps {
  onOpenChat: () => void;
  placement?: "home" | "workspace";
}

const speechLines = [
  "有问题？点我聊两句。",
  "不会用？我来帮你捋一捋。",
  "提示词卡住了？来问我。",
  "生成慢？服务器在思考人生。",
  "失败了？不是你，是上游今天有点飘。",
  "作品记得下载，不然它会离家出走。",
];

speechLines.splice(
  0,
  speechLines.length,
  "\u8ba9\u6211\u5eb7\u5eb7\u4f60\u8981\u6574\u4ec0\u4e48\u6d3b",
  "\u8fd9\u6ce2\u5fc5\u987b\u62ff\u4e0b",
  "\u8fd9\u4e0d\u5f97\u76f4\u63a5\u8d77\u98de",
  "\u8d28\u611f\u8fd9\u5757\uff0c\u62ff\u634f",
  "\u4f60\u7684\u7075\u611f\u5df2\u63a5\u5355",
  "\u6765\u90fd\u6765\u4e86\uff0c\u751f\u6210\u4e00\u4e2a",
  "\u4f60\u70b9\u4e00\u4e0b\uff0c\u6211\u52a8\u4e00\u4e0b",
  "\u8fd9\u4e0d\u5f97\u53d1\u4e2a\u670b\u53cb\u5708",
);

export const PixelPet: React.FC<PixelPetProps> = ({ onOpenChat, placement = "workspace" }) => {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [speechIndex, setSpeechIndex] = useState(0);
  const [speechVisible, setSpeechVisible] = useState(true);
  const [dragPosition, setDragPosition] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    width: number;
    height: number;
  } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    let nextIndex = 1;
    let hideTimer = 0;
    let cycleTimer = 0;

    const showNextSpeech = () => {
      setSpeechIndex(nextIndex);
      setSpeechVisible(true);
      hideTimer = window.setTimeout(() => {
        setSpeechVisible(false);
      }, 3400);
      nextIndex = (nextIndex + 1) % speechLines.length;
      cycleTimer = window.setTimeout(showNextSpeech, 7200);
    };

    hideTimer = window.setTimeout(() => {
      setSpeechVisible(false);
    }, 4200);
    cycleTimer = window.setTimeout(showNextSpeech, 7200);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(cycleTimer);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: bounds.left,
      startTop: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    didDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    setPointer({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) didDragRef.current = true;
    if (!didDragRef.current) return;

    const maxLeft = Math.max(8, window.innerWidth - drag.width - 8);
    const maxTop = Math.max(8, window.innerHeight - drag.height - 8);
    setDragPosition({
      left: Math.max(8, Math.min(maxLeft, drag.startLeft + deltaX)),
      top: Math.max(8, Math.min(maxTop, drag.startTop + deltaY)),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <button
      type="button"
      className={`pixel-pet-sensor pixel-pet-sensor--${placement}`}
      style={dragPosition ? { left: `${dragPosition.left}px`, top: `${dragPosition.top}px`, right: "auto" } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => {
        if (!dragRef.current) setPointer({ x: 0, y: 0 });
      }}
      onClick={() => {
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
        onOpenChat();
      }}
      aria-label="打开 AI 对话"
      title="打开 AI 对话"
    >
      {speechVisible && <span key={speechIndex} className="pixel-pet-bubble">{speechLines[speechIndex]}</span>}
      <div
        className="pixel-pet__pointer"
        style={{
          transform: `translate3d(${pointer.x * 4}px, ${pointer.y * 3}px, 0) rotate(${pointer.x * 4}deg)`,
        }}
      >
        <div className="pixel-pet">
          <span className="pixel-pet__body">
            <span className="pixel-pet__ear pixel-pet__ear--left" />
            <span className="pixel-pet__ear pixel-pet__ear--right" />
            <span className="pixel-pet__eye pixel-pet__eye--left" style={{ transform: `translate(${pointer.x * 2}px, ${pointer.y * 1.5}px)` }}><i /></span>
            <span className="pixel-pet__eye pixel-pet__eye--right" style={{ transform: `translate(${pointer.x * 2}px, ${pointer.y * 1.5}px)` }}><i /></span>
            <span className="pixel-pet__cheek pixel-pet__cheek--left" />
            <span className="pixel-pet__cheek pixel-pet__cheek--right" />
            <span className="pixel-pet__belly" />
            <span className="pixel-pet__mouth" />
          </span>
          <span className="pixel-pet__leg pixel-pet__leg--left" />
          <span className="pixel-pet__leg pixel-pet__leg--right" />
          <span className="pixel-pet__foot pixel-pet__foot--left" />
          <span className="pixel-pet__foot pixel-pet__foot--right" />
          <span className="pixel-pet__tail" />
        </div>
      </div>
    </button>
  );
};
