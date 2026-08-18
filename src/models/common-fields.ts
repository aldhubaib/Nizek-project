import type { ParameterDef } from "../types/schema";

export const SEED_PARAM: ParameterDef = {
  key: "seed",
  label: "Seed",
  widget: { type: "seed", allowRandom: true },
  tooltip: "Random seed for reproducible results",
};

export const OUTPUT_FORMAT_PARAM: ParameterDef = {
  key: "output_format",
  label: "Output Format",
  widget: {
    type: "dropdown",
    options: ["png", "jpeg", "webp"],
    default: "png",
  },
  tooltip: "Format of the output image",
};

export const GUIDANCE_SCALE_PARAM: ParameterDef = {
  key: "guidance_scale",
  label: "Guidance Scale",
  widget: { type: "slider", min: 1, max: 20, step: 0.5, default: 7.5 },
  tooltip: "How closely to follow the prompt. Higher = more literal.",
};

export const NUM_INFERENCE_STEPS_PARAM: ParameterDef = {
  key: "num_inference_steps",
  label: "Num Inference Steps",
  widget: { type: "slider", min: 1, max: 100, step: 1, default: 28 },
  tooltip: "More steps = higher quality but slower",
};

export const NUM_IMAGES_PARAM: ParameterDef = {
  key: "num_images",
  label: "Num Images",
  widget: { type: "slider", min: 1, max: 4, step: 1, default: 1 },
  tooltip: "Number of images to generate",
};

export const NEGATIVE_PROMPT_PARAM: ParameterDef = {
  key: "negative_prompt",
  label: "Negative Prompt",
  widget: {
    type: "text",
    placeholder: "Things to avoid...",
    multiline: true,
    default: "",
  },
  tooltip: "Describe what you don't want in the image",
};

export const ENABLE_SAFETY_CHECKER_PARAM: ParameterDef = {
  key: "enable_safety_checker",
  label: "Enable Safety Checker",
  widget: { type: "checkbox", default: true },
};
