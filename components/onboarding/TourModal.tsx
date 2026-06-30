'use client';
import { useEffect } from 'react';
import type { TourStep } from './tourContent';

interface Props {
  steps: TourStep[];
  current: number;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function TourModal({ steps, current, onNext, onSkip, onBack }: Props) {
  const step = steps[current];
  const isLast = current === steps.length - 1;

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onSkip();
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSkip]);

  // Trap scroll on body
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!step) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center
                 bg-ink/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Getting started tour"
    >
      <div
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl overflow-hidden
                   motion-safe:animate-[slideUp_0.25s_ease-out]"
        style={{
          animation: 'slideUp 0.25s ease-out',
        }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-hairline">
          <div
            className="h-full bg-amber transition-all duration-300 ease-out"
            style={{ width: `${((current + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="px-6 py-6">
          {/* Step counter */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted font-medium uppercase tracking-wide">
              Step {current + 1} of {steps.length}
            </span>
            <button
              onClick={onSkip}
              className="text-xs text-muted hover:text-ink underline underline-offset-2"
              style={{ minHeight: 'unset', minWidth: 'unset' }}
            >
              Skip tour
            </button>
          </div>

          {/* Content */}
          <div className="text-4xl mb-3 select-none" aria-hidden="true">
            {step.emoji}
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-ink mb-2">
            {step.title}
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            {step.body}
          </p>

          {/* Dot indicators */}
          <div className="flex items-center gap-1.5 mt-5 mb-4">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all duration-200 ${
                  i === current
                    ? 'w-4 h-2 bg-amber'
                    : i < current
                    ? 'w-2 h-2 bg-amber/40'
                    : 'w-2 h-2 bg-hairline'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {current > 0 && (
              <button
                onClick={onBack}
                className="flex-none px-4 py-2.5 rounded-lg text-sm font-medium
                           border border-hairline text-ink hover:bg-hairline/50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={onNext}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold
                         bg-amber text-white hover:bg-amber/90 active:bg-amber/80
                         transition-colors shadow-[0_2px_8px_0_rgba(224,123,57,0.30)]"
            >
              {isLast ? 'Got it — let\'s go! 🚀' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
