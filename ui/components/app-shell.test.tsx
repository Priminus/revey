import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from './app-shell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const setActiveClientId = jest.fn();

jest.mock('../lib/api/clients', () => ({
  useClients: () => ({
    data: [
      { id: 'c1', name: 'Test Co' },
      { id: 'c2', name: 'Northwind Trading' },
    ],
    isLoading: false,
  }),
}));

jest.mock('../lib/client-context', () => ({
  useActiveClient: () => ({ activeClientId: 'c1', setActiveClientId }),
}));

describe('AppShell', () => {
  it('renders the workspace and settings nav sections', () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );
    expect(screen.getByText('Workspace')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Global Workflow')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('lists every client in the switcher and switches the active client on click', () => {
    render(
      <AppShell>
        <p>content</p>
      </AppShell>,
    );

    // The switcher trigger shows the currently active client's name.
    expect(screen.getByRole('button', { name: /Test Co/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Test Co/ }));
    expect(screen.getByText('Northwind Trading')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Northwind Trading'));
    expect(setActiveClientId).toHaveBeenCalledWith('c2');
  });
});
