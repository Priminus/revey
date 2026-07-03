import type { HTMLAttributes, ReactElement } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ hover = false, className = '', ...props }: CardProps): ReactElement {
  return (
    <div
      className={`rounded-[14px] border border-line bg-paper px-6 py-5 ${
        hover ? 'transition-shadow duration-200 ease-[cubic-bezier(.22,.61,.36,1)] hover:shadow-[0_6px_24px_rgba(10,10,10,0.06)]' : ''
      } ${className}`}
      {...props}
    />
  );
}
