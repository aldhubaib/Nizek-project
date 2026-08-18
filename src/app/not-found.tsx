import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-background">
      <div className="text-center max-w-sm">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <span className="text-m font-bold text-muted-foreground">404</span>
          </div>
        </div>
        <h1 className="text-s font-semibold text-foreground mb-1.5">Page not found</h1>
        <p className="text-s text-muted-foreground mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-s font-medium px-4 py-2 hover:opacity-90 transition-opacity"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
