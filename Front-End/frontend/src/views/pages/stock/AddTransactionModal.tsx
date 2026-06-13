import { useState, useEffect, useMemo, memo } from 'react';
import Modal from '../../components/Modal';
import { FormField, TextInput, NumberInput, RadioGroup, TextareaInput } from '../../components/FormInputs';
import { useTransactionsViewModel, calcCostFromTransactions } from '../../../viewmodels/useTransactionsViewModel';
import { toast } from '../../components/Toast/toastStore';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import type { TransactionType, TradingStrategyDTO } from '../../../types';
import './TradingStrategyModal.css';

function fmt(n: number, d = 2) {
  return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface FormState {
  type:        TransactionType;
  shares:      string;
  totalAmount: string;
  date:        string;
  note:        string;
}

function defaultForm(): FormState {
  return {
    type: 'buy', shares: '', totalAmount: '', date: new Date().toISOString().slice(0, 10), note: '',
  };
}

const RadioDot = memo(function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 14,
      height: 14,
      borderRadius: '50%',
      border: `2px solid ${selected ? 'var(--accent)' : 'var(--dim)'}`,
      background: selected ? 'var(--accent)' : 'transparent',
      flexShrink: 0,
      transition: 'border-color 0.15s, background 0.15s',
    }} />
  );
});

export interface AddTransactionModalProps {
  open:            boolean;
  stockCode:       string;
  stockName:       string;
  onClose:         () => void;
  onSuccess:       () => void;
  strategies?:     Record<string, TradingStrategyDTO>;
  onAddExecution?: (batch: number, executedPrice: number, executedShares: number, transactionId: string, executedAt: string) => void;
}

export default function AddTransactionModal({
  open, stockCode, stockName, onClose, onSuccess, strategies, onAddExecution,
}: AddTransactionModalProps) {
  const vm = useTransactionsViewModel(stockCode);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<number | null>(null);

  /* Modal 開啟時載入歷史交易，供均價預覽使用；自動預選第一個 triggered 批次 */
  useEffect(() => {
    if (open) {
      vm.load();
      const s = strategies?.[stockCode];
      const firstTriggered = s?.tranches.find(
        t => t.status === 'triggered' && t.executions.length === 0,
      );
      setSelectedBatch(firstTriggered?.batch ?? null);
      setExpandedBatch(firstTriggered?.batch ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* 可連結的批次：尚未執行的 triggered / pending 批次 */
  const linkableTranches = useMemo(() => {
    const s = strategies?.[stockCode];
    if (!s) return [];
    return s.tranches.filter(t =>
      (t.status === 'triggered' || t.status === 'pending') && t.executions.length === 0,
    );
  }, [strategies, stockCode]);

  function field<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  const shares        = Number(form.shares)      || 0;
  const totalAmount   = Number(form.totalAmount) || 0;
  const pricePerShare = shares > 0 ? totalAmount / shares : 0;

  const handleClose = () => {
    setForm(defaultForm());
    setSelectedBatch(null);
    setExpandedBatch(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!shares || form.totalAmount === '' || !form.date) {
      toast.error('請填寫必填欄位（股數、交易金額、日期）');
      return;
    }
    const created = await vm.addTx({
      stockCode, stockName, type: form.type, shares, price: pricePerShare, fee: 0,
      date: form.date, note: form.note || undefined,
    });
    if (!created) {
      toast.error(vm.error ?? '新增失敗，請重試');
      return;
    }
    if (selectedBatch !== null && onAddExecution) {
      onAddExecution(selectedBatch, pricePerShare, shares, created.id, form.date + 'T00:00:00+08:00');
    }
    toast.success(`交易已新增${selectedBatch !== null ? '，已連結 AI 策略批次' : '，持倉成本已更新'}`);
    setForm(defaultForm());
    setSelectedBatch(null);
    setExpandedBatch(null);
    onSuccess();
    onClose();
  };

  /* 即時預覽新均價：含陣列 sort，用 useMemo 避免每次 render 重算 */
  const previewCost = useMemo(() => {
    if (!shares || form.totalAmount === '') return null;
    const fakeTx = {
      id: '__preview', stockCode, stockName, type: form.type,
      shares, price: pricePerShare, fee: 0, date: form.date, note: form.note,
    };
    return calcCostFromTransactions([...vm.items, fakeTx]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares, form.totalAmount, form.type, form.date, form.note, pricePerShare, vm.items]);

  const hasBatches = linkableTranches.length > 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`新增交易 — ${stockCode} ${stockName}`}
      size={hasBatches ? 'lg' : 'sm'}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={handleClose}>取消</button>
          <button
            className="btn-ghost"
            style={{ borderColor: 'var(--accent-bd)', color: 'var(--accent)' }}
            disabled={vm.saving}
            onClick={handleSubmit}
          >
            {vm.saving ? '儲存中…' : '確認新增'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── 左欄：表單 ── */}
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FormField label="交易類型" required>
            <RadioGroup
              name="tx-type"
              value={form.type}
              onChange={v => field('type', v as TransactionType)}
              options={[{ value: 'buy', label: '買進' }, { value: 'sell', label: '賣出' }]}
            />
          </FormField>

          <FormField label="交易日期" required>
            <TextInput
              type="date"
              value={form.date}
              onChange={e => field('date', e.target.value)}
            />
          </FormField>

          <FormField label="交易總金額（含手續費）" required>
            <NumberInput value={form.totalAmount} onChange={v => field('totalAmount', v)} min={0} step={1} placeholder="0" />
          </FormField>
          <FormField label="股數（股）" required>
            <NumberInput value={form.shares} onChange={v => field('shares', v)} min={1} step={1} placeholder="0" />
          </FormField>

          <FormField label="備註">
            <TextareaInput
              value={form.note}
              onChange={e => field('note', e.target.value)}
              placeholder="選填"
              style={{ resize: 'vertical' }}
            />
          </FormField>

          {/* 即時試算摘要 */}
          {shares > 0 && form.totalAmount !== '' && (
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xs)',
              fontSize: 'var(--text-sm)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'var(--dim)' }}>每股成本（元）</span>
                <span className="mono" style={{ color: 'var(--text-value)' }}>{fmt(pricePerShare)}</span>
              </div>
              {previewCost && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--dim)' }}>更新後均價</span>
                    <span className="mono" style={{ color: 'var(--text-value)' }}>{fmt(previewCost.costAvg)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--dim)' }}>更新後持股數</span>
                    <span className="mono" style={{ color: 'var(--text-value)' }}>{fmt(previewCost.shares, 0)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── 右欄：連結 AI 策略批次 ── */}
        {hasBatches && (
          <div style={{
            flex: 1,
            minWidth: 0,
            borderLeft: '1px solid var(--border)',
            paddingLeft: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            {/* 欄位標題 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
                <Icon name="tips_and_updates" size={13} aria-hidden="true" />
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 600 }}>
                連結 AI 策略批次
              </span>
            </div>

            {/* 不連結 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                background: selectedBatch === null ? 'rgba(255,255,255,0.04)' : 'transparent',
                border: selectedBatch === null
                  ? '1px solid rgba(255,255,255,0.08)'
                  : '1px solid transparent',
                transition: 'background 0.12s',
              }}
              role="radio"
              aria-checked={selectedBatch === null}
              tabIndex={0}
              onClick={() => setSelectedBatch(null)}
              onKeyDown={e => e.key === 'Enter' && setSelectedBatch(null)}
            >
              <RadioDot selected={selectedBatch === null} />
              <span style={{
                fontSize: 'var(--text-sm)',
                color: selectedBatch === null ? 'var(--text)' : 'var(--muted)',
              }}>
                不連結
              </span>
            </div>

            {/* 各批次 */}
            {linkableTranches.map(t => {
              const isSelected = selectedBatch === t.batch;
              const isExpanded = expandedBatch === t.batch;
              const select = () => {
                setSelectedBatch(t.batch);
                setExpandedBatch(t.batch);
              };
              return (
                <div
                  key={t.batch}
                  className={`tsm-tranche${isSelected ? ' tsm-tranche--open' : ''}`}
                >
                  <div
                    className="tsm-tranche__header tsm-tranche__header--clickable"
                    onClick={select}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && select()}
                    style={{ gap: 6, paddingLeft: 10 }}
                  >
                    <RadioDot selected={isSelected} />
                    <div className="tsm-tranche__title-group" style={{ flex: 1, minWidth: 0 }}>
                      <span className="tsm-tranche__num">第 {t.batch} 批</span>
                      {t.priceLow > 0 && (
                        <span className="tsm-tranche__range num-value">
                          {fmt(t.priceLow)} – {fmt(t.priceHigh)}
                        </span>
                      )}
                      <span className="tsm-tranche__size">{Math.round(t.sizeRatio * 100)}%</span>
                    </div>
                    <div className="tsm-tranche__header-right" style={{ gap: 4 }}>
                      <StatusBadge variant={t.status === 'triggered' ? 'down' : 'accent'}>
                        {t.status === 'triggered' ? '已觸發' : '觀察中'}
                      </StatusBadge>
                      <span
                        style={{ display: 'inline-flex', lineHeight: 0 }}
                        onClick={e => {
                          e.stopPropagation();
                          setExpandedBatch(p => p === t.batch ? null : t.batch);
                        }}
                      >
                        <Icon
                          name={isExpanded ? 'expand_less' : 'expand_more'}
                          size={18}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                  </div>

                  {/* 展開詳情 */}
                  {isExpanded && (
                    <div style={{
                      margin: '0 10px 10px 10px',
                      paddingTop: 8,
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      fontSize: 'var(--text-sm)',
                    }}>
                      {t.shares > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--dim)' }}>建議數量</span>
                          <span className="num-value">{fmt(t.shares, 0)} 股</span>
                        </div>
                      )}
                      {t.triggerCondition ? (
                        <div style={{
                          color: 'var(--dim)',
                          fontSize: 'var(--text-xs)',
                          lineHeight: 1.5,
                        }}>
                          {t.triggerCondition}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
