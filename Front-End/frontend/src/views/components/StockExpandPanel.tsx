import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import KLineChart from './Charts/KLineChart';
import LoadingPanel from './LoadingPanel';
import type { KLineDTO, StockProfileDTO, ChipDTO, ExpandTab } from '../../types';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

/* ── 格式化工具 ── */

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* 日期格式防禦：YYYY-MM-DD → MM/DD，YYYYMMDD / YYYMMDD 同理 */
function parseChipDate(raw: unknown): string {
  const d = String(raw ?? '');
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}`;
  if (/^\d{8}$/.test(d)) return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
  if (/^\d{7}$/.test(d)) return `${d.slice(3, 5)}/${d.slice(5, 7)}`;
  return '';
}

/* ── Tab 控制列 ── */

const TABS: { key: ExpandTab; label: string }[] = [
  { key: 'kline', label: 'K 線' },
  { key: 'chip',  label: '法人 & 基本面' },
];

function TabBar({ active, onChange }: { active: ExpandTab; onChange: (t: ExpandTab) => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--border)',
      padding: '8px 0',
      minWidth: 110,
      flexShrink: 0,
      marginLeft: 8,
    }}>
      {TABS.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            background: active === t.key ? 'rgba(255,255,255,0.04)' : 'none',
            border: 'none',
            borderLeft: active === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: active === t.key ? 'var(--text-value)' : 'var(--dim)',
            padding: '9px 16px',
            textAlign: 'left',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            fontWeight: active === t.key ? 600 : 400,
            cursor: 'pointer',
            transition: 'color 0.15s, background 0.15s, border-color 0.15s',
            whiteSpace: 'nowrap',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Tab：K 線圖 ── */

function KLineSection({ data }: { data: KLineDTO[] }) {
  const bars = data.map(d => ({
    time: d.date, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
  }));
  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', height: '100%' }}>
      <KLineChart data={bars} height={310} showVolume showMA />
    </div>
  );
}

/* ── Tab：法人 & 基本面 ── */

function ChipChart({ chips }: { chips: ChipDTO[] }) {
  const recent  = chips.slice(-20);
  const dates   = recent.map(c => parseChipDate(c.date));
  const foreign = recent.map(c => c.foreign);
  const trust   = recent.map(c => c.trust);
  const dealer  = recent.map(c => c.dealer);

  const option = {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'var(--font-sans)', color: '#8888aa' },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a1a2e',
      borderColor: '#333',
      textStyle: { color: '#ccc', fontSize: 12 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any[]) => {
        const idx  = params[0]?.dataIndex ?? 0;
        const date = recent[idx]?.date ?? '';
        return `<b>${date}</b><br/>` + params.map((p: { seriesName: string; value: number }) =>
          `${p.seriesName}：${p.value > 0 ? '+' : ''}${p.value.toLocaleString()} 張`
        ).join('<br/>');
      },
    },
    legend: { top: 4, right: 8, textStyle: { color: '#8888aa', fontSize: 11 } },
    grid: { top: 36, bottom: 44, left: 52, right: 8 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: { color: '#666', fontSize: 9, rotate: 35 },
      axisLine: { lineStyle: { color: '#333' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#666', fontSize: 10,
        formatter: (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v),
      },
      splitLine: { lineStyle: { color: '#222' } },
    },
    series: [
      { name: '外資',   type: 'bar', stack: 'chip', data: foreign,
        itemStyle: { color: (p: { value: number }) => p.value >= 0 ? '#B87A7A' : '#7CA88D' } },
      { name: '投信',   type: 'bar', stack: 'chip', data: trust,
        itemStyle: { color: (p: { value: number }) => p.value >= 0 ? '#C4956A' : '#6A9EC4' } },
      { name: '自營商', type: 'bar', stack: 'chip', data: dealer,
        itemStyle: { color: (p: { value: number }) => p.value >= 0 ? '#A87AC4' : '#7AC4B8' } },
    ],
  };

  return <ReactECharts option={option} style={{ height: 310, width: '100%' }} />;
}

function ProfileGrid({ profile }: { profile: StockProfileDTO }) {
  const pct = (v: number | undefined) => v != null ? `${fmt(v * 100, 2)}%` : undefined;
  const fields: { label: string; value: string | undefined }[] = [
    { label: '產業',     value: profile.industry },
    { label: 'EPS',      value: profile.eps  != null ? fmt(profile.eps, 2)  : undefined },
    { label: 'P/E',      value: profile.pe   != null ? fmt(profile.pe, 2)   : undefined },
    { label: 'P/B',      value: profile.pb   != null ? fmt(profile.pb, 2)   : undefined },
    { label: '殖利率',   value: profile.dividendYield != null ? `${fmt(profile.dividendYield, 2)}%` : undefined },
    { label: '市值(億)', value: profile.marketCap  != null ? fmt(profile.marketCap / 1e8, 2)  : undefined },
    { label: '營收(億)', value: profile.revenue     != null ? fmt(profile.revenue / 1e8, 2)    : undefined },
    { label: '毛利率',   value: pct(profile.grossMargin) },
    { label: 'ROE',      value: pct(profile.roe) },
    { label: 'ROA',      value: pct(profile.roa) },
  ].filter(f => f.value !== undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)', marginBottom: 2 }}>基本面</span>
      {fields.map(f => (
        <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>{f.label}</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-value)', fontWeight: 600 }}>
            {f.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChipProfileSection({
  chips, profile,
}: {
  chips:   ChipDTO[]       | undefined;
  profile: StockProfileDTO | undefined;
}) {
  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 200 }}>
      <div style={{ flex: '1 1 0', minWidth: 0, borderRight: '1px solid var(--border)', padding: '4px 8px 4px 0', display: 'flex', flexDirection: 'column' }}>
        {chips && chips.length > 0
          ? <ChipChart chips={chips} />
          : <EmptyMsg text="無籌碼資料" />
        }
      </div>
      <div style={{ flex: '0 0 240px', padding: '12px 16px', overflowY: 'auto' }}>
        {profile
          ? <ProfileGrid profile={profile} />
          : <EmptyMsg text="無基本面資料" />
        }
      </div>
    </div>
  );
}

export function EmptyMsg({ text }: { text: string }) {
  return (
    <div style={{ padding: '16px', fontSize: 'var(--text-sm)', color: 'var(--dim)', textAlign: 'center' }}>
      {text}
    </div>
  );
}

/* ── 主元件（展開行 <tr>）── */

export interface StockExpandPanelProps {
  colSpan:       number;
  code:          string;
  kline:         KLineDTO[]      | undefined;
  profile:       StockProfileDTO | undefined;
  chips:         ChipDTO[]       | undefined;
  loadingExpand: boolean;
}

export default function StockExpandPanel({
  colSpan, code, kline, profile, chips, loadingExpand,
}: StockExpandPanelProps) {
  const [activeTab, setActiveTab] = useState<ExpandTab>('kline');
  const hasData = kline || profile || chips;

  return (
    <tr style={{ background: 'rgba(255,255,255,0.012)' }}>
      <td colSpan={colSpan} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
        {loadingExpand
          ? <div style={{ padding: 16 }}><LoadingPanel loading type="spinner" /></div>
          : hasData
            ? (
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <TabBar active={activeTab} onChange={setActiveTab} />
                <div style={{ flex: 1, minWidth: 0, padding: '8px 16px 12px', height: 400, overflow: 'hidden' }}>
                  {activeTab === 'kline' && (kline
                    ? <KLineSection data={kline} />
                    : <EmptyMsg text={`無法載入 ${code} 的 K 線資料`} />
                  )}
                  {activeTab === 'chip' && (
                    <ChipProfileSection chips={chips} profile={profile} />
                  )}
                </div>
              </div>
            )
            : <div style={{ padding: '12px 16px', fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>
                無法載入 {code} 資料
              </div>
        }
      </td>
    </tr>
  );
}
