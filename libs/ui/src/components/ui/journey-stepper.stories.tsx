import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  JourneyStepper,
  JourneyStepperBar,
  type JourneyStepState,
} from './journey-stepper';

const STEPS = [
  { id: 'identidade', number: '01', label: 'Identidade' },
  { id: 'links', number: '02', label: 'Links' },
  { id: 'preset', number: '03', label: 'Preset' },
] as const;

function ThemePair({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['light', 'dark'] as const).map((theme) => (
        <div key={theme} className={theme === 'dark' ? 'dark' : undefined}>
          <p className="mb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
            {theme}
          </p>
          <div className="rounded-xl border border-border bg-background p-6">
            {children}
          </div>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Brand/JourneyStepper',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
  render: () => {
    const Demo = () => {
      const [active, setActive] = useState(1);
      const [done, setDone] = useState<number[]>([0]);
      const unlockedThrough = Math.max(...done) + 1;

      const stateOf = (index: number): JourneyStepState => {
        if (done.includes(index)) return 'done';
        if (index > unlockedThrough) return 'locked';
        if (index === active) return 'active';
        return 'todo';
      };

      return (
        <ThemePair>
          <JourneyStepper
            aria-label="Progresso da criação"
            className="static"
            steps={STEPS}
            stateOf={stateOf}
            onNavigate={(index) => {
              setActive(index);
              setDone((current) =>
                current.includes(index - 1) || index === 0
                  ? current
                  : [...current, index - 1],
              );
            }}
          />
        </ThemePair>
      );
    };
    return <Demo />;
  },
};

export const States: Story = {
  render: () => {
    const states: JourneyStepState[] = ['done', 'active', 'todo', 'locked'];
    const steps = states.map((state, index) => ({
      id: state,
      number: `0${index + 1}`,
      label: state,
    }));
    return (
      <ThemePair>
        <JourneyStepper
          aria-label="Estados"
          className="static"
          steps={steps}
          stateOf={(index) => states[index]}
          onNavigate={() => undefined}
        />
      </ThemePair>
    );
  },
};

export const Bar: Story = {
  render: () => (
    <ThemePair>
      <JourneyStepperBar
        aria-label="Progresso da criação"
        className="static"
        steps={STEPS}
        stateOf={(index) =>
          index === 0 ? 'done' : index === 1 ? 'active' : 'locked'
        }
        onNavigate={() => undefined}
      />
    </ThemePair>
  ),
};
