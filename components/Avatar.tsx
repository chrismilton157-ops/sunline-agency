// Circular avatar: shows a photo if avatarUrl is set, else initials.
// Used on the leaderboard podium, ranking table, and owner Setters screen.

type RingColor = 'amber' | 'bad' | null;

type Props = {
  avatarUrl: string | null;
  initials: string;
  /** Tailwind size classes e.g. 'w-14 h-14 text-lg' */
  sizeCls: string;
  ring?: RingColor;
  /** Amber tint background for rank-1; default is grey */
  rankFirst?: boolean;
};

export function Avatar({ avatarUrl, initials, sizeCls, ring, rankFirst }: Props) {
  const ringCls =
    ring === 'amber' ? 'ring-2 ring-amber ring-offset-2' :
    ring === 'bad'   ? 'ring-2 ring-bad ring-offset-2'   : '';

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={initials}
        className={`${sizeCls} rounded-full object-cover shrink-0 ${ringCls}
          ${rankFirst ? '' : 'bg-hairline/40'}`}
      />
    );
  }

  return (
    <div
      className={`${sizeCls} rounded-full flex items-center justify-center font-bold shrink-0
        ${ringCls}
        ${rankFirst ? 'bg-amber/20 text-amber' : 'bg-hairline/40 text-muted'}`}
    >
      {initials}
    </div>
  );
}
