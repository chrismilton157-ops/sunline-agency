'use server';
import { redirect } from 'next/navigation';
import { captureLead, type LeadSubmission } from '@/lib/leads';

function boolFrom(value: FormDataEntryValue | null): boolean {
  return value === 'yes' || value === 'true' || value === 'on';
}

export async function submitLead(formData: FormData) {
  const monthlyBillRaw = String(formData.get('monthly_bill') ?? '').trim();
  const submission: LeadSubmission = {
    name: String(formData.get('name') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    address: String(formData.get('address') ?? '').trim(),
    postcode: String(formData.get('postcode') ?? '').trim(),
    is_homeowner: boolFrom(formData.get('is_homeowner')),
    bill_payer: boolFrom(formData.get('bill_payer')),
    monthly_bill: monthlyBillRaw === '' ? null : Number(monthlyBillRaw),
    roof_suitable: boolFrom(formData.get('roof_suitable')),
    finance_interest: boolFrom(formData.get('finance_interest')),
    notes: String(formData.get('notes') ?? '').trim() || null,
    campaign_source: String(formData.get('campaign_source') ?? '').trim() || null,
    // HARD: the consent checkbox is the ONLY source of consent. Defaults to
    // false unless the checkbox is ticked (browser sends 'on' when ticked).
    consent: formData.get('consent') === 'on',
  };

  const result = await captureLead(submission);

  if (!result.ok) {
    const qs = new URLSearchParams({ error: result.error });
    // Echo back as much as possible so the homeowner doesn't lose their work.
    if (submission.campaign_source) qs.set('campaign', submission.campaign_source);
    redirect(`/apply?${qs.toString()}`);
  }

  const params = new URLSearchParams({
    ok: '1',
    company: result.assignedCompany ?? '',
    rule: result.ruleFired,
  });
  redirect(`/apply/thanks?${params.toString()}`);
}
