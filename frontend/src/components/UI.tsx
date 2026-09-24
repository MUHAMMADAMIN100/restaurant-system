import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  XIcon, CheckCircleIcon, WarningCircleIcon, ClockIcon, FireIcon, ReceiptIcon, WarningIcon,
} from '@phosphor-icons/react';
import type { OrderStatus, User } from '../api/client';
import { STATUS_LABEL, initials } from '../utils/format';
import { useCountUp } from '../hooks/useCountUp';

// ── Spinner & skeleton ───────────────────────────────────────────────────────
export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span
      className="spinner"
      style={{ ['--size' as string]: `${size}px` } as CSSProperties}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export function Skeleton({ height = 20, width = '100%', radius }: { height?: number | string; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

// ── Empty state ──────────────────────────────────────────────────────────────
interface EmptyStateProps { icon: ReactNode; title: string; text?: string; action?: ReactNode; }
export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">{icon}</div>
      <div className="empty__title">{title}</div>
      {text && <div className="empty__text">{text}</div>}
      {action}
    </div>
  );
}

// ── Status badge (colour + icon + text, never colour alone) ──────────────────
const STATUS_ICON: Record<OrderStatus, ReactNode> = {
  PENDING: <ClockIcon size={14} weight="bold" aria-hidden />,
  COOKING: <FireIcon size={14} weight="bold" aria-hidden />,
  READY:   <CheckCircleIcon size={14} weight="bold" aria-hidden />,
  CLOSED:  <ReceiptIcon size={14} weight="bold" aria-hidden />,
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className="status" data-status={status}>
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function LateBadge({ label = 'Задерживается' }: { label?: string }) {
  return (
    <span className="status" data-status="LATE">
      <WarningIcon size={14} weight="bold" aria-hidden />
      {label}
    </span>
  );
}

// ── Modal (portal, focus trap, Escape, restores focus) ───────────────────────
interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Prevent closing on backdrop/Escape while a request is in flight. */
  busy?: boolean;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, width = 480, busy = false }: ModalProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const preferred = card?.querySelector<HTMLElement>('[data-autofocus]') ?? card?.querySelector<HTMLElement>('input, select, textarea') ?? card;
    preferred?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !card) return;
      const nodes = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busyRef.current) onClose(); }}
    >
      <div
        ref={cardRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ ['--modal-w' as string]: `${width}px` } as CSSProperties}
      >
        <div className="modal__header">
          <h2 id={titleId} className="modal__title">{title}</h2>
          <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={onClose} disabled={busy} aria-label="Закрыть">
            <XIcon size={18} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Confirm dialog ───────────────────────────────────────────────────────────
interface ConfirmProps {
  title: string;
  text: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); }
    catch { setBusy(false); }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      busy={busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Отмена</button>
          <button type="button" className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={run} disabled={busy} data-autofocus>
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-2)' }}>{text}</p>
    </Modal>
  );
}

// ── Toasts (single region for the whole app) ─────────────────────────────────
type ToastType = 'success' | 'error';
interface ToastItem { id: number; message: string; type: ToastType; }
type ShowToast = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((p) => p.filter((t) => t.id !== id)), []);
  const show = useCallback<ShowToast>((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setItems((p) => [...p.slice(-2), { id, message, type }]);
    window.setTimeout(() => dismiss(id), type === 'error' ? 6000 : 3500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        <div className="toast-region" aria-live="polite" aria-relevant="additions">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.type === 'error' ? 'toast--error' : ''}`} role={t.type === 'error' ? 'alert' : 'status'}>
              <span className="toast__icon" aria-hidden="true">
                {t.type === 'error' ? <WarningCircleIcon size={18} weight="fill" /> : <CheckCircleIcon size={18} weight="fill" />}
              </span>
              <span className="toast__text">{t.message}</span>
              <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Скрыть уведомление">
                <XIcon size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

// ── Animated number (count-up) ───────────────────────────────────────────────
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const shown = useCountUp(value);
  return (
    <span className={className}>
      <span aria-hidden="true">{format(Math.abs(shown - value) < 0.005 ? value : shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}

// ── Brand ────────────────────────────────────────────────────────────────────
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span className="brand__mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 32 32" fill="currentColor">
        <path d="M9 4v9a4 4 0 0 0 3 3.87V28h3V16.87A4 4 0 0 0 18 13V4h-2v8h-1.5V4h-2v8H11V4Zm15 0c-2.8 0-4.5 3.4-4.5 8.5V18h3v10h3V4Z" />
      </svg>
    </span>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand__name">Restaurant<span>OS</span></span>
    </span>
  );
}

// ── Current user ─────────────────────────────────────────────────────────────
export const ROLE_LABEL: Record<User['role'], string> = {
  admin: 'Администратор',
  waiter: 'Официант',
  chef: 'Повар',
  manager: 'Менеджер',
};

export function UserChip({ user }: { user: User }) {
  const name = user.name.replace(/\s*\(.*?\)\s*/g, '').trim() || user.name;
  return (
    <div className="user-chip">
      <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
      <span className="user-chip__text">
        <span className="user-chip__name" title={user.name}>{name}</span>
        {name !== ROLE_LABEL[user.role] && <span className="user-chip__role">{ROLE_LABEL[user.role]}</span>}
      </span>
    </div>
  );
}
