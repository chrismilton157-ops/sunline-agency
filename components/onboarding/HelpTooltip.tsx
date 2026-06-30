'use client';
import { useState, useRef, useEffect } from 'react';

interface Props {
  text: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function HelpTooltip({ text, side = 'top' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside click/tap
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const positionClass =
    side === 'bottom' ? 'top-full mt-1.5 left-1/2 -translate-x-1/2' :
    side === 'left'   ? 'right-full mr-1.5 top-1/2 -translate-y-1/2' :
    side === 'right'  ? 'left-full ml-1.5 top-1/2 -translate-y-1/2' :
    /* top */           'bottom-full mb-1.5 left-1/2 -translate-x-1/2';

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`Help: ${text}`}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full
                   bg-muted/15 text-muted hover:bg-amber/20 hover:text-amber
                   text-[10px] font-bold leading-none transition-colors
                   cursor-help select-none"
        style={{ minHeight: 'unset', minWidth: 'unset' }}
      >
        ?
      </button>
      {open && (
        <span
          className={`absolute ${positionClass} z-50 w-52 px-3 py-2 rounded-lg
                      bg-ink text-white text-xs leading-relaxed shadow-xl
                      pointer-events-none whitespace-normal`}
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
