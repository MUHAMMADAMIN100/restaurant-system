import { useEffect, useState, memo, type ReactNode } from 'react';
import { S } from '../utils/styles';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}

export const Modal = memo(function Modal({ title, onClose, children, maxWidth = 480 }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={onClose}
      className="anim-fade"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="anim-scale"
        style={{
          ...S.card,
          width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto',
          border: '1px solid #2e2e2e',
          boxShadow: '0 32px 90px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, gap: 12 }}>
          <h2 id="modal-title" style={{ margin: 0, fontSize: 20, fontFamily: "'Playfair Display', serif", color: '#f59e0b', flex: 1 }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              color: '#9ca3af', width: 32, height: 32, borderRadius: 8,
              cursor: 'pointer', fontSize: 18, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
});

interface SpinnerProps {
  size?: number;
  color?: string;
}

export const Spinner = memo(function Spinner({ size = 20, color = '#f59e0b' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Загрузка"
      style={{
        width: size, height: size,
        border: `2px solid ${color}22`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        display: 'inline-block',
      }}
    />
  );
});

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onDone: () => void;
}

export function Toast({ message, type = 'success', onDone }: ToastProps) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const close = setTimeout(() => setClosing(true), 2700);
    const done  = setTimeout(onDone, 3000);
    return () => { clearTimeout(close); clearTimeout(done); };
  }, [onDone]);

  const color = type === 'success' ? '#10b981' : '#ef4444';
  const bg    = type === 'success' ? '#064e3b' : '#7f1d1d';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={closing ? 'anim-fade' : 'anim-slide-right'}
      style={{
        position: 'fixed',
        bottom: 'max(20px, env(safe-area-inset-bottom))',
        right: 16, left: 16,
        maxWidth: 420,
        marginLeft: 'auto',
        background: bg,
        border: `1px solid ${color}`,
        borderRadius: 12,
        padding: '14px 18px',
        color, fontWeight: 600, fontSize: 14,
        zIndex: 2000,
        display: 'flex', alignItems: 'center', gap: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        opacity: closing ? 0 : 1,
        transform: closing ? 'translateX(40px)' : 'translateX(0)',
        transition: 'opacity 0.3s, transform 0.3s',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16 }}>{type === 'success' ? '✓' : '✕'}</span>
      <span style={{ flex: 1 }}>{message}</span>
    </div>
  );
}

interface ToastState { message: string; type: 'success' | 'error'; key: number }

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ message, type, key: Date.now() });
  const hide = () => setToast(null);
  const node = toast ? <Toast key={toast.key} message={toast.message} type={toast.type} onDone={hide} /> : null;
  return { show, node };
}

interface EmptyStateProps {
  icon: string;
  text: string;
}

export const EmptyState = memo(function EmptyState({ icon, text }: EmptyStateProps) {
  return (
    <div role="status" className="anim-fade-up" style={{ textAlign: 'center', padding: '52px 24px', color: '#3a3a3a' }}>
      <div aria-hidden="true" className="anim-float" style={{ fontSize: 44, marginBottom: 14, opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  );
});

interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  radius?: number;
}

export const Skeleton = memo(function Skeleton({ height = 20, width = '100%', radius = 8 }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ height, width, borderRadius: radius, display: 'block' }}
      aria-hidden="true"
    />
  );
});
