import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/wall/machineService', () => ({
  getPositions: vi.fn().mockResolvedValue({ posts: [
    { id: '1', emotion: 'sad', color: 'blue', initial_emotion: 'sad', initial_color: 'blue' },
    { id: '2', emotion: 'disgust', color: 'pink', initial_emotion: 'sad', initial_color: 'blue' }
  ], error: null })
}));
import { Machine } from './Machine';

describe('Machine', () => {
  it('counts live posts per cell and shows where they were published', async () => {
    render(<MemoryRouter><Machine /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/2 כרטיסים על הקיר/)).toBeInTheDocument());
    expect(screen.getByTitle('עצב כחול: 1 עכשיו, 2 בפרסום')).toBeInTheDocument();
    expect(screen.getByTitle('גועל ורוד: 1 עכשיו, 0 בפרסום')).toBeInTheDocument();
  });

  it('runs the old engine and the new rule side by side; lowercase input exposes the Disgust fallback', async () => {
    render(<MemoryRouter><Machine /></MemoryRouter>);
    // defaults: visitor joy/yellow, post sad/blue (opposites)
    expect(screen.getByTestId('old-result')).toHaveTextContent('אמון');      // Joy's "complementary" is Trust
    expect(screen.getByTestId('new-result')).toHaveTextContent('גועל ורוד'); // one step clockwise
    fireEvent.click(screen.getByLabelText(/אותיות קטנות/));
    expect(screen.getByTestId('old-result')).toHaveTextContent('גועל כתום');
    expect(screen.getByTestId('old-result')).toHaveTextContent('ברירת המחדל');
  });
});
