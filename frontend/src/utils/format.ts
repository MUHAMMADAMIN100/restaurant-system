import type { OrderStatus } from '../api/client';

const moneyInt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const moneyDec = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1 234 с. / 12,50 с. — decimals only when the amount has kopecks (дирамы). */
export const fmt = (n: number | string | null | undefined): string => {
  const num = Number(n) || 0;
  return `${Number.isInteger(Math.round(num * 100) / 100) ? moneyInt.format(num) : moneyDec.format(num)} с.`;
};

export function pluralRu(n: number, forms: [string, string, string]): string {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return forms[2];
  if (m10 === 1) return forms[0];
  if (m10 >= 2 && m10 <= 4) return forms[1];
  return forms[2];
}

export const minutesSince = (iso: string, now = Date.now()): number =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

export const timeAgo = (iso: string, now = Date.now()): string => {
  const m = minutesSince(iso, now);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  return `${h} ч ${m % 60} мин назад`;
};

/** Kitchen timer: 7:05 → "7 мин", 75 → "1 ч 15 мин" */
export const elapsedLabel = (iso: string, now = Date.now()): string => {
  const m = minutesSince(iso, now);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
};

export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Новый',
  COOKING: 'Готовится',
  READY:   'Готов',
  CLOSED:  'Оплачен',
};

export interface OrderLike {
  items?: Array<{ price?: number | string | null; menuItem?: { price?: number | string }; quantity: number }>;
}

/** Uses the price captured when the order was placed; falls back to the dish price for old orders. */
export const linePrice = (it: { price?: number | string | null; menuItem?: { price?: number | string } }): number =>
  Number(it.price ?? it.menuItem?.price ?? 0);

export const calcTotal = (order: OrderLike): number =>
  Math.round((order.items ?? []).reduce((s, it) => s + linePrice(it) * it.quantity, 0) * 100) / 100;

/** Insert or replace by id — keeps lists free of duplicates when HTTP and WebSocket both deliver an item. */
export function upsertById<T extends { id: number }>(list: T[], item: T, position: 'start' | 'end' = 'end'): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return position === 'start' ? [item, ...list] : [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}

/** "+992931234567" → "+992 93 123 45 67" */
export const formatPhone = (phone: string): string => {
  const d = phone.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('992')) return `+992 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  return phone;
};

/** Same rules as the server: 9 local digits or 992 + 9 digits. */
export const normalizePhone = (input: string): string | null => {
  const d = (input ?? '').replace(/\D/g, '');
  if (d.length === 9) return `+992${d}`;
  if (d.length === 12 && d.startsWith('992')) return `+${d}`;
  return null;
};

export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

export const CALL_RESULT_LABEL: Record<import('../api/client').CallResult, string> = {
  NO_ANSWER:   'Не дозвонился',
  COMING_SOON: 'Придёт скоро',
  DISLIKED:    'Не понравилось',
  EXPENSIVE:   'Дорого',
  MOVED:       'Уехал',
  OTHER:       'Другое',
};

export const initials = (name: string): string =>
  name.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
