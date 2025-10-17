# EM2 Technical Architecture

## System Overview

EM2 is a serverless, cross-platform emotional social media application.

```
┌─────────────────────────────────────────────────────────┐
│                     EM2 Application                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Web App    │  │   iOS App    │  │ Android App  │ │
│  │ (React+Vite) │  │ (Capacitor)  │  │ (Capacitor)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│           │                │                │           │
│           └────────────────┴────────────────┘           │
│                           │                             │
│                           ▼                             │
│              ┌─────────────────────────┐               │
│              │   Supabase Backend      │               │
│              ├─────────────────────────┤               │
│              │ • PostgreSQL Database   │               │
│              │ • Authentication        │               │
│              │ • Realtime Subscriptions│               │
│              │ • Storage (Images)      │               │
│              │ • Row Level Security    │               │
│              └─────────────────────────┘               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

**Core**:
- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router v6** - Client-side routing

**UI & Styling**:
- **CSS Variables** - Design system tokens
- **CSS Modules** - Component styling
- **Material-UI Icons** (optional) - Icon library

**State Management**:
- **React Hooks** - Local state (useState, useEffect)
- **Context API** - Global state (Auth)
- **Supabase Realtime** - Server state

**Rich Text**:
- **EditorJS** - Block-based rich text editor
- **@editorjs/*** - Editor plugins (header, list, image, etc.)

### Mobile

**Cross-Platform**:
- **Capacitor** - Native bridge for iOS/Android
- **@capacitor/ios** - iOS platform
- **@capacitor/android** - Android platform

**Native Features**:
- **@capacitor/status-bar** - Status bar styling
- **@capacitor/keyboard** - Keyboard handling
- **@capacitor/share** - Native share sheet
- **@capacitor/haptics** - Haptic feedback

### Backend (Supabase)

**Database**:
- **PostgreSQL 15** - Relational database
- **PostgREST** - Auto-generated REST API
- **pg_graphql** - GraphQL support (optional)

**Authentication**:
- **GoTrue** - JWT-based auth
- **Email/Password** - Primary auth method
- **OAuth** (future) - Social logins

**Storage**:
- **Supabase Storage** - S3-compatible object storage
- **Image Transformations** - On-the-fly resize/compress

**Realtime**:
- **WebSockets** - Live data subscriptions
- **PostgreSQL LISTEN/NOTIFY** - Database triggers

**Security**:
- **Row Level Security (RLS)** - Database-level access control
- **JWT** - Stateless authentication
- **HTTPS** - Encrypted communication

---

## Project Structure

```
EM2/
├── public/                 # Static assets
│   ├── favicon.ico
│   └── robots.txt
│
├── src/                    # Source code
│   ├── assets/            # Images, fonts, etc.
│   │
│   ├── components/        # Reusable UI components
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── Editor/        # EditorJS wrapper
│   │   ├── EmotionPicker/ # Circular emotion picker
│   │   ├── ColorPicker/   # Circular color picker
│   │   ├── Navigation/
│   │   └── index.js       # Barrel exports
│   │
│   ├── config/            # Configuration files
│   │   ├── supabase.js    # Supabase client
│   │   └── editorConfig.js# EditorJS config
│   │
│   ├── hooks/             # Custom React hooks
│   │   ├── useAuth.js     # Authentication
│   │   ├── useUser.js     # User data
│   │   ├── usePost.js     # Posts
│   │   ├── useECBridge.js # ECBridge logic
│   │   └── index.js
│   │
│   ├── pages/             # Page components
│   │   ├── Feed/          # Main feed
│   │   ├── CreatePost/    # Post creation
│   │   ├── PostDetail/    # Single post view
│   │   ├── Profile/       # User profile
│   │   ├── Login/         # Login page
│   │   ├── Signup/        # Signup page
│   │   └── index.js
│   │
│   ├── router/            # Routing configuration
│   │   ├── MainRouter.jsx # Main routes
│   │   ├── PrivateRoute.jsx # Auth guard
│   │   └── index.js
│   │
│   ├── services/          # Business logic & API calls
│   │   ├── auth.service.js
│   │   ├── post.service.js
│   │   ├── user.service.js
│   │   └── ecbridge/      # ECBridge algorithms
│   │       ├── ECBrigeComment/
│   │       └── ECBrigeUser/
│   │
│   ├── styles/            # Global styles
│   │   ├── global.css     # Base styles
│   │   ├── variables.css  # CSS custom properties
│   │   └── reset.css      # CSS reset
│   │
│   ├── utils/             # Utility functions
│   │   ├── date.js
│   │   ├── validation.js
│   │   └── ecbridge.js
│   │
│   ├── App.jsx            # Root component
│   ├── App.css
│   ├── main.jsx           # Entry point
│   └── index.css          # Import all styles
│
├── supabase/              # Database migrations
│   ├── migrations/
│   │   ├── 001_create_users_table.sql
│   │   ├── 002_create_posts_table.sql
│   │   └── ...
│   ├── run-migration.js   # Migration runner
│   └── README.md
│
├── Docs/                  # Documentation
│   ├── PROJECT_PHASES.md  # Implementation plan
│   ├── ECBRIDGE_CIRCULAR_UI.md # UI spec
│   ├── ARCHITECTURE.md    # This file
│   └── API.md             # API documentation
│
├── capacitor.config.ts    # Capacitor configuration
├── package.json
├── vite.config.js
├── .env                   # Environment variables
├── .gitignore
└── README.md
```

---

## Data Flow

### Authentication Flow

```
1. User visits app
   ↓
2. Check Supabase session (localStorage)
   ↓
3. If valid session:
   - Set user in Auth context
   - Allow access to private routes
   ↓
4. If no session:
   - Redirect to /login
   ↓
5. User logs in:
   - supabase.auth.signInWithPassword()
   - Store session in localStorage
   - Trigger onAuthStateChange
   - Update Auth context
   - Redirect to /feed
```

### Post Creation Flow

```
1. User navigates to /post/create
   ↓
2. Fill form:
   - Title (input)
   - Content (EditorJS)
   - Emotion (circular picker)
   - Color (circular picker)
   ↓
3. Click "Publish"
   ↓
4. Validate form
   ↓
5. Upload images (if any):
   - EditorJS image blocks
   - Upload to Supabase Storage
   - Get URLs
   ↓
6. Save post to database:
   - Insert into posts table
   - Include user_id, emotion, color
   ↓
7. Redirect to post detail page
   ↓
8. Realtime: Other users see new post instantly
```

### ECBridge Feed Filtering Flow

```
1. User lands on /feed
   ↓
2. Check user's current ECBridge:
   - emotion: "joy"
   - color: "yellow"
   ↓
3. Fetch posts with ECBridge algorithm:
   - Calculate compatibility score for each post
   - Score = f(user_emotion, user_color, post_emotion, post_color)
   ↓
4. Sort posts by:
   - Compatibility score (primary)
   - Recency (secondary)
   ↓
5. Display posts in feed
   ↓
6. Realtime subscription:
   - Listen for new posts
   - Re-calculate compatibility
   - Insert if compatible
```

### Comment with ECBridge Flow

```
1. User writes comment on a post
   ↓
2. Submit comment with:
   - comment_text
   - user's current emotion
   - user's current color
   ↓
3. Save comment to database
   ↓
4. Run ECBrigeComment algorithm:
   - Input: user_emotion, user_color, post_emotion, post_color
   - Output: new_emotion, new_color
   ↓
5. Update post's emotion/color:
   - Keep initial_emotion/initial_color unchanged
   - Update current emotion/color
   ↓
6. Realtime: All viewers see updated post emotion
```

---

## Database Schema

### Tables

**1. users** (extends auth.users)
```sql
id              UUID PRIMARY KEY (references auth.users)
name            TEXT NOT NULL
email           TEXT UNIQUE NOT NULL
emotion         TEXT NOT NULL
color           TEXT NOT NULL
photo           TEXT (URL)
bio             TEXT
last_bridge_update TIMESTAMP DEFAULT NOW()
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

**2. posts**
```sql
id              UUID PRIMARY KEY
user_id         UUID FOREIGN KEY → users(id)
title           TEXT NOT NULL
body            TEXT (plain text preview)
content         JSONB (EditorJS data)
emotion         TEXT NOT NULL (current)
color           TEXT NOT NULL (current)
initial_emotion TEXT NOT NULL (immutable)
initial_color   TEXT NOT NULL (immutable)
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

**3. comments**
```sql
id              UUID PRIMARY KEY
post_id         UUID FOREIGN KEY → posts(id)
user_id         UUID FOREIGN KEY → users(id)
text            TEXT NOT NULL
emotion         TEXT NOT NULL (at time of comment)
color           TEXT NOT NULL (at time of comment)
created_at      TIMESTAMP DEFAULT NOW()
```

**4. follows**
```sql
follower_id     UUID FOREIGN KEY → users(id)
following_id    UUID FOREIGN KEY → users(id)
created_at      TIMESTAMP DEFAULT NOW()
PRIMARY KEY (follower_id, following_id)
```

**5. braces** (likes)
```sql
user_id         UUID FOREIGN KEY → users(id)
post_id         UUID FOREIGN KEY → posts(id)
created_at      TIMESTAMP DEFAULT NOW()
PRIMARY KEY (user_id, post_id)
```

**6. ecbridge_history**
```sql
id              UUID PRIMARY KEY
user_id         UUID FOREIGN KEY → users(id)
emotion         TEXT NOT NULL
color           TEXT NOT NULL
duration        INTERVAL (time this bridge was active)
created_at      TIMESTAMP DEFAULT NOW()
```

### Indexes

**Performance Optimization**:
```sql
-- Users
CREATE INDEX users_emotion_color_idx ON users(emotion, color);
CREATE INDEX users_last_bridge_update_idx ON users(last_bridge_update);

-- Posts
CREATE INDEX posts_user_id_idx ON posts(user_id);
CREATE INDEX posts_emotion_color_idx ON posts(emotion, color);
CREATE INDEX posts_created_at_idx ON posts(created_at DESC);

-- Comments
CREATE INDEX comments_post_id_idx ON comments(post_id, created_at DESC);
CREATE INDEX comments_user_id_idx ON comments(user_id);

-- Follows
CREATE INDEX follows_follower_id_idx ON follows(follower_id);
CREATE INDEX follows_following_id_idx ON follows(following_id);

-- Braces
CREATE INDEX braces_post_id_idx ON braces(post_id);
```

### Row Level Security (RLS) Policies

**users**:
```sql
-- Anyone can view profiles
CREATE POLICY "users_select" ON users FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "users_update" ON users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

**posts**:
```sql
-- Anyone can view posts
CREATE POLICY "posts_select" ON posts FOR SELECT USING (true);

-- Authenticated users can create posts
CREATE POLICY "posts_insert" ON posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own posts
CREATE POLICY "posts_update" ON posts FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own posts
CREATE POLICY "posts_delete" ON posts FOR DELETE
USING (auth.uid() = user_id);
```

**comments**:
```sql
-- Anyone can view comments
CREATE POLICY "comments_select" ON comments FOR SELECT USING (true);

-- Authenticated users can create comments
CREATE POLICY "comments_insert" ON comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "comments_delete" ON comments FOR DELETE
USING (auth.uid() = user_id);
```

---

## API Layer (Supabase)

### Authentication API

```javascript
// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: {
      name: 'John Doe',
      emotion: 'joy',
      color: 'yellow'
    }
  }
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// Sign out
const { error } = await supabase.auth.signOut();

// Get session
const { data: { session } } = await supabase.auth.getSession();

// Listen to auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log(event, session);
});
```

### Database API (PostgREST)

```javascript
// Create post
const { data, error } = await supabase
  .from('posts')
  .insert({
    title: 'My First Post',
    body: 'Plain text preview',
    content: { blocks: [...] }, // EditorJS JSON
    emotion: 'joy',
    color: 'yellow',
    initial_emotion: 'joy',
    initial_color: 'yellow',
    user_id: user.id
  })
  .select()
  .single();

// Fetch posts
const { data, error } = await supabase
  .from('posts')
  .select(`
    *,
    user:users (
      id,
      name,
      photo
    ),
    comments (count),
    braces (count)
  `)
  .order('created_at', { ascending: false })
  .limit(20);

// Update post
const { data, error } = await supabase
  .from('posts')
  .update({ emotion: 'sad', color: 'blue' })
  .eq('id', postId);

// Delete post
const { error } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId);
```

### Realtime API

```javascript
// Subscribe to new posts
const channel = supabase
  .channel('posts')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'posts'
  }, (payload) => {
    console.log('New post:', payload.new);
    // Add to feed
  })
  .subscribe();

// Unsubscribe
channel.unsubscribe();
```

### Storage API

```javascript
// Upload image
const { data, error } = await supabase.storage
  .from('post-images')
  .upload(`${userId}/${Date.now()}.jpg`, file);

// Get public URL
const { data } = supabase.storage
  .from('post-images')
  .getPublicUrl(filePath);

// Image transformation
const url = `${publicUrl}?width=800&height=600&quality=80`;
```

---

## Performance Optimization

### Frontend

**Code Splitting**:
```javascript
// Lazy load pages
const Feed = lazy(() => import('./pages/Feed/Feed'));
const CreatePost = lazy(() => import('./pages/CreatePost/CreatePost'));

// Suspense boundary
<Suspense fallback={<LoadingOverlay />}>
  <Feed />
</Suspense>
```

**Image Optimization**:
- Use Supabase Storage transformations
- Lazy load images below fold
- Use `loading="lazy"` attribute
- Implement skeleton screens

**Bundle Size**:
- Tree shaking (Vite does this automatically)
- Analyze bundle: `npm run build && npm run preview`
- Remove unused dependencies
- Use dynamic imports for heavy libraries

### Backend

**Database Optimization**:
- Indexes on frequently queried columns
- Limit query results (pagination)
- Use `select()` to fetch only needed columns
- Denormalize when necessary (e.g., comment count)

**Caching**:
- Supabase edge caching for static data
- Client-side caching with React Query (optional)
- localStorage for user preferences

**Connection Pooling**:
- Supabase handles this automatically
- Connection pool of 15-30 connections

---

## Security Considerations

### Authentication Security
- Passwords hashed with bcrypt (Supabase handles this)
- JWT tokens with expiration
- Refresh tokens for long sessions
- HTTPS only in production

### Data Security
- Row Level Security on all tables
- Validate all inputs on client and server
- Sanitize user content (XSS protection)
- Rate limiting on API endpoints

### File Upload Security
- Validate file types
- Maximum file size limits
- Virus scanning (optional, via Supabase extension)
- Signed URLs for private files

---

## Deployment

### Web (Vercel/Netlify)
```bash
# Build
npm run build

# Deploy to Vercel
vercel deploy --prod

# Environment variables
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
```

### iOS (App Store)
```bash
# Build iOS app
npm run build
npx cap copy ios
npx cap open ios

# In Xcode:
# - Set team & bundle ID
# - Configure signing
# - Archive → Upload to App Store
```

### Android (Play Store)
```bash
# Build Android app
npm run build
npx cap copy android
npx cap open android

# In Android Studio:
# - Build → Generate Signed Bundle
# - Upload to Play Console
```

---

## Monitoring & Analytics

### Error Tracking
- Sentry for frontend errors
- Supabase logs for backend errors

### Analytics
- PostHog for user behavior
- Supabase Analytics for API usage

### Performance Monitoring
- Web Vitals (Core Web Vitals)
- Lighthouse CI in GitHub Actions

---

**Last Updated**: 2025-10-17
**Version**: 1.0.0
**Status**: In Development
