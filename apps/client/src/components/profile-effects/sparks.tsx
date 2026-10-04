import { memo, useEffect, useMemo, useRef } from 'react';

const EMBER_COUNT = 70;
const MAX_DPR = 2;

type TEmber = {
  x: number;
  y: number;
  radius: number;
  rise: number;
  sway: number;
  phase: number;
  life: number;
  maxLife: number;
  hue: number;
};

const randomEmber = (width: number, height: number): TEmber => {
  const maxLife = 120 + Math.random() * 160;

  return {
    x: Math.random() * width,
    y: height + 4 + Math.random() * 20,
    radius: 1 + Math.random() * 2.2,
    rise: 0.8 + Math.random() * 1.6,
    sway: 0.4 + Math.random() * 1,
    phase: Math.random() * Math.PI * 2,
    life: maxLife,
    maxLife,
    hue: 12 + Math.random() * 28
  };
};

const SparksEffect = memo(() => {
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

    const embers = Array.from({ length: EMBER_COUNT }, () =>
      randomEmber(width, height)
    );

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = 0; i < embers.length; i += 1) {
        const ember = embers[i]!;
        const fade = Math.max(0, ember.life / ember.maxLife);
        const flicker = 0.55 + 0.45 * Math.sin(time / 90 + ember.phase);

        ctx.globalAlpha = fade * flicker;
        ctx.fillStyle = `hsl(${ember.hue}, 100%, ${45 + fade * 15}%)`;
        ctx.beginPath();
        ctx.arc(
          ember.x,
          ember.y,
          ember.radius * (0.5 + fade * 0.5),
          0,
          Math.PI * 2
        );
        ctx.fill();

        ember.y -= ember.rise;
        ember.x += Math.sin(time / 700 + ember.phase) * ember.sway * 0.3;
        ember.life -= 1;

        if (ember.life <= 0 || ember.y < -8) {
          embers[i] = randomEmber(width, height);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
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

SparksEffect.displayName = 'SparksEffect';

export { SparksEffect };
