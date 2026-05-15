import { useState, useId } from 'react';
import type {
  TagDTO, TagStat, CreateTagPayload, FallbackBehavior,
  HoldingDTO, OverlappingTagGroup,
} from '../../../types';
import { calcTagDailyReturnsFromSparklines, stdDev } from '../../../utils/correlationCalc';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingPanel from '../../components/LoadingPanel';
import { toast } from '../../components/Toast';

/* ── 型別 ── */

interface FormState {
  name:             string;
  baseRisk:         string;
  targetWeight:     string;
  fallbackBehavior: FallbackBehavior;
  presetRiskOn:     string;
  presetRiskOff:    string;
  presetLiqDry:     string;
}

interface FormErrors {
  name?:         string;
  baseRisk?:     string;
  targetWeight?: string;
}

interface Props {
  tags:     TagDTO[];
  tagStats: TagStat[];
  loading:  boolean;
  saving:   boolean;
  onAdd:    (payload: CreateTagPayload, onSuccess?: () => void) => void;
  onUpdate: (id: string, payload: Partial<CreateTagPayload>, onSuccess?: () => void) => void;
  onRemove: (id: string, onSuccess?: () => void) => void;
  /* Phase 4-B */
  overlappingGroups: OverlappingTagGroup[];
  /* Phase 4-D */
  holdings:  HoldingDTO[];
  sparklines: Record<string, number[]>;
  /* 批次重算動態風險 */
  onRecalculateAll: () => Promise<void>;
  recalculating:    boolean;
}

/* ── 常數 ── */

const EMPTY_FORM: FormState = {
  name: '', baseRisk: '', targetWeight: '', fallbackBehavior: 'hold',
  presetRiskOn: '', presetRiskOff: '', presetLiqDry: '',
};

const FALLBACK_OPTIONS = [
  { value: 'hold',    label: '持有' },
  { value: 'exclude', label: '排除' },
];

/* ── 元件 ── */

export default function TagManagerTab({
  tags, tagStats, loading, saving,
  onAdd, onUpdate, onRemove,
  overlappingGroups,
  holdings, sparklines,
  onRecalculateAll, recalculating,
}: Props) {
  const statMap = new Map(tagStats.map(s => [s.tagName, s]));
  const uid     = useId();
  const idBase  = `tag-form-${uid}`;

  const [editingId,       setEditingId]       = useState<string | null>(null);
  const [formOpen,        setFormOpen]        = useState(false);
  const [form,            setForm]            = useState<FormState>(EMPTY_FORM);
  const [errors,          setErrors]          = useState<FormErrors>({});
  const [deleteTarget,    setDeleteTarget]    = useState<TagDTO | null>(null);
  const [autoCalcPending, setAutoCalcPending] = useState(false);
  const [autoCalcing,     setAutoCalcing]     = useState(false);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setAutoCalcPending(false);
    setFormOpen(true);
  }

  const r2 = (v: number) => parseFloat(v.toFixed(2));

  function openEdit(tag: TagDTO) {
    setEditingId(tag.id);
    setForm({
      name:             tag.name,
      baseRisk:         String(tag.baseRisk),
      targetWeight:     tag.targetWeight != null ? String(tag.targetWeight) : '',
      fallbackBehavior: tag.fallbackBehavior,
      presetRiskOn:     tag.marketStatePresets?.riskOn       != null ? String(r2(tag.marketStatePresets.riskOn))       : '',
      presetRiskOff:    tag.marketStatePresets?.riskOff      != null ? String(r2(tag.marketStatePresets.riskOff))      : '',
      presetLiqDry:     tag.marketStatePresets?.liquidityDry != null ? String(r2(tag.marketStatePresets.liquidityDry)) : '',
    });
    setErrors({});
    setAutoCalcPending(false);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setAutoCalcPending(false);
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    const name         = form.name.trim();
    const baseRisk     = parseFloat(form.baseRisk);
    const twStr        = form.targetWeight.trim();
    const targetWeight = twStr === '' ? null : parseFloat(twStr);

    if (!name) {
      errs.name = '名稱為必填';
    } else if (tags.some(t => t.name === name && t.id !== editingId)) {
      errs.name = `「${name}」已存在`;
    }
    if (form.baseRisk.trim() === '' || isNaN(baseRisk) || baseRisk < 0 || baseRisk > 3) {
      errs.baseRisk = '必填，範圍 0 ≤ value ≤ 3';
    }
    if (twStr !== '' && (isNaN(targetWeight!) || targetWeight! <= 0 || targetWeight! > 100)) {
      errs.targetWeight = '須介於 0 < value ≤ 100';
    }
    return errs;
  }

  function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const riskOn  = parseFloat(form.presetRiskOn);
    const riskOff = parseFloat(form.presetRiskOff);
    const liqDry  = parseFloat(form.presetLiqDry);
    const hasPresets = form.presetRiskOn || form.presetRiskOff || form.presetLiqDry;

    const payload: CreateTagPayload = {
      name:             form.name.trim(),
      baseRisk:         parseFloat(form.baseRisk),
      targetWeight:     form.targetWeight.trim() ? parseFloat(form.targetWeight) : null,
      fallbackBehavior: form.fallbackBehavior,
      marketStatePresets: hasPresets ? {
        riskOn:       !isNaN(riskOn)  ? riskOn  : undefined,
        riskOff:      !isNaN(riskOff) ? riskOff : undefined,
        liquidityDry: !isNaN(liqDry)  ? liqDry  : undefined,
      } : null,
    };

    if (editingId) {
      onUpdate(editingId, payload, () => { toast.success('Tag 已更新'); closeForm(); });
    } else {
      onAdd(payload, () => { toast.success('Tag 已新增'); closeForm(); });
    }
  }

  /* ── 4-D 自動計算市場狀態係數 ── */
  function handleAutoCalcPresets() {
    const tagName  = form.name.trim();
    const baseRisk = parseFloat(form.baseRisk);

    if (!tagName)         { toast.error('請先填入 Tag 名稱'); return; }
    if (isNaN(baseRisk))  { toast.error('請先填入基礎風險值'); return; }
    if (holdings.length === 0) { toast.error('無持股資料，無法計算'); return; }

    setAutoCalcing(true);
    const tagReturns = calcTagDailyReturnsFromSparklines(holdings, sparklines);
    const rets = tagReturns.get(tagName);
    setAutoCalcing(false);

    if (!rets || rets.length < 20) {
      toast.error('Sparkline 資料不足（至少 20 日），請確認持股已有 90 日走勢資料');
      return;
    }

    /* vol_ratio = recent_vol(20日) / base_vol(90日)；以 baseRisk 為錨點 */
    const recentVol = stdDev(rets.slice(-20));
    const baseVol   = stdDev(rets.slice(-90));
    const volRatio  = baseVol > 0 ? recentVol / baseVol : 1.0;

    const clamp = (v: number) => parseFloat(Math.min(3, Math.max(0, v)).toFixed(2));

    setForm(f => ({
      ...f,
      presetRiskOn:  String(clamp(baseRisk * 1.3 * volRatio)),
      presetRiskOff: String(clamp(baseRisk * 1.8 * volRatio)),
      presetLiqDry:  String(clamp(baseRisk * 2.5 * volRatio)),
    }));
    setAutoCalcPending(true);
    toast.success('建議值已填入，請確認後儲存');
  }

  const spinner = (
    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
  );

  if (loading) return <LoadingPanel loading rows={3} />;

  return (
    <div>
      {/* 操作列：批次重算 + 新增 Tag */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        <button
          className="btn-ghost"
          onClick={onRecalculateAll}
          disabled={recalculating || saving || tags.length === 0}
          aria-label="批次自動計算所有 Tag 動態風險"
        >
          {recalculating
            ? <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--muted)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
            : '⟳ 批次自動計算'}
        </button>
        <button className="btn-ghost" onClick={openAdd}>＋ 新增 Tag</button>
      </div>

      {/* 清單 or 空狀態 */}
      {tags.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)' }}>
          <Icon name="label" size={40} style={{ display: 'block', margin: '0 auto 12px', color: 'var(--dim)' }} />
          <p style={{ marginBottom: 4 }}>尚未建立任何 Tag</p>
          <p style={{ fontSize: 'var(--text-sm)', marginBottom: 16 }}>建立 Tag 以開始管理投組風險配置</p>
          <button className="btn-ghost" onClick={openAdd}>＋ 建立第一個 Tag</button>
        </div>
      ) : (
        <div className="ft-table-scroll">
          <table className="ft-table">
            <thead>
              <tr>
                <th>名稱</th>
                <th className="center">基礎風險</th>
                <th className="center">動態風險</th>
                <th className="center">目標配置</th>
                <th className="center">行為</th>
                <th className="center" style={{ color: 'var(--dim)', fontStyle: 'italic', minWidth: 120 }}>進度條</th>
                <th className="center" style={{ color: 'var(--dim)', fontStyle: 'italic' }}>狀態</th>
                <th style={{ color: 'var(--dim)', fontStyle: 'italic' }}>說明</th>
                <th className="right">操作</th>
              </tr>
            </thead>
            <tbody>
              {tags.map(tag => (
                <tr key={tag.id}>
                  <td>{tag.name}</td>
                  <td className="center num-value">{tag.baseRisk}</td>
                  <td className="center num-value" style={{
                    color: tag.dynamicRisk !== tag.baseRisk
                      ? (tag.dynamicRisk > tag.baseRisk ? 'var(--up)' : 'var(--down)')
                      : 'var(--muted)',
                  }}>
                    {tag.dynamicRisk.toFixed(2)}
                  </td>
                  <td className="center num-value">{tag.targetWeight != null ? `${tag.targetWeight}%` : '—'}</td>
                  <td className="center">{tag.fallbackBehavior === 'hold' ? '持有' : '排除'}</td>
                  {/* 進度條 */}
                  <td className="center">
                    {(() => {
                      const s = statMap.get(tag.name);
                      if (!s || s.targetWeight == null) return <span style={{ color: 'var(--dim)', fontSize: 'var(--text-xs)' }}>—</span>;
                      const pct = Math.min((s.actualWeight / s.targetWeight) * 100, 100);
                      return (
                        <div style={{ width: 120, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', margin: '0 auto' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                        </div>
                      );
                    })()}
                  </td>
                  {/* 狀態 */}
                  <td className="center" style={{ fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>
                    {(() => {
                      const s = statMap.get(tag.name);
                      if (!s || s.targetWeight == null) return <span style={{ color: 'var(--dim)' }}>—</span>;
                      return <span style={{ color: 'var(--muted)' }}>{s.actualWeight.toFixed(1)}% / {s.targetWeight}%</span>;
                    })()}
                  </td>
                  {/* 說明（4-B 加入集中度警示）*/}
                  <td style={{ fontSize: 'var(--text-xs)' }} aria-live="polite">
                    {(() => {
                      /* 4-B：同質集中度超標優先顯示（isConcentrationBreached 由 viewmodel 計算）*/
                      const concGroups = overlappingGroups.filter(
                        g => g.tagNames.includes(tag.name) && g.isConcentrationBreached
                      );
                      if (concGroups.length > 0) {
                        const maxPct = Math.round(Math.max(...concGroups.map(g => g.combinedWeight)) * 100);
                        return <span style={{ color: 'var(--up)' }}>⚠ 同質集中 {maxPct}%，超過上限</span>;
                      }

                      const s = statMap.get(tag.name);
                      if (!s || s.targetWeight == null) return <span style={{ color: 'var(--dim)' }}>— 未設定目標</span>;
                      if (s.triggered) return <span style={{ color: 'var(--up)' }}>⚠ 偏差 {s.delta >= 0 ? '+' : ''}{s.delta.toFixed(1)}%，建議再平衡</span>;
                      if (Math.abs(s.delta) < 1) return <span style={{ color: 'var(--down)' }}>✓ 配置正常</span>;
                      return <span style={{ color: 'var(--muted)' }}>偏差 {s.delta >= 0 ? '+' : ''}{s.delta.toFixed(1)}%</span>;
                    })()}
                  </td>
                  <td className="right">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn-icon accent" aria-label={`編輯 ${tag.name}`} onClick={() => openEdit(tag)}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button className="btn-icon" aria-label={`刪除 ${tag.name}`} onClick={() => setDeleteTarget(tag)}>
                        <Icon name="delete" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新增 / 編輯 Modal */}
      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editingId ? '編輯 Tag' : '新增 Tag'}
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn-ghost" onClick={closeForm} disabled={saving}>取消</button>
            <button className="btn-ghost btn-ghost--accent" onClick={handleSave} disabled={saving}>
              {saving
                ? <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', verticalAlign: 'middle' }} />
                : '儲存'}
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 名稱 */}
          <div className="fi-field">
            <label className="fi-label" htmlFor={`${idBase}-name`}>名稱<span className="fi-required">*</span></label>
            <input id={`${idBase}-name`} className={`fi-input${errors.name ? ' fi-input--error' : ''}`}
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="例如：高股息…" disabled={saving} />
            <div aria-live="polite">{errors.name && <span className="fi-error">{errors.name}</span>}</div>
          </div>

          {/* 基礎風險 + 目標配置 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fi-field">
              <label className="fi-label" htmlFor={`${idBase}-base-risk`}>基礎風險<span className="fi-required">*</span></label>
              <input id={`${idBase}-base-risk`} type="number" inputMode="decimal"
                className={`fi-input fi-input--mono${errors.baseRisk ? ' fi-input--error' : ''}`}
                value={form.baseRisk} onChange={e => setForm(f => ({ ...f, baseRisk: e.target.value }))}
                placeholder="0.55" min={0} max={3} step={0.01} disabled={saving} />
              <div aria-live="polite">{errors.baseRisk && <span className="fi-error">{errors.baseRisk}</span>}</div>
            </div>
            <div className="fi-field">
              <label className="fi-label" htmlFor={`${idBase}-target-weight`}>目標配置 %</label>
              <input id={`${idBase}-target-weight`} type="number" inputMode="decimal"
                className={`fi-input fi-input--mono${errors.targetWeight ? ' fi-input--error' : ''}`}
                value={form.targetWeight} onChange={e => setForm(f => ({ ...f, targetWeight: e.target.value }))}
                placeholder="50" min={0} max={100} step={1} disabled={saving} />
              <div aria-live="polite">{errors.targetWeight && <span className="fi-error">{errors.targetWeight}</span>}</div>
            </div>
          </div>

          {/* 行為 */}
          <div className="fi-field">
            <label className="fi-label" htmlFor={`${idBase}-fallback`}>未設定目標時的行為</label>
            <select id={`${idBase}-fallback`} className="fi-input fi-select"
              value={form.fallbackBehavior}
              onChange={e => setForm(f => ({ ...f, fallbackBehavior: e.target.value as FallbackBehavior }))}
              disabled={saving} style={{ backgroundColor: 'var(--surface)', color: 'var(--text)' }}>
              {FALLBACK_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          {/* 市場狀態係數（含 4-D 自動計算按鈕）*/}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>市場狀態係數（選填）</span>
              {/* 4-D：自動計算按鈕 */}
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: 'var(--text-xs)', padding: '2px 10px' }}
                disabled={saving || autoCalcing || holdings.length === 0}
                onClick={handleAutoCalcPresets}
              >
                {autoCalcing ? spinner : '自動計算'}
              </button>
            </div>
            {autoCalcPending && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 8 }}>
                ⚠ 以下為建議值（橘色底），請確認後儲存
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="fi-field">
                <label className="fi-label" htmlFor={`${idBase}-risk-on`}>Risk-On</label>
                <input id={`${idBase}-risk-on`} type="number" inputMode="decimal"
                  className="fi-input fi-input--mono"
                  style={autoCalcPending ? { background: 'rgba(200,140,60,0.15)', borderColor: 'rgba(200,140,60,0.5)' } : undefined}
                  value={form.presetRiskOn} onChange={e => { setForm(f => ({ ...f, presetRiskOn: e.target.value })); setAutoCalcPending(false); }}
                  placeholder={form.baseRisk || '0.55'} min={0} max={3} step={0.01} disabled={saving} />
              </div>
              <div className="fi-field">
                <label className="fi-label" htmlFor={`${idBase}-risk-off`}>Risk-Off</label>
                <input id={`${idBase}-risk-off`} type="number" inputMode="decimal"
                  className="fi-input fi-input--mono"
                  style={autoCalcPending ? { background: 'rgba(200,140,60,0.15)', borderColor: 'rgba(200,140,60,0.5)' } : undefined}
                  value={form.presetRiskOff} onChange={e => { setForm(f => ({ ...f, presetRiskOff: e.target.value })); setAutoCalcPending(false); }}
                  placeholder={form.baseRisk || '0.55'} min={0} max={3} step={0.01} disabled={saving} />
              </div>
              <div className="fi-field">
                <label className="fi-label" htmlFor={`${idBase}-liq-dry`}>流動性枯竭</label>
                <input id={`${idBase}-liq-dry`} type="number" inputMode="decimal"
                  className="fi-input fi-input--mono"
                  style={autoCalcPending ? { background: 'rgba(200,140,60,0.15)', borderColor: 'rgba(200,140,60,0.5)' } : undefined}
                  value={form.presetLiqDry} onChange={e => { setForm(f => ({ ...f, presetLiqDry: e.target.value })); setAutoCalcPending(false); }}
                  placeholder={form.baseRisk || '0.55'} min={0} max={3} step={0.01} disabled={saving} />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {deleteTarget && (
        <ConfirmDialog open title="刪除 Tag"
          message={`確定要刪除「${deleteTarget.name}」？\n若此 Tag 仍有股票對應，將無法刪除。`}
          confirmLabel="刪除" danger
          onConfirm={() => {
            onRemove(deleteTarget.id, () => { toast.success(`Tag「${deleteTarget.name}」已刪除`); setDeleteTarget(null); });
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
