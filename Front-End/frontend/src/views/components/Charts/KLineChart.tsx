import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { CandlestickChart, BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { colors } from '../../../styles';

echarts.use([CandlestickChart, BarChart, LineChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, CanvasRenderer]);

export interface KLineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  ma5?: number;
  ma20?: number;
  ma60?: number;
}

export interface KLineChartProps {
  data: KLineBar[];
  height?: number;
  showVolume?: boolean;
  showMA?: boolean;
}

function calcMA(data: KLineBar[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
    return Math.round((sum / period) * 100) / 100;
  });
}

export default function KLineChart({ data, height = 360, showVolume = true, showMA = true }: KLineChartProps) {
  const dates  = data.map(d => d.time);
  const candle = data.map(d => [d.open, d.close, d.low, d.high]);
  const volume = data.map(d => ({
    value: d.volume ?? 0,
    itemStyle: { color: d.close >= d.open ? colors.upBg : colors.downBg },
  }));
  const ma5  = calcMA(data, 5);
  const ma20 = calcMA(data, 20);
  const ma60 = calcMA(data, 60);

  const gridBottom = showVolume ? '28%' : '12%';

  const option = {
    animation: false,
    backgroundColor: colors.panel,
    textStyle: { color: colors.dim, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 },
    grid: [
      { left: 60, right: 16, top: 12, bottom: gridBottom },
      ...(showVolume ? [{ left: 60, right: 16, top: '76%', bottom: 36 }] : []),
    ],
    xAxis: [
      {
        type: 'category', data: dates,
        gridIndex: 0, scale: true, boundaryGap: false,
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { color: colors.dim, fontSize: 10 },
        splitLine: { show: false },
      },
      ...(showVolume ? [{
        type: 'category', data: dates,
        gridIndex: 1, scale: true, boundaryGap: false,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { show: false }, splitLine: { show: false },
      }] : []),
    ],
    yAxis: [
      {
        scale: true, gridIndex: 0,
        splitLine: { lineStyle: { color: colors.border, type: 'dashed' } },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: colors.dim, fontSize: 10 },
      },
      ...(showVolume ? [{
        scale: true, gridIndex: 1,
        splitLine: { show: false },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { show: false },
      }] : []),
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', crossStyle: { color: colors.dim } },
      backgroundColor: colors.surface,
      borderColor: colors.borderHi,
      textStyle: { color: colors.text, fontSize: 12 },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: showVolume ? [0, 1] : [0], start: 50, end: 100 },
      { type: 'slider',  xAxisIndex: showVolume ? [0, 1] : [0], start: 50, end: 100,
        bottom: 4, height: 22,
        fillerColor: colors.accentBg, borderColor: colors.border,
        textStyle: { color: colors.dim, fontSize: 10 },
        handleStyle: { color: colors.accent }, moveHandleStyle: { color: colors.accent },
      },
    ],
    series: [
      {
        name: 'K線', type: 'candlestick',
        xAxisIndex: 0, yAxisIndex: 0,
        data: candle,
        itemStyle: {
          color: colors.up, color0: colors.down,
          borderColor: colors.up, borderColor0: colors.down,
        },
      },
      ...(showMA ? [
        { name: 'MA5',  type: 'line', data: ma5,  xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'none', lineStyle: { color: '#E8A838', width: 1 }, z: 3 },
        { name: 'MA20', type: 'line', data: ma20, xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'none', lineStyle: { color: '#5B8FF9', width: 1 }, z: 3 },
        { name: 'MA60', type: 'line', data: ma60, xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'none', lineStyle: { color: '#9B8FF9', width: 1 }, z: 3 },
      ] : []),
      ...(showVolume ? [{
        name: '成交量', type: 'bar',
        xAxisIndex: 1, yAxisIndex: 1,
        data: volume,
        barMaxWidth: 8,
      }] : []),
    ],
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
