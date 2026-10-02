import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DelegationCard } from './delegation-card';

describe('DelegationCard', () => {
  it('renders what the agent answered as markdown', () => {
    render(
      <DelegationCard
        agentName="posts agent"
        task="List my posts"
        said={
          'You have **two** posts:\n\n| Title | Version |\n| --- | --- |\n| Hello | 3 |\n| Again | 1 |'
        }
      />,
    );

    const card = screen.getByRole('region', {
      name: 'Delegation to posts agent',
    });
    expect(within(card).getByText('two').dataset.streamdown).toBe('strong');
    expect(
      within(within(card).getByRole('table'))
        .getAllByRole('row')
        .map((row) => row.textContent),
    ).toEqual(['TitleVersion', 'Hello3', 'Again1']);
  });
});
