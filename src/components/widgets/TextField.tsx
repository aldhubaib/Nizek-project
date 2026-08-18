interface Props {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  tooltip?: string;
  onChange: (v: string) => void;
}

export function TextField({ label, value, placeholder, multiline, tooltip, onChange }: Props) {
  const shared = "w-full bg-surface-700 border border-surface-500 text-gray-200 text-xs rounded-md px-3 py-2 outline-none focus:border-accent-green transition-colors placeholder-surface-400";

  return (
    <div className="px-4 py-2.5">
      <label className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
        {label}
        {tooltip && (
          <span className="text-[10px] text-surface-400 cursor-help" title={tooltip}>ⓘ</span>
        )}
      </label>
      {multiline ? (
        <textarea
          className={`${shared} resize-none`}
          rows={3}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={shared}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
