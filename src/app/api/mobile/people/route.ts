import { getMessageableMembers } from "@/actions/messages";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** Staff directory for starting a direct message. Clients get an empty list. */
export const GET = mobileRoute(async () => {
  const people = await getMessageableMembers();
  return {
    people: people.map((person) => ({
      id: person.id,
      name: person.name ?? person.email,
      email: person.email,
      imageUrl: person.imageUrl,
    })),
  };
});
