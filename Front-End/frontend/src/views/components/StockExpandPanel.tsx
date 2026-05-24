import { useState, useEffect, memo, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import KLineChart from './Charts/KLineChart';
import LoadingPanel from './LoadingPanel';
import Icon from './Icon';
import TransactionHistoryPanel from '../pages/stock/TransactionHistoryPanel';
import { toast } from './Toast';
import { chartColors, colors as themeColors } from '../../styles';
import type {
  KLineDTO, StockProfileDTO, ChipDTO, ExpandTab,
  HoldingTagDTO, TagDTO, AddHoldingTagPayload, UpdateHoldingTagPayload,
  OverlappingTagGroup,
} from '../../types';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

/* ── 格式化工具 ── */

function parseChipDate(raw: unknown): string {
  const d = String(raw ?? '');
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}`;
  if (/^\d{8}$/.test(d)) return `${d.slice(4, 6)}/${d.slice(6, 8)}`;
  if (/^\d{7}$/.test(d)) return `${d.slice(3, 5)}/${d.slice(5, 7)}`;
  return '';
}

/* ── Tab 控制列 ── */

type TabDef = { key: ExpandTab; label: string };

function TabBar({
  tabs, active, onChange,
}: {
  tabs:     TabDef[];
  active:   ExpandTab;
  onChange: (t: ExpandTab) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        padding: '8px 0',
        minWidth: 110,
        flexShrink: 0,
        marginLeft: 8,
      }}
    >
      {tabs.map(t => (
        <button
          key={t.key}
          role="tab"
          id={`expand-tab-${t.key}`}
          aria-selected={active === t.key}
          aria-controls={`expand-panel-${t.key}`}
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

/* 格式化工具（Profile 專用）*/
const DASH = '—';
function fmtPct(v: number | null): string {
  return v != null ? `${v.toFixed(2)}%` : DASH;
}
function fmtAmt(v: number | null): string {
  return v != null ? `${(v / 1e8).toFixed(2)} 億` : DASH;
}
function fmtVal(v: number | null, d = 2): string {
  return v != null ? v.toFixed(d) : DASH;
}
function fmtPrice(v: number | null): string {
  return v != null ? v.toLocaleString('zh-TW') : DASH;
}
function fmtDivRate(v: number | null): string {
  return v != null ? `${v.toFixed(2)} 元/股` : DASH;
}
function fmtExDate(v: string | null): string {
  if (!v) return DASH;
  const m = v.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}/${m[2]}` : v;
}

/* ProfileSection — 分類標題 + 欄位清單 */
type ProfileField = { label: string; value: string };

function ProfileSection({ title, fields }: { title: string; fields: ProfileField[] }) {
  const visible = fields.filter(f => f.value !== DASH);
  if (visible.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 10,
        color: 'var(--label)',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        marginBottom: 5,
        paddingBottom: 4,
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </div>
      {fields.map(({ label, value }) => (
        <div key={label} style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '2px 0',
          gap: 6,
        }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {label}
          </span>
          <span style={{
            fontSize: 'var(--text-sm)',
            color: value === DASH ? 'var(--dim)' : 'var(--text-value)',
            fontWeight: value === DASH ? 400 : 600,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'right',
          }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ProfilePanel — 完整基本面面板 */
function ProfilePanel({ profile }: { profile: StockProfileDTO }) {
  const syncLabel = profile.updatedAt
    ? `資料同步：${profile.updatedAt.slice(0, 10)}`
    : '尚未同步';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* 標題列：左「基本面」+ 右同步日期 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)' }}>基本面</span>
        <span style={{
          fontSize: 11,
          color: profile.updatedAt ? 'var(--dim)' : 'var(--muted)',
        }}>
          {syncLabel}
        </span>
      </div>

      <ProfileSection title="評價指標" fields={[
        { label: 'P/E',     value: fmtVal(profile.peRatio, 2) },
        { label: 'P/B',     value: fmtVal(profile.pbRatio, 2) },
        { label: 'EPS',     value: profile.eps != null ? `${fmtVal(profile.eps, 2)} 元` : DASH },
        { label: '每股淨值', value: profile.bookValue != null ? `${fmtVal(profile.bookValue, 2)} 元` : DASH },
      ]} />

      <ProfileSection title="股利" fields={[
        { label: '殖利率',   value: fmtPct(profile.dividendYield) },
        { label: '現金股利', value: fmtDivRate(profile.dividendRate) },
        { label: '配息率',   value: fmtPct(profile.payoutRatio) },
        { label: '除息日',   value: fmtExDate(profile.exDividendDate) },
      ]} />

      <ProfileSection title="獲利能力" fields={[
        { label: '毛利率',   value: fmtPct(profile.grossMargin) },
        { label: '營業利率', value: fmtPct(profile.operatingMargin) },
        { label: '淨利率',   value: fmtPct(profile.netMargin) },
        { label: 'ROE',      value: fmtPct(profile.roe) },
      ]} />

      <ProfileSection title="規模/成長" fields={[
        { label: '市值',     value: fmtAmt(profile.marketCap) },
        { label: '營收',     value: fmtAmt(profile.revenue) },
        { label: 'YoY 成長', value: fmtPct(profile.revenueGrowth) },
      ]} />

      <ProfileSection title="風險/波動" fields={[
        { label: '52W 最高', value: fmtPrice(profile.fiftyTwoWeekHigh) },
        { label: '52W 最低', value: fmtPrice(profile.fiftyTwoWeekLow) },
        { label: 'Beta',     value: fmtVal(profile.beta, 2) },
      ]} />
    </div>
  );
}

const ChipChart = memo(function ChipChart({ chips }: { chips: ChipDTO[] }) {
  const option = useMemo(() => {
    const recent  = chips.slice(-20);
    const dates   = recent.map(c => parseChipDate(c.date));
    const foreign = recent.map(c => c.foreign);
    const trust   = recent.map(c => c.trust);
    const dealer  = recent.map(c => c.dealer);

    // 三大法人各自對應 chartColors token（暗礦色板，index 固定勿改）
    const cF = chartColors[0]; // #2d5578 青金石 H:208° — 外資
    const cT = chartColors[1]; // #216226 碧玉   H:125° — 投信
    const cD = chartColors[3]; // #ac770c 虎眼   H:40°  — 自營商
    // 賣超（負值）用同色 55% 不透明度
    const neg = (c: string) => `${c}8C`;

    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: "'Open Sans', sans-serif", color: themeColors.muted },
      tooltip: {
        trigger: 'axis',
        backgroundColor: themeColors.surface,
        borderColor: themeColors.borderHi,
        textStyle: { color: themeColors.text, fontSize: 12 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any[]) => {
          const idx   = params[0]?.dataIndex ?? 0;
          const date  = recent[idx]?.date ?? '';
          const lines = params.map((p: { seriesName: string; value: number }) =>
            `${p.seriesName}：${p.value > 0 ? '+' : ''}${p.value.toLocaleString()} 張`
          ).join('<br/>');
          const total      = params.reduce((sum: number, p: { value: number }) => sum + (p.value ?? 0), 0);
          const totalColor = total > 0 ? themeColors.up : total < 0 ? themeColors.down : themeColors.muted;
          const divider    = `<div style="border-top:1px solid ${themeColors.borderHi};margin:5px 0 3px"></div>`;
          const totalLine  = `<span style="color:${totalColor};font-weight:600">合計：${total > 0 ? '+' : ''}${total.toLocaleString()} 張</span>`;
          return `<b>${date}</b><br/>${lines}${divider}${totalLine}`;
        },
      },
      legend: {
        top: 4, right: 8,
        textStyle: { color: themeColors.muted, fontSize: 11 },
        data: [
          { name: '外資',   itemStyle: { color: cF } },
          { name: '投信',   itemStyle: { color: cT } },
          { name: '自營商', itemStyle: { color: cD } },
        ],
      },
      grid: { top: 36, bottom: 44, left: 52, right: 8 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: { color: themeColors.dim, fontSize: 9, rotate: 35 },
        axisLine: { onZero: true, lineStyle: { color: themeColors.borderHi } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: themeColors.dim, fontSize: 10,
          formatter: (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v),
        },
        splitLine: { lineStyle: { color: themeColors.border, type: 'dashed' } },
      },
      series: [
        {
          name: '外資', type: 'bar', stack: 'chip', data: foreign,
          color: cF,
          itemStyle: {
            color: (p: { value: number }) => p.value >= 0 ? cF : neg(cF),
            borderColor: 'transparent',
          },
        },
        {
          name: '投信', type: 'bar', stack: 'chip', data: trust,
          color: cT,
          itemStyle: {
            color: (p: { value: number }) => p.value >= 0 ? cT : neg(cT),
            borderColor: 'transparent',
          },
        },
        {
          name: '自營商', type: 'bar', stack: 'chip', data: dealer,
          color: cD,
          itemStyle: {
            color: (p: { value: number }) => p.value >= 0 ? cD : neg(cD),
            borderColor: 'transparent',
          },
        },
      ],
    };
  }, [chips]);

  return <ReactECharts option={option} style={{ height: 310, width: '100%' }} />;
});

function ChipProfileSection({
  chips, profile,
}: {
  chips:   ChipDTO[]       | undefined;
  profile: StockProfileDTO | undefined;
}) {
  // 最後一筆籌碼日期（格式化為顯示用）
  const lastChipDate = chips && chips.length > 0
    ? parseChipDate(chips[chips.length - 1].date)
    : null;

  // 三大法人區：無資料且尚未同步 → 顯示等待提示；其餘 → 空資料訊息
  const chipEmpty = !chips || chips.length === 0;
  const notSynced = profile?.updatedAt === null;

  return (
    <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', height: '100%' }}>
      {/* 左側：法人籌碼圖 */}
      <div style={{
        flex: '1 1 0', minWidth: 0,
        borderRight: '1px solid var(--border)',
        padding: '4px 12px 4px 0',
        display: 'flex', flexDirection: 'column',
      }}>
        {!chipEmpty ? (
          <>
            {/* 資料日期（右對齊小字）*/}
            {lastChipDate && (
              <div style={{
                fontSize: 11, color: 'var(--dim)',
                textAlign: 'right', marginBottom: 2, flexShrink: 0,
              }}>
                最後資料：{lastChipDate}
              </div>
            )}
            <ChipChart chips={chips!} />
          </>
        ) : notSynced ? (
          <EmptyMsg text="資料同步中，請稍候" />
        ) : (
          <EmptyMsg text="無籌碼資料" />
        )}
      </div>
      {/* 右側：基本面面板（300px，可獨立捲動）*/}
      <div style={{ flex: '0 0 300px', padding: '8px 0 8px 16px', overflowY: 'auto' }}>
        {profile
          ? <ProfilePanel profile={profile} />
          : <EmptyMsg text="無基本面資料" />
        }
      </div>
    </div>
  );
}

/* ── Tab：標籤設定 ── */

interface StockTagSectionProps {
  stockCode:       string;
  holdingTags:     HoldingTagDTO[];
  allTags:         TagDTO[];
  onAddHoldingTag:    (stockCode: string, payload: AddHoldingTagPayload, onSuccess?: () => void) => void;
  onUpdateHoldingTag: (stockCode: string, id: string, payload: UpdateHoldingTagPayload) => void;
  onRemoveHoldingTag: (stockCode: string, id: string, onSuccess?: () => void) => void;
}

function StockTagSection({
  stockCode, holdingTags, allTags,
  onAddHoldingTag, onUpdateHoldingTag, onRemoveHoldingTag,
}: StockTagSectionProps) {
  const [localWeights, setLocalWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(holdingTags.map(t => [t.id, String(t.weightRatio)]))
  );

  useEffect(() => {
    setLocalWeights(prev => {
      const next = { ...prev };
      const validIds = new Set(holdingTags.map(t => t.id));
      for (const t of holdingTags) {
        if (!(t.id in next)) next[t.id] = String(t.weightRatio);
      }
      for (const id in next) {
        if (!validIds.has(id)) delete next[id];
      }
      return next;
    });
  }, [holdingTags]);

  const total = holdingTags.reduce(
    (sum, t) => sum + (parseFloat(localWeights[t.id] ?? '0') || 0),
    0,
  );
  const assignedNames = new Set(holdingTags.map(t => t.tagName));

  function handleAddTag(tagName: string) {
    if (!tagName) return;
    const newCount  = holdingTags.length + 1;
    const base      = Math.floor(100 / newCount);
    const remainder = 100 - base * newCount;
    const newWeight = base + remainder;

    onAddHoldingTag(stockCode, { tagName, weightRatio: newWeight }, () => {
      setLocalWeights(prev => {
        const next = { ...prev };
        holdingTags.forEach(t => { next[t.id] = String(base); });
        return next;
      });
    });
  }

  function handleSaveAll() {
    let saved = 0;
    holdingTags.forEach(t => {
      const weight = parseFloat(localWeights[t.id] ?? '');
      if (!isNaN(weight) && weight > 0 && weight <= 100) {
        onUpdateHoldingTag(stockCode, t.id, { weightRatio: weight });
        saved++;
      }
    });
    if (saved > 0) toast.success('配置已儲存');
  }

  const addSelect = (
    <select
      value=""
      onChange={e => { handleAddTag(e.target.value); (e.target as HTMLSelectElement).value = ''; }}
      style={{
        background: 'var(--surface)',
        color: 'var(--text)',
        border: '1px solid var(--border-hi)',
        borderRadius: 'var(--radius-sm)',
        padding: '3px 8px',
        fontSize: 'var(--text-sm)',
        cursor: 'pointer',
      }}
    >
      <option value="">＋ 加入 Tag</option>
      {allTags.length === 0 ? (
        <option value="" disabled>請先至風險再平衡模組建立標籤</option>
      ) : (
        allTags.map(tag => (
          <option
            key={tag.id}
            value={tag.name}
            disabled={assignedNames.has(tag.name)}
            style={{ color: assignedNames.has(tag.name) ? 'var(--dim)' : undefined }}
          >
            {tag.name}
          </option>
        ))
      )}
    </select>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 表格內容 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {holdingTags.length === 0 ? (
          <EmptyMsg text="尚未設定標籤，請從下方加入" />
        ) : (
          <table className="ft-table" style={{ fontSize: 'var(--text-sm)' }}>
            <colgroup>
              <col />
              <col style={{ width: 140 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Tag 名稱</th>
                <th className="center">配置比例</th>
                <th className="right">操作</th>
              </tr>
            </thead>
            <tbody>
              {holdingTags.map(t => (
                <tr key={t.id}>
                  <td>{t.tagName}</td>
                  <td className="center">
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="fi-input fi-input--mono"
                        style={{ width: 70, padding: '3px 6px', fontVariantNumeric: 'tabular-nums' }}
                        min={1}
                        max={100}
                        value={localWeights[t.id] ?? String(t.weightRatio)}
                        onChange={e => setLocalWeights(p => ({ ...p, [t.id]: e.target.value }))}
                      />
                      <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>%</span>
                    </div>
                  </td>
                  <td className="right">
                    <button
                      className="btn-icon"
                      aria-label={`移除標籤 ${t.tagName}`}
                      onClick={() => onRemoveHoldingTag(
                        stockCode, t.id,
                        () => toast.success(`已移除 ${t.tagName}`),
                      )}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 底部 action bar：合計 ＋ 加入Tag ＋ 儲存 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 4px 4px', borderTop: '1px solid var(--border)', flexShrink: 0, gap: 8,
      }}>
        <span aria-live="polite" style={{ fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums' }}>
          {holdingTags.length > 0 && total === 100 && <span style={{ color: 'var(--down)' }}>✓ 合計 100%</span>}
          {holdingTags.length > 0 && total < 100  && <span style={{ color: 'var(--accent)' }}>⚠ {total}%，差 {100 - total}%</span>}
          {holdingTags.length > 0 && total > 100  && <span style={{ color: 'var(--up)' }}>✗ {total}%，超出 {total - 100}%</span>}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {addSelect}
          {holdingTags.length > 0 && (
            <button
              className="btn-ghost"
              style={{ padding: '3px 12px', fontSize: 'var(--text-sm)' }}
              onClick={handleSaveAll}
            >
              儲存配置
            </button>
          )}
        </div>
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
  name:          string;
  kline:         KLineDTO[]      | undefined;
  profile:       StockProfileDTO | undefined;
  chips:         ChipDTO[]       | undefined;
  loadingExpand: boolean;
  onAddTx?:      (code: string, name: string) => void;
  onChanged?:    () => void;
  /* Tag 相關（持股表使用，關注清單不傳則不顯示此 Tab）*/
  holdingTags?:        HoldingTagDTO[];
  allTags?:            TagDTO[];
  onAddHoldingTag?:    (stockCode: string, payload: AddHoldingTagPayload, onSuccess?: () => void) => void;
  onUpdateHoldingTag?: (stockCode: string, id: string, payload: UpdateHoldingTagPayload) => void;
  onRemoveHoldingTag?: (stockCode: string, id: string, onSuccess?: () => void) => void;
  overlappingGroups?:  OverlappingTagGroup[];
  concentrationLimit?: number; /* 同質集中度上限（小數），用於定量顯示 */
}

export default function StockExpandPanel({
  colSpan, code, name, kline, profile, chips, loadingExpand, onAddTx, onChanged,
  holdingTags, allTags, onAddHoldingTag, onUpdateHoldingTag, onRemoveHoldingTag,
  overlappingGroups, concentrationLimit,
}: StockExpandPanelProps) {
  const [activeTab, setActiveTab] = useState<ExpandTab>('kline');
  const hasData = kline || profile || chips;
  const hasTagTab = holdingTags !== undefined && allTags !== undefined
    && onAddHoldingTag && onUpdateHoldingTag && onRemoveHoldingTag;

  const TABS: TabDef[] = [
    { key: 'kline', label: 'K 線' },
    { key: 'chip',  label: '法人 & 基本面' },
    { key: 'tx',    label: '交易紀錄' },
    ...(hasTagTab ? [{ key: 'tags' as ExpandTab, label: '標籤設定' }] : []),
  ];

  return (
    <tr style={{ background: 'rgba(0,0,0,0.22)' }}>
      <td colSpan={colSpan} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
        {loadingExpand
          ? <div style={{ padding: 16 }}><LoadingPanel loading type="spinner" /></div>
          : hasData
            ? (
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
                <div
                  role="tabpanel"
                  id={`expand-panel-${activeTab}`}
                  aria-labelledby={`expand-tab-${activeTab}`}
                  style={{ flex: 1, minWidth: 0, padding: '8px 16px 12px', height: 400, overflow: 'hidden' }}
                >
                  {activeTab === 'kline' && (kline
                    ? <KLineSection data={kline} />
                    : <EmptyMsg text={`無法載入 ${code} 的 K 線資料`} />
                  )}
                  {activeTab === 'chip' && (
                    <ChipProfileSection chips={chips} profile={profile} />
                  )}
                  {activeTab === 'tx' && (
                    <TransactionHistoryPanel
                      stockCode={code}
                      stockName={name}
                      onAddTx={onAddTx}
                      onChanged={onChanged}
                    />
                  )}
                  {activeTab === 'tags' && hasTagTab && (
                    <>
                      <StockTagSection
                        stockCode={code}
                        holdingTags={holdingTags}
                        allTags={allTags}
                        onAddHoldingTag={onAddHoldingTag}
                        onUpdateHoldingTag={onUpdateHoldingTag}
                        onRemoveHoldingTag={onRemoveHoldingTag}
                      />
                      {/* 同質重疊警示（4-B 定量化）*/}
                      {(overlappingGroups ?? [])
                        .filter(g => g.stockCodes.includes(code))
                        .map((g, i) => {
                          const others  = g.stockCodes.filter(c => c !== code).join('、');
                          const pct     = Math.round(g.combinedWeight * 100);
                          const exceed  = concentrationLimit != null && g.combinedWeight > concentrationLimit;
                          return (
                            <div key={i} style={{
                              marginTop: 10,
                              padding: '8px 12px',
                              background: exceed ? 'var(--up-bg)' : 'var(--accent-bg)',
                              border: `1px solid ${exceed ? 'var(--up-bd)' : 'var(--accent-bd)'}`,
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 'var(--text-sm)',
                            }}>
                              <span style={{ color: exceed ? 'var(--up)' : 'var(--accent)' }}>
                                ⚠ 與 {others} 持有相同標籤（{g.tagNames.join('、')}）
                                {' — '}合計佔比 {pct}%
                                {exceed && concentrationLimit != null && (
                                  <span>，超過上限（{Math.round(concentrationLimit * 100)}%）</span>
                                )}
                              </span>
                            </div>
                          );
                        })
                      }
                    </>
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
