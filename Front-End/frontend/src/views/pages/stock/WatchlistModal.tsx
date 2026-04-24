import { useState, useEffect, useRef } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput } from '../../components/FormInputs';
import { searchStocks } from '../../../models/holdingModel';
import type { WatchlistItemDTO, CreateWatchlistPayload, StockSearchResultDTO } from '../../../types';

interface FormState {
  stockCode:   string;
  stockName:   string;
  targetPrice: string;
  note:        string;
}

function defaultForm(item?: WatchlistItemDTO): FormState {
  return {
    stockCode:   item?.stockCode   ?? '',
    stockName:   item?.stockName   ?? '',
    targetPrice: item?.targetPrice != null ? String(item.targetPrice) : '',
    note:        item?.note        ?? '',
  };
}

export interface WatchlistModalProps {
  open:      boolean;
  editItem:  WatchlistItemDTO | null;
  saving:    boolean;
  onClose:   () => void;
  onSubmit:  (payload: CreateWatchlistPayload, id?: string) => void;
}

export default function WatchlistModal({
  open, editItem, saving, onClose, onSubmit,
}: WatchlistModalProps) {
  const isEdit = !!editItem;
  const [form, setForm] = useState<FormState>(() => defaultForm(editItem ?? undefined));
  const [searchResult, setSearchResult] = useState<StockSearchResultDTO[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* 切換編輯對象時重置表單 */
  useEffect(() => {
    setForm(defaultForm(editItem ?? undefined));
    setSearchResult([]);
    setShowDrop(false);
  }, [open, editItem]);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  /* 股票代號即時搜尋（Debounce 300ms） */
  function handleCodeInput(val: string) {
    field('stockCode', val);
    field('stockName', '');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.length < 1) { setSearchResult([]); setShowDrop(false); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchStocks(val);
        setSearchResult(results);
        setShowDrop(results.length > 0);
      } catch { /* silent */ }
    }, 300);
  }

  function selectStock(s: StockSearchResultDTO) {
    setForm(f => ({ ...f, stockCode: s.code, stockName: s.name }));
    setSearchResult([]);
    setShowDrop(false);
  }

  const valid =
    form.stockCode.trim() &&
    form.stockName.trim() &&
    Number(form.targetPrice) > 0;

  const handleSubmit = () => {
    if (!valid) return;
    const payload: CreateWatchlistPayload = {
      stockCode:   form.stockCode.trim(),
      stockName:   form.stockName.trim(),
      targetPrice: Number(form.targetPrice),
      note:        form.note.trim() || undefined,
    };
    onSubmit(payload, editItem?.id);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `編輯關注 — ${editItem!.stockCode}` : '新增關注股票'}
      size="sm"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>取消</button>
          <button
            className="btn-ghost"
            style={{ borderColor: 'var(--accent-bd)', color: 'var(--accent)' }}
            disabled={saving || !valid}
            onClick={handleSubmit}
          >
            {saving ? '儲存中…' : (isEdit ? '儲存變更' : '加入關注')}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 股票代號搜尋（編輯模式鎖定）*/}
        <FormField label="股票代號" required>
          <div style={{ position: 'relative' }}>
            <TextInput
              value={form.stockCode}
              onChange={e => !isEdit && handleCodeInput(e.target.value)}
              placeholder="輸入代號或名稱搜尋"
              disabled={isEdit}
              style={{ textTransform: 'uppercase' }}
            />
            {showDrop && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: 'var(--panel)', border: '1px solid var(--border-hi)',
                borderRadius: 'var(--radius-sm)', maxHeight: 180, overflowY: 'auto',
              }}>
                {searchResult.map(s => (
                  <div
                    key={s.code}
                    style={{
                      padding: '7px 12px', cursor: 'pointer', display: 'flex', gap: 10,
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseDown={() => selectStock(s)}
                  >
                    <span className="mono" style={{ color: 'var(--text)', minWidth: 52 }}>{s.code}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </FormField>

        {/* 自動帶入名稱（唯讀） */}
        {form.stockName && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--dim)', marginTop: -8 }}>
            {form.stockName}
          </div>
        )}

        <FormField label="目標買進價（元）" required>
          <NumberInput
            value={form.targetPrice}
            onChange={v => field('targetPrice', v)}
            min={0}
            step={0.01}
            placeholder="0.00"
          />
        </FormField>

        <FormField label="備註">
          <TextInput
            value={form.note}
            onChange={e => field('note', e.target.value)}
            placeholder="選填"
          />
        </FormField>
      </div>
    </Modal>
  );
}
