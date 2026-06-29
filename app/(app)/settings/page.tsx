import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Settings' };

import { getSettings, SETTINGS_DEFAULTS } from '@/lib/settings';
import { saveSettings, resetSettings } from './actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string; reset?: string; error?: string };
}) {
  const s = await getSettings();
  const d = SETTINGS_DEFAULTS;

  const flash = searchParams.saved
    ? { tone: 'good' as const, msg: 'Settings saved. New calculations will use the updated values.' }
    : searchParams.reset
    ? { tone: 'good' as const, msg: 'Settings reset to factory defaults.' }
    : searchParams.error
    ? { tone: 'bad' as const, msg: `Error: ${searchParams.error}` }
    : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted text-sm mt-1">
          Agency-wide defaults. Where a client has their own override (e.g. a per-client markup or
          fee set during onboarding) that value always wins — these are the fallback.
        </p>
      </header>

      {flash && (
        <p
          className={`text-sm px-4 py-3 rounded-md border ${
            flash.tone === 'good'
              ? 'bg-good/10 text-good border-good/30'
              : 'bg-bad/10 text-bad border-bad/30'
          }`}
        >
          {flash.msg}
        </p>
      )}

      <form action={saveSettings} className="space-y-6">
        {/* ── Billing defaults ── */}
        <section className="card divide-y divide-hairline">
          <div className="px-5 py-4">
            <h2 className="font-semibold">Billing defaults</h2>
            <p className="text-muted text-xs mt-0.5">
              Used when generating invoices for clients that don&apos;t have a per-client
              override set in their profile.
            </p>
          </div>

          <FieldRow
            label="Default management markup"
            hint="Percentage added on top of the client's allocated ad spend. Per-client override: client profile → Markup %."
            suffix="%"
            name="default_management_markup_pct"
            defaultValue={s.default_management_markup_pct}
            codeDefault={d.default_management_markup_pct}
            step="0.1"
            min="0"
            max="100"
          />

          <FieldRow
            label="Default per-appointment fee"
            hint="Applied when a new client is set up in the onboarding wizard (pre-fills the field). The per-client value set during onboarding always takes precedence."
            prefix="£"
            name="default_per_sit_fee"
            defaultValue={s.default_per_sit_fee}
            codeDefault={d.default_per_sit_fee}
            step="0.01"
            min="0"
          />
        </section>

        {/* ── Qualifying thresholds ── */}
        <section className="card divide-y divide-hairline">
          <div className="px-5 py-4">
            <h2 className="font-semibold">Qualifying thresholds</h2>
            <p className="text-muted text-xs mt-0.5">
              Minimum bill threshold and representative monthly-bill values used in lead
              analytics. The lead-capture form uses fixed bands (Under £80 / £80–120 / £120–200 /
              £200+); these representative amounts are the midpoints stored against each lead
              for downstream analysis.
            </p>
          </div>

          <FieldRow
            label="Minimum monthly bill (disqualifier)"
            hint="Leads who select the 'Under £X' band are disqualified and never routed."
            prefix="£"
            name="min_monthly_bill_gbp"
            defaultValue={s.min_monthly_bill_gbp}
            codeDefault={d.min_monthly_bill_gbp}
            step="1"
            min="0"
          />

          <FieldRow
            label="£80–120 band representative value"
            hint="Monthly-bill estimate stored on leads in this band."
            prefix="£"
            name="bill_band_80_120_rep"
            defaultValue={s.bill_band_80_120_rep}
            codeDefault={d.bill_band_80_120_rep}
            step="1"
            min="80"
          />

          <FieldRow
            label="£120–200 band representative value"
            hint="Monthly-bill estimate stored on leads in this band."
            prefix="£"
            name="bill_band_120_200_rep"
            defaultValue={s.bill_band_120_200_rep}
            codeDefault={d.bill_band_120_200_rep}
            step="1"
            min="120"
          />

          <FieldRow
            label="£200+ band representative value"
            hint="Monthly-bill estimate stored on leads in this band."
            prefix="£"
            name="bill_band_200_plus_rep"
            defaultValue={s.bill_band_200_plus_rep}
            codeDefault={d.bill_band_200_plus_rep}
            step="1"
            min="200"
          />
        </section>

        {/* ── Budget calculator ── */}
        <section className="card divide-y divide-hairline">
          <div className="px-5 py-4">
            <h2 className="font-semibold">Budget calculator inputs</h2>
            <p className="text-muted text-xs mt-0.5">
              Used when estimating how much ad spend is needed to hit a target number of
              appointments (leads ÷ rate = appointments required; appointments × cost-per-lead ÷
              rate = budget).
            </p>
          </div>

          <FieldRow
            label="Estimated cost per lead"
            hint="Average agency cost to acquire one inbound lead."
            prefix="£"
            name="est_cost_per_lead"
            defaultValue={s.est_cost_per_lead}
            codeDefault={d.est_cost_per_lead}
            step="0.01"
            min="0"
          />

          <FieldRow
            label="Lead → appointment rate"
            hint="Percentage of leads that convert to a booked appointment. E.g. 30 means 30%."
            suffix="%"
            name="lead_to_appt_rate"
            defaultValue={+(s.lead_to_appt_rate * 100).toFixed(2)}
            codeDefault={+(d.lead_to_appt_rate * 100).toFixed(2)}
            step="0.1"
            min="0"
            max="100"
          />
        </section>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary">
            Save settings
          </button>
          <span className="text-muted text-xs">Changes apply to new calculations only — past invoices are not affected.</span>
        </div>
      </form>

      {/* Reset to defaults — separate form so it can't fire on Enter in the main form */}
      <section className="card px-5 py-4">
        <h2 className="font-semibold text-sm">Reset to factory defaults</h2>
        <p className="text-muted text-xs mt-0.5">
          Restores all values to the original code defaults. This cannot be undone.
        </p>
        <form action={resetSettings} className="mt-3">
          <button
            type="submit"
            className="btn text-xs px-3 py-1.5 text-bad hover:bg-bad/5 border-bad/30"
          >
            Reset to defaults
          </button>
        </form>
      </section>
    </div>
  );
}

function FieldRow({
  label,
  hint,
  name,
  defaultValue,
  codeDefault,
  prefix,
  suffix,
  step,
  min,
  max,
}: {
  label: string;
  hint: string;
  name: string;
  defaultValue: number;
  codeDefault: number;
  prefix?: string;
  suffix?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  const isChanged = defaultValue !== codeDefault;
  return (
    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <label htmlFor={name} className="text-sm font-medium">
            {label}
          </label>
          {isChanged && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-amber/10 text-amber border-amber/30">
              modified
            </span>
          )}
        </div>
        <p className="text-muted text-xs mt-0.5">{hint}</p>
        <p className="text-muted text-[11px] mt-0.5 num">Default: {codeDefault}{suffix ?? ''}</p>
      </div>
      <div className="flex items-center gap-1.5 sm:pt-0.5">
        {prefix && <span className="text-muted text-sm">{prefix}</span>}
        <input
          id={name}
          name={name}
          type="number"
          defaultValue={defaultValue}
          step={step}
          min={min}
          max={max}
          required
          className="input w-28 num text-right"
        />
        {suffix && <span className="text-muted text-sm">{suffix}</span>}
      </div>
    </div>
  );
}
