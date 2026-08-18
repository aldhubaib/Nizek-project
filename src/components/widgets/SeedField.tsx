import { useState, useRef, useEffect } from "react";

interface Props {
  label: string;
  value: number;
  isRandom: boolean;
  tooltip?: string;
  onChange: (v: number) => void;
  onRandomChange: (v: boolean) => void;
}

export function SeedField({ label, value, isRandom, tooltip, onChange, onRandomChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commitDraft() {
    const n = parseInt(draft);
    if (!isNaN(n) && n >= 0) onChange(n);
    setEditing(false);
  }

  function randomize() {
    onChange(Math.floor(Math.random() * 999999));
  }

  return (
    <div className="px-4 py-2.5">
      <label className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
        {label}
        {tooltip && (
          <span className="text-[10px] text-surface-400 cursor-help" title={tooltip}>ⓘ</span>
        )}
      </label>
      <div className="flex items-center gap-2">
        <button
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
            isRandom
              ? "bg-accent-green/15 text-accent-green border border-accent-green/30"
              : "bg-surface-700 text-gray-400 border border-surface-500 hover:border-surface-400"
          }`}
          onClick={() => {
            onRandomChange(!isRandom);
            if (!isRandom) randomize();
          }}
        >
          <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${
            isRandom ? "bg-accent-green border-accent-green" : "border-surface-400"
          }`}>
            {isRandom && (
              <svg width="7" height="6" viewBox="0 0 10 8" fill="none" stroke="#1a1a2e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4l3 3 5-6" />
              </svg>
            )}
          </span>
          Random
        </button>
        {editing ? (
          <input
            ref={inputRef}
            className="flex-1 text-right text-xs bg-surface-700 border border-surface-500 rounded px-2 py-1 text-gray-200 outline-none focus:border-accent-green tabular-nums"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => e.key === "Enter" && commitDraft()}
          />
        ) : (
          <button
            className={`flex-1 text-right text-xs rounded px-2 py-1 tabular-nums transition-colors ${
              isRandom
                ? "bg-surface-700/50 text-gray-500 border border-surface-600"
                : "bg-surface-700 text-gray-200 border border-surface-500 hover:bg-surface-600"
            }`}
            onClick={() => { if (!isRandom) { setDraft(String(value)); setEditing(true); } }}
            disabled={isRandom}
          >
            {value}
          </button>
        )}
      </div>
    </div>
  );
}
