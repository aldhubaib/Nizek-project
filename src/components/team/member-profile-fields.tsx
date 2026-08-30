"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type GenderChoice = "MALE" | "FEMALE" | "";

export function MemberProfileFields({
  gender,
  onGenderChange,
  excludeFromAlias,
  onExcludeFromAliasChange,
  excludeLocked = false,
}: {
  gender: GenderChoice;
  onGenderChange: (value: GenderChoice) => void;
  excludeFromAlias: boolean;
  onExcludeFromAliasChange: (value: boolean) => void;
  /** When true, Exclude from Alias stays on and cannot be turned off (client role). */
  excludeLocked?: boolean;
}) {
  const excludeOn = excludeLocked || excludeFromAlias;
  return (
    <>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Gender *
        </label>
        <select
          required
          value={gender}
          onChange={(e) => onGenderChange(e.target.value as GenderChoice)}
          className="w-full h-9 px-2 rounded-lg border border-border bg-card text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        >
          <option value="" disabled>
            Select gender
          </option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
      </div>
      <button
        type="button"
        disabled={excludeLocked}
        onClick={() => onExcludeFromAliasChange(!excludeOn)}
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 text-s font-medium transition-colors w-full",
          excludeOn
            ? "bg-primary/15 border-primary/30 text-primary"
            : "border-border text-muted-foreground hover:border-muted-foreground/40",
          excludeLocked && "cursor-not-allowed opacity-80",
        )}
      >
        <div
          className={cn(
            "w-4 h-4 rounded-sm border flex items-center justify-center transition-colors",
            excludeOn ? "bg-primary border-primary" : "border-muted-foreground/40",
          )}
        >
          {excludeOn && (
            <Check className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
          )}
        </div>
        Exclude from Alias
      </button>
    </>
  );
}
