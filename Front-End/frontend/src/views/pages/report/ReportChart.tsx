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
  date:       string;
  returnRate: number;
  netReturn?: number;
}

export interface SeriesEntry {
  label: string;
  type:  'portfolio' | 'stock';
  data:  ChartDayData[];
}

interface Props {
  portfolioSeries: SeriesEntry[];
  stockSeries:     SeriesEntry[];
  targetRate:      number;
  height?:         number;
}

function buildDenseByDate(
  data: ChartDayData[],
  allDates: string[],
  key: 'returnRate' | 'netReturn',
): (number | null)[] {
  const map = new Map(data.map(d => [d.date, d]));
  return allDates.map(date => {
    const d = map.get(date);
    if (!d) return null;
    const v = key === 'returnRate' ? d.returnRate : (d.netReturn ?? null);
    if (v === null) return null;
    return key === 'returnRate'
      ? parseFloat((v * 100).toFixed(3))
      : v;
  });
}

function shiftToZero(dense: (number | null)[]): (number | null)[] {
  const base = dense.find(v => v !== null);
  if (base === undefined || base === 0) return dense;
  return dense.map(v => v !== null ? parseFloat((v - base).toFixed(3)) : null);
}

function fmtAxisWan(v: number): string {
  const abs  = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(1)}千萬`;
  if (abs >= 1_000_000)  return `${sign}${(abs / 1_000_000).toFixed(1)}百萬`;
  if (abs >= 10_000)     return `${sign}${(abs / 10_000).toFixed(0)}萬`;
  return String(v);
}

export default memo(function ReportChart({ portfolioSeries, stockSeries, targetRate, height = 320 }: Props) {
  const hasStocks = stockSeries.length > 0;

  // 有個股時以個股交易日為主軸（跳過非交易日），否則用快照日期
  const allDates = hasStocks
    ? [...new Set(stockSeries.flatMap(s => s.data.map(d => d.date)))].sort()
    : [...new Set(portfolioSeries.flatMap(s => s.data.map(d => d.date)))].sort();

  if (allDates.length === 0) {
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

  const targetPct = parseFloat((targetRate * 100).toFixed(2));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesOptions: any[] = [];
  const legendData: string[] = [];

  portfolioSeries.forEach((seg, i) => {
    const netColor = chartColors[(i * 2)     % chartColors.length];
    const ratColor = chartColors[(i * 2 + 1) % chartColors.length];
    const ratKey   = `報酬率 (${seg.label})`;

    const denseRate = hasStocks
      ? shiftToZero(buildDenseByDate(seg.data, allDates, 'returnRate'))
      : buildDenseByDate(seg.data, allDates, 'returnRate');

    if (!hasStocks) {
      const netKey   = `淨損益 (${seg.label})`;
      const denseNet = buildDenseByDate(seg.data, allDates, 'netReturn');
      seriesOptions.push(
        { name: netKey, type: 'line', yAxisIndex: 0, data: denseNet, connectNulls: false, smooth: false, symbol: 'none', lineStyle: { color: netColor, width: 1.4, type: 'solid' }, z: 2 },
        { name: `__gap_net_${i}`, type: 'line', yAxisIndex: 0, data: denseNet, connectNulls: true, smooth: false, symbol: 'none', lineStyle: { color: netColor, width: 1.2, type: 'dashed', opacity: 0.4 }, z: 1 },
      );
      legendData.push(netKey);
    }

    seriesOptions.push({
      name: ratKey,
      type: 'line',
      yAxisIndex: 1,
      data: denseRate,
      connectNulls: false,
      smooth: false,
      symbol: 'none',
      lineStyle: { color: ratColor, width: 1.8, type: 'solid' },
      z: 3,
      ...(!hasStocks && i === 0 ? {
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
    seriesOptions.push({ name: `__gap_rate_${i}`, type: 'line', yAxisIndex: 1, data: denseRate, connectNulls: true, smooth: false, symbol: 'none', lineStyle: { color: ratColor, width: 1.4, type: 'dashed', opacity: 0.5 }, z: 2 });
    legendData.push(ratKey);
  });

  stockSeries.forEach((stock, i) => {
    const colorIdx = portfolioSeries.length * 2 + i;
    const color    = chartColors[colorIdx % chartColors.length];
    const key      = stock.label;

    const denseRate = shiftToZero(buildDenseByDate(stock.data, allDates, 'returnRate'));

    seriesOptions.push(
      { name: key, type: 'line', yAxisIndex: 1, data: denseRate, connectNulls: false, smooth: false, symbol: 'none', lineStyle: { color, width: 2, type: 'solid' }, z: 4 },
      { name: `__gap_stock_${i}`, type: 'line', yAxisIndex: 1, data: denseRate, connectNulls: true, smooth: false, symbol: 'none', lineStyle: { color, width: 1.5, type: 'dashed', opacity: 0.5 }, z: 3 },
    );
    legendData.push(key);
  });

  const xLabels = allDates.map(d => d.slice(5).replace('-', '/'));

  const option = {
    animation: false,
    backgroundColor: colors.panel,
    textStyle: { color: colors.dim, fontFamily: 'Open Sans, sans-serif', fontSize: 11 },
    grid: { left: 68, right: 72, top: 28, bottom: 56 },
    xAxis: {
      type: 'category',
      data: xLabels,
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      axisLabel: {
        color: colors.dim,
        fontSize: 10,
        interval: Math.max(0, Math.floor(allDates.length / 8) - 1),
      },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: hasStocks ? '' : '淨損益',
        nameTextStyle: { color: colors.dim, fontSize: 10, padding: [0, 0, 0, 40] },
        axisLabel: { show: !hasStocks, color: colors.dim, fontSize: 10, formatter: fmtAxisWan },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: 'value',
        name: '相對報酬',
        nameTextStyle: { color: colors.dim, fontSize: 10, padding: [0, 40, 0, 0] },
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
        const all = params as { seriesName: string; value: unknown; color: string; dataIndex: number }[];
        const idx = all[0].dataIndex ?? 0;
        const dateStr = allDates[idx]?.replace(/-/g, '/') ?? '';

        const ps = all.filter(p =>
          !p.seriesName.startsWith('__') &&
          typeof p.value === 'number' &&
          isFinite(p.value),
        );

        const lines = ps.map(p => {
          const v      = p.value as number;
          const isNet  = p.seriesName.startsWith('淨損益');
          const display = isNet
            ? `${v >= 0 ? '+' : ''}${v.toLocaleString('zh-TW')}`
            : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}：<b>${display}</b>`;
        });

        const header = `<div style="font-size:11px;color:${colors.muted};margin-bottom:4px">${dateStr}</div>`;
        return header + lines.join('<br/>');
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
