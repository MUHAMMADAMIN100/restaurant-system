# RestaurantOS — Полная инструкция по запуску

## Требования
- Node.js 18+
- PostgreSQL 14+

---

## 1. База данных (PostgreSQL)

```sql
-- Открой psql и выполни:
CREATE DATABASE restaurant_db;
```

---

## 2. Backend (NestJS)

```bash
cd backend

# Установить зависимости
npm install

# Скопировать и заполнить .env
cp .env.example .env
```

### Заполни `backend/.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=твой_пароль
DB_NAME=restaurant_db

JWT_SECRET=любой_секрет_посложнее
JWT_EXPIRES=7d

PORT=3000
FRONTEND_URL=http://localhost:5173
```

```bash
# Запустить в режиме разработки (таблицы создаются автоматически)
npm run start:dev

# После старта — заполнить тестовыми данными:
npm run seed
```

### Тестовые аккаунты после seed:
| Роль    | Email              | Пароль  |
|---------|--------------------|---------|
| Admin   | admin@resto.com    | admin   |
| Waiter  | waiter@resto.com   | waiter  |
| Chef    | chef@resto.com     | chef    |
| Manager | manager@resto.com  | manager |

Локально их можно не вводить: на странице входа есть кнопки «Демо-доступ».

---

## 3. Frontend (React + Vite)

```bash
cd frontend

# Установить зависимости
npm install

# Запустить
npm run dev
```

Открой браузер: **http://localhost:5173**

---

## API Endpoints

Все пути начинаются с `/api` (например, `POST /api/auth/login`). Swagger: `/docs`.

| Метод  | URL                        | Описание                                                    | Роль           |
|--------|----------------------------|-------------------------------------------------------------|----------------|
| POST   | /auth/login                | Вход                                                        | All            |
| GET    | /auth/me                   | Текущий пользователь                                        | Auth           |
| GET    | /categories                | Список категорий                                            | Auth           |
| POST   | /categories                | Создать категорию                                           | Admin          |
| PATCH  | /categories/:id            | Переименовать                                               | Admin          |
| DELETE | /categories/:id            | Удалить (409, если в категории есть блюда)                  | Admin          |
| GET    | /menu                      | Список блюд (без архивных)                                  | Auth           |
| POST   | /menu                      | Добавить блюдо                                              | Admin          |
| PATCH  | /menu/:id                  | Обновить блюдо                                              | Admin          |
| DELETE | /menu/:id                  | Убрать блюдо в архив (история заказов сохраняется)          | Admin          |
| GET    | /orders                    | Все заказы (`?status=PENDING\|COOKING\|READY\|CLOSED`)     | Auth           |
| POST   | /orders                    | Создать заказ; цена блюда фиксируется в заказе              | Admin, Waiter  |
| PATCH  | /orders/:id/status         | `PENDING → COOKING → READY` (закрыть можно только оплатой) | Admin, Chef    |
| GET    | /payments                  | Платежи                                                     | Admin, Waiter  |
| GET    | /payments/analytics        | Аналитика (`?period=today\|week\|month\|all`)              | Admin          |
| POST   | /payments                  | Принять оплату `{ orderId, type }` — сумму считает сервер  | Admin, Waiter  |
| GET    | /customers                 | База клиентов со статусом (красная зона наверху)            | Admin, Manager |
| GET    | /customers/lookup?q=       | Поиск клиента по имени/номеру для заказа                    | Admin, Manager, Waiter |
| POST   | /customers                 | Добавить клиента `{ name, phone }` (+992…)                  | Admin, Manager, Waiter |
| PATCH/DELETE | /customers/:id       | Изменить / удалить клиента                                  | Admin, Manager |
| GET/POST | /customers/:id/calls     | История звонков / записать звонок `{ result, comment }`     | Admin, Manager |
| GET/PATCH | /settings/customers     | Порог красной зоны `{ inactiveDays }` (по умолчанию 5)      | Admin, Manager |

## WebSocket (Socket.io)

Namespace: `/orders`

| Событие        | Когда                          |
|----------------|-------------------------------|
| `order:new`    | Новый заказ от официанта       |
| `order:status` | Шеф изменил статус             |
| `order:closed` | Заказ закрыт (оплачен)         |

---

## Деплой

- **Frontend** → Vercel (загрузи папку `frontend`, `VITE_API_URL` укажи на backend)
- **Backend** → Railway / Render (укажи переменные из `.env`)
- **Database** → Railway PostgreSQL или Supabase

### Переменные окружения
- Backend: `DATABASE_URL` (или `DB_*`), `JWT_SECRET` — **обязателен**, без него сервер не запустится; `FRONTEND_URL` для CORS.
- Frontend (Vercel): `VITE_API_URL` и `VITE_WS_URL` — адрес backend. Кнопки демо-входа видны только при локальной разработке (`npm run dev`).
