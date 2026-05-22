import { memo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { colors, chartColors } from '../../../styles';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

export interface ChartDayData {
  dayIndex: number;
  returnRate: number;
  netReturn: number;
  date: string;
}

export interface SeriesEntry {
  label: string;
  data: ChartDayData[];
}

interface Props {
  seriesList: SeriesEntry[];
  targetRate: number;
  height?: number;
}

function buildDense(
  data: ChartDayData[],
  totalDays: number,
  key: 'returnRate' | 'netReturn',
): (number | null)[] {
  const map = new Map(data.map(d => [d.dayIndex, d]));
  return Array.from({ length: totalDays }, (_, i) => {
    const d = map.get(i + 1);
    if (!d) return null;
    return key === 'returnRate'
      ? parseFloat((d.returnRate * 100).toFixed(3))
      : d.netReturn;
  });
}

function buildDenseDates(data: ChartDayData[], totalDays: number): (string | null)[] {
  const map = new Map(data.map(d => [d.dayIndex, d.date]));
  return Array.from({ length: totalDays }, (_, i) => map.get(i + 1) ?? null);
}

function fmtAxisWan(v: number): string {
  const abs  = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(1)}千萬`;
  if (abs >= 1_000_000)  return `${sign}${(abs / 1_000_000).toFixed(1)}百萬`;
  if (abs >= 10_000)     return `${sign}${(abs / 10_000).toFixed(0)}萬`;
  return String(v);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default memo(function ReportChart({ seriesList, targetRate, height = 320 }: Props) {
  const totalDays = seriesList.reduce((max, s) => {
    if (s.data.length === 0) return max;
    return Math.max(max, s.data[s.data.length - 1].dayIndex);
  }, 0);

  if (totalDays === 0) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--dim)',
        fontSize: 'var(--text-sm)',
        background: 'var(--panel)',
      }}>
        此區間無快照資料
      </div>
    );
  }

  const xData         = Array.from({ length: totalDays }, (_, i) => `第 ${i + 1} 日`);
  const targetPct     = parseFloat((targetRate * 100).toFixed(2));
  const denseNetList  = seriesList.map(s => buildDense(s.data, totalDays, 'netReturn'));
  const denseRateList = seriesList.map(s => buildDense(s.data, totalDays, 'returnRate'));
  const denseDateList = seriesList.map(s => buildDenseDates(s.data, totalDays));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesOptions: any[] = [];
  const legendData: string[] = [];

  seriesList.forEach((seg, i) => {
    const netColor = chartColors[(i * 2)     % chartColors.length];
    const ratColor = chartColors[(i * 2 + 1) % chartColors.length];
    const netKey   = `淨損益 (${seg.label})`;
    const ratKey   = `報酬率 (${seg.label})`;

    seriesOptions.push({
      name: netKey,
      type: 'line',
      yAxisIndex: 0,
      data: denseNetList[i],
      connectNulls: false,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: netColor, width: 1.4, type: 'solid' },
      z: 2,
    });
    legendData.push(netKey);

    seriesOptions.push({
      name: `__gap_net_${i}`,
      type: 'line',
      yAxisIndex: 0,
      data: denseNetList[i],
      connectNulls: true,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: netColor, width: 1.2, type: 'dashed', opacity: 0.4 },
      z: 1,
    });

    seriesOptions.push({
      name: ratKey,
      type: 'line',
      yAxisIndex: 1,
      data: denseRateList[i],
      connectNulls: false,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: ratColor, width: 1.8, type: 'solid' },
      z: 3,
      ...(i === 0 ? {
        markLine: {
          silent: true,
          data: [{ yAxis: targetPct }],
          lineStyle: { type: 'dashed', color: colors.accent, width: 1.2, opacity: 0.7 },
          label: {
            position: 'insideEndTop',
            formatter: `目標 ${targetPct.toFixed(1)}%`,
            color: colors.accent,
            fontSize: 10,
          },
          symbol: ['none', 'none'],
        },
      } : {}),
    });
    legendData.push(ratKey);

    seriesOptions.push({
      name: `__gap_rate_${i}`,
      type: 'line',
      yAxisIndex: 1,
      data: denseRateList[i],
      connectNulls: true,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: ratColor, width: 1.4, type: 'dashed', opacity: 0.5 },
      z: 2,
    });
  });

  const option = {
    animation: false,
    backgroundColor: colors.panel,
    textStyle: { color: colors.dim, fontFamily: 'Open Sans, sans-serif', fontSize: 11 },
    grid: { left: 68, right: 72, top: 28, bottom: 56 },
    xAxis: {
      type: 'category',
      data: xData,
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      axisLabel: {
        color: colors.dim,
        fontSize: 10,
        interval: Math.max(0, Math.floor(totalDays / 8) - 1),
      },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: '淨損益',
        nameTextStyle: { color: colors.dim, fontSize: 10, padding: [0, 0, 0, 40] },
        axisLabel: { color: colors.dim, fontSize: 10, formatter: fmtAxisWan },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: 'value',
        name: '報酬率',
        nameTextStyle: { color: colors.dim, fontSize: 10, padding: [0, 40, 0, 0] },
        min: (value: { min: number }) => {
          const d = isFinite(value.min) ? value.min : 0;
          return parseFloat((Math.min(d, 0) * 1.2).toFixed(2));
        },
        max: (value: { max: number }) => {
          const d = isFinite(value.max) ? value.max : 0;
          return parseFloat(Math.max(d * 1.15, targetPct * 1.3).toFixed(2));
        },
        axisLabel: {
          color: colors.dim,
          fontSize: 10,
          formatter: (v: number) => `${v.toFixed(1)}%`,
        },
        splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: colors.dim, type: 'dashed' } },
      backgroundColor: colors.surface,
      borderColor: colors.borderHi,
      textStyle: { color: colors.text, fontSize: 12 },
      appendTo: () => document.body,
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || !params.length) return '';
        const all = params as { seriesName: string; value: unknown; color: string; axisValue: string; dataIndex: number }[];
        const idx = all[0].dataIndex ?? 0;

        const dateStr = seriesList
          .map((seg, i) => {
            const d = denseDateList[i]?.[idx];
            return d ? `${seg.label} ${d.replace(/-/g, '/')}` : null;
          })
          .filter(Boolean)
          .join('　');

        const ps = all.filter(p =>
          !p.seriesName.startsWith('__') &&
          typeof p.value === 'number' &&
          isFinite(p.value),
        );

        const lines = ps.map(p => {
          const v      = p.value as number;
          const isRate = p.seriesName.includes('報酬率');
          const display = isRate
            ? `${v.toFixed(2)}%`
            : `${v >= 0 ? '+' : ''}${v.toLocaleString('zh-TW')}`;
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}：<b>${display}</b>`;
        });

        const header = `<div style="font-size:10px;color:${colors.dim};margin-bottom:2px">${all[0].axisValue}</div>`;
        const dateLine = dateStr
          ? `<div style="font-size:11px;color:${colors.muted};margin-bottom:5px;letter-spacing:0.02em">${dateStr}</div>`
          : '';
        return header + dateLine + lines.join('<br/>');
      },
    },
    legend: {
      data: legendData,
      bottom: 4,
      textStyle: { color: colors.muted, fontSize: 10 },
      itemWidth: 12,
      itemHeight: 8,
    },
    series: seriesOptions,
  };

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      style={{ width: '100%', height }}
      opts={{ renderer: 'canvas' }}
    />
  );
});
