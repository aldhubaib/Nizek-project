"use client";

export type GenderChoice = "MALE" | "FEMALE" | "";

export function MemberProfileFields({
  gender,
  onGenderChange,
}: {
  gender: GenderChoice;
  onGenderChange: (value: GenderChoice) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">
        Gender
      </label>
      <select
        value={gender}
        onChange={(e) => onGenderChange(e.target.value as GenderChoice)}
        className="w-full h-9 px-2 rounded-lg border border-border bg-card text-s text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        <option value="">Not set</option>
        <option value="MALE">Male</option>
        <option value="FEMALE">Female</option>
      </select>
    </div>
  );
}
