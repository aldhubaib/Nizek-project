"use client";

import { Input } from "@/components/ui/input";
import { UrlBrandIcon } from "@/components/fields/url-icon";
import {
  URL_ICON_PLACEHOLDER,
  type UrlIconId,
} from "@/lib/fields/url-config";
import { cn } from "@/lib/utils";

export function UrlField({
  value,
  onChange,
  icon,
}: {
  value: string;
  onChange: (next: string) => void;
  icon: UrlIconId | null;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute inset-y-0 start-2.5 flex items-center text-muted-foreground">
          <UrlBrandIcon id={icon} className="size-3.5" />
        </span>
      )}
      <Input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={icon ? URL_ICON_PLACEHOLDER[icon] : "https://"}
        className={cn(icon && "ps-8")}
      />
    </div>
  );
}
