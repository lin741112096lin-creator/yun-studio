import { useEffect, useRef } from "react";
import type { FC } from "react";
import "./CursorGrid.css";

type Falloff = "linear" | "smooth" | "sharp";

interface CursorGridProps {
  cellSize?: number;
  color?: string;
  radius?: number;
  falloff?: Falloff;
  holdTime?: number;
  fadeDuration?: number;
  lineWidth?: number;
  maxOpacity?: number;
  fillOpacity?: number;
  gridOpacity?: number;
  cellRadius?: number;
  clickPulse?: boolean;
  pulseSpeed?: number;
  className?: string;
}

interface ResolvedCursorGridProps {
  cellSize: number;
  color: string;
  radius: number;
  falloff: Falloff;
  holdTime: number;
  fadeDuration: number;
  lineWidth: number;
  maxOpacity: number;
  fillOpacity: number;
  gridOpacity: number;
  cellRadius: number;
  clickPulse: boolean;
  pulseSpeed: number;
}

const FALLOFF_CURVES: Record<Falloff, (value: number) => number> = {
  linear: (value) => value,
  smooth: (value) => value * value * (3 - 2 * value),
  sharp: (value) => value * value * value,
};

const DEFAULT_PROPS: ResolvedCursorGridProps = {
  cellSize: 70,
  color: "#D946EF",
  radius: 140,
  falloff: "smooth",
  holdTime: 400,
  fadeDuration: 800,
  lineWidth: 1.2,
  maxOpacity: 1,
  fillOpacity: 0,
  gridOpacity: 0,
  cellRadius: 0,
  clickPulse: true,
  pulseSpeed: 600,
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const number = parseInt(value.slice(0, 6), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
};

export const CursorGrid: FC<CursorGridProps> = ({
  cellSize = DEFAULT_PROPS.cellSize,
  color = DEFAULT_PROPS.color,
  radius = DEFAULT_PROPS.radius,
  falloff = DEFAULT_PROPS.falloff,
  holdTime = DEFAULT_PROPS.holdTime,
  fadeDuration = DEFAULT_PROPS.fadeDuration,
  lineWidth = DEFAULT_PROPS.lineWidth,
  maxOpacity = DEFAULT_PROPS.maxOpacity,
  fillOpacity = DEFAULT_PROPS.fillOpacity,
  gridOpacity = DEFAULT_PROPS.gridOpacity,
  cellRadius = DEFAULT_PROPS.cellRadius,
  clickPulse = DEFAULT_PROPS.clickPulse,
  pulseSpeed = DEFAULT_PROPS.pulseSpeed,
  className = "",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<ResolvedCursorGridProps>({
    cellSize,
    color,
    radius,
    falloff,
    holdTime,
    fadeDuration,
    lineWidth,
    maxOpacity,
    fillOpacity,
    gridOpacity,
    cellRadius,
    clickPulse,
    pulseSpeed,
  });
  const wakeRef = useRef<(() => void) | null>(null);

  propsRef.current = {
    cellSize,
    color,
    radius,
    falloff,
    holdTime,
    fadeDuration,
    lineWidth,
    maxOpacity,
    fillOpacity,
    gridOpacity,
    cellRadius,
    clickPulse,
    pulseSpeed,
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let columns = 0;
    let rows = 0;
    let offsetX = 0;
    let offsetY = 0;
    let width = 0;
    let height = 0;
    let alphas = new Float32Array(0);
    let touched = new Float64Array(0);
    let frame = 0;
    let running = false;
    let lastFrame = 0;
    const pulses: Array<{ x: number; y: number; startedAt: number }> = [];

    const rebuild = () => {
      const props = propsRef.current;
      width = container.offsetWidth;
      height = container.offsetHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.ceil(width / props.cellSize) + 1;
      rows = Math.ceil(height / props.cellSize) + 1;
      offsetX = (width - columns * props.cellSize) / 2;
      offsetY = (height - rows * props.cellSize) / 2;
      alphas = new Float32Array(columns * rows);
      touched = new Float64Array(columns * rows);
    };

    const cellCenter = (index: number): [number, number] => {
      const props = propsRef.current;
      return [
        offsetX + (index % columns) * props.cellSize + props.cellSize / 2,
        offsetY + Math.floor(index / columns) * props.cellSize + props.cellSize / 2,
      ];
    };

    const energize = (x: number, y: number, boost = 1) => {
      const props = propsRef.current;
      const activeRadius = Math.max(props.radius, 1);
      const curve = FALLOFF_CURVES[props.falloff];
      const now = performance.now();
      const minColumn = Math.max(0, Math.floor((x - activeRadius - offsetX) / props.cellSize));
      const maxColumn = Math.min(columns - 1, Math.floor((x + activeRadius - offsetX) / props.cellSize));
      const minRow = Math.max(0, Math.floor((y - activeRadius - offsetY) / props.cellSize));
      const maxRow = Math.min(rows - 1, Math.floor((y + activeRadius - offsetY) / props.cellSize));

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const index = row * columns + column;
          const [centerX, centerY] = cellCenter(index);
          const distance = Math.hypot(centerX - x, centerY - y);
          if (distance > activeRadius) continue;
          const level = curve(1 - distance / activeRadius) * props.maxOpacity * boost;
          if (level > alphas[index]) alphas[index] = level;
          if (level > 0) touched[index] = now;
        }
      }
    };

    const draw = (now: number) => {
      const props = propsRef.current;
      const delta = Math.min(now - lastFrame, 50);
      lastFrame = now;
      context.clearRect(0, 0, width, height);
      const [red, green, blue] = hexToRgb(props.color);

      if (props.gridOpacity > 0) {
        context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${props.gridOpacity})`;
        context.lineWidth = 1;
        context.beginPath();
        for (let column = 0; column <= columns; column += 1) {
          const x = Math.round(offsetX + column * props.cellSize) + 0.5;
          context.moveTo(x, 0);
          context.lineTo(x, height);
        }
        for (let row = 0; row <= rows; row += 1) {
          const y = Math.round(offsetY + row * props.cellSize) + 0.5;
          context.moveTo(0, y);
          context.lineTo(width, y);
        }
        context.stroke();
      }

      for (let pulseIndex = pulses.length - 1; pulseIndex >= 0; pulseIndex -= 1) {
        const pulse = pulses[pulseIndex];
        const ringRadius = ((now - pulse.startedAt) / 1000) * props.pulseSpeed;
        if (ringRadius > Math.hypot(width, height)) {
          pulses.splice(pulseIndex, 1);
          continue;
        }
        const band = props.cellSize;
        const minColumn = Math.max(0, Math.floor((pulse.x - ringRadius - band - offsetX) / props.cellSize));
        const maxColumn = Math.min(columns - 1, Math.floor((pulse.x + ringRadius + band - offsetX) / props.cellSize));
        const minRow = Math.max(0, Math.floor((pulse.y - ringRadius - band - offsetY) / props.cellSize));
        const maxRow = Math.min(rows - 1, Math.floor((pulse.y + ringRadius + band - offsetY) / props.cellSize));

        for (let row = minRow; row <= maxRow; row += 1) {
          for (let column = minColumn; column <= maxColumn; column += 1) {
            const index = row * columns + column;
            const [centerX, centerY] = cellCenter(index);
            if (Math.abs(Math.hypot(centerX - pulse.x, centerY - pulse.y) - ringRadius) < band / 2) {
              alphas[index] = Math.max(alphas[index], props.maxOpacity);
              touched[index] = now;
            }
          }
        }
      }

      let visible = pulses.length > 0;
      const fadeStep = delta / Math.max(props.fadeDuration, 16);
      const halfCell = props.cellSize / 2;

      for (let index = 0; index < alphas.length; index += 1) {
        let alpha = alphas[index];
        if (alpha <= 0) continue;
        if (now - touched[index] > props.holdTime) {
          alpha = Math.max(0, alpha - fadeStep);
          alphas[index] = alpha;
          if (alpha <= 0) continue;
        }
        visible = true;
        const [centerX, centerY] = cellCenter(index);
        const gradient = context.createRadialGradient(centerX, centerY, halfCell * 0.1, centerX, centerY, props.cellSize);
        gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
        const x = centerX - halfCell + 0.5;
        const y = centerY - halfCell + 0.5;
        const size = props.cellSize - 1;

        context.beginPath();
        if (props.cellRadius > 0) {
          context.roundRect(x, y, size, size, props.cellRadius);
        } else {
          context.rect(x, y, size, size);
        }
        if (props.fillOpacity > 0) {
          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha * props.fillOpacity})`;
          context.fill();
        }
        context.strokeStyle = gradient;
        context.lineWidth = props.lineWidth;
        context.stroke();
      }

      if (visible) {
        frame = requestAnimationFrame(draw);
      } else {
        running = false;
        if (props.gridOpacity <= 0) context.clearRect(0, 0, width, height);
      }
    };

    const wake = () => {
      if (running) return;
      running = true;
      lastFrame = performance.now();
      frame = requestAnimationFrame(draw);
    };
    wakeRef.current = wake;

    const toLocal = (event: PointerEvent): [number, number] => {
      const bounds = canvas.getBoundingClientRect();
      return [event.clientX - bounds.left, event.clientY - bounds.top];
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const [x, y] = toLocal(event);
      energize(x, y);
      wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      const [x, y] = toLocal(event);
      if (!propsRef.current.clickPulse || x < 0 || y < 0 || x > width || y > height) return;
      pulses.push({ x, y, startedAt: performance.now() });
      wake();
    };

    const resizeObserver = new ResizeObserver(() => {
      rebuild();
      wake();
    });

    resizeObserver.observe(container);
    rebuild();
    wake();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      wakeRef.current = null;
    };
  }, [cellSize]);

  useEffect(() => {
    wakeRef.current?.();
  }, [gridOpacity, color, lineWidth, maxOpacity, fillOpacity, cellRadius]);

  return (
    <div ref={containerRef} className={`cursor-grid${className ? ` ${className}` : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="cursor-grid__canvas" />
    </div>
  );
};

export default CursorGrid;
