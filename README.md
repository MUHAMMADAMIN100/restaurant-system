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

| Метод  | URL                        | Описание              | Роль    |
|--------|----------------------------|-----------------------|---------|
| POST   | /auth/login                | Вход                  | All     |
| GET    | /auth/me                   | Текущий пользователь  | Auth    |
| GET    | /categories                | Список категорий      | Auth    |
| POST   | /categories                | Создать категорию     | Admin   |
| PATCH  | /categories/:id            | Обновить              | Admin   |
| DELETE | /categories/:id            | Удалить               | Admin   |
| GET    | /menu                      | Список блюд           | Auth    |
| POST   | /menu                      | Добавить блюдо        | Admin   |
| PATCH  | /menu/:id                  | Обновить блюдо        | Admin   |
| DELETE | /menu/:id                  | Удалить блюдо         | Admin   |
| GET    | /orders                    | Все заказы            | Auth    |
| POST   | /orders                    | Создать заказ         | Waiter  |
| PATCH  | /orders/:id/status         | Изменить статус       | Chef    |
| GET    | /payments                  | Платежи               | Admin   |
| GET    | /payments/analytics        | Аналитика             | Admin   |
| POST   | /payments                  | Принять оплату        | Waiter  |

---

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

### Для деплоя — обнови `frontend/src/api/client.js`:
```js
const BASE = import.meta.env.VITE_API_URL || '/api';
```

И добавь `.env` файл во frontend:
```
VITE_API_URL=https://твой-backend.railway.app
```
