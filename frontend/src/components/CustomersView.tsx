import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from 'react';
import {
  PhoneIcon, PhoneCallIcon, PlusIcon, PencilSimpleIcon, TrashIcon, MagnifyingGlassIcon, UsersThreeIcon,
  WarningCircleIcon, WarningIcon, CheckCircleIcon, ArrowClockwiseIcon, MinusIcon, ClockCounterClockwiseIcon,
  UserPlusIcon, SealCheckIcon,
} from '@phosphor-icons/react';
import { api } from '../api/client';
import type { Customer, CustomerCall, CallResult, CustomerList } from '../api/client';
import { Modal, Spinner, useToast, EmptyState, Skeleton, ConfirmDialog, AnimatedNumber } from './UI';
import { useCustomersSocket, useSocketStatus } from '../hooks/useSocket';
import { CALL_RESULT_LABEL, formatPhone, normalizePhone, pluralRu, shortDate, initials } from '../utils/format';

const RESULTS: CallResult[] = ['COMING_SOON', 'NO_ANSWER', 'DISLIKED', 'EXPENSIVE', 'MOVED', 'OTHER'];
const days = (n: number) => `${n} ${pluralRu(n, ['день', 'дня', 'дней'])}`;
type Filter = 'all' | 'overdue' | 'called' | 'ok';

// ── Customer form (add / edit) ───────────────────────────────────────────────
function CustomerForm({ initial, onClose, onSaved }: { initial: Customer | null; onClose: () => void; onSaved: (c: Customer) => void }) {
  const [name, setName]   = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial ? formatPhone(initial.phone) : '+992 ');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const toast = useToast();

  const errors = {
    name: !name.trim() ? 'Введите имя клиента' : '',
    phone: !normalizePhone(phone) ? 'Номер в формате +992 XX XXX XX XX' : '',
  };
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.phone) {
      document.getElementById(errors.name ? 'cust-name' : 'cust-phone')?.focus();
      return;
    }
    setSaving(true); setServerError('');
    try {
      const data = { name: name.trim(), phone: normalizePhone(phone)! };
      const saved = initial ? await api.updateCustomer(initial.id, data) : await api.createCustomer(data);
      toast(initial ? 'Данные клиента сохранены' : `${saved.name} добавлен в базу`);
      onSaved(saved as Customer);
      onClose();
    } catch (err) {
      setServerError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={initial ? 'Изменить клиента' : 'Новый клиент'}
      onClose={onClose}
      width={440}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Отмена</button>
          <button type="submit" form="cust-form" className="btn btn--primary" disabled={saving}>
            {saving && <Spinner />} {initial ? 'Сохранить' : 'Добавить'}
          </button>
        </>
      }
    >
      <form id="cust-form" className="form-grid" onSubmit={submit} noValidate>
        {serverError && <div className="alert" role="alert"><WarningCircleIcon size={18} aria-hidden />{serverError}</div>}
        <div className="field">
          <label className="label" htmlFor="cust-name">Имя <span className="req" aria-hidden>*</span></label>
          <input id="cust-name" className="input" value={name} maxLength={120} autoComplete="off" data-autofocus
            onChange={(e) => setName(e.target.value)} aria-invalid={!!show('name')} aria-describedby={show('name') ? 'cust-name-err' : undefined} />
          {show('name') && <span className="field-error" id="cust-name-err">{show('name')}</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor="cust-phone">Телефон <span className="req" aria-hidden>*</span></label>
          <input id="cust-phone" className="input num" type="tel" inputMode="tel" value={phone} autoComplete="off"
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => { const n = normalizePhone(phone); if (n) setPhone(formatPhone(n)); }}
            aria-invalid={!!show('phone')} aria-describedby={show('phone') ? 'cust-phone-err' : 'cust-phone-hint'} />
          {show('phone')
            ? <span className="field-error" id="cust-phone-err">{show('phone')}</span>
            : <span className="hint" id="cust-phone-hint">Например, +992 93 123 45 67</span>}
        </div>
      </form>
    </Modal>
  );
}

// ── Call modal: dial, record the outcome, see history ────────────────────────
function CallDialog({ customer, onClose, onSaved }: { customer: Customer; onClose: () => void; onSaved: () => void }) {
  const [result, setResult]   = useState<CallResult | null>(null);
  const [comment, setComment] = useState('');
  const [history, setHistory] = useState<CustomerCall[] | null>(null);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const toast = useToast();

  useEffect(() => {
    api.getCustomerCalls(customer.id).then(setHistory).catch(() => setHistory([]));
  }, [customer.id]);

  const save = async () => {
    if (!result) { setError('Выберите результат звонка'); return; }
    setSaving(true); setError('');
    try {
      await api.addCustomerCall(customer.id, { result, comment: comment.trim() || null });
      toast(result === 'NO_ANSWER'
        ? `${customer.name}: не дозвонились — клиент остаётся в списке «Позвонить»`
        : `${customer.name}: звонок записан`);
      onSaved();
      onClose();
    } catch (e) { setError((e as Error).message); setSaving(false); }
  };

  return (
    <Modal
      title={`Звонок: ${customer.name}`}
      onClose={onClose}
      width={520}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Закрыть</button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>{saving && <Spinner />} Сохранить результат</button>
        </>
      }
    >
      <div className="stack">
        <a className="call-hero" href={`tel:${customer.phone}`} data-autofocus>
          <span className="call-hero__icon" aria-hidden><PhoneCallIcon size={26} weight="fill" /></span>
          <span>
            <span className="call-hero__label">Позвонить</span>
            <span className="call-hero__phone num">{formatPhone(customer.phone)}</span>
          </span>
        </a>
        <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          {customer.status.neverVisited
            ? `Добавлен ${shortDate(customer.createdAt)}, ещё ни разу не был — ${days(customer.status.daysAway)}.`
            : `Последний визит ${shortDate(customer.lastVisitAt!)} — ${days(customer.status.daysAway)} назад.`}
        </p>

        <div className="field">
          <span className="label" id="call-result-label">Результат звонка <span className="req" aria-hidden>*</span></span>
          <div className="result-grid" role="radiogroup" aria-labelledby="call-result-label">
            {RESULTS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={result === r}
                className={`result-chip ${r === 'NO_ANSWER' ? 'result-chip--muted' : ''}`}
                onClick={() => { setResult(r); setError(''); }}>
                {CALL_RESULT_LABEL[r]}
              </button>
            ))}
          </div>
          {result === 'NO_ANSWER' && <span className="hint">Клиент останется в красной зоне, чтобы перезвонить.</span>}
        </div>

        <div className="field">
          <label className="label" htmlFor="call-comment">Комментарий</label>
          <textarea id="call-comment" className="textarea" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)}
            placeholder="Что сказал клиент: причина, когда планирует прийти" />
        </div>

        {error && <div className="alert" role="alert"><WarningCircleIcon size={18} aria-hidden />{error}</div>}

        <section aria-labelledby="call-history">
          <h3 className="label row" id="call-history" style={{ marginBottom: 8 }}><ClockCounterClockwiseIcon size={16} aria-hidden /> История звонков</h3>
          {history === null ? <Skeleton height={48} /> : history.length === 0 ? (
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Звонков ещё не было.</p>
          ) : (
            <ul className="call-history">
              {history.map((h) => (
                <li key={h.id}>
                  <div className="row row--between">
                    <strong>{CALL_RESULT_LABEL[h.result]}</strong>
                    <span className="muted num" style={{ fontSize: 'var(--fs-xs)' }}>
                      {new Date(h.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {h.userName ? ` · ${h.userName.replace(/\s*\(.*?\)\s*/g, '')}` : ''}
                    </span>
                  </div>
                  {h.comment && <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 2 }}>{h.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

// ── Threshold control ────────────────────────────────────────────────────────
function ThresholdControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="threshold card">
      <span className="threshold__icon" aria-hidden><WarningIcon size={20} weight="fill" /></span>
      <span className="threshold__text" id="threshold-label">Красная зона: не был больше</span>
      <div className="stepper" role="group" aria-labelledby="threshold-label">
        <button type="button" className="stepper__btn" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Уменьшить порог"><MinusIcon size={14} weight="bold" /></button>
        <span className="stepper__value" aria-live="polite">{value}</span>
        <button type="button" className="stepper__btn" onClick={() => onChange(Math.min(90, value + 1))} disabled={value >= 90} aria-label="Увеличить порог"><PlusIcon size={14} weight="bold" /></button>
      </div>
      <span className="threshold__text">{pluralRu(value, ['дня', 'дней', 'дней'])}</span>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
function CustomerRow({ c, index, onCall, onEdit, onDelete }: { c: Customer; index: number; onCall: () => void; onEdit: () => void; onDelete: () => void }) {
  const { state, daysAway, neverVisited } = c.status;
  const visitText = neverVisited
    ? `Ещё не был · добавлен ${shortDate(c.createdAt)}`
    : daysAway === 0 ? `Был сегодня` : `Был ${shortDate(c.lastVisitAt!)} · ${days(daysAway)} назад`;

  return (
    <li className={`cust reveal cust--${state}`} style={{ ['--i' as string]: index }}>
      <span className="cust__avatar" aria-hidden>{initials(c.name)}</span>
      <div className="cust__main">
        <div className="cust__name">{c.name}</div>
        <a className="cust__phone num" href={`tel:${c.phone}`} aria-label={`Позвонить ${c.name}: ${formatPhone(c.phone)}`}>
          <PhoneIcon size={14} aria-hidden /> {formatPhone(c.phone)}
        </a>
      </div>
      <div className="cust__visit">
        <span className="cust__visit-text">{visitText}</span>
        {state === 'overdue' && (
          <span className="status" data-status="LATE"><WarningIcon size={14} weight="bold" aria-hidden />
            {c.lastCallResult === 'NO_ANSWER' && c.lastCallAt ? `Не дозвонились ${shortDate(c.lastCallAt)}` : `Не приходит ${days(daysAway)}`}
          </span>
        )}
        {state === 'called' && c.lastCallAt && c.lastCallResult && (
          <span className="status" data-status="PENDING" title={c.lastCallComment ?? undefined}>
            <SealCheckIcon size={14} weight="bold" aria-hidden /> Звонили {shortDate(c.lastCallAt)} · {CALL_RESULT_LABEL[c.lastCallResult]}
          </span>
        )}
        {state === 'ok' && (neverVisited
          ? <span className="status" data-status="PENDING"><UserPlusIcon size={14} weight="bold" aria-hidden /> Новый клиент</span>
          : <span className="status" data-status="READY"><CheckCircleIcon size={14} weight="bold" aria-hidden /> Был недавно</span>)}
        {state === 'called' && c.lastCallComment && <span className="cust__comment">«{c.lastCallComment}»</span>}
      </div>
      <div className="cust__actions">
        <button type="button" className={`btn ${state === 'overdue' ? 'btn--primary' : ''} btn--sm`} onClick={onCall}>
          <PhoneCallIcon size={16} weight={state === 'overdue' ? 'fill' : 'regular'} aria-hidden /> {state === 'overdue' ? 'Позвонить' : 'Звонок'}
        </button>
        <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={onEdit} aria-label={`Изменить: ${c.name}`}><PencilSimpleIcon size={18} /></button>
        <button type="button" className="btn btn--ghost btn--icon btn--sm btn--icon-danger" onClick={onDelete} aria-label={`Удалить: ${c.name}`}><TrashIcon size={18} /></button>
      </div>
    </li>
  );
}

// ── CustomersView (root) ─────────────────────────────────────────────────────
export default function CustomersView() {
  const [data, setData]         = useState<CustomerList | null>(null);
  const [error, setError]       = useState('');
  const [query, setQuery]       = useState('');
  const [filter, setFilter]     = useState<Filter>('all');
  const [editing, setEditing]   = useState<Customer | 'new' | null>(null);
  const [calling, setCalling]   = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const toast = useToast();
  const saveTimer = useRef<number | undefined>(undefined);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const next = await api.getCustomers();
      if (id !== requestId.current) return;
      setData(next); setError('');
      setThreshold((t) => (t === null || saveTimer.current === undefined ? next.inactiveDays : t));
    } catch (e) { if (id === requestId.current) setError((e as Error).message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useCustomersSocket(load);
  useSocketStatus(load);
  // Days roll over while the page is open: re-evaluate every 10 minutes.
  useEffect(() => { const t = window.setInterval(load, 10 * 60 * 1000); return () => window.clearInterval(t); }, [load]);

  const changeThreshold = (n: number) => {
    setThreshold(n);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api.setCustomerSettings(n);
        toast(`Красная зона: не был больше ${days(n)}`);
      } catch (e) { toast((e as Error).message, 'error'); }
      finally { saveTimer.current = undefined; load(); }
    }, 600);
  };

  const shown = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return data.items.filter((c) =>
      (filter === 'all' || c.status.state === filter) &&
      (!q || c.name.toLowerCase().includes(q) || (digits.length >= 2 && c.phone.includes(digits))),
    );
  }, [data, query, filter]);

  const groups = useMemo(() => ([
    { key: 'overdue' as const, title: 'Нужно позвонить', items: shown.filter((c) => c.status.state === 'overdue') },
    { key: 'called' as const,  title: 'Уже звонили',     items: shown.filter((c) => c.status.state === 'called') },
    { key: 'ok' as const,      title: 'Всё в порядке',   items: shown.filter((c) => c.status.state === 'ok') },
  ]).filter((g) => g.items.length > 0), [shown]);

  const remove = async (c: Customer) => {
    try {
      await api.deleteCustomer(c.id);
      toast(`${c.name} удалён из базы`);
      load();
    } catch (e) { toast((e as Error).message, 'error'); throw e; }
  };

  const header = (
    <div className="page-header">
      <div>
        <h1 className="page-title">Клиенты</h1>
        <p className="page-subtitle">Возвращаем гостей, которые давно не приходили</p>
      </div>
      <button className="btn btn--primary" onClick={() => setEditing('new')}><UserPlusIcon size={18} weight="bold" aria-hidden /> Добавить клиента</button>
    </div>
  );

  if (!data) {
    return (
      <div>
        {header}
        {error ? (
          <div className="card">
            <EmptyState icon={<WarningCircleIcon size={24} />} title="Не удалось загрузить клиентов" text={error}
              action={<button className="btn btn--primary" onClick={load}><ArrowClockwiseIcon size={16} /> Повторить</button>} />
          </div>
        ) : (
          <div className="stack" aria-busy="true">
            <div className="kpis">{[0, 1, 2].map((i) => <Skeleton key={i} height={110} radius={16} />)}</div>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={76} radius={16} />)}
          </div>
        )}
        {editing && <CustomerForm initial={null} onClose={() => setEditing(null)} onSaved={() => load()} />}
      </div>
    );
  }

  const { summary } = data;
  const count = (k: Filter) => (k === 'all' ? data.items.length : data.items.filter((c) => c.status.state === k).length);

  return (
    <div>
      {header}

      <div className="kpis kpis--3">
        <div className={`card kpi reveal ${summary.overdue > 0 ? 'kpi--alert' : ''}`} data-tone="rose" style={{ ['--i' as string]: 0 }}>
          <span className="kpi__icon" aria-hidden><PhoneCallIcon size={20} weight="duotone" /></span>
          <div className="kpi__label">Нужно позвонить</div>
          <AnimatedNumber className="kpi__value" value={summary.overdue} format={(n) => String(Math.round(n))} />
          <div className="kpi__foot">не были больше {days(data.inactiveDays)}</div>
        </div>
        <div className="card kpi reveal" data-tone="violet" style={{ ['--i' as string]: 1 }}>
          <span className="kpi__icon" aria-hidden><SealCheckIcon size={20} weight="duotone" /></span>
          <div className="kpi__label">Звонков сегодня</div>
          <AnimatedNumber className="kpi__value" value={summary.calledToday} format={(n) => String(Math.round(n))} />
          <div className="kpi__foot">записано результатов</div>
        </div>
        <div className="card kpi reveal" data-tone="emerald" style={{ ['--i' as string]: 2 }}>
          <span className="kpi__icon" aria-hidden><UsersThreeIcon size={20} weight="duotone" /></span>
          <div className="kpi__label">Всего клиентов</div>
          <AnimatedNumber className="kpi__value" value={summary.total} format={(n) => String(Math.round(n))} />
          <div className="kpi__foot">в базе</div>
        </div>
      </div>

      <div className="cust-toolbar">
        <div className="input-wrap input-wrap--lead search">
          <span className="input-wrap__lead"><MagnifyingGlassIcon size={18} aria-hidden /></span>
          <input className="input" type="search" placeholder="Имя или номер" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск клиента" />
        </div>
        <div className="chips" role="group" aria-label="Фильтр клиентов">
          {([['all', 'Все'], ['overdue', 'Позвонить'], ['called', 'Звонили'], ['ok', 'В порядке']] as const).map(([k, l]) => (
            <button key={k} type="button" className={`chip ${k === 'overdue' ? 'chip--danger' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l} <span className="chip__count num">{count(k)}</span>
            </button>
          ))}
        </div>
        {threshold !== null && <ThresholdControl value={threshold} onChange={changeThreshold} />}
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<UsersThreeIcon size={24} />}
            title={data.items.length === 0 ? 'База клиентов пуста' : filter === 'overdue' && !query ? 'Все гости на связи' : 'Никого не нашли'}
            text={data.items.length === 0 ? 'Добавьте клиента вручную или попросите официантов указывать гостя при заказе.'
              : filter === 'overdue' && !query ? 'Нет клиентов, которые пропали дольше порога. Отличная работа!' : 'Измените поиск или фильтр.'}
            action={data.items.length === 0 ? <button className="btn btn--primary" onClick={() => setEditing('new')}><UserPlusIcon size={16} aria-hidden /> Добавить клиента</button> : undefined}
          />
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className={`cust-group cust-group--${g.key}`} aria-labelledby={`grp-${g.key}`}>
            <h2 className="cust-group__title" id={`grp-${g.key}`}>{g.title} <span className="count">{g.items.length}</span></h2>
            <ul className="cust-list">
              {g.items.map((c, i) => (
                <CustomerRow key={c.id} c={c} index={i}
                  onCall={() => setCalling(c)} onEdit={() => setEditing(c)} onDelete={() => setDeleting(c)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && <CustomerForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => load()} />}
      {calling && <CallDialog customer={calling} onClose={() => setCalling(null)} onSaved={load} />}
      {deleting && (
        <ConfirmDialog
          title="Удалить клиента?"
          text={<>{deleting.name} ({formatPhone(deleting.phone)}) и история звонков будут удалены. Прошлые заказы сохранятся.</>}
          confirmLabel="Удалить" danger
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

