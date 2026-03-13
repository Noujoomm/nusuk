'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/stores/auth';
import { authApi } from '@/lib/api';
import AppSelect from '@/components/ui/app-select';
import { UserPlus, Eye, EyeOff, User, Mail, GitBranch, Shield, Lock } from 'lucide-react';
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
  const [tracksLoading, setTracksLoading] = useState(true);
  const [tracksError, setTracksError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTracksLoading(true);
    authApi
      .getPublicTracks()
      .then(({ data }) => {
        setTracks(data);
        setTracksError(false);
      })
      .catch(() => {
        setTracksError(true);
        toast.error('فشل تحميل المسارات');
      })
      .finally(() => setTracksLoading(false));
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

  const trackOptions = tracks.map((t) => ({
    value: t.id,
    label: t.nameAr,
  }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4 py-8">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]" />
      </div>

      <div className="glass p-6 sm:p-8 w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/20 mb-3">
            <UserPlus className="w-7 h-7 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">إنشاء حساب جديد</h1>
          <p className="text-gray-400 mt-1 text-sm">نظام رؤية - إدارة المشاريع</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Name fields - side by side on larger screens */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
                <User className="w-3.5 h-3.5" />
                الاسم (English)
              </label>
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
              <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
                <User className="w-3.5 h-3.5" />
                الاسم بالعربي
              </label>
              <input
                type="text"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="input-field"
                placeholder="الاسم الكامل"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
              <Mail className="w-3.5 h-3.5" />
              البريد الإلكتروني
            </label>
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

          {/* Track + Role - side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
                <GitBranch className="w-3.5 h-3.5" />
                المسار
              </label>
              <AppSelect
                value={trackId}
                onChange={setTrackId}
                options={trackOptions}
                placeholder="اختر المسار..."
                emptyMessage="لا توجد مسارات متاحة"
                loading={tracksLoading}
                loadingMessage="جاري تحميل المسارات..."
                error={tracksError}
                errorMessage="فشل تحميل المسارات"
                required
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
                <Shield className="w-3.5 h-3.5" />
                المنصب
              </label>
              <AppSelect
                value={role}
                onChange={setRole}
                options={ROLE_OPTIONS}
                placeholder="اختر المنصب..."
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
              <Lock className="w-3.5 h-3.5" />
              كلمة المرور
            </label>
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
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
              <Lock className="w-3.5 h-3.5" />
              تأكيد كلمة المرور
            </label>
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

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 text-center disabled:opacity-50 mt-2 text-base font-semibold"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                جاري إنشاء الحساب...
              </span>
            ) : (
              'إنشاء حساب'
            )}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-5">
          لديك حساب؟{' '}
          <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium">
            سجل دخول
          </Link>
        </p>
      </div>
    </div>
  );
}
