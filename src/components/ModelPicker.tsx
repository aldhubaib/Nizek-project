import type { ModelSchema } from "../types/schema";

interface Props {
  models: ModelSchema[];
  activeId: string;
  onSelect: (id: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  generation: "Generation",
  editing: "Editing",
  upscaling: "Upscaling",
  inpainting: "Inpainting",
};

export function ModelPicker({ models, activeId, onSelect }: Props) {
  const grouped = models.reduce<Record<string, ModelSchema[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="w-56 bg-surface-800 border-r border-surface-600 flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-600 shrink-0">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Models</h2>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="mb-3">
            <div className="px-4 py-1.5 text-[10px] font-semibold text-surface-400 uppercase tracking-wider">
              {CATEGORY_LABELS[cat] || cat}
            </div>
            {items.map((m) => (
              <button
                key={m.id}
                className={`w-full text-left px-4 py-2 flex items-center gap-2.5 transition-colors ${
                  m.id === activeId
                    ? "bg-accent-green/10 text-accent-green"
                    : "text-gray-400 hover:bg-surface-700 hover:text-gray-200"
                }`}
                onClick={() => onSelect(m.id)}
              >
                <span className="text-sm" style={{ color: m.id === activeId ? undefined : m.iconColor }}>
                  {m.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{m.name}</div>
                  <div className="text-[10px] text-surface-400">{m.provider}</div>
                </div>
                <div className="flex items-center gap-0.5 text-[10px] text-surface-400 shrink-0">
                  <span className="text-accent-amber">✱</span>
                  {m.cost}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
