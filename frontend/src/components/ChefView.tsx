import { useState, useEffect, useCallback, memo } from 'react';
import { api } from '../api/client';
import type { Order, OrderStatus } from '../api/client';
import { useOrderSocket } from '../hooks/useSocket';
import { Spinner, useToast } from './UI';
import { S, fmt, timeAgo, STATUS_LABEL, STATUS_COLOR, STATUS_BG, calcTotal } from '../utils/styles';

type AdvancableStatus = 'PENDING' | 'COOKING';
const NEXT: Record<AdvancableStatus, OrderStatus> = { PENDING: 'COOKING', COOKING: 'READY' };
const BTN_LABEL: Record<AdvancableStatus, string> = { PENDING: '▶ Начать готовить', COOKING: '✓ Готово!' };
const BTN_COLOR: Record<AdvancableStatus, string> = { PENDING: '#f59e0b', COOKING: '#3b82f6' };
const BTN_FG:    Record<AdvancableStatus, string> = { PENDING: '#000', COOKING: '#fff' };

interface OrderCardProps { order: Order; onAdvance: (o: Order) => void; advancing: boolean; }
const OrderCard = memo(function OrderCard({ order, onAdvance, advancing }: OrderCardProps) {
  const elapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const isLate  = order.status === 'PENDING' && elapsed > 5;

  return (
    <div style={{
      background: '#141414',
      border: `1px solid ${STATUS_COLOR[order.status]}22`,
      borderLeft: `4px solid ${STATUS_COLOR[order.status]}`,
      borderRadius: 12, padding: 18,
      transition: 'transform 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: '#e5e7eb' }}>
            Стол #{order.tableNumber}
          </div>
          <div style={{ fontSize: 11, color: isLate ? '#ef4444' : '#4b5563', marginTop: 4, fontWeight: isLate ? 600 : 400 }}>
            {isLate ? '⚠ ' : ''}{timeAgo(order.createdAt)}
          </div>
        </div>
        <span style={{ fontSize: 12, color: STATUS_COLOR[order.status], background: STATUS_BG[order.status], borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>
          #{order.id}
        </span>
      </div>

      <div style={{ borderTop: '1px solid #1e1e1e', borderBottom: '1px solid #1e1e1e', padding: '12px 0', marginBottom: 14 }}>
        {(order.items || []).map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#d1d5db', fontSize: 14, fontWeight: 500 }}>{it.menuItem?.name || '?'}</span>
            <span style={{ color: STATUS_COLOR[order.status], fontWeight: 800, fontSize: 18, fontFamily: "'Playfair Display', serif" }}>×{it.quantity}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: '#4b5563' }}>Сумма</span>
        <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600 }}>{fmt(calcTotal(order))}</span>
      </div>

      {order.status !== 'READY' ? (
        <button
          style={{ ...S.btn(BTN_COLOR[order.status as AdvancableStatus], BTN_FG[order.status as AdvancableStatus]), width: '100%', padding: '11px 0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: advancing ? 0.7 : 1 }}
          onClick={() => onAdvance(order)}
          disabled={advancing}
          aria-label={BTN_LABEL[order.status as AdvancableStatus]}
        >
          {advancing ? <Spinner size={14} color={BTN_FG[order.status as AdvancableStatus]} /> : null}
          {advancing ? 'Обновление...' : BTN_LABEL[order.status as AdvancableStatus]}
        </button>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 13, color: '#10b981', padding: '11px', background: '#064e3b', borderRadius: 8, fontWeight: 600, letterSpacing: '0.03em' }}>
          ✓ Ожидает подачи на стол
        </div>
      )}
    </div>
  );
});

export default function ChefView() {
  const [orders, setOrders]       = useState<Order[]>([]);
  const [loading, setLoading]     = useState(true);
  const [advancing, setAdvancing] = useState<number | null>(null);
  const { show, node } = useToast();

  const loadOrders = useCallback(async () => {
    try {
      const data = await api.getOrders();
      setOrders(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Real-time via WebSocket
  useOrderSocket({
    onNew:    (o) => { setOrders((p) => [o, ...p.filter((x) => x.id !== o.id)]); show('Новый заказ!'); },
    onStatus: (o) => setOrders((p) => p.map((x) => x.id === o.id ? o : x)),
    onClosed: (o) => setOrders((p) => p.map((x) => x.id === o.id ? o : x)),
  });

  const advance = async (order: Order) => {
    const next = NEXT[order.status as AdvancableStatus];
    if (!next) return;
    setAdvancing(order.id);
    try {
      await api.updateStatus(order.id, next);
    } catch (e) { show((e as Error).message, 'error'); }
    finally { setAdvancing(null); }
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={36} /></div>;

  const active = orders.filter((o) => ['PENDING', 'COOKING', 'READY'].includes(o.status));

  return (
    <div>
      {node}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", fontSize: 26, color: '#e5e7eb' }}>Кухонный дисплей</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#4b5563' }}>
            Активных: {active.length} · Обновляется в реальном времени
            <span style={{ marginLeft: 10, display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#10b981', verticalAlign: 'middle', animation: 'pulse 2s infinite' }} />
          </p>
        </div>
        <button style={S.btnGhost} onClick={loadOrders}>↻ Обновить</button>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {(['PENDING', 'COOKING', 'READY'] as const).map((status) => {
          const col = active.filter((o) => o.status === status);
          return (
            <div key={status}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                padding: '10px 16px', background: STATUS_BG[status],
                borderRadius: 10, border: `1px solid ${STATUS_COLOR[status]}33`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[status] }} />
                <span style={{ fontWeight: 700, color: STATUS_COLOR[status], fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {STATUS_LABEL[status]}
                </span>
                <span style={{ marginLeft: 'auto', background: 'rgba(0,0,0,0.3)', color: STATUS_COLOR[status], borderRadius: 20, padding: '1px 10px', fontSize: 13, fontWeight: 700 }}>{col.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {col.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAdvance={advance}
                    advancing={advancing === order.id}
                  />
                ))}
                {col.length === 0 && (
                  <div style={{ border: '1px dashed #222', borderRadius: 12, padding: '44px 16px', textAlign: 'center', color: '#2a2a2a', fontSize: 14 }}>
                    Нет заказов
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
