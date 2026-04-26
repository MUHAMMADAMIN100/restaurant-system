import { useState, useEffect, useCallback, memo } from 'react';
import { api } from '../api/client';
import type { Order, Category, MenuItem } from '../api/client';
import { useOrderSocket, useMenuSocket, useCategorySocket } from '../hooks/useSocket';
import { Spinner, useToast, EmptyState, Modal, Skeleton } from './UI';
import { S, fmt, timeAgo, STATUS_LABEL, STATUS_COLOR, calcTotal } from '../utils/styles';

const PAGE_SIZE = 9;

// ── Payment modal ─────────────────────────────────────────────────────────────
interface PaymentModalProps { order: Order; onClose: () => void; onDone: () => void; }
function PaymentModal({ order, onClose, onDone }: PaymentModalProps) {
  const [type, setType]       = useState<'CASH' | 'CARD'>('CASH');
  const [loading, setLoading] = useState(false);
  const total = calcTotal(order);

  const confirm = async () => {
    setLoading(true);
    try {
      await api.createPayment({ orderId: order.id, amount: total, type });
      onDone();
    } catch (e) {
      alert((e as Error).message);
      setLoading(false);
    }
  };

  return (
    <Modal title="Оплата заказа" onClose={onClose} maxWidth={420}>
      <div className="anim-fade-up" style={{ background: '#1a1a1a', borderRadius: 10, padding: 16, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 16 }}>Стол #{order.tableNumber}</span>
          <span style={{ fontSize: 12, color: '#4b5563' }}>{timeAgo(order.createdAt)}</span>
        </div>
        {(order.items || []).map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9ca3af', marginBottom: 7, gap: 10 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.menuItem?.name || '?'} ×{it.quantity}</span>
            <span style={{ flexShrink: 0 }}>{fmt(Number(it.menuItem?.price || 0) * it.quantity)}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #262626', paddingTop: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#6b7280', fontSize: 13 }}>ИТОГО</span>
          <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: 24, fontFamily: "'Playfair Display', serif" }}>{fmt(total)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {([['CASH', '💵 Наличные'], ['CARD', '💳 Карта']] as [string, string][]).map(([t, l]) => (
          <button key={t} onClick={() => setType(t as 'CASH' | 'CARD')} style={{
            padding: '14px 0', borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600, fontSize: 13,
            background: type === t ? '#f59e0b' : '#1a1a1a',
            color: type === t ? '#000' : '#6b7280',
            border: `1px solid ${type === t ? '#f59e0b' : '#2a2a2a'}`,
            transition: 'all 0.2s var(--ease-out)',
          }}>{l}</button>
        ))}
      </div>

      <button
        style={{ ...S.btn('#10b981', '#fff'), width: '100%', padding: '14px 0', fontSize: 15, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        onClick={confirm} disabled={loading}
      >
        {loading && <Spinner size={16} color="#fff" />}
        Принять оплату · {fmt(total)}
      </button>
    </Modal>
  );
}

// ── Active orders list ────────────────────────────────────────────────────────
interface ActiveOrdersProps { orders: Order[]; onPayOrder: (o: Order) => void; }
const ActiveOrders = memo(function ActiveOrders({ orders, onPayOrder }: ActiveOrdersProps) {
  const [page, setPage] = useState(1);
  const active = orders.filter((o) => o.status !== 'CLOSED');
  const totalPages = Math.ceil(active.length / PAGE_SIZE);
  const paged = active.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (active.length === 0) return <EmptyState icon="📋" text="Нет активных заказов" />;

  return (
    <div className="anim-fade-up">
      <div className="grid-cols-123 stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {paged.map((order) => (
          <div key={order.id} className="anim-fade-up card-hover" style={{ ...S.card, border: `1px solid ${STATUS_COLOR[order.status]}33`, borderTop: `3px solid ${STATUS_COLOR[order.status]}`, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: '#e5e7eb' }}>Стол #{order.tableNumber}</div>
                <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>{timeAgo(order.createdAt)}</div>
              </div>
              <span style={{ ...S.badge(order.status), flexShrink: 0 }}>{STATUS_LABEL[order.status]}</span>
            </div>

            {(order.items || []).map((it) => (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9ca3af', marginBottom: 6, gap: 10 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.menuItem?.name || '?'}</span>
                <span style={{ color: '#6b7280', flexShrink: 0 }}>×{it.quantity}</span>
              </div>
            ))}

            <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>{fmt(calcTotal(order))}</span>
              {order.status === 'READY' && (
                <button className="anim-pulse-glow" style={S.btn('#10b981', '#fff')} onClick={() => onPayOrder(order)}>💳 Оплатить</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 24, flexWrap: 'wrap' }} role="navigation" aria-label="Страницы заказов">
          <button style={{ ...S.btnGhost, opacity: page === 1 ? 0.4 : 1 }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} aria-label="Назад">←</button>
          {Array.from({ length: totalPages }, (_, i) => (
            <button key={i + 1} style={S.tab(page === i + 1)} onClick={() => setPage(i + 1)} aria-current={page === i + 1 ? 'page' : undefined}>{i + 1}</button>
          ))}
          <button style={{ ...S.btnGhost, opacity: page === totalPages ? 0.4 : 1 }} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label="Вперёд">→</button>
        </div>
      )}
    </div>
  );
});

// ── WaiterView (root) ─────────────────────────────────────────────────────────
export default function WaiterView() {
  const [tab, setTab] = useState<'new' | 'orders'>('new');
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu]             = useState<MenuItem[]>([]);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [cart, setCart]             = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem('resto_cart') || '{}'); }
    catch { return {}; }
  });
  const [tableNumber, setTableNumber] = useState(
    () => localStorage.getItem('resto_table') || ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [payOrder, setPayOrder]     = useState<Order | null>(null);
  const [mobileCart, setMobileCart] = useState(false);
  const { show, node } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [cats, items, ords] = await Promise.all([api.getCategories(), api.getMenu(), api.getOrders()]);
      setCategories(cats); setMenu(items); setOrders(ords);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time updates via WebSocket
  useOrderSocket({
    onNew: (o) => setOrders((p) => {
      // If we already have this order (by id), skip
      if (p.find((x) => x.id === o.id)) return p;
      // If we have an optimistic clone (negative id, same table, created within 15s), replace it
      const optimisticIdx = p.findIndex((x) =>
        x.id < 0 &&
        x.tableNumber === o.tableNumber &&
        Math.abs(new Date(x.createdAt).getTime() - new Date(o.createdAt).getTime()) < 15000
      );
      if (optimisticIdx !== -1) {
        const next = [...p];
        next[optimisticIdx] = o;
        return next;
      }
      return [o, ...p];
    }),
    onStatus: (o) => setOrders((p) => p.map((x) => x.id === o.id ? o : x)),
    onClosed: (o) => setOrders((p) => p.map((x) => x.id === o.id ? o : x)),
  });
  useMenuSocket({
    onCreated: (item) => setMenu((p) => p.find((x) => x.id === item.id) ? p : [...p, item]),
    onUpdated: (item) => setMenu((p) => p.map((x) => x.id === item.id ? item : x)),
    onDeleted: (id)   => setMenu((p) => p.filter((x) => x.id !== id)),
  });
  useCategorySocket({
    onCreated: (cat) => setCategories((p) => p.find((x) => x.id === cat.id) ? p : [...p, cat]),
    onUpdated: (cat) => setCategories((p) => p.map((x) => x.id === cat.id ? cat : x)),
    onDeleted: (id)  => setCategories((p) => p.filter((x) => x.id !== id)),
  });

  const addToCart = (id: number) => setCart((p) => {
    const n = { ...p, [id]: (p[id] ?? 0) + 1 };
    localStorage.setItem('resto_cart', JSON.stringify(n));
    return n;
  });
  const removeFromCart = (id: number) => setCart((p) => {
    const n = { ...p };
    if (n[id] > 1) n[id]--;
    else delete n[id];
    localStorage.setItem('resto_cart', JSON.stringify(n));
    return n;
  });
  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ item: menu.find((m) => m.id === Number(id)), qty }))
    .filter((x): x is { item: MenuItem; qty: number } => x.item !== undefined);
  const cartTotal = cartItems.reduce((s, { item, qty }) => s + Number(item.price) * qty, 0);
  const cartQty   = cartItems.reduce((s, { qty }) => s + qty, 0);

  const submitOrder = async () => {
    if (!tableNumber) return show('Укажите номер стола', 'error');
    if (Number(tableNumber) < 1 || Number(tableNumber) > 50) return show('Номер стола от 1 до 50', 'error');
    if (cartItems.length === 0) return show('Добавьте блюда в заказ', 'error');

    // Optimistic order with temp id
    const tempId = -Date.now();
    const optimisticOrder: Order = {
      id: tempId,
      tableNumber: Number(tableNumber),
      status: 'PENDING',
      items: cartItems.map(({ item, qty }, idx) => ({
        id: -(idx + 1),
        menuItemId: item.id,
        menuItem: item,
        quantity: qty,
      })),
      createdAt: new Date().toISOString(),
    };
    setOrders((p) => [optimisticOrder, ...p]);
    setCart({});
    setTableNumber('');
    localStorage.removeItem('resto_cart');
    localStorage.removeItem('resto_table');
    setMobileCart(false);
    show('Заказ отправлен на кухню!');
    setSubmitting(true);

    try {
      const real = await api.createOrder({
        tableNumber: optimisticOrder.tableNumber,
        items: cartItems.map(({ item, qty }) => ({ menuItemId: item.id, quantity: qty })),
      });
      // Replace optimistic by id; if WS already replaced it, ensure no duplicate
      setOrders((p) => {
        const hasReal = p.some((x) => x.id === real.id);
        if (hasReal) return p.filter((x) => x.id !== tempId);
        return p.map((x) => x.id === tempId ? real : x);
      });
    } catch (e) {
      setOrders((p) => p.filter((x) => x.id !== tempId));
      show((e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayDone = () => {
    const id = payOrder?.id;
    setPayOrder(null);
    if (id) setOrders((p) => p.map((x) => x.id === id ? { ...x, status: 'CLOSED' } : x));
    show('Оплата принята! Заказ закрыт.');
  };

  if (loading) {
    return (
      <div className="anim-fade" style={{ display: 'grid', gap: 14 }}>
        <Skeleton height={42} radius={10} />
        <div className="grid-cols-1234">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} height={240} radius={14} />)}
        </div>
      </div>
    );
  }

  const activeCount = orders.filter((o) => o.status !== 'CLOSED').length;
  const filteredMenu = menu.filter((m) => m.isAvailable && (!selectedCat || m.categoryId === selectedCat));

  return (
    <div>
      {node}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, borderBottom: '1px solid #1a1a1a', paddingBottom: 14, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <button style={{ ...S.tab(tab === 'new'), whiteSpace: 'nowrap' }} onClick={() => setTab('new')}>Новый заказ</button>
        <button style={{ ...S.tab(tab === 'orders'), whiteSpace: 'nowrap' }} onClick={() => setTab('orders')}>
          Активные заказы
          {activeCount > 0 && <span style={{ marginLeft: 8, background: '#f59e0b', color: '#000', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{activeCount}</span>}
        </button>
      </div>

      {tab === 'new' && (
        <div className="menu-cart-layout">
          {/* LEFT: menu browser */}
          <div className="anim-fade-up">
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              <button style={{ ...S.tab(!selectedCat), padding: '6px 14px' }} onClick={() => setSelectedCat(null)}>Все</button>
              {categories.map((c) => (
                <button key={c.id} style={{ ...S.tab(selectedCat === c.id), padding: '6px 14px', whiteSpace: 'nowrap' }} onClick={() => setSelectedCat(selectedCat === c.id ? null : c.id)}>{c.name}</button>
              ))}
            </div>

            {filteredMenu.length === 0 && <EmptyState icon="🍽" text="Нет доступных блюд" />}
            <div className="grid-cols-1234 stagger">
              {filteredMenu.map((item) => (
                <div key={item.id} onClick={() => addToCart(item.id)} className="anim-fade-up img-zoom" style={{
                  background: '#141414', border: `1px solid ${cart[item.id] ? '#f59e0b' : '#222'}`,
                  borderRadius: 14, overflow: 'hidden', cursor: 'pointer', position: 'relative',
                  transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s var(--ease-out)',
                  boxShadow: cart[item.id] ? '0 0 0 2px #f59e0b55, 0 8px 24px rgba(245,158,11,0.18)' : 'none',
                  transform: cart[item.id] ? 'translateY(-2px)' : 'none',
                }}>
                  <div style={{ height: 130, background: '#1a1a1a', overflow: 'hidden', position: 'relative' }}>
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🍽</div>
                    )}
                    {cart[item.id] > 0 && (
                      <span className="anim-pop" key={cart[item.id]} style={{ position: 'absolute', top: 8, right: 8, background: '#f59e0b', color: '#000', minWidth: 24, height: 24, padding: '0 7px', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{cart[item.id]}</span>
                    )}
                  </div>
                  <div style={{ padding: '12px 14px 14px' }}>
                    <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {item.category?.name || categories.find((c) => c.id === item.categoryId)?.name}
                    </div>
                    <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 8, fontSize: 13, lineHeight: 1.4 }}>{item.name}</div>
                    {item.description && (
                      <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 8, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</div>
                    )}
                    <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 15 }}>{fmt(item.price)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT (desktop ≥1024px) / hidden on tablet & mobile — uses CartPanel below */}
          <div className="cart-sidebar-desktop" style={{ ...S.card, position: 'sticky', top: 76, border: '1px solid #2a2a2a' }}>
            <CartPanel
              cartItems={cartItems} cartQty={cartQty} cartTotal={cartTotal}
              tableNumber={tableNumber} setTableNumber={setTableNumber}
              addToCart={addToCart} removeFromCart={removeFromCart}
              submitOrder={submitOrder} submitting={submitting}
            />
          </div>
        </div>
      )}

      {tab === 'orders' && <ActiveOrders orders={orders} onPayOrder={setPayOrder} />}

      {/* MOBILE: bottom sticky cart bar */}
      {tab === 'new' && (
        <div className="show-mobile mobile-cart-bar anim-fade-up" style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(180deg, #0a0a0a, #050505)',
          borderTop: '1px solid #1e1e1e',
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          zIndex: 50,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.6)',
          alignItems: 'center',
          gap: 12,
        }}>
          <button
            onClick={() => setMobileCart(true)}
            style={{
              flex: 1, background: '#f59e0b', color: '#000', border: 'none',
              borderRadius: 10, padding: '12px 16px', fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              cursor: cartItems.length === 0 ? 'default' : 'pointer',
              opacity: cartItems.length === 0 ? 0.5 : 1,
            }}
            disabled={cartItems.length === 0}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              🛒 Корзина {cartQty > 0 && <span className="anim-pop" key={cartQty} style={{ background: '#000', color: '#f59e0b', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>{cartQty}</span>}
            </span>
            <span>{fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* MOBILE: cart sheet */}
      {mobileCart && (
        <Modal title="Заказ" onClose={() => setMobileCart(false)} maxWidth={500}>
          <CartPanel
            cartItems={cartItems} cartQty={cartQty} cartTotal={cartTotal}
            tableNumber={tableNumber} setTableNumber={setTableNumber}
            addToCart={addToCart} removeFromCart={removeFromCart}
            submitOrder={submitOrder} submitting={submitting}
          />
        </Modal>
      )}

      {payOrder && (
        <PaymentModal order={payOrder} onClose={() => setPayOrder(null)} onDone={handlePayDone} />
      )}

      {/* Add bottom padding on mobile to clear sticky cart */}
      {tab === 'new' && <div className="show-mobile show-mobile-spacer" style={{ height: 80 }} />}
    </div>
  );
}

// ── Cart panel (shared between desktop sidebar and mobile sheet) ──────────────
interface CartPanelProps {
  cartItems: Array<{ item: MenuItem; qty: number }>;
  cartQty: number;
  cartTotal: number;
  tableNumber: string;
  setTableNumber: (v: string) => void;
  addToCart: (id: number) => void;
  removeFromCart: (id: number) => void;
  submitOrder: () => void;
  submitting: boolean;
}
function CartPanel({ cartItems, cartQty, cartTotal, tableNumber, setTableNumber, addToCart, removeFromCart, submitOrder, submitting }: CartPanelProps) {
  return (
    <>
      <h3 style={{ margin: '0 0 18px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Заказ
        {cartQty > 0 && <span className="anim-pop" key={cartQty} style={{ fontSize: 12, color: '#f59e0b', background: '#451a03', borderRadius: 20, padding: '3px 12px', fontWeight: 600 }}>{cartQty} блюд</span>}
      </h3>

      <div style={{ marginBottom: 18 }}>
        <label style={S.label}>Номер стола</label>
        <input style={S.input} type="number" value={tableNumber} onChange={(e) => { setTableNumber(e.target.value); localStorage.setItem('resto_table', e.target.value); }} placeholder="1 — 50" min="1" max="50" />
      </div>

      {cartItems.length === 0 ? (
        <div className="anim-fade-up" style={{ textAlign: 'center', padding: '36px 0', color: '#2e2e2e' }}>
          <div className="anim-float" style={{ fontSize: 36, marginBottom: 10 }}>🍽</div>
          <div style={{ fontSize: 13 }}>Выберите блюда из меню</div>
        </div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
          {cartItems.map(({ item, qty }) => (
            <div key={item.id} className="anim-fade-up" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #1a1a1a' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: 12, color: '#4b5563' }}>{fmt(item.price)} / шт</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={() => removeFromCart(item.id)} style={{ background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#9ca3af', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <span className="anim-pop" key={qty} style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', minWidth: 18, textAlign: 'center' }}>{qty}</span>
                <button onClick={() => addToCart(item.id)} style={{ background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#9ca3af', width: 28, height: 28, borderRadius: '50%', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ color: '#6b7280', fontSize: 13 }}>Итого</span>
          <span className="anim-pop" key={cartTotal} style={{ fontWeight: 700, color: '#f59e0b', fontSize: 22, fontFamily: "'Playfair Display', serif" }}>{fmt(cartTotal)}</span>
        </div>
        <button
          style={{ ...S.btn(), width: '100%', padding: '13px 0', fontSize: 14, opacity: !tableNumber || cartItems.length === 0 ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          onClick={submitOrder} disabled={!tableNumber || cartItems.length === 0 || submitting}
        >
          {submitting && <Spinner size={16} color="#000" />}
          {submitting ? 'Отправка...' : 'Отправить на кухню →'}
        </button>
      </div>
    </>
  );
}
