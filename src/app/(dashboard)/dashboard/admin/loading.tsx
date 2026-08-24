export default function AdminLoading() {
  return (
    <div className="animate-pulse px-app py-6 space-y-6">
      <div className="h-6 w-32 rounded bg-muted" />
      <div className="h-10 w-full rounded bg-muted" />
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
