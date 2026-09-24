import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

function ThemePair({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} className={theme === 'dark' ? 'dark' : undefined}>
          <p className="mb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
            {theme}
          </p>
          <div
            className={`overflow-hidden rounded-xl border border-border bg-background p-6 text-foreground ${className ?? ''}`}
          >
            {children}
          </div>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Brand/Overview',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The Gêmeo identity as design-system primitives. Every panel is shown in both themes; anything that only works in one is a bug.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SWATCHES = [
  {
    token: 'brand',
    swatch: 'bg-brand',
    role: 'The identity blue. Accents, active states, focus.',
  },
  {
    token: 'brand-strong',
    swatch: 'bg-brand-strong',
    role: 'One step deeper. Gradient ends, hover.',
  },
  {
    token: 'brand-soft',
    swatch: 'bg-brand-soft',
    role: 'Tinted surface: chips, step nodes, icon tiles.',
  },
  {
    token: 'brand-subtle',
    swatch: 'bg-brand-subtle',
    role: 'Hairlines and tracks on a tinted surface.',
  },
  {
    token: 'brand-accent',
    swatch: 'bg-brand-accent',
    role: 'Text and icons drawn ON brand-soft.',
  },
  {
    token: 'brand-solid',
    swatch: 'bg-brand-solid',
    role: 'The single heavy call to action per screen.',
  },
  {
    token: 'brand-wash-warm',
    swatch: 'bg-brand-wash-warm',
    role: 'Illustrative wash — the knowledge hero.',
  },
  {
    token: 'brand-wash-blush',
    swatch: 'bg-brand-wash-blush',
    role: 'Its second stop.',
  },
] as const;

export const Tokens: Story = {
  render: () => (
    <ThemePair>
      <div className="grid gap-3">
        {SWATCHES.map(({ token, swatch, role }) => (
          <div key={token} className="flex items-center gap-3">
            <span
              className={`size-10 shrink-0 rounded-lg border border-border ${swatch}`}
            />
            <span className="min-w-0">
              <code className="font-semibold text-[12px]">{token}</code>
              <span className="block text-[12px] text-muted-foreground">
                {role}
              </span>
            </span>
          </div>
        ))}
      </div>
    </ThemePair>
  ),
};

export const Canvas: Story = {
  render: () => (
    <ThemePair className="p-0">
      <div className="gemeo-canvas relative bg-background p-6 text-foreground">
        <div className="gemeo-dot-grid pointer-events-none absolute inset-0" />
        <div className="gemeo-aura pointer-events-none absolute -top-16 -right-16 size-56" />
        <div className="relative space-y-4">
          <h3 className="font-semibold text-lg tracking-tight">
            Um painel na canvas
          </h3>
          <div className="gemeo-glass rounded-2xl p-4">
            <Label className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
              Nome
            </Label>
            <Input className="mt-1.5 rounded-xl" placeholder="Ex.: Ana" />
            <Button variant="brand" className="mt-4 w-full rounded-full">
              Continuar
            </Button>
          </div>
        </div>
      </div>
    </ThemePair>
  ),
};

export const Glass: Story = {
  render: () => (
    <ThemePair className="relative">
      <div className="gemeo-aura pointer-events-none absolute top-0 -left-10 size-64" />
      <div className="relative space-y-3">
        <div className="gemeo-glass rounded-2xl p-4 text-sm">
          <code>gemeo-glass</code> — the hero panel
        </div>
        <div className="gemeo-glass-subtle rounded-2xl p-4 text-sm">
          <code>gemeo-glass-subtle</code> — everything beside it
        </div>
      </div>
    </ThemePair>
  ),
};

export const Gradients: Story = {
  render: () => (
    <ThemePair>
      <div className="space-y-4">
        <p className="gemeo-text-gradient-hero font-semibold text-3xl tracking-tight">
          Crie seu Gêmeo.
        </p>
        <p className="gemeo-text-gradient-blue font-semibold text-3xl tracking-tight">
          Vaz ID
        </p>
        <p className="gemeo-serif text-3xl italic">Mota Advogados</p>
        <p className="text-[12px] text-muted-foreground">
          <code>gemeo-text-gradient-hero</code>,{' '}
          <code>gemeo-text-gradient-blue</code>, <code>gemeo-serif</code>
        </p>
      </div>
    </ThemePair>
  ),
};

export const Actions: Story = {
  render: () => (
    <ThemePair>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="brand">Criar Gêmeo</Button>
        <Button variant="brand" className="rounded-full px-8">
          Entrar
        </Button>
        <Button variant="brandSoft">Pular por agora</Button>
        <span className="gemeo-glow flex size-9 items-center justify-center rounded-[10px] bg-brand-solid font-bold text-brand-solid-foreground text-xs">
          V
        </span>
      </div>
    </ThemePair>
  ),
};

export const Shimmer: Story = {
  render: () => (
    <ThemePair>
      <div className="gemeo-shimmer-border rounded-2xl border border-border p-5 text-sm">
        Seção ativa
      </div>
    </ThemePair>
  ),
};
