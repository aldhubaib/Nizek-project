"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";
import { Button } from "@/next-ui/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/next-ui/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuItem } from "@/next-ui/ui/sidebar";

/**
 * The signed-in user in the sidebar footer: a one-line pill (round avatar, name, chevron)
 * opening the e-mail and Sign out.
 */
export function UserMenu({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const initial = (name || email || "?").slice(0, 1).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full justify-start gap-2 rounded-full pr-2 pl-1 data-[state=open]:bg-accent"
            >
              <Avatar className="size-6 shrink-0">
                <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
                <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                {name}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" side="top" align="start" sideOffset={4}>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signingOut}
              onSelect={async () => {
                setSigningOut(true);
                await authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/sign-in") },
                });
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
