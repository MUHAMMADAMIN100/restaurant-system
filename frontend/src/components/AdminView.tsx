import { useState, useEffect, useCallback, memo } from 'react';
import { api } from '../api/client';
import type { Analytics, Category, MenuItem, Order, OrderStatus } from '../api/client';
import { Modal, Spinner, useToast, EmptyState } from './UI';
import { S, fmt } from '../utils/styles';

// ── Analytics ────────────────────────────────────────────────────────────────
function Analytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getAnalytics(), api.getOrders()])
      .then(([analytics, allOrders]) => { setData(analytics); setOrders(allOrders); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={32} /></div>;

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

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Общая выручка', value: fmt(data?.totalRevenue || 0), color: '#f59e0b' },
          { label: 'Оплаченных заказов', value: data?.orderCount || 0, color: '#10b981' },
          { label: 'Средний чек', value: fmt(data?.avgOrder || 0), color: '#3b82f6' },
        ].map((m) => (
          <div key={m.label} style={S.card}>
            <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: m.color, fontFamily: "'Playfair Display', serif" }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div style={S.card}>
          <h3 style={{ margin: '0 0 24px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 18 }}>Популярные блюда</h3>
          {popular.length === 0 && <EmptyState icon="📊" text="Нет данных" />}
          {popular.map(([name, count], i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ width: 28, height: 28, background: i === 0 ? '#451a03' : '#1a1a1a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: i === 0 ? '#f59e0b' : '#4b5563', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 6, fontWeight: 500 }}>{name}</div>
                <div style={{ height: 4, background: '#1e1e1e', borderRadius: 2 }}>
                  <div style={{ height: '100%', width: `${((count as number) / ((popular[0]?.[1] as number) || 1)) * 100}%`, background: i === 0 ? '#f59e0b' : '#374151', borderRadius: 2, transition: 'width 0.8s ease' }} />
                </div>
              </div>
              <span style={{ fontSize: 14, color: '#f59e0b', fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{count as number}×</span>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <h3 style={{ margin: '0 0 24px', fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 18 }}>Заказы по статусам</h3>
          {Object.entries(statusLabels).map(([s, l]) => (
            <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[s as OrderStatus] }} />
                <span style={{ fontSize: 13, color: '#9ca3af' }}>{l}</span>
              </div>
              <span style={{ fontSize: 26, fontWeight: 700, color: statusColors[s as OrderStatus], fontFamily: "'Playfair Display', serif" }}>{statusCount[s as OrderStatus]}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #1e1e1e', paddingTop: 16 }}>
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
interface CategoriesTabProps { categories: Category[]; menu: MenuItem[]; reload: () => void; }
const CategoriesTab = memo(function CategoriesTab({ categories, menu, reload }: CategoriesTabProps) {
  const [modal, setModal] = useState<'new' | Category | null>(null);
  const [name, setName]   = useState('');
  const [saving, setSaving] = useState(false);
  const { show, node } = useToast();

  const openAdd  = () => { setName(''); setModal('new'); };
  const openEdit = (c: Category) => { setName(c.name); setModal(c); };

  const save = async () => {
    if (!name.trim() || !modal) return;
    setSaving(true);
    try {
      if (modal === 'new') await api.createCategory({ name });
      else await api.updateCategory(modal.id, { name });
      show(modal === 'new' ? 'Категория добавлена' : 'Категория обновлена');
      setModal(null);
      reload();
    } catch (e) { show((e as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить категорию?')) return;
    try { await api.deleteCategory(id); show('Удалено'); reload(); }
    catch (e) { show((e as Error).message, 'error'); }
  };

  return (
    <div style={S.card}>
      {node}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 22 }}>Категории</h2>
        <button style={S.btn()} onClick={openAdd}>+ Добавить</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {categories.map((c) => (
          <div key={c.id} style={{ background: '#1a1a1a', border: '1px solid #262626', borderRadius: 12, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#e5e7eb', marginBottom: 5 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#4b5563' }}>{menu.filter((m) => m.categoryId === c.id).length} блюд</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 14 }} onClick={() => openEdit(c)}>✏</button>
              <button style={{ ...S.btnDanger, padding: '6px 12px', fontSize: 14 }} onClick={() => del(c.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Новая категория' : 'Изменить категорию'} onClose={() => setModal(null)} maxWidth={360}>
          <label style={S.label}>Название</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Горячие блюда" autoFocus />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
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
interface MenuTabProps { menu: MenuItem[]; categories: Category[]; reload: () => void; }
interface MenuForm { name: string; description: string; imageUrl: string; price: string; categoryId: number | ''; isAvailable: boolean; }
const MenuTab = memo(function MenuTab({ menu, categories, reload }: MenuTabProps) {
  const [modal, setModal]   = useState<'new' | MenuItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
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
      if (modal === 'new') await api.createMenuItem(payload);
      else await api.updateMenuItem(modal.id, payload);
      show(modal === 'new' ? 'Блюдо добавлено' : 'Блюдо обновлено');
      setModal(null); reload();
    } catch (e) { show((e as Error).message, 'error'); }
    finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm('Удалить блюдо?')) return;
    setDeleting(id);
    try { await api.deleteMenuItem(id); show('Удалено'); reload(); }
    catch (e) { show((e as Error).message, 'error'); }
    finally { setDeleting(null); }
  };

  const displayed = menu.filter((m) =>
    filter === 'all' ? true : filter === 'available' ? m.isAvailable : !m.isAvailable,
  );

  return (
    <div style={S.card}>
      {node}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Playfair Display', serif", color: '#e5e7eb', fontSize: 22 }}>Меню</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4b5563' }}>{menu.length} позиций · {menu.filter((m) => m.isAvailable).length} доступно</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={{ ...S.select, width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'available' | 'unavailable')}>
            <option value="all">Все</option>
            <option value="available">Доступные</option>
            <option value="unavailable">Недоступные</option>
          </select>
          <button style={S.btn()} onClick={openAdd}>+ Добавить блюдо</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
              {['', 'Название', 'Категория', 'Цена', 'Статус', 'Действия'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: '#4b5563', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #181818' }}>
                <td style={{ padding: '8px 14px' }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 6, display: 'block' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 48, height: 36, background: '#1a1a1a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🍽</div>
                  )}
                </td>
                <td style={{ padding: '13px 14px', color: '#e5e7eb', fontWeight: 500 }}>{item.name}</td>
                <td style={{ padding: '13px 14px', color: '#6b7280' }}>{item.category?.name || categories.find((c) => c.id === item.categoryId)?.name || '—'}</td>
                <td style={{ padding: '13px 14px', color: '#f59e0b', fontWeight: 700 }}>{fmt(item.price)}</td>
                <td style={{ padding: '13px 14px' }}>
                  <span style={{ fontSize: 12, color: item.isAvailable ? '#10b981' : '#4b5563', fontWeight: 600 }}>
                    {item.isAvailable ? '✓ Доступно' : '✗ Скрыто'}
                  </span>
                </td>
                <td style={{ padding: '13px 14px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={S.btnGhost} onClick={() => openEdit(item)}>Изменить</button>
                    <button style={{ ...S.btnDanger, opacity: deleting === item.id ? 0.6 : 1 }} onClick={() => del(item.id)}>
                      {deleting === item.id ? '...' : 'Удалить'}
                    </button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={S.label}>Название блюда</label>
              <input style={S.input} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Плов узбекский" autoFocus />
            </div>
            <div>
              <label style={S.label}>Описание</label>
              <textarea style={{ ...S.input, resize: 'vertical', minHeight: 72 }} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Краткое описание блюда..." />
            </div>
            <div>
              <label style={S.label}>Фото (URL изображения)</label>
              <input style={S.input} value={form.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} placeholder="https://images.unsplash.com/photo-..." />
              {form.imageUrl && (
                <img src={form.imageUrl} alt="preview" style={{ marginTop: 8, width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
            </div>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#1a1a1a', borderRadius: 8, border: '1px solid #2a2a2a', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isAvailable} onChange={(e) => set('isAvailable', e.target.checked)} style={{ accentColor: '#f59e0b', width: 16, height: 16 }} />
              <span style={{ color: '#d1d5db', fontSize: 14 }}>Доступно для заказа</span>
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
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

// ── AdminView (root) ──────────────────────────────────────────────────────────
export default function AdminView() {
  const [tab, setTab]   = useState('menu');
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [cats, items] = await Promise.all([api.getCategories(), api.getMenu()]);
      setCategories(cats); setMenu(items);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spinner size={36} /></div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, borderBottom: '1px solid #1a1a1a', paddingBottom: 16 }}>
        {[['menu', 'Меню'], ['categories', 'Категории'], ['analytics', 'Аналитика']].map(([k, v]) => (
          <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>
      {tab === 'menu'       && <MenuTab menu={menu} categories={categories} reload={loadAll} />}
      {tab === 'categories' && <CategoriesTab categories={categories} menu={menu} reload={loadAll} />}
      {tab === 'analytics'  && <Analytics />}
    </div>
  );
}
