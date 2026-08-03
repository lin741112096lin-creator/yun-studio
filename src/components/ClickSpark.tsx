import { useCallback, useEffect, useRef } from "react";
import type { FC, MouseEvent, ReactNode } from "react";

interface ClickSparkProps {
  sparkColor?: string;
  sparkSize?: number;
  sparkRadius?: number;
  sparkCount?: number;
  duration?: number;
  easing?: "linear" | "ease-in" | "ease-in-out" | "ease-out";
  extraScale?: number;
  children: ReactNode;
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
}

export const ClickSpark: FC<ClickSparkProps> = ({
  sparkColor = "#0084FF",
  sparkSize = 9,
  sparkRadius = 22,
  sparkCount = 8,
  duration = 430,
  easing = "ease-out",
  extraScale = 1,
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const frameRef = useRef<number | null>(null);
  const drawRef = useRef<((timestamp: number) => void) | null>(null);

  const easeFunc = useCallback(
    (value: number) => {
      switch (easing) {
        case "linear":
          return value;
        case "ease-in":
          return value * value;
        case "ease-in-out":
          return value < 0.5 ? 2 * value * value : -1 + (4 - 2 * value) * value;
        default:
          return value * (2 - value);
      }
    },
    [easing]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !parent || !context) return;

    const resizeCanvas = () => {
      const bounds = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * dpr));
      canvas.height = Math.max(1, Math.round(bounds.height * dpr));
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (timestamp: number) => {
      const bounds = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= duration) return false;

        const progress = elapsed / duration;
        const eased = easeFunc(progress);
        const distance = eased * sparkRadius * extraScale;
        const lineLength = sparkSize * (1 - eased);
        const startX = spark.x + distance * Math.cos(spark.angle);
        const startY = spark.y + distance * Math.sin(spark.angle);
        const endX = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const endY = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        context.strokeStyle = sparkColor;
        context.globalAlpha = 1 - progress;
        context.lineWidth = 2;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
        context.globalAlpha = 1;
        return true;
      });

      if (sparksRef.current.length > 0) {
        frameRef.current = requestAnimationFrame(draw);
      } else {
        frameRef.current = null;
      }
    };

    drawRef.current = draw;
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(parent);
    resizeCanvas();

    return () => {
      drawRef.current = null;
      resizeObserver.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [duration, easeFunc, extraScale, sparkColor, sparkRadius, sparkSize]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const startTime = performance.now();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    for (let index = 0; index < sparkCount; index += 1) {
      sparksRef.current.push({
        x,
        y,
        angle: (2 * Math.PI * index) / sparkCount,
        startTime,
      });
    }

    if (frameRef.current === null && drawRef.current) {
      frameRef.current = requestAnimationFrame((timestamp) => drawRef.current?.(timestamp));
    }
  };

  return (
    <div className="relative min-h-screen w-full" onClick={handleClick}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[100] block h-full w-full select-none"
      />
      {children}
    </div>
  );
};

export default ClickSpark;
