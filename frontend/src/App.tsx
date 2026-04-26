import { useState, useEffect, Component, type ReactNode } from 'react';
import { api } from './api/client';
import type { User } from './api/client';
import { disconnectSocket } from './hooks/useSocket';
import LoginPage from './components/LoginPage';
import AdminView from './components/AdminView';
import WaiterView from './components/WaiterView';
import ChefView from './components/ChefView';
import { S } from './utils/styles';

interface ErrorBoundaryState { hasError: boolean; error: Error | null; }
interface ErrorBoundaryProps { children: ReactNode; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="anim-fade" style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ textAlign: 'center', maxWidth: 480 }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: '#f59e0b', marginBottom: 16 }}>RestaurantOS</div>
            <div style={{ color: '#ef4444', fontSize: 16, marginBottom: 12, fontWeight: 600 }}>Что-то пошло не так</div>
            <div style={{ color: '#4b5563', fontSize: 13, marginBottom: 24 }}>{this.state.error?.message}</div>
            <button style={S.btn()} onClick={() => window.location.reload()}>Перезагрузить</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ROLE_ICON  = { admin: '👑', waiter: '🍽', chef: '👨‍🍳' };
const ROLE_LABEL = { admin: 'Administrator', waiter: 'Waiter', chef: 'Chef' };

interface NavbarProps { user: User; onLogout: () => void; }
function Navbar({ user, onLogout }: NavbarProps) {
  return (
    <div className="anim-fade-down" style={{
      background: 'rgba(13, 13, 13, 0.85)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderBottom: '1px solid #1a1a1a',
      padding: '0 16px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      height: 60,
      position: 'sticky', top: 0, zIndex: 100,
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: '#f59e0b', fontWeight: 700, letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>
          Restaurant<span style={{ color: '#4b5563' }}>OS</span>
        </span>
        <span className="hide-mobile" style={{ width: 1, height: 22, background: '#1e1e1e' }} />
        <span className="hide-mobile" style={{ fontSize: 11, color: '#3a3a3a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {user.role === 'admin' ? 'Управление' : user.role === 'waiter' ? 'Зал' : 'Кухня'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: '#141414', borderRadius: 8, border: '1px solid #222' }}>
          <span style={{ fontSize: 16 }}>{ROLE_ICON[user.role]}</span>
          <div className="hide-mobile">
            <div style={{ fontSize: 12, color: '#e5e7eb', fontWeight: 600, lineHeight: 1.2 }}>{user.name}</div>
            <div style={{ fontSize: 9, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{ROLE_LABEL[user.role]}</div>
          </div>
        </div>
        <button style={{ ...S.btnGhost, padding: '7px 12px' }} onClick={onLogout}>Выйти</button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser]         = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('resto_token');
    if (!token) { setChecking(false); return; }
    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('resto_token'))
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = (u: User) => setUser(u);
  const handleLogout = () => {
    localStorage.removeItem('resto_token');
    disconnectSocket();
    setUser(null);
  };

  if (checking) {
    return (
      <div className="anim-fade" style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="shimmer-text" style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, marginBottom: 22, fontWeight: 700 }}>RestaurantOS</div>
          <div style={{ border: '2px solid #1e1e1e', borderTopColor: '#f59e0b', borderRadius: '50%', width: 28, height: 28, animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <ErrorBoundary>
      <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', background: '#080808', color: '#e5e7eb' }}>
        <Navbar user={user} onLogout={handleLogout} />
        <div className="container-app">
          {user.role === 'admin'  && <AdminView />}
          {user.role === 'waiter' && <WaiterView />}
          {user.role === 'chef'   && <ChefView />}
        </div>
      </div>
    </ErrorBoundary>
  );
}
