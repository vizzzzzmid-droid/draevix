import { memo, useEffect, useMemo, useRef } from 'react';

const PARTICLE_COUNT = 55;
const MAX_DPR = 2;

const PALETTE = ['#60a5fa', '#a78bfa', '#f472b6', '#22d3ee', '#c084fc'];

type TGlowDot = {
  x: number;
  y: number;
  radius: number;
  driftX: number;
  driftY: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
  color: string;
};

const randomDot = (
  width: number,
  height: number,
  anywhere: boolean
): TGlowDot => ({
  x: Math.random() * width,
  y: anywhere ? Math.random() * height : Math.random() * height,
  radius: 0.8 + Math.random() * 1.8,
  driftX: (Math.random() - 0.5) * 0.35,
  driftY: (Math.random() - 0.5) * 0.35,
  baseAlpha: 0.35 + Math.random() * 0.35,
  twinkleSpeed: 0.6 + Math.random() * 1.8,
  phase: Math.random() * Math.PI * 2,
  color: PALETTE[Math.floor(Math.random() * PALETTE.length)]!
});

const GlowParticlesEffect = memo(() => {
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

    const dots = Array.from({ length: PARTICLE_COUNT }, () =>
      randomDot(width, height, true)
    );

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      for (const dot of dots) {
        const twinkle =
          dot.baseAlpha *
          (0.55 +
            0.45 * Math.sin((time / 1000) * dot.twinkleSpeed + dot.phase));

        ctx.globalAlpha = Math.max(0, Math.min(1, twinkle));
        ctx.fillStyle = dot.color;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        ctx.fill();

        dot.x += dot.driftX;
        dot.y += dot.driftY;

        if (dot.x < -4) dot.x = width + 4;
        if (dot.x > width + 4) dot.x = -4;
        if (dot.y < -4) dot.y = height + 4;
        if (dot.y > height + 4) dot.y = -4;
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

GlowParticlesEffect.displayName = 'GlowParticlesEffect';

export { GlowParticlesEffect };
