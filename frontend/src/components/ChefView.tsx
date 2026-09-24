import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SpeakerHighIcon, SpeakerSlashIcon, ArrowClockwiseIcon, ClockIcon, WarningIcon,
  PlayIcon, CheckIcon, CallBellIcon, WarningCircleIcon,
} from '@phosphor-icons/react';
import { api } from '../api/client';
import type { Order, OrderStatus } from '../api/client';
import { useOrderSocket, useSocketStatus } from '../hooks/useSocket';
import { useNow } from '../hooks/useNow';
import { Spinner, useToast, Skeleton, EmptyState } from './UI';
import { elapsedLabel, minutesSince, pluralRu, upsertById } from '../utils/format';

type KitchenStatus = Extract<OrderStatus, 'PENDING' | 'COOKING' | 'READY'>;

const COLUMNS: { status: KitchenStatus; title: string }[] = [
  { status: 'PENDING', title: 'Новые' },
  { status: 'COOKING', title: 'Готовятся' },
  { status: 'READY',   title: 'Готовы к выдаче' },
];

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { PENDING: 'COOKING', COOKING: 'READY' };
/** Minutes after which an order is flagged as delayed. */
const LATE_AFTER: Partial<Record<OrderStatus, number>> = { PENDING: 5, COOKING: 20 };
const SOUND_KEY = 'resto_kds_sound';

// ── New-order chime (Web Audio, no asset) ─────────────────────────────────────
function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensure = useCallback(() => {
    try {
      if (!ctxRef.current) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        ctxRef.current = new Ctx();
      }
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume().catch(() => {});
      return ctxRef.current;
    } catch { return null; }
  }, []);

  // Browsers only allow audio after a user gesture — unlock on the first tap anywhere.
  useEffect(() => {
    const unlock = () => ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [ensure]);

  return useCallback(() => {
    const ctx = ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [[880, 0], [1318.5, 0.16]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + delay);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + 0.5);
    });
  }, [ensure]);
}

// ── Order card ────────────────────────────────────────────────────────────────
interface CardProps { order: Order; now: number; busy: boolean; onAdvance: (o: Order) => void; }
function KitchenCard({ order, now, busy, onAdvance }: CardProps) {
  const mins = minutesSince(order.createdAt, now);
  const lateAfter = LATE_AFTER[order.status];
  const late = lateAfter !== undefined && mins >= lateAfter;

  return (
    <article className={`kds-card ${late ? 'is-late' : ''}`} data-status={order.status} aria-label={`Стол ${order.tableNumber}, заказ ${order.id}`}>
      <div className="kds-card__head">
        <div>
          <div className="kds-card__table">Стол {order.tableNumber}</div>
          <div className="kds-card__id">Заказ № {order.id}</div>
        </div>
        <span className={`kds-timer ${late ? 'is-late' : ''}`} title="Время с момента заказа">
          {late ? <WarningIcon size={18} weight="bold" aria-hidden /> : <ClockIcon size={18} aria-hidden />}
          {elapsedLabel(order.createdAt, now)}
          {late && <span className="sr-only">, задерживается</span>}
        </span>
      </div>

      <ul className="kds-items">
        {(order.items || []).map((it) => (
          <li key={it.id} className="kds-item">
            <span className="kds-item__qty">{it.quantity}×</span>
            <span className="kds-item__name">{it.menuItem?.name ?? 'Блюдо'}</span>
          </li>
        ))}
      </ul>

      {order.status === 'PENDING' && (
        <button type="button" className="btn btn--lg btn--block btn--start" onClick={() => onAdvance(order)} disabled={busy}>
          {busy ? <Spinner /> : <PlayIcon size={18} weight="fill" aria-hidden />} Начать готовить
        </button>
      )}
      {order.status === 'COOKING' && (
        <button type="button" className="btn btn--lg btn--block btn--done" onClick={() => onAdvance(order)} disabled={busy}>
          {busy ? <Spinner /> : <CheckIcon size={18} weight="bold" aria-hidden />} Готово
        </button>
      )}
      {order.status === 'READY' && (
        <div className="kds-waiting"><CallBellIcon size={18} aria-hidden /> Ждёт официанта</div>
      )}
    </article>
  );
}

// ── ChefView (root) ───────────────────────────────────────────────────────────
export default function ChefView() {
  const [orders, setOrders]       = useState<Order[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [advancing, setAdvancing] = useState<number | null>(null);
  const [soundOn, setSoundOn]     = useState(() => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } });
  const toast = useToast();
  const now = useNow(15000);
  const chime = useChime();
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const loadOrders = useCallback(async () => {
    setLoadError('');
    try {
      setOrders(await api.getOrders());
    } catch (e) {
      setLoadError((e as Error).message);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  const online = useSocketStatus(loadOrders);

  useEffect(() => { try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch { /* ignore */ } }, [soundOn]);

  useOrderSocket({
    onNew: (o) => {
      setOrders((p) => upsertById(p, o, 'start'));
      if (soundRef.current) chime();
      toast(`Новый заказ: стол ${o.tableNumber}`);
    },
    onStatus: (o) => setOrders((p) => upsertById(p, o)),
    onClosed: (o) => setOrders((p) => upsertById(p, o)),
  });

  const advance = async (order: Order) => {
    const next = NEXT[order.status];
    if (!next) return;
    setAdvancing(order.id);
    try {
      const updated = await api.updateStatus(order.id, next);
      setOrders((p) => upsertById(p, updated));
    } catch (e) {
      toast((e as Error).message, 'error');
      loadOrders();
    } finally { setAdvancing(null); }
  };

  if (loading) {
    return (
      <div className="kds" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="kds-col"><Skeleton height={40} /><Skeleton height={220} radius={12} /><Skeleton height={220} radius={12} /></div>
        ))}
      </div>
    );
  }

  if (loadError && orders.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<WarningCircleIcon size={24} />} title="Не удалось загрузить заказы" text={loadError}
          action={<button className="btn btn--primary" onClick={() => { setLoading(true); loadOrders(); }}><ArrowClockwiseIcon size={16} /> Повторить</button>}
        />
      </div>
    );
  }

  const active = orders.filter((o) => o.status !== 'CLOSED');
  // Oldest first: the kitchen works in order of arrival.
  const byAge = (a: Order, b: Order) => +new Date(a.createdAt) - +new Date(b.createdAt);

  return (
    <div>
      <div className="kds-header">
        <div>
          <h1 className="page-title">Кухня</h1>
          <p className="page-subtitle">
            {active.length === 0 ? 'Активных заказов нет' : `${active.length} ${pluralRu(active.length, ['активный заказ', 'активных заказа', 'активных заказов'])}`}
          </p>
        </div>
        <div className="toolbar">
          <span className={`conn ${online ? '' : 'is-offline'}`} role="status">
            <span className="conn__dot" aria-hidden /> {online ? 'На связи' : 'Нет связи — переподключаемся'}
          </span>
          <button type="button" className="btn" onClick={() => setSoundOn((v) => !v)} aria-pressed={soundOn}>
            {soundOn ? <SpeakerHighIcon size={18} aria-hidden /> : <SpeakerSlashIcon size={18} aria-hidden />}
            {soundOn ? 'Звук включён' : 'Звук выключен'}
          </button>
          <button type="button" className="btn btn--icon" onClick={() => { setRefreshing(true); loadOrders(); }} aria-label="Обновить" disabled={refreshing}>
            {refreshing ? <Spinner /> : <ArrowClockwiseIcon size={18} />}
          </button>
        </div>
      </div>

      <div className="kds">
        {COLUMNS.map(({ status, title }) => {
          const col = active.filter((o) => o.status === status).sort(byAge);
          return (
            <section key={status} className="kds-col" aria-label={title}>
              <h2 className="kds-col__head" data-status={status}>
                {title}
                <span className="count">{col.length}</span>
              </h2>
              {col.length === 0
                ? <div className="kds-empty">Пусто</div>
                : col.map((o) => <KitchenCard key={o.id} order={o} now={now} busy={advancing === o.id} onAdvance={advance} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
