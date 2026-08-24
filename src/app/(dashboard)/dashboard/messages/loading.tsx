export default function MessagesLoading() {
  return (
    <div className="flex h-dvh min-h-0">
      <div className="w-80 border-r border-border animate-pulse p-4 space-y-3">
        <div className="h-8 w-full rounded bg-muted" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-muted" />
              <div className="h-3 w-48 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1" />
    </div>
  );
}
