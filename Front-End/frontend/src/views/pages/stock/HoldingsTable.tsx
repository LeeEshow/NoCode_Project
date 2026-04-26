import { useEffect, useState, Fragment } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import SparkLine from '../../components/Charts/SparkLine';
import KLineChart from '../../components/Charts/KLineChart';
import LoadingPanel from '../../components/LoadingPanel';
import Icon from '../../components/Icon';
import type { HoldingDTO, KLineDTO, StockProfileDTO, ChipDTO, ExpandTab } from '../../../types';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* ── 操作按鈕 ── */
function OpBtn({
  title, accent, onClick, children,
}: { title: string; accent?: boolean; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  return (
    <button
      className={`btn-icon${accent ? ' accent' : ''}`}
      title={title}
      onClick={e => { e.stopPropagation(); onClick(e); }}
    >
      {children}
    </button>
  );
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

/* 日期格式防禦：YYYY-MM-DD → MM/DD，YYYYMMDD / YYYMMDD 同理，其他傳回空字串 */
function parseChipDate(raw: unknown): string {
  const d = String(raw ?? '');
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);  // 嚴格比對完整 ISO
  if (iso) return `${iso[2]}/${iso[3]}`;
  if (/^\d{8}$/.test(d)) return `${d.slice(4, 6)}/${d.slice(6, 8)}`; // YYYYMMDD
  if (/^\d{7}$/.test(d)) return `${d.slice(3, 5)}/${d.slice(5, 7)}`; // ROC YYYMMDD
  return '';  // 格式異常則不顯示，避免顯示 garbage
}

/* ── Tab：法人 & 基本面（左右排版）── */
function ChipProfileSection({
  chips, profile,
}: {
  chips:   ChipDTO[]       | undefined;
  profile: StockProfileDTO | undefined;
}) {
  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 200 }}>
      {/* 左：三大法人 */}
      <div style={{ flex: '1 1 0', minWidth: 0, borderRight: '1px solid var(--border)', padding: '4px 8px 4px 0', display: 'flex', flexDirection: 'column' }}>
        {chips && chips.length > 0
          ? <ChipChart chips={chips} />
          : <EmptyMsg text="無籌碼資料" />
        }
      </div>
      {/* 右：基本面 */}
      <div style={{ flex: '0 0 240px', padding: '12px 16px', overflowY: 'auto' }}>
        {profile
          ? <ProfileGrid profile={profile} />
          : <EmptyMsg text="無基本面資料" />
        }
      </div>
    </div>
  );
}

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
      { name: '外資',  type: 'bar', stack: 'chip', data: foreign,
        itemStyle: { color: (p: { value: number }) => p.value >= 0 ? '#B87A7A' : '#7CA88D' } },
      { name: '投信',  type: 'bar', stack: 'chip', data: trust,
        itemStyle: { color: (p: { value: number }) => p.value >= 0 ? '#C4956A' : '#6A9EC4' } },
      { name: '自營商',type: 'bar', stack: 'chip', data: dealer,
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

function EmptyMsg({ text }: { text: string }) {
  return (
    <div style={{ padding: '16px', fontSize: 'var(--text-sm)', color: 'var(--dim)', textAlign: 'center' }}>
      {text}
    </div>
  );
}

/* ── 展開行（Tab 架構）── */
function ExpandRow({
  colSpan, code, kline, profile, chips, loadingExpand,
}: {
  colSpan:       number;
  code:          string;
  kline:         KLineDTO[]      | undefined;
  profile:       StockProfileDTO | undefined;
  chips:         ChipDTO[]       | undefined;
  loadingExpand: boolean;
}) {
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

/* ── 主列（可拖拉）── */
function HoldingRow({
  h, sparkline, isExpanded,
  onToggle, onHistory, onAddTx,
}: {
  h:          HoldingDTO;
  sparkline:  number[];
  isExpanded: boolean;
  onToggle:   (code: string) => void;
  onHistory:  (code: string, name: string) => void;
  onAddTx:    (code: string, name: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: h.stockCode });

  const cls = h.changePct === 0 ? 'txt-flat' : (h.isUp ? 'txt-up' : 'txt-down');
  const arrow = h.changePct === 0 ? '—' : (h.isUp ? '▲' : '▼');
  const sign  = h.changePct > 0 ? '+' : '';

  return (
    <tr
      ref={setNodeRef}
      onClick={() => onToggle(h.stockCode)}
      style={{
        background: isExpanded ? 'rgba(255,255,255,0.02)' : undefined,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : undefined,
      }}
    >
      <td style={{ paddingLeft: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            {...attributes} {...listeners}
            onClick={e => e.stopPropagation()}
            className="drag-handle"
          >
            <Icon name="drag_indicator" size={18} />
          </span>
          <a
            href={`https://www.wantgoo.com/stock/etf/${h.stockCode}/dividend-policy/ex-dividend`}
            target="_blank"
            rel="noopener noreferrer"
            className="stock-link"
            onClick={e => e.stopPropagation()}
          >
            <div className="stock-code">{h.stockCode}</div>
            <div className="stock-name">{h.stockName.length > 12 ? h.stockName.slice(0, 12) + '...' : h.stockName}</div>
          </a>
        </div>
      </td>
      <td className="right">
        <span className="num-value">{fmt(h.currentPrice, 2)}</span>
      </td>
      <td className="right">
        <span className={`change-tag ${cls}`}>
          {arrow}&nbsp;{fmt(Math.abs(h.change), 2)}&nbsp;&nbsp;{sign}{fmt(h.changePct, 2)}%
        </span>
      </td>
      <td className="center">
        {sparkline.length > 1
          ? <div style={{ width: 72, height: 24, display: 'inline-block' }}>
              <SparkLine data={sparkline} height={24} />
            </div>
          : <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>—</span>
        }
      </td>
      <td className="right num-value" style={{ color: 'var(--muted)' }}>{fmt(h.costAvg, 2)}</td>
      <td className="right num-value" style={{ color: 'var(--muted)' }}>{fmt(h.shares, 0)}</td>
      <td className="right">
        <span className={`mono ${h.returnPct === 0 ? 'txt-flat' : (h.returnPct > 0 ? 'txt-up' : 'txt-down')}`}
          style={{ fontWeight: 600 }}>
          {h.returnPct > 0 ? '+' : ''}{fmt(h.returnPct, 2)}%
        </span>
      </td>
      <td className="center">
        <div style={{ display: 'inline-flex', gap: 5 }}>
          <OpBtn title="交易紀錄" onClick={() => onHistory(h.stockCode, h.stockName)}>
            <Icon name="history" size={21} />
          </OpBtn>
          <OpBtn title="新增交易" accent onClick={() => onAddTx(h.stockCode, h.stockName)}>
            <Icon name="add" size={21} />
          </OpBtn>
        </div>
      </td>
    </tr>
  );
}

/* ── 主元件 ── */
export interface HoldingsTableProps {
  items:        HoldingDTO[];
  sparklines:   Record<string, number[]>;
  klines:       Record<string, KLineDTO[]>;
  profiles:     Record<string, StockProfileDTO>;
  chips:        Record<string, ChipDTO[]>;
  expandedCode: string | null;
  onToggle:     (code: string) => void;
  onExpandLoad: (code: string) => void;
  onHistory:    (code: string, name: string) => void;
  onAddTx:      (code: string, name: string) => void;
  onReorder:    (newItems: HoldingDTO[]) => void;
}

export default function HoldingsTable({
  items, sparklines, klines, profiles, chips,
  expandedCode, onToggle, onExpandLoad, onHistory, onAddTx, onReorder,
}: HoldingsTableProps) {
  useEffect(() => {
    if (expandedCode) onExpandLoad(expandedCode);
  }, [expandedCode, onExpandLoad]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(h => h.stockCode === active.id);
    const newIndex = items.findIndex(h => h.stockCode === over.id);
    onReorder(arrayMove(items, oldIndex, newIndex));
  }

  const COL_COUNT = 8;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(h => h.stockCode)} strategy={verticalListSortingStrategy}>
        <div className="ft-table-scroll">
        <table className="ft-table">
          <thead>
            <tr>
              <th>代號 / 名稱</th>
              <th className="right">即時報價</th>
              <th className="right">漲跌幅</th>
              <th className="center">90日走勢</th>
              <th className="right">成本均價</th>
              <th className="right">持有（股）</th>
              <th className="right">損益 %</th>
              <th className="center">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(h => {
              const isExpanded = expandedCode === h.stockCode;
              const loadingExpand = isExpanded
                && !klines[h.stockCode]
                && !profiles[h.stockCode]
                && !chips[h.stockCode];
              return (
                <Fragment key={h.stockCode}>
                  <HoldingRow
                    h={h}
                    sparkline={sparklines[h.stockCode] ?? []}
                    isExpanded={isExpanded}
                    onToggle={onToggle}
                    onHistory={onHistory}
                    onAddTx={onAddTx}
                  />
                  {isExpanded && (
                    <ExpandRow
                      colSpan={COL_COUNT}
                      code={h.stockCode}
                      kline={klines[h.stockCode]}
                      profile={profiles[h.stockCode]}
                      chips={chips[h.stockCode]}
                      loadingExpand={loadingExpand}
                    />
                  )}
                </Fragment>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)' }}>
                  尚無持股資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </SortableContext>
    </DndContext>
  );
}
