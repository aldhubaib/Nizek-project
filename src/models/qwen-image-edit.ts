import type { ModelSchema } from "../types/schema";
import {
  SEED_PARAM,
  OUTPUT_FORMAT_PARAM,
  GUIDANCE_SCALE_PARAM,
  NUM_INFERENCE_STEPS_PARAM,
  NUM_IMAGES_PARAM,
  ENABLE_SAFETY_CHECKER_PARAM,
} from "./common-fields";

export const qwenImageEdit: ModelSchema = {
  id: "qwen-image-edit-2511",
  name: "Qwen Image Edit 2511",
  provider: "Qwen",
  icon: "✦",
  iconColor: "#c084fc",
  cost: 10,
  category: "editing",

  inputs: [
    { key: "prompt", label: "Prompt", type: "text", required: true },
    { key: "image_1", label: "Image 1", type: "image" },
    { key: "negative_prompt", label: "Negative Prompt", type: "text" },
    { key: "lora", label: "Lora", type: "lora" },
    { key: "lora_strength", label: "Lora Strength", type: "number" },
  ],

  outputs: [{ key: "result", label: "Result", type: "image" }],

  parameters: [
    SEED_PARAM,
    {
      key: "loras",
      label: "Loras",
      widget: { type: "lora_picker", allowMultiple: true },
      tooltip: "LoRA adapters to apply",
    },
    {
      key: "image_size",
      label: "Image Size",
      widget: {
        type: "dropdown",
        options: [
          "Match Input Image",
          "square_hd",
          "square",
          "portrait_4_3",
          "portrait_16_9",
          "landscape_4_3",
          "landscape_16_9",
        ],
        default: "Match Input Image",
      },
      tooltip: "Output image resolution",
    },
    NUM_IMAGES_PARAM,
    {
      key: "acceleration",
      label: "Acceleration",
      widget: {
        type: "dropdown",
        options: ["regular", "turbo"],
        default: "regular",
      },
      tooltip: "Turbo mode for faster but slightly lower quality results",
    },
    OUTPUT_FORMAT_PARAM,
    { ...GUIDANCE_SCALE_PARAM, widget: { type: "slider", min: 1, max: 20, step: 0.5, default: 4.5 } },
    { ...NUM_INFERENCE_STEPS_PARAM, widget: { type: "slider", min: 1, max: 100, step: 1, default: 28 } },
    ENABLE_SAFETY_CHECKER_PARAM,
  ],
};
