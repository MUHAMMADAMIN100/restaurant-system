import { useEffect, useState, memo, type ReactNode } from 'react';
import { S } from '../utils/styles';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}

export const Modal = memo(function Modal({ title, onClose, children, maxWidth = 480 }: ModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div style={{ ...S.card, width: '100%', maxWidth, maxHeight: '88vh', overflowY: 'auto', border: '1px solid #2e2e2e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 id="modal-title" style={{ margin: 0, fontSize: 20, fontFamily: "'Playfair Display', serif", color: '#f59e0b' }}>{title}</h2>
          <button onClick={onClose} aria-label="Закрыть" style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
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
      style={{ width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
});

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onDone: () => void;
}

export function Toast({ message, type = 'success', onDone }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const color = type === 'success' ? '#10b981' : '#ef4444';
  const bg    = type === 'success' ? '#064e3b' : '#7f1d1d';
  return (
    <div role="alert" aria-live="polite" style={{ position: 'fixed', bottom: 28, right: 28, background: bg, border: `1px solid ${color}`, borderRadius: 12, padding: '14px 20px', color, fontWeight: 600, fontSize: 14, zIndex: 2000, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
      <span aria-hidden="true">{type === 'success' ? '✓' : '✕'}</span> {message}
    </div>
  );
}

interface ToastState { message: string; type: 'success' | 'error' }

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type });
  const hide = () => setToast(null);
  const node = toast ? <Toast key={toast.message + Date.now()} message={toast.message} type={toast.type} onDone={hide} /> : null;
  return { show, node };
}

interface EmptyStateProps {
  icon: string;
  text: string;
}

export const EmptyState = memo(function EmptyState({ icon, text }: EmptyStateProps) {
  return (
    <div role="status" style={{ textAlign: 'center', padding: '52px 24px', color: '#2e2e2e' }}>
      <div aria-hidden="true" style={{ fontSize: 40, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  );
});
