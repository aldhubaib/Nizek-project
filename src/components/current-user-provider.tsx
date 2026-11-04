"use client";

import { createContext, useContext } from "react";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
}

const CurrentUserContext = createContext<CurrentUser | null>(null);
// True while an admin is on "view as". Read-state writes (mark thread read,
// close banners) are skipped client-side so the admin's browsing never looks
// like the viewed person reading their own messages.
const ImpersonationContext = createContext<boolean>(false);

export function CurrentUserProvider({
  user,
  impersonating = false,
  children,
}: {
  user: CurrentUser | null;
  impersonating?: boolean;
  children: React.ReactNode;
}) {
  return (
    <CurrentUserContext value={user}>
      <ImpersonationContext value={impersonating}>{children}</ImpersonationContext>
    </CurrentUserContext>
  );
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}

/** Whether the shell is in admin "view as" mode (see ImpersonationBanner). */
export function useIsImpersonating(): boolean {
  return useContext(ImpersonationContext);
}
