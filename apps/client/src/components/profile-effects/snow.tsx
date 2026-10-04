import { memo, useEffect, useMemo, useRef } from 'react';

const FLAKE_COUNT = 60;
const MAX_DPR = 2;

type TFlake = {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  phase: number;
};

const randomFlake = (
  width: number,
  height: number,
  anywhere: boolean
): TFlake => ({
  x: Math.random() * width,
  y: anywhere ? Math.random() * height : -8,
  radius: 1 + Math.random() * 2.5,
  speed: 0.4 + Math.random() * 1.1,
  drift: 0.3 + Math.random() * 0.9,
  phase: Math.random() * Math.PI * 2
});

const SnowEffect = memo(() => {
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

    const flakes = Array.from({ length: FLAKE_COUNT }, () =>
      randomFlake(width, height, true)
    );

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      for (const flake of flakes) {
        ctx.globalAlpha = 0.4 + (flake.radius / 3.5) * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fill();

        flake.y += flake.speed;
        flake.x += Math.sin(time / 1200 + flake.phase) * flake.drift * 0.4;

        if (flake.y > height + 8) {
          Object.assign(flake, randomFlake(width, height, false));
        }
      }

      ctx.globalAlpha = 1;
    };

    // without motion there is still snow, just frozen in place
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

SnowEffect.displayName = 'SnowEffect';

export { SnowEffect };
