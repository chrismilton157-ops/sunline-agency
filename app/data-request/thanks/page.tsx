import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Request received — Sunline' };

export default function DataRequestThanksPage() {
  return (
    <main className="min-h-screen bg-bg px-4 py-10 md:py-20 flex justify-center items-start">
      <div className="w-full max-w-md text-center">
        <div className="text-amber font-semibold text-base tracking-tight mb-8">
          Sunline
        </div>

        <div className="card p-8 md:p-10 rounded-xl border border-hairline shadow-sm">
          <div className="w-12 h-12 rounded-full bg-good/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-good" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
            Request received
          </h1>
          <p className="mt-3 text-muted text-sm leading-relaxed">
            We have received your data request and will respond within the
            statutory timeframe — one month for access and erasure requests,
            30 days for complaints.
          </p>
          <p className="mt-3 text-muted text-sm leading-relaxed">
            If we need any further information to verify your identity or locate
            your record, we will contact you using the details you provided.
          </p>

          <div className="mt-6 pt-5 border-t border-hairline text-xs text-muted">
            If you do not hear from us within the statutory timeframe, or if
            you remain unsatisfied with our response, you can escalate to the{' '}
            <a
              href="https://ico.org.uk/make-a-complaint/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber underline underline-offset-2"
            >
              Information Commissioner&apos;s Office (ICO)
            </a>
            .{' '}
            <span className="italic">[Solicitor review pending]</span>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted">
          <Link href="/privacy" className="text-amber underline underline-offset-2">
            Privacy policy
          </Link>
        </p>
      </div>
    </main>
  );
}
