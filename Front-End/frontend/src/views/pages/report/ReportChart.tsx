import { memo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { colors, chartColors } from '../../../styles';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

export interface ChartDayData {
  dayIndex: number;   // 日曆相對天數（含空洞）
  returnRate: number;
  totalInvested: number;
  date: string;       // "YYYY-MM-DD"
}

interface Props {
  series1: ChartDayData[];
  series2?: ChartDayData[] | null;
  targetRate: number;
  height?: number;
}

/** 依 dayIndex 建立密集陣列，遺失天填 null */
function buildDense(
  data: ChartDayData[],
  totalDays: number,
  key: 'returnRate' | 'totalInvested',
): (number | null)[] {
  const map = new Map(data.map(d => [d.dayIndex, d]));
  return Array.from({ length: totalDays }, (_, i) => {
    const d = map.get(i + 1);
    if (!d) return null;
    return key === 'returnRate'
      ? parseFloat((d.returnRate * 100).toFixed(3))
      : d.totalInvested;
  });
}

/** 依 dayIndex 建立日期密集陣列，遺失天填 null */
function buildDenseDates(data: ChartDayData[], totalDays: number): (string | null)[] {
  const map = new Map(data.map(d => [d.dayIndex, d.date]));
  return Array.from({ length: totalDays }, (_, i) => map.get(i + 1) ?? null);
}

/** Y 軸標籤縮寫（僅供軸刻度） */
function fmtAxisWan(v: number): string {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}千萬`;
  if (v >= 1_000_000)  return `${(v / 1_000_000).toFixed(1)}百萬`;
  if (v >= 10_000)     return `${(v / 10_000).toFixed(0)}萬`;
  return String(v);
}

export default memo(function ReportChart({ series1, series2, targetRate, height = 320 }: Props) {
  const maxDay1 = series1.length > 0 ? series1[series1.length - 1].dayIndex : 0;
  const maxDay2 = series2 && series2.length > 0 ? series2[series2.length - 1].dayIndex : 0;
  const totalDays = Math.max(maxDay1, maxDay2);

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

  const xData     = Array.from({ length: totalDays }, (_, i) => `第 ${i + 1} 日`);
  const r1Inv     = buildDense(series1, totalDays, 'totalInvested');
  const r1Rate    = buildDense(series1, totalDays, 'returnRate');
  const r2Inv     = series2 ? buildDense(series2, totalDays, 'totalInvested') : null;
  const r2Rate    = series2 ? buildDense(series2, totalDays, 'returnRate') : null;
  const dates1    = buildDenseDates(series1, totalDays);
  const dates2    = series2 ? buildDenseDates(series2, totalDays) : null;
  const targetPct = parseFloat((targetRate * 100).toFixed(2));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesList: any[] = [

    /* ── 段一 Bar：累計投入 ── */
    {
      name: '累計投入 (段一)',
      type: 'bar',
      yAxisIndex: 0,
      data: r1Inv,
      barMaxWidth: 14,
      barGap: '30%',
      itemStyle: {
        color: 'rgba(106,143,181,0.20)',
        borderColor: 'rgba(106,143,181,0.50)',
        borderWidth: 1,
        borderRadius: [2, 2, 0, 0],
      },
      z: 1,
    },

    /* ── 段一 Line：報酬率 Solid（連續段） ── */
    {
      name: '報酬率 (段一)',
      type: 'line',
      yAxisIndex: 1,
      data: r1Rate,
      connectNulls: false,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: chartColors[0], width: 1.8, type: 'solid' },
      z: 3,
      markLine: {
        silent: true,
        data: [{ yAxis: targetPct }],
        lineStyle: { type: 'dashed', color: colors.accent, width: 1.2, opacity: 0.7 },
        label: {
          position: 'end',
          formatter: `目標 ${targetPct.toFixed(1)}%`,
          color: colors.accent,
          fontSize: 10,
        },
        symbol: ['none', 'none'],
      },
    },

    /* ── 段一 Ghost：橋接遺失日的虛線（低 z，被 Solid 覆蓋） ── */
    {
      name: '__gap_rate1',
      type: 'line',
      yAxisIndex: 1,
      data: r1Rate,
      connectNulls: true,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: chartColors[0], width: 1.4, type: 'dashed', opacity: 0.5 },
      z: 2,
    },
  ];

  if (r2Inv) {
    seriesList.push({
      name: '累計投入 (段二)',
      type: 'bar',
      yAxisIndex: 0,
      data: r2Inv,
      barMaxWidth: 14,
      barGap: '30%',
      itemStyle: {
        color: 'rgba(184,122,122,0.16)',
        borderColor: 'rgba(184,122,122,0.38)',
        borderWidth: 1,
        borderRadius: [2, 2, 0, 0],
      },
      z: 1,
    });
  }
  if (r2Rate) {
    seriesList.push(
      {
        name: '報酬率 (段二)',
        type: 'line',
        yAxisIndex: 1,
        data: r2Rate,
        connectNulls: false,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: chartColors[1], width: 1.8, type: 'solid' },
        z: 3,
      },
      {
        name: '__gap_rate2',
        type: 'line',
        yAxisIndex: 1,
        data: r2Rate,
        connectNulls: true,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: chartColors[1], width: 1.4, type: 'dashed', opacity: 0.5 },
        z: 2,
      },
    );
  }

  /* Legend 過濾掉 ghost 系列 */
  const legendData = seriesList
    .filter((s: { name: string }) => !s.name.startsWith('__'))
    .map((s: { name: string }) => s.name);

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
        name: '累計投入',
        nameTextStyle: { color: colors.dim, fontSize: 10, padding: [0, 0, 0, 40] },
        min: 0,
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

        /* 查出兩段的實際日期（可能為 null，即遺失日） */
        const d1 = dates1[idx];
        const d2 = dates2 ? dates2[idx] : null;
        const dateStr = [
          d1 ? (dates2 ? `段一 ${d1.replace(/-/g, '/')}` : d1.replace(/-/g, '/')) : null,
          d2 ? `段二 ${d2.replace(/-/g, '/')}` : null,
        ].filter(Boolean).join('　');

        /* 過濾 ghost 系列，且 value 必須是有限數字（ECharts 對空值可能回傳 '-' 字串） */
        const ps = all.filter(p =>
          !p.seriesName.startsWith('__') &&
          typeof p.value === 'number' &&
          isFinite(p.value),
        );

        const lines = ps.map(p => {
          const v      = p.value as number;
          const isRate = p.seriesName.includes('報酬率');
          const display = isRate ? `${v.toFixed(2)}%` : v.toLocaleString('zh-TW');
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
    series: seriesList,
  };

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      style={{ width: '100%', height }}
      opts={{ renderer: 'canvas' }}
    />
  );
});
