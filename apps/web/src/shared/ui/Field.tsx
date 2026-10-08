import { cloneElement, type ReactElement } from 'react';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}

export function Field({ id, label, hint, error, required, children }: FieldProps) {
  const description =
    [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span className="field-required"> · Обязательно</span>}
      </label>
      {cloneElement(children, {
        id,
        'aria-describedby': description,
        'aria-invalid': Boolean(error),
      })}
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
