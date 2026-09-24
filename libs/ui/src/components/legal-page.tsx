import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

export function LegalPage({
  title,
  updatedAt,
  backHref = '/',
  backLabel = 'Voltar',
  footer,
  className,
  children,
  Link,
}: {
  title: string;
  updatedAt: string;
  backHref?: string;
  backLabel?: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
  Link: React.FC<{
    href: string;
    children: ReactNode;
    className?: string;
  }>;
}) {
  return (
    <div
      className={cn(
        'gemeo-canvas relative min-h-svh bg-background text-foreground antialiased',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="gemeo-dot-grid absolute inset-0" />
        <div className="gemeo-aura absolute -top-40 -right-40 size-[520px] [--gemeo-aura-strength:0.07]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 py-14 sm:px-8">
        <Link
          href={backHref}
          className="group inline-flex items-center gap-2 font-medium text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg
            className="size-4 transition-transform duration-300 group-hover:-translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 17l-5-5m0 0l5-5m-5 5h12"
            />
          </svg>
          {backLabel}
        </Link>

        <h1 className="mt-8 font-semibold text-[clamp(2rem,4vw,2.8rem)] tracking-[-0.03em]">
          {title}
        </h1>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Última atualização: {updatedAt}
        </p>

        <div className="mt-10 space-y-8 text-[15px] text-muted-foreground leading-[1.75] [&_a]:text-brand-accent [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:font-semibold [&_h2]:text-[17px] [&_h2]:text-foreground [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:space-y-1.5">
          {children}
        </div>

        {footer ? (
          <div className="mt-16 border-border/70 border-t pt-8">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
