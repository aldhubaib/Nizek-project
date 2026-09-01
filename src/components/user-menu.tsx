"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/current-user-provider";
import { authClient } from "@/lib/auth-client";
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

function useAccountIdentity() {
  const user = useCurrentUser();
  const email = user?.email ?? "";
  const name = user?.name ?? email ?? "You";
  const img = user?.imageUrl;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
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

  return { name, email, avatar };
}

/**
 * The account rows on their own, so surfaces that already own a menu (the chat
 * header's overflow button) can host them instead of adding a second trigger.
 * The host renders SignOutDialog, since a dialog inside the menu would unmount
 * with it.
 */
export function AccountMenuItems({
  profileLabel = "Manage account",
  onProfile,
  onSignOut,
}: {
  /** Pass null where the identity row alone is enough to reach the profile. */
  profileLabel?: string | null;
  onProfile: () => void;
  /** Omit where signing out lives elsewhere, such as inside the profile. */
  onSignOut?: () => void;
}) {
  const { name, email, avatar } = useAccountIdentity();

  return (
    <>
      <DropdownMenuItem
        className="h-auto cursor-pointer items-start gap-s py-1.5"
        onClick={onProfile}
      >
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
      </DropdownMenuItem>
      {profileLabel ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer gap-s" onClick={onProfile}>
            <UserCog className="h-4 w-4" />
            {profileLabel}
          </DropdownMenuItem>
        </>
      ) : null}
      {onSignOut ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="gap-s"
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}

export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            onClick={() => onOpenChange(false)}
            disabled={signingOut}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await authClient.signOut({
                fetchOptions: { onSuccess: () => router.push("/sign-in") },
              });
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
  );
}

export function UserMenu({
  collapsed = false,
  onNavigate,
  variant = "sidebar",
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  variant?: "sidebar" | "header";
}) {
  const router = useRouter();
  const { name, email, avatar } = useAccountIdentity();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const goToAccount = () => {
    onNavigate?.();
    router.push("/dashboard/account");
  };

  const header = variant === "header";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center text-start outline-none transition-colors",
            header
              ? "rounded-full p-0.5 hover:bg-card/60"
              : "w-full gap-s rounded-lg p-1 hover:bg-card/60",
            !header && collapsed && "justify-center",
          )}
        >
          {avatar(header ? "h-8 w-8" : "h-7 w-7")}
          {!header && !collapsed && (
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
        <DropdownMenuContent
          side={header ? "bottom" : "top"}
          align={header ? "end" : "start"}
          className="w-56"
        >
          <AccountMenuItems
            onProfile={goToAccount}
            onSignOut={() => {
              onNavigate?.();
              setSignOutOpen(true);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </>
  );
}
