import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WallCard } from './WallCard';

const post = { id: 'p1', pseudonyms: ['נמל-שקט', 'כרם-מלא'], body: 'שניים נזכרים בקו חוף שקט.', emotion: 'disgust', color: 'pink',
  initial_emotion: 'sad', initial_color: 'blue', reactions: 3, braces: 1 };
const visitor = { emotion: 'joy', color: 'yellow' };
const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('WallCard', () => {
  it('shows pseudonyms, the paraphrase, the state in Hebrew and the drift tag', () => {
    wrap(<WallCard post={post} visitor={visitor} onReact={vi.fn()} />);
    expect(screen.getByText('נמל-שקט · כרם-מלא')).toBeInTheDocument();
    expect(screen.getByText('שניים נזכרים בקו חוף שקט.')).toBeInTheDocument();
    expect(screen.getByText('גועל')).toBeInTheDocument();
    expect(screen.getByText('השתנה')).toBeInTheDocument();
    expect(screen.getByText('3 הזזות · 1 חיבוקים')).toBeInTheDocument();
  });

  it('sends the two verbs with the post id', async () => {
    const onReact = vi.fn().mockResolvedValue({ result: { after: { emotion: 'disgust', color: 'pink' } }, error: null });
    wrap(<WallCard post={post} visitor={visitor} onReact={onReact} />);
    fireEvent.click(screen.getByText('להזיז').closest('button'));
    await waitFor(() => expect(onReact).toHaveBeenCalledWith('p1', 'trigger'));
    fireEvent.click(screen.getByText('לחבק').closest('button'));
    await waitFor(() => expect(onReact).toHaveBeenCalledWith('p1', 'brace'));
  });

  it('disables the verbs without a declared state', () => {
    wrap(<WallCard post={post} visitor={null} onReact={vi.fn()} />);
    expect(screen.getByText('להזיז').closest('button')).toBeDisabled();
    expect(screen.getByText('לחבק').closest('button')).toBeDisabled();
  });

  it('tells the visitor when a refusal comes back', async () => {
    const onReact = vi.fn().mockResolvedValue({ result: null, error: { code: 'ALREADY_BRACED' } });
    wrap(<WallCard post={post} visitor={visitor} onReact={onReact} />);
    fireEvent.click(screen.getByText('לחבק').closest('button'));
    expect(await screen.findByRole('status')).toHaveTextContent('כבר חיבקת');
  });
});
