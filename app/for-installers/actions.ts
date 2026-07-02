'use server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { buildInstallerAuditRow } from '@/lib/self-audit';

export type InstallerAuditState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string };

// Parse a loosely-formatted number field (strips £, %, commas). Returns NaN
// when empty / unparseable so buildInstallerAuditRow stores null and
// computeAudit treats it as an incomplete audit.
function num(v: FormDataEntryValue | null): number {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (cleaned === '') return NaN;
  return parseFloat(cleaned);
}

export async function submitInstallerAudit(
  _prev: InstallerAuditState,
  formData: FormData,
): Promise<InstallerAuditState> {
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  const company = (formData.get('company') as string | null)?.trim() ?? '';
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const phone = (formData.get('phone') as string | null)?.trim() ?? '';
  const region = (formData.get('region') as string | null)?.trim() ?? '';
  const preferredCallTime =
    (formData.get('preferred_call_time') as string | null)?.trim() ?? '';

  // Only name / company / email are required (phone + area are optional).
  if (!name || !company || !email) {
    return {
      status: 'error',
      message: 'Please fill in your name, company and email.',
    };
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return { status: 'error', message: 'Please enter a valid email address.' };
  }

  // Recompute cost-per-sale server-side from the raw audit inputs — never
  // trust a computed number sent up from the client.
  const row = buildInstallerAuditRow({
    name,
    company,
    email,
    phone: phone || null,
    region: region || null,
    preferredCallTime: preferredCallTime || null,
    audit: {
      monthlySpend: num(formData.get('audit_monthly_spend')),
      appointments: num(formData.get('audit_appointments')),
      closeRatePct: num(formData.get('audit_close_rate')),
    },
  });

  const supabase = getServerAdmin();
  const { error } = await supabase.from('installer_enquiries').insert(row);

  if (error) {
    console.error('installer self-audit insert error', error);
    return {
      status: 'error',
      message: 'Something went wrong — please try again.',
    };
  }

  return { status: 'success' };
}
