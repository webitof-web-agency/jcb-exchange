'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

type Props = {
  /** Called with a PNG data URL after each stroke, or null when the pad is cleared. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

const EXPORT_MAX_WIDTH = 600;
const EXPORT_MAX_HEIGHT = 200;

/**
 * A touch-friendly signature box (mouse, pen or finger). It draws at the screen's pixel density and exports only the
 * signed area, scaled to at most 600x200, so the PNG stays small.
 */
export default function SignaturePad({ onChange, disabled = false, invalid = false, describedBy }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const bounds = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2.4;
    context.strokeStyle = '#0f172a';
    bounds.current = null;
    setHasStrokes(false);
    onChange(null);
  }, [onChange]);

  useEffect(() => {
    setupCanvas();
    // A width change would distort what was drawn, so the pad starts again. Phones fire "resize" when the address bar
    // shows or hides (height only); that must not wipe the signature.
    let lastWidth = canvasRef.current?.getBoundingClientRect().width ?? 0;
    const handleResize = () => {
      const width = canvasRef.current?.getBoundingClientRect().width ?? 0;
      if (Math.abs(width - lastWidth) < 1) return;
      lastWidth = width;
      setupCanvas();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setupCanvas]);

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const grow = (x: number, y: number) => {
    const current = bounds.current;
    bounds.current = current
      ? { minX: Math.min(current.minX, x), minY: Math.min(current.minY, y), maxX: Math.max(current.maxX, x), maxY: Math.max(current.maxY, y) }
      : { minX: x, minY: y, maxX: x, maxY: y };
  };

  const exportSignature = () => {
    const canvas = canvasRef.current;
    const area = bounds.current;
    if (!canvas || !area) return null;
    const ratio = canvas.width / canvas.getBoundingClientRect().width || 1;
    const pad = 8;
    const sx = Math.max(0, (area.minX - pad) * ratio);
    const sy = Math.max(0, (area.minY - pad) * ratio);
    const sw = Math.min(canvas.width - sx, (area.maxX - area.minX + pad * 2) * ratio);
    const sh = Math.min(canvas.height - sy, (area.maxY - area.minY + pad * 2) * ratio);
    if (sw <= 0 || sh <= 0) return null;
    const scale = Math.min(1, EXPORT_MAX_WIDTH / sw, EXPORT_MAX_HEIGHT / sh);
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(sw * scale));
    output.height = Math.max(1, Math.round(sh * scale));
    const context = output.getContext('2d');
    if (!context) return null;
    context.drawImage(canvas, sx, sy, sw, sh, 0, 0, output.width, output.height);
    return output.toDataURL('image/png');
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const point = pointFor(event);
    last.current = point;
    grow(point.x, point.y);
    const context = event.currentTarget.getContext('2d');
    if (context) {
      context.beginPath();
      context.arc(point.x, point.y, 1.2, 0, Math.PI * 2);
      context.fillStyle = '#0f172a';
      context.fill();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    event.preventDefault();
    const point = pointFor(event);
    const context = event.currentTarget.getContext('2d');
    if (context && last.current) {
      context.beginPath();
      context.moveTo(last.current.x, last.current.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    last.current = point;
    grow(point.x, point.y);
  };

  const finishStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setHasStrokes(true);
    onChange(exportSignature());
  };

  return (
    <div>
      <div className={`relative rounded-xl border-2 border-dashed bg-white ${invalid ? 'border-red-400' : 'border-gray-300'} ${disabled ? 'opacity-60' : ''}`}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Signature box: draw your signature here with your finger, pen or mouse"
          aria-describedby={describedBy}
          className="block h-44 w-full touch-none cursor-crosshair rounded-xl sm:h-48"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
        {!hasStrokes ? (
          <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-gray-400">Sign here</span>
        ) : null}
        <span className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-gray-200" aria-hidden="true" />
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={setupCanvas}
          disabled={disabled || !hasStrokes}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Eraser className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}
