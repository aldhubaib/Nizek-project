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

export function UserMenu({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

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

  const goToAccount = () => {
    onNavigate?.();
    router.push("/dashboard/account");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full items-center gap-s rounded-lg p-1 text-start outline-none transition-colors hover:bg-card/60",
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
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-56"
          positionerClassName="z-[700]"
        >
          <DropdownMenuItem
            className="h-auto cursor-pointer items-start gap-s py-1.5"
            onClick={goToAccount}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer gap-s"
            onClick={goToAccount}
          >
            <UserCog className="h-4 w-4" />
            Manage account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="gap-s"
            onClick={() => {
              onNavigate?.();
              setSignOutOpen(true);
            }}
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
    </>
  );
}
