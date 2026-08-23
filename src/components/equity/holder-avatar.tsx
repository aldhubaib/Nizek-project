import { Avatar, AvatarImage, AvatarFallback, type AvatarSize } from "@/components/ui/avatar";

const LEGACY_SIZE_MAP: Record<6 | 8 | 14, AvatarSize> = {
  6: "sm",
  8: "md",
  14: "xl",
};

export function HolderAvatar({
  name,
  photoUrl,
  size = 8,
}: {
  name: string;
  photoUrl: string | null;
  size?: 6 | 8 | 14;
}) {
  return (
    <Avatar size={LEGACY_SIZE_MAP[size]}>
      {photoUrl && <AvatarImage src={photoUrl} alt="" />}
      <AvatarFallback className="bg-primary/15 font-semibold text-primary">
        {name.trim()[0]?.toUpperCase() ?? "?"}
      </AvatarFallback>
    </Avatar>
  );
}
