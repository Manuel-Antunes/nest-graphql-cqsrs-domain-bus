import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

type InputProps = React.ComponentProps<typeof Input>;

const meta = {
  title: 'Shadcn/input',
  component: (args) => <Input {...args} />,
  args: {
    type: 'text',
  },
  argTypes: {
    type: {
      control: { type: 'select' },
      options: [
        'file',
        'email',
        'password',
        'text',
        'checkbox',
        'radio',
        ' date',
        'datetime-local',
        'email',
        'hidden',
        'image',
        'month',
        'number',
        'password',
        'range',
        'reset',
        'search',
        'submit',
        'tel',
        'time',
        'url',
        'week',
      ],
    },
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<InputProps>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InputDefault: Story = {
  args: {
    type: 'text',
    placeholder: 'Name',
  },
};

export const InputFile: Story = {
  args: {},
  render: (args) => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="picture">Picture</Label>
      <Input id="picture" type="file" {...args} />
    </div>
  ),
};

export const InputDisabled: Story = {
  args: {
    disabled: true,
  },
  render: (args) => <Input type="email" placeholder="Email" {...args} />,
};

export const InputWithLabel: Story = {
  args: {},
  render: (args) => (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="Email" />
    </div>
  ),
};

export const InputWithButton: Story = {
  args: {},
  render: (args) => (
    <div className="flex w-full max-w-sm items-center space-x-2">
      <Input type="email" placeholder="Email" />
      <Button type="submit">Subscribe</Button>
    </div>
  ),
};
