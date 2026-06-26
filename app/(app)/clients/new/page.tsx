import WizardClient from './WizardClient';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  const { default_per_sit_fee } = await getSettings();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Add client</h1>
        <p className="text-muted text-sm mt-1">
          Step-by-step onboarding for a new installer client.
        </p>
      </header>
      <WizardClient defaultPerSitFee={default_per_sit_fee} />
    </div>
  );
}
