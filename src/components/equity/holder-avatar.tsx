import { cn } from "@/lib/utils";

/** The photo if there is one, the initial if there isn't. */
export function HolderAvatar({
  name,
  photoUrl,
  size = 8,
}: {
  name: string;
  photoUrl: string | null;
  size?: 6 | 8 | 14;
}) {
  const cls =
    size === 14
      ? "w-14 h-14 text-[18px]"
      : size === 6
        ? "w-6 h-6 text-[10px]"
        : "w-8 h-8 text-[12px]";

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={cn(cls, "rounded-full object-cover shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(
        cls,
        "rounded-full bg-primary/15 flex items-center justify-center font-semibold text-primary shrink-0",
      )}
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
