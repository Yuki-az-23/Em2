import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const chats = {};
vi.mock('../../services/demo/simService', async () => {
  const actual = await vi.importActual('../../services/demo/simService');
  return {
    ...actual,
    getChat: vi.fn(async (id) => chats[id] || []),
    say: vi.fn(async () => {})
  };
});
import { getChat, say, startCode } from '../../services/demo/simService';
import { Lab } from './Lab';

const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><Lab /></MemoryRouter>);

describe('the simulator', () => {
  beforeEach(() => {
    for (const k of Object.keys(chats)) delete chats[k];
    sessionStorage.clear();
    sessionStorage.setItem('lab-base', '500000');
    vi.mocked(say).mockClear();
    vi.mocked(getChat).mockClear();
  });

  it('finds a deep-link code in a bot message', () => {
    expect(startCode('שלח: https://t.me/HermesDemoBot?start=abcDEF123_-x תקף')).toBe('abcDEF123_-x');
    expect(startCode('אין כאן קישור')).toBeNull();
  });

  it('a code from the door starts person A once', async () => {
    renderAt('/lab?start=doorcode1234');
    await waitFor(() => expect(say).toHaveBeenCalledWith(500000, '/start doorcode1234'));
    expect(say).toHaveBeenCalledTimes(1);
  });

  it("A's invite link can be opened as person B", async () => {
    chats[500000] = [{ from: 'bot', text: 'שלח את הקישור:\nhttps://t.me/HermesDemoBot?start=paircode5678' }];
    renderAt('/lab');
    const btn = await screen.findByTestId('hand-over');
    fireEvent.click(btn);
    await waitFor(() => expect(say).toHaveBeenCalledWith(500001, '/start paircode5678'));
  });

  it('typing in a pane sends to that chat', async () => {
    renderAt('/lab');
    fireEvent.change(screen.getByTestId('pane-b-input'), { target: { value: 'מסכים' } });
    fireEvent.submit(screen.getByTestId('pane-b-input').closest('form'));
    await waitFor(() => expect(say).toHaveBeenCalledWith(500001, 'מסכים'));
  });
});
