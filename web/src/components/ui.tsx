import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-white text-red-700 border border-red-300 hover:bg-red-50 disabled:text-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300',
};

export function Button({
  variant = 'primary',
  className = '',
  title,
  disabledReason,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; disabledReason?: string }) {
  return (
    <button
      type="button"
      title={props.disabled && disabledReason ? disabledReason : title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ to, children, variant = 'primary', disabled, disabledReason }: {
  to: string;
  children: ReactNode;
  variant?: Variant;
  disabled?: boolean;
  disabledReason?: string;
}) {
  if (disabled) {
    return (
      <Button variant={variant} disabled disabledReason={disabledReason}>
        {children}
      </Button>
    );
  }
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium shadow-sm transition ${VARIANTS[variant]}`}
    >
      {children}
    </Link>
  );
}

export function Card({ title, description, children, actions }: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
};

export function Badge({ color = 'gray', children }: { color?: keyof typeof BADGE; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent ${BADGE[color]}`}>
      {children}
    </span>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'info' | 'success' | 'warning'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  }[kind];
  return <div className={`rounded-md border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number }).status;
  return (
    <Alert kind="error">
      {message}
      {status === 403 && (
        <span className="block pt-1 text-red-700">Your Google Cloud IAM roles do not allow this. Ask a project admin for access.</span>
      )}
    </Alert>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label}
    </div>
  );
}

/**
 * A labelled form control. The label wraps a single control so it is associated without ids;
 * pass `group` when the children hold several controls (radio groups, pickers).
 */
export function Field({ label, hint, children, htmlFor, group }: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  group?: boolean;
}) {
  if (group || htmlFor) {
    return (
      <div role={group ? 'group' : undefined} aria-label={group ? label : undefined}>
        {htmlFor ? (
          <label className="label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="label">{label}</span>
        )}
        {children}
        {hint && <p className="hint">{hint}</p>}
      </div>
    );
  }
  return (
    <div>
      <label className="block">
        <span className="label">{label}</span>
        {children}
      </label>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
}

export function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative mt-2 overflow-hidden rounded-md border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 text-xs text-slate-400">
        <span>{language}</span>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-slate-300 hover:bg-slate-700"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, busy }: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <div className="mt-2 text-sm text-slate-600">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
