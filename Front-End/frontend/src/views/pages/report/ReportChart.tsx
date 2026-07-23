import { memo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { colors, chartColors } from '../../../styles';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

const LEGEND_KEY = 'report_legend_selected';

function loadLegendSelected(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LEGEND_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

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

export interface DailyTxBar {
  date:       string;
  buyAmount:  number;
  sellAmount: number;
}

interface Props {
  portfolioSeries: SeriesEntry[];
  stockSeries:     SeriesEntry[];
  txBars?:         DailyTxBar[];
  onBarClick?:     (date: string) => void;
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

export default memo(function ReportChart({ portfolioSeries, stockSeries, txBars, onBarClick, height = 320 }: Props) {
  const hasStocks  = stockSeries.length > 0;
  const hasTxBars  = (txBars?.length ?? 0) > 0;
  const [legendSelected, setLegendSelected] = useState<Record<string, boolean>>(loadLegendSelected);

  // 沒有股票時：以快照日期為唯一來源（含交易日期）
  // 有股票時：取交集，只保留「portfolio 有快照且每支股票都有資料」的日期，消除假日空洞
  const portfolioDates = new Set(portfolioSeries.flatMap(s => s.data.map(d => d.date)));
  const txDateSet      = new Set(txBars?.map(t => t.date) ?? []);
  let allDates: string[];
  if (!hasStocks) {
    allDates = [...new Set([...portfolioDates, ...txDateSet])].sort();
  } else {
    let valid = [...portfolioDates];
    for (const stock of stockSeries) {
      const stockDateSet = new Set(stock.data.map(d => d.date));
      valid = valid.filter(d => stockDateSet.has(d));
    }
    allDates = [...new Set([...valid, ...txDateSet])].sort();
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesOptions: any[] = [];
  const legendData: string[] = [];
  const netToRateMap = new Map<string, (number | null)[]>();

  portfolioSeries.forEach((seg, i) => {
    const netColor = chartColors[(i * 2)     % chartColors.length];
    const ratColor = chartColors[(i * 2 + 1) % chartColors.length];

    const denseRate = hasStocks
      ? shiftToZero(buildDenseByDate(seg.data, allDates, 'returnRate'))
      : buildDenseByDate(seg.data, allDates, 'returnRate');

    if (!hasStocks) {
      const netKey   = `淨損益 (${seg.label})`;
      const denseNet = buildDenseByDate(seg.data, allDates, 'netReturn');
      netToRateMap.set(netKey, denseRate);
      seriesOptions.push(
        { name: netKey, type: 'line', color: netColor, yAxisIndex: 0, data: denseNet, connectNulls: false, smooth: false, symbol: 'none', lineStyle: { color: netColor, width: 1.4, type: 'solid' }, z: 2 },
        { name: `__gap_net_${i}`, type: 'line', color: netColor, yAxisIndex: 0, data: denseNet, connectNulls: true, smooth: false, symbol: 'none', lineStyle: { color: netColor, width: 1.2, type: 'dashed', opacity: 0.4 }, z: 1 },
      );
      legendData.push(netKey);
    } else {
      const ratKey = `報酬率 (${seg.label})`;
      seriesOptions.push({
        name: ratKey,
        type: 'line',
        color: ratColor,
        yAxisIndex: 1,
        data: denseRate,
        connectNulls: false,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: ratColor, width: 1.8, type: 'solid' },
        z: 3,
      });
      seriesOptions.push({ name: `__gap_rate_${i}`, type: 'line', color: ratColor, yAxisIndex: 1, data: denseRate, connectNulls: true, smooth: false, symbol: 'none', lineStyle: { color: ratColor, width: 1.4, type: 'dashed', opacity: 0.5 }, z: 2 });
      legendData.push(ratKey);
    }
  });

  stockSeries.forEach((stock, i) => {
    const colorIdx = portfolioSeries.length * 2 + i;
    const color    = chartColors[colorIdx % chartColors.length];
    const key      = stock.label;

    const denseRate = shiftToZero(buildDenseByDate(stock.data, allDates, 'returnRate'));

    seriesOptions.push(
      { name: key, type: 'line', color, yAxisIndex: 1, data: denseRate, connectNulls: false, smooth: false, symbol: 'none', lineStyle: { color, width: 2, type: 'solid' }, z: 4 },
      { name: `__gap_stock_${i}`, type: 'line', color, yAxisIndex: 1, data: denseRate, connectNulls: true, smooth: false, symbol: 'none', lineStyle: { color, width: 1.5, type: 'dashed', opacity: 0.5 }, z: 3 },
    );
    legendData.push(key);
  });

  if (hasTxBars) {
    const txMap   = new Map((txBars ?? []).map(t => [t.date, t]));
    const buyData  = allDates.map(d => txMap.get(d)?.buyAmount  ?? 0);
    const sellData = allDates.map(d => txMap.get(d)?.sellAmount ?? 0);
    seriesOptions.push(
      { name: '買進', type: 'bar', yAxisIndex: 0, data: buyData,  itemStyle: { color: colors.accent, opacity: 0.28, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 8, barGap: '-100%', cursor: 'pointer', z: 1 },
      { name: '賣出', type: 'bar', yAxisIndex: 0, data: sellData, itemStyle: { color: colors.up,     opacity: 0.28, borderRadius: [0, 0, 3, 3] }, barMaxWidth: 8, barGap: '-100%', cursor: 'pointer', z: 1 },
    );
    legendData.push('買進', '賣出');
  }

  const xLabels = allDates.map(d => d.slice(5).replace('-', '/'));

  const option = {
    animation: false,
    backgroundColor: colors.panel,
    textStyle: { color: colors.dim, fontFamily: 'Open Sans, sans-serif', fontSize: 11 },
    grid: { left: 68, right: hasStocks ? 72 : 16, top: 28, bottom: 56 },
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
        axisLabel: { show: !hasStocks || hasTxBars, color: colors.dim, fontSize: 10, formatter: fmtAxisWan },
        splitLine: { show: !hasStocks || hasTxBars, lineStyle: { color: colors.border, type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      {
        type: 'value',
        name: hasStocks ? '相對報酬' : '',
        nameTextStyle: { color: colors.dim, fontSize: 10, padding: [0, 40, 0, 0] },
        axisLabel: {
          show: hasStocks,
          color: colors.dim,
          fontSize: 10,
          formatter: (v: number) => `${v.toFixed(1)}%`,
        },
        splitLine: { show: hasStocks, lineStyle: { color: colors.border, type: 'dashed' } },
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

        const isTxBar = (name: string) => name === '買進' || name === '賣出';
        const ps = all.filter(p =>
          !p.seriesName.startsWith('__') &&
          typeof p.value === 'number' &&
          isFinite(p.value) &&
          !(isTxBar(p.seriesName) && p.value === 0),
        );

        const lines = ps.map(p => {
          const v      = p.value as number;
          const isNet  = p.seriesName.startsWith('淨損益');
          let display: string;
          if (isNet) {
            const rate = netToRateMap.get(p.seriesName)?.[p.dataIndex] ?? null;
            const rateStr = rate !== null ? ` (${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%)` : '';
            display = `${v >= 0 ? '+' : ''}${v.toLocaleString('zh-TW')}${rateStr}`;
          } else if (isTxBar(p.seriesName)) {
            display = `${v >= 0 ? '+' : ''}${Math.abs(v).toLocaleString('zh-TW')}`;
          } else {
            display = `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
          }
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>${p.seriesName}：<b>${display}</b>`;
        });

        const header = `<div style="font-size:11px;color:${colors.muted};margin-bottom:4px">${dateStr}</div>`;
        return header + lines.join('<br/>');
      },
    },
    legend: {
      data:     legendData,
      selected: legendSelected,
      bottom: 4,
      textStyle: { color: colors.muted, fontSize: 10 },
      itemWidth: 12,
      itemHeight: 8,
    },
    series: seriesOptions,
  };

  const chartEvents: Record<string, (p: unknown) => void> = {
    legendselectchanged: (params: unknown) => {
      const p = params as { selected: Record<string, boolean> };
      setLegendSelected(p.selected);
      try { localStorage.setItem(LEGEND_KEY, JSON.stringify(p.selected)); } catch {}
    },
  };
  if (hasTxBars && onBarClick) {
    chartEvents.click = (params: unknown) => {
      const p = params as { componentType: string; seriesName: string; dataIndex: number };
      if (p.componentType !== 'series') return;
      if (p.seriesName !== '買進' && p.seriesName !== '賣出') return;
      const date = allDates[p.dataIndex];
      if (date) onBarClick(date);
    };
  }

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      notMerge
      style={{ width: '100%', height }}
      opts={{ renderer: 'canvas' }}
      onEvents={chartEvents}
    />
  );
});
