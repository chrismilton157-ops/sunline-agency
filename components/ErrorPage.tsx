'use client';

interface Props {
  reset?: () => void;
  homeHref?: string;
  homeLabel?: string;
}

export function ErrorPage({
  reset,
  homeHref = '/',
  homeLabel = 'Go home',
}: Props) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center text-center min-h-[60vh] px-6 py-16"
    >
      <div className="mb-6" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" fill="#E07B39" fillOpacity={0.08} stroke="#E07B39" strokeOpacity={0.2} strokeWidth="1.5" />
          <path d="M24 15v10M24 31v2" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="font-semibold text-ink text-base">Something went wrong</h1>
      <p className="text-muted text-sm mt-2 max-w-xs leading-relaxed">
        We hit an unexpected problem. Your data is safe — please try again.
      </p>
      <div className="flex items-center gap-3 mt-6 flex-wrap justify-center">
        {reset && (
          <button onClick={reset} className="btn btn-primary">
            Try again
          </button>
        )}
        <a href={homeHref} className="btn btn-secondary">
          {homeLabel}
        </a>
      </div>
    </div>
  );
}
