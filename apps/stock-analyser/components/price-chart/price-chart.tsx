'use client';

import { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, type IChartApi, type ISeriesApi, type CandlestickSeriesOptions, type Time } from 'lightweight-charts';
import type { OhlcvDataResponse } from '@transformotion/api-client';

interface PriceChartProps {
  data: OhlcvDataResponse;
  height?: number;
}

export function PriceChart({ data, height = 280 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: 'transparent' },
        textColor:  'hsl(var(--muted-foreground))',
      },
      grid: {
        vertLines: { color: 'hsl(var(--border))' },
        horzLines: { color: 'hsl(var(--border))' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'hsl(var(--border))' },
      timeScale:       { borderColor: 'hsl(var(--border))', timeVisible: false },
    });

    const series = chart.addCandlestickSeries({
      upColor:          'hsl(var(--signal-green, 142 76% 36%))',
      downColor:        'hsl(var(--signal-red, 0 84% 60%))',
      borderUpColor:    'hsl(var(--signal-green, 142 76% 36%))',
      borderDownColor:  'hsl(var(--signal-red, 0 84% 60%))',
      wickUpColor:      'hsl(var(--signal-green, 142 76% 36%))',
      wickDownColor:    'hsl(var(--signal-red, 0 84% 60%))',
    } as Partial<CandlestickSeriesOptions>);

    chartRef.current  = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  // height is stable; run once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update data whenever it changes
  useEffect(() => {
    if (!seriesRef.current || !data.dates.length) return;

    const bars = data.dates.map((date, i) => ({
      time:  date as Time,
      open:  data.opens[i],
      high:  data.highs[i],
      low:   data.lows[i],
      close: data.closes[i],
    })).sort((a, b) => (a.time < b.time ? -1 : 1));

    seriesRef.current.setData(bars);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-lg overflow-hidden"
    />
  );
}
