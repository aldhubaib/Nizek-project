export type FieldWidget =
  | { type: "slider"; min: number; max: number; step: number; default: number }
  | { type: "dropdown"; options: string[]; default: string }
  | { type: "checkbox"; default: boolean }
  | { type: "number"; min?: number; max?: number; default: number }
  | { type: "text"; placeholder?: string; multiline?: boolean; default?: string }
  | { type: "image_upload" }
  | { type: "seed"; default?: number; allowRandom: boolean }
  | { type: "lora_picker"; allowMultiple: boolean }
  | { type: "color"; default?: string };

export interface ParameterDef {
  key: string;
  label: string;
  widget: FieldWidget;
  tooltip?: string;
  group?: string;
  visibility?: {
    dependsOn: string;
    values: unknown[];
  };
}

export interface PortDef {
  key: string;
  label: string;
  type: "text" | "image" | "lora" | "number" | "mask" | "control_image";
  required?: boolean;
}

export interface ModelSchema {
  id: string;
  name: string;
  provider: string;
  icon: string;
  iconColor: string;
  cost: number;
  category: "generation" | "editing" | "upscaling" | "inpainting";
  inputs: PortDef[];
  outputs: PortDef[];
  parameters: ParameterDef[];
}

export type NodeValues = Record<string, unknown>;
