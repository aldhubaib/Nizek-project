import type { ModelSchema, NodeValues } from "../types/schema";
import { FieldRenderer } from "./FieldRenderer";

interface Props {
  schema: ModelSchema;
  values: NodeValues;
  onChange: (key: string, value: unknown) => void;
  runs: number;
  onRunsChange: (v: number) => void;
}

export function Sidebar({ schema, values, onChange, runs, onRunsChange }: Props) {
  const totalCost = schema.cost * runs;

  return (
    <div className="w-80 bg-surface-800 border-l border-surface-600 flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-600 flex items-center gap-2.5 shrink-0">
        <span className="text-lg" style={{ color: schema.iconColor }}>{schema.icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-gray-200">{schema.name}</h2>
          <span className="text-[10px] text-surface-400">{schema.provider}</span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          <span className="text-accent-amber">✱</span>
          <span>{schema.cost}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {schema.parameters.map((param) => (
          <FieldRenderer
            key={param.key}
            param={param}
            values={values}
            onChange={onChange}
          />
        ))}
      </div>

      <div className="border-t border-surface-600 px-4 py-3 shrink-0 space-y-3">
        <div className="text-xs text-gray-400 font-medium">Run selected nodes</div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Runs</span>
          <div className="flex items-center gap-0">
            <button
              className="w-7 h-7 flex items-center justify-center text-sm text-gray-400 bg-surface-700 border border-surface-500 rounded-l-md hover:bg-surface-600 transition-colors"
              onClick={() => onRunsChange(Math.max(1, runs - 1))}
            >
              −
            </button>
            <div className="w-8 h-7 flex items-center justify-center text-xs text-gray-200 bg-surface-700 border-y border-surface-500 tabular-nums">
              {runs}
            </div>
            <button
              className="w-7 h-7 flex items-center justify-center text-sm text-gray-400 bg-surface-700 border border-surface-500 rounded-r-md hover:bg-surface-600 transition-colors"
              onClick={() => onRunsChange(Math.min(10, runs + 1))}
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Total cost</span>
          <span className="text-xs text-gray-200">
            <span className="text-accent-amber">✱</span> {totalCost} credits
          </span>
        </div>

        <button className="w-full flex items-center justify-center gap-2 text-sm font-medium text-surface-900 bg-accent-green hover:bg-accent-green/90 rounded-lg py-2.5 transition-colors">
          <span>→</span> Run selected
        </button>
      </div>
    </div>
  );
}
