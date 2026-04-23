export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'waiter' | 'chef';
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
  categoryId: number;
  category?: Category;
  isAvailable: boolean;
  description: string | null;
  imageUrl: string | null;
}

export interface OrderItem {
  id: number;
  menuItemId: number;
  menuItem?: MenuItem;
  quantity: number;
}

export type OrderStatus = 'PENDING' | 'COOKING' | 'READY' | 'CLOSED';

export interface Order {
  id: number;
  tableNumber: number;
  status: OrderStatus;
  items: OrderItem[];
  createdAt: string;
}

export interface Payment {
  id: number;
  orderId: number;
  amount: number;
  type: 'CASH' | 'CARD';
  createdAt: string;
}

export interface Analytics {
  totalRevenue: number;
  orderCount: number;
  avgOrder: number;
  payments: Payment[];
}

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

function getToken(): string | null {
  return localStorage.getItem('resto_token');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Ошибка сервера' }));
    throw new Error((err as { message?: string }).message || `HTTP ${res.status}`);
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
  createOrder: (data: { tableNumber: number; items: { menuItemId: number; quantity: number }[] }) =>
    request<Order>('POST', '/orders', data),
  updateStatus: (id: number, status: OrderStatus) =>
    request<Order>('PATCH', `/orders/${id}/status`, { status }),

  getPayments:   ()                            => request<Payment[]>('GET', '/payments'),
  getAnalytics:  ()                            => request<Analytics>('GET', '/payments/analytics'),
  createPayment: (data: { orderId: number; amount: number; type: 'CASH' | 'CARD' }) =>
    request<Payment>('POST', '/payments', data),
};
