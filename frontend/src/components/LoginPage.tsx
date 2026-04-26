import { useState } from 'react';
import { api } from '../api/client';
import type { User } from '../api/client';
import { Spinner } from './UI';
import { S } from '../utils/styles';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handle = async () => {
    if (!email || !password) { setError('Заполните все поля'); return; }
    setLoading(true); setError('');
    try {
      const { access_token, user } = await api.login(email, password);
      localStorage.setItem('resto_token', access_token);
      onLogin(user);
    } catch (e) {
      setError((e as Error).message || 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  const quick = (role: 'admin' | 'waiter' | 'chef') => {
    const map = {
      admin:  ['admin@resto.com',  'admin'],
      waiter: ['waiter@resto.com', 'waiter'],
      chef:   ['chef@resto.com',   'chef'],
    };
    setEmail(map[role][0]); setPassword(map[role][1]); setError('');
  };

  return (
    <main className="anim-fade" style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div aria-hidden="true" className="anim-pulse" style={{ position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 'min(700px, 90vw)', height: 320, background: 'radial-gradient(ellipse, #f59e0b22 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div className="anim-fade-up" style={{ width: '100%', maxWidth: 420, padding: 16, position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 className="anim-fade-down" style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(36px, 8vw, 48px)', color: '#f59e0b', letterSpacing: '-1.5px', lineHeight: 1, margin: 0 }}>
            Restaurant<span style={{ color: '#e5e7eb' }}>OS</span>
          </h1>
          <p style={{ color: '#3a3a3a', marginTop: 12, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Система управления рестораном
          </p>
        </div>

        <div className="anim-scale" style={{ ...S.card, border: '1px solid #1e1e1e', boxShadow: '0 0 0 1px #1e1e1e, 0 24px 80px rgba(0,0,0,0.6)', padding: 22 }}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="login-email" style={S.label}>Email</label>
            <input id="login-email" style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@resto.com" autoComplete="email" aria-required="true" />
          </div>
          <div style={{ marginBottom: 22 }}>
            <label htmlFor="login-password" style={S.label}>Пароль</label>
            <input id="login-password" style={S.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handle()} placeholder="••••••••" autoComplete="current-password" aria-required="true" />
          </div>

          {error && (
            <div role="alert" className="anim-shake" style={{ background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button style={{ ...S.btn(), width: '100%', padding: '13px 0', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }} onClick={handle} disabled={loading} aria-busy={loading}>
            {loading ? <Spinner size={16} color="#000" /> : null}
            {loading ? 'Вход...' : 'Войти'}
          </button>

          <div style={{ marginTop: 26, borderTop: '1px solid #1a1a1a', paddingTop: 20 }}>
            <p style={{ fontSize: 11, color: '#333', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Быстрый вход</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }} role="group" aria-label="Быстрый вход">
              {(['admin', 'waiter', 'chef'] as const).map((role) => (
                <button key={role} onClick={() => quick(role)} style={{ ...S.btnGhost, fontSize: 12, padding: '9px 0', textAlign: 'center' }} aria-label={`Войти как ${role}`}>
                  {role === 'admin' ? '👑 Admin' : role === 'waiter' ? '🍽 Waiter' : '👨‍🍳 Chef'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 11, color: '#2a2a2a' }}>
          RestaurantOS · 2026
        </p>
      </div>
    </main>
  );
}
