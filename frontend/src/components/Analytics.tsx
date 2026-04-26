import { useState, useEffect, useCallback, memo } from 'react';
import { api } from '../api/client';
import type { Analytics as AnalyticsData, AnalyticsPeriod, DayBucket, HourBucket, TableBucket, DishBucket, LiveLoad } from '../api/client';
import { Skeleton, EmptyState } from './UI';
import { S, fmt } from '../utils/styles';
import { useOrderSocket, usePaymentSocket } from '../hooks/useSocket';

const PERIODS: { key: AnalyticsPeriod; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week',  label: '7 дней'  },
  { key: 'month', label: '30 дней' },
  { key: 'all',   label: 'Всё время' },
];

export default function Analytics() {
  const [period, setPeriod]   = useState<AnalyticsPeriod>('week');
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async (p: AnalyticsPeriod = period, silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const next = await api.getAnalytics(p);
      setData(next);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => { reload(period); }, [period, reload]);

  // Live updates
  usePaymentSocket({ onCreated: () => reload(period, true) });
  useOrderSocket({
    onNew:    () => reload(period, true),
    onStatus: () => reload(period, true),
    onClosed: () => reload(period, true),
  });

  if (loading || !data) {
    return (
      <div className="anim-fade" style={{ display: 'grid', gap: 16 }}>
        <Skeleton height={48} radius={10} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={108} radius={14} />)}
        </div>
        <Skeleton height={320} radius={14} />
        <Skeleton height={260} radius={14} />
      </div>
    );
  }

  return (
    <div className="anim-fade-up" style={{ display: 'grid', gap: 16 }}>
      {/* Period switcher */}
      <div className="flex-col-sm-row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, background: '#0f0f0f', padding: 4, borderRadius: 10, border: '1px solid #1c1c1c', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: period === p.key ? '#f59e0b' : 'transparent',
                color: period === p.key ? '#000' : '#9ca3af',
                border: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
                transition: 'all 0.2s var(--ease-out)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4b5563' }}>
          {refreshing && <span className="anim-pulse">⟳ Обновление</span>}
          {!refreshing && <><span className="dot-online" /> Live</>}
        </div>
      </div>

      {/* KPI cards */}
      <KPIGrid data={data} />

      {/* Revenue over time + Live kitchen load */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <RevenueChart days={data.revenueByDay} />
        <LiveKitchenLoad load={data.liveLoad} />
      </div>

      {/* Payment split + Hour activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <PaymentSplit cashRevenue={data.cashRevenue} cardRevenue={data.cardRevenue} cashCount={data.cashCount} cardCount={data.cardCount} />
        <HourActivity hours={data.ordersByHour} />
      </div>

      {/* Top dishes by revenue + by quantity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: 14 }}>
        <TopDishesCard title="Топ блюд по выручке" dishes={data.topDishesByRevenue} valueKey="revenue" formatValue={fmt} />
        <TopDishesCard title="Топ блюд по количеству" dishes={data.topDishesByQuantity} valueKey="quantity" formatValue={(v) => `${v} шт`} />
      </div>

      {/* Top tables */}
      <TopTablesCard tables={data.topTables} />
    </div>
  );
}

// ── KPI Grid ─────────────────────────────────────────────────────────────────
const KPIGrid = memo(function KPIGrid({ data }: { data: AnalyticsData }) {
  const items: { label: string; value: string; color: string; sub?: string; trend?: number | null }[] = [
    {
      label: 'Общая выручка',
      value: fmt(data.totalRevenue),
      color: '#f59e0b',
      sub: data.period === 'today' ? 'за сегодня' : data.period === 'week' ? 'за 7 дней' : data.period === 'month' ? 'за 30 дней' : 'за всё время',
      trend: data.comparison?.revenueChange ?? null,
    },
    {
      label: 'Заказов оплачено',
      value: String(data.orderCount),
      color: '#10b981',
      sub: `${data.tablesServed} ${pluralRu(data.tablesServed, ['стол обслужен', 'стола обслужено', 'столов обслужено'])}`,
      trend: data.comparison?.orderChange ?? null,
    },
    {
      label: 'Средний чек',
      value: fmt(data.avgOrder),
      color: '#3b82f6',
      sub: `${data.avgItemsPerOrder} ${pluralRu(Math.round(data.avgItemsPerOrder), ['блюдо в заказе', 'блюда в заказе', 'блюд в заказе'])}`,
    },
    {
      label: 'Активных сейчас',
      value: String(data.liveLoad.pending + data.liveLoad.cooking + data.liveLoad.ready),
      color: '#8b5cf6',
      sub: 'на кухне и в зале',
    },
  ];

  return (
    <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
      {items.map((m) => (
        <div key={m.label} className="anim-fade-up card-hover" style={{ ...S.card, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{m.label}</div>
            {m.trend !== null && m.trend !== undefined && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: m.trend >= 0 ? '#10b981' : '#ef4444',
                background: m.trend >= 0 ? '#064e3b' : '#7f1d1d',
                padding: '2px 8px', borderRadius: 6,
                whiteSpace: 'nowrap',
              }}>
                {m.trend >= 0 ? '↑' : '↓'} {Math.abs(m.trend)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: m.color, fontFamily: "'Playfair Display', serif", lineHeight: 1.1, marginBottom: 6 }}>{m.value}</div>
          {m.sub && <div style={{ fontSize: 12, color: '#4b5563' }}>{m.sub}</div>}
        </div>
      ))}
    </div>
  );
});

// ── Revenue chart ────────────────────────────────────────────────────────────
const RevenueChart = memo(function RevenueChart({ days }: { days: DayBucket[] }) {
  const max = Math.max(...days.map((d) => d.revenue), 1);
  const total = days.reduce((s, d) => s + d.revenue, 0);

  return (
    <div className="anim-fade-up" style={{ ...S.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 17 }}>Выручка по дням</h3>
        <span style={{ fontSize: 12, color: '#4b5563' }}>Всего: <strong style={{ color: '#f59e0b' }}>{fmt(total)}</strong></span>
      </div>

      {total === 0 ? <EmptyState icon="📈" text="Нет продаж в этом периоде" /> : (
        <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', margin: '0 -6px', padding: '0 6px' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: days.length <= 14 ? 'space-between' : 'flex-start',
            gap: 4, height: 180, paddingTop: 8,
            minWidth: days.length > 14 ? `${days.length * 24}px` : '100%',
          }}>
            {days.map((d, i) => {
              const h = max > 0 ? (d.revenue / max) * 100 : 0;
              const date = new Date(d.date);
              const label = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
              // Skip some labels when there are many days
              const labelStep = days.length > 21 ? 5 : days.length > 14 ? 3 : 1;
              const showLabel = i === days.length - 1 || i === 0 || i % labelStep === 0;
              return (
                <div key={d.date} style={{
                  flex: days.length <= 14 ? 1 : '0 0 auto',
                  width: days.length > 14 ? 22 : undefined,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0,
                }}>
                  <div style={{ fontSize: 9, color: d.revenue > 0 ? '#f59e0b' : '#2a2a2a', fontWeight: 600, opacity: d.revenue > 0 ? 1 : 0.4, whiteSpace: 'nowrap' }}>
                    {d.revenue > 0 ? formatShort(d.revenue) : '·'}
                  </div>
                  <div title={`${label}: ${fmt(d.revenue)} (${d.orders} зак.)`} style={{
                    width: '100%', maxWidth: 36,
                    height: `${Math.max(h, 2)}%`,
                    background: d.revenue > 0 ? 'linear-gradient(180deg, #f59e0b, #b45309)' : '#1a1a1a',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.6s var(--ease-out)',
                    minHeight: 2,
                  }} />
                  <div style={{ fontSize: 9, color: '#4b5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center', minHeight: 12 }}>
                    {showLabel ? label : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

// ── Live kitchen load ────────────────────────────────────────────────────────
const LiveKitchenLoad = memo(function LiveKitchenLoad({ load }: { load: LiveLoad }) {
  const items = [
    { key: 'pending', label: 'Ожидание',  count: load.pending, color: '#f59e0b' },
    { key: 'cooking', label: 'Готовится', count: load.cooking, color: '#3b82f6' },
    { key: 'ready',   label: 'Готово',    count: load.ready,   color: '#10b981' },
  ];
  const totalActive = load.pending + load.cooking + load.ready;
  const status = totalActive === 0 ? '😌 Спокойно' : totalActive < 5 ? '🟢 Норма' : totalActive < 10 ? '🟡 Загружено' : '🔴 Перегрузка';

  return (
    <div className="anim-fade-up" style={{ ...S.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 17 }}>Загрузка кухни</h3>
        <span className="anim-pulse" style={{ fontSize: 12, color: '#9ca3af' }}>{status}</span>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {items.map((item) => {
          const max = Math.max(...items.map((x) => x.count), 1);
          const pct = (item.count / max) * 100;
          return (
            <div key={item.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: '#9ca3af' }}>{item.label}</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: item.color, fontFamily: "'Playfair Display', serif", transition: 'all 0.3s var(--ease-spring)' }}>{item.count}</span>
              </div>
              <div style={{ height: 8, background: '#1a1a1a', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: `linear-gradient(90deg, ${item.color}, ${item.color}cc)`,
                  borderRadius: 4,
                  transition: 'width 0.6s var(--ease-out)',
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid #1e1e1e', marginTop: 16, paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: '#4b5563' }}>Закрыто всего</span>
        <span style={{ color: '#9ca3af', fontWeight: 600 }}>{load.closed}</span>
      </div>
    </div>
  );
});

// ── Payment split ────────────────────────────────────────────────────────────
const PaymentSplit = memo(function PaymentSplit({ cashRevenue, cardRevenue, cashCount, cardCount }: { cashRevenue: number; cardRevenue: number; cashCount: number; cardCount: number }) {
  const total = cashRevenue + cardRevenue;
  const cashPct = total ? (cashRevenue / total) * 100 : 0;
  const cardPct = total ? (cardRevenue / total) * 100 : 0;

  return (
    <div className="anim-fade-up" style={{ ...S.card }}>
      <h3 style={{ margin: '0 0 18px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 17 }}>Способы оплаты</h3>

      {total === 0 ? <EmptyState icon="💳" text="Нет оплат" /> : (
        <>
          {/* Donut chart with conic-gradient */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{
              width: 130, height: 130, borderRadius: '50%',
              background: `conic-gradient(#10b981 0% ${cashPct}%, #3b82f6 ${cashPct}% 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}>
              <div style={{ width: 86, height: 86, borderRadius: '50%', background: '#141414', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 11, color: '#4b5563' }}>Всего</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}>{cashCount + cardCount}</div>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 160, display: 'grid', gap: 10 }}>
              <PaymentRow color="#10b981" label="💵 Наличные" amount={cashRevenue} pct={cashPct} count={cashCount} />
              <PaymentRow color="#3b82f6" label="💳 Карта"    amount={cardRevenue} pct={cardPct} count={cardCount} />
            </div>
          </div>
        </>
      )}
    </div>
  );
});

function PaymentRow({ color, label, amount, pct, count }: { color: string; label: string; amount: number; pct: number; count: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: 'inline-block' }} /> {label}
        </span>
        <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 600 }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'Playfair Display', serif" }}>{fmt(amount)}</div>
      <div style={{ fontSize: 11, color: '#4b5563' }}>{count} {pluralRu(count, ['оплата', 'оплаты', 'оплат'])}</div>
    </div>
  );
}

// ── Hour activity ────────────────────────────────────────────────────────────
const HourActivity = memo(function HourActivity({ hours }: { hours: HourBucket[] }) {
  const max = Math.max(...hours.map((h) => h.count), 1);
  const peak = hours.reduce((best, h) => h.count > best.count ? h : best, hours[0]);

  return (
    <div className="anim-fade-up" style={{ ...S.card }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 17 }}>Активность по часам</h3>
        {peak && peak.count > 0 && (
          <span style={{ fontSize: 11, color: '#4b5563' }}>
            Пик: <strong style={{ color: '#f59e0b' }}>{String(peak.hour).padStart(2, '0')}:00</strong> ({peak.count} зак.)
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', margin: '0 -6px', padding: '0 6px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, height: 110, minWidth: 480 }}>
          {hours.map((h) => {
            const height = max > 0 ? (h.count / max) * 100 : 0;
            const isPeak = h === peak && peak.count > 0;
            return (
              <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 14 }}>
                <div title={`${String(h.hour).padStart(2, '0')}:00 — ${h.count} заказов, ${fmt(h.revenue)}`} style={{
                  width: '70%',
                  height: `${Math.max(height, 2)}%`,
                  background: h.count === 0 ? '#161616' : isPeak ? '#f59e0b' : '#3b82f6',
                  opacity: h.count === 0 ? 0.4 : 1,
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.6s var(--ease-out)',
                  minHeight: 2,
                }} />
                {h.hour % 3 === 0 && (
                  <div style={{ fontSize: 9, color: '#4b5563' }}>{String(h.hour).padStart(2, '0')}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ── Top dishes card ──────────────────────────────────────────────────────────
interface TopDishesCardProps {
  title: string;
  dishes: DishBucket[];
  valueKey: 'revenue' | 'quantity';
  formatValue: (v: number) => string;
}
const TopDishesCard = memo(function TopDishesCard({ title, dishes, valueKey, formatValue }: TopDishesCardProps) {
  const max = Math.max(...dishes.map((d) => d[valueKey]), 1);

  return (
    <div className="anim-fade-up" style={{ ...S.card }}>
      <h3 style={{ margin: '0 0 16px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 17 }}>{title}</h3>
      {dishes.length === 0 ? <EmptyState icon="🍽" text="Нет данных" /> : (
        <div className="stagger">
          {dishes.map((d, i) => (
            <div key={d.name} className="anim-fade-up" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                width: 24, height: 24,
                background: i === 0 ? '#451a03' : '#1a1a1a',
                color: i === 0 ? '#f59e0b' : '#4b5563',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 4, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ height: 3, background: '#1e1e1e', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(d[valueKey] / max) * 100}%`,
                    background: i === 0 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : '#374151',
                    transition: 'width 0.7s var(--ease-out)',
                  }} />
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, minWidth: 60, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatValue(d[valueKey])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ── Top tables ───────────────────────────────────────────────────────────────
const TopTablesCard = memo(function TopTablesCard({ tables }: { tables: TableBucket[] }) {
  if (tables.length === 0) return null;
  return (
    <div className="anim-fade-up" style={{ ...S.card }}>
      <h3 style={{ margin: '0 0 18px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 17 }}>Топ столов</h3>
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
        {tables.map((t, i) => (
          <div key={t.table} className="anim-fade-up card-hover" style={{
            background: '#1a1a1a', border: '1px solid #262626',
            borderRadius: 10, padding: 14,
            borderTop: i < 3 ? `3px solid ${i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : '#b45309'}` : undefined,
          }}>
            <div style={{ fontSize: 11, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Стол</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#e5e7eb', fontFamily: "'Playfair Display', serif", marginBottom: 8 }}>#{t.table}</div>
            <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 700 }}>{fmt(t.revenue)}</div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{t.orders} {pluralRu(t.orders, ['заказ', 'заказа', 'заказов'])}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function formatShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
}
