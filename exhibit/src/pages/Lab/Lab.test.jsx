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

describe("the bot's keyboard in the simulator", () => {
  beforeEach(() => {
    for (const k of Object.keys(chats)) delete chats[k];
    sessionStorage.clear();
    sessionStorage.setItem('lab-base', '500000');
    vi.mocked(say).mockClear();
  });

  it('shows the latest keyboard, and a tap sends its label to that chat', async () => {
    chats[500000] = [
      { from: 'bot', text: 'איזה רגש?', keyboard: [['שמחה', 'אמון', 'פחד', 'הפתעה'], ['עצב', 'גועל', 'כעס', 'ציפייה']] }
    ];
    renderAt('/lab');
    const keys = await screen.findAllByTestId('pane-a-key');
    expect(keys).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'אמון' }));
    await waitFor(() => expect(say).toHaveBeenCalledWith(500000, 'אמון'));
  });

  it('a removed keyboard is gone', async () => {
    const { currentKeyboard } = await vi.importActual('../../services/demo/simService');
    expect(currentKeyboard([{ from: 'bot', keyboard: [['א']] }, { from: 'me', text: 'א' }, { from: 'bot', text: 'נרשם', removeKeyboard: true }])).toBeNull();
    expect(currentKeyboard([{ from: 'bot', keyboard: [['א']] }, { from: 'me', text: 'x' }, { from: 'bot', text: 'שוב' }])).toEqual([['א']]);
  });
});
