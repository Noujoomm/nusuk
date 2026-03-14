'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { KeyRound, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      // Rate limit or server error
      if (err.response?.status === 429) {
        toast.error('تم تجاوز عدد المحاولات المسموحة. حاول مرة أخرى لاحقاً.');
      } else {
        toast.error('حدث خطأ في الخادم. حاول مرة أخرى.');
      }
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

      <div className="glass p-6 sm:p-8 w-full max-w-md relative z-10">
        {sent ? (
          /* ── Success State ── */
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500/20 mb-4">
              <CheckCircle2 className="w-8 h-8 text-brand-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-3">تم إرسال الرابط</h1>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              إذا كان البريد الإلكتروني مسجلاً لدينا فسيتم إرسال رابط إعادة تعيين كلمة المرور.
            </p>
            <p className="text-gray-500 text-xs mb-6">
              تحقق من بريدك الإلكتروني بما في ذلك مجلد البريد غير المرغوب فيه (Spam).
            </p>

            <div className="space-y-3">
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="btn-secondary w-full py-2.5 text-center text-sm"
              >
                إرسال رابط جديد
              </button>
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-brand-400 hover:text-brand-300 text-sm font-medium"
              >
                <ArrowRight className="w-4 h-4" />
                العودة لتسجيل الدخول
              </Link>
            </div>
          </div>
        ) : (
          /* ── Form State ── */
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500/20 mb-3">
                <KeyRound className="w-7 h-7 text-brand-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">استعادة كلمة المرور</h1>
              <p className="text-gray-400 mt-2 text-sm leading-relaxed">
                أدخل بريدك الإلكتروني وسنرسل لك رابط لإعادة تعيين كلمة المرور.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
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
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 text-center disabled:opacity-50 text-base font-semibold"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري الإرسال...
                  </span>
                ) : (
                  'إرسال رابط الاستعادة'
                )}
              </button>
            </form>

            <p className="text-center text-gray-400 text-sm mt-6">
              <Link href="/login" className="flex items-center justify-center gap-2 text-brand-400 hover:text-brand-300 font-medium">
                <ArrowRight className="w-4 h-4" />
                العودة لتسجيل الدخول
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
