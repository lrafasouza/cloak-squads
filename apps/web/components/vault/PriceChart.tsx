"use client";

import type { ChartPoint } from "@/lib/hooks/useSolChartData";
import {
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
  createChart,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

interface PriceChartProps {
  data: ChartPoint[];
  loading?: boolean;
}

export function PriceChart({ data, loading }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "#8B8B8B",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1E1E1E" },
        horzLines: { color: "#1E1E1E" },
      },
      rightPriceScale: {
        borderColor: "#2A2A2A",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#2A2A2A",
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: "#D4AF3780", style: 2, width: 1 },
        horzLine: { color: "#D4AF3780", style: 2, width: 1 },
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#D4AF37",
      topColor: "#D4AF3720",
      bottomColor: "#D4AF3705",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#D4AF37",
      crosshairMarkerBackgroundColor: "#0A0A0A",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const ro = new ResizeObserver(handleResize);
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return;
    const formatted = data.map((d) => ({
      time: d.time as Time,
      value: d.value,
    }));
    seriesRef.current.setData(formatted);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
      </div>
    );
  }

  return (
    <div className="relative h-80 w-full">
      <div ref={chartContainerRef} className="h-full w-full" />
    </div>
  );
}
