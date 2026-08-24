export default function ProjectLoading() {
  return (
    <div className="animate-pulse p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded bg-muted" />
        <div className="h-5 w-40 rounded bg-muted" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-64 space-y-3">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-24 rounded-lg bg-muted" />
            <div className="h-24 rounded-lg bg-muted" />
            <div className="h-24 rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
