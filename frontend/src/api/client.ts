export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'waiter' | 'chef' | 'manager';
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface MenuItem {
  id: number;
  name: string;
  price: number;
  categoryId: number | null;
  category?: Category | null;
  isAvailable: boolean;
  description: string | null;
  imageUrl: string | null;
}

export interface OrderItem {
  id: number;
  menuItemId: number;
  menuItem?: MenuItem;
  quantity: number;
  /** Price at the moment of ordering (null for legacy orders). */
  price?: number | null;
}

export type OrderStatus = 'PENDING' | 'COOKING' | 'READY' | 'CLOSED';

export interface Order {
  id: number;
  tableNumber: number;
  status: OrderStatus;
  items: OrderItem[];
  createdAt: string;
  customerId?: number | null;
  customer?: { id: number; name: string; phone: string } | null;
}

export type CallResult = 'NO_ANSWER' | 'COMING_SOON' | 'DISLIKED' | 'EXPENSIVE' | 'MOVED' | 'OTHER';
export type CustomerState = 'overdue' | 'called' | 'ok';

export interface CustomerBrief { id: number; name: string; phone: string; }

export interface Customer extends CustomerBrief {
  createdAt: string;
  lastVisitAt: string | null;
  lastCallAt: string | null;
  lastCallResult: CallResult | null;
  lastCallComment: string | null;
  status: { daysAway: number; neverVisited: boolean; state: CustomerState };
}

export interface CustomerList {
  inactiveDays: number;
  summary: { total: number; overdue: number; calledToday: number };
  items: Customer[];
}

export interface CustomerCall {
  id: number;
  result: CallResult;
  comment: string | null;
  createdAt: string;
  userName: string | null;
}

export interface Payment {
  id: number;
  orderId: number;
  amount: number;
  type: 'CASH' | 'CARD';
  createdAt: string;
}

export type AnalyticsPeriod = 'today' | 'week' | 'month' | 'all';

export interface DayBucket  { date: string; revenue: number; orders: number; }
export interface HourBucket { hour: number;  count: number;   revenue: number; }
export interface TableBucket { table: number; revenue: number; orders: number; }
export interface DishBucket { name: string; quantity: number; revenue: number; }
export interface LiveLoad   { pending: number; cooking: number; ready: number; closed: number; }

export interface Analytics {
  period: AnalyticsPeriod;
  totalRevenue: number;
  orderCount: number;
  avgOrder: number;
  cashRevenue: number;
  cardRevenue: number;
  cashCount: number;
  cardCount: number;
  tablesServed: number;
  avgItemsPerOrder: number;
  revenueByDay: DayBucket[];
  ordersByHour: HourBucket[];
  topTables: TableBucket[];
  topDishesByRevenue: DishBucket[];
  topDishesByQuantity: DishBucket[];
  liveLoad: LiveLoad;
  comparison: { revenueChange: number | null; orderChange: number | null } | null;
  payments: Payment[];
}

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';
const TOKEN_KEY = 'resto_token';

/** Fired when the server rejects the stored token; App listens and signs the user out. */
export const SESSION_EXPIRED_EVENT = 'resto:session-expired';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.', 0);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string | string[] };
    if (res.status === 401 && path !== '/auth/login') {
      tokenStore.clear();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const raw = Array.isArray(err.message) ? err.message[0] : err.message;
    const fallback = res.status >= 500 ? 'Ошибка сервера. Попробуйте ещё раз.' : `Ошибка ${res.status}`;
    throw new ApiError(raw || fallback, res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  login:  (email: string, password: string) =>
    request<{ access_token: string; user: User }>('POST', '/auth/login', { email, password }),
  me: () => request<User>('GET', '/auth/me'),

  getCategories:  ()                          => request<Category[]>('GET', '/categories'),
  createCategory: (data: { name: string })    => request<Category>('POST', '/categories', data),
  updateCategory: (id: number, data: { name: string }) => request<Category>('PATCH', `/categories/${id}`, data),
  deleteCategory: (id: number)                => request<{ message: string }>('DELETE', `/categories/${id}`),

  getMenu:        (available?: boolean)        => request<MenuItem[]>('GET', `/menu${available !== undefined ? `?available=${available}` : ''}`),
  createMenuItem: (data: Partial<MenuItem>)    => request<MenuItem>('POST', '/menu', data),
  updateMenuItem: (id: number, data: Partial<MenuItem>) => request<MenuItem>('PATCH', `/menu/${id}`, data),
  deleteMenuItem: (id: number)                 => request<{ message: string }>('DELETE', `/menu/${id}`),

  getOrders:   (status?: OrderStatus)          => request<Order[]>('GET', `/orders${status ? `?status=${status}` : ''}`),
  createOrder: (data: { tableNumber: number; items: { menuItemId: number; quantity: number }[]; customerId?: number | null }) =>
    request<Order>('POST', '/orders', data),
  updateStatus: (id: number, status: OrderStatus) =>
    request<Order>('PATCH', `/orders/${id}/status`, { status }),

  getPayments:   ()                            => request<Payment[]>('GET', '/payments'),
  getAnalytics:  (period: AnalyticsPeriod = 'all') => request<Analytics>('GET', `/payments/analytics?period=${period}`),
  createPayment: (data: { orderId: number; type: 'CASH' | 'CARD' }) =>
    request<Payment>('POST', '/payments', data),

  getCustomers:     (search?: string) => request<CustomerList>('GET', `/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  lookupCustomers:  (q: string) => request<CustomerBrief[]>('GET', `/customers/lookup?q=${encodeURIComponent(q)}`),
  createCustomer:   (data: { name: string; phone: string }) => request<Customer>('POST', '/customers', data),
  updateCustomer:   (id: number, data: { name?: string; phone?: string }) => request<Customer>('PATCH', `/customers/${id}`, data),
  deleteCustomer:   (id: number) => request<{ message: string }>('DELETE', `/customers/${id}`),
  getCustomerCalls: (id: number) => request<CustomerCall[]>('GET', `/customers/${id}/calls`),
  addCustomerCall:  (id: number, data: { result: CallResult; comment?: string | null }) => request<CustomerCall>('POST', `/customers/${id}/calls`, data),
  getCustomerSettings: () => request<{ inactiveDays: number }>('GET', '/settings/customers'),
  setCustomerSettings: (inactiveDays: number) => request<{ inactiveDays: number }>('PATCH', '/settings/customers', { inactiveDays }),
};
