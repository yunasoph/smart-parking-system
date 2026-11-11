import React from 'react';

export default function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
  ariaLabelledby,
  id
}) {
  return (
    <div
      className="seg"
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      id={id}
    >
      {options.map((opt) => {
        const val = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label : opt;
        return (
          <button
            key={val}
            type="button"
            aria-pressed={value === val}
            onClick={() => onChange(val)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
