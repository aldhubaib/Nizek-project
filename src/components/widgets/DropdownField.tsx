interface Props {
  label: string;
  value: string;
  options: string[];
  tooltip?: string;
  onChange: (v: string) => void;
}

export function DropdownField({ label, value, options, tooltip, onChange }: Props) {
  return (
    <div className="px-4 py-2.5">
      <label className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
        {label}
        {tooltip && (
          <span className="text-[10px] text-surface-400 cursor-help" title={tooltip}>ⓘ</span>
        )}
      </label>
      <div className="relative">
        <select
          className="w-full appearance-none bg-surface-700 border border-surface-500 text-gray-200 text-xs rounded-md px-3 py-2 pr-8 outline-none focus:border-accent-green transition-colors cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
            <path d="M0 0l5 6 5-6z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
