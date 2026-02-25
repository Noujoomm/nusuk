import { create } from 'zustand';
import { authApi } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface User {
  id: string;
  email: string;
  name: string;
  nameAr: string;
  role: string;
  isActive: boolean;
  trackPermissions: Array<{
    trackId: string;
    trackName: string;
    trackNameAr: string;
    permissions: string[];
  }>;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; nameAr: string }) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  hasPermission: (trackId: string, permission: string) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  login: async (email, password) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem('access_token', data.accessToken);
    set({ user: data.user });
    connectSocket();
  },

  register: async (registerData) => {
    const { data } = await authApi.register(registerData);
    localStorage.setItem('access_token', data.accessToken);
    set({ user: data.user });
    connectSocket();
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {}
    localStorage.removeItem('access_token');
    disconnectSocket();
    set({ user: null });
  },

  loadUser: async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        set({ user: null, loading: false });
        return;
      }
      const { data } = await authApi.me();
      set({ user: data, loading: false });
      connectSocket();
    } catch {
      localStorage.removeItem('access_token');
      set({ user: null, loading: false });
    }
  },

  hasPermission: (trackId, permission) => {
    const { user } = get();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'pm') return true;
    const tp = user.trackPermissions?.find((p) => p.trackId === trackId);
    return tp?.permissions?.includes(permission) || false;
  },
}));
