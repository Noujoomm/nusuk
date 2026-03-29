'use client';

import { useCallback } from 'react';
import { gregorianToHijri, hijriToGregorian } from '@/lib/hijri-utils';

interface DatePairInputProps {
  gregorianDate: string;
  hijriDate: string;
  onGregorianChange: (val: string) => void;
  onHijriChange: (val: string) => void;
  gregorianLabel?: string;
  hijriLabel?: string;
  className?: string;
}

/**
 * Bi-directional Hijri ↔ Gregorian date input pair.
 * Editing either field auto-fills the other.
 */
export default function DatePairInput({
  gregorianDate, hijriDate,
  onGregorianChange, onHijriChange,
  gregorianLabel = 'التاريخ الميلادي',
  hijriLabel = 'التاريخ الهجري',
  className = '',
}: DatePairInputProps) {
  const handleGregorian = useCallback((val: string) => {
    onGregorianChange(val);
    const hijri = gregorianToHijri(val);
    if (hijri) onHijriChange(hijri);
    else if (!val) onHijriChange('');
  }, [onGregorianChange, onHijriChange]);

  const handleHijri = useCallback((val: string) => {
    onHijriChange(val);
    const greg = hijriToGregorian(val);
    if (greg) onGregorianChange(greg);
    else if (!val) onGregorianChange('');
  }, [onGregorianChange, onHijriChange]);

  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      <div>
        <label className="block text-xs text-gray-400 mb-1">{gregorianLabel}</label>
        <input
          type="date"
          value={gregorianDate}
          onChange={(e) => handleGregorian(e.target.value)}
          className="input-field text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">{hijriLabel}</label>
        <input
          type="text"
          value={hijriDate}
          onChange={(e) => handleHijri(e.target.value)}
          placeholder="1447/09/28"
          className="input-field text-sm"
          dir="ltr"
        />
      </div>
    </div>
  );
}
