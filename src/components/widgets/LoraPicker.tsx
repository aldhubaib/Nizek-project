interface Props {
  label: string;
  tooltip?: string;
}

export function LoraPicker({ label, tooltip }: Props) {
  return (
    <div className="px-4 py-2.5">
      <label className="text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1.5">
        {label}
        {tooltip && (
          <span className="text-[10px] text-surface-400 cursor-help" title={tooltip}>ⓘ</span>
        )}
      </label>
      <button className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 bg-surface-700 border border-dashed border-surface-500 rounded-md px-3 py-2.5 hover:border-accent-green hover:text-accent-green transition-colors">
        <span className="text-base leading-none">+</span>
        Add another
      </button>
    </div>
  );
}
