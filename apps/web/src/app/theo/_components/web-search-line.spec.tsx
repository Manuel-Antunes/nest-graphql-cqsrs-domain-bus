import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WebSearchLine } from './web-search-line';

describe('WebSearchLine', () => {
  it('links every source the search found, opening outside the chat', () => {
    render(
      <WebSearchLine
        query="AgentCore news"
        sources={[
          {
            title: 'New AgentCore Runtime',
            url: 'https://aws.amazon.com/new-agentcore-runtime/',
          },
        ]}
      />,
    );

    const line = screen.getByRole('region', {
      name: 'Web search for AgentCore news',
    });
    expect(line.textContent).toContain(
      'Theo searched the web for “AgentCore news”',
    );
    const link = within(
      within(line).getByRole('list', { name: 'Sources' }),
    ).getByRole('link', { name: 'New AgentCore Runtime' });
    expect(link.getAttribute('href')).toBe(
      'https://aws.amazon.com/new-agentcore-runtime/',
    );
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('says so when the search found nothing, and lists no sources', () => {
    render(<WebSearchLine query="nothing at all" sources={[]} />);

    expect(
      screen.getByText(
        'Theo searched the web for “nothing at all”, and found nothing',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Sources' })).toBeNull();
  });
});
