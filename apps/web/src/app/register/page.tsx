'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/stores/auth';
import { authApi } from '@/lib/api';
import { UserPlus, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface Track {
  id: string;
  name: string;
  nameAr: string;
}

const ROLE_OPTIONS = [
  { value: 'employee', label: 'موظف' },
  { value: 'track_lead', label: 'قائد مسار' },
  { value: 'hr', label: 'الموارد البشرية' },
];

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuth((s) => s.register);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [trackId, setTrackId] = useState('');
  const [role, setRole] = useState('employee');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authApi.getPublicTracks()
      .then(({ data }) => setTracks(data))
      .catch(() => toast.error('فشل تحميل المسارات'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    if (!trackId) {
      toast.error('يجب اختيار المسار');
      return;
    }

    setLoading(true);
    try {
      await register({ email, password, name, nameAr, trackId, role });
      toast.success('تم إنشاء الحساب بنجاح');
      router.push('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إنشاء الحساب');
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
            <UserPlus className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">إنشاء حساب جديد</h1>
          <p className="text-gray-400 mt-1">نظام رؤية - إدارة المشاريع</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">الاسم الكامل (English)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Full Name"
              required
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">الاسم بالعربي</label>
            <input
              type="text"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              className="input-field"
              placeholder="الاسم الكامل"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">البريد الإلكتروني</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="example@email.com"
              required
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">المسار</label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="input-field"
              required
            >
              <option value="">اختر المسار...</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">المنصب</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="input-field"
              required
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="6 أحرف على الأقل"
                required
                minLength={6}
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

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">تأكيد كلمة المرور</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="أعد كتابة كلمة المرور"
              required
              minLength={6}
              dir="ltr"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-center disabled:opacity-50"
          >
            {loading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          لديك حساب؟{' '}
          <Link href="/login" className="text-brand-400 hover:text-brand-300">
            سجل دخول
          </Link>
        </p>
      </div>
    </div>
  );
}
