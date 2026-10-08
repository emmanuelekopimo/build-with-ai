import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../lib/cn';

export type ButtonVariant =
  | 'primary' // green filled pill
  | 'secondary' // green outline pill ("Export", "Return", "View")
  | 'outline' // white, gray border, small radius ("Generate report", "Save draft", "Filter")
  | 'danger' // red outline pill ("Reject", "Discard draft", "Sign out", "Delete")
  | 'warning' // amber outline pill ("Report damage", "Retire")
  | 'ghost'; // text only

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55 select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'rounded-pill bg-brand text-white shadow-4 hover:bg-brand-hover focus-visible:ring-brand',
  secondary: 'rounded-pill border-2 border-brand bg-white text-brand hover:bg-green-100 focus-visible:ring-brand',
  outline:
    'rounded-sm border border-gray-200 bg-white font-medium text-gray-700 shadow-1 hover:bg-gray-50 hover:text-gray-900 focus-visible:ring-brand',
  danger: 'rounded-pill border-2 border-red bg-white text-red hover:bg-red-light focus-visible:ring-red',
  warning: 'rounded-pill border-2 border-amber bg-white text-amber hover:bg-amber-light focus-visible:ring-amber',
  ghost: 'rounded-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-brand',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-8 px-4 text-sm',
  sm: 'h-9 px-4 text-sm',
  md: 'h-10 px-5 text-md',
  lg: 'h-11 px-7 text-md',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-sm border border-gray-200 bg-white text-gray-500 shadow-1 hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
