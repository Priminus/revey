import { render, screen } from '@testing-library/react';
import { AgingChart } from './aging-chart';

describe('AgingChart', () => {
  it('renders a labelled bar per non-empty bucket with accessible amounts', () => {
    render(
      <AgingChart
        aging={{
          current: { count: 1, amountCents: 300000 },
          '1-30': { count: 2, amountCents: 500000 },
          '31-60': { count: 0, amountCents: 0 },
          '61-90': { count: 0, amountCents: 0 },
          '90+': { count: 1, amountCents: 900000 },
        }}
      />,
    );
    expect(screen.getByText('current')).toBeInTheDocument();
    expect(screen.getByText('90+')).toBeInTheDocument();
    // largest bucket amount rendered
    expect(screen.getByText('$9,000')).toBeInTheDocument();
  });
});
