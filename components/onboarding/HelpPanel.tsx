'use client';
import { useEffect } from 'react';
import type { TourRole } from './tourContent';
import { HELP_CONTENT } from './tourContent';

interface Props {
  role: TourRole;
  onClose: () => void;
  onReplayTour: () => void;
}

export function HelpPanel({ role, onClose, onReplayTour }: Props) {
  const content = HELP_CONTENT[role];

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[8000] bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 bottom-0 z-[8001] w-full max-w-sm
                   bg-card shadow-2xl overflow-y-auto
                   motion-safe:animate-[slideInRight_0.25s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-label="Help panel"
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-hairline px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden="true">❓</span>
            <h2 className="font-semibold text-ink tracking-tight">{content.heading}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close help"
            className="text-muted hover:text-ink transition-colors rounded-lg p-1.5"
            style={{ minHeight: 'unset', minWidth: 'unset' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Sections */}
        <div className="px-5 py-5 space-y-5">
          {content.sections.map((s) => (
            <div key={s.title}>
              <h3 className="text-sm font-semibold text-ink mb-1.5">{s.title}</h3>
              <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{s.body}</p>
            </div>
          ))}
        </div>

        {/* Replay tour */}
        <div className="sticky bottom-0 bg-card border-t border-hairline px-5 py-4">
          <button
            onClick={() => { onClose(); onReplayTour(); }}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold
                       bg-amber text-white hover:bg-amber/90 transition-colors
                       shadow-[0_2px_8px_0_rgba(224,123,57,0.25)]"
          >
            🎬 Replay the tour
          </button>
        </div>
      </div>
    </>
  );
}
