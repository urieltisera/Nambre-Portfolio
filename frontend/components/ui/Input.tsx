import React, {forwardRef} from "react";
import {cn} from "@/lib/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  hint?: string;
  label?: string;
  rightSlot?: React.ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {className, hint, label, rightSlot, ...props},
  ref,
) {
  return (
    <label className="field">
      {label ? <span className="field__label">{label}</span> : null}
      <span className={cn("field__control", rightSlot ? "field__control--with-slot" : "")}>
        <input className={cn("ui-input", className)} ref={ref} {...props} />
        {rightSlot ? <span className="field__slot">{rightSlot}</span> : null}
      </span>
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
});
