import type { ModelSchema } from "../types/schema";
import {
  SEED_PARAM,
  OUTPUT_FORMAT_PARAM,
  NUM_IMAGES_PARAM,
  ENABLE_SAFETY_CHECKER_PARAM,
  NEGATIVE_PROMPT_PARAM,
} from "./common-fields";

export const sdxlLightning: ModelSchema = {
  id: "sdxl-lightning-4step",
  name: "SDXL Lightning",
  provider: "Stability AI",
  icon: "⚡",
  iconColor: "#60a5fa",
  cost: 3,
  category: "generation",

  inputs: [
    { key: "prompt", label: "Prompt", type: "text", required: true },
    { key: "image", label: "Image", type: "image" },
  ],

  outputs: [{ key: "result", label: "Result", type: "image" }],

  parameters: [
    {
      key: "image_size",
      label: "Image Size",
      widget: {
        type: "dropdown",
        options: [
          "square_hd",
          "square",
          "portrait_4_3",
          "portrait_16_9",
          "landscape_4_3",
          "landscape_16_9",
        ],
        default: "square_hd",
      },
    },
    NUM_IMAGES_PARAM,
    NEGATIVE_PROMPT_PARAM,
    {
      key: "num_inference_steps",
      label: "Num Inference Steps",
      widget: { type: "dropdown", options: ["1", "2", "4", "8"], default: "4" },
      tooltip: "Lightning model optimized for 1-8 steps",
    },
    {
      key: "guidance_scale",
      label: "Guidance Scale",
      widget: { type: "slider", min: 0, max: 5, step: 0.1, default: 1.0 },
      tooltip: "Low values recommended for Lightning models",
    },
    SEED_PARAM,
    OUTPUT_FORMAT_PARAM,
    ENABLE_SAFETY_CHECKER_PARAM,
    {
      key: "expand_prompt",
      label: "Expand Prompt",
      widget: { type: "checkbox", default: false },
      tooltip: "Use GPT to enhance your prompt before generation",
    },
  ],
};
