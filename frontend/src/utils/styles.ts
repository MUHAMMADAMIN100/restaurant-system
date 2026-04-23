import type { OrderStatus } from '../api/client';
import type { CSSProperties } from 'react';

export const fmt = (n: number): string =>
  new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' сум';

export const timeAgo = (iso: string): string => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'только что';
  if (diff < 60) return `${diff} мин назад`;
  return `${Math.floor(diff / 60)} ч назад`;
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Ожидание',
  COOKING: 'Готовится',
  READY:   'Готово!',
  CLOSED:  'Закрыт',
};

export const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: '#f59e0b',
  COOKING: '#3b82f6',
  READY:   '#10b981',
  CLOSED:  '#6b7280',
};

export const STATUS_BG: Record<OrderStatus, string> = {
  PENDING: '#451a03',
  COOKING: '#1e3a5f',
  READY:   '#064e3b',
  CLOSED:  '#1f2937',
};

export interface OrderLike {
  items?: Array<{ menuItem?: { price?: number }; quantity: number }>;
}

export const calcTotal = (order: OrderLike): number =>
  (order.items ?? []).reduce(
    (s, it) => s + Number(it.menuItem?.price ?? 0) * it.quantity,
    0,
  );

export const S = {
  card:      { background: '#141414', border: '1px solid #222', borderRadius: 14, padding: 24 } as CSSProperties,
  input:     { background: '#1a1a1a', border: '1px solid #2e2e2e', borderRadius: 8, padding: '10px 14px', color: '#e5e7eb', width: '100%', fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' } as CSSProperties,
  select:    { background: '#1a1a1a', border: '1px solid #2e2e2e', borderRadius: 8, padding: '10px 14px', color: '#e5e7eb', width: '100%', fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' } as CSSProperties,
  label:     { fontSize: 11, color: '#5a5a5a', display: 'block', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' } as CSSProperties,
  btn:       (bg = '#f59e0b', fg = '#000'): CSSProperties => ({ background: bg, color: fg, border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }),
  btnGhost:  { background: 'transparent', color: '#6b7280', border: '1px solid #2a2a2a', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" } as CSSProperties,
  btnDanger: { background: '#7f1d1d', color: '#fca5a5', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" } as CSSProperties,
  tab:       (active: boolean): CSSProperties => ({ padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, background: active ? '#f59e0b' : 'transparent', color: active ? '#000' : '#6b7280', border: 'none', fontFamily: "'DM Sans', sans-serif" }),
  badge:     (status: OrderStatus): CSSProperties => ({ display: 'inline-block', padding: '3px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_BG[status], color: STATUS_COLOR[status], border: `1px solid ${STATUS_COLOR[status]}44`, letterSpacing: '0.03em' }),
};
