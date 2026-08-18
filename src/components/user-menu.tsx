"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { UserCog, LogOut, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Custom account menu that replaces Clerk's branded <UserButton> popup.
 * Matches the app's design: avatar trigger, a "Manage account" entry (opens
 * Clerk's profile modal) and a "Sign out" action guarded by a confirm dialog.
 */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName ?? email ?? "You";
  const img = user?.imageUrl;
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "U"
    : "U";

  const avatar = (size: string) =>
    img ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={img}
        alt={name}
        className={cn("shrink-0 rounded-full object-cover", size)}
      />
    ) : (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary",
          size,
        )}
      >
        {initials}
      </span>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg p-1 text-start outline-none transition-colors hover:bg-card/60",
            collapsed && "justify-center",
          )}
        >
          {avatar("h-7 w-7")}
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-s font-medium text-foreground">
                {name}
              </span>
              {email && (
                <span className="block truncate text-xs text-muted-foreground">
                  {email}
                </span>
              )}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            {avatar("h-8 w-8")}
            <div className="min-w-0">
              <div className="truncate text-s font-medium text-foreground">
                {name}
              </div>
              {email && (
                <div className="truncate text-xs text-muted-foreground">
                  {email}
                </div>
              )}
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2.5"
            onClick={() => router.push("/dashboard/account")}
          >
            <UserCog className="h-4 w-4" />
            Manage account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="gap-2.5"
            onClick={() => setSignOutOpen(true)}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out of your account?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setSignOutOpen(false)}
              disabled={signingOut}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                void signOut({ redirectUrl: "/sign-in" });
              }}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
