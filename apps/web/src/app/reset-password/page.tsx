'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { ShieldCheck, Lock, Eye, EyeOff, ArrowRight, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenValid(false);
      return;
    }

    authApi
      .validateResetToken(token)
      .then(({ data }) => setTokenValid(data.valid))
      .catch(() => setTokenValid(false))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => router.push('/login'), 3000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'فشل تحديث كلمة المرور';
      toast.error(msg);
      // If token is now invalid, show the invalid state
      if (err.response?.status === 400) {
        setTokenValid(false);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Loading State ──
  if (validating) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-10 h-10 text-brand-400 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">جاري التحقق من الرابط...</p>
      </div>
    );
  }

  // ── Success State ──
  if (success) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 mb-4">
          <CheckCircle2 className="w-8 h-8 text-brand-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-3">تم تحديث كلمة المرور بنجاح</h1>
        <p className="text-gray-400 text-sm mb-6">
          سيتم توجيهك لصفحة تسجيل الدخول خلال ثوانٍ...
        </p>
        <Link
          href="/login"
          className="btn-primary inline-flex items-center gap-2 py-2.5 px-6"
        >
          <ArrowRight className="w-4 h-4" />
          تسجيل الدخول الآن
        </Link>
      </div>
    );
  }

  // ── Invalid Token State ──
  if (!tokenValid) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/20 mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-3">رابط غير صالح</h1>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          رابط إعادة التعيين غير صالح أو انتهت صلاحيته.
          <br />
          يرجى طلب رابط جديد.
        </p>
        <div className="space-y-3">
          <Link
            href="/forgot-password"
            className="btn-primary w-full py-2.5 text-center block"
          >
            طلب رابط جديد
          </Link>
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 text-brand-400 hover:text-brand-300 text-sm font-medium"
          >
            <ArrowRight className="w-4 h-4" />
            العودة لتسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  // ── Reset Form ──
  return (
    <>
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/20 mb-3">
          <ShieldCheck className="w-7 h-7 text-brand-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">تعيين كلمة مرور جديدة</h1>
        <p className="text-gray-400 mt-2 text-sm">
          أدخل كلمة المرور الجديدة لحسابك.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="flex items-center gap-1.5 text-sm text-gray-400 mb-1.5">
            <Lock className="w-3.5 h-3.5" />
            كلمة المرور الجديدة
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field pl-10"
              placeholder="8 أحرف على الأقل"
              required
              minLength={8}
              dir="ltr"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password.length > 0 && password.length < 8 && (
            <p className="text-xs text-amber-400 mt-1.5">
              كلمة المرور يجب أن تكون 8 أحرف على الأقل
            </p>
          )}
        </div>

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
            minLength={8}
            dir="ltr"
          />
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="text-xs text-red-400 mt-1.5">
              كلمتا المرور غير متطابقتين
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || password.length < 8 || password !== confirmPassword}
          className="btn-primary w-full py-3 text-center disabled:opacity-50 text-base font-semibold"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              جاري التحديث...
            </span>
          ) : (
            'تحديث كلمة المرور'
          )}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 p-4">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-brand-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]" />
      </div>

      <div className="glass p-6 sm:p-8 w-full max-w-md relative z-10">
        <Suspense
          fallback={
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 text-brand-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-sm">جاري التحميل...</p>
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
