import { cn } from "@/next-ui/lib/cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/next-ui/ui/avatar";

/**
 * A project's logo, or its initial on a muted square when it has none. Size and the initial's
 * type size come from `className` (`size-10`, `size-5 text-[10px]`).
 */
export function ProjectAvatar({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  return (
    <Avatar className={cn("rounded-lg text-sm", className)}>
      {logoUrl && <AvatarImage src={logoUrl} alt="" className="rounded-[inherit] object-cover" />}
      <AvatarFallback className="rounded-[inherit] bg-muted font-semibold text-muted-foreground">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </AvatarFallback>
    </Avatar>
  );
}
