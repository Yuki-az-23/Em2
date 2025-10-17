/**
 * Avatar Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders with name initials', () => {
    render(<Avatar name="John Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders with single name', () => {
    render(<Avatar name="Alice" />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders with image', () => {
    render(<Avatar name="John Doe" src="https://example.com/avatar.jpg" />);
    const img = screen.getByAltText('John Doe');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('renders with emotion theme', () => {
    render(<Avatar name="John" emotion="joy" />);
    const avatar = screen.getByText('J').parentElement;
    expect(avatar).toHaveClass('avatar--emotion-joy');
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<Avatar name="John" size="sm" />);
    expect(screen.getByText('J').parentElement).toHaveClass('avatar--sm');

    rerender(<Avatar name="John" size="xl" />);
    expect(screen.getByText('J').parentElement).toHaveClass('avatar--xl');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Avatar name="John" onClick={handleClick} />);

    const avatar = screen.getByText('J').parentElement;
    fireEvent.click(avatar);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('has pointer cursor when clickable', () => {
    const handleClick = vi.fn();
    render(<Avatar name="John" onClick={handleClick} />);

    const avatar = screen.getByText('J').parentElement;
    expect(avatar).toHaveClass('avatar--clickable');
  });
});
