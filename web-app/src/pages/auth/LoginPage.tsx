import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Zap, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await login(email, password);
      const role = res?.user?.role;
      navigate(role === 'provider_owner' || role === 'provider_manager' ? '/provider' : role === 'customer' ? '/account' : '/');
    } catch (err: any) { setError(err?.response?.data?.message || err?.message || 'Ошибка входа'); }
    finally { setLoading(false); }
  };

  const demo = (e: string, p: string) => { setEmail(e); setPassword(p); };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-16 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <img src="https://images.pexels.com/photos/4488665/pexels-photo-4488665.jpeg" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
      </div>

      <div className="relative w-full max-w-md card-elevated">
        <Link to="/" className="inline-flex items-center mb-6">
          <img src="/api/web-app/logo.png" alt="AutoSearch" style={{ height: 56, width: 'auto', objectFit: 'contain' }} />
        </Link>

        <div className="slash-label mb-2">ВХОД НА ПЛАТФОРМУ</div>
        <h1 className="font-display tracking-bebas text-5xl mt-1 leading-none">
          <span className="text-white">СНОВА</span> <span className="text-amber">НА СВЯЗИ</span>
        </h1>
        <p className="text-sm mt-3" style={{ color: '#B8B8B8' }}>Войдите в кабинет — клиента или мастера.</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-2xs uppercase tracking-widest font-bold block mb-2" style={{ color: '#8A8A8A' }}>Email</label>
            <div className="input-shell input-lg">
              <Mail size={16} className="text-amber" />
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" data-testid="login-email" />
            </div>
          </div>

          <div>
            <label className="text-2xs uppercase tracking-widest font-bold block mb-2" style={{ color: '#8A8A8A' }}>Пароль</label>
            <div className="input-shell input-lg">
              <Lock size={16} className="text-amber" />
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" data-testid="login-password" />
            </div>
          </div>

          {error && <div className="card !p-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }} data-testid="login-error">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary btn-lg w-full" data-testid="login-submit">
            {loading ? 'ВХОД…' : <>ВОЙТИ <ArrowRight size={14} /></>}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-hairline" />
          <span className="slash-label">DEMO ДОСТУП</span>
          <div className="flex-1 h-px bg-hairline" />
        </div>

        <div className="grid grid-cols-1 gap-2">
          {[
            { role: 'Клиент',  email: 'customer@test.com',       pwd: 'Customer123!' },
            { role: 'Мастер',  email: 'provider@test.com',       pwd: 'Provider123!' },
            { role: 'Админ',   email: 'admin@autoservice.com',   pwd: 'Admin123!' },
          ].map(d => (
            <button key={d.email} onClick={() => demo(d.email, d.pwd)} type="button"
              className="card-interactive flex items-center justify-between !p-3"
              data-testid={`demo-${d.role}`}>
              <div>
                <div className="text-sm font-bold text-white">Войти как {d.role}</div>
                <div className="text-2xs uppercase tracking-widest mt-0.5" style={{ color: '#8A8A8A' }}>{d.email}</div>
              </div>
              <Zap size={14} fill="currentColor" className="text-amber" />
            </button>
          ))}
        </div>

        <p className="text-center text-sm mt-6" style={{ color: '#8A8A8A' }}>
          Нет аккаунта? <Link to="/register" className="text-amber hover:underline font-semibold">Регистрация</Link>
        </p>
      </div>
    </div>
  );
}
