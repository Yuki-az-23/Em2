# Contributing to EM2 🤝

Thank you for your interest in contributing to EM2! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [Community](#community)

---

## Code of Conduct

### Our Pledge

We pledge to make participation in EM2 a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards others

**Unacceptable behavior includes:**
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct reasonably considered inappropriate

### Enforcement

Report unacceptable behavior to the project maintainers. All complaints will be reviewed and investigated.

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- Supabase account (for backend)
- Basic knowledge of React, Vite, and PostgreSQL

### Fork and Clone

```bash
# Fork the repository on GitHub

# Clone your fork
git clone https://github.com/YOUR_USERNAME/Em2.git
cd EM2

# Add upstream remote
git remote add upstream https://github.com/Yuki-az-23/Em2.git

# Verify remotes
git remote -v
```

### Set Up Development Environment

```bash
# Navigate to the app
cd apps/mobile-web

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
# VITE_SUPABASE_URL=your_url
# VITE_SUPABASE_ANON_KEY=your_key

# Start development server
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173)

---

## Development Workflow

### 1. Create a Branch

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### Branch Naming Convention

- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test additions or modifications
- `chore/` - Maintenance tasks

### 2. Make Changes

- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed
- Write tests for new features

### 3. Test Your Changes

```bash
# Run all tests
npm run test

# Run tests in watch mode during development
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build to verify no errors
npm run build
```

### 4. Commit Your Changes

```bash
# Stage changes
git add .

# Commit with meaningful message
git commit -m "feat: add user profile editing"
```

See [Commit Messages](#commit-messages) for guidelines.

### 5. Push to Your Fork

```bash
git push origin feature/your-feature-name
```

### 6. Create Pull Request

1. Go to your fork on GitHub
2. Click "New pull request"
3. Select your branch
4. Fill in PR template (see below)
5. Submit PR

---

## Coding Standards

### JavaScript/React

**Style Guide:**
- Use ES6+ features
- Functional components with hooks (no class components)
- Use `const` for constants, `let` for variables (no `var`)
- Arrow functions for callbacks
- Destructuring when appropriate
- Async/await over promises when possible

**Example:**

```javascript
// ✅ Good
export const UserProfile = ({ userId }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data, error } = await userService.getUser(userId);
        if (error) throw error;
        setUser(data);
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId]);

  if (loading) return <Spinner />;
  if (!user) return <div>User not found</div>;

  return (
    <div className="user-profile">
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
};

// ❌ Bad
class UserProfile extends React.Component {
  constructor(props) {
    super(props);
    this.state = { user: null };
  }

  componentDidMount() {
    userService.getUser(this.props.userId).then(response => {
      this.setState({ user: response.data });
    });
  }

  render() {
    return <div>{this.state.user.name}</div>;
  }
}
```

### CSS

**Style Guide:**
- Use CSS Modules or scoped styles
- Follow BEM naming convention
- Use CSS variables for theming
- Mobile-first responsive design
- Support dark mode (future)

**Example:**

```css
/* ✅ Good */
.user-profile {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
}

.user-profile__header {
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
}

.user-profile__avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
}

/* ❌ Bad */
.profile {
  padding: 20px;
}

.profileHeader {
  font-size: 24px;
}

#avatar {
  width: 80px !important;
}
```

### File Organization

```
component-name/
├── ComponentName.jsx       # Component logic
├── ComponentName.css       # Component styles
├── ComponentName.test.jsx  # Component tests
└── index.js                # Barrel export
```

**Example:**

```javascript
// Button/Button.jsx
export const Button = ({ children, variant, ...props }) => {
  return (
    <button className={`btn btn--${variant}`} {...props}>
      {children}
    </button>
  );
};

// Button/index.js
export { Button } from './Button';
```

---

## Testing Guidelines

### What to Test

- **Components**: Rendering, user interactions, edge cases
- **Services**: API calls, data transformations, error handling
- **Hooks**: State management, side effects
- **Utils**: Pure functions, calculations
- **ECBridge**: All emotion-color combinations

### Test Structure

```javascript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByText('Disabled')).toBeDisabled();
  });
});
```

### Coverage Goals

- **Components**: 80%+
- **Services**: 90%+
- **Utils**: 100%
- **ECBridge**: 100%

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
# Feature
git commit -m "feat(auth): add password reset functionality"

# Bug fix
git commit -m "fix(feed): resolve infinite scroll issue"

# Documentation
git commit -m "docs(readme): update installation instructions"

# Refactoring
git commit -m "refactor(ecbridge): simplify emotion calculation logic"

# With body and footer
git commit -m "feat(posts): add image upload support

- Integrate sharp for image optimization
- Add progress indicator
- Handle upload errors gracefully

Closes #123"
```

### Breaking Changes

For breaking changes, add `BREAKING CHANGE:` in the footer:

```bash
git commit -m "feat(api): redesign user authentication

BREAKING CHANGE: The authentication API has been redesigned. Old tokens are no longer valid. Users will need to re-authenticate."
```

---

## Pull Request Process

### Before Submitting

- [ ] Tests pass (`npm run test`)
- [ ] Build succeeds (`npm run build`)
- [ ] Code follows style guidelines
- [ ] Documentation updated if needed
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main

### PR Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?

Describe testing done

## Screenshots (if applicable)

Add screenshots for UI changes

## Checklist

- [ ] Tests pass
- [ ] Build succeeds
- [ ] Documentation updated
- [ ] Follows code style
- [ ] Ready for review
```

### Review Process

1. **Automated Checks**: CI/CD runs tests and builds
2. **Code Review**: Maintainer reviews code
3. **Feedback**: Address review comments
4. **Approval**: Maintainer approves PR
5. **Merge**: PR is merged to main

### After Merge

- Delete your feature branch (local and remote)
- Update your fork's main branch
- Celebrate! 🎉

---

## Project Structure

### Key Directories

```
EM2/
├── apps/mobile-web/
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── services/        # Business logic
│   │   │   ├── auth/        # Authentication
│   │   │   ├── user/        # User operations
│   │   │   ├── post/        # Post operations
│   │   │   ├── ecbridge/    # ECBridge algorithm
│   │   │   └── native/      # Mobile features
│   │   ├── hooks/           # Custom React hooks
│   │   ├── router/          # Routing configuration
│   │   ├── styles/          # Global styles
│   │   └── test/            # Test utilities
│   └── capacitor.config.json
├── supabase/
│   └── migrations/          # Database migrations
└── docs/                    # Documentation
```

### Important Files

- `PROGRESS.md` - Development progress
- `TESTING.md` - Testing guide
- `DEPLOYMENT.md` - Deployment instructions
- `MIGRATION_PLAN.md` - Legacy migration plan
- `CLAUDE.md` - AI assistant instructions

---

## Areas to Contribute

### High Priority

- **Testing**: Increase test coverage
- **Documentation**: Improve docs and guides
- **Accessibility**: WCAG AA compliance
- **Performance**: Optimize bundle size
- **Mobile**: iOS/Android native features

### Feature Requests

- Dark mode
- Push notifications
- Advanced analytics
- Voice/video posts
- AI emotion detection
- Internationalization (i18n)

### Bug Reports

When reporting bugs, include:
- Clear description
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots (if applicable)
- Environment (browser, OS, version)

Use the [issue template](https://github.com/Yuki-az-23/Em2/issues/new) on GitHub.

---

## Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussion
- **Pull Requests**: Code contributions

### Getting Help

- Read the [README](README.md)
- Check [PROGRESS.md](PROGRESS.md) for project status
- Review existing [issues](https://github.com/Yuki-az-23/Em2/issues)
- Ask in [Discussions](https://github.com/Yuki-az-23/Em2/discussions)

### Recognition

Contributors will be:
- Listed in README contributors section
- Mentioned in release notes
- Credited in documentation

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

Feel free to:
- Open an issue
- Start a discussion
- Reach out to maintainers

Thank you for contributing to EM2! 🎨💭

---

**Last Updated**: 2025-01-17
