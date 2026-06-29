'use server';
import { loadRoutingState } from '@/lib/data';
import { loadAdaptiveMetrics } from '@/lib/adaptive-data';
import { shadowCompare, adaptiveRouteLead } from '@/lib/adaptive-routing';
import { getSettings } from '@/lib/settings';
import type { ShadowComparison } from '@/lib/adaptive-routing';

export async function simulateAdaptiveRoute(formData: FormData): Promise<
  | { ok: true; postcode: string; shadow: ShadowComparison; adaptiveEnabled: boolean }
  | { ok: false; error: string }
> {
  const postcode = String(formData.get('postcode') ?? '').trim();
  if (!postcode) return { ok: false, error: 'Enter a postcode (e.g. GU2 8AA).' };

  const [{ routingClients }, metrics, settings] = await Promise.all([
    loadRoutingState(),
    loadAdaptiveMetrics(),
    getSettings(),
  ]);

  const shadow = shadowCompare(postcode, routingClients, metrics);

  return {
    ok: true,
    postcode,
    shadow,
    adaptiveEnabled: settings.adaptive_routing_enabled,
  };
}
