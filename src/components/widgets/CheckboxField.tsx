interface Props {
  label: string;
  value: boolean;
  tooltip?: string;
  onChange: (v: boolean) => void;
}

export function CheckboxField({ label, value, tooltip, onChange }: Props) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between">
      <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5 cursor-pointer select-none">
        {label}
        {tooltip && (
          <span className="text-[10px] text-surface-400 cursor-help" title={tooltip}>ⓘ</span>
        )}
      </label>
      <button
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
          value
            ? "bg-accent-green border-accent-green"
            : "bg-transparent border-surface-400 hover:border-surface-300"
        }`}
        onClick={() => onChange(!value)}
      >
        {value && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l3 3 5-6" />
          </svg>
        )}
      </button>
    </div>
  );
}
