import { ApplyForm } from '@/components/ApplyForm';

export const dynamic = 'force-dynamic';

// Public-by-design. No auth. No footer / nav / extra links — keeps the
// homeowner's attention on the one task. The inline /privacy link on
// the consent step is the only navigable link they ever see.
export default function ApplyPage({
  searchParams,
}: {
  searchParams: { campaign?: string; error?: string };
}) {
  const campaign = searchParams.campaign ?? '';
  const error = searchParams.error ?? '';

  return (
    <main className="min-h-screen px-4 py-6 md:py-12 flex justify-center">
      <div className="w-full max-w-md">
        <header className="mb-5 md:mb-7">
          <div className="text-amber font-semibold text-base tracking-tight">
            Sunline
          </div>
          <h1 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight">
            Solar quote in 60 seconds
          </h1>
        </header>

        <ApplyForm campaign={campaign} initialError={error} />
      </div>
    </main>
  );
}
