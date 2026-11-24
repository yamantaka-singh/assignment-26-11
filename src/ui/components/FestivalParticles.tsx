import { useEffect, useRef } from 'react';

interface TrailPoint {
  x: number;
  y: number;
  time: number;
}

interface Starlight {
  x: number;
  y: number;
  size: number;
  alpha: number;
  maxLife: number;
  age: number;
  rotation: number;
  rotationSpeed: number;
}

interface ClickRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export function FestivalParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect reduced motion settings
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId = 0;
    let running = true;
    let isLoopActive = false;

    // Handle high DPI displays
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Cursor coordinates with spring physics / lerp
    let mouseX = -999;
    let mouseY = -999;
    let auraX = -999;
    let auraY = -999;
    let auraRadius = 60;
    let targetAuraRadius = 60;
    let auraAlpha = 0;
    let targetAuraAlpha = 0;

    // Fluid ribbon trail history
    const trail: TrailPoint[] = [];
    const MAX_TRAIL_AGE = 380; // milliseconds

    // Discrete 4-point diamond starlight glints
    const starlights: Starlight[] = [];
    let lastStarDist = 0;

    // Click ripples
    const ripples: ClickRipple[] = [];

    // Draw delicate 4-pointed diamond star
    function drawStar(
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      radius: number,
      alpha: number,
      angle: number
    ) {
      c.save();
      c.translate(x, y);
      c.rotate(angle);

      c.beginPath();
      c.moveTo(0, -radius);
      c.quadraticCurveTo(0, 0, radius * 0.22, 0);
      c.quadraticCurveTo(0, 0, 0, radius);
      c.quadraticCurveTo(0, 0, -radius * 0.22, 0);
      c.quadraticCurveTo(0, 0, 0, -radius);
      c.fillStyle = `rgba(255, 230, 160, ${alpha})`;
      c.fill();

      // Bright inner core
      c.beginPath();
      c.arc(0, 0, radius * 0.25, 0, Math.PI * 2);
      c.fillStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
      c.fill();
      c.restore();
    }

    function loop() {
      if (!running) return;

      const now = performance.now();
      ctx!.clearRect(0, 0, width, height);

      // 1. Spring physics on radiant ambient aura (Diya glow)
      auraX += (mouseX - auraX) * 0.16;
      auraY += (mouseY - auraY) * 0.16;
      auraRadius += (targetAuraRadius - auraRadius) * 0.1;
      auraAlpha += (targetAuraAlpha - auraAlpha) * 0.12;

      if (auraAlpha > 0.005 && auraX > -200) {
        const auraGrad = ctx!.createRadialGradient(
          auraX,
          auraY,
          2,
          auraX,
          auraY,
          auraRadius * 1.8
        );
        auraGrad.addColorStop(0, `rgba(255, 225, 140, ${auraAlpha * 1.2})`);
        auraGrad.addColorStop(0.35, `rgba(232, 176, 74, ${auraAlpha * 0.7})`);
        auraGrad.addColorStop(0.7, `rgba(200, 90, 23, ${auraAlpha * 0.25})`);
        auraGrad.addColorStop(1, 'rgba(200, 90, 23, 0)');

        ctx!.beginPath();
        ctx!.arc(auraX, auraY, auraRadius * 1.8, 0, Math.PI * 2);
        ctx!.fillStyle = auraGrad;
        ctx!.fill();
      }

      // 2. Cull expired trail points
      while (trail.length > 0 && now - trail[0].time > MAX_TRAIL_AGE) {
        trail.shift();
      }

      // 3. Render luminous golden fluid ribbon trail
      if (trail.length > 2) {
        for (let i = 1; i < trail.length - 1; i++) {
          const pt = trail[i];
          const nextPt = trail[i + 1];
          const midX = (pt.x + nextPt.x) * 0.5;
          const midY = (pt.y + nextPt.y) * 0.5;

          const progress = i / trail.length; // 0 (tail) -> 1 (head)
          const ageRatio = 1 - (now - pt.time) / MAX_TRAIL_AGE;
          const alpha = Math.max(0, Math.min(1, ageRatio * progress));
          const widthTaper = Math.max(0.6, progress * 3.4);

          // Outer warm gold halo pass
          ctx!.beginPath();
          ctx!.moveTo(pt.x, pt.y);
          ctx!.quadraticCurveTo(pt.x, pt.y, midX, midY);
          ctx!.strokeStyle = `rgba(232, 176, 74, ${alpha * 0.35})`;
          ctx!.lineWidth = widthTaper * 2.2;
          ctx!.lineCap = 'round';
          ctx!.stroke();

          // Inner silky luminous filament pass
          ctx!.beginPath();
          ctx!.moveTo(pt.x, pt.y);
          ctx!.quadraticCurveTo(pt.x, pt.y, midX, midY);
          ctx!.strokeStyle = `rgba(255, 235, 180, ${alpha * 0.9})`;
          ctx!.lineWidth = widthTaper;
          ctx!.lineCap = 'round';
          ctx!.stroke();
        }
      }

      // 4. Render click ripples (luminous sacred wave)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += (r.maxRadius - r.radius) * 0.16 + 0.6;
        r.alpha *= 0.9;

        if (r.alpha < 0.02 || r.radius >= r.maxRadius - 1) {
          ripples.splice(i, 1);
          continue;
        }

        ctx!.beginPath();
        ctx!.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(232, 176, 74, ${r.alpha})`;
        ctx!.lineWidth = Math.max(0.7, 1.8 * (1 - r.radius / r.maxRadius));
        ctx!.stroke();
      }

      // 5. Render discrete diamond starlights
      for (let i = starlights.length - 1; i >= 0; i--) {
        const star = starlights[i];
        star.age++;
        star.rotation += star.rotationSpeed;
        const lifeRatio = 1 - star.age / star.maxLife;

        if (lifeRatio <= 0) {
          starlights.splice(i, 1);
          continue;
        }

        const currentAlpha = star.alpha * lifeRatio;
        drawStar(ctx!, star.x, star.y, star.size * lifeRatio, currentAlpha, star.rotation);
      }

      // Check if everything has settled to pause render loop and save CPU
      const hasWork =
        trail.length > 0 ||
        starlights.length > 0 ||
        ripples.length > 0 ||
        Math.abs(auraAlpha - targetAuraAlpha) > 0.01 ||
        Math.hypot(mouseX - auraX, mouseY - auraY) > 1;

      if (hasWork) {
        animId = requestAnimationFrame(loop);
      } else {
        isLoopActive = false;
        ctx!.clearRect(0, 0, width, height);
      }
    }

    function wake() {
      if (!isLoopActive && running) {
        isLoopActive = true;
        animId = requestAnimationFrame(loop);
      }
    }

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      wake();
    }

    function onPointerMove(e: PointerEvent | MouseEvent) {
      const now = performance.now();
      const prevX = mouseX;
      const prevY = mouseY;
      mouseX = e.clientX;
      mouseY = e.clientY;

      if (auraX < -500) {
        auraX = mouseX;
        auraY = mouseY;
      }

      // Check distance moved for starlight sparkle generation
      if (prevX > -500) {
        const d = Math.hypot(mouseX - prevX, mouseY - prevY);
        lastStarDist += d;
        if (lastStarDist > 55 && starlights.length < 10) {
          lastStarDist = 0;
          starlights.push({
            x: mouseX + (Math.random() - 0.5) * 8,
            y: mouseY + (Math.random() - 0.5) * 8,
            size: 3.5 + Math.random() * 2.5,
            alpha: 0.9,
            maxLife: 32,
            age: 0,
            rotation: Math.random() * Math.PI,
            rotationSpeed: (Math.random() - 0.5) * 0.04,
          });
        }
      }

      trail.push({ x: mouseX, y: mouseY, time: now });

      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === 'function' &&
        target.closest('button, a, input, select, label, .choice, [role="button"], .card, .step-tab')
      ) {
        targetAuraRadius = 95;
        targetAuraAlpha = 0.16;
      } else {
        targetAuraRadius = 55;
        targetAuraAlpha = 0.09;
      }

      wake();
    }

    function onPointerDown(e: PointerEvent | MouseEvent) {
      ripples.push({
        x: e.clientX,
        y: e.clientY,
        radius: 4,
        maxRadius: 36,
        alpha: 0.7,
      });

      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3 + Math.random() * 0.3;
        const dist = 6 + Math.random() * 8;
        starlights.push({
          x: e.clientX + Math.cos(angle) * dist,
          y: e.clientY + Math.sin(angle) * dist,
          size: 4 + Math.random() * 2,
          alpha: 1,
          maxLife: 28,
          age: 0,
          rotation: angle,
          rotationSpeed: 0.03,
        });
      }
      wake();
    }

    function onPointerLeave() {
      targetAuraAlpha = 0;
      wake();
    }

    function onVisibilityChange() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(animId);
        isLoopActive = false;
      } else {
        running = true;
        wake();
      }
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Initial canvas sizing
    resize();

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className="festival-canvas" aria-hidden="true" />;
}
