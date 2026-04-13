'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  error?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  name?: string;
}

export default function AppSelect({
  value,
  onChange,
  options,
  placeholder = 'اختر...',
  emptyMessage = 'لا توجد خيارات متاحة',
  loading = false,
  loadingMessage = 'جاري التحميل...',
  error = false,
  errorMessage = 'فشل تحميل البيانات',
  disabled = false,
  required = false,
  className = '',
  size = 'md',
  name,
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedOption = options.find((o) => o.value === value);

  // Position dropdown relative to trigger
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = Math.min(options.length * 40 + 16, 240);
    const openAbove = spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow;

    setDropdownStyle({
      position: 'fixed',
      width: rect.width,
      right: window.innerWidth - rect.right,
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      zIndex: 9999,
    });
  }, [options.length]);

  // Open handler
  const handleOpen = useCallback(() => {
    if (disabled || loading) return;
    updatePosition();
    setOpen(true);
    const idx = options.findIndex((o) => o.value === value);
    setFocusedIndex(idx >= 0 ? idx : 0);
  }, [disabled, loading, updatePosition, options, value]);

  // Close handler
  const handleClose = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
    triggerRef.current?.focus();
  }, []);

  // Toggle
  const handleToggle = useCallback(() => {
    if (open) handleClose();
    else handleOpen();
  }, [open, handleClose, handleOpen]);

  // Select option
  const handleSelect = useCallback(
    (optValue: string) => {
      onChange(optValue);
      handleClose();
    },
    [onChange, handleClose],
  );

  // Outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      )
        return;
      handleClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, handleClose]);

  // Scroll on resize/scroll
  useEffect(() => {
    if (!open) return;
    const handle = () => updatePosition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [open, updatePosition]);

  // Scroll focused item into view
  useEffect(() => {
    if (!open || focusedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-option]');
    items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, open]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (open && focusedIndex >= 0 && options[focusedIndex]) {
            handleSelect(options[focusedIndex].value);
          } else {
            handleOpen();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!open) {
            handleOpen();
          } else {
            setFocusedIndex((i) => (i < options.length - 1 ? i + 1 : 0));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (!open) {
            handleOpen();
          } else {
            setFocusedIndex((i) => (i > 0 ? i - 1 : options.length - 1));
          }
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
        case 'Tab':
          if (open) handleClose();
          break;
        case 'Home':
          if (open) {
            e.preventDefault();
            setFocusedIndex(0);
          }
          break;
        case 'End':
          if (open) {
            e.preventDefault();
            setFocusedIndex(options.length - 1);
          }
          break;
      }
    },
    [disabled, open, focusedIndex, options, handleOpen, handleClose, handleSelect],
  );

  const sizeClasses = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2.5 px-4 text-sm',
    lg: 'py-3 px-4 text-base',
  };

  const dropdown = open && mounted
    ? createPortal(
        <div
          ref={dropdownRef}
          dir="rtl"
          style={dropdownStyle}
          className="animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="rounded-xl border shadow-2xl overflow-hidden" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-card-solid)', boxShadow: 'var(--shadow-card-hover)' }}>
            <div
              ref={listRef}
              role="listbox"
              aria-activedescendant={
                focusedIndex >= 0 ? `option-${focusedIndex}` : undefined
              }
              className="max-h-[220px] overflow-y-auto p-1.5"
            >
              {error ? (
                <div className="flex items-center gap-2 px-3 py-3 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMessage}
                </div>
              ) : loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  {loadingMessage}
                </div>
              ) : options.length === 0 ? (
                <div className="px-3 py-3 text-gray-500 text-sm text-center">
                  {emptyMessage}
                </div>
              ) : (
                options.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isFocused = idx === focusedIndex;
                  return (
                    <div
                      key={opt.value}
                      id={`option-${idx}`}
                      data-option
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(opt.value)}
                      onMouseEnter={() => setFocusedIndex(idx)}
                      className={`
                        flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer
                        text-sm transition-colors duration-100 select-none
                        ${
                          isSelected
                            ? 'bg-brand-500/20 text-brand-300'
                            : isFocused
                              ? 'bg-brand-500/10'
                              : 'hover:bg-brand-500/5'
                        }
                      `}
                    >
                      {opt.icon && (
                        <span className="shrink-0">{opt.icon}</span>
                      )}
                      <span className="flex-1 truncate" style={{ color: isSelected ? undefined : 'var(--color-text-primary)' }}>{opt.label}</span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-brand-400 shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {/* Hidden native input for form validation */}
      {required && (
        <input
          tabIndex={-1}
          name={name}
          value={value}
          required
          onChange={() => {}}
          className="sr-only"
          aria-hidden
        />
      )}

      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        style={{ background: 'var(--color-input-bg)', borderColor: open ? undefined : 'var(--color-input-border)', color: 'var(--color-input-text)' }}
        disabled={disabled}
        className={`
          w-full flex items-center gap-2 text-right
          border rounded-xl
          transition-all duration-200 outline-none
          ${
            open
              ? 'border-brand-500/60 ring-2 ring-brand-500/30'
              : ''
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${sizeClasses[size]}
          ${className}
        `}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-500 shrink-0" />
        ) : null}

        <span
          className="flex-1 truncate"
          style={{ color: selectedOption ? 'var(--color-text-primary)' : 'var(--color-input-placeholder)' }}
        >
          {selectedOption?.label || placeholder}
        </span>

        <ChevronDown
          className={`w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {dropdown}
    </>
  );
}
