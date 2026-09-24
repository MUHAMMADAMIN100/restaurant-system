import { useState, type FormEvent } from 'react';
import {
  EyeIcon, EyeSlashIcon, WarningCircleIcon, InfoIcon, CaretRightIcon,
  ChartBarIcon, CallBellIcon, CookingPotIcon,
} from '@phosphor-icons/react';
import { api, tokenStore } from '../api/client';
import type { User } from '../api/client';
import { Brand, Spinner } from './UI';

interface LoginPageProps {
  onLogin: (user: User) => void;
  notice?: string | null;
}

// Demo accounts are shown only in local development, never on the deployed site.
const DEMO = import.meta.env.DEV
  ? [
      { role: 'Администратор', email: 'admin@resto.com',  password: 'admin',  icon: <ChartBarIcon size={18} /> },
      { role: 'Официант',      email: 'waiter@resto.com', password: 'waiter', icon: <CallBellIcon size={18} /> },
      { role: 'Повар',         email: 'chef@resto.com',   password: 'chef',   icon: <CookingPotIcon size={18} /> },
    ]
  : [];

export default function LoginPage({ onLogin, notice }: LoginPageProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [touched, setTouched]   = useState(false);
  const [loading, setLoading]   = useState(false);

  const emailInvalid = touched && !/^\S+@\S+\.\S+$/.test(email);
  const passInvalid  = touched && password.length === 0;

  const signIn = async (e?: string, p?: string) => {
    const em = (e ?? email).trim(), pw = p ?? password;
    setTouched(true);
    if (!/^\S+@\S+\.\S+$/.test(em) || !pw) return;
    setLoading(true); setError('');
    try {
      const { access_token, user } = await api.login(em, pw);
      tokenStore.set(access_token);
      onLogin(user);
    } catch (err) {
      setError((err as Error).message || 'Не удалось войти');
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); signIn(); };

  return (
    <main className="login" id="main">
      <div className="login__panel">
        <div className="login__brand"><Brand /></div>
        <h1 className="login__title">Вход в систему</h1>
        <p className="login__subtitle">Используйте рабочий email и пароль</p>

        <form className="login__form" onSubmit={onSubmit} noValidate>
          {notice && !error && (
            <div className="alert" role="status" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
              <InfoIcon size={18} aria-hidden /> {notice}
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              <WarningCircleIcon size={18} aria-hidden /> {error}
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="login-email">Email</label>
            <input
              id="login-email" className="input" type="email" inputMode="email"
              autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailInvalid} aria-describedby={emailInvalid ? 'login-email-err' : undefined}
              placeholder="name@restaurant.tj"
            />
            {emailInvalid && <span className="field-error" id="login-email-err">Введите корректный email</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="login-password">Пароль</label>
            <div className="input-wrap">
              <input
                id="login-password" className="input" type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                aria-invalid={passInvalid} aria-describedby={passInvalid ? 'login-pass-err' : undefined}
              />
              <button
                type="button" className="input-wrap__btn"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPass}
              >
                {showPass ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
            {passInvalid && <span className="field-error" id="login-pass-err">Введите пароль</span>}
          </div>

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={loading}>
            {loading && <Spinner />}
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>

        {DEMO.length > 0 && (
          <section className="demo" aria-labelledby="demo-title">
            <h2 className="demo__title" id="demo-title">
              <InfoIcon size={14} aria-hidden /> Демо-доступ (виден только при локальной разработке)
            </h2>
            <div className="demo__list">
              {DEMO.map((d) => (
                <button
                  key={d.email} type="button" className="demo__item" disabled={loading}
                  onClick={() => { setEmail(d.email); setPassword(d.password); signIn(d.email, d.password); }}
                >
                  <span className="demo__icon" aria-hidden="true">{d.icon}</span>
                  <span>
                    <span className="demo__role" style={{ display: 'block' }}>{d.role}</span>
                    <span className="demo__email">{d.email}</span>
                  </span>
                  <CaretRightIcon size={16} className="demo__arrow" aria-hidden />
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="login__foot">RestaurantOS · система управления рестораном</p>
      </div>
    </main>
  );
}
