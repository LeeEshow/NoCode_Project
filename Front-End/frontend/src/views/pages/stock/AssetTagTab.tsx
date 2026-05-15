import { useState, useEffect } from 'react';
import type {
  HoldingDTO,
  TagDTO,
  AssetTagDTO,
  CreateAssetTagPayload,
  UpdateAssetTagPayload,
} from '../../../types';
import Icon from '../../components/Icon';
import LoadingPanel from '../../components/LoadingPanel';
import { toast } from '../../components/Toast';

interface Props {
  holdings:         HoldingDTO[];
  tags:             TagDTO[];
  assetTags:        AssetTagDTO[];
  assetTagsByStock: Record<string, AssetTagDTO[]>;
  loading:          boolean;
  saving:           boolean;
  onAdd:            (payload: CreateAssetTagPayload, onSuccess?: () => void) => void;
  onUpdate:         (id: string, payload: UpdateAssetTagPayload) => void;
  onRemove:         (id: string, onSuccess?: () => void) => void;
}

export default function AssetTagTab({
  holdings, tags, assetTags, assetTagsByStock,
  loading, saving, onAdd, onUpdate, onRemove,
}: Props) {
  /* localWeights: assetTagId → weightRatio 字串（onChange 用，onBlur 才存 API） */
  const [localWeights, setLocalWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(assetTags.map(at => [at.id, String(at.weightRatio)]))
  );

  /* 同步：新增/刪除後補齊或移除 local entry，不覆蓋使用者正在編輯的值 */
  useEffect(() => {
    setLocalWeights(prev => {
      const next = { ...prev };
      const validIds = new Set(assetTags.map(at => at.id));
      for (const at of assetTags) {
        if (!(at.id in next)) next[at.id] = String(at.weightRatio);
      }
      for (const id in next) {
        if (!validIds.has(id)) delete next[id];
      }
      return next;
    });
  }, [assetTags]);

  function stockTotal(stockCode: string): number {
    return (assetTagsByStock[stockCode] ?? []).reduce(
      (sum, at) => sum + (parseFloat(localWeights[at.id] ?? '0') || 0),
      0,
    );
  }

  function handleAddTag(stockCode: string, tagName: string) {
    if (!tagName) return;
    const currentATs = assetTagsByStock[stockCode] ?? [];
    const newCount   = currentATs.length + 1;
    const base       = Math.floor(100 / newCount);
    const remainder  = 100 - base * newCount;
    const newWeight  = base + remainder; // 新 Tag 承接餘數，確保合計 100

    onAdd({ stockCode, tagName, weightRatio: newWeight }, () => {
      /* 只更新 local state — 現有 Tag 的 API 值留給使用者 blur 後儲存 */
      setLocalWeights(prev => {
        const next = { ...prev };
        currentATs.forEach(at => { next[at.id] = String(base); });
        return next;
      });
    });
  }

  function handleBlur(stockCode: string, assetTagId: string) {
    const total = stockTotal(stockCode);
    if (total > 100) return; // 超標，onBlur 阻擋

    const weight = parseFloat(localWeights[assetTagId] ?? '');
    if (isNaN(weight) || weight <= 0 || weight > 100) return;
    onUpdate(assetTagId, { weightRatio: weight });
  }

  if (loading) return <LoadingPanel loading rows={4} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {holdings.map(h => {
        const stockATs     = assetTagsByStock[h.stockCode] ?? [];
        const total        = stockTotal(h.stockCode);
        const assignedNames = new Set(stockATs.map(at => at.tagName));
        const hasContent   = stockATs.length > 0;

        return (
          <div
            key={h.stockCode}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            {/* 股票標題列 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--surface)',
              borderBottom: hasContent ? '1px solid var(--border)' : undefined,
            }}>
              <span>
                <span className="stock-code">{h.stockCode}</span>
                {' '}
                <span className="stock-name">{h.stockName}</span>
              </span>

              {/* 加入 Tag 下拉 */}
              <select
                value=""
                onChange={e => { handleAddTag(h.stockCode, e.target.value); (e.target as HTMLSelectElement).value = ''; }}
                disabled={saving}
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border-hi)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px',
                  fontSize: 'var(--text-sm)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                <option value="">＋ 加入 Tag</option>
                {tags.length === 0 ? (
                  <option value="" disabled>請先至「Tag 管理」建立標籤</option>
                ) : (
                  tags.map(tag => (
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
            </div>

            {/* Tag 子列表 / 空狀態 */}
            {!hasContent ? (
              <div style={{
                padding: '10px 12px',
                color: 'var(--dim)',
                fontSize: 'var(--text-sm)',
              }}>
                尚未設定 Tag
              </div>
            ) : (
              <>
                <table className="ft-table">
                  <thead>
                    <tr>
                      <th>Tag 名稱</th>
                      <th className="center">配置比例</th>
                      <th className="right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockATs.map(at => (
                      <tr key={at.id}>
                        <td>{at.tagName}</td>
                        <td className="center">
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number"
                              inputMode="decimal"
                              className="fi-input fi-input--mono"
                              style={{ width: 70, padding: '3px 6px', fontVariantNumeric: 'tabular-nums' }}
                              min={1}
                              max={100}
                              value={localWeights[at.id] ?? String(at.weightRatio)}
                              onChange={e => setLocalWeights(p => ({ ...p, [at.id]: e.target.value }))}
                              onBlur={() => handleBlur(h.stockCode, at.id)}
                              disabled={saving}
                            />
                            <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>%</span>
                          </div>
                        </td>
                        <td className="right">
                          <button
                            className="btn-icon"
                            aria-label={`移除 ${at.tagName}`}
                            onClick={() => onRemove(at.id, () => toast.success(`已移除 ${at.tagName}`))}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 合計列 */}
                <div style={{
                  padding: '6px 12px',
                  textAlign: 'right',
                  fontSize: 'var(--text-sm)',
                  borderTop: '1px solid var(--border)',
                }}>
                  {total === 100 && (
                    <span style={{ color: 'var(--down)', fontVariantNumeric: 'tabular-nums' }}>
                      ✓ 合計 100%
                    </span>
                  )}
                  {total < 100 && (
                    <span style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                      ⚠ 合計 {total}%，尚差 {100 - total}%
                    </span>
                  )}
                  {total > 100 && (
                    <span style={{ color: 'var(--up)', fontVariantNumeric: 'tabular-nums' }}>
                      ✗ 合計 {total}%，超出 {total - 100}%
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
