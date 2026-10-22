import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../services/invite/inviteService', async () => {
  const actual = await vi.importActual('../../services/invite/inviteService');
  return { ...actual, createInvite: vi.fn(), peekInvite: vi.fn() };
});
import { createInvite, peekInvite } from '../../services/invite/inviteService';
import { Invite } from './Invite';

const renderAt = (path = '/') => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/" element={<Invite />} /><Route path="/join/:code" element={<Invite />} /></Routes>
  </MemoryRouter>
);

describe('Invite (the door)', () => {
  beforeEach(() => { createInvite.mockReset(); peekInvite.mockReset(); });

  it('refuses to pass without a name', async () => {
    renderAt();
    fireEvent.click(screen.getByText('המגביר מעצב אותי').closest('button'));
    expect(await screen.findByText(/צריך שם/)).toBeInTheDocument();
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('a participant leaves with a Telegram link and the handle the system gave', async () => {
    createInvite.mockResolvedValue({ code: 'c'.repeat(22), handle: 'נמל-שקט', telegramLink: 'https://t.me/HermesExhibitBot?start=' + 'c'.repeat(22), expiresAt: null, error: null });
    renderAt();
    fireEvent.change(screen.getByLabelText(/איך לקרוא לך/), { target: { value: 'דני' } });
    fireEvent.click(screen.getByText('אני בוטח באות שלי').closest('button'));
    const link = await screen.findByTestId('telegram-link');
    expect(link).toHaveAttribute('href', expect.stringContaining('t.me/HermesExhibitBot?start='));
    expect(screen.getByText('נמל-שקט')).toBeInTheDocument();
    expect(createInvite).toHaveBeenCalledWith({ displayName: 'דני', role: 'participant', answer: 'trust_signal' });
    expect(screen.queryByTestId('wall-link')).toBeNull();
  });

  it('an investor leaves for the wall, not Telegram', async () => {
    createInvite.mockResolvedValue({ code: 'c'.repeat(22), handle: 'גן-קר', telegramLink: 'https://t.me/x?start=y', expiresAt: null, error: null });
    renderAt();
    fireEvent.click(screen.getByLabelText(/אני משקיע במיצג/));
    fireEvent.change(screen.getByLabelText(/איך לקרוא לך/), { target: { value: 'רות' } });
    fireEvent.click(screen.getByText('המגביר מעצב אותי').closest('button'));
    expect(await screen.findByTestId('wall-link')).toHaveAttribute('href', '/wall');
    expect(screen.queryByTestId('telegram-link')).toBeNull();
  });

  it('a rate limit is shown as a closed door, not a link', async () => {
    createInvite.mockResolvedValue({ code: null, handle: null, telegramLink: null, expiresAt: null, error: { code: 'RATE_LIMITED', retryAfter: 120 } });
    renderAt();
    fireEvent.change(screen.getByLabelText(/איך לקרוא לך/), { target: { value: 'דני' } });
    fireEvent.click(screen.getByText('המגביר מעצב אותי').closest('button'));
    expect(await screen.findByText(/120 שניות/)).toBeInTheDocument();
    expect(screen.queryByTestId('telegram-link')).toBeNull();
  });

  it('/join shows who left something, by handle', async () => {
    peekInvite.mockResolvedValue({ fromHandle: 'באר-ישן', role: 'participant' });
    renderAt('/join/' + 'k'.repeat(22));
    await waitFor(() => expect(screen.getByText('באר-ישן')).toBeInTheDocument());
  });
});
