import React from 'react';
import './FormInputs.css';

/* ── FormField ──────────────────────────────────────────── */

export interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, error, children }: FormFieldProps) {
  return (
    <div className="fi-field">
      <label className="fi-label">
        {label}{required && <span className="fi-required">*</span>}
      </label>
      {children}
      {error && <span className="fi-error">{error}</span>}
    </div>
  );
}

/* ── TextInput ──────────────────────────────────────────── */

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function TextInput({ error, className = '', ...props }: TextInputProps) {
  return (
    <input
      className={`fi-input${error ? ' fi-input--error' : ''} ${className}`}
      {...props}
    />
  );
}

/* ── NumberInput ────────────────────────────────────────── */

export interface NumberInputProps {
  value: string | number;
  onChange: (val: string) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

export function NumberInput({ value, onChange, error, ...props }: NumberInputProps) {
  return (
    <input
      type="number"
      className={`fi-input fi-input--mono${error ? ' fi-input--error' : ''}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      {...props}
    />
  );
}

/* ── SelectInput ────────────────────────────────────────── */

export interface SelectOption { value: string; label: string; }

export interface SelectInputProps {
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
}

export function SelectInput({ value, onChange, options, placeholder, disabled, error }: SelectInputProps) {
  return (
    <select
      className={`fi-input fi-select${error ? ' fi-input--error' : ''}`}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/* ── RadioGroup ─────────────────────────────────────────── */

export interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (val: string) => void;
  options: SelectOption[];
}

export function RadioGroup({ name, value, onChange, options }: RadioGroupProps) {
  return (
    <div className="fi-radio-group">
      {options.map(o => (
        <label key={o.value} className={`fi-radio-label${value === o.value ? ' active' : ''}`}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="fi-radio-input"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/* ── TextareaInput ──────────────────────────────────────── */

export interface TextareaInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function TextareaInput({ error, className = '', ...props }: TextareaInputProps) {
  return (
    <textarea
      className={`fi-input fi-textarea${error ? ' fi-input--error' : ''} ${className}`}
      {...props}
    />
  );
}
