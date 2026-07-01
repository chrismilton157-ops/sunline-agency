'use client';
import { useState, useTransition } from 'react';
import type { Pipeline } from '@/lib/types';
import { PIPELINE_LABEL, PIPELINE_SHORT } from '@/lib/setter-cadence';
import { setPipelinePref } from '@/app/(setter)/queue/actions';

type PipelineRow = {
  pipeline: Pipeline;
  total: number;
  servable: number;
  callback_count: number;
};

type ActiveSetter = {
  setter_id: string;
  setter_email: string;
  lead_id: string;
  lead_name: string | null;
  lead_pipeline: Pipeline;
  no_answer_count: number;
  claimed_at: string;
  pipeline_pref: Pipeline | null;
};

type SetterPref = {
  id: string;
  email: string;
  queue_pipeline_pref: Pipeline | null;
};

interface Props {
  pipelines: PipelineRow[];
  activeSetters: ActiveSetter[];
  setterPrefs: SetterPref[];
}

const PIPELINE_COLORS: Record<Pipeline, string> = {
  1: 'text-amber border-amber/30 bg-amber/5',
  2: 'text-blue-600 border-blue-200 bg-blue-50',
  3: 'text-muted border-hairline bg-bg',
};

export function PipelinesClient({ pipelines, activeSetters, setterPrefs }: Props) {
  const [isPending, startTransition] = useTransition();
  const [localPrefs, setLocalPrefs] = useState<Record<string, Pipeline | null>>(
    Object.fromEntries(setterPrefs.map((s) => [s.id, s.queue_pipeline_pref])),
  );

  function handleDirectSetter(setterId: string, pipeline: Pipeline | null) {
    setLocalPrefs((prev) => ({ ...prev, [setterId]: pipeline }));
    startTransition(async () => {
      await setPipelinePref(pipeline, setterId);
    });
  }

  return (
    <div className="space-y-8">
      {/* Pipeline cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pipelines.map((p) => (
          <div
            key={p.pipeline}
            className={`card px-5 py-4 border ${PIPELINE_COLORS[p.pipeline]}`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide mb-1">
              {PIPELINE_LABEL[p.pipeline]}
            </div>
            <div className="text-3xl font-bold num mt-1">{p.total}</div>
            <div className="text-xs text-muted mt-1 space-y-0.5">
              <div>
                <span className="text-good font-medium">{p.servable}</span> servable now
              </div>
              {p.callback_count > 0 && (
                <div>
                  <span className="text-amber font-medium">{p.callback_count}</span> personal callbacks
                </div>
              )}
              <div className="text-muted">
                {p.total - p.servable} locked / in gap / maxed today
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Active setters */}
      {activeSetters.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink mb-3">Currently calling</h2>
          <div className="space-y-2">
            {activeSetters.map((s) => (
              <div key={s.setter_id} className="card px-4 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.setter_email}</div>
                  <div className="text-xs text-muted mt-0.5">
                    on <span className="text-ink">{s.lead_name ?? 'Unknown'}</span>
                    {' · '}
                    <span className={`font-medium
                      ${s.lead_pipeline === 1 ? 'text-amber'
                        : s.lead_pipeline === 2 ? 'text-blue-600'
                        : 'text-muted'}`}>
                      {PIPELINE_SHORT[s.lead_pipeline]}
                    </span>
                    {s.no_answer_count > 0 && (
                      <span className="ml-2 text-amber">{s.no_answer_count}× no answer</span>
                    )}
                  </div>
                </div>
                <div className="text-[10px] text-muted num shrink-0">
                  since {new Date(s.claimed_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Setter pipeline direction */}
      {setterPrefs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink mb-1">Direct setters</h2>
          <p className="text-xs text-muted mb-3">
            Set which pipeline each setter draws from. &ldquo;Auto&rdquo; = system picks best available (P1→P2→P3).
          </p>
          <div className="space-y-2">
            {setterPrefs.map((s) => (
              <div key={s.id} className="card px-4 py-3 flex items-center gap-4">
                <div className="flex-1 text-sm font-medium truncate">{s.email}</div>
                <div className="flex items-center gap-1.5">
                  {([null, 1, 2, 3] as const).map((p) => (
                    <button
                      key={String(p)}
                      type="button"
                      onClick={() => handleDirectSetter(s.id, p as Pipeline | null)}
                      disabled={isPending}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors
                        ${localPrefs[s.id] === p
                          ? 'bg-amber text-white border-amber'
                          : 'bg-bg text-muted border-hairline hover:border-ink/30'
                        }`}
                    >
                      {p === null ? 'Auto' : `P${p}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
