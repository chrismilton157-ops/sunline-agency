export const dynamic = 'force-dynamic';

// Neutral, identical thank-you for every successful capture — qualified,
// disqualified, or uncovered. The homeowner is never told they were
// rejected; the owner sees the truth on the agency Leads screen.
export default function ThanksPage() {
  return (
    <main className="min-h-screen px-4 py-14 flex items-center justify-center">
      <div className="card max-w-md w-full p-7 text-center">
        <div className="text-amber font-semibold text-base tracking-tight">
          Sunline
        </div>
        <div className="mt-7 text-3xl text-good">✓</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Thanks — got it
        </h1>
        <p className="text-muted text-sm mt-3">
          We&apos;ve got your details and we&apos;ll be in touch shortly.
        </p>
      </div>
    </main>
  );
}
