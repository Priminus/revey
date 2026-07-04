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
});
