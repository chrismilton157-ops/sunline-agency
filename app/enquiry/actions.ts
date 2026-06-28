'use server';
import { getServerAdmin } from '@/lib/supabase/admin';

export type EnquiryState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export async function submitEnquiry(
  _prev: EnquiryState,
  formData: FormData,
): Promise<EnquiryState> {
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  const company = (formData.get('company') as string | null)?.trim() ?? '';
  const email = (formData.get('email') as string | null)?.trim() ?? '';
  const phone = (formData.get('phone') as string | null)?.trim() ?? '';
  const region = (formData.get('region') as string | null)?.trim() ?? '';
  const current_lead_spend =
    (formData.get('current_lead_spend') as string | null)?.trim() ?? null;

  if (!name || !company || !email || !phone || !region) {
    return { status: 'error', message: 'Please fill in all required fields.' };
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return { status: 'error', message: 'Please enter a valid email address.' };
  }

  const supabase = getServerAdmin();
  const { error } = await supabase.from('installer_enquiries').insert({
    name,
    company,
    email,
    phone,
    region,
    current_lead_spend: current_lead_spend || null,
  });

  if (error) {
    console.error('installer_enquiries insert error', error);
    return { status: 'error', message: 'Something went wrong — please try again.' };
  }

  return { status: 'success' };
}
