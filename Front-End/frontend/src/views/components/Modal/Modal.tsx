import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import Icon from '../Icon';
import './Modal.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export default function Modal({ open, onClose, title, size = 'md', className, footer, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={isOpen => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ft-modal-backdrop">
          <Dialog.Content
            className={`ft-modal ft-modal--${size}${className ? ` ${className}` : ''}`}
            aria-describedby={undefined}
          >
            {title ? (
              <div className="ft-modal__header">
                <Dialog.Title className="ft-modal__title">{title}</Dialog.Title>
                <Dialog.Close asChild>
                  <button className="ft-modal__close" aria-label="關閉">
                    <Icon name="close" size={24} />
                  </button>
                </Dialog.Close>
              </div>
            ) : (
              <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                對話框
              </Dialog.Title>
            )}
            <div className="ft-modal__body">{children}</div>
            {footer && <div className="ft-modal__footer">{footer}</div>}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
