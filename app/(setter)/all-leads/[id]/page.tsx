import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Lead' };

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import type { LeadQueue, CallDisposition } from '@/lib/types';
import { LeadProfileClient } from './LeadProfileClient';

export const dynamic = 'force-dynamic';

export default async function LeadProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (userRow?.role === 'client') redirect('/portal');
  if (!userRow?.role) redirect('/login');

  const admin = getServerAdmin();

  const { data: lead, error } = await admin
    .from('leads')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (error) throw error;
  if (!lead) notFound();

  const { data: disps } = await admin
    .from('call_dispositions')
    .select('id, lead_id, disposition, callback_at, disqual_reason, notes, created_by, created_at')
    .eq('lead_id', params.id)
    .order('created_at', { ascending: true });

  const typedLead = {
    ...(lead as unknown as LeadQueue),
    dispositions: (disps ?? []) as CallDisposition[],
  } as LeadQueue;

  return (
    <div className="space-y-4">
      <Link href="/all-leads" className="text-sm text-muted hover:text-ink inline-flex items-center gap-1">
        ‹ Back to leads
      </Link>
      <LeadProfileClient lead={typedLead} userId={user.id} />
    </div>
  );
}
