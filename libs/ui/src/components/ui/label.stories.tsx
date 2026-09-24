import type { Meta, StoryObj } from '@storybook/react-vite';

import { Label } from './label';

const meta = {
  title: 'Shadcn/form',
  args: {
    children: 'Shadcn',
  },
  component: (args) => <Label {...args}>{args.children}</Label>,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<React.ComponentPropsWithRef<'label'>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const LabelDemo: Story = {
  args: {},
};
