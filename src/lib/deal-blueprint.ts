/**
 * Compatibility type for native deal fields on the blueprint.
 * New code should import from `@/lib/fields/types`.
 */
import { NATIVE_DEAL_FIELDS } from "@/lib/fields/types";

export type DealBlueprintFieldId = (typeof NATIVE_DEAL_FIELDS)[number]["id"];
