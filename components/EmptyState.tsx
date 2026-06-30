import type { ReactNode } from 'react';

type Preset =
  | 'queue'
  | 'clients'
  | 'appointments'
  | 'leads'
  | 'leaderboard'
  | 'log'
  | 'alerts'
  | 'generic';

const ICONS: Record<Preset, ReactNode> = {
  queue: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#E07B39" fillOpacity={0.08} />
      <path d="M13 20h14M20 13v14" stroke="#E07B39" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="20" cy="20" r="5" stroke="#E07B39" strokeWidth="2"/>
    </svg>
  ),
  clients: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#E07B39" fillOpacity={0.08} />
      <circle cx="16" cy="16" r="4" stroke="#E07B39" strokeWidth="2"/>
      <path d="M8 30c0-4.418 3.582-8 8-8h8c4.418 0 8 3.582 8 8" stroke="#E07B39" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="26" cy="14" r="3" stroke="#E07B39" strokeWidth="1.5"/>
    </svg>
  ),
  appointments: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#2E9E6B" fillOpacity={0.08} />
      <rect x="11" y="12" width="18" height="18" rx="3" stroke="#2E9E6B" strokeWidth="2"/>
      <path d="M15 8v4M25 8v4M11 19h18" stroke="#2E9E6B" strokeWidth="2" strokeLinecap="round"/>
      <path d="M15 24l3 3 7-7" stroke="#2E9E6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  leads: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#E07B39" fillOpacity={0.08} />
      <path d="M12 28V20a8 8 0 1116 0v8" stroke="#E07B39" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10 28h20" stroke="#E07B39" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="20" cy="16" r="2" fill="#E07B39"/>
    </svg>
  ),
  leaderboard: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#E07B39" fillOpacity={0.08} />
      <rect x="10" y="22" width="5" height="8" rx="1" fill="#E07B39" fillOpacity={0.4}/>
      <rect x="17.5" y="17" width="5" height="13" rx="1" fill="#E07B39" fillOpacity={0.7}/>
      <rect x="25" y="20" width="5" height="10" rx="1" fill="#E07B39" fillOpacity={0.4}/>
      <circle cx="20" cy="12" r="3" stroke="#E07B39" strokeWidth="2"/>
    </svg>
  ),
  log: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#6B7178" fillOpacity={0.1} />
      <path d="M14 14h12M14 19h12M14 24h8" stroke="#6B7178" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  alerts: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#2E9E6B" fillOpacity={0.1} />
      <circle cx="20" cy="20" r="7" stroke="#2E9E6B" strokeWidth="2"/>
      <path d="M15 20l3.5 3.5L26 16" stroke="#2E9E6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  generic: (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#E8E6DF" />
      <circle cx="20" cy="20" r="4" stroke="#6B7178" strokeWidth="2"/>
      <path d="M20 10v3M20 27v3M10 20h3M27 20h3" stroke="#6B7178" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
};

interface Props {
  preset?: Preset;
  icon?: ReactNode;
  heading: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ preset = 'generic', icon, heading, body, action, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
      <div className="mb-4 animate-fade-in">
        {icon ?? ICONS[preset]}
      </div>
      <h3 className="font-semibold text-ink text-sm">{heading}</h3>
      {body && <p className="text-muted text-xs mt-1 max-w-xs leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
