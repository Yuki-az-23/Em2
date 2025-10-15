# Authentication Service

Complete authentication system using Supabase Auth with React hooks.

## Features

- Email/password authentication
- Session management (persistent)
- Automatic token refresh
- User profile integration
- Password reset
- Auth state management with React Context

## Files

- `authService.js` - Core authentication functions
- `useAuth.js` - React hooks and context provider

## Setup

1. Wrap your app with `AuthProvider`:

```jsx
import { AuthProvider } from './services/auth/useAuth';

function App() {
  return (
    <AuthProvider>
      <YourApp />
    </AuthProvider>
  );
}
```

2. Use the `useAuth` hook in components:

```jsx
import { useAuth } from './services/auth/useAuth';

function ProfilePage() {
  const { user, profile, signOut } = useAuth();

  if (!user) {
    return <p>Please sign in</p>;
  }

  return (
    <div>
      <h1>Welcome {profile?.name}</h1>
      <p>Emotion: {profile?.emotion}</p>
      <p>Color: {profile?.color}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

## API Reference

### authService.js

#### signUp(data)

Create a new user account.

```js
import { signUp } from './services/auth/authService';

const result = await signUp({
  email: 'user@example.com',
  password: 'securePassword123',
  name: 'John Doe',
  emotion: 'Joy',    // Optional, default: 'Joy'
  color: 'yellow'    // Optional, default: 'yellow'
});

if (result.error) {
  console.error('Sign up failed:', result.error.message);
} else {
  console.log('User created:', result.user);
}
```

**Parameters:**
- `email` (string, required) - User's email
- `password` (string, required) - User's password (min 6 characters)
- `name` (string, required) - Display name
- `emotion` (string, optional) - Initial emotion (default: 'Joy')
- `color` (string, optional) - Initial color (default: 'yellow')

**Returns:** `{ user, error }`

#### signIn(data)

Sign in an existing user.

```js
import { signIn } from './services/auth/authService';

const result = await signIn({
  email: 'user@example.com',
  password: 'securePassword123'
});

if (result.error) {
  console.error('Sign in failed:', result.error.message);
} else {
  console.log('Signed in:', result.user);
  console.log('Session:', result.session);
}
```

**Parameters:**
- `email` (string, required)
- `password` (string, required)

**Returns:** `{ user, session, error }`

#### signOut()

Sign out the current user.

```js
import { signOut } from './services/auth/authService';

const result = await signOut();

if (result.error) {
  console.error('Sign out failed:', result.error.message);
} else {
  console.log('Signed out successfully');
}
```

**Returns:** `{ error }`

#### getCurrentUser()

Get the currently authenticated user and their profile.

```js
import { getCurrentUser } from './services/auth/authService';

const { user, profile, error } = await getCurrentUser();

if (user) {
  console.log('User:', user);
  console.log('Profile:', profile);
}
```

**Returns:** `{ user, profile, error }`

#### getSession()

Get the current session.

```js
import { getSession } from './services/auth/authService';

const { session, error } = await getSession();

if (session) {
  console.log('Access token:', session.access_token);
  console.log('Expires at:', session.expires_at);
}
```

**Returns:** `{ session, error }`

#### updatePassword(newPassword)

Update the user's password.

```js
import { updatePassword } from './services/auth/authService';

const result = await updatePassword('newSecurePassword456');

if (result.error) {
  console.error('Password update failed:', result.error.message);
} else {
  console.log('Password updated successfully');
}
```

**Parameters:**
- `newPassword` (string, required) - New password (min 6 characters)

**Returns:** `{ user, error }`

#### resetPassword(email)

Send password reset email.

```js
import { resetPassword } from './services/auth/authService';

const result = await resetPassword('user@example.com');

if (result.error) {
  console.error('Reset failed:', result.error.message);
} else {
  console.log('Reset email sent');
}
```

**Parameters:**
- `email` (string, required)

**Returns:** `{ error }`

#### onAuthStateChange(callback)

Listen to authentication state changes.

```js
import { onAuthStateChange } from './services/auth/authService';

const subscription = onAuthStateChange((event, session) => {
  console.log('Auth event:', event);
  console.log('Session:', session);
});

// Unsubscribe when done
subscription.unsubscribe();
```

**Parameters:**
- `callback` (function, required) - `(event, session) => {}`

**Returns:** Subscription object with `unsubscribe()` method

**Events:**
- `SIGNED_IN` - User signed in
- `SIGNED_OUT` - User signed out
- `TOKEN_REFRESHED` - Access token refreshed
- `USER_UPDATED` - User data updated
- `PASSWORD_RECOVERY` - Password reset initiated

#### isAuthenticated()

Check if user is currently authenticated.

```js
import { isAuthenticated } from './services/auth/authService';

const authenticated = await isAuthenticated();

if (authenticated) {
  console.log('User is signed in');
}
```

**Returns:** `Promise<boolean>`

### useAuth.js

#### useAuth()

React hook for accessing auth state and methods.

```jsx
import { useAuth } from './services/auth/useAuth';

function MyComponent() {
  const { user, profile, loading, signIn, signOut } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <SignInForm />;
  }

  return (
    <div>
      <h1>Welcome {profile?.name}</h1>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

**Returns:**
- `user` (object|null) - Current authenticated user
- `profile` (object|null) - User profile from database
- `loading` (boolean) - Loading state
- `signUp` (function) - Sign up function
- `signIn` (function) - Sign in function
- `signOut` (function) - Sign out function
- `updatePassword` (function) - Update password function
- `resetPassword` (function) - Reset password function

#### useRequireAuth(redirectTo)

Hook that requires authentication, redirects if not signed in.

```jsx
import { useRequireAuth } from './services/auth/useAuth';

function ProtectedPage() {
  const { user, profile } = useRequireAuth('/signin');

  // This code only runs if user is authenticated
  return <div>Protected content for {profile?.name}</div>;
}
```

**Parameters:**
- `redirectTo` (string, optional) - Redirect path (default: '/signin')

**Returns:** Same as `useAuth()`

## Usage Examples

### Sign Up Form

```jsx
import { useState } from 'react';
import { useAuth } from './services/auth/useAuth';

function SignUpForm() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [emotion, setEmotion] = useState('Joy');
  const [color, setColor] = useState('yellow');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await signUp({ email, password, name, emotion, color });

    if (result.error) {
      setError(result.error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
        <option value="Joy">Joy</option>
        <option value="Trust">Trust</option>
        <option value="Feared">Feared</option>
        {/* ... other emotions */}
      </select>
      <select value={color} onChange={(e) => setColor(e.target.value)}>
        <option value="yellow">Yellow</option>
        <option value="lime">Lime</option>
        <option value="green">Green</option>
        {/* ... other colors */}
      </select>
      {error && <p className="error">{error}</p>}
      <button type="submit">Sign Up</button>
    </form>
  );
}
```

### Sign In Form

```jsx
import { useState } from 'react';
import { useAuth } from './services/auth/useAuth';

function SignInForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await signIn({ email, password });

    if (result.error) {
      setError(result.error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Sign In</button>
    </form>
  );
}
```

### Protected Route

```jsx
import { useRequireAuth } from './services/auth/useAuth';

function DashboardPage() {
  const { user, profile, loading } = useRequireAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome back, {profile?.name}!</p>
      <p>Your emotion: {profile?.emotion}</p>
      <p>Your color: {profile?.color}</p>
    </div>
  );
}
```

### Password Reset

```jsx
import { useState } from 'react';
import { useAuth } from './services/auth/useAuth';

function ForgotPasswordForm() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const result = await resetPassword(email);

    if (result.error) {
      setError(result.error.message);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return <p>Password reset email sent! Check your inbox.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit">Reset Password</button>
    </form>
  );
}
```

## Error Handling

All functions return an error object with `message` and `code` properties:

```js
const result = await signIn({ email, password });

if (result.error) {
  console.error('Error code:', result.error.code);
  console.error('Error message:', result.error.message);

  // Handle specific errors
  switch (result.error.code) {
    case 'invalid_credentials':
      alert('Invalid email or password');
      break;
    case 'email_not_confirmed':
      alert('Please confirm your email first');
      break;
    default:
      alert(result.error.message);
  }
}
```

## Security Notes

1. **Password Requirements**: Supabase default is min 6 characters. Configure in Supabase dashboard for stronger requirements.

2. **Session Storage**: Sessions are stored in localStorage by default (secure for web, consider native storage for mobile).

3. **Token Refresh**: Tokens automatically refresh before expiry (configured in client.js).

4. **RLS**: All database operations are protected by Row Level Security policies defined in Phase 1 migrations.

5. **Email Confirmation**: Enable email confirmation in Supabase dashboard for production.

## Integration with Database

The auth service integrates with the `users` table created in Phase 1:

```sql
-- User profile is automatically created via database trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

User metadata (name, emotion, color) is stored in:
1. `auth.users.raw_user_meta_data` (Supabase auth)
2. `public.users` table (our application database)

## Next Steps

- Implement OAuth providers (Google, GitHub, etc.)
- Add biometric authentication for mobile
- Implement multi-factor authentication
- Add session timeout handling
- Create authentication middleware for protected routes
