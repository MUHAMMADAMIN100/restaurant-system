import { CallResult } from './customer.entity';
import { customerStatus, compareByUrgency, normalizePhone, DAY_MS } from './customer-status';

const NOW = new Date('2026-09-24T12:00:00');
const daysAgo = (d: number, extraMs = 0) => new Date(NOW.getTime() - d * DAY_MS - extraMs);
const base = { createdAt: daysAgo(100), lastVisitAt: null, lastCallAt: null, lastCallResult: null };

describe('normalizePhone', () => {
  it.each([
    ['+992 93 123 45 67', '+992931234567'],
    ['992931234567', '+992931234567'],
    ['93-123-45-67', '+992931234567'],
    ['931234567', '+992931234567'],
  ])('%s → %s', (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each(['12345', '+7 999 123 45 67', '', 'abc'])('отклоняет %s', (input) => expect(normalizePhone(input)).toBeNull());
});

describe('customerStatus (порог 5 дней)', () => {
  it('был 2 дня назад → ok', () => {
    expect(customerStatus({ ...base, lastVisitAt: daysAgo(2) }, 5, NOW).state).toBe('ok');
  });

  it('ровно 5 дней → ещё не красный; 5 дней и минута → красный', () => {
    expect(customerStatus({ ...base, lastVisitAt: daysAgo(5) }, 5, NOW).state).toBe('ok');
    expect(customerStatus({ ...base, lastVisitAt: daysAgo(5, 60_000) }, 5, NOW).state).toBe('overdue');
  });

  it('новый клиент без визитов считается с даты добавления', () => {
    const fresh = customerStatus({ ...base, createdAt: daysAgo(1) }, 5, NOW);
    expect(fresh).toEqual({ daysAway: 1, neverVisited: true, state: 'ok' });
    expect(customerStatus({ ...base, createdAt: daysAgo(8) }, 5, NOW).state).toBe('overdue');
  });

  it('после звонка — пауза (called)', () => {
    const s = customerStatus({ ...base, lastVisitAt: daysAgo(9), lastCallAt: daysAgo(1), lastCallResult: CallResult.COMING_SOON }, 5, NOW);
    expect(s.state).toBe('called');
  });

  it('«не дозвонился» паузу не даёт', () => {
    const s = customerStatus({ ...base, lastVisitAt: daysAgo(9), lastCallAt: daysAgo(1), lastCallResult: CallResult.NO_ANSWER }, 5, NOW);
    expect(s.state).toBe('overdue');
  });

  it('звонок старше порога — снова красный', () => {
    const s = customerStatus({ ...base, lastVisitAt: daysAgo(20), lastCallAt: daysAgo(6), lastCallResult: CallResult.COMING_SOON }, 5, NOW);
    expect(s.state).toBe('overdue');
  });

  it('звонок до последнего визита не учитывается', () => {
    const s = customerStatus({ ...base, lastVisitAt: daysAgo(7), lastCallAt: daysAgo(8), lastCallResult: CallResult.COMING_SOON }, 5, NOW);
    expect(s.state).toBe('overdue');
  });

  it('порог настраивается', () => {
    expect(customerStatus({ ...base, lastVisitAt: daysAgo(4) }, 3, NOW).state).toBe('overdue');
    expect(customerStatus({ ...base, lastVisitAt: daysAgo(8) }, 10, NOW).state).toBe('ok');
  });
});

describe('compareByUrgency', () => {
  it('красные наверху, среди них дольше отсутствующие первыми', () => {
    const mk = (name: string, lastVisit: number, call?: CallResult) => ({
      name,
      status: customerStatus({ ...base, lastVisitAt: daysAgo(lastVisit), lastCallAt: call ? daysAgo(0.5) : null, lastCallResult: call ?? null }, 5, NOW),
    });
    const list = [mk('Недавний', 1), mk('Пропал 7', 7), mk('Звонили', 10, CallResult.COMING_SOON), mk('Пропал 12', 12)];
    expect(list.sort(compareByUrgency).map((x) => x.name)).toEqual(['Пропал 12', 'Пропал 7', 'Звонили', 'Недавний']);
  });
});
