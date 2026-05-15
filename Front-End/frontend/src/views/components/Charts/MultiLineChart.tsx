import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { colors, chartColors } from '../../../styles';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

export interface MultiLineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface MultiLineChartProps {
  /** 每筆需包含 xKey 欄位與各 series.key 欄位 */
  data: Record<string, unknown>[];
  series: MultiLineSeries[];
  xKey: string;
  height?: number;
  yFormatter?: (v: number) => string;
}

export default function MultiLineChart({
  data,
  series,
  xKey,
  height = 280,
  yFormatter = (v: number) => `${v.toFixed(2)}%`,
}: MultiLineChartProps) {
  const xData = data.map(d => d[xKey] as string);

  const option = {
    animation: false,
    color: [...chartColors],
    backgroundColor: colors.panel,
    textStyle: { color: colors.dim, fontFamily: 'Open Sans, sans-serif', fontSize: 11 },
    grid: { left: 64, right: 16, top: 32, bottom: 48 },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      axisLabel: { color: colors.dim, fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: colors.dim, fontSize: 10, formatter: yFormatter },
      splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: colors.dim } },
      backgroundColor: colors.surface,
      borderColor: colors.borderHi,
      textStyle: { color: colors.text, fontSize: 12 },
      formatter: (params: unknown[]) =>
        (params as { seriesName: string; value: number; color: string }[]).map(p =>
          `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}：${yFormatter(p.value)}`
        ).join('<br/>'),
    },
    legend: {
      data: series.map(s => s.label),
      bottom: 4,
      textStyle: { color: colors.muted, fontSize: 11 },
      itemWidth: 16,
      itemHeight: 2,
    },
    series: series.map(s => ({
      name: s.label,
      type: 'line',
      data: data.map(d => d[s.key] as number ?? null),
      smooth: false,
      symbol: 'none',
      lineStyle: {
        color: s.color,
        width: 1.8,
        type: s.dashed ? 'dashed' : 'solid',
      },
      z: s.dashed ? 1 : 2,
    })),
  };

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      style={{ width: '100%', height }}
      opts={{ renderer: 'canvas' }}
    />
  );
}
