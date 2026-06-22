'use server';
import { loadRoutingState } from '@/lib/data';
import { routeLead } from '@/lib/routing';
import type { RoutingDecision } from '@/lib/routing';

// Pure simulation — does NOT write anything to the DB. Just runs the
// routing function against the current state and returns the decision.
export async function simulateRoute(formData: FormData): Promise<
  | { ok: true; postcode: string; decision: RoutingDecision }
  | { ok: false; error: string }
> {
  const postcode = String(formData.get('postcode') ?? '').trim();
  if (!postcode) return { ok: false, error: 'Enter a postcode (e.g. GU2 8AA).' };
  const { routingClients } = await loadRoutingState();
  const decision = routeLead(postcode, routingClients);
  return { ok: true, postcode, decision };
}
