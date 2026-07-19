"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  helperText?: string;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  return (
    <label className="block" htmlFor={inputId}>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="relative mt-1.5 block">
        <input
          id={inputId}
          className="h-12 w-full rounded-xl border border-border bg-[#fcfbf8] px-3.5 pr-12 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary-emphasis focus:bg-background focus:ring-4 focus:ring-primary/15"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
      {helperText && (
        <span className="mt-1.5 block text-xs text-muted-foreground">
          {helperText}
        </span>
      )}
    </label>
  );
}
