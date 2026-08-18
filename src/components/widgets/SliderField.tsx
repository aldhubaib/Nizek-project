import { useState, useRef, useEffect } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tooltip?: string;
  onChange: (v: number) => void;
}

export function SliderField({ label, value, min, max, step, tooltip, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const pct = ((value - min) / (max - min)) * 100;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commitDraft() {
    const n = parseFloat(draft);
    if (!isNaN(n)) {
      onChange(Math.min(max, Math.max(min, Math.round(n / step) * step)));
    }
    setEditing(false);
  }

  return (
    <div className="group px-4 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
          {label}
          {tooltip && (
            <span className="text-[10px] text-surface-400 cursor-help" title={tooltip}>ⓘ</span>
          )}
        </label>
        {editing ? (
          <input
            ref={inputRef}
            className="w-16 text-right text-xs bg-surface-700 border border-surface-500 rounded px-1.5 py-0.5 text-gray-200 outline-none focus:border-accent-green"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => e.key === "Enter" && commitDraft()}
          />
        ) : (
          <button
            className="text-xs text-gray-200 bg-surface-700 rounded px-2 py-0.5 hover:bg-surface-600 transition-colors tabular-nums min-w-[3rem] text-right"
            onClick={() => { setDraft(String(value)); setEditing(true); }}
          >
            {step < 1 ? value.toFixed(1) : value}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
        style={{
          background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${pct}%, #334466 ${pct}%, #334466 100%)`,
        }}
      />
    </div>
  );
}
