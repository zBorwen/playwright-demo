import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-violet-500 text-white hover:bg-violet-400 focus-visible:outline-violet-500',
  secondary: 'bg-zinc-700 text-white hover:bg-zinc-600 focus-visible:outline-zinc-500',
  ghost: 'bg-transparent text-zinc-300 hover:bg-zinc-700 focus-visible:outline-zinc-500',
  danger: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 focus-visible:outline-red-500',
};

export function Button({ variant = 'secondary', loading = false, disabled, children, className = '', ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
