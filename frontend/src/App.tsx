import { useState, useEffect, Component, type ReactNode } from 'react';
import { ArrowClockwiseIcon, SignOutIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { api, tokenStore, SESSION_EXPIRED_EVENT } from './api/client';
import type { User } from './api/client';
import { disconnectSocket } from './hooks/useSocket';
import LoginPage from './components/LoginPage';
import AdminView from './components/AdminView';
import WaiterView from './components/WaiterView';
import ChefView from './components/ChefView';
import CustomersView from './components/CustomersView';
import { Brand, Spinner, ToastProvider, UserChip } from './components/UI';

// ── Error boundary ───────────────────────────────────────────────────────────
interface EBState { error: Error | null; }
class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login">
        <div className="login__panel" role="alert">
          <div className="empty">
            <div className="empty__icon"><WarningCircleIcon size={24} /></div>
            <div className="empty__title">Что-то пошло не так</div>
            <div className="empty__text">Страница столкнулась с ошибкой. Перезагрузите её — данные на сервере не пострадали.</div>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              <ArrowClockwiseIcon size={16} /> Перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}

// ── Top bar (waiter & kitchen) ───────────────────────────────────────────────
function Topbar({ user, context, onLogout }: { user: User; context: string; onLogout: () => void }) {
  return (
    <header className="topbar">
      <Brand />
      <span className="topbar__context">{context}</span>
      <span className="topbar__spacer" />
      <UserChip user={user} />
      <span className="topbar__divider" aria-hidden="true" />
      <button className="btn btn--ghost btn--sm" onClick={onLogout}>
        <SignOutIcon size={18} aria-hidden /> <span>Выйти</span>
      </button>
    </header>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser]         = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [notice, setNotice]     = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.get()) { setChecking(false); return; }
    api.me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setChecking(false));
  }, []);

  // Server rejected the token mid-session → back to login with an explanation.
  useEffect(() => {
    const onExpired = () => {
      disconnectSocket();
      setUser((u) => {
        if (u) setNotice('Сессия истекла. Войдите снова.');
        return null;
      });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Kitchen display uses the dark theme; everything else is light.
  useEffect(() => {
    const kitchen = user?.role === 'chef';
    document.documentElement.dataset.theme = kitchen ? 'kitchen' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', kitchen ? '#18181B' : '#FFFFFF');
  }, [user]);

  // Login and logout swap the whole screen: start the new one from the top
  // (on phones the login form is often scrolled down to the demo buttons).
  const handleLogin = (u: User) => { setNotice(null); setUser(u); window.scrollTo(0, 0); };
  const handleLogout = () => {
    tokenStore.clear();
    disconnectSocket();
    setUser(null);
    window.scrollTo(0, 0);
  };

  if (checking) {
    return (
      <div className="login" aria-busy="true">
        <div style={{ display: 'grid', justifyItems: 'center', gap: 20 }}>
          <Brand />
          <Spinner size={20} label="Загрузка" />
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      {!user ? (
        <LoginPage onLogin={handleLogin} notice={notice} />
      ) : (
        <ErrorBoundary>
          <a href="#main" className="skip-link">Перейти к содержимому</a>
          {user.role === 'admin' && <AdminView user={user} onLogout={handleLogout} />}
          {user.role !== 'admin' && (
            <>
              <Topbar user={user} context={user.role === 'waiter' ? 'Зал' : user.role === 'chef' ? 'Кухня' : 'Клиенты'} onLogout={handleLogout} />
              <main id="main" className="page" tabIndex={-1}>
                {user.role === 'waiter' && <WaiterView />}
                {user.role === 'chef' && <ChefView />}
                {user.role === 'manager' && <CustomersView />}
              </main>
            </>
          )}
        </ErrorBoundary>
      )}
    </ToastProvider>
  );
}
