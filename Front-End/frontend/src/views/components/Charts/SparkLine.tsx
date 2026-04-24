import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { colors } from '../../../styles';

echarts.use([LineChart, GridComponent, CanvasRenderer]);

export interface SparkLineProps {
  data: number[];
  height?: number;
}

export default function SparkLine({ data, height = 40 }: SparkLineProps) {
  const isUp = data.length >= 2 && data[data.length - 1] >= data[0];
  const color = isUp ? colors.up : colors.down;

  const option = {
    animation: false,
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [{
      type: 'line',
      data,
      smooth: false,
      symbol: 'none',
      lineStyle: { color, width: 1.5 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: isUp ? colors.upBg : colors.downBg },
          { offset: 1, color: 'transparent' },
        ]),
      },
    }],
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
