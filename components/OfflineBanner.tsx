'use client';
import { useEffect, useState } from 'react';

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Set initial state after mount (navigator.onLine is not available during SSR)
    setOffline(!navigator.onLine);

    function handleOffline() { setOffline(true); }
    function handleOnline() { setOffline(false); }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-[#15181D] text-white text-xs font-medium py-2 px-4 text-center shadow-md"
    >
      <span aria-hidden="true" className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber animate-pulse inline-block" />
      No connection — we&apos;ll reconnect automatically. Actions can&apos;t be saved right now.
    </div>
  );
}
