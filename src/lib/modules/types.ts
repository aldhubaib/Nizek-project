/**
 * The shapes the module engine (flows, stages, records) hands to the UI.
 *
 * Plain types, no server code, so client components can import them without
 * pulling a server action module along.
 */

export type RecordPersonDTO = {
  id: string;
  name: string | null;
  imageUrl: string | null;
};

/** One record on a module flow — a card on a project Board. */
export type RecordDTO = {
  id: string;
  recordNumber: number;
  title: string;
  flowId: string;
  stageId: string | null;
  fieldValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy?: RecordPersonDTO;
  assignee?: RecordPersonDTO | null;
};

/** A flow as the module pages list it. */
export type FlowDTO = {
  id: string;
  name: string;
  position: number;
  stageCount: number;
  recordCount: number;
  layoutId: string | null;
  blueprintEnabled: boolean;
};
