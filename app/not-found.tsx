import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center text-center min-h-screen px-6 py-16 bg-[#F6F5F1]">
      <div className="mb-6" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" fill="#E07B39" fillOpacity={0.08} stroke="#E07B39" strokeOpacity={0.2} strokeWidth="1.5" />
          <path d="M17 17l14 14M31 17L17 31" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-muted text-xs uppercase tracking-wide font-medium mb-2">404</p>
      <h1 className="font-semibold text-ink text-base">Page not found</h1>
      <p className="text-muted text-sm mt-2 max-w-xs leading-relaxed">
        That page doesn&apos;t exist or has moved. Check the address and try again.
      </p>
      <Link href="/" className="btn btn-secondary mt-6">
        Go home
      </Link>
    </div>
  );
}
