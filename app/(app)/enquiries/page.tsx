import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { fmtMoney } from '@/lib/format';
import { INSTALLER_SELF_AUDIT_SOURCE } from '@/lib/self-audit';

import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Installer Enquiries' };

interface Enquiry {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  region: string | null;
  current_lead_spend: string | null;
  source: string | null;
  audit_monthly_spend: number | null;
  audit_appointments: number | null;
  audit_close_rate: number | null;
  audit_cost_per_sale: number | null;
  preferred_call_time: string | null;
  created_at: string;
}

export default async function EnquiriesPage() {
  await requireOwner();
  const admin = getServerAdmin();
  const { data: enquiries, error } = await admin
    .from('installer_enquiries')
    .select(
      'id, name, company, email, phone, region, current_lead_spend, source, audit_monthly_spend, audit_appointments, audit_close_rate, audit_cost_per_sale, preferred_call_time, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = (enquiries ?? []) as Enquiry[];

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-ink">Installer Enquiries</h1>
        <p className="text-muted text-sm mt-1">
          Leads captured from the marketing landing page. Contact them to qualify and onboard.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-muted">
          <p className="text-base font-medium mb-1">No enquiries yet.</p>
          <p className="text-sm">Enquiries submitted via the landing page will appear here.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted mb-4">{rows.length} enquir{rows.length === 1 ? 'y' : 'ies'}</p>
          <div className="space-y-3">
            {rows.map((e) => {
              const isSelfAudit = e.source === INSTALLER_SELF_AUDIT_SOURCE;
              return (
              <div key={e.id} className="card p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{e.name}</span>
                      <span className="text-muted text-sm">·</span>
                      <span className="text-ink text-sm">{e.company}</span>
                      {isSelfAudit && (
                        <span
                          className="inline-block text-white text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#E07B39' }}
                        >
                          Self-audit
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted">
                      <a href={`mailto:${e.email}`} className="hover:text-amber transition-colors">{e.email}</a>
                      {e.phone && <span>{e.phone}</span>}
                      {e.region && <span>{e.region}</span>}
                    </div>
                    {e.current_lead_spend && (
                      <div className="mt-2">
                        <span className="inline-block bg-amber/10 text-amber text-xs font-medium px-2 py-0.5 rounded-full">
                          {e.current_lead_spend}
                        </span>
                      </div>
                    )}
                    {e.preferred_call_time && (
                      <p className="text-sm text-muted mt-2">
                        <span className="font-medium text-ink">Prefers:</span>{' '}
                        {e.preferred_call_time}
                      </p>
                    )}

                    {/* Self-audit numbers — visible before you pick up the phone. */}
                    {isSelfAudit &&
                      (e.audit_monthly_spend != null ||
                        e.audit_appointments != null ||
                        e.audit_close_rate != null ||
                        e.audit_cost_per_sale != null) && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <AuditStat
                            label="Monthly spend"
                            value={fmtMoney(e.audit_monthly_spend)}
                          />
                          <AuditStat
                            label="Appts / month"
                            value={
                              e.audit_appointments != null
                                ? String(e.audit_appointments)
                                : '—'
                            }
                          />
                          <AuditStat
                            label="Close rate"
                            value={
                              e.audit_close_rate != null
                                ? `${e.audit_close_rate}%`
                                : '—'
                            }
                          />
                          <AuditStat
                            label="Real cost / sale"
                            value={fmtMoney(e.audit_cost_per_sale)}
                            highlight
                          />
                        </div>
                      )}
                  </div>
                  <div className="shrink-0 text-xs text-muted whitespace-nowrap">
                    {new Date(e.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                    {' '}
                    {new Date(e.created_at).toLocaleTimeString('en-GB', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function AuditStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-bg border border-hairline rounded-lg px-3 py-2">
      <div className="text-[11px] text-muted mb-0.5">{label}</div>
      <div
        className="text-base font-bold num"
        style={highlight ? { color: '#E07B39' } : { color: '#15181D' }}
      >
        {value}
      </div>
    </div>
  );
}
