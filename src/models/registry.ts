import type { ModelSchema } from "../types/schema";
import { fluxPro11 } from "./flux-pro";
import { qwenImageEdit } from "./qwen-image-edit";
import { sdxlLightning } from "./sdxl-lightning";
import { stableDiffusion3 } from "./stable-diffusion-3";
import { realEsrgan } from "./real-esrgan";

export const MODEL_REGISTRY: ModelSchema[] = [
  fluxPro11,
  qwenImageEdit,
  sdxlLightning,
  stableDiffusion3,
  realEsrgan,
];

export function getModel(id: string): ModelSchema | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function getDefaultValues(schema: ModelSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const param of schema.parameters) {
    if ("default" in param.widget) {
      values[param.key] = param.widget.default;
    }
    if (param.widget.type === "seed") {
      values[param.key] = Math.floor(Math.random() * 999999);
      values[`${param.key}_random`] = true;
    }
  }
  return values;
}
