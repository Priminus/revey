import { render, screen } from '@testing-library/react';
import ConnectionsPage from './page';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
}));

describe('ConnectionsPage', () => {
  it('renders a Connect Xero action', () => {
    render(<ConnectionsPage />);
    expect(screen.getByText(/connect xero/i)).toBeInTheDocument();
  });
});
