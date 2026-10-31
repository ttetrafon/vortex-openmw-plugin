import React from "react";

interface ISelectProps {
  value: string;
  options: string[];
  disabled: boolean;
  noneLabel: string;
  onChange: (value: string) => void;
}

export default function ValueSelect(props: ISelectProps) {
  const { value, options, disabled, noneLabel, onChange } = props;
  // keep a value whose group/subgroup was deleted visible, so it can still be seen and cleared
  const all = value !== "" && !options.includes(value) ? [value, ...options] : options;
  return (
    <select
      className="form-control"
      value={value}
      disabled={disabled}
      onChange={(evt) => onChange(evt.target.value)}
      // don't let clicks select/open the row
      onClick={(evt) => evt.stopPropagation()}
    >
      <option value="">{noneLabel}</option>
      {all.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
