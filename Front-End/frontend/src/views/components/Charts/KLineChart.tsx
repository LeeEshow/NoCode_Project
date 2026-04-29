import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { CandlestickChart, BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { colors } from '../../../styles';
import { usePreferencesViewModel } from '../../../viewmodels/usePreferencesViewModel';
import Icon from '../Icon';

echarts.use([CandlestickChart, BarChart, LineChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, CanvasRenderer]);

export interface KLineBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
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

/* ── 切換按鈕 ── */
function ToggleBtn({
  label, color, active, onClick,
}: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 10px', borderRadius: 'var(--radius-xs)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        background: active ? `${color}22` : 'transparent',
        color: active ? color : 'var(--dim)',
        fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
        cursor: 'pointer', transition: 'all 0.15s',
        opacity: active ? 1 : 0.5,
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: active ? color : 'var(--dim)', flexShrink: 0,
      }} />
      {label}
    </button>
  );
}

const MA_COLORS = {
  ma5:  '#E8A838',
  ma20: '#5B8FF9',
  ma60: '#9B8FF9',
} as const;

export default function KLineChart({ data, height = 360, showVolume = true, showMA = true }: KLineChartProps) {
  const { prefs, setChartPref } = usePreferencesViewModel();
  const { showK: visK, showMA5: visMA5, showMA20: visMA20, showMA60: visMA60, showVolume: visVol, zoomLock: visZoomLock } = prefs.chart;

  const setVisK    = (v: boolean) => setChartPref({ showK: v });
  const setVisMA5  = (v: boolean) => setChartPref({ showMA5: v });
  const setVisMA20 = (v: boolean) => setChartPref({ showMA20: v });
  const setVisMA60 = (v: boolean) => setChartPref({ showMA60: v });
  const setVisVol  = (v: boolean) => setChartPref({ showVolume: v });

  const dates  = data.map(d => d.time);
  const candle = data.map(d => [d.open, d.close, d.low, d.high]);
  const volume = data.map(d => ({
    value: d.volume ?? 0,
    itemStyle: { color: d.close >= d.open ? colors.upBg : colors.downBg },
  }));
  const ma5  = calcMA(data, 5);
  const ma20 = calcMA(data, 20);
  const ma60 = calcMA(data, 60);

  const showVolumePanel = showVolume && visVol;
  const gridBottom = showVolumePanel ? '28%' : 52;

  const option = {
    animation: false,
    backgroundColor: colors.panel,
    textStyle: { color: colors.dim, fontFamily: 'Open Sans, sans-serif', fontSize: 11 },
    grid: [
      { left: 72, right: 32, top: 12, bottom: gridBottom },
      ...(showVolumePanel ? [{ left: 72, right: 32, top: '76%', bottom: 36 }] : []),
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
      ...(showVolumePanel ? [{
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
      ...(showVolumePanel ? [{
        scale: true, gridIndex: 1,
        splitLine: { show: false },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { show: false },
      }] : []),
    ],
    tooltip: {
      trigger: 'axis',
      appendTo: () => document.body,
      axisPointer: { type: 'cross', crossStyle: { color: colors.dim } },
      backgroundColor: colors.surface,
      borderColor: colors.borderHi,
      textStyle: { color: colors.text, fontSize: 12 },
      formatter(params: unknown[]) {
        const f = (v: unknown) => typeof v === 'number' ? v.toFixed(2) : '—';
        const row = (label: string, val: string, dot?: string) =>
          `<div style="display:flex;justify-content:space-between;gap:24px;line-height:1.7">` +
          `<span style="color:var(--dim)">${dot ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:6px"></span>` : ''}${label}</span>` +
          `<b>${val}</b></div>`;
        let html = '';
        for (const p of params as { seriesName: string; value: unknown; color: string }[]) {
          if (p.seriesName === 'K線' && Array.isArray(p.value)) {
            // ECharts trigger:'axis' 對 candlestick 的 p.value 會在首位插入 category index
            // 實際格式：[categoryIndex, open, close, low, high]（5 個元素）
            const vals = p.value as number[];
            const [o, c, l, h] = vals.length >= 5 ? vals.slice(1) : vals;
            html += `<div style="font-weight:600;margin-bottom:4px">K線</div>`;
            html += row('open',    f(o));
            html += row('close',   f(c));
            html += row('lowest',  f(l));
            html += row('highest', f(h));
          } else if (p.seriesName !== '成交量') {
            html += row(p.seriesName, f(p.value), p.color);
          }
        }
        return html;
      },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: showVolumePanel ? [0, 1] : [0], start: 50, end: 100, disabled: visZoomLock },
      { type: 'slider',  xAxisIndex: showVolumePanel ? [0, 1] : [0], start: 50, end: 100,
        bottom: 4, height: 22,
        fillerColor: colors.accentBg, borderColor: colors.border,
        textStyle: { color: colors.dim, fontSize: 10 },
        handleStyle: { color: colors.accent }, moveHandleStyle: { color: colors.accent },
      },
    ],
    series: [
      ...(visK ? [{
        name: 'K線', type: 'candlestick',
        xAxisIndex: 0, yAxisIndex: 0,
        data: candle,
        itemStyle: {
          color: colors.up, color0: colors.down,
          borderColor: colors.up, borderColor0: colors.down,
        },
      }] : []),
      ...(showMA && visMA5  ? [{ name: 'MA5',  type: 'line', color: MA_COLORS.ma5,  data: ma5,  xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'none', lineStyle: { color: MA_COLORS.ma5,  width: 1 }, z: 3 }] : []),
      ...(showMA && visMA20 ? [{ name: 'MA20', type: 'line', color: MA_COLORS.ma20, data: ma20, xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'none', lineStyle: { color: MA_COLORS.ma20, width: 1 }, z: 3 }] : []),
      ...(showMA && visMA60 ? [{ name: 'MA60', type: 'line', color: MA_COLORS.ma60, data: ma60, xAxisIndex: 0, yAxisIndex: 0, smooth: false, symbol: 'none', lineStyle: { color: MA_COLORS.ma60, width: 1 }, z: 3 }] : []),
      ...(showVolumePanel ? [{
        name: '成交量', type: 'bar',
        xAxisIndex: 1, yAxisIndex: 1,
        data: volume, barMaxWidth: 8,
      }] : []),
    ],
  };

  return (
    <div>
      {/* 控制列 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px 4px', flexWrap: 'wrap' }}>
        <ToggleBtn label="K線"  color={colors.up}    active={visK}    onClick={() => setVisK(!visK)} />
        {showMA && <>
          <ToggleBtn label="MA5"  color={MA_COLORS.ma5}  active={visMA5}  onClick={() => setVisMA5(!visMA5)} />
          <ToggleBtn label="MA20" color={MA_COLORS.ma20} active={visMA20} onClick={() => setVisMA20(!visMA20)} />
          <ToggleBtn label="MA60" color={MA_COLORS.ma60} active={visMA60} onClick={() => setVisMA60(!visMA60)} />
        </>}
        {showVolume && (
          <ToggleBtn label="成交量" color={colors.dim} active={visVol} onClick={() => setVisVol(!visVol)} />
        )}
        <button
          onClick={() => setChartPref({ zoomLock: !visZoomLock })}
          title={visZoomLock ? '已鎖定滾輪縮放，點擊解鎖' : '點擊鎖定滾輪縮放'}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26,
            background: visZoomLock ? 'var(--accent-bg)' : 'transparent',
            border: `1px solid ${visZoomLock ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-xs)',
            color: visZoomLock ? 'var(--accent)' : 'var(--dim)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <Icon name={visZoomLock ? 'lock' : 'lock_open'} size={14} />
        </button>
      </div>

      <ReactECharts
        echarts={echarts}
        option={option}
        notMerge
        style={{ width: '100%', height }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
