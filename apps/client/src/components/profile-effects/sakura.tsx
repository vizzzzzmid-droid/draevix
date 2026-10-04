import { memo, useEffect, useMemo, useRef } from 'react';

const PETAL_COUNT = 28;
const MAX_DPR = 2;

type TPetal = {
  x: number;
  y: number;
  size: number;
  fall: number;
  sway: number;
  phase: number;
  angle: number;
  spin: number;
  hue: number;
  lightness: number;
};

const randomPetal = (
  width: number,
  height: number,
  anywhere: boolean
): TPetal => ({
  x: Math.random() * width,
  y: anywhere ? Math.random() * height : -12,
  size: 3 + Math.random() * 4,
  fall: 0.5 + Math.random() * 0.9,
  sway: 0.6 + Math.random() * 1.1,
  phase: Math.random() * Math.PI * 2,
  angle: Math.random() * Math.PI * 2,
  spin: (Math.random() - 0.5) * 0.04,
  hue: 330 + Math.random() * 18,
  lightness: 76 + Math.random() * 12
});

const SakuraEffect = memo(() => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;

    if (!canvas || !parent) return;

    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();

    const petals = Array.from({ length: PETAL_COUNT }, () =>
      randomPetal(width, height, true)
    );

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < petals.length; i += 1) {
        const petal = petals[i]!;

        ctx.save();
        ctx.translate(petal.x, petal.y);
        ctx.rotate(petal.angle + Math.sin(time / 900 + petal.phase) * 0.5);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = `hsl(${petal.hue}, 85%, ${petal.lightness}%)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, petal.size, petal.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        petal.y += petal.fall;
        petal.x += Math.sin(time / 1100 + petal.phase) * petal.sway * 0.35;
        petal.angle += petal.spin;

        if (petal.y > height + 14) {
          petals[i] = randomPetal(width, height, false);
        }
      }

      ctx.globalAlpha = 1;
    };

    draw(0);

    if (reducedMotion) return;

    const onResize = () => resize();

    window.addEventListener('resize', onResize);

    const tick = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
});

SakuraEffect.displayName = 'SakuraEffect';

export { SakuraEffect };
