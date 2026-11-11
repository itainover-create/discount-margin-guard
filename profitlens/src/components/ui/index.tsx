"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import {
  createContext, forwardRef, useCallback, useContext, useId, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Button */

type ButtonVariant = "primary" | "gold" | "outline" | "ghost" | "danger";
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", icon && "btn-icon", className)}
      {...props}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-e-transparent" aria-hidden />}
      {children}
    </button>
  );
});

/* ------------------------------------------------------------------ Fields */

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ms-1 font-normal text-muted">(רשות)</span>}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("input", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn("input", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn("input", className)} {...props}>
      {children}
    </select>
  );
});

/** Numeric input with a unit adornment (₪, %, ש׳). Digits are always typed left-to-right. */
export const UnitInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { unit: string }>(function UnitInput(
  { unit, className, ...props },
  ref,
) {
  return (
    <div className="relative">
      <input ref={ref} inputMode="decimal" autoComplete="off" dir="ltr" className={cn("input num pr-11 pl-3 text-left", className)} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted">{unit}</span>
    </div>
  );
});

/* ------------------------------------------------------------------ Badge */

export type Tone = "neutral" | "positive" | "negative" | "warning" | "info" | "gold";
const TONES: Record<Tone, string> = {
  neutral: "bg-navy-900/6 text-ink-2",
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  gold: "bg-gold-100 text-gold-700",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("badge", TONES[tone], className)}>{children}</span>;
}

/* ------------------------------------------------------------------ Card bits */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6", className)}>
      <div className="min-w-0">
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="chip-3d mb-4 size-14">{icon}</div>}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Notice({ tone = "info", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] leading-relaxed", TONES[tone], className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({ value, onChange, items, className }: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-ivory p-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          type="button"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "h-8 cursor-pointer rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition",
            value === item.value ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Dialog */

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Dialog({ open, onOpenChange, title, description, children, size = "md" }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/55 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-line bg-surface shadow-(--shadow-pop) [animation:dialog-in_.22s_ease-out]",
            size === "sm" && "max-w-md",
            size === "md" && "max-w-xl",
            size === "lg" && "max-w-3xl",
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="btn btn-ghost btn-icon btn-sm -me-2" aria-label="סגירה">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>;
}

/* ------------------------------------------------------------------ Confirm */

interface ConfirmOptions {
  title: string;
  text: string;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text to enable the confirm button */
  typeToConfirm?: string;
}
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

/* ------------------------------------------------------------------ Toasts */

interface Toast {
  id: number;
  tone: "positive" | "negative";
  text: string;
}
type ToastFn = (text: string, tone?: Toast["tone"]) => void;
const ToastContext = createContext<ToastFn>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState("");

  const toast = useCallback<ToastFn>((text, tone = "positive") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), tone === "negative" ? 6500 : 3200);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setTyped("");
        setConfirmState({ ...options, resolve });
      }),
    [],
  );

  const close = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <Dialog open={Boolean(confirmState)} onOpenChange={(open) => !open && close(false)} title={confirmState?.title ?? ""} size="sm">
          <div className="flex gap-3">
            {confirmState?.danger && (
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-negative-soft text-negative">
                <AlertTriangle className="size-5" />
              </div>
            )}
            <p className="text-sm leading-relaxed text-ink-2">{confirmState?.text}</p>
          </div>
          {confirmState?.typeToConfirm && (
            <div className="mt-4">
              <label className="label" htmlFor="confirm-typed">
                להמשך, יש להקליד: <b>{confirmState.typeToConfirm}</b>
              </label>
              <Input id="confirm-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              ביטול
            </Button>
            <Button
              variant={confirmState?.danger ? "danger" : "primary"}
              disabled={Boolean(confirmState?.typeToConfirm) && typed.trim() !== confirmState?.typeToConfirm}
              onClick={() => close(true)}
            >
              {confirmState?.confirmLabel ?? "אישור"}
            </Button>
          </DialogFooter>
        </Dialog>
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
          {toasts.map((item) => (
            <div
              key={item.id}
              role={item.tone === "negative" ? "alert" : "status"}
              className={cn(
                "rise-in pointer-events-auto max-w-md rounded-2xl px-4 py-3 text-sm font-medium shadow-(--shadow-pop)",
                item.tone === "negative" ? "bg-negative text-white" : "bg-navy-900 text-gold-200 ring-1 ring-gold-500/40",
              )}
            >
              {item.text}
            </div>
          ))}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
