import type { ButtonHTMLAttributes, ReactElement } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-paid text-paper hover:bg-paid-deep disabled:hover:bg-paid',
  secondary:
    'bg-paper text-ink border border-line hover:bg-inset disabled:hover:bg-paper',
  ghost: 'bg-transparent text-muted hover:text-ink',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonProps): ReactElement {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] px-4 py-2 text-sm font-semibold transition-colors duration-200 ease-[cubic-bezier(.22,.61,.36,1)] disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
