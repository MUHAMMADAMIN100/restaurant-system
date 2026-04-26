import { useState, useEffect, useCallback, memo } from 'react';
import { api } from '../api/client';
import type { Analytics, Category, MenuItem, Order, OrderStatus } from '../api/client';
import { Modal, Spinner, useToast, EmptyState, Skeleton } from './UI';
import { S, fmt } from '../utils/styles';
import { useMenuSocket, useCategorySocket, useOrderSocket, usePaymentSocket } from '../hooks/useSocket';

// ── Analytics ────────────────────────────────────────────────────────────────
function Analytics() {
  const [data, setData]       = useState<Analytics | null>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    Promise.all([api.getAnalytics(), api.getOrders()])
      .then(([analytics, allOrders]) => { setData(analytics); setOrders(allOrders); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Real-time: refresh on payment / status change
  usePaymentSocket({ onCreated: () => reload() });
  useOrderSocket({
    onClosed: () => reload(),
    onNew:    (o) => setOrders((p) => p.find((x) => x.id === o.id) ? p : [o, ...p]),
    onStatus: (o) => setOrders((p) => p.map((x) => x.id === o.id ? o : x)),
  });

  if (loading) {
    return (
      <div className="anim-fade" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[0, 1, 2].map((i) => <Skeleton key={i} height={108} radius={14} />)}
        </div>
        <Skeleton height={280} radius={14} />
      </div>
    );
  }

  const dishCount: Record<string, number> = {};
  orders.forEach((o) => (o.items || []).forEach((it) => {
    const name = it.menuItem?.name || '—';
    dishCount[name] = (dishCount[name] || 0) + it.quantity;
  }));
  const popular = Object.entries(dishCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const statusCount: Record<OrderStatus, number> = { PENDING: 0, COOKING: 0, READY: 0, CLOSED: 0 };
  orders.forEach((o) => { statusCount[o.status] = (statusCount[o.status] || 0) + 1; });
  const statusColors = { PENDING: '#f59e0b', COOKING: '#3b82f6', READY: '#10b981', CLOSED: '#6b7280' };
  const statusLabels = { PENDING: 'Ожидание', COOKING: 'Готовится', READY: 'Готово', CLOSED: 'Закрыты' };

  const metrics = [
    { label: 'Общая выручка',     value: fmt(data?.totalRevenue || 0), color: '#f59e0b' },
    { label: 'Оплаченных заказов', value: String(data?.orderCount || 0), color: '#10b981' },
    { label: 'Средний чек',        value: fmt(data?.avgOrder || 0),     color: '#3b82f6' },
  ];

  return (
    <div className="anim-fade-up">
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        {metrics.map((m) => (
          <div key={m.label} className="anim-fade-up card-hover" style={{ ...S.card, padding: 22 }}>
            <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: m.color, fontFamily: "'Playfair Display', serif", lineHeight: 1.1 }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-cols-12" style={{ gap: 16 }}>
        <div className="anim-fade-up" style={{ ...S.card, animationDelay: '0.18s' }}>
          <h3 style={{ margin: '0 0 22px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 18 }}>Популярные блюда</h3>
          {popular.length === 0 && <EmptyState icon="📊" text="Нет данных" />}
          <div className="stagger">
            {popular.map(([name, count], i) => (
              <div key={name} className="anim-fade-up" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ width: 28, height: 28, background: i === 0 ? '#451a03' : '#1a1a1a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: i === 0 ? '#f59e0b' : '#4b5563', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 6, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ height: 4, background: '#1e1e1e', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${((count as number) / ((popular[0]?.[1] as number) || 1)) * 100}%`, background: i === 0 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : '#374151', borderRadius: 2, transition: 'width 0.8s var(--ease-out)' }} />
                  </div>
                </div>
                <span style={{ fontSize: 14, color: '#f59e0b', fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{count as number}×</span>
              </div>
            ))}
          </div>
        </div>

        <div className="anim-fade-up" style={{ ...S.card, animationDelay: '0.25s' }}>
          <h3 style={{ margin: '0 0 22px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 18 }}>Заказы по статусам</h3>
          {Object.entries(statusLabels).map(([s, l]) => (
            <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[s as OrderStatus] }} />
                <span style={{ fontSize: 13, color: '#9ca3af' }}>{l}</span>
              </div>
              <span style={{ fontSize: 24, fontWeight: 700, color: statusColors[s as OrderStatus], fontFamily: "'Playfair Display', serif", transition: 'all 0.3s var(--ease-spring)' }}>{statusCount[s as OrderStatus]}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 14, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#4b5563' }}>Всего заказов</span>
              <span style={{ fontWeight: 700, color: '#e5e7eb' }}>{orders.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Categories tab ────────────────────────────────────────────────────────────
interface CategoriesTabProps {
  categories: Category[];
  menu: MenuItem[];
  onCreate: (name: string) => Promise<void>;
  onUpdate: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const CategoriesTab = memo(function CategoriesTab({ categories, menu, onCreate, onUpdate, onDelete }: CategoriesTabProps) {
  const [modal, setModal] = useState<'new' | Category | null>(null);
  const [name, setName]   = useState('');
  const [saving, setSaving] = useState(false);

  const openAdd  = () => { setName(''); setModal('new'); };
  const openEdit = (c: Category) => { setName(c.name); setModal(c); };

  const save = async () => {
    if (!name.trim() || !modal) return;
    setSaving(true);
    try {
      if (modal === 'new') await onCreate(name);
      else await onUpdate(modal.id, name);
      setModal(null);
    } finally { setSaving(false); }
  };

  return (
    <div className="anim-fade-up" style={S.card}>
      <div className="flex-col-sm-row" style={{ justifyContent: 'space-between', marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 22 }}>Категории</h2>
        <button style={S.btn()} onClick={openAdd}>+ Добавить</button>
      </div>
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {categories.map((c) => (
          <div key={c.id} className="anim-fade-up card-hover" style={{ background: '#1a1a1a', border: '1px solid #262626', borderRadius: 12, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#4b5563' }}>{menu.filter((m) => m.categoryId === c.id).length} блюд</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 14 }} onClick={() => openEdit(c)} aria-label="Изменить">✏</button>
              <button style={{ ...S.btnDanger, padding: '6px 10px', fontSize: 14 }} onClick={() => onDelete(c.id)} aria-label="Удалить">✕</button>
            </div>
          </div>
        ))}
        {categories.length === 0 && <EmptyState icon="📁" text="Нет категорий" />}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Новая категория' : 'Изменить категорию'} onClose={() => setModal(null)} maxWidth={380}>
          <label style={S.label}>Название</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Горячие блюда" autoFocus />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
            <button style={S.btnGhost} onClick={() => setModal(null)}>Отмена</button>
            <button style={{ ...S.btn(), display: 'flex', alignItems: 'center', gap: 8 }} onClick={save} disabled={saving}>
              {saving && <Spinner size={14} color="#000" />} Сохранить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
});

// ── Menu tab ──────────────────────────────────────────────────────────────────
interface MenuTabProps {
  menu: MenuItem[];
  categories: Category[];
  onCreate: (data: Partial<MenuItem>) => Promise<void>;
  onUpdate: (id: number, data: Partial<MenuItem>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}
interface MenuForm { name: string; description: string; imageUrl: string; price: string; categoryId: number | ''; isAvailable: boolean; }

const MenuTab = memo(function MenuTab({ menu, categories, onCreate, onUpdate, onDelete }: MenuTabProps) {
  const [modal, setModal]   = useState<'new' | MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const { show, node } = useToast();

  const emptyForm: MenuForm = { name: '', description: '', imageUrl: '', price: '', categoryId: categories[0]?.id ?? '', isAvailable: true };
  const [form, setForm] = useState<MenuForm>(emptyForm);

  const openAdd  = () => { setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' }); setModal('new'); };
  const openEdit = (it: MenuItem) => { setForm({ name: it.name, description: it.description ?? '', imageUrl: it.imageUrl ?? '', price: String(it.price), categoryId: it.categoryId, isAvailable: it.isAvailable }); setModal(it); };
  const set      = <K extends keyof MenuForm>(k: K, v: MenuForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!modal) return;
    if (!form.name.trim()) return show('Введите название блюда', 'error');
    if (!form.price || Number(form.price) <= 0) return show('Цена должна быть больше 0', 'error');
    if (!form.categoryId) return show('Выберите категорию', 'error');
    setSaving(true);
    try {
      const payload = { name: form.name, description: form.description || null, imageUrl: form.imageUrl || null, price: Number(form.price), categoryId: Number(form.categoryId), isAvailable: form.isAvailable };
      if (modal === 'new') await onCreate(payload);
      else await onUpdate(modal.id, payload);
      setModal(null);
    } finally { setSaving(false); }
  };

  const displayed = menu.filter((m) =>
    filter === 'all' ? true : filter === 'available' ? m.isAvailable : !m.isAvailable,
  );

  return (
    <div className="anim-fade-up" style={S.card}>
      {node}
      <div className="flex-col-sm-row" style={{ justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 22 }}>Меню</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4b5563' }}>{menu.length} позиций · {menu.filter((m) => m.isAvailable).length} доступно</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...S.select, width: 'auto', minWidth: 150 }} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'available' | 'unavailable')}>
            <option value="all">Все</option>
            <option value="available">Доступные</option>
            <option value="unavailable">Недоступные</option>
          </select>
          <button style={S.btn()} onClick={openAdd}>+ Добавить</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', margin: '0 -8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
              <th style={thStyle}></th>
              <th style={thStyle}>Название</th>
              <th style={{ ...thStyle, ...mdHide }} className="table-cell-md">Категория</th>
              <th style={thStyle}>Цена</th>
              <th style={{ ...thStyle, ...mdHide }} className="table-cell-md">Статус</th>
              <th style={thStyle}>Действия</th>
            </tr>
          </thead>
          <tbody className="stagger">
            {displayed.map((item) => (
              <tr key={item.id} className="anim-fade" style={{ borderBottom: '1px solid #181818' }}>
                <td style={{ padding: '8px 12px' }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} loading="lazy" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 6, display: 'block' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 48, height: 36, background: '#1a1a1a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍽</div>
                  )}
                </td>
                <td style={{ padding: '12px', color: '#e5e7eb', fontWeight: 500 }}>{item.name}</td>
                <td style={{ ...tdStyle, ...mdHide }} className="table-cell-md">{item.category?.name || categories.find((c) => c.id === item.categoryId)?.name || '—'}</td>
                <td style={{ padding: '12px', color: '#f59e0b', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(item.price)}</td>
                <td style={{ ...tdStyle, ...mdHide }} className="table-cell-md">
                  <span style={{ fontSize: 12, color: item.isAvailable ? '#10b981' : '#4b5563', fontWeight: 600 }}>
                    {item.isAvailable ? '✓ Доступно' : '✗ Скрыто'}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button style={{ ...S.btnGhost, padding: '6px 10px', fontSize: 12 }} onClick={() => openEdit(item)}>✏</button>
                    <button style={{ ...S.btnDanger, padding: '6px 10px', fontSize: 12 }} onClick={() => onDelete(item.id)}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayed.length === 0 && <EmptyState icon="🍽" text="Нет блюд" />}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Новое блюдо' : 'Изменить блюдо'} onClose={() => setModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={S.label}>Название блюда</label>
              <input style={S.input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Плов узбекский" autoFocus />
            </div>
            <div>
              <label style={S.label}>Описание</label>
              <textarea style={{ ...S.input, resize: 'vertical', minHeight: 70 }} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Краткое описание блюда..." />
            </div>
            <div>
              <label style={S.label}>Фото (URL)</label>
              <input style={S.input} value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://images.unsplash.com/..." />
              {form.imageUrl && (
                <img src={form.imageUrl} alt="preview" className="anim-fade" style={{ marginTop: 8, width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
            </div>
            <div className="grid-cols-12">
              <div>
                <label style={S.label}>Цена (сум)</label>
                <input style={S.input} type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="45000" min="1" />
              </div>
              <div>
                <label style={S.label}>Категория</label>
                <select style={S.select} value={form.categoryId} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : '')}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#1a1a1a', borderRadius: 8, border: '1px solid #2a2a2a', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isAvailable} onChange={(e) => set('isAvailable', e.target.checked)} style={{ accentColor: '#f59e0b', width: 16, height: 16 }} />
              <span style={{ color: '#d1d5db', fontSize: 14 }}>Доступно для заказа</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button style={S.btnGhost} onClick={() => setModal(null)}>Отмена</button>
              <button style={{ ...S.btn(), display: 'flex', alignItems: 'center', gap: 8 }} onClick={save} disabled={saving}>
                {saving && <Spinner size={14} color="#000" />} Сохранить
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
});

const thStyle = { textAlign: 'left' as const, padding: '10px 12px', color: '#4b5563', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' as const, letterSpacing: '0.06em' };
const tdStyle = { padding: '12px', color: '#6b7280' };
const mdHide  = {}; // class-controlled in CSS

// ── AdminView (root) ──────────────────────────────────────────────────────────
export default function AdminView() {
  const [tab, setTab]   = useState<'menu' | 'categories' | 'analytics'>('menu');
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { show, node } = useToast();

  const loadAll = useCallback(async () => {
    try {
      const [cats, items] = await Promise.all([api.getCategories(), api.getMenu()]);
      setCategories(cats); setMenu(items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Real-time subscriptions
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

  // ── Optimistic CRUD: menu ─────────────────────────────────────────────────
  const createMenuItem = async (data: Partial<MenuItem>) => {
    const tempId = -Date.now();
    const optimistic = { id: tempId, isAvailable: true, ...data, name: data.name || '', price: Number(data.price) || 0, categoryId: Number(data.categoryId) || 0, description: data.description ?? null, imageUrl: data.imageUrl ?? null } as MenuItem;
    setMenu((p) => [...p, optimistic]);
    try {
      const real = await api.createMenuItem(data);
      setMenu((p) => p.map((x) => x.id === tempId ? real : x));
      show('Блюдо добавлено');
    } catch (e) {
      setMenu((p) => p.filter((x) => x.id !== tempId));
      show((e as Error).message, 'error');
      throw e;
    }
  };
  const updateMenuItem = async (id: number, data: Partial<MenuItem>) => {
    const prev = menu.find((x) => x.id === id);
    setMenu((p) => p.map((x) => x.id === id ? { ...x, ...data } as MenuItem : x));
    try {
      const real = await api.updateMenuItem(id, data);
      setMenu((p) => p.map((x) => x.id === id ? real : x));
      show('Блюдо обновлено');
    } catch (e) {
      if (prev) setMenu((p) => p.map((x) => x.id === id ? prev : x));
      show((e as Error).message, 'error');
      throw e;
    }
  };
  const deleteMenuItem = async (id: number) => {
    if (!confirm('Удалить блюдо?')) return;
    const prev = menu.find((x) => x.id === id);
    setMenu((p) => p.filter((x) => x.id !== id));
    try {
      await api.deleteMenuItem(id);
      show('Удалено');
    } catch (e) {
      if (prev) setMenu((p) => [...p, prev]);
      show((e as Error).message, 'error');
    }
  };

  // ── Optimistic CRUD: categories ───────────────────────────────────────────
  const createCategory = async (name: string) => {
    const tempId = -Date.now();
    setCategories((p) => [...p, { id: tempId, name }]);
    try {
      const real = await api.createCategory({ name });
      setCategories((p) => p.map((x) => x.id === tempId ? real : x));
      show('Категория добавлена');
    } catch (e) {
      setCategories((p) => p.filter((x) => x.id !== tempId));
      show((e as Error).message, 'error');
      throw e;
    }
  };
  const updateCategory = async (id: number, name: string) => {
    const prev = categories.find((x) => x.id === id);
    setCategories((p) => p.map((x) => x.id === id ? { ...x, name } : x));
    try {
      const real = await api.updateCategory(id, { name });
      setCategories((p) => p.map((x) => x.id === id ? real : x));
      show('Категория обновлена');
    } catch (e) {
      if (prev) setCategories((p) => p.map((x) => x.id === id ? prev : x));
      show((e as Error).message, 'error');
      throw e;
    }
  };
  const deleteCategory = async (id: number) => {
    if (!confirm('Удалить категорию?')) return;
    const prev = categories.find((x) => x.id === id);
    setCategories((p) => p.filter((x) => x.id !== id));
    try {
      await api.deleteCategory(id);
      show('Удалено');
    } catch (e) {
      if (prev) setCategories((p) => [...p, prev]);
      show((e as Error).message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="anim-fade" style={{ display: 'grid', gap: 14 }}>
        <Skeleton height={48} radius={10} />
        <Skeleton height={400} radius={14} />
      </div>
    );
  }

  return (
    <div>
      {node}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #1a1a1a', paddingBottom: 14, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {(['menu', 'categories', 'analytics'] as const).map((k) => {
          const labels = { menu: 'Меню', categories: 'Категории', analytics: 'Аналитика' };
          return (
            <button key={k} style={{ ...S.tab(tab === k), whiteSpace: 'nowrap' }} onClick={() => setTab(k)}>{labels[k]}</button>
          );
        })}
      </div>
      {tab === 'menu'       && <MenuTab menu={menu} categories={categories} onCreate={createMenuItem} onUpdate={updateMenuItem} onDelete={deleteMenuItem} />}
      {tab === 'categories' && <CategoriesTab categories={categories} menu={menu} onCreate={createCategory} onUpdate={updateCategory} onDelete={deleteCategory} />}
      {tab === 'analytics'  && <Analytics />}
    </div>
  );
}
