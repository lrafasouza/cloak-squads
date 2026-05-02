"use client";

import createGlobe from "cobe";
import { useEffect, useRef } from "react";

/**
 * Interactive 3D globe using cobe.
 * Shows global network of private executions.
 * Auto-rotates, pauses when off-screen to avoid frame drops.
 */
export function CobeGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<ReturnType<typeof createGlobe> | null>(null);
  const phiRef = useRef(0);
  const frameRef = useRef(0);
  const visibleRef = useRef(true);
  const widthRef = useRef(0);

  useEffect(() => {
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
      phiRef.current += 0.003;
      globe.update({ phi: phiRef.current, theta: 0.2 });
      frameRef.current = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!frameRef.current) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    const stopAnimation = () => {
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
  }, []);

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
