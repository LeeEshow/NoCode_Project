import React, { useEffect, useRef } from 'react';
import './Modal.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, size = 'md', footer, children }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="ft-modal-backdrop"
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className={`ft-modal ft-modal--${size}`} role="dialog" aria-modal="true">
        {title && (
          <div className="ft-modal__header">
            <span className="ft-modal__title">{title}</span>
            <button className="ft-modal__close" onClick={onClose} aria-label="關閉">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="ft-modal__body">{children}</div>
        {footer && <div className="ft-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
