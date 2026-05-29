import { useEffect, useImperativeHandle, useRef } from 'react';
import { Eraser } from 'lucide-react';

export interface SignaturePadHandle {
  clear: () => void;
  toDataUrl: () => string | null;
  isEmpty: () => boolean;
}

interface Props {
  ref?: React.Ref<SignaturePadHandle>;
  height?: number;
  onStrokeEnd?: () => void;
}

export function SignaturePad({ ref, height = 220, onStrokeEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokesRef = useRef(false);
  const dprRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function setup() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#0f172a';
    }

    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, []);

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      const dpr = dprRef.current;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      hasStrokesRef.current = false;
    },
    toDataUrl() {
      const canvas = canvasRef.current;
      if (!canvas || !hasStrokesRef.current) return null;
      return canvas.toDataURL('image/png');
    },
    isEmpty() {
      return !hasStrokesRef.current;
    },
  }), []);

  function getCoords(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = getCoords(e);
    // Dot for tap-only signatures
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = lastPointRef.current;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    hasStrokesRef.current = true;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const current = getCoords(e);
    const last = lastPointRef.current;
    if (!last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    lastPointRef.current = current;
    hasStrokesRef.current = true;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    isDrawingRef.current = false;
    lastPointRef.current = null;
    onStrokeEnd?.();
  }

  function handleClearClick() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = dprRef.current;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    hasStrokesRef.current = false;
    onStrokeEnd?.();
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-md border-2 border-dashed border-input bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ touchAction: 'none', width: '100%', height: `${height}px`, display: 'block' }}
        />
      </div>
      <button
        type="button"
        onClick={handleClearClick}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Eraser className="size-3.5" />
        Pad löschen
      </button>
    </div>
  );
}