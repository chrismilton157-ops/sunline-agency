function Block({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-hairline/50 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-8">
      <Block className="h-8 w-48" />
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Block key={i} className="h-20" />
        ))}
      </section>
      <section className="card p-5 space-y-3">
        <Block className="h-5 w-40" />
        <Block className="h-64" />
      </section>
      <section className="card overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Block key={i} className="h-12 m-2" />
        ))}
      </section>
    </div>
  );
}
