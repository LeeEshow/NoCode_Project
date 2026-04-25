import { useToastStore } from './toastStore';
import Icon from '../Icon';
import './Toast.css';

export default function ToastContainer() {
  const { toasts, remove } = useToastStore();

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast-item toast-item--${t.variant}`}>
          <span className="toast-item__msg">{t.message}</span>
          <button className="toast-item__close" onClick={() => remove(t.id)} aria-label="關閉">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
