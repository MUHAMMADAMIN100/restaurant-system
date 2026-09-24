import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PlusIcon, MinusIcon, MagnifyingGlassIcon, ForkKnifeIcon, BowlFoodIcon, ReceiptIcon,
  MoneyIcon, CreditCardIcon, TrashIcon, WarningCircleIcon, CaretLeftIcon, CaretRightIcon,
  ShoppingCartSimpleIcon, ArrowClockwiseIcon, ClockIcon, CheckCircleIcon,
} from '@phosphor-icons/react';
import { api, ApiError } from '../api/client';
import type { Order, Category, MenuItem } from '../api/client';
import { useOrderSocket, useMenuSocket, useCategorySocket, useSocketStatus } from '../hooks/useSocket';
import { useNow } from '../hooks/useNow';
import { Spinner, useToast, EmptyState, Modal, Skeleton, StatusBadge, AnimatedNumber } from './UI';
import { categoryStyle } from '../utils/category';
import { flyToCart } from '../utils/flyToCart';
import { fmt, timeAgo, calcTotal, linePrice, pluralRu, upsertById } from '../utils/format';

const PAGE_SIZE = 12;
const MAX_TABLE = 50;
const CART_KEY = 'resto_cart';
const TABLE_KEY = 'resto_table';

const storage = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

type Cart = Record<number, number>;
interface CartLine { item: MenuItem; qty: number; }

// ── Payment modal ─────────────────────────────────────────────────────────────
interface PaymentModalProps { order: Order; onClose: () => void; onPaid: (orderId: number) => void; }
function PaymentModal({ order, onClose, onPaid }: PaymentModalProps) {
  const [type, setType]       = useState<'CASH' | 'CARD'>('CASH');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const toast = useToast();
  const total = calcTotal(order);

  const confirm = async () => {
    setLoading(true); setError('');
    try {
      await api.createPayment({ orderId: order.id, type });
      onPaid(order.id);
      toast(`Стол ${order.tableNumber}: оплата ${fmt(total)} принята`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { onPaid(order.id); toast('Этот заказ уже оплачен', 'error'); return; }
      setError((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`Оплата · стол ${order.tableNumber}`}
      onClose={onClose}
      width={440}
      busy={loading}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={loading}>Отмена</button>
          <button type="button" className="btn btn--primary" onClick={confirm} disabled={loading} data-autofocus>
            {loading && <Spinner />} Принять {fmt(total)}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="receipt">
          <div className="receipt__head"><span>Заказ № {order.id}</span><span>{timeAgo(order.createdAt)}</span></div>
          {(order.items || []).map((it) => (
            <div key={it.id} className="receipt__line">
              <span>{it.menuItem?.name ?? 'Блюдо'} × {it.quantity}</span>
              <span>{fmt(linePrice(it) * it.quantity)}</span>
            </div>
          ))}
          <div className="receipt__total"><span>Итого</span><strong>{fmt(total)}</strong></div>
        </div>

        <div className="field">
          <span className="label" id="pay-method">Способ оплаты</span>
          <div className="pay-methods" role="radiogroup" aria-labelledby="pay-method">
            {([['CASH', 'Наличные', <MoneyIcon key="m" size={24} />], ['CARD', 'Карта', <CreditCardIcon key="c" size={24} />]] as const).map(([t, label, icon]) => (
              <button
                key={t} type="button" role="radio" aria-checked={type === t} className="pay-method"
                onClick={() => setType(t)}
              >
                {type === t && <CheckCircleIcon size={18} weight="fill" className="pay-method__check" aria-hidden />}
                {icon}{label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="alert" role="alert"><WarningCircleIcon size={18} aria-hidden />{error}</div>}
      </div>
    </Modal>
  );
}

// ── Active orders ─────────────────────────────────────────────────────────────
type OrderFilter = 'all' | 'ready' | 'kitchen';
const STATUS_ORDER = { READY: 0, COOKING: 1, PENDING: 2, CLOSED: 3 } as const;

function ActiveOrders({ orders, onPay }: { orders: Order[]; onPay: (o: Order) => void }) {
  const [page, setPage]     = useState(1);
  const [filter, setFilter] = useState<OrderFilter>('all');
  const now = useNow();

  const active = useMemo(() => orders
    .filter((o) => o.status !== 'CLOSED')
    .filter((o) => filter === 'all' || (filter === 'ready' ? o.status === 'READY' : o.status !== 'READY'))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || +new Date(a.createdAt) - +new Date(b.createdAt)),
  [orders, filter]);

  const readyCount = orders.filter((o) => o.status === 'READY').length;
  const totalPages = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const current = Math.min(page, totalPages); // never land on an empty page when orders close
  const paged = active.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <section aria-label="Активные заказы">
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div role="group" aria-label="Фильтр заказов" className="chips">
          {([['all', 'Все'], ['ready', `К оплате${readyCount ? ` · ${readyCount}` : ''}`], ['kitchen', 'На кухне']] as const).map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => { setFilter(k); setPage(1); }}>{l}</button>
          ))}
        </div>
      </div>

      {active.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ReceiptIcon size={24} />}
            title={filter === 'ready' ? 'Нет заказов к оплате' : 'Активных заказов нет'}
            text={filter === 'all' ? 'Новые заказы появятся здесь сразу после отправки на кухню.' : undefined}
          />
        </div>
      ) : (
        <>
          <div className="tickets">
            {paged.map((order, idx) => (
              <article key={order.id} className={`card ticket reveal ${order.status === 'READY' ? 'is-ready' : ''}`} data-status={order.status}
                style={{ ['--i' as string]: idx }} aria-label={`Стол ${order.tableNumber}`}>
                <div className="ticket__head">
                  <div>
                    <div className="ticket__table">Стол {order.tableNumber}</div>
                    <div className="ticket__meta"><span>№ {order.id}</span><span aria-hidden>·</span><ClockIcon size={12} aria-hidden /><span>{timeAgo(order.createdAt, now)}</span></div>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <ul className="ticket__items">
                  {(order.items || []).map((it) => (
                    <li key={it.id} className="ticket__item">
                      <span className="ticket__item-name">{it.menuItem?.name ?? 'Блюдо'}</span>
                      <span className="ticket__item-qty">× {it.quantity}</span>
                    </li>
                  ))}
                </ul>
                <div className="ticket__foot">
                  <span className="ticket__total">{fmt(calcTotal(order))}</span>
                  {order.status === 'READY'
                    ? <button type="button" className="btn btn--primary" onClick={() => onPay(order)}><CreditCardIcon size={18} aria-hidden /> Оплата</button>
                    : <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Ждём кухню</span>}
                </div>
              </article>
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="pager" aria-label="Страницы заказов">
              <button type="button" className="btn btn--icon" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Предыдущая страница"><CaretLeftIcon size={18} /></button>
              <span className="pager__info">Страница {current} из {totalPages}</span>
              <button type="button" className="btn btn--icon" onClick={() => setPage(current + 1)} disabled={current === totalPages} aria-label="Следующая страница"><CaretRightIcon size={18} /></button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

// ── Cart panel (desktop sidebar + mobile sheet) ───────────────────────────────
interface CartPanelProps {
  lines: CartLine[];
  total: number;
  tableNumber: string;
  tableError: string;
  onTable: (v: string) => void;
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  submitting: boolean;
  idPrefix: string;
}
function CartPanel({ lines, total, tableNumber, tableError, onTable, onAdd, onRemove, onClear, onSubmit, submitting, idPrefix }: CartPanelProps) {
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const unavailable = lines.filter((l) => !l.item.isAvailable);
  const tableId = `${idPrefix}-table`;
  return (
    <>
      <div className="cart__section" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="field">
          <label className="label" htmlFor={tableId}>Номер стола <span className="req" aria-hidden>*</span></label>
          <input
            id={tableId} className="input num" type="number" inputMode="numeric" min={1} max={MAX_TABLE}
            value={tableNumber} onChange={(e) => onTable(e.target.value)} placeholder={`1–${MAX_TABLE}`}
            aria-invalid={!!tableError} aria-describedby={tableError ? `${tableId}-err` : undefined}
          />
          {tableError && <span className="field-error" id={`${tableId}-err`}><WarningCircleIcon size={14} aria-hidden />{tableError}</span>}
        </div>
      </div>

      <div className="cart__items">
        {lines.length === 0 ? (
          <div className="cart-empty">
            <ShoppingCartSimpleIcon size={28} aria-hidden />
            <span>Нажмите на блюдо, чтобы добавить его в заказ</span>
          </div>
        ) : lines.map(({ item, qty: q }) => (
          <div key={item.id} className="cart-line">
            <div className="cart-line__info">
              <div className="cart-line__name">{item.name}</div>
              <div className="cart-line__price">
                {item.isAvailable ? `${fmt(item.price)} за шт.` : <span style={{ color: 'var(--danger-fg)' }}>Сейчас недоступно</span>}
              </div>
            </div>
            <div className="stepper stepper--sm">
              <button type="button" className="stepper__btn" onClick={() => onRemove(item.id)} aria-label={`Убрать одну порцию: ${item.name}`}><MinusIcon size={14} weight="bold" /></button>
              <span className="stepper__value" aria-live="polite">{q}</span>
              <button type="button" className="stepper__btn" onClick={() => onAdd(item.id)} disabled={!item.isAvailable} aria-label={`Добавить порцию: ${item.name}`}><PlusIcon size={14} weight="bold" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="cart__foot">
        {unavailable.length > 0 && (
          <div className="alert" role="alert"><WarningCircleIcon size={18} aria-hidden />Уберите недоступные блюда, чтобы отправить заказ</div>
        )}
        <div className="cart__total">
          <span className="cart__total-label">{qty > 0 ? `${qty} ${pluralRu(qty, ['позиция', 'позиции', 'позиций'])}` : 'Итого'}</span>
          <AnimatedNumber className="cart__total-value" value={total} format={fmt} />
        </div>
        <button
          type="button" className="btn btn--primary btn--lg btn--block" onClick={onSubmit}
          disabled={lines.length === 0 || unavailable.length > 0 || submitting}
        >
          {submitting && <Spinner />}
          {submitting ? 'Отправляем…' : 'Отправить на кухню'}
        </button>
        {lines.length > 0 && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear} disabled={submitting} style={{ justifySelf: 'center' }}>
            <TrashIcon size={16} aria-hidden /> Очистить заказ
          </button>
        )}
      </div>
    </>
  );
}

// ── WaiterView (root) ─────────────────────────────────────────────────────────
export default function WaiterView() {
  const [tab, setTab] = useState<'new' | 'orders'>('new');
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu]             = useState<MenuItem[]>([]);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [query, setQuery]           = useState('');
  const [cart, setCart]             = useState<Cart>(() => {
    try { return JSON.parse(storage.get(CART_KEY) || '{}'); } catch { return {}; }
  });
  const [tableNumber, setTableNumber] = useState(() => storage.get(TABLE_KEY) || '');
  const [tableError, setTableError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [payOrder, setPayOrder]     = useState<Order | null>(null);
  const [cartOpen, setCartOpen]     = useState(false);
  const toast = useToast();

  const loadData = useCallback(async () => {
    setLoadError('');
    try {
      const [cats, items, ords] = await Promise.all([api.getCategories(), api.getMenu(), api.getOrders()]);
      setCategories(cats); setMenu(items); setOrders(ords);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSocketStatus(loadData);

  useEffect(() => { storage.set(CART_KEY, JSON.stringify(cart)); }, [cart]);
  useEffect(() => { storage.set(TABLE_KEY, tableNumber); }, [tableNumber]);

  useOrderSocket({
    onNew:    (o) => setOrders((p) => upsertById(p, o, 'start')),
    onStatus: (o) => {
      setOrders((p) => upsertById(p, o, 'start'));
      if (o.status === 'READY') toast(`Стол ${o.tableNumber}: заказ готов`);
    },
    onClosed: (o) => setOrders((p) => upsertById(p, o, 'start')),
  });
  useMenuSocket({
    onCreated: (item) => setMenu((p) => upsertById(p, item)),
    onUpdated: (item) => setMenu((p) => upsertById(p, item)),
    onDeleted: (id)   => setMenu((p) => p.filter((x) => x.id !== id)),
  });
  useCategorySocket({
    onCreated: (cat) => setCategories((p) => upsertById(p, cat)),
    onUpdated: (cat) => setCategories((p) => upsertById(p, cat)),
    onDeleted: (id)  => { setCategories((p) => p.filter((x) => x.id !== id)); setSelectedCat((c) => (c === id ? null : c)); },
  });

  const addToCart = (id: number) => setCart((p) => ({ ...p, [id]: Math.min((p[id] ?? 0) + 1, 99) }));
  const removeFromCart = (id: number) => setCart((p) => {
    const n = { ...p };
    if ((n[id] ?? 0) > 1) n[id]--; else delete n[id];
    return n;
  });
  const clearCart = () => setCart({});
  const addWithFly = (item: MenuItem, from: HTMLElement) => {
    const media = from.closest('.dish')?.querySelector<HTMLElement>('.dish__media') ?? from;
    flyToCart(media, item.imageUrl);
    addToCart(item.id);
  };

  const lines: CartLine[] = Object.entries(cart)
    .map(([id, qty]) => ({ item: menu.find((m) => m.id === Number(id)), qty }))
    .filter((x): x is CartLine => x.item !== undefined);
  const cartTotal = lines.reduce((s, { item, qty }) => s + Number(item.price) * qty, 0);
  const cartQty   = lines.reduce((s, { qty }) => s + qty, 0);

  const onTable = (v: string) => { setTableNumber(v); if (tableError) setTableError(''); };

  const submitOrder = async () => {
    const t = Number(tableNumber);
    // On phones/tablets the cart lives in a sheet — open it so the error is visible. On desktop it's the sidebar.
    const revealCart = () => { if (window.matchMedia('(max-width: 1023px)').matches) setCartOpen(true); };
    if (!tableNumber) { setTableError('Укажите номер стола'); revealCart(); return; }
    if (!Number.isInteger(t) || t < 1 || t > MAX_TABLE) { setTableError(`Номер стола от 1 до ${MAX_TABLE}`); revealCart(); return; }
    if (lines.length === 0) return;

    setSubmitting(true);
    try {
      const created = await api.createOrder({
        tableNumber: t,
        items: lines.map(({ item, qty }) => ({ menuItemId: item.id, quantity: qty })),
      });
      // The WebSocket may have delivered it already — upsert keeps a single copy.
      setOrders((p) => upsertById(p, created, 'start'));
      // Clear only after the server confirmed, so nothing is lost on failure.
      clearCart();
      setTableNumber('');
      setCartOpen(false);
      toast(`Заказ для стола ${t} отправлен на кухню`);
    } catch (e) {
      toast((e as Error).message, 'error');
      loadData(); // refresh availability so the cart shows what changed
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaid = (id: number) => {
    setPayOrder(null);
    setOrders((p) => p.map((x) => (x.id === id ? { ...x, status: 'CLOSED' } : x)));
  };

  const filteredMenu = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter((m) =>
      m.isAvailable &&
      (!selectedCat || m.categoryId === selectedCat) &&
      (!q || m.name.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q)),
    );
  }, [menu, selectedCat, query]);

  if (loading) {
    return (
      <div className="stack" aria-busy="true">
        <Skeleton height={42} width={320} />
        <div className="menu-grid">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} height={250} radius={12} />)}</div>
      </div>
    );
  }

  if (loadError && menu.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<WarningCircleIcon size={24} />}
          title="Не удалось загрузить данные"
          text={loadError}
          action={<button className="btn btn--primary" onClick={() => { setLoading(true); loadData(); }}><ArrowClockwiseIcon size={16} /> Повторить</button>}
        />
      </div>
    );
  }

  const activeCount = orders.filter((o) => o.status !== 'CLOSED').length;
  const readyCount = orders.filter((o) => o.status === 'READY').length;
  const panelProps = {
    lines, total: cartTotal, tableNumber, tableError, onTable, onAdd: addToCart, onRemove: removeFromCart,
    onClear: clearCart, onSubmit: submitOrder, submitting,
  };

  return (
    <div>
      <div className="page-header">
        <div role="tablist" aria-label="Раздел" className="segmented">
          <button type="button" role="tab" className="segmented__item" aria-selected={tab === 'new'} onClick={() => setTab('new')}>
            <ForkKnifeIcon size={18} aria-hidden /> Новый заказ
          </button>
          <button type="button" role="tab" className="segmented__item" aria-selected={tab === 'orders'} onClick={() => setTab('orders')}>
            <ReceiptIcon size={18} aria-hidden /> Заказы
            {activeCount > 0 && <span className={`count ${readyCount ? '' : 'count--muted'}`} aria-label={`${activeCount} активных, ${readyCount} готовы`}>{activeCount}</span>}
          </button>
        </div>
      </div>

      {tab === 'new' && (
        <div className="order-layout">
          <section aria-label="Меню">
            <div className="menu-filters">
              <div className="input-wrap input-wrap--lead">
                <span className="input-wrap__lead"><MagnifyingGlassIcon size={18} aria-hidden /></span>
                <input className="input" type="search" placeholder="Найти блюдо" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по меню" />
              </div>
              <div className="chips" role="group" aria-label="Категории">
                <button type="button" className="chip" aria-pressed={!selectedCat} onClick={() => setSelectedCat(null)}>Все</button>
                {categories.map((c) => {
                  const { tone, Icon } = categoryStyle(c.name, c.id);
                  return (
                    <button key={c.id} type="button" className="chip" data-tone={tone} aria-pressed={selectedCat === c.id} onClick={() => setSelectedCat(selectedCat === c.id ? null : c.id)}>
                      <span className="chip__icon" aria-hidden><Icon size={16} weight="duotone" /></span>{c.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredMenu.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={<BowlFoodIcon size={24} />}
                  title={query ? 'Ничего не найдено' : 'В этой категории пока нет блюд'}
                  text={query ? `По запросу «${query}» блюд нет. Попробуйте другое название.` : undefined}
                  action={query ? <button className="btn" onClick={() => setQuery('')}>Сбросить поиск</button> : undefined}
                />
              </div>
            ) : (
              <div className="menu-grid">
                {filteredMenu.map((item, idx) => {
                  const q = cart[item.id] ?? 0;
                  const catName = item.category?.name ?? categories.find((c) => c.id === item.categoryId)?.name;
                  const { tone, Icon: CatIcon } = categoryStyle(catName, item.categoryId);
                  return (
                    <article key={item.id} className={`dish reveal ${q ? 'is-selected' : ''}`} data-tone={tone} style={{ ['--i' as string]: idx }}>
                      <button type="button" className="dish__main" onClick={(e) => addWithFly(item, e.currentTarget)} aria-label={`${item.name}, ${fmt(item.price)}, добавить в заказ`}>
                        <span className="dish__media">
                          <span className="dish__placeholder" aria-hidden><CatIcon size={40} weight="duotone" /></span>
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt="" loading="lazy" width={400} height={300}
                              style={{ position: 'relative' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          {q > 0 && <span key={q} className="dish__qty bump" aria-hidden>{q}</span>}
                        </span>
                        <span className="dish__body">
                          {catName && <span className="dish__cat tone-pill"><CatIcon size={12} weight="bold" aria-hidden />{catName}</span>}
                          <span className="dish__name">{item.name}</span>
                          {item.description && <span className="dish__desc">{item.description}</span>}
                        </span>
                      </button>
                      <div className="dish__foot">
                        <span className="dish__price">{fmt(item.price)}</span>
                        {q > 0 ? (
                          <div className="stepper stepper--sm">
                            <button type="button" className="stepper__btn" onClick={() => removeFromCart(item.id)} aria-label={`Убрать порцию: ${item.name}`}><MinusIcon size={14} weight="bold" /></button>
                            <span className="stepper__value">{q}</span>
                            <button type="button" className="stepper__btn" onClick={(e) => addWithFly(item, e.currentTarget)} aria-label={`Добавить порцию: ${item.name}`}><PlusIcon size={14} weight="bold" /></button>
                          </div>
                        ) : (
                          <button type="button" className="btn--add" onClick={(e) => addWithFly(item, e.currentTarget)} aria-label={`Добавить: ${item.name}`}>
                            <PlusIcon size={18} weight="bold" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="card cart" aria-label="Текущий заказ">
            <div className="cart__inner">
              <div className="cart__head" data-cart-target>
                <h2 className="cart__title">Заказ</h2>
                {cartQty > 0 && <span key={cartQty} className="count bump">{cartQty}</span>}
              </div>
              <CartPanel {...panelProps} idPrefix="cart-desktop" />
            </div>
          </aside>
        </div>
      )}

      {tab === 'orders' && <ActiveOrders orders={orders} onPay={setPayOrder} />}

      {tab === 'new' && (
        <>
          <div className="cart-bar-spacer" aria-hidden />
          <div className="cart-bar">
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => setCartOpen(true)} data-cart-target>
              <span className="row"><ShoppingCartSimpleIcon size={20} aria-hidden /> Заказ{cartQty > 0 && <span key={cartQty} className="count bump" style={{ background: '#fff', color: 'var(--brand)' }}>{cartQty}</span>}</span>
              <AnimatedNumber className="num" value={cartTotal} format={fmt} />
            </button>
          </div>
        </>
      )}

      {cartOpen && (
        <Modal title="Заказ" onClose={() => setCartOpen(false)} width={480} busy={submitting}>
          <div style={{ margin: 'calc(var(--sp-5) * -1)' }}>
            <CartPanel {...panelProps} idPrefix="cart-sheet" />
          </div>
        </Modal>
      )}

      {payOrder && <PaymentModal order={payOrder} onClose={() => setPayOrder(null)} onPaid={handlePaid} />}
    </div>
  );
}
