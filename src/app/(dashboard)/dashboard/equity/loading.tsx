export default function EquityLoading() {
  return (
    <div className="animate-pulse px-app py-6 space-y-6">
      <div className="h-6 w-40 rounded bg-muted" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
