import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import {
  ArrowClockwiseIcon, WarningCircleIcon, TrendUpIcon, TrendDownIcon, MinusIcon,
  MoneyIcon, CreditCardIcon, ChartBarIcon, CoinsIcon, ReceiptIcon, ForkKnifeIcon, CookingPotIcon,
} from '@phosphor-icons/react';
import { api } from '../api/client';
import type { Analytics as AnalyticsData, AnalyticsPeriod, TableBucket, DishBucket, LiveLoad } from '../api/client';
import { Skeleton, EmptyState, Spinner, StatusBadge } from './UI';
import { fmt, pluralRu } from '../utils/format';
import { useOrderSocket, usePaymentSocket, useSocketStatus } from '../hooks/useSocket';

const PERIODS: { key: AnalyticsPeriod; label: string; sub: string }[] = [
  { key: 'today', label: 'Сегодня',   sub: 'за сегодня' },
  { key: 'week',  label: '7 дней',    sub: 'за 7 дней' },
  { key: 'month', label: '30 дней',   sub: 'за 30 дней' },
  { key: 'all',   label: 'Всё время', sub: 'за всё время' },
];

const num = new Intl.NumberFormat('ru-RU');
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
/** Parse "YYYY-MM-DD" as a local date (new Date(str) would treat it as UTC). */
const localDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const shortMoney = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} млн` : n >= 10_000 ? `${Math.round(n / 1000)} тыс.` : num.format(Math.round(n)));

/** Round the axis maximum up to a readable number (1, 2, 2.5, 5 × 10ⁿ). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

// ── Column chart (single series, hover/focus tooltip, sr-only table) ─────────
interface Col { key: string; label: string; value: number; tip: ReactNode; }
interface ColumnChartProps {
  cols: Col[];
  caption: string;
  valueLabel: string;
  formatAxis: (n: number) => string;
  formatValue: (n: number) => string;
  highlight?: number;
  labelEvery?: number;
  height?: number;
  integer?: boolean;
}
function ColumnChart({ cols, caption, valueLabel, formatAxis, formatValue, highlight, labelEvery = 1, height = 200, integer = false }: ColumnChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = niceMax(Math.max(...cols.map((c) => c.value), 0));
  // Counts get whole-number ticks: the axis max must be even so the midpoint is an integer too.
  const max = integer ? Math.max(2, Math.ceil(raw / 2) * 2) : raw;
  const ticks = [0, max / 2, max];
  const active = hover !== null ? cols[hover] : null;

  return (
    <figure style={{ margin: 0 }}>
      <div className="colchart" style={{ ['--h' as string]: `${height}px` }} aria-hidden="true">
        <div className="colchart__axis">
          {ticks.map((t) => <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>{formatAxis(t)}</span>)}
        </div>
        <div className="colchart__plot" onMouseLeave={() => setHover(null)}>
          {ticks.slice(1).map((t) => <div key={t} className="colchart__grid" style={{ bottom: `${(t / max) * 100}%` }} />)}
          <div className="colchart__bars">
            {cols.map((c, i) => (
              <div
                key={c.key}
                className="colchart__slot"
                onMouseEnter={() => setHover(i)}
                onTouchStart={() => setHover(i)}
              >
                <div
                  className={`colchart__bar ${highlight === i ? 'is-peak' : ''}`}
                  style={{ height: `${(c.value / max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          {active && hover !== null && (
            <div
              className="viz-tip"
              style={{
                left: `clamp(60px, ${((hover + 0.5) / cols.length) * 100}%, calc(100% - 60px))`,
                top: `${100 - (active.value / max) * 100}%`,
              }}
            >
              {active.tip}
            </div>
          )}
        </div>
        <div className="colchart__labels">
          {cols.map((c, i) => <span key={c.key}>{i % labelEvery === 0 ? c.label : ''}</span>)}
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Период</th><th scope="col">{valueLabel}</th></tr></thead>
        <tbody>{cols.map((c) => <tr key={c.key}><th scope="row">{c.label}</th><td>{formatValue(c.value)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────────────
function ChartCard({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card__header">
        <h2 className="card__title">{title}</h2>
        {meta && <div className="card__meta">{meta}</div>}
      </div>
      <div className="card__body">{children}</div>
    </section>
  );
}

function Trend({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const Icon = dir === 'up' ? TrendUpIcon : dir === 'down' ? TrendDownIcon : MinusIcon;
  return (
    <span className={`trend trend--${dir}`}>
      <Icon size={12} weight="bold" aria-hidden />
      <span className="sr-only">{dir === 'up' ? 'рост' : dir === 'down' ? 'снижение' : 'без изменений'}</span>
      {Math.abs(value)}%
    </span>
  );
}

function Kpi({ label, icon, value, foot }: { label: string; icon: ReactNode; value: string; foot: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi__label"><span aria-hidden style={{ display: 'flex', color: 'var(--text-3)' }}>{icon}</span>{label}</div>
      <div className="kpi__value">{value}</div>
      <div className="kpi__foot">{foot}</div>
    </div>
  );
}

function KitchenLoad({ load }: { load: LiveLoad }) {
  const rows = [
    { status: 'PENDING' as const, count: load.pending },
    { status: 'COOKING' as const, count: load.cooking },
    { status: 'READY' as const,   count: load.ready },
  ];
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ChartCard title="Сейчас в работе" meta="обновляется вживую">
      <div className="load">
        {rows.map((r) => (
          <div key={r.status}>
            <div className="load__row">
              <StatusBadge status={r.status} />
              <span className="load__value">{r.count}</span>
            </div>
            <div className="hbar__track" style={{ marginTop: 8 }} aria-hidden>
              <div className="hbar__fill" data-status={r.status} style={{ width: `${(r.count / max) * 100}%`, background: 'var(--st-dot)' }} />
            </div>
          </div>
        ))}
        <div className="load__foot"><span>Оплачено за всё время</span><strong className="num" style={{ color: 'var(--text)' }}>{num.format(load.closed)}</strong></div>
      </div>
    </ChartCard>
  );
}

function PaymentSplit({ data }: { data: AnalyticsData }) {
  const total = data.cashRevenue + data.cardRevenue;
  const rows = [
    { key: 'cash', name: 'Наличные', icon: <MoneyIcon size={16} aria-hidden />, color: 'var(--viz-1)', amount: data.cashRevenue, count: data.cashCount },
    { key: 'card', name: 'Карта',    icon: <CreditCardIcon size={16} aria-hidden />, color: 'var(--viz-2)', amount: data.cardRevenue, count: data.cardCount },
  ];
  return (
    <ChartCard title="Способы оплаты" meta={total ? fmt(total) : undefined}>
      {total === 0 ? (
        <EmptyState icon={<CreditCardIcon size={24} />} title="Оплат пока нет" text="Данные появятся после первой оплаты за период." />
      ) : (
        <>
          <div className="split" role="img" aria-label={rows.map((r) => `${r.name}: ${Math.round((r.amount / total) * 100)}%`).join(', ')}>
            {rows.filter((r) => r.amount > 0).map((r) => <div key={r.key} className="split__seg" style={{ flexGrow: r.amount, background: r.color }} />)}
          </div>
          <div className="legend">
            {rows.map((r) => (
              <div key={r.key} className="legend__row">
                <span className="legend__swatch" style={{ background: r.color }} aria-hidden />
                <span className="legend__name">{r.icon}{r.name} <span className="muted num">{Math.round((r.amount / total) * 100)}%</span></span>
                <span className="legend__value">
                  <strong>{fmt(r.amount)}</strong>
                  <span>{r.count} {pluralRu(r.count, ['оплата', 'оплаты', 'оплат'])}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

function TopDishes({ title, dishes, valueKey }: { title: string; dishes: DishBucket[]; valueKey: 'revenue' | 'quantity' }) {
  const max = Math.max(...dishes.map((d) => d[valueKey]), 1);
  const format = (d: DishBucket) => (valueKey === 'revenue' ? fmt(d.revenue) : `${num.format(d.quantity)} шт.`);
  return (
    <ChartCard title={title}>
      {dishes.length === 0 ? (
        <EmptyState icon={<ForkKnifeIcon size={24} />} title="Нет данных" text="Здесь появятся блюда из оплаченных заказов." />
      ) : (
        <ol className="hbars">
          {dishes.map((d, i) => (
            <li key={d.name} className="hbar">
              <span className="hbar__rank">{i + 1}</span>
              <span className="hbar__name" title={d.name}>{d.name}</span>
              <span className="hbar__value">{format(d)}</span>
              <span className="hbar__track" aria-hidden><span className="hbar__fill" style={{ display: 'block', width: `${(d[valueKey] / max) * 100}%` }} /></span>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

function TopTables({ tables }: { tables: TableBucket[] }) {
  if (tables.length === 0) return null;
  return (
    <ChartCard title="Столы с наибольшей выручкой">
      <ol className="tables-top" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {tables.map((t, i) => (
          <li key={t.table} className="table-stat">
            <div className="table-stat__name"><span>Стол {t.table}</span><span className="num">#{i + 1}</span></div>
            <div className="table-stat__value">{fmt(t.revenue)}</div>
            <div className="table-stat__sub">{t.orders} {pluralRu(t.orders, ['заказ', 'заказа', 'заказов'])}</div>
          </li>
        ))}
      </ol>
    </ChartCard>
  );
}

// ── Analytics (root) ──────────────────────────────────────────────────────────
export default function Analytics() {
  const [period, setPeriod]   = useState<AnalyticsPeriod>('week');
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [error, setError]     = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestId = useRef(0);
  const debounce = useRef<number | undefined>(undefined);

  const load = useCallback(async (p: AnalyticsPeriod) => {
    const id = ++requestId.current;
    setRefreshing(true);
    try {
      const next = await api.getAnalytics(p);
      if (id !== requestId.current) return; // a newer request superseded this one
      setData(next); setError(''); setUpdatedAt(new Date());
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(period); }, [period, load]);
  useEffect(() => () => window.clearTimeout(debounce.current), []);

  // One payment emits several events (payment + order closed) → coalesce into a single reload.
  const periodRef = useRef(period);
  periodRef.current = period;
  const scheduleReload = useCallback(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => load(periodRef.current), 600);
  }, [load]);
  usePaymentSocket({ onCreated: scheduleReload });
  useOrderSocket({ onNew: scheduleReload, onStatus: scheduleReload, onClosed: scheduleReload });
  const online = useSocketStatus(scheduleReload);

  const periodMeta = PERIODS.find((p) => p.key === period)!;

  const revenueChart = useMemo(() => {
    if (!data) return null;
    if (period === 'today') {
      const cols = data.ordersByHour.map((h) => ({
        key: String(h.hour), label: String(h.hour).padStart(2, '0'), value: h.revenue,
        tip: <><strong>{fmt(h.revenue)}</strong>{hh(h.hour)} · {h.count} {pluralRu(h.count, ['заказ', 'заказа', 'заказов'])}</>,
      }));
      return { title: 'Выручка по часам', cols, labelEvery: 3 };
    }
    const cols = data.revenueByDay.map((d) => {
      const date = localDate(d.date);
      // Compact dd.mm fits narrow phone columns; the tooltip carries the full date.
      const label = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      return {
        key: d.date, label, value: d.revenue,
        tip: <><strong>{fmt(d.revenue)}</strong>{date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })} · {d.orders} {pluralRu(d.orders, ['заказ', 'заказа', 'заказов'])}</>,
      };
    });
    return { title: 'Выручка по дням', cols, labelEvery: cols.length > 14 ? 5 : cols.length > 7 ? 2 : 1 };
  }, [data, period]);

  const header = (
    <div className="page-header">
      <div>
        <h1 className="page-title">Аналитика</h1>
        <p className="page-subtitle" aria-live="polite">
          {refreshing ? <span className="row"><Spinner size={12} /> Обновляем…</span>
            : updatedAt ? `Обновлено в ${updatedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}${online ? ' · обновляется автоматически' : ' · нет связи'}` : ' '}
        </p>
      </div>
      <div className="segmented" role="group" aria-label="Период">
        {PERIODS.map((p) => (
          <button key={p.key} type="button" className="segmented__item" aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</button>
        ))}
      </div>
    </div>
  );

  if (!data) {
    return (
      <div>
        {header}
        {error ? (
          <div className="card">
            <EmptyState icon={<WarningCircleIcon size={24} />} title="Не удалось загрузить аналитику" text={error}
              action={<button className="btn btn--primary" onClick={() => load(period)} disabled={refreshing}><ArrowClockwiseIcon size={16} /> Повторить</button>} />
          </div>
        ) : (
          <div className="stack" aria-busy="true">
            <div className="kpis">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={116} radius={12} />)}</div>
            <Skeleton height={300} radius={12} />
          </div>
        )}
      </div>
    );
  }

  const peak = data.ordersByHour.reduce((best, h, i, arr) => (h.count > arr[best].count ? i : best), 0);
  const hasPeak = data.ordersByHour[peak]?.count > 0;
  const activeNow = data.liveLoad.pending + data.liveLoad.cooking + data.liveLoad.ready;
  const cmp = period === 'all' ? null : data.comparison;
  const vsLabel = period === 'today' ? 'к вчера' : 'к прошлому периоду';

  return (
    <div>
      {header}
      {error && (
        <div className="alert" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <WarningCircleIcon size={18} aria-hidden /> Показаны последние данные: {error}
        </div>
      )}

      <div className="kpis">
        <Kpi label="Выручка" icon={<CoinsIcon size={16} />} value={fmt(data.totalRevenue)}
          foot={cmp?.revenueChange != null ? <><Trend value={cmp.revenueChange} /><span>{vsLabel}</span></> : <span>{periodMeta.sub}</span>} />
        <Kpi label="Оплачено заказов" icon={<ReceiptIcon size={16} />} value={num.format(data.orderCount)}
          foot={<>{cmp?.orderChange != null && <Trend value={cmp.orderChange} />}<span>{data.tablesServed} {pluralRu(data.tablesServed, ['стол', 'стола', 'столов'])} обслужено</span></>} />
        <Kpi label="Средний чек" icon={<ChartBarIcon size={16} />} value={fmt(data.avgOrder)}
          foot={<span>{String(data.avgItemsPerOrder).replace('.', ',')} {pluralRu(Math.round(data.avgItemsPerOrder), ['блюдо', 'блюда', 'блюд'])} в заказе</span>} />
        <Kpi label="Сейчас в работе" icon={<CookingPotIcon size={16} />} value={num.format(activeNow)}
          foot={<span>{data.liveLoad.ready} {pluralRu(data.liveLoad.ready, ['ждёт', 'ждут', 'ждут'])} оплаты</span>} />
      </div>

      <div className="grid-wide">
        <ChartCard title={revenueChart!.title} meta={<>Всего <strong style={{ color: 'var(--text)' }} className="num">{fmt(data.totalRevenue)}</strong></>}>
          {data.totalRevenue === 0 ? (
            <EmptyState icon={<ChartBarIcon size={24} />} title="Продаж пока нет" text={`Нет оплаченных заказов ${periodMeta.sub}.`} />
          ) : (
            <div className="chart-scroll">
              <ColumnChart
                cols={revenueChart!.cols}
                caption={revenueChart!.title}
                valueLabel="Выручка"
                formatAxis={shortMoney}
                formatValue={fmt}
                labelEvery={revenueChart!.labelEvery}
              />
            </div>
          )}
        </ChartCard>
        <KitchenLoad load={data.liveLoad} />
      </div>

      <div className="grid-2">
        <PaymentSplit data={data} />
        <ChartCard title="Заказы по часам" meta={hasPeak ? <>Пик <strong style={{ color: 'var(--text)' }}>{hh(peak)}</strong></> : undefined}>
          {data.orderCount === 0 ? (
            <EmptyState icon={<ChartBarIcon size={24} />} title="Нет данных" text="Распределение появится после первых оплат." />
          ) : (
            <div className="chart-scroll">
              <ColumnChart
                height={150}
                cols={data.ordersByHour.map((h) => ({
                  key: String(h.hour), label: String(h.hour).padStart(2, '0'), value: h.count,
                  tip: <><strong>{h.count} {pluralRu(h.count, ['заказ', 'заказа', 'заказов'])}</strong>{hh(h.hour)}–{hh((h.hour + 1) % 24)} · {fmt(h.revenue)}</>,
                }))}
                caption="Количество оплаченных заказов по часам"
                valueLabel="Заказов"
                formatAxis={(n) => num.format(Math.round(n))}
                formatValue={(n) => num.format(n)}
                highlight={hasPeak ? peak : undefined}
                labelEvery={3}
                integer
              />
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid-2">
        <TopDishes title="Топ блюд по выручке" dishes={data.topDishesByRevenue} valueKey="revenue" />
        <TopDishes title="Топ блюд по количеству" dishes={data.topDishesByQuantity} valueKey="quantity" />
      </div>

      <TopTables tables={data.topTables} />
    </div>
  );
}
