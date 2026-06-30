'use client';
import { useState, useEffect, useCallback } from 'react';
import type { TourRole } from './tourContent';
import { TOUR_STEPS } from './tourContent';
import { TourModal } from './TourModal';
import { HelpPanel } from './HelpPanel';

interface Props {
  role: TourRole;
  userId: string;
}

function storageKey(userId: string, role: TourRole) {
  return `sunline_tour_seen_${userId}_${role}`;
}

export function TourManager({ role, userId }: Props) {
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const steps = TOUR_STEPS[role];
  const key = storageKey(userId, role);

  // Check localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    setMounted(true);
    const seen = localStorage.getItem(key);
    if (!seen) {
      // Small delay so the page content renders first
      const t = setTimeout(() => setTourStep(0), 600);
      return () => clearTimeout(t);
    }
  }, [key]);

  const markSeen = useCallback(() => {
    localStorage.setItem(key, 'seen');
  }, [key]);

  function handleNext() {
    if (tourStep === null) return;
    if (tourStep < steps.length - 1) {
      setTourStep(tourStep + 1);
    } else {
      markSeen();
      setTourStep(null);
    }
  }

  function handleBack() {
    if (tourStep !== null && tourStep > 0) {
      setTourStep(tourStep - 1);
    }
  }

  function handleSkip() {
    markSeen();
    setTourStep(null);
  }

  function handleReplay() {
    setTourStep(0);
  }

  if (!mounted) return null;

  return (
    <>
      {/* Floating help button */}
      {tourStep === null && !helpOpen && (
        <button
          onClick={() => setHelpOpen(true)}
          aria-label="Open help"
          className="fixed bottom-6 right-5 z-[7000] flex items-center justify-center
                     w-11 h-11 rounded-full bg-ink text-white shadow-lg
                     hover:bg-amber hover:shadow-[0_4px_16px_0_rgba(224,123,57,0.40)]
                     transition-all duration-200 active:scale-95"
          style={{ minHeight: 'unset', minWidth: 'unset' }}
          title="Help & tour"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <path d="M12 17h.01"/>
          </svg>
        </button>
      )}

      {/* Tour modal */}
      {tourStep !== null && (
        <TourModal
          steps={steps}
          current={tourStep}
          onNext={handleNext}
          onBack={handleBack}
          onSkip={handleSkip}
        />
      )}

      {/* Help panel */}
      {helpOpen && (
        <HelpPanel
          role={role}
          onClose={() => setHelpOpen(false)}
          onReplayTour={handleReplay}
        />
      )}
    </>
  );
}
