# Testing Guide

## Test Suite Overview

EM2 mobile-web uses **Vitest** with **React Testing Library** for comprehensive testing.

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

### Test Setup (`src/test/setup.js`)

Global configuration for all tests:
- **Mocked APIs**: `matchMedia`, `IntersectionObserver`, `localStorage`
- **Mocked Capacitor**: Camera, Share, Haptics, Status Bar
- **Auto cleanup**: After each test using `@testing-library/react`

### Test Utilities (`src/test/utils.jsx`)

#### Render Utilities
```javascript
import { renderWithRouter } from '../test/utils';

// Renders component with React Router context
renderWithRouter(<MyComponent />);
```

#### Mock Data
```javascript
import { mockUser, mockPost, mockComment } from '../test/utils';

// Pre-configured mock objects for testing
const user = mockUser; // { id, name, email, emotion, color, ... }
const post = mockPost; // { id, title, body, emotion, author, ... }
```

#### Mock Supabase Client
```javascript
import { createMockSupabase } from '../test/utils';

const mockSupabase = createMockSupabase();
// Returns mocked Supabase client with from(), channel(), etc.
```

## Component Tests

### Button Component (`components/Button/Button.test.jsx`)
- ✅ Basic rendering
- ✅ Click handling
- ✅ Disabled state
- ✅ Loading state
- ✅ Variants (primary, secondary, outline)
- ✅ Emotions (joy, trust, sad, etc.)
- ✅ Sizes (sm, md, lg)

### Avatar Component (`components/Avatar/Avatar.test.jsx`)
- ✅ Name initials rendering
- ✅ Image display
- ✅ Emotion themes
- ✅ Size variations
- ✅ Click interactions

### Badge Component (`components/Badge/Badge.test.jsx`)
- ✅ Text rendering
- ✅ Emotion variants
- ✅ Success/error states
- ✅ Size variations

## Service Tests

### Camera Service (`services/native/camera.test.js`)
Tests for native camera integration:
- ✅ Platform detection (`isCameraAvailable`)
- ✅ Photo capture with permissions
- ✅ Gallery selection
- ✅ Photo source action sheet
- ✅ Data URL conversions (Blob, File)

### Share Service (`services/native/share.test.js`)
Tests for native sharing:
- ✅ Share availability check
- ✅ Text sharing
- ✅ Post sharing with emotion context
- ✅ Profile sharing
- ✅ URL sharing

## ECBridge Tests

### ECBridgeEngine (`services/ecbridge/__tests__/ECBridgeEngine.test.js`)
Comprehensive tests for Emotion-Color Bridge algorithm:
- ✅ All emotion combinations (8 × 8 = 64 combinations)
- ✅ Color interactions
- ✅ Invalid input handling
- ✅ Edge cases (null, undefined inputs)
- ✅ Emotion evolution calculation

## Writing New Tests

### Component Test Template

```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', () => {
    const handleClick = vi.fn();
    render(<MyComponent onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Service Test Template

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myService } from './myService';

vi.mock('@some/dependency', () => ({
  SomeDep: {
    method: vi.fn(),
  },
}));

describe('myService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('performs expected operation', async () => {
    const result = await myService.doSomething();
    expect(result).toBe(expectedValue);
  });
});
```

## Test Coverage Goals

- **Components**: 80%+ coverage
- **Services**: 90%+ coverage
- **ECBridge**: 100% coverage (critical business logic)

## Continuous Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Pre-deployment checks

## Common Testing Patterns

### Testing Async Operations
```javascript
import { waitFor } from '@testing-library/react';

it('loads data asynchronously', async () => {
  render(<AsyncComponent />);

  await waitFor(() => {
    expect(screen.getByText('Loaded Data')).toBeInTheDocument();
  });
});
```

### Testing User Events
```javascript
import { userEvent } from '@testing-library/user-event';

it('handles user typing', async () => {
  const user = userEvent.setup();
  render(<Input />);

  await user.type(screen.getByRole('textbox'), 'Hello World');
  expect(screen.getByDisplayValue('Hello World')).toBeInTheDocument();
});
```

### Mocking Capacitor Plugins
```javascript
import { Camera } from '@capacitor/camera';

vi.mock('@capacitor/camera');

it('uses camera', async () => {
  Camera.getPhoto.mockResolvedValue({
    dataUrl: 'data:image/jpeg;base64,ABC',
  });

  const photo = await takePhoto();
  expect(photo.dataUrl).toBe('data:image/jpeg;base64,ABC');
});
```

## Troubleshooting

### Common Issues

**Issue**: `matchMedia is not defined`
**Solution**: Already mocked in `test/setup.js`

**Issue**: `IntersectionObserver is not defined`
**Solution**: Already mocked in `test/setup.js`

**Issue**: Capacitor plugin not found
**Solution**: Check mocks in `test/setup.js`

**Issue**: Router errors in tests
**Solution**: Use `renderWithRouter()` from `test/utils.jsx`

## Next Steps

- [ ] Add integration tests for full user flows
- [ ] Increase coverage to 90%+
- [ ] Add E2E tests with Playwright
- [ ] Performance testing with Lighthouse CI
- [ ] Accessibility testing with axe-core
