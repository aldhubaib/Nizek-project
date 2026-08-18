import type { ParameterDef, NodeValues } from "../types/schema";
import { SliderField } from "./widgets/SliderField";
import { DropdownField } from "./widgets/DropdownField";
import { CheckboxField } from "./widgets/CheckboxField";
import { SeedField } from "./widgets/SeedField";
import { TextField } from "./widgets/TextField";
import { LoraPicker } from "./widgets/LoraPicker";

interface Props {
  param: ParameterDef;
  values: NodeValues;
  onChange: (key: string, value: unknown) => void;
}

export function FieldRenderer({ param, values, onChange }: Props) {
  if (param.visibility) {
    const depValue = values[param.visibility.dependsOn];
    if (!param.visibility.values.includes(depValue)) return null;
  }

  const w = param.widget;

  switch (w.type) {
    case "slider":
      return (
        <SliderField
          label={param.label}
          value={(values[param.key] as number) ?? w.default}
          min={w.min}
          max={w.max}
          step={w.step}
          tooltip={param.tooltip}
          onChange={(v) => onChange(param.key, v)}
        />
      );

    case "dropdown":
      return (
        <DropdownField
          label={param.label}
          value={(values[param.key] as string) ?? w.default}
          options={w.options}
          tooltip={param.tooltip}
          onChange={(v) => onChange(param.key, v)}
        />
      );

    case "checkbox":
      return (
        <CheckboxField
          label={param.label}
          value={(values[param.key] as boolean) ?? w.default}
          tooltip={param.tooltip}
          onChange={(v) => onChange(param.key, v)}
        />
      );

    case "seed":
      return (
        <SeedField
          label={param.label}
          value={(values[param.key] as number) ?? Math.floor(Math.random() * 999999)}
          isRandom={(values[`${param.key}_random`] as boolean) ?? true}
          tooltip={param.tooltip}
          onChange={(v) => onChange(param.key, v)}
          onRandomChange={(v) => onChange(`${param.key}_random`, v)}
        />
      );

    case "text":
      return (
        <TextField
          label={param.label}
          value={(values[param.key] as string) ?? w.default ?? ""}
          placeholder={w.placeholder}
          multiline={w.multiline}
          tooltip={param.tooltip}
          onChange={(v) => onChange(param.key, v)}
        />
      );

    case "lora_picker":
      return <LoraPicker label={param.label} tooltip={param.tooltip} />;

    case "number":
      return (
        <SliderField
          label={param.label}
          value={(values[param.key] as number) ?? w.default}
          min={w.min ?? 0}
          max={w.max ?? 100}
          step={1}
          tooltip={param.tooltip}
          onChange={(v) => onChange(param.key, v)}
        />
      );

    case "image_upload":
    case "color":
      return null;

    default:
      return null;
  }
}
