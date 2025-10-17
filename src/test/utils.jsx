/**
 * Test Utils
 *
 * Utility functions for testing React components.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

/**
 * Custom render function that includes common providers
 */
export function renderWithRouter(ui, options = {}) {
  return render(ui, {
    wrapper: ({ children }) => (
      <BrowserRouter>{children}</BrowserRouter>
    ),
    ...options,
  });
}

/**
 * Mock user for testing
 */
export const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  emotion: 'joy',
  color: 'yellow',
  photo: null,
  followers: [],
  following: [],
  created_at: '2025-01-01T00:00:00Z',
};

/**
 * Mock post for testing
 */
export const mockPost = {
  id: 'post-123',
  title: 'Test Post',
  body: 'This is a test post',
  emotion: 'joy',
  color: 'yellow',
  initialEmotion: 'joy',
  initialColor: 'yellow',
  author: mockUser,
  brace_count: 5,
  comment_count: 3,
  created_at: '2025-01-01T12:00:00Z',
};

/**
 * Mock comment for testing
 */
export const mockComment = {
  id: 'comment-123',
  text: 'This is a test comment',
  author: mockUser,
  created_at: '2025-01-01T12:30:00Z',
};

/**
 * Wait for async operations
 */
export const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Create mock Supabase client
 */
export const createMockSupabase = () => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: mockPost, error: null })),
      })),
    })),
    insert: vi.fn(() => Promise.resolve({ data: mockPost, error: null })),
    update: vi.fn(() => Promise.resolve({ data: mockPost, error: null })),
    delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
  })),
  channel: vi.fn(() => ({
    on: vi.fn(() => ({ subscribe: vi.fn() })),
  })),
  removeChannel: vi.fn(),
});
