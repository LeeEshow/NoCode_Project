import { useToastStore } from './toastStore';
import './Toast.css';

export default function ToastContainer() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast-item toast-item--${t.variant}`}>
          <span className="toast-item__msg">{t.message}</span>
          <button className="toast-item__close" onClick={() => remove(t.id)} aria-label="關閉">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
