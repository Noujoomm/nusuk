'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { reportsApi } from '@/lib/api';

export type ReportTypeStr = 'daily' | 'weekly' | 'monthly' | 'annual' | 'operational';

export interface VoiceFillResult {
  transcription: string;
  detectedLanguage?: string;
  fields: {
    title: string;
    type: ReportTypeStr | null;
    trackName: string;
    reportDate: string;
    achievements: string;
    kpiUpdates: string;
    challenges: string;
    supportNeeded: string;
    upcomingTasks: string;
    notes: string;
  };
}

interface Props {
  onFilled: (result: VoiceFillResult) => void;
  disabled?: boolean;
}

const MAX_DURATION_SEC = 5 * 60; // 5 دقائق سقف صلب — Whisper 25MB كافي

/**
 * زر "ملء التقرير بالصوت":
 *  - idle      → يعرض زر التسجيل
 *  - recording → يعرض المؤقّت + موجة + زر الإيقاف
 *  - uploading → spinner أثناء النقل + Whisper + استخراج الحقول
 * عند النجاح يستدعي onFilled برد الخادم — والصفحة تُحدّث الحقول.
 */
export function VoiceFillButton({ onFilled, disabled }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // تأكيد إنهاء كل شيء لو الـ component اتشال أثناء التسجيل
  useEffect(() => {
    return () => {
      stopTracks();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = async () => {
    if (state !== 'idle') return;

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('متصفحك لا يدعم تسجيل الصوت');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      const reason = err?.name;
      if (reason === 'NotAllowedError' || reason === 'PermissionDeniedError') {
        toast.error('يجب السماح للمتصفح بالوصول للميكروفون');
      } else if (reason === 'NotFoundError') {
        toast.error('لا يوجد ميكروفون متصل');
      } else {
        toast.error('تعذّر الوصول للميكروفون');
      }
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mime = pickSupportedMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      stopTracks();

      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      chunksRef.current = [];

      if (blob.size === 0) {
        setState('idle');
        setSeconds(0);
        toast.error('لم يتم تسجيل أي صوت');
        return;
      }

      await uploadAndExtract(blob);
    };

    setSeconds(0);
    setState('recording');
    recorder.start();

    tickRef.current = setInterval(() => {
      setSeconds((prev) => {
        const next = prev + 1;
        if (next >= MAX_DURATION_SEC) {
          // وصلنا الحد — أوقف تلقائياً
          recorder.stop();
        }
        return next;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (state !== 'recording') return;
    recorderRef.current?.stop();
  };

  const uploadAndExtract = async (blob: Blob) => {
    setState('uploading');
    const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    const tid = toast.loading('جارٍ تحويل الصوت إلى نص...');

    try {
      const { data } = await reportsApi.voiceFill(blob, `recording.${ext}`);
      toast.success('تم استخراج الحقول، يمكنك مراجعتها وحفظ التقرير', { id: tid });
      onFilled(data as VoiceFillResult);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'فشل معالجة الصوت';
      toast.error(typeof msg === 'string' ? msg : 'فشل معالجة الصوت', { id: tid });
    } finally {
      setState('idle');
      setSeconds(0);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (state === 'recording') {
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 transition-colors"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
        <Square className="w-4 h-4" />
        <span className="font-medium tabular-nums">{formatTime(seconds)}</span>
        <span className="text-xs opacity-80">— اضغط للإيقاف</span>
      </button>
    );
  }

  if (state === 'uploading') {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 cursor-wait"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        جارٍ المعالجة...
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/40 text-amber-200 hover:from-amber-500/30 hover:to-yellow-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      title="سجّل تقريرك صوتياً وسيتم تعبئة الحقول تلقائياً"
    >
      <Mic className="w-4 h-4" />
      ملء بالصوت
    </button>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Picks a MediaRecorder mime that Whisper actually accepts. Browsers vary
 * widely: Chromium → webm/opus, Safari/iOS → mp4/aac, Firefox → ogg/opus.
 * Returns undefined for "let the browser default", which usually works.
 */
function pickSupportedMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}
