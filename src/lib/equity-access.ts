// The Equity module is private. Only the accounts listed here can see the
// sidebar entry, open the pages, or call the server actions.
export const EQUITY_ALLOWED_EMAILS = ["aldhubaib@nizek.com"];

export function canAccessEquity(user: { email: string } | null | undefined): boolean {
  if (!user?.email) return false;
  return EQUITY_ALLOWED_EMAILS.includes(user.email.toLowerCase());
}
