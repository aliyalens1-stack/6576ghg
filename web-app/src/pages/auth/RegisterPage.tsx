import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Phone, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export default function RegisterPage() {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'customer' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await register(form);
      navigate(form.role === 'customer' ? '/account' : '/provider');
    } catch (err: any) { setError(err?.response?.data?.message || err?.message || 'Ошибка регистрации'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-16 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <img src="https://images.pexels.com/photos/3807277/pexels-photo-3807277.jpeg" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
      </div>

      <div className="relative w-full max-w-lg card-elevated">
        <Link to="/" className="inline-flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber flex items-center justify-center text-black font-display text-2xl" style={{ borderRadius: 8, display: 'none' }}>A</div>
          <img src="/api/web-app/logo.png" alt="AutoSearch" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
          <div className="font-display tracking-bebas text-2xl" style={{ display: 'none' }}>AUTO<span className="text-amber">SEARCH</span></div>
        </Link>

        <div className="slash-label mb-2">РЕГИСТРАЦИЯ</div>
        <h1 className="font-display tracking-bebas text-5xl mt-1 leading-none">
          <span className="text-white">ДОБРО</span> <span className="text-amber">ПОЖАЛОВАТЬ</span>
        </h1>
        <p className="text-sm mt-3" style={{ color: '#B8B8B8' }}>Создайте аккаунт клиента или мастера за 1 минуту.</p>

        {/* Role tabs */}
        <div className="tab-group mt-6 mb-2">
          <button type="button" onClick={() => set('role', 'customer')} className={`tab-pill ${form.role === 'customer' ? 'active' : ''}`} data-testid="role-customer">Клиент</button>
          <button type="button" onClick={() => set('role', 'provider_owner')} className={`tab-pill ${form.role === 'provider_owner' ? 'active' : ''}`} data-testid="role-provider">Мастер / СТО</button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field icon={User} placeholder="Имя" value={form.firstName} onChange={v => set('firstName', v)} testId="reg-first-name" />
            <Field icon={User} placeholder="Фамилия" value={form.lastName} onChange={v => set('lastName', v)} testId="reg-last-name" />
          </div>
          <Field icon={Mail} type="email" placeholder="you@example.com" value={form.email} onChange={v => set('email', v)} testId="reg-email" />
          <Field icon={Phone} placeholder="+380 ..." value={form.phone} onChange={v => set('phone', v)} testId="reg-phone" />
          <Field icon={Lock} type="password" placeholder="••••••••" value={form.password} onChange={v => set('password', v)} testId="reg-password" />

          {error && <div className="card !p-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)', color: '#fca5a5' }} data-testid="reg-error">{error}</div>}

          <button type="submit" disabled={loading} className="btn-primary btn-lg w-full" data-testid="reg-submit">
            {loading ? 'СОЗДАНИЕ…' : <>СОЗДАТЬ АККАУНТ <ArrowRight size={14} /></>}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: '#8A8A8A' }}>
          Уже есть аккаунт? <Link to="/login" className="text-amber hover:underline font-semibold">Войти</Link>
        </p>
      </div>
    </div>
  );
}

function Field({ icon: Icon, value, onChange, placeholder, type = 'text', testId }: any) {
  return (
    <div className="input-shell input-lg">
      <Icon size={16} className="text-amber" />
      <input type={type} required value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} data-testid={testId} />
    </div>
  );
}
