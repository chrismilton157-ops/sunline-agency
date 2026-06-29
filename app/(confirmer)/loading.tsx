function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-hairline/50 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <Block className="h-8 w-40" />
      <section className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} className="h-20" />
        ))}
      </section>
      <section className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Block key={i} className="h-20" />
        ))}
      </section>
    </div>
  );
}
