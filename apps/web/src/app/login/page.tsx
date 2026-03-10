'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/stores/auth';
import { LogIn, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      let message: string;
      if (err.code === 'ECONNABORTED') {
        message = 'انتهت مهلة الاتصال - يرجى المحاولة مرة أخرى';
      } else if (err.response?.data?.message) {
        message = err.response.data.message;
      } else if (err.response?.status) {
        message = `خطأ من الخادم: ${err.response.status}`;
      } else if (err.code === 'ERR_NETWORK') {
        message = 'لا يمكن الاتصال بالخادم - تحقق من اتصال الشبكة';
      } else {
        message = 'فشل تسجيل الدخول - تأكد من تشغيل الخادم';
      }
      console.error('Login error:', err.code, err.message, err.response?.status);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]" />
      </div>

      <div className="glass p-8 w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 mb-4">
            <LogIn className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">نظام رؤية</h1>
          <p className="text-gray-400 mt-1">نظام إدارة المشاريع</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">البريد الإلكتروني</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="admin@ruya.sa"
              required
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="••••••"
                required
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-center disabled:opacity-50"
          >
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          ليس لديك حساب؟{' '}
          <Link href="/register" className="text-brand-400 hover:text-brand-300">
            أنشئ حساب جديد
          </Link>
        </p>
      </div>
    </div>
  );
}
