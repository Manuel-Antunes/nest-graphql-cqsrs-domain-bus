'use client';

import { cn } from '@nestposts/ui/lib/utils';
import { Check, Lock } from 'lucide-react';
import type { MotionValue } from 'motion/react';
import { motion } from 'motion/react';

export interface JourneyStep {
  id: string;
  number: string;
  label: string;
}

export type JourneyStepState = 'done' | 'active' | 'todo' | 'locked';

const STATE_TEXT: Record<JourneyStepState, string> = {
  done: 'concluída',
  active: 'etapa atual',
  todo: 'pendente',
  locked: 'bloqueada',
};

export interface JourneyStepperProps {
  steps: readonly JourneyStep[];
  stateOf: (index: number) => JourneyStepState;
  onNavigate: (index: number) => void;
  progress?: MotionValue<number>;
  'aria-label': string;
  className?: string;
}

function stateNodeClass(state: JourneyStepState): string {
  switch (state) {
    case 'done':
      return 'border-brand bg-brand text-brand-foreground shadow-[0_0_16px_rgb(var(--brand-glow-rgb)/0.35)]';
    case 'active':
      return 'border-brand bg-brand-soft text-brand-accent';
    case 'todo':
      return 'border-brand-subtle bg-brand-soft/50 text-brand-accent group-hover:border-brand';
    case 'locked':
      return 'border-border bg-muted text-muted-foreground/70';
  }
}

function stateLabelClass(state: JourneyStepState): string {
  switch (state) {
    case 'done':
    case 'active':
      return 'text-foreground';
    case 'locked':
      return 'text-muted-foreground/70';
    case 'todo':
      return 'text-muted-foreground';
  }
}

export function JourneyStepper({
  steps,
  stateOf,
  onNavigate,
  progress,
  'aria-label': ariaLabel,
  className,
}: JourneyStepperProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn('sticky top-28 flex flex-col py-2', className)}
    >
      <span
        aria-hidden
        className="absolute top-6 bottom-6 left-[19px] w-px bg-brand-subtle"
      />
      {progress ? (
        <motion.span
          aria-hidden
          style={{ scaleY: progress }}
          className="absolute top-6 bottom-6 left-[19px] w-px origin-top bg-gradient-to-b from-brand to-brand-strong"
        />
      ) : null}

      <ol className="flex flex-col gap-12">
        {steps.map((step, index) => {
          const state = stateOf(index);
          const locked = state === 'locked';
          return (
            <li key={step.id} className="relative z-10">
              <button
                type="button"
                disabled={locked}
                aria-current={state === 'active' ? 'step' : undefined}
                onClick={() => onNavigate(index)}
                className={cn(
                  'group flex w-full items-center gap-3 text-left',
                  locked ? 'cursor-not-allowed' : 'cursor-pointer',
                  'focus-visible:outline-none',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full border font-semibold text-[12px] transition-all duration-500',
                    'group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2',
                    stateNodeClass(state),
                  )}
                >
                  {state === 'done' ? (
                    <Check className="size-4" />
                  ) : state === 'locked' ? (
                    <Lock className="size-3.5" />
                  ) : (
                    step.number
                  )}
                </span>
                <span
                  className={cn(
                    'font-semibold text-[11px] uppercase tracking-[0.15em] transition-colors duration-500',
                    stateLabelClass(state),
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">{` — ${STATE_TEXT[state]}`}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function JourneyStepperBar({
  steps,
  stateOf,
  onNavigate,
  progress,
  'aria-label': ariaLabel,
  className,
}: JourneyStepperProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'sticky top-0 z-30 border-border/70 border-b bg-card/80 backdrop-blur-md',
        className,
      )}
    >
      <div className="flex items-center gap-4 px-5 py-3">
        <ol className="flex items-center gap-2">
          {steps.map((step, index) => {
            const state = stateOf(index);
            const locked = state === 'locked';
            return (
              <li key={step.id}>
                <button
                  type="button"
                  disabled={locked}
                  aria-current={state === 'active' ? 'step' : undefined}
                  onClick={() => onNavigate(index)}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border font-semibold text-[10px] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    stateNodeClass(state),
                  )}
                >
                  <span aria-hidden>
                    {state === 'done' ? (
                      <Check className="size-3" />
                    ) : (
                      step.number
                    )}
                  </span>
                  <span className="sr-only">{`${step.label} — ${STATE_TEXT[state]}`}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div
          aria-hidden
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-brand-subtle"
        >
          {progress ? (
            <motion.div
              style={{ scaleX: progress }}
              className="absolute inset-0 origin-left rounded-full bg-brand"
            />
          ) : null}
        </div>
      </div>
    </nav>
  );
}
