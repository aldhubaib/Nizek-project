import type { ModelSchema } from "../types/schema";

interface Props {
  schema: ModelSchema;
  selected: boolean;
  onClick: () => void;
}

const PORT_COLORS: Record<string, string> = {
  text: "#4ade80",
  image: "#c084fc",
  lora: "#c084fc",
  number: "#c084fc",
  mask: "#fbbf24",
  control_image: "#22d3ee",
};

export function NodeCard({ schema, selected, onClick }: Props) {
  return (
    <div
      className={`relative rounded-xl border transition-all cursor-pointer select-none ${
        selected
          ? "border-accent-green/60 shadow-[0_0_20px_rgba(74,222,128,0.1)]"
          : "border-surface-600 hover:border-surface-500"
      }`}
      style={{ width: 320 }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-node-header rounded-t-xl border-b border-surface-600">
        <span className="text-base" style={{ color: schema.iconColor }}>{schema.icon}</span>
        <span className="text-sm font-medium text-gray-200">{schema.name}</span>
        <button className="ml-auto text-surface-400 hover:text-gray-300 text-lg leading-none">···</button>
      </div>

      {/* Body with ports */}
      <div className="bg-node-bg rounded-b-xl py-3">
        <div className="flex justify-between">
          {/* Input ports */}
          <div className="space-y-4 py-2">
            {schema.inputs.map((port) => (
              <div key={port.key} className="flex items-center gap-0 relative">
                <div
                  className="w-3 h-3 rounded-full border-2 -ml-1.5 shrink-0"
                  style={{
                    borderColor: PORT_COLORS[port.type] || "#4ade80",
                    backgroundColor: port.required
                      ? PORT_COLORS[port.type] || "#4ade80"
                      : "transparent",
                  }}
                />
                <span className="text-xs text-gray-400 ml-2.5">
                  {port.label}
                  {port.required && <span className="text-accent-rose">*</span>}
                </span>
              </div>
            ))}
          </div>

          {/* Canvas area placeholder */}
          <div className="flex-1 mx-4 min-h-[120px] rounded-lg bg-[#191d30] border border-surface-700/50" style={{
            backgroundImage: "repeating-conic-gradient(#252a40 0% 25%, transparent 0% 50%)",
            backgroundSize: "16px 16px",
          }} />

          {/* Output ports */}
          <div className="space-y-4 py-2">
            {schema.outputs.map((port) => (
              <div key={port.key} className="flex items-center gap-0 relative">
                <span className="text-xs text-gray-400 mr-2.5">{port.label}</span>
                <div
                  className="w-3 h-3 rounded-full border-2 -mr-1.5 shrink-0"
                  style={{
                    borderColor: PORT_COLORS[port.type] || "#4ade80",
                    backgroundColor: "transparent",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center gap-3 px-4 mt-3 pt-3 border-t border-surface-700/50">
          {schema.inputs.some((p) => p.type === "image") && (
            <button className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors">
              <span className="text-base leading-none">+</span> Add another image input
            </button>
          )}
          <button className="ml-auto text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1.5 bg-surface-700 rounded-md px-3 py-1.5 transition-colors">
            <span>→</span> Run Model
          </button>
        </div>
      </div>
    </div>
  );
}
