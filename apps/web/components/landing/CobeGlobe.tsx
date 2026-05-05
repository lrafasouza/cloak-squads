"use client";

import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";

/* ─── StealthNetwork ───
   Lightweight 2D canvas constellation for mobile.
   Compact separator with a micro-label — gives context to the particles. */
function StealthNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = canvas.parentElement!;
    let w = parent.clientWidth;
    let h = 160;

    const resize = () => {
      w = parent.clientWidth;
      h = 160;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const NODE_COUNT = 24;
    const CONNECT_DIST = 80;
    const ACCENT = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "220 70% 50%";

    interface Node {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
    }

    const nodes: Node[] = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.2 + 0.8,
    }));

    let anim = 0;
    let visible = true;

    const observer = new IntersectionObserver(
      ([e]) => {
        visible = e?.isIntersecting ?? true;
      },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    const draw = () => {
      if (!visible) {
        anim = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, w, h);

      // Update positions
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }

      // Draw connections — stronger opacity
      ctx.lineWidth = 0.7;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          if (!a || !b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < CONNECT_DIST) {
            const alpha = 1 - dist / CONNECT_DIST;
            ctx.strokeStyle = `hsl(${ACCENT} / ${alpha * 0.4})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw nodes — stronger glow
      for (const n of nodes) {
        ctx.fillStyle = `hsl(${ACCENT} / 0.9)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      anim = requestAnimationFrame(draw);
    };

    anim = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(anim);
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative w-full" style={{ height: 160 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
      />
      {/* Radial glow behind particles */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none opacity-[0.1] blur-[50px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, hsl(var(--accent)), transparent 70%)",
        }}
      />
    </div>
  );
}

/**
 * Interactive 3D globe using cobe.
 * Shows global network of private executions.
 * Auto-rotates, pauses when off-screen to avoid frame drops.
 * Disabled on mobile to prevent freezing (WebGL too heavy).
 */
export function CobeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const phiRef = useRef(0);
  const frameRef = useRef(0);
  const visibleRef = useRef(true);
  const runningRef = useRef(false);
  const widthRef = useRef(0);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile on mount — skip WebGL entirely on small screens
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    if (isMobile) return; // No WebGL on mobile

    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        widthRef.current = Math.min(rect.width, rect.height);
      }
    };

    updateSize();

    const isMobileResize = window.innerWidth < 768;
    if (isMobileResize) return; // Guard against resize edge case

    const globe = createGlobe(canvas, {
      devicePixelRatio: 1.5,
      width: 1200,
      height: 1200,
      phi: 0,
      theta: 0.2,
      dark: 1,
      diffuse: 1.2,
      scale: 1.05,
      mapSamples: 12000,
      mapBrightness: 5,
      baseColor: [0.12, 0.12, 0.14],
      markerColor: [0.79, 0.66, 0.42],
      glowColor: [0.18, 0.15, 0.12],
      offset: [0, 0],
      markers: [
        { location: [37.7749, -122.4194], size: 0.06 },
        { location: [51.5074, -0.1278], size: 0.05 },
        { location: [35.6762, 139.6503], size: 0.05 },
        { location: [1.3521, 103.8198], size: 0.04 },
        { location: [-33.8688, 151.2093], size: 0.04 },
        { location: [25.2048, 55.2708], size: 0.04 },
        { location: [55.7558, 37.6173], size: 0.04 },
        { location: [-23.5505, -46.6333], size: 0.04 },
        { location: [40.7128, -74.006], size: 0.05 },
        { location: [52.52, 13.405], size: 0.04 },
      ],
    });

    globeRef.current = globe;

    const animate = () => {
      if (!runningRef.current) return;
      phiRef.current += 0.003;
      globe.update({ phi: phiRef.current, theta: 0.2 });
      frameRef.current = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!runningRef.current) {
        runningRef.current = true;
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    const stopAnimation = () => {
      runningRef.current = false;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
    };

    // Start RAF only when visible
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) {
          startAnimation();
        } else {
          stopAnimation();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    // Also pause when tab is hidden
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopAnimation();
      } else if (visibleRef.current) {
        startAnimation();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onResize = () => {
      updateSize();
      const parent = canvas.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        const size = Math.min(rect.width, rect.height) * 1.5;
        globe.update({ width: size, height: size });
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      stopAnimation();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
      globe.destroy();
      globeRef.current = null;
    };
  }, [isMobile]);

  // Lightweight canvas constellation for mobile — stealth network vibe
  if (isMobile) {
    return <StealthNetwork />;
  }

  return (
    <div className="relative w-full max-w-[700px] md:max-w-[900px] aspect-square mx-auto">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          width: "100%",
          height: "100%",
        }}
      />
      {/* Ambient glow behind globe */}
      <div
        className="absolute inset-0 -z-10 rounded-full opacity-[0.12] blur-[100px] pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(var(--accent)), transparent 70%)" }}
      />
    </div>
  );
}
