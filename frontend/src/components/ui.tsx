import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { Link, type LinkProps } from "react-router-dom";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageShell({
  children,
  className,
  narrow = false,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 pb-20 pt-8 text-ivory sm:px-6 lg:px-8",
        narrow ? "max-w-4xl" : "max-w-7xl",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-aqua">{eyebrow}</p>
        )}
        <h1 className="font-display text-4xl font-bold tracking-normal text-ivory sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-ivory-muted sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-aqua/70 disabled:cursor-not-allowed disabled:opacity-55";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-aqua text-ink shadow-glow hover:-translate-y-0.5 hover:bg-[#7ce4de]",
  secondary: "border border-ivory/14 bg-ivory/8 text-ivory hover:border-ivory/28 hover:bg-ivory/12",
  ghost: "text-ivory-muted hover:bg-ivory/8 hover:text-ivory",
  danger: "border border-red-400/25 bg-red-500/14 text-red-100 hover:bg-red-500/22",
  success:
    "border border-emerald-300/25 bg-emerald-400/14 text-emerald-100 hover:bg-emerald-400/22",
  warning: "border border-amber-300/25 bg-amber-400/14 text-amber-100 hover:bg-amber-400/22",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-base",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    >
      {Icon && <Icon aria-hidden className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  variant = "primary",
  size = "md",
  icon: Icon,
  className,
  ...props
}: LinkProps & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}) {
  return (
    <Link
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    >
      {Icon && <Icon aria-hidden className="h-4 w-4" />}
      {children}
    </Link>
  );
}

export function ExternalButton({
  children,
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
}) {
  return (
    <a className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)} {...props}>
      {Icon && <Icon aria-hidden className="h-4 w-4" />}
      {children}
    </a>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ivory-muted transition hover:text-ivory"
    >
      <ArrowLeft aria-hidden className="h-4 w-4" />
      {children}
    </Link>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("glass-panel rounded-2xl", className)}>{children}</section>;
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "aqua",
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: LucideIcon;
  tone?: "aqua" | "ember" | "brass" | "fern";
}) {
  const tones = {
    aqua: "text-aqua bg-aqua/10",
    ember: "text-ember bg-ember/10",
    brass: "text-brass bg-brass/10",
    fern: "text-fern bg-fern/10",
  };
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-ivory-muted">
            {label}
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-ivory">{value}</div>
        </div>
        {Icon && (
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-xl",
              tones[tone],
            )}
          >
            <Icon aria-hidden className="h-5 w-5" />
          </span>
        )}
      </div>
      {detail && <div className="mt-2 text-xs text-ivory-muted">{detail}</div>}
    </div>
  );
}

const statusClasses: Record<string, string> = {
  valid: "border-emerald-300/24 bg-emerald-400/14 text-emerald-100",
  ok: "border-emerald-300/24 bg-emerald-400/14 text-emerald-100",
  used: "border-ivory/16 bg-ivory/10 text-ivory-muted",
  scanned: "border-ivory/16 bg-ivory/10 text-ivory-muted",
  refunded: "border-amber-300/24 bg-amber-400/14 text-amber-100",
  pending: "border-amber-300/24 bg-amber-400/14 text-amber-100",
  approved: "border-emerald-300/24 bg-emerald-400/14 text-emerald-100",
  published: "border-emerald-300/24 bg-emerald-400/14 text-emerald-100",
  draft: "border-ivory/16 bg-ivory/10 text-ivory-muted",
  rejected: "border-red-300/24 bg-red-400/14 text-red-100",
  cancelled: "border-red-300/24 bg-red-400/14 text-red-100",
  completed: "border-aqua/24 bg-aqua/14 text-aqua",
  replay: "border-amber-300/24 bg-amber-400/14 text-amber-100",
  invalid: "border-red-300/24 bg-red-400/14 text-red-100",
};

export function StatusPill({
  children,
  status,
  className,
}: {
  children?: ReactNode;
  status: string;
  className?: string;
}) {
  const key = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold capitalize",
        statusClasses[key] ?? "border-ivory/16 bg-ivory/10 text-ivory-muted",
        className,
      )}
    >
      {children ?? status}
    </span>
  );
}

export function TextInput({
  label,
  icon: Icon,
  className,
  inputClassName,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  icon?: LucideIcon;
  inputClassName?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-ivory-muted">
          {label}
        </span>
      )}
      <span className="relative block">
        {Icon && (
          <Icon
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ivory-muted"
          />
        )}
        <input
          className={cn(
            "w-full rounded-xl border border-ivory/12 bg-ink-2/78 px-3.5 py-2.5 text-sm text-ivory placeholder:text-ivory-muted/55 outline-none transition focus:border-aqua/70 focus:bg-ink-2",
            Icon && "pl-9",
            inputClassName,
          )}
          {...props}
        />
      </span>
    </label>
  );
}

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput icon={Search} {...props} />;
}

export function TextareaInput({
  label,
  className,
  textareaClassName,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  textareaClassName?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.18em] text-ivory-muted">
          {label}
        </span>
      )}
      <textarea
        className={cn(
          "w-full rounded-xl border border-ivory/12 bg-ink-2/78 px-3.5 py-2.5 text-sm text-ivory placeholder:text-ivory-muted/55 outline-none transition focus:border-aqua/70 focus:bg-ink-2",
          textareaClassName,
        )}
        {...props}
      />
    </label>
  );
}

export function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-ivory-muted">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 truncate text-sm font-semibold text-ivory",
          mono && "font-mono text-base",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-panel mx-auto mt-10 max-w-xl rounded-2xl p-8 text-center">
      <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-aqua" />
      <h2 className="font-display text-2xl font-bold text-ivory">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ivory-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-8 text-sm font-semibold text-ivory-muted">
      <Loader2 aria-hidden className="h-4 w-4 animate-spin text-aqua" />
      {label}
    </div>
  );
}

export function ErrorState({ label }: { label: string }) {
  return (
    <div className="m-8 rounded-2xl border border-red-300/24 bg-red-400/12 px-4 py-3 text-sm font-semibold text-red-100">
      {label}
    </div>
  );
}

export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-ivory/12 bg-ink-2/72 shadow-2xl">
      {children}
    </div>
  );
}
