import Modal from '../Modal';
import './ConfirmDialog.css';

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title = '確認',
  message,
  confirmLabel = '確認',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel}</button>
          <button className={`btn-ghost ${danger ? 'btn-ghost--danger' : 'btn-ghost--accent'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-msg">{message}</p>
    </Modal>
  );
}
