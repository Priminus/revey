import { render, screen } from '@testing-library/react';
import Home from './page';

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  RedirectToSignIn: () => null,
  OrganizationSwitcher: () => <div>org-switcher</div>,
}));

describe('Home', () => {
  it('renders the console heading for signed-in users', () => {
    render(<Home />);
    expect(screen.getByText('Revey Console')).toBeInTheDocument();
  });
});
