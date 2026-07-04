import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientProvider, useActiveClient } from './client-context';

const setActiveClientHeaderMock = jest.fn();

jest.mock('./api/client', () => ({
  setActiveClientHeader: (id: string | null) => setActiveClientHeaderMock(id),
}));

jest.mock('./api/clients', () => ({
  useClients: () => ({
    data: [
      { id: 'c1', name: 'Test Co' },
      { id: 'c2', name: 'Northwind Trading' },
    ],
    isLoading: false,
  }),
}));

function Consumer() {
  const { activeClientId, setActiveClientId } = useActiveClient();
  return (
    <div>
      <span data-testid="active">{activeClientId ?? 'none'}</span>
      <button onClick={() => setActiveClientId('c2')}>switch</button>
    </div>
  );
}

function renderWithProvider() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ClientProvider>
        <Consumer />
      </ClientProvider>
    </QueryClientProvider>,
  );
}

describe('ClientProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActiveClientHeaderMock.mockClear();
  });

  it('defaults to the first client and pushes it onto the X-Client-Id header', () => {
    renderWithProvider();
    expect(screen.getByTestId('active').textContent).toBe('c1');
    expect(setActiveClientHeaderMock).toHaveBeenCalledWith('c1');
  });

  it('switching the active client updates the header and persists to localStorage', () => {
    renderWithProvider();
    fireEvent.click(screen.getByText('switch'));
    expect(screen.getByTestId('active').textContent).toBe('c2');
    expect(setActiveClientHeaderMock).toHaveBeenCalledWith('c2');
    expect(window.localStorage.getItem('revey.activeClientId')).toBe('c2');
  });

  it('syncs a persisted client id onto the header synchronously, before children render', () => {
    // Simulate a non-default client already persisted from a previous
    // session, as if the user had switched to it before reloading.
    window.localStorage.setItem('revey.activeClientId', 'c2');

    let headerValueSeenByChild: string | null | undefined;
    function ProbeChild() {
      // Read the mock's call history at render time: if the fix works, the
      // header has already been set to 'c2' before this component's first
      // render, so no query fired by this child (or any sibling) could ever
      // have gone out unscoped.
      const lastCall = setActiveClientHeaderMock.mock.calls.at(-1);
      headerValueSeenByChild = lastCall ? (lastCall[0] as string | null) : undefined;
      return null;
    }

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ClientProvider>
          <ProbeChild />
        </ClientProvider>
      </QueryClientProvider>,
    );

    expect(headerValueSeenByChild).toBe('c2');
    // Only synced once for the persisted value on mount — no null-then-c2
    // flash, and no redundant re-sync.
    expect(setActiveClientHeaderMock).toHaveBeenCalledTimes(1);
    expect(setActiveClientHeaderMock).toHaveBeenCalledWith('c2');
  });
});
