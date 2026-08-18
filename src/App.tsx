import { useState, useCallback, useMemo } from "react";
import { MODEL_REGISTRY, getModel, getDefaultValues } from "./models/registry";
import { ModelPicker } from "./components/ModelPicker";
import { NodeCard } from "./components/NodeCard";
import { Sidebar } from "./components/Sidebar";
import type { NodeValues } from "./types/schema";

function App() {
  const [activeModelId, setActiveModelId] = useState(MODEL_REGISTRY[0].id);
  const [allValues, setAllValues] = useState<Record<string, NodeValues>>(() => {
    const init: Record<string, NodeValues> = {};
    for (const m of MODEL_REGISTRY) {
      init[m.id] = getDefaultValues(m);
    }
    return init;
  });
  const [runs, setRuns] = useState(1);

  const schema = useMemo(() => getModel(activeModelId)!, [activeModelId]);
  const values = allValues[activeModelId] ?? {};

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      setAllValues((prev) => ({
        ...prev,
        [activeModelId]: { ...prev[activeModelId], [key]: value },
      }));
    },
    [activeModelId],
  );

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left: Model picker */}
      <ModelPicker
        models={MODEL_REGISTRY}
        activeId={activeModelId}
        onSelect={setActiveModelId}
      />

      {/* Center: Canvas with node */}
      <div className="flex-1 bg-surface-900 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-10 border-b border-surface-600 flex items-center px-4 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-xs text-surface-400">Tasks</span>
            <span className="text-xs text-gray-500">|</span>
            <span className="text-xs text-gray-200 font-medium">No active runs</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-surface-400">
              <span className="text-accent-amber">✱</span> 24.5
            </span>
            <button className="text-[11px] text-gray-300 bg-surface-700 rounded px-2.5 py-1 hover:bg-surface-600 transition-colors">
              Share
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div
          className="flex-1 relative overflow-auto"
          style={{
            backgroundImage: `
              radial-gradient(circle, #2a3050 1px, transparent 1px)
            `,
            backgroundSize: "24px 24px",
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <NodeCard
              schema={schema}
              selected={true}
              onClick={() => {}}
            />
          </div>

          {/* Bottom toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface-800 border border-surface-600 rounded-lg px-2 py-1.5 shadow-lg">
            <button className="w-7 h-7 flex items-center justify-center rounded text-accent-green hover:bg-surface-700 transition-colors">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 8a.5.5 0 0 1 .5-.5h5v-5a.5.5 0 0 1 1 0v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5A.5.5 0 0 1 1 8z" />
              </svg>
            </button>
            <button className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:bg-surface-700 transition-colors">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0V2.5A.5.5 0 0 1 8 2z" />
              </svg>
            </button>
            <div className="w-px h-5 bg-surface-600 mx-1" />
            <button className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:bg-surface-700 transition-colors text-xs">↩</button>
            <button className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:bg-surface-700 transition-colors text-xs">↪</button>
            <div className="w-px h-5 bg-surface-600 mx-1" />
            <span className="text-xs text-gray-500 px-1 tabular-nums">86%</span>
          </div>
        </div>
      </div>

      {/* Right: Dynamic sidebar */}
      <Sidebar
        schema={schema}
        values={values}
        onChange={handleFieldChange}
        runs={runs}
        onRunsChange={setRuns}
      />
    </div>
  );
}

export default App;
