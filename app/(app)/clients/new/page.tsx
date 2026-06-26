import WizardClient from './WizardClient';

export const dynamic = 'force-dynamic';

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Add client</h1>
        <p className="text-muted text-sm mt-1">
          Step-by-step onboarding for a new installer client.
        </p>
      </header>
      <WizardClient />
    </div>
  );
}
