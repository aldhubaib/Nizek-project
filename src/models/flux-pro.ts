import type { ModelSchema } from "../types/schema";
import { SEED_PARAM, OUTPUT_FORMAT_PARAM } from "./common-fields";

export const fluxPro11: ModelSchema = {
  id: "flux-pro-1.1",
  name: "Flux Pro 1.1",
  provider: "Black Forest Labs",
  icon: "△",
  iconColor: "#fbbf24",
  cost: 5,
  category: "generation",

  inputs: [
    { key: "prompt", label: "Prompt", type: "text", required: true },
    { key: "image_prompt", label: "Image Prompt", type: "image" },
  ],

  outputs: [{ key: "result", label: "Result", type: "image" }],

  parameters: [
    {
      key: "aspect_ratio",
      label: "Aspect Ratio",
      widget: {
        type: "dropdown",
        options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "9:21"],
        default: "1:1",
      },
      tooltip: "Aspect ratio of the generated image",
    },
    {
      key: "width",
      label: "Width",
      widget: { type: "slider", min: 256, max: 1440, step: 32, default: 256 },
      tooltip: "Width in pixels. Overrides aspect ratio if set.",
    },
    {
      key: "height",
      label: "Height",
      widget: { type: "slider", min: 256, max: 1440, step: 32, default: 256 },
      tooltip: "Height in pixels. Overrides aspect ratio if set.",
    },
    {
      key: "safety_tolerance",
      label: "Safety Tolerance",
      widget: { type: "slider", min: 1, max: 6, step: 1, default: 6 },
      tooltip: "1 = strictest, 6 = most permissive",
    },
    SEED_PARAM,
    {
      key: "prompt_upsampling",
      label: "Prompt Upsampling",
      widget: { type: "checkbox", default: true },
      tooltip: "Automatically enhance short prompts for better results",
    },
    OUTPUT_FORMAT_PARAM,
    {
      key: "output_quality",
      label: "Output Quality",
      widget: { type: "slider", min: 1, max: 100, step: 1, default: 80 },
      tooltip: "JPEG/WebP quality. Ignored for PNG.",
      visibility: { dependsOn: "output_format", values: ["jpeg", "webp"] },
    },
  ],
};
