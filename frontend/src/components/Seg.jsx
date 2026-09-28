// Pill segmented control. `options` is [{value, label, icon?}] or plain strings.
export default function Seg({ options, value, onChange, label, size, className = "" }) {
  return (
    <div className={`seg ${size === "lg" ? "seg-lg" : ""} ${className}`} role="group" aria-label={label}>
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
