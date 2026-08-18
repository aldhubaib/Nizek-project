import type { ModelSchema } from "../types/schema";
import { OUTPUT_FORMAT_PARAM } from "./common-fields";

export const realEsrgan: ModelSchema = {
  id: "real-esrgan-x4",
  name: "Real-ESRGAN x4",
  provider: "Tencent ARC",
  icon: "▲",
  iconColor: "#22d3ee",
  cost: 2,
  category: "upscaling",

  inputs: [
    { key: "image", label: "Image", type: "image", required: true },
  ],

  outputs: [{ key: "result", label: "Result", type: "image" }],

  parameters: [
    {
      key: "scale",
      label: "Upscale Factor",
      widget: {
        type: "dropdown",
        options: ["2", "4"],
        default: "4",
      },
      tooltip: "Upscaling multiplier",
    },
    {
      key: "face_enhance",
      label: "Face Enhancement",
      widget: { type: "checkbox", default: false },
      tooltip: "Apply GFPGAN face restoration",
    },
    OUTPUT_FORMAT_PARAM,
    {
      key: "output_quality",
      label: "Output Quality",
      widget: { type: "slider", min: 1, max: 100, step: 1, default: 95 },
      visibility: { dependsOn: "output_format", values: ["jpeg", "webp"] },
    },
  ],
};
