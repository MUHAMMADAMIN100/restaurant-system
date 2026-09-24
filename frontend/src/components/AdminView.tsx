import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import {
  ChartBarIcon, ListBulletsIcon, TagIcon, SignOutIcon, PlusIcon, PencilSimpleIcon, TrashIcon,
  MagnifyingGlassIcon, BowlFoodIcon, WarningCircleIcon, ArrowClockwiseIcon, FolderSimpleIcon,
} from '@phosphor-icons/react';
import { api } from '../api/client';
import type { Category, MenuItem, User } from '../api/client';
import { Modal, Spinner, useToast, EmptyState, Skeleton, ConfirmDialog, Brand, UserChip } from './UI';
import { fmt, pluralRu, upsertById } from '../utils/format';
import { useMenuSocket, useCategorySocket, useSocketStatus } from '../hooks/useSocket';
import Analytics from './Analytics';
import { categoryStyle } from '../utils/category';

type Section = 'analytics' | 'menu' | 'categories';
const SECTIONS: { key: Section; label: string; icon: JSX.Element }[] = [
  { key: 'analytics',  label: 'Аналитика', icon: <ChartBarIcon size={20} aria-hidden /> },
  { key: 'menu',       label: 'Меню',      icon: <ListBulletsIcon size={20} aria-hidden /> },
  { key: 'categories', label: 'Категории', icon: <TagIcon size={20} aria-hidden /> },
];
const sectionFromHash = (): Section => {
  const h = window.location.hash.replace('#', '');
  return (SECTIONS.some((s) => s.key === h) ? h : 'analytics') as Section;
};

function CategoryPill({ name, id }: { name: string; id: number | null }) {
  const { tone, Icon } = categoryStyle(name, id);
  return <span className="tone-pill" data-tone={tone}><Icon size={12} weight="bold" aria-hidden />{name}</span>;
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="thumb" aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" width={56} height={42} onError={() => setFailed(true)} /> : <BowlFoodIcon size={20} />}
    </span>
  );
}

// ── Dish form ────────────────────────────────────────────────────────────────
interface DishPayload { name: string; description: string | null; imageUrl: string | null; price: number; categoryId: number; isAvailable: boolean; }
interface DishFormProps { initial: MenuItem | null; categories: Category[]; onClose: () => void; onSave: (data: DishPayload) => Promise<void>; }

function DishForm({ initial, categories, onClose, onSave }: DishFormProps) {
  const [name, setName]         = useState(initial?.name ?? '');
  const [description, setDesc]  = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [price, setPrice]       = useState(initial ? String(Number(initial.price)) : '');
  const [categoryId, setCat]    = useState<number | ''>(initial?.categoryId ?? categories[0]?.id ?? '');
  const [isAvailable, setAvail] = useState(initial?.isAvailable ?? true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [serverError, setServerError] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  const priceNum = Number(price.replace(',', '.'));
  const errors = {
    name: !name.trim() ? 'Введите название блюда' : '',
    price: !price ? 'Укажите цену' : !(priceNum > 0) ? 'Цена должна быть больше нуля' : !/^\d+([.,]\d{1,2})?$/.test(price.trim()) ? 'Не больше двух знаков после запятой' : '',
    category: !categoryId ? 'Выберите категорию' : '',
    imageUrl: imageUrl.trim() && !/^https?:\/\/\S+$/i.test(imageUrl.trim()) ? 'Ссылка должна начинаться с http:// или https://' : '',
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) {
      const first = (['name', 'price', 'category', 'imageUrl'] as const).find((k) => errors[k]);
      document.getElementById(`dish-${first}`)?.focus();
      return;
    }
    setSaving(true); setServerError('');
    try {
      await onSave({
        name: name.trim(), description: description.trim() || null, imageUrl: imageUrl.trim() || null,
        price: priceNum, categoryId: Number(categoryId), isAvailable,
      });
      onClose();
    } catch (err) {
      setServerError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={initial ? 'Изменить блюдо' : 'Новое блюдо'}
      onClose={onClose}
      width={560}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Отмена</button>
          <button type="submit" form="dish-form" className="btn btn--primary" disabled={saving}>
            {saving && <Spinner />} {initial ? 'Сохранить' : 'Добавить блюдо'}
          </button>
        </>
      }
    >
      <form id="dish-form" className="form-grid" onSubmit={submit} noValidate>
        {serverError && <div className="alert" role="alert"><WarningCircleIcon size={18} aria-hidden />{serverError}</div>}

        <div className="field">
          <label className="label" htmlFor="dish-name">Название <span className="req" aria-hidden>*</span></label>
          <input id="dish-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={255}
            aria-invalid={!!show('name')} aria-describedby={show('name') ? 'dish-name-err' : undefined} data-autofocus />
          {show('name') && <span className="field-error" id="dish-name-err">{show('name')}</span>}
        </div>

        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor="dish-price">Цена <span className="req" aria-hidden>*</span></label>
            <div className="input-wrap">
              <input id="dish-price" className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0"
                aria-invalid={!!show('price')} aria-describedby={show('price') ? 'dish-price-err' : 'dish-price-hint'} />
              <span className="input-wrap__suffix">сомони</span>
            </div>
            {show('price') ? <span className="field-error" id="dish-price-err">{show('price')}</span> : <span className="hint" id="dish-price-hint">Например, 55 или 12,50</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="dish-category">Категория <span className="req" aria-hidden>*</span></label>
            <select id="dish-category" className="select" value={categoryId} onChange={(e) => setCat(e.target.value ? Number(e.target.value) : '')}
              aria-invalid={!!show('category')} aria-describedby={show('category') ? 'dish-category-err' : undefined}>
              {categories.length === 0 && <option value="">Сначала создайте категорию</option>}
              {!categoryId && categories.length > 0 && <option value="">Выберите категорию</option>}
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {show('category') && <span className="field-error" id="dish-category-err">{show('category')}</span>}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="dish-desc">Описание</label>
          <textarea id="dish-desc" className="textarea" value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Состав, вес, особенности подачи" />
        </div>

        <div className="field">
          <label className="label" htmlFor="dish-imageUrl">Ссылка на фото</label>
          <input id="dish-imageUrl" className="input" type="url" inputMode="url" value={imageUrl}
            onChange={(e) => { setImageUrl(e.target.value); setImgFailed(false); }} placeholder="https://…"
            aria-invalid={!!show('imageUrl')} aria-describedby={show('imageUrl') ? 'dish-img-err' : undefined} />
          {show('imageUrl') && <span className="field-error" id="dish-img-err">{show('imageUrl')}</span>}
          {imageUrl.trim() && !errors.imageUrl && (
            <div className="img-preview">
              {imgFailed
                ? <div className="empty" style={{ padding: 'var(--sp-6)' }}><span className="empty__text">Не удалось загрузить изображение по ссылке</span></div>
                : <img src={imageUrl.trim()} alt="Предпросмотр фото блюда" onError={() => setImgFailed(true)} />}
            </div>
          )}
        </div>

        <label className="switch">
          <input type="checkbox" checked={isAvailable} onChange={(e) => setAvail(e.target.checked)} />
          <span className="switch__track" aria-hidden />
          <span className="switch__label">Доступно для заказа</span>
        </label>
      </form>
    </Modal>
  );
}

// ── Menu section ─────────────────────────────────────────────────────────────
interface MenuSectionProps {
  menu: MenuItem[];
  categories: Category[];
  onSave: (id: number | null, data: DishPayload) => Promise<void>;
  onToggle: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => Promise<void>;
  /** Open pre-filtered to a category (from the Categories screen). */
  initialCat?: number | null;
}
function MenuSection({ menu, categories, onSave, onToggle, onDelete, initialCat }: MenuSectionProps) {
  const [editing, setEditing]   = useState<MenuItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MenuItem | null>(null);
  const [query, setQuery]       = useState('');
  const [cat, setCat]           = useState<number | 'all'>(initialCat ?? 'all');
  const [avail, setAvail]       = useState<'all' | 'on' | 'off'>('all');

  const catName = (m: MenuItem) => m.category?.name ?? categories.find((c) => c.id === m.categoryId)?.name ?? 'Без категории';
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.filter((m) =>
      (cat === 'all' || m.categoryId === cat) &&
      (avail === 'all' || (avail === 'on' ? m.isAvailable : !m.isAvailable)) &&
      (!q || m.name.toLowerCase().includes(q)),
    );
  }, [menu, query, cat, avail]);
  const availableCount = menu.filter((m) => m.isAvailable).length;
  const filtersActive = query || cat !== 'all' || avail !== 'all';

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Меню</h1>
          <p className="page-subtitle">{menu.length} {pluralRu(menu.length, ['блюдо', 'блюда', 'блюд'])} · {availableCount} доступно для заказа</p>
        </div>
        <button className="btn btn--primary" onClick={() => setEditing('new')} disabled={categories.length === 0} title={categories.length === 0 ? 'Сначала создайте категорию' : undefined}>
          <PlusIcon size={18} weight="bold" aria-hidden /> Добавить блюдо
        </button>
      </div>

      <div className="card">
        <div className="toolbar" style={{ padding: 'var(--sp-4)', borderBottom: '1px solid var(--border)' }}>
          <div className="input-wrap input-wrap--lead search">
            <span className="input-wrap__lead"><MagnifyingGlassIcon size={18} aria-hidden /></span>
            <input className="input" type="search" placeholder="Поиск по названию" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск по названию" />
          </div>
          <select className="select" style={{ width: 'auto', minWidth: 180 }} value={cat} onChange={(e) => setCat(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Категория">
            <option value="all">Все категории</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="segmented" role="group" aria-label="Доступность">
            {([['all', 'Все'], ['on', 'В продаже'], ['off', 'Скрытые']] as const).map(([k, l]) => (
              <button key={k} type="button" className="segmented__item" aria-pressed={avail === k} onClick={() => setAvail(k)}>{l}</button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={<BowlFoodIcon size={24} />}
            title={filtersActive ? 'Ничего не найдено' : 'Меню пока пустое'}
            text={filtersActive ? 'Измените фильтры или поисковый запрос.' : 'Добавьте первое блюдо — оно сразу появится у официантов.'}
            action={filtersActive
              ? <button className="btn" onClick={() => { setQuery(''); setCat('all'); setAvail('all'); }}>Сбросить фильтры</button>
              : <button className="btn btn--primary" onClick={() => setEditing('new')} disabled={categories.length === 0}><PlusIcon size={16} aria-hidden /> Добавить блюдо</button>}
          />
        ) : (
          <>
            <div className="table-wrap only-desktop">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Блюдо</th>
                    <th scope="col">Категория</th>
                    <th scope="col" className="col-num">Цена</th>
                    <th scope="col">В продаже</th>
                    <th scope="col" className="col-actions"><span className="sr-only">Действия</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((item, idx) => (
                    <tr key={item.id} className="reveal" style={{ ['--i' as string]: idx }}>
                      <td>
                        <div className="dish-cell">
                          <Thumb src={item.imageUrl} />
                          <div style={{ minWidth: 0 }}>
                            <div className="dish-cell__name">{item.name}</div>
                            {item.description && <div className="dish-cell__desc">{item.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td><CategoryPill name={catName(item)} id={item.categoryId} /></td>
                      <td className="col-num"><strong style={{ fontWeight: 600 }}>{fmt(item.price)}</strong></td>
                      <td>
                        <label className="switch">
                          <input type="checkbox" checked={item.isAvailable} onChange={() => onToggle(item)} aria-label={`${item.name}: в продаже`} />
                          <span className="switch__track" aria-hidden />
                        </label>
                      </td>
                      <td className="col-actions">
                        <button className="btn btn--ghost btn--icon btn--sm" onClick={() => setEditing(item)} aria-label={`Изменить: ${item.name}`}><PencilSimpleIcon size={18} /></button>
                        <button className="btn btn--ghost btn--icon btn--sm btn--icon-danger" onClick={() => setDeleting(item)} aria-label={`Удалить: ${item.name}`}><TrashIcon size={18} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="mlist only-mobile">
              {shown.map((item, idx) => (
                <li key={item.id} className="mlist__item reveal" style={{ ['--i' as string]: idx }}>
                  <Thumb src={item.imageUrl} />
                  <div style={{ minWidth: 0 }}>
                    <div className="dish-cell__name" style={{ overflowWrap: 'anywhere' }}>{item.name}</div>
                    <div className="muted num" style={{ fontSize: 'var(--fs-sm)' }}>{fmt(item.price)} · {catName(item)}</div>
                    <label className="switch" style={{ marginTop: 6 }}>
                      <input type="checkbox" checked={item.isAvailable} onChange={() => onToggle(item)} />
                      <span className="switch__track" aria-hidden />
                      <span className="switch__label" style={{ fontSize: 'var(--fs-sm)' }}>В продаже</span>
                    </label>
                  </div>
                  <div className="row" style={{ gap: 2 }}>
                    <button className="btn btn--ghost btn--icon" onClick={() => setEditing(item)} aria-label={`Изменить: ${item.name}`}><PencilSimpleIcon size={18} /></button>
                    <button className="btn btn--ghost btn--icon btn--icon-danger" onClick={() => setDeleting(item)} aria-label={`Удалить: ${item.name}`}><TrashIcon size={18} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {editing && (
        <DishForm
          initial={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={(data) => onSave(editing === 'new' ? null : editing.id, data)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Удалить блюдо?"
          text={<>«{deleting.name}» исчезнет из меню официантов. Прошлые заказы и аналитика сохранятся.</>}
          confirmLabel="Удалить"
          danger
          onConfirm={() => onDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

// ── Categories section ───────────────────────────────────────────────────────
interface CategoriesSectionProps {
  categories: Category[];
  menu: MenuItem[];
  onSave: (id: number | null, name: string) => Promise<void>;
  onDelete: (c: Category) => Promise<void>;
  onShowDishes: (c: Category) => void;
}
function CategoriesSection({ categories, menu, onSave, onDelete, onShowDishes }: CategoriesSectionProps) {
  const [editing, setEditing]   = useState<Category | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [name, setName]         = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);

  const count = (c: Category) => menu.filter((m) => m.categoryId === c.id).length;
  const open = (c: Category | 'new') => { setEditing(c); setName(c === 'new' ? '' : c.name); setError(''); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setError('Введите название категории'); return; }
    if (categories.some((c) => c.name.toLowerCase() === n.toLowerCase() && (editing === 'new' || c.id !== editing?.id))) {
      setError('Категория с таким названием уже есть'); return;
    }
    setSaving(true);
    try {
      await onSave(editing === 'new' ? null : editing!.id, n);
      setEditing(null);
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  };

  const deletingCount = deleting ? count(deleting) : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Категории</h1>
          <p className="page-subtitle">Разделы меню, по которым официант ищет блюда</p>
        </div>
        <button className="btn btn--primary" onClick={() => open('new')}><PlusIcon size={18} weight="bold" aria-hidden /> Новая категория</button>
      </div>

      <div className="card">
        {categories.length === 0 ? (
          <EmptyState icon={<FolderSimpleIcon size={24} />} title="Категорий пока нет" text="Создайте первую категорию, например «Супы» или «Напитки»."
            action={<button className="btn btn--primary" onClick={() => open('new')}><PlusIcon size={16} aria-hidden /> Новая категория</button>} />
        ) : (
          <ul className="cat-list">
            {categories.map((c, idx) => {
              const n = count(c);
              const { tone, Icon } = categoryStyle(c.name, c.id);
              return (
                <li key={c.id} className="cat-row reveal" data-tone={tone} style={{ ['--i' as string]: idx }}>
                  <span className="cat-row__icon" aria-hidden><Icon size={20} weight="duotone" /></span>
                  <div style={{ minWidth: 0 }}>
                    <div className="cat-row__name">{c.name}</div>
                    <button type="button" className="cat-row__count" onClick={() => onShowDishes(c)} style={{ background: 'none', border: 0, padding: 0, textDecoration: n ? 'underline' : 'none', textUnderlineOffset: 3 }} disabled={!n}>
                      {n} {pluralRu(n, ['блюдо', 'блюда', 'блюд'])}
                    </button>
                  </div>
                  <div className="cat-row__actions">
                    <button className="btn btn--ghost btn--icon" onClick={() => open(c)} aria-label={`Переименовать: ${c.name}`}><PencilSimpleIcon size={18} /></button>
                    <button className="btn btn--ghost btn--icon btn--icon-danger" onClick={() => setDeleting(c)} aria-label={`Удалить: ${c.name}`}><TrashIcon size={18} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? 'Новая категория' : 'Переименовать категорию'}
          onClose={() => setEditing(null)}
          width={420}
          busy={saving}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setEditing(null)} disabled={saving}>Отмена</button>
              <button type="submit" form="cat-form" className="btn btn--primary" disabled={saving}>{saving && <Spinner />} Сохранить</button>
            </>
          }
        >
          <form id="cat-form" onSubmit={save} noValidate className="field">
            <label className="label" htmlFor="cat-name">Название</label>
            <input id="cat-name" className="input" value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Например, Горячие блюда" aria-invalid={!!error} aria-describedby={error ? 'cat-name-err' : undefined} />
            {error && <span className="field-error" id="cat-name-err">{error}</span>}
          </form>
        </Modal>
      )}

      {deleting && deletingCount > 0 && (
        <Modal
          title="Категорию нельзя удалить"
          onClose={() => setDeleting(null)}
          width={440}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDeleting(null)}>Понятно</button>
              <button type="button" className="btn btn--primary" onClick={() => { onShowDishes(deleting); setDeleting(null); }} data-autofocus>Показать блюда</button>
            </>
          }
        >
          <p style={{ color: 'var(--text-2)' }}>
            В категории «{deleting.name}» {deletingCount} {pluralRu(deletingCount, ['блюдо', 'блюда', 'блюд'])}. Перенесите их в другую категорию или удалите, затем удалите категорию.
          </p>
        </Modal>
      )}
      {deleting && deletingCount === 0 && (
        <ConfirmDialog
          title="Удалить категорию?"
          text={<>Категория «{deleting.name}» будет удалена. В ней нет блюд.</>}
          confirmLabel="Удалить"
          danger
          onConfirm={() => onDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

// ── AdminView (root) ─────────────────────────────────────────────────────────
export default function AdminView({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [section, setSection] = useState<Section>(sectionFromHash);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const toast = useToast();

  const [menuPreset, setMenuPreset] = useState<number | null>(null);

  const go = (s: Section, preset: number | null = null) => {
    setMenuPreset(preset);
    setSection(s);
    if (window.location.hash !== `#${s}`) window.history.replaceState(null, '', `#${s}`);
    document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [cats, items] = await Promise.all([api.getCategories(), api.getMenu()]);
      setCategories(cats); setMenu(items);
    } catch (e) { setLoadError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useSocketStatus(loadAll);

  // HTTP responses and WebSocket events both upsert by id → no duplicates.
  useMenuSocket({
    onCreated: (item) => setMenu((p) => upsertById(p, item)),
    onUpdated: (item) => setMenu((p) => upsertById(p, item)),
    onDeleted: (id)   => setMenu((p) => p.filter((x) => x.id !== id)),
  });
  useCategorySocket({
    onCreated: (cat) => setCategories((p) => upsertById(p, cat)),
    onUpdated: (cat) => setCategories((p) => upsertById(p, cat)),
    onDeleted: (id)  => setCategories((p) => p.filter((x) => x.id !== id)),
  });

  const saveDish = async (id: number | null, data: DishPayload) => {
    const saved = id === null ? await api.createMenuItem(data) : await api.updateMenuItem(id, data);
    setMenu((p) => upsertById(p, saved));
    toast(id === null ? `«${saved.name}» добавлено в меню` : 'Изменения сохранены');
  };

  const toggleDish = async (item: MenuItem) => {
    const next = !item.isAvailable;
    setMenu((p) => p.map((x) => (x.id === item.id ? { ...x, isAvailable: next } : x)));
    try {
      const saved = await api.updateMenuItem(item.id, { isAvailable: next });
      setMenu((p) => upsertById(p, saved));
      toast(next ? `«${item.name}» снова в продаже` : `«${item.name}» скрыто из меню официантов`);
    } catch (e) {
      setMenu((p) => p.map((x) => (x.id === item.id ? { ...x, isAvailable: item.isAvailable } : x)));
      toast((e as Error).message, 'error');
    }
  };

  const deleteDish = async (item: MenuItem) => {
    try {
      await api.deleteMenuItem(item.id);
      setMenu((p) => p.filter((x) => x.id !== item.id));
      toast(`«${item.name}» удалено из меню`);
    } catch (e) { toast((e as Error).message, 'error'); throw e; }
  };

  const saveCategory = async (id: number | null, name: string) => {
    const saved = id === null ? await api.createCategory({ name }) : await api.updateCategory(id, { name });
    setCategories((p) => upsertById(p, saved));
    if (id !== null) setMenu((p) => p.map((m) => (m.categoryId === id ? { ...m, category: saved } : m)));
    toast(id === null ? `Категория «${saved.name}» создана` : 'Категория переименована');
  };

  const deleteCategory = async (c: Category) => {
    try {
      await api.deleteCategory(c.id);
      setCategories((p) => p.filter((x) => x.id !== c.id));
      toast(`Категория «${c.name}» удалена`);
    } catch (e) { toast((e as Error).message, 'error'); throw e; }
  };

  const showDishes = (c: Category) => go('menu', c.id);

  const content = () => {
    if (section === 'analytics') return <Analytics />;
    if (loading) return <div className="stack" aria-busy="true"><Skeleton height={48} width={280} /><Skeleton height={420} radius={12} /></div>;
    if (loadError) {
      return (
        <div className="card">
          <EmptyState icon={<WarningCircleIcon size={24} />} title="Не удалось загрузить данные" text={loadError}
            action={<button className="btn btn--primary" onClick={() => { setLoading(true); loadAll(); }}><ArrowClockwiseIcon size={16} /> Повторить</button>} />
        </div>
      );
    }
    if (section === 'menu') {
      return (
        <MenuSection initialCat={menuPreset}
          menu={menu} categories={categories} onSave={saveDish} onToggle={toggleDish} onDelete={deleteDish} />
      );
    }
    return <CategoriesSection categories={categories} menu={menu} onSave={saveCategory} onDelete={deleteCategory} onShowDishes={showDishes} />;
  };

  return (
    <div className="admin">
      <aside className="sidebar" aria-label="Навигация">
        <div className="sidebar__brand"><Brand /></div>
        <nav>
          <div className="sidebar__section">Управление</div>
          <div className="nav">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" className="nav__item" aria-current={section === s.key ? 'page' : undefined} onClick={() => go(s.key)}>
                {s.icon}{s.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="sidebar__footer">
          <UserChip user={user} />
          <button type="button" className="btn btn--block" onClick={onLogout}><SignOutIcon size={18} aria-hidden /> Выйти</button>
        </div>
      </aside>

      <div className="admin__main">
        <header className="topbar topbar--mobile">
          <Brand />
          <span className="topbar__spacer" />
          <UserChip user={user} />
          <button type="button" className="btn btn--ghost btn--icon" onClick={onLogout} aria-label="Выйти"><SignOutIcon size={20} /></button>
        </header>
        <nav className="admin-tabs" aria-label="Разделы">
          <div className="segmented segmented--block" style={{ width: '100%' }}>
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" className="segmented__item" aria-pressed={section === s.key} onClick={() => go(s.key)}>
                {s.icon}{s.label}
              </button>
            ))}
          </div>
        </nav>
        <main id="main" className="page" tabIndex={-1} style={{ outline: 'none' }}>
          <div key={section} className="page-enter">{content()}</div>
        </main>
      </div>
    </div>
  );
}
