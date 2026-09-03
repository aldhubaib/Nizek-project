import { redirect } from "next/navigation";
import { getImpersonation, requireUser } from "@/lib/auth";
import { pendingAgreementFor } from "@/lib/client-agreement";
import { AgreementClient } from "./agreement-client";

/**
 * Where a client is sent until they accept the agreement in force.
 *
 * Lives in the (setup) group rather than (dashboard) so the layout that
 * redirected them here does not run again and bounce them in a loop.
 */
export default async function AgreementPage() {
  const user = await requireUser();

  // The reverse of the gate: staff, and clients who have already accepted,
  // have no business on this page.
  const pending = await pendingAgreementFor(user);
  if (!pending) redirect("/dashboard");

  // Only needed for the banner's name; `pending.preview` is the decision.
  const impersonation = pending.preview ? await getImpersonation() : null;

  return (
    <AgreementClient
      agreement={pending}
      impersonatingAs={impersonation?.targetName ?? null}
    />
  );
}
