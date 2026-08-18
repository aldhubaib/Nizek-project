import type { ModelSchema } from "../types/schema";
import {
  SEED_PARAM,
  OUTPUT_FORMAT_PARAM,
  GUIDANCE_SCALE_PARAM,
  NUM_INFERENCE_STEPS_PARAM,
  NUM_IMAGES_PARAM,
  NEGATIVE_PROMPT_PARAM,
  ENABLE_SAFETY_CHECKER_PARAM,
} from "./common-fields";

export const stableDiffusion3: ModelSchema = {
  id: "stable-diffusion-3-medium",
  name: "Stable Diffusion 3",
  provider: "Stability AI",
  icon: "◈",
  iconColor: "#fb7185",
  cost: 6,
  category: "generation",

  inputs: [
    { key: "prompt", label: "Prompt", type: "text", required: true },
    { key: "image", label: "Image", type: "image" },
    { key: "mask", label: "Mask", type: "mask" },
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
        default: "landscape_4_3",
      },
    },
    NUM_IMAGES_PARAM,
    NEGATIVE_PROMPT_PARAM,
    { ...GUIDANCE_SCALE_PARAM, widget: { type: "slider", min: 1, max: 20, step: 0.5, default: 7.5 } },
    { ...NUM_INFERENCE_STEPS_PARAM, widget: { type: "slider", min: 1, max: 100, step: 1, default: 28 } },
    SEED_PARAM,
    {
      key: "scheduler",
      label: "Scheduler",
      widget: {
        type: "dropdown",
        options: ["fm_euler", "dpm_2", "dpm_2_ancestral", "euler", "euler_ancestral", "heun"],
        default: "fm_euler",
      },
      tooltip: "Noise scheduler algorithm",
    },
    {
      key: "clip_skip",
      label: "CLIP Skip",
      widget: { type: "slider", min: 0, max: 4, step: 1, default: 0 },
      tooltip: "Skip last N CLIP layers for different style effects",
    },
    OUTPUT_FORMAT_PARAM,
    ENABLE_SAFETY_CHECKER_PARAM,
    {
      key: "strength",
      label: "Img2Img Strength",
      widget: { type: "slider", min: 0, max: 1, step: 0.05, default: 0.75 },
      tooltip: "How much to transform the input image. 1.0 = fully regenerate.",
    },
  ],
};
