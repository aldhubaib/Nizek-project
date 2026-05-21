import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
            N
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Nizek Project
          </h1>
        </div>
        <p className="max-w-md text-[13px] text-muted-foreground leading-relaxed">
          Project management for teams. Track tasks, manage contracts, and keep
          your clients in the loop.
        </p>
      </div>
      <div className="flex gap-2">
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground text-[13px] font-medium px-5 py-2 hover:opacity-90 transition-opacity"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-1.5 rounded-full border border-border text-[13px] text-muted-foreground font-medium px-5 py-2 hover:bg-card/60 transition-colors"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}
