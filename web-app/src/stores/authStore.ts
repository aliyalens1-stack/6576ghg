import { create } from 'zustand';
import { authAPI } from '../services/api';

interface User { id: string; email: string; role: string; firstName: string; lastName: string; }
interface AuthState {
  user: User | null; token: string | null; isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  isLoading: false,
  login: async (email, password) => {
    const { data } = await authAPI.login(email, password);
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ user: data.user, token: data.accessToken });
  },
  register: async (d) => {
    const { data } = await authAPI.register(d);
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ user: data.user, token: data.accessToken });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },
  checkAuth: async () => {
    const t = localStorage.getItem('token');
    if (!t) return;
    set({ isLoading: true });
    try {
      const { data } = await authAPI.me();
      localStorage.setItem('user', JSON.stringify(data));
      set({ user: data, token: t });
    } catch { localStorage.removeItem('token'); localStorage.removeItem('user'); set({ user: null, token: null }); }
    finally { set({ isLoading: false }); }
  },
}));
