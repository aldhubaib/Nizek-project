"use client";

import { createContext, useContext } from "react";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
  imageUrl: string | null;
}

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: React.ReactNode;
}) {
  return (
    <CurrentUserContext value={user}>
      {children}
    </CurrentUserContext>
  );
}

export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}
