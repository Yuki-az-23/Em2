# EM2 Modernization & Migration Plan

**Project**: Emotion Manager 2 (EM2) - Emotion-based Social Media Platform
**Goal**: Migrate from legacy Node.js/React stack to modern, scalable, cross-platform architecture
**Status**: Planning Phase

## Executive Summary

This plan outlines the complete migration of EM2 from a legacy Express/MongoDB/React stack to a modern architecture using:
- **Frontend**: Vite + React + Capacitor (Web + Native Mobile)
- **Backend**: Supabase (PostgreSQL, Auth, Real-time, Storage)
- **Content Editor**: EditorJS with modern plugins
- **Design System**: Pure scalable CSS with component-level organization

## Technology Stack Comparison

### Current (OLD)
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Auth: Custom JWT implementation with crypto
- Frontend: Create React App
- State: Local React state
- UI: Material-UI v4
- Mobile: None

### Target (NEW)
- Backend: Supabase (PostgreSQL + built-in APIs)
- Database: Supabase PostgreSQL with Row Level Security
- Auth: Supabase Auth (JWT, OAuth, Magic Links)
- Frontend: Vite + React 18+
- State: React Context + Hooks (or Zustand for complex state)
- UI: Pure CSS + CSS Modules
- Mobile: Capacitor (iOS + Android)
- Content: EditorJS 2.31+ with modern plugins

---

## Architecture Overview

### New Folder Structure

```
EM2/
├── apps/
│   └── mobile-web/                    # Capacitor + Vite + React app
│       ├── src/
│       │   ├── pages/                 # Page components
│       │   │   ├── auth/
│       │   │   │   ├── SignIn/
│       │   │   │   │   ├── SignIn.jsx
│       │   │   │   │   ├── SignIn.css
│       │   │   │   │   └── README.md
│       │   │   │   └── SignUp/
│       │   │   │       ├── SignUp.jsx
│       │   │   │       ├── SignUp.css
│       │   │   │       └── README.md
│       │   │   ├── feed/
│       │   │   │   ├── Feed/
│       │   │   │   │   ├── Feed.jsx
│       │   │   │   │   ├── Feed.css
│       │   │   │   │   └── README.md
│       │   │   ├── post/
│       │   │   │   ├── SinglePost/
│       │   │   │   ├── NewPost/
│       │   │   │   ├── EditPost/
│       │   │   ├── profile/
│       │   │   │   ├── Profile/
│       │   │   │   ├── EditProfile/
│       │   │   │   ├── Followers/
│       │   │   │   └── Following/
│       │   │   └── users/
│       │   │       └── Users/
│       │   ├── components/            # Reusable components
│       │   │   ├── layout/
│       │   │   │   ├── Navigation/
│       │   │   │   │   ├── Navigation.jsx
│       │   │   │   │   ├── Navigation.css
│       │   │   │   │   └── README.md
│       │   │   │   └── Header/
│       │   │   ├── post/
│       │   │   │   ├── PostCard/
│       │   │   │   ├── CommentList/
│       │   │   │   ├── BraceButton/
│       │   │   │   └── EmotionBadge/
│       │   │   ├── editor/
│       │   │   │   ├── RichEditor/
│       │   │   │   │   ├── RichEditor.jsx
│       │   │   │   │   ├── RichEditor.css
│       │   │   │   │   ├── editorConfig.js
│       │   │   │   │   └── README.md
│       │   │   ├── bridge/
│       │   │   │   ├── ECBridgeSelector/
│       │   │   │   │   ├── ECBridgeSelector.jsx
│       │   │   │   │   ├── ECBridgeSelector.css
│       │   │   │   │   └── README.md
│       │   │   │   └── EmotionColorPicker/
│       │   │   ├── ui/                # Generic UI components
│       │   │   │   ├── Button/
│       │   │   │   ├── Modal/
│       │   │   │   ├── Input/
│       │   │   │   ├── Card/
│       │   │   │   └── Loading/
│       │   ├── services/              # Business logic & API calls
│       │   │   ├── supabase/
│       │   │   │   ├── client.js
│       │   │   │   ├── auth.js
│       │   │   │   ├── posts.js
│       │   │   │   └── users.js
│       │   │   ├── ecbridge/          # ECBridge algorithm
│       │   │   │   ├── ECBridgeEngine.js
│       │   │   │   ├── emotionRules.js
│       │   │   │   ├── colorRules.js
│       │   │   │   └── README.md
│       │   ├── hooks/                 # Custom React hooks
│       │   │   ├── useAuth.js
│       │   │   ├── usePosts.js
│       │   │   ├── useECBridge.js
│       │   │   └── useRealtime.js
│       │   ├── context/               # React Context providers
│       │   │   ├── AuthContext.jsx
│       │   │   └── ECBridgeContext.jsx
│       │   ├── styles/                # Global styles
│       │   │   ├── global.css
│       │   │   ├── variables.css      # CSS custom properties
│       │   │   ├── emotions.css       # Emotion color themes
│       │   │   └── reset.css
│       │   ├── utils/                 # Helper functions
│       │   │   ├── validators.js
│       │   │   ├── dateHelpers.js
│       │   │   └── imageHelpers.js
│       │   ├── types/                 # Type definitions (JSDoc or TS)
│       │   │   └── index.js
│       │   ├── App.jsx
│       │   ├── main.jsx
│       │   └── routes.jsx
│       ├── public/
│       ├── android/                   # Capacitor Android
│       ├── ios/                       # Capacitor iOS
│       ├── capacitor.config.js
│       ├── vite.config.js
│       └── package.json
├── supabase/                          # Supabase configuration
│   ├── migrations/                    # Database migrations
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_ecbridge_functions.sql
│   │   └── 003_realtime_setup.sql
│   ├── functions/                     # Edge functions
│   │   └── ecbridge-calculator/
│   ├── seed.sql                       # Seed data
│   └── config.toml
├── docs/                              # Documentation
│   ├── API.md
│   ├── ECBRIDGE.md
│   ├── SETUP.md
│   └── COMPONENTS.md
├── OLD/                               # Legacy codebase (reference)
├── CLAUDE.md
├── MIGRATION_PLAN.md
└── README.md
```

---

## Phase-by-Phase Migration Plan

### Phase 0: Preparation & Setup (Week 1-2)
**Goal**: Set up development environment and project structure

#### Tasks:
- [ ] **0.1** Create new project structure
  - [ ] Initialize Vite + React project
  - [ ] Configure Capacitor for iOS/Android
  - [ ] Set up folder structure as defined above

- [ ] **0.2** Set up Supabase project
  - [ ] Create Supabase account and project
  - [ ] Configure database schema
  - [ ] Set up authentication providers
  - [ ] Configure storage buckets for images

- [ ] **0.3** Initialize version control
  - [ ] Create `.gitignore` for new structure
  - [ ] Set up environment variables structure
  - [ ] Document setup process in `docs/SETUP.md`

- [ ] **0.4** Development tools setup
  - [ ] ESLint + Prettier configuration
  - [ ] VS Code workspace settings
  - [ ] npm scripts for development workflow

**Completion Criteria**:
- New project builds successfully
- Supabase project is accessible
- Development environment is documented

---

### Phase 1: Database Migration (Week 3-4)
**Goal**: Migrate MongoDB schema to PostgreSQL with Supabase

#### Tasks:
- [ ] **1.1** Design PostgreSQL schema
  - [ ] Create `users` table with emotion/color fields
  - [ ] Create `posts` table with emotion tracking
  - [ ] Create `comments` table (normalized from embedded docs)
  - [ ] Create `braces` table (likes/reactions)
  - [ ] Create `follows` table (followers/following relationships)
  - [ ] Add indexes for performance

- [ ] **1.2** Implement Row Level Security (RLS) policies
  - [ ] User can only update their own profile
  - [ ] User can only delete their own posts
  - [ ] Public read access to posts/profiles
  - [ ] Comment authorization rules

- [ ] **1.3** Create database functions
  - [ ] Function to calculate post emotion changes
  - [ ] Function to get personalized feed based on ECBridge
  - [ ] Function to update follower counts
  - [ ] Function to calculate emotion statistics

- [ ] **1.4** Data migration script
  - [ ] Export data from MongoDB
  - [ ] Transform data format (especially EditorJS content)
  - [ ] Import into PostgreSQL
  - [ ] Verify data integrity

**Database Schema**:

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  emotion TEXT NOT NULL CHECK (emotion IN ('Joy', 'Trust', 'Feared', 'Surprised', 'Sad', 'Disgust', 'Angry', 'Anticipated')),
  color TEXT NOT NULL CHECK (color IN ('yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts table
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB, -- EditorJS content
  emotion TEXT NOT NULL,
  color TEXT NOT NULL,
  initial_emotion TEXT NOT NULL,
  initial_color TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments table
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Braces (likes) table
CREATE TABLE braces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Follows table
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- ECBridge calculation log (optional, for analytics)
CREATE TABLE ecbridge_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_emotion TEXT NOT NULL,
  user_color TEXT NOT NULL,
  post_emotion TEXT NOT NULL,
  post_color TEXT NOT NULL,
  result_emotion TEXT NOT NULL,
  result_color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Completion Criteria**:
- All tables created with RLS policies
- Data successfully migrated from MongoDB
- Database functions tested and working

---

### Phase 2: ECBridge Logic Redesign (Week 5-6)
**Goal**: Optimize and modernize ECBridge algorithm

#### Current Issues:
- 13,046 lines of repetitive if statements across 64 files
- No clear pattern documentation
- Difficult to test and maintain
- No validation or error handling

#### New Approach:
**Data-Driven Configuration System**

- [ ] **2.1** Extract rules into JSON/JavaScript configuration
  ```javascript
  // emotionRules.js
  export const EMOTIONS = {
    Joy: { opposite: 'Sad', complementary: 'Trust', intensity: 1.0 },
    Angry: { opposite: 'Joy', complementary: 'Disgust', intensity: 0.9 },
    // ... etc
  };

  export const COLORS = {
    yellow: { warmth: 1.0, intensity: 0.8, hex: '#FFFF00' },
    red: { warmth: 1.0, intensity: 1.0, hex: '#FF0000' },
    // ... etc
  };
  ```

- [ ] **2.2** Create rule-based engine
  ```javascript
  // ECBridgeEngine.js
  class ECBridgeEngine {
    calculateInteraction(userEmotion, userColor, postEmotion, postColor) {
      // Apply rules based on:
      // 1. Emotion compatibility (opposite, complementary, neutral)
      // 2. Color harmony (analogous, complementary, triadic)
      // 3. Intensity modifiers
      // 4. Historical patterns (optional ML layer)

      return { emotion, color, confidence };
    }
  }
  ```

- [ ] **2.3** Implement emotion theory rules
  - Plutchik's wheel of emotions logic
  - Opponent process theory
  - Color harmony principles
  - Intensity scaling based on interaction frequency

- [ ] **2.4** Create comprehensive test suite
  - [ ] Unit tests for each emotion-color combination
  - [ ] Edge case testing
  - [ ] Performance benchmarks
  - [ ] Visual regression testing for UI

- [ ] **2.5** Add analytics and insights
  - [ ] Track which rules are most frequently triggered
  - [ ] Measure emotional evolution of posts over time
  - [ ] User emotional journey analytics
  - [ ] A/B testing framework for rule adjustments

**Enhanced Features**:
- **Emotion Intensity**: Not just the emotion, but how strong it is (0-1 scale)
- **Temporal Evolution**: Posts can evolve through multiple emotional states
- **Personal Affinity**: User's interaction history influences future calculations
- **Context Awareness**: Time of day, user's recent activity, post age affect calculations

**Completion Criteria**:
- ECBridge engine covers all 64 combinations
- Test coverage > 90%
- Performance: < 10ms per calculation
- Documentation complete with examples

---

### Phase 3: Supabase Integration (Week 7-8)
**Goal**: Implement backend services with Supabase

- [ ] **3.1** Authentication setup
  - [ ] Email/password authentication
  - [ ] Social OAuth (Google, GitHub)
  - [ ] Magic link authentication
  - [ ] Session management
  - [ ] Password reset flow

- [ ] **3.2** Real-time subscriptions
  - [ ] Subscribe to new posts in feed
  - [ ] Live comment updates
  - [ ] Live brace count updates
  - [ ] Online user presence
  - [ ] Typing indicators (optional)

- [ ] **3.3** Storage configuration
  - [ ] User avatar uploads
  - [ ] Post image uploads
  - [ ] Image optimization policies
  - [ ] CDN configuration

- [ ] **3.4** Edge Functions (if needed)
  - [ ] ECBridge calculation endpoint
  - [ ] Complex feed algorithm
  - [ ] Notification triggers
  - [ ] Analytics aggregation

- [ ] **3.5** Create service layer
  ```javascript
  // services/supabase/posts.js
  export async function createPost(userId, postData) {
    // Calculate initial ECBridge values
    const ecBridge = calculateECBridge(postData);

    // Upload image if present
    const imageUrl = await uploadImage(postData.image);

    // Create post
    const { data, error } = await supabase
      .from('posts')
      .insert({...postData, ...ecBridge, imageUrl})
      .select()
      .single();

    return { data, error };
  }
  ```

**Completion Criteria**:
- All CRUD operations functional
- Real-time updates working
- File uploads operational
- Error handling implemented

---

### Phase 4: Core UI Components (Week 9-10)
**Goal**: Build reusable component library with pure CSS

#### Design System Principles:
- **CSS Custom Properties** for theming
- **BEM naming convention** for class names
- **Mobile-first responsive design**
- **Emotion-driven color system**
- **Accessibility (WCAG AA compliance)**

- [ ] **4.1** Base UI components
  - [ ] Button (with emotion color variants)
  - [ ] Input / Textarea
  - [ ] Card
  - [ ] Modal / Dialog
  - [ ] Loading spinners
  - [ ] Toast notifications

- [ ] **4.2** Layout components
  - [ ] Navigation (mobile + desktop)
  - [ ] Header
  - [ ] Footer
  - [ ] Grid system
  - [ ] Responsive containers

- [ ] **4.3** Emotion-specific components
  - [ ] EmotionBadge
  - [ ] ColorPicker
  - [ ] ECBridgeSelector (modal)
  - [ ] EmotionColorPicker (combined)
  - [ ] EmotionIndicator (animated)

- [ ] **4.4** Global styles
  ```css
  /* styles/variables.css */
  :root {
    /* Emotion Colors */
    --emotion-joy-yellow: #FFFF00;
    --emotion-trust-lime: #00FF00;
    --emotion-feared-green: #008000;
    --emotion-surprised-aqua: #00FFFF;
    --emotion-sad-blue: #0000FF;
    --emotion-disgust-pink: #FFC0CB;
    --emotion-angry-red: #FF0000;
    --emotion-anticipated-orange: #FFA500;

    /* Typography */
    --font-primary: system-ui, -apple-system, sans-serif;
    --font-size-base: 16px;
    --line-height-base: 1.5;

    /* Spacing */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;

    /* Borders */
    --border-radius-sm: 4px;
    --border-radius-md: 8px;
    --border-radius-lg: 16px;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.1);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  }
  ```

- [ ] **4.5** Component README template
  ```markdown
  # ComponentName

  ## Purpose
  [What this component does]

  ## Props
  - `propName` (type) - Description

  ## Usage
  ```jsx
  <ComponentName prop="value" />
  ```

  ## Styling
  - CSS file: `ComponentName.css`
  - Main classes: `.component-name`, `.component-name__element`

  ## Dependencies
  - List of other components used

  ## Notes
  - Special considerations
  ```

**Completion Criteria**:
- All base components built
- Every component has README
- Storybook/documentation site (optional)
- Responsive on all screen sizes

---

### Phase 5: EditorJS Integration (Week 11-12)
**Goal**: Implement rich content editor with modern plugins

- [ ] **5.1** EditorJS setup
  - [ ] Install EditorJS 2.31+
  - [ ] Configure base editor
  - [ ] Set up custom styling

- [ ] **5.2** Install and configure plugins
  - [ ] **@editorjs/header** - Headers (H1-H6)
  - [ ] **@editorjs/paragraph** - Text (built-in)
  - [ ] **@editorjs/list** - Ordered/unordered lists
  - [ ] **@editorjs/quote** - Blockquotes
  - [ ] **@editorjs/delimiter** - Separator
  - [ ] **@editorjs/image** - Image uploads
  - [ ] **@editorjs/embed** - YouTube, Vimeo, etc.
  - [ ] **editorjs-video** - Video uploads
  - [ ] **@envidual/editorjs-media** - Multi-media support
  - [ ] **editorjs-inline-image** - Inline images
  - [ ] **@editorjs/link** - Link embeds
  - [ ] **@editorjs/table** - Tables
  - [ ] **@editorjs/code** - Code blocks

- [ ] **5.3** Custom plugins (if needed)
  - [ ] Emotion/Color tag plugin
  - [ ] Mention (@user) plugin
  - [ ] Hashtag plugin

- [ ] **5.4** Renderer component
  - [ ] Use `editorjs-react-renderer` or build custom
  - [ ] Style rendered content
  - [ ] Handle all plugin outputs

- [ ] **5.5** Integration with Supabase Storage
  - [ ] Image upload handler
  - [ ] Video upload handler
  - [ ] File size limits
  - [ ] Format validation

**EditorJS Configuration**:
```javascript
// components/editor/RichEditor/editorConfig.js
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Image from '@editorjs/image';
import Embed from '@editorjs/embed';
import Video from 'editorjs-video';

export const EDITOR_TOOLS = {
  header: {
    class: Header,
    config: {
      placeholder: 'Enter a header',
      levels: [1, 2, 3, 4],
      defaultLevel: 2
    }
  },
  list: {
    class: List,
    inlineToolbar: true
  },
  image: {
    class: Image,
    config: {
      uploader: {
        async uploadByFile(file) {
          // Upload to Supabase Storage
          const { data, error } = await supabase.storage
            .from('post-images')
            .upload(`${userId}/${Date.now()}-${file.name}`, file);

          return {
            success: 1,
            file: {
              url: getPublicUrl(data.path)
            }
          };
        }
      }
    }
  },
  embed: {
    class: Embed,
    config: {
      services: {
        youtube: true,
        vimeo: true,
        twitter: true,
        instagram: true
      }
    }
  },
  video: {
    class: Video,
    config: {
      uploader: {
        // Similar to image upload
      }
    }
  }
};
```

**Completion Criteria**:
- Editor functional with all plugins
- Content saves/loads correctly
- Images/videos upload successfully
- Mobile-friendly editor experience

---

### Phase 6: Pages Implementation (Week 13-15)
**Goal**: Build all application pages

- [ ] **6.1** Authentication pages
  - [ ] SignIn page with email/password and OAuth
  - [ ] SignUp page with validation
  - [ ] Password reset page
  - [ ] Email verification page

- [ ] **6.2** Feed pages
  - [ ] Main Feed (personalized via ECBridge)
  - [ ] Filter by emotion/color
  - [ ] Infinite scroll
  - [ ] Pull-to-refresh (mobile)

- [ ] **6.3** Post pages
  - [ ] SinglePost view with comments
  - [ ] NewPost creation with EditorJS
  - [ ] EditPost functionality
  - [ ] Delete post confirmation

- [ ] **6.4** Profile pages
  - [ ] Profile view with user posts
  - [ ] EditProfile with avatar upload
  - [ ] Followers list
  - [ ] Following list
  - [ ] ECBridge settings

- [ ] **6.5** User discovery
  - [ ] Users list/search
  - [ ] Follow/unfollow buttons
  - [ ] User statistics

**Routing Structure**:
```javascript
// routes.jsx
import { lazy } from 'react';

const SignIn = lazy(() => import('./pages/auth/SignIn/SignIn'));
const SignUp = lazy(() => import('./pages/auth/SignUp/SignUp'));
const Feed = lazy(() => import('./pages/feed/Feed/Feed'));
const SinglePost = lazy(() => import('./pages/post/SinglePost/SinglePost'));
const NewPost = lazy(() => import('./pages/post/NewPost/NewPost'));
const EditPost = lazy(() => import('./pages/post/EditPost/EditPost'));
const Profile = lazy(() => import('./pages/profile/Profile/Profile'));
const EditProfile = lazy(() => import('./pages/profile/EditProfile/EditProfile'));
const Followers = lazy(() => import('./pages/profile/Followers/Followers'));
const Following = lazy(() => import('./pages/profile/Following/Following'));
const Users = lazy(() => import('./pages/users/Users/Users'));

export const routes = [
  { path: '/signin', component: SignIn, public: true },
  { path: '/signup', component: SignUp, public: true },
  { path: '/', component: Feed, protected: true },
  { path: '/post/:postId', component: SinglePost, protected: true },
  { path: '/post/new', component: NewPost, protected: true },
  { path: '/post/edit/:postId', component: EditPost, protected: true },
  { path: '/user/:userId', component: Profile, protected: true },
  { path: '/user/:userId/edit', component: EditProfile, protected: true },
  { path: '/user/:userId/followers', component: Followers, protected: true },
  { path: '/user/:userId/following', component: Following, protected: true },
  { path: '/users', component: Users, protected: true }
];
```

**Completion Criteria**:
- All pages implemented
- Navigation working
- Protected routes functional
- Mobile responsive

---

### Phase 7: Capacitor Native Features (Week 16-17)
**Goal**: Add mobile-specific functionality

- [ ] **7.1** Capacitor configuration
  - [ ] Configure `capacitor.config.js`
  - [ ] Set up app icons and splash screens
  - [ ] Configure app metadata

- [ ] **7.2** Native plugins integration
  - [ ] **Camera** - Take photos for posts/avatars
  - [ ] **Photos** - Pick from gallery
  - [ ] **Share** - Share posts to other apps
  - [ ] **Push Notifications** - Post engagement notifications
  - [ ] **Haptics** - Tactile feedback
  - [ ] **Status Bar** - Style native status bar
  - [ ] **Keyboard** - Keyboard behavior management

- [ ] **7.3** Platform-specific adjustments
  - [ ] iOS safe area handling
  - [ ] Android back button behavior
  - [ ] Platform-specific styling

- [ ] **7.4** Offline support
  - [ ] Service Worker configuration
  - [ ] Cache strategies
  - [ ] Offline detection
  - [ ] Queue failed requests

**Capacitor Config**:
```javascript
// capacitor.config.js
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.em2.app',
  appName: 'EM2',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#FFFFFF'
    }
  }
};

export default config;
```

**Completion Criteria**:
- App builds for iOS and Android
- Native features working
- Offline mode functional
- Push notifications operational

---

### Phase 8: Real-time Features (Week 18-19)
**Goal**: Implement live updates and notifications

- [ ] **8.1** Real-time post feed
  - [ ] Subscribe to new posts
  - [ ] Auto-update feed without refresh
  - [ ] Smooth insertion animations

- [ ] **8.2** Live comments
  - [ ] Real-time comment updates
  - [ ] Typing indicators (optional)
  - [ ] Comment animations

- [ ] **8.3** Live engagement
  - [ ] Real-time brace count updates
  - [ ] Live follower count
  - [ ] Online/offline user status

- [ ] **8.4** Notifications system
  - [ ] In-app notifications
  - [ ] Push notifications (via Capacitor)
  - [ ] Email notifications (via Supabase)
  - [ ] Notification preferences

**Real-time Implementation**:
```javascript
// hooks/useRealtime.js
import { useEffect } from 'react';
import { supabase } from '../services/supabase/client';

export function useRealtimePosts(feedPosts, setFeedPosts) {
  useEffect(() => {
    const subscription = supabase
      .channel('public:posts')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          setFeedPosts([payload.new, ...feedPosts]);
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          setFeedPosts(feedPosts.map(post =>
            post.id === payload.new.id ? payload.new : post
          ));
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [feedPosts]);
}
```

**Completion Criteria**:
- Real-time updates working
- No performance degradation
- Notifications functional
- User experience smooth

---

### Phase 9: Testing & Quality Assurance (Week 20-21)
**Goal**: Comprehensive testing across all platforms

- [ ] **9.1** Unit testing
  - [ ] Test ECBridge engine thoroughly
  - [ ] Test utility functions
  - [ ] Test hooks
  - [ ] Test services

- [ ] **9.2** Component testing
  - [ ] Test all UI components
  - [ ] Test user interactions
  - [ ] Test accessibility

- [ ] **9.3** Integration testing
  - [ ] Test complete user flows
  - [ ] Test Supabase integration
  - [ ] Test real-time features

- [ ] **9.4** E2E testing
  - [ ] Test authentication flow
  - [ ] Test post creation/editing
  - [ ] Test commenting/bracing
  - [ ] Test following/unfollowing

- [ ] **9.5** Mobile testing
  - [ ] Test on iOS devices
  - [ ] Test on Android devices
  - [ ] Test offline functionality
  - [ ] Test native features

- [ ] **9.6** Performance testing
  - [ ] Lighthouse audits
  - [ ] Load testing
  - [ ] Bundle size analysis
  - [ ] ECBridge performance benchmarks

**Testing Tools**:
- **Vitest** - Unit testing
- **React Testing Library** - Component testing
- **Playwright** or **Cypress** - E2E testing
- **Lighthouse CI** - Performance monitoring

**Completion Criteria**:
- Test coverage > 80%
- All critical paths tested
- Performance benchmarks met
- Accessibility score > 90

---

### Phase 10: Documentation & Deployment (Week 22-23)
**Goal**: Final documentation and production deployment

- [ ] **10.1** Technical documentation
  - [ ] Update CLAUDE.md with new architecture
  - [ ] Complete API documentation
  - [ ] Document ECBridge algorithm thoroughly
  - [ ] Component usage guide
  - [ ] Deployment guide

- [ ] **10.2** User documentation
  - [ ] User guide for app features
  - [ ] ECBridge concept explanation
  - [ ] FAQ section

- [ ] **10.3** Supabase production setup
  - [ ] Configure production database
  - [ ] Set up database backups
  - [ ] Configure RLS policies
  - [ ] Set up monitoring

- [ ] **10.4** Web deployment
  - [ ] Deploy to Vercel/Netlify
  - [ ] Configure custom domain
  - [ ] Set up SSL
  - [ ] Configure CDN

- [ ] **10.5** Mobile app deployment
  - [ ] Build production iOS app
  - [ ] Submit to App Store
  - [ ] Build production Android app
  - [ ] Submit to Google Play

- [ ] **10.6** Monitoring & analytics
  - [ ] Set up error tracking (Sentry)
  - [ ] Set up analytics (Plausible/Umami)
  - [ ] Set up performance monitoring
  - [ ] Set up uptime monitoring

**Completion Criteria**:
- All documentation complete
- Production environment live
- Mobile apps submitted/published
- Monitoring operational

---

## ECBridge Logic Enhancement

### Current Implementation Analysis

**Problems**:
1. **Repetitive Code**: 64 files × ~200 lines = 13,046 lines of if statements
2. **No Clear Rules**: Hard to understand the emotion/color logic
3. **Maintenance Nightmare**: Changes require updating 64+ files
4. **No Testing**: Impossible to unit test effectively
5. **No Scalability**: Can't easily add new emotions or colors

### Proposed New Implementation

#### 1. Rule-Based System

**Emotion Interaction Rules** (based on Plutchik's wheel):
- **Opposite emotions** create conflict → shift to neutral/transformed emotion
- **Adjacent emotions** amplify → intensify the target emotion
- **Same emotion** reinforces → maintain emotion, possibly shift color

```javascript
// services/ecbridge/emotionRules.js
export const EMOTION_RELATIONSHIPS = {
  Joy: {
    opposite: 'Sad',
    adjacent: ['Trust', 'Anticipated'],
    complementary: 'Trust'
  },
  Trust: {
    opposite: 'Disgust',
    adjacent: ['Joy', 'Feared'],
    complementary: 'Joy'
  },
  Feared: {
    opposite: 'Angry',
    adjacent: ['Trust', 'Surprised'],
    complementary: 'Surprised'
  },
  Surprised: {
    opposite: 'Anticipated',
    adjacent: ['Feared', 'Sad'],
    complementary: 'Feared'
  },
  Sad: {
    opposite: 'Joy',
    adjacent: ['Surprised', 'Disgust'],
    complementary: 'Disgust'
  },
  Disgust: {
    opposite: 'Trust',
    adjacent: ['Sad', 'Angry'],
    complementary: 'Sad'
  },
  Angry: {
    opposite: 'Feared',
    adjacent: ['Disgust', 'Anticipated'],
    complementary: 'Anticipated'
  },
  Anticipated: {
    opposite: 'Surprised',
    adjacent: ['Angry', 'Joy'],
    complementary: 'Angry'
  }
};
```

**Color Harmony Rules**:
- **Complementary colors** (opposite on wheel) create contrast
- **Analogous colors** (adjacent) create harmony
- **Triadic colors** create balance

```javascript
// services/ecbridge/colorRules.js
export const COLOR_HARMONY = {
  yellow: {
    complementary: 'blue',
    analogous: ['lime', 'orange'],
    triadic: ['red', 'blue']
  },
  lime: {
    complementary: 'pink',
    analogous: ['yellow', 'green'],
    triadic: ['pink', 'blue']
  },
  green: {
    complementary: 'red',
    analogous: ['lime', 'aqua'],
    triadic: ['orange', 'pink']
  },
  aqua: {
    complementary: 'orange',
    analogous: ['green', 'blue'],
    triadic: ['yellow', 'red']
  },
  blue: {
    complementary: 'yellow',
    analogous: ['aqua', 'pink'],
    triadic: ['red', 'lime']
  },
  pink: {
    complementary: 'lime',
    analogous: ['blue', 'red'],
    triadic: ['yellow', 'green']
  },
  red: {
    complementary: 'green',
    analogous: ['pink', 'orange'],
    triadic: ['blue', 'orange']
  },
  orange: {
    complementary: 'aqua',
    analogous: ['red', 'yellow'],
    triadic: ['lime', 'pink']
  }
};
```

#### 2. ECBridge Engine

```javascript
// services/ecbridge/ECBridgeEngine.js
import { EMOTION_RELATIONSHIPS } from './emotionRules';
import { COLOR_HARMONY } from './colorRules';

export class ECBridgeEngine {
  /**
   * Calculate the emotional response when a user interacts with a post
   * @param {string} userEmotion - User's current emotion
   * @param {string} userColor - User's current color
   * @param {string} postEmotion - Post's current emotion
   * @param {string} postColor - Post's current color
   * @returns {{emotion: string, color: string, intensity: number}}
   */
  calculateInteraction(userEmotion, userColor, postEmotion, postColor) {
    // 1. Determine emotion relationship
    const emotionRelation = this.getEmotionRelationship(userEmotion, postEmotion);

    // 2. Determine color harmony
    const colorHarmony = this.getColorHarmony(userColor, postColor);

    // 3. Calculate result based on both factors
    const result = this.applyRules(
      userEmotion, userColor,
      postEmotion, postColor,
      emotionRelation,
      colorHarmony
    );

    return result;
  }

  getEmotionRelationship(emotion1, emotion2) {
    const rules = EMOTION_RELATIONSHIPS[emotion1];

    if (emotion1 === emotion2) {
      return 'same';
    } else if (rules.opposite === emotion2) {
      return 'opposite';
    } else if (rules.adjacent.includes(emotion2)) {
      return 'adjacent';
    } else if (rules.complementary === emotion2) {
      return 'complementary';
    } else {
      return 'neutral';
    }
  }

  getColorHarmony(color1, color2) {
    const harmony = COLOR_HARMONY[color1];

    if (color1 === color2) {
      return 'same';
    } else if (harmony.complementary === color2) {
      return 'complementary';
    } else if (harmony.analogous.includes(color2)) {
      return 'analogous';
    } else if (harmony.triadic.includes(color2)) {
      return 'triadic';
    } else {
      return 'neutral';
    }
  }

  applyRules(userEmotion, userColor, postEmotion, postColor, emotionRelation, colorHarmony) {
    let resultEmotion = postEmotion;
    let resultColor = postColor;
    let intensity = 1.0;

    // Rule 1: Opposite emotions create transformation
    if (emotionRelation === 'opposite') {
      // Transform to complementary emotion
      resultEmotion = EMOTION_RELATIONSHIPS[userEmotion].complementary;
      intensity = 0.8;
    }

    // Rule 2: Adjacent emotions amplify
    else if (emotionRelation === 'adjacent') {
      // Keep post emotion but increase intensity
      resultEmotion = postEmotion;
      intensity = 1.2;
    }

    // Rule 3: Complementary emotions balance
    else if (emotionRelation === 'complementary') {
      // Blend toward user emotion
      resultEmotion = this.blendEmotions(userEmotion, postEmotion);
      intensity = 1.0;
    }

    // Rule 4: Same emotion reinforces
    else if (emotionRelation === 'same') {
      resultEmotion = postEmotion;
      intensity = 1.5;
    }

    // Color adjustments based on harmony
    if (colorHarmony === 'complementary') {
      // Shift to triadic color for balance
      resultColor = COLOR_HARMONY[userColor].triadic[0];
    } else if (colorHarmony === 'analogous') {
      // Harmonious - keep or slightly adjust
      resultColor = postColor;
    } else if (colorHarmony === 'same') {
      // Reinforce
      resultColor = userColor;
    } else {
      // Neutral - shift toward user color
      resultColor = this.blendColors(userColor, postColor);
    }

    return {
      emotion: resultEmotion,
      color: resultColor,
      intensity: Math.min(intensity, 2.0) // Cap at 2x
    };
  }

  blendEmotions(emotion1, emotion2) {
    // Find middle ground on emotion wheel
    // This could be more sophisticated
    const emotions = Object.keys(EMOTION_RELATIONSHIPS);
    const idx1 = emotions.indexOf(emotion1);
    const idx2 = emotions.indexOf(emotion2);
    const midIdx = Math.floor((idx1 + idx2) / 2);
    return emotions[midIdx];
  }

  blendColors(color1, color2) {
    // Simple blend - could use actual color mixing
    const colors = Object.keys(COLOR_HARMONY);
    const idx1 = colors.indexOf(color1);
    const idx2 = colors.indexOf(color2);
    const midIdx = Math.floor((idx1 + idx2) / 2);
    return colors[midIdx];
  }
}

// Singleton instance
export const ecBridgeEngine = new ECBridgeEngine();
```

#### 3. Usage Example

```javascript
// In a post controller or service
import { ecBridgeEngine } from '../services/ecbridge/ECBridgeEngine';

async function addComment(postId, userId, commentText) {
  // Get user's current ECBridge state
  const user = await getUserById(userId);
  const { emotion: userEmotion, color: userColor } = user;

  // Get post's current state
  const post = await getPostById(postId);
  const { emotion: postEmotion, color: postColor } = post;

  // Calculate new post state after this interaction
  const newState = ecBridgeEngine.calculateInteraction(
    userEmotion, userColor,
    postEmotion, postColor
  );

  // Update post
  await updatePost(postId, {
    emotion: newState.emotion,
    color: newState.color
  });

  // Save comment
  await createComment({ postId, userId, text: commentText });

  return newState;
}
```

#### 4. Benefits of New Approach

1. **Maintainable**: Rules in one place, easy to modify
2. **Testable**: Can unit test each rule independently
3. **Scalable**: Easy to add new emotions or colors
4. **Understandable**: Clear logic based on emotion theory
5. **Flexible**: Can add ML/AI layer later for personalization
6. **Performant**: Much faster than 64 files of conditionals

#### 5. Future Enhancements

- **Machine Learning Layer**: Train model on user interactions to personalize ECBridge
- **Emotional Journey**: Track user's emotional trajectory over time
- **Community Insights**: Analyze aggregate emotional patterns
- **Adaptive Rules**: Rules adjust based on community behavior
- **Intensity Visualization**: Show emotional intensity in UI
- **Emotion Prediction**: Predict user's future emotional state

---

## Technology Decision Rationale

### Why Vite?
- **Fast**: 10-100x faster than Create React App
- **Modern**: Native ESM, optimized for modern browsers
- **Simple**: Minimal configuration
- **Compatible**: Works seamlessly with Capacitor

### Why Capacitor?
- **Cross-platform**: One codebase for web, iOS, Android
- **Native access**: Full access to native device APIs
- **Web-first**: Progressive web app that can be enhanced
- **Maintained**: Backed by Ionic team

### Why Supabase?
- **All-in-one**: Database, Auth, Storage, Real-time in one service
- **PostgreSQL**: Powerful relational database with JSON support
- **Real-time**: Built-in real-time subscriptions
- **Scalable**: Handles growth without backend rewrite
- **Cost-effective**: Generous free tier, pay-as-you-grow

### Why Pure CSS?
- **Performance**: No CSS-in-JS runtime cost
- **Simplicity**: Easier for designers to understand
- **Portable**: Can be used anywhere
- **Scalable**: CSS custom properties make theming easy

### Why EditorJS?
- **Block-based**: Modern editing experience
- **Extensible**: Rich plugin ecosystem
- **JSON output**: Easy to store and render
- **Mobile-friendly**: Works well on touch devices

---

## Migration Checklist

### Pre-Migration
- [ ] Review this plan with team
- [ ] Set up project management tool (GitHub Projects, Jira, etc.)
- [ ] Assign responsibilities
- [ ] Set up communication channels
- [ ] Schedule regular check-ins

### During Migration
- [ ] Update checklist after each phase
- [ ] Document decisions and changes
- [ ] Keep OLD codebase as reference
- [ ] Regular testing throughout
- [ ] Seek feedback from users (beta testing)

### Post-Migration
- [ ] Performance audit
- [ ] Security audit
- [ ] User acceptance testing
- [ ] Gradual rollout
- [ ] Monitor metrics closely
- [ ] Gather user feedback
- [ ] Iterate and improve

---

## Risk Management

### Potential Risks

1. **Data Loss During Migration**
   - Mitigation: Multiple backups, test migration on copy first

2. **ECBridge Logic Discrepancies**
   - Mitigation: A/B test old vs new algorithm, allow gradual migration

3. **Performance Issues**
   - Mitigation: Load testing, performance budgets, monitoring

4. **User Adoption**
   - Mitigation: Familiar UI, gradual feature rollout, user education

5. **Mobile App Store Rejection**
   - Mitigation: Review guidelines early, test thoroughly, have backup plan

---

## Success Metrics

### Technical Metrics
- **Performance**:
  - Lighthouse score > 90
  - First Contentful Paint < 1.5s
  - Time to Interactive < 3s
  - ECBridge calculation < 10ms

- **Reliability**:
  - Uptime > 99.9%
  - Error rate < 0.1%
  - Test coverage > 80%

- **Scalability**:
  - Support 10k+ concurrent users
  - Database queries < 100ms
  - Real-time latency < 500ms

### Business Metrics
- **User Engagement**:
  - Daily Active Users (DAU)
  - Session length
  - Posts per user
  - Comments per post

- **Growth**:
  - User acquisition rate
  - Retention rate (Day 1, Day 7, Day 30)
  - App store ratings

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 0. Setup | 2 weeks | Dev environment, Supabase project |
| 1. Database | 2 weeks | PostgreSQL schema, data migrated |
| 2. ECBridge | 2 weeks | New algorithm, test suite |
| 3. Supabase | 2 weeks | Auth, real-time, storage working |
| 4. UI Components | 2 weeks | Component library complete |
| 5. EditorJS | 2 weeks | Rich editor integrated |
| 6. Pages | 3 weeks | All pages implemented |
| 7. Capacitor | 2 weeks | Mobile apps building |
| 8. Real-time | 2 weeks | Live updates working |
| 9. Testing | 2 weeks | Comprehensive test coverage |
| 10. Deploy | 2 weeks | Production deployment |
| **Total** | **23 weeks (~6 months)** | Fully migrated app |

---

## Next Steps

1. **Review this plan** - Discuss with stakeholders, adjust timeline/scope
2. **Set up project tracking** - Create issues for each task
3. **Begin Phase 0** - Set up development environment
4. **Schedule regular check-ins** - Weekly progress reviews
5. **Start documenting decisions** - Keep a decision log

---

## Resources & References

### Documentation
- [Vite Documentation](https://vitejs.dev/)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [EditorJS Documentation](https://editorjs.io/)
- [React Documentation](https://react.dev/)

### Tutorials
- [Vite + Capacitor Setup](https://capacitorjs.com/solution/react)
- [Supabase React Auth](https://supabase.com/docs/guides/auth/auth-helpers/auth-ui)
- [EditorJS React Integration](https://github.com/editor-js/awesome-editorjs)

### Tools
- [Supabase CLI](https://github.com/supabase/cli)
- [Capacitor CLI](https://capacitorjs.com/docs/cli)
- [Vite](https://www.npmjs.com/package/vite)

---

**Last Updated**: [Current Date]
**Version**: 1.0
**Maintainer**: Development Team
