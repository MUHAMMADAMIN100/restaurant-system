import { CallResult } from './customer.entity';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_INACTIVE_DAYS = 5;

/**
 * Accepts "+992 93 123 45 67", "992931234567", "93-123-45-67", "931234567"…
 * Returns the canonical "+992XXXXXXXXX" or null if it isn't a Tajik mobile number.
 */
export function normalizePhone(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  if (digits.length === 9) return `+992${digits}`;
  if (digits.length === 12 && digits.startsWith('992')) return `+${digits}`;
  return null;
}

export interface StatusInput {
  createdAt: Date;
  lastVisitAt: Date | null;
  lastCallAt: Date | null;
  lastCallResult: CallResult | null;
}

export type CustomerState = 'overdue' | 'called' | 'ok';

export interface CustomerStatus {
  /** Days since the last visit (or since the customer was added, if never visited). */
  daysAway: number;
  neverVisited: boolean;
  /**
   * overdue — absent longer than the threshold and nobody reached them yet → red, top of the list.
   * called  — absent too long, but a manager reached them recently (pause for another threshold period).
   * ok      — visited recently.
   */
  state: CustomerState;
}

export function customerStatus(c: StatusInput, thresholdDays: number, now = new Date()): CustomerStatus {
  const base = c.lastVisitAt ?? c.createdAt;
  const awayMs = now.getTime() - new Date(base).getTime();
  const daysAway = Math.max(0, Math.floor(awayMs / DAY_MS));
  const absentTooLong = awayMs > thresholdDays * DAY_MS;

  // A call pauses the red flag only if it happened after the last visit, actually reached
  // the customer (not "no answer"), and is itself not older than the threshold.
  const callAt = c.lastCallAt ? new Date(c.lastCallAt).getTime() : null;
  const reached =
    callAt !== null &&
    c.lastCallResult !== CallResult.NO_ANSWER &&
    callAt > new Date(base).getTime() &&
    now.getTime() - callAt <= thresholdDays * DAY_MS;

  return {
    daysAway,
    neverVisited: !c.lastVisitAt,
    state: !absentTooLong ? 'ok' : reached ? 'called' : 'overdue',
  };
}

const STATE_ORDER: Record<CustomerState, number> = { overdue: 0, called: 1, ok: 2 };

/** Red zone first (longest absence first), then called, then everyone else by absence. */
export function compareByUrgency(
  a: { status: CustomerStatus; name: string },
  b: { status: CustomerStatus; name: string },
): number {
  return (
    STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state] ||
    b.status.daysAway - a.status.daysAway ||
    a.name.localeCompare(b.name, 'ru')
  );
}
