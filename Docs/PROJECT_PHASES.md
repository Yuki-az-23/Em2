# EM2 Project Implementation Phases

## Project Overview

EM2 (Emotion Manager 2) is a cross-platform emotional social media app built with:
- **Frontend**: React + Vite + Capacitor (iOS/Android)
- **Backend**: Supabase (Serverless PostgreSQL + Auth + Realtime + Storage)
- **Core Feature**: ECBridge (Emotion-Color Bridge) algorithm

---

## 🎯 Current Status: Phase 1 - Foundation (70% Complete)

### ✅ Completed (Foundation)
1. **Project Structure**
   - Monorepo setup at root level
   - Vite + React 18 configured
   - Design system with CSS variables
   - Component library structure

2. **Authentication System**
   - Supabase client configuration
   - useAuth hook with full functionality
   - Login/Signup pages with working flow
   - Session management & persistence
   - PrivateRoute protection

3. **Basic Navigation**
   - React Router setup
   - Feed page (welcome message)
   - CreatePost page (textarea fallback)
   - Profile routing structure

### ⚠️ Issues Identified
1. **ECBridge UI/UX Issues**
   - Currently: Separate emotion/color pickers (not intuitive)
   - **NEEDED**: Clockwise circular selection
     - Select color first
     - Then show compatible emotions in circular layout
     - Visual connection between emotion-color pairs

2. **ECBridge Timing Issue**
   - Currently: Set once at signup
   - **NEEDED**: Timed updates (2-3 hours)
   - Should prompt user to update when they login
   - Allow manual updates anytime

3. **EditorJS Not Working**
   - Component exists but doesn't initialize
   - **NEEDED**: Fix EditorJS with extensions:
     - Link recognition (YouTube, Facebook, Twitter)
     - Image upload
     - Embed tools
     - Code blocks
     - Custom EmotionBlock

4. **Missing Backend Integration**
   - No database tables created yet
   - Posts can't be saved
   - No user profiles in database
   - No realtime subscriptions active

5. **Mobile Testing Not Setup**
   - Capacitor not configured for iOS
   - Android build not tested
   - Need device testing strategy

---

## 📋 Phase Breakdown

### **Phase 1: Foundation & Authentication** ✅ (Current - 70%)

**Goal**: Get basic app running with working authentication

**Tasks**:
- [x] Project structure and build setup
- [x] Design system implementation
- [x] Supabase client configuration
- [x] Authentication flow (login/signup)
- [x] Session management
- [x] Basic routing and navigation
- [ ] **Apply SQL migration for users table** ⚠️ CRITICAL
- [ ] Test auth flow end-to-end
- [ ] Document authentication architecture

**Deliverable**: Users can sign up, log in, and navigate between pages

---

### **Phase 2: Database Schema & Core Data Models** 🔄 (Next - 0%)

**Goal**: Create all database tables with proper relationships and RLS policies

**Tasks**:
1. **Users Table** (Already designed, needs deployment)
   - Profile data (name, email, bio, photo)
   - Current emotion/color state
   - ECBridge history tracking
   - Last bridge update timestamp

2. **Posts Table**
   ```sql
   - id (uuid, primary key)
   - user_id (uuid, foreign key to users)
   - title (text)
   - body (text) - plain text preview
   - content (jsonb) - full EditorJS data
   - emotion (text) - current emotion
   - color (text) - current color
   - initial_emotion (text) - original emotion
   - initial_color (text) - original color
   - created_at (timestamp)
   - updated_at (timestamp)
   ```

3. **Comments Table**
   ```sql
   - id (uuid, primary key)
   - post_id (uuid, foreign key to posts)
   - user_id (uuid, foreign key to users)
   - text (text)
   - emotion (text) - commenter's emotion at time
   - color (text) - commenter's color at time
   - created_at (timestamp)
   ```

4. **Follows Table**
   ```sql
   - follower_id (uuid, foreign key to users)
   - following_id (uuid, foreign key to users)
   - created_at (timestamp)
   - PRIMARY KEY (follower_id, following_id)
   ```

5. **Braces Table** (Likes)
   ```sql
   - user_id (uuid, foreign key to users)
   - post_id (uuid, foreign key to posts)
   - created_at (timestamp)
   - PRIMARY KEY (user_id, post_id)
   ```

6. **ECBridge History Table**
   ```sql
   - id (uuid, primary key)
   - user_id (uuid, foreign key to users)
   - emotion (text)
   - color (text)
   - duration (interval) - how long this bridge was active
   - created_at (timestamp)
   ```

**Deliverable**: All tables created with RLS policies, ready for data operations

---

### **Phase 3: ECBridge Circular UI & Logic** 🎨 (Priority)

**Goal**: Implement the clockwise circular emotion-color selection interface

**Design Concept**:
```
Step 1: Color Selection (Outer Ring)
   ┌─────────────────────┐
   │    🟡 Yellow        │
   │  🟢 Green  🔵 Blue  │
   │    🔴 Red           │
   └─────────────────────┘

Step 2: Emotion Selection (Inner Circle - appears after color selected)
   ┌─────────────────────┐
   │      😊 Joy         │
   │  🤝 Trust  😨 Fear  │
   │      😢 Sad         │
   └─────────────────────┘
```

**Tasks**:
1. **Create CircularColorPicker Component**
   - 8 colors arranged in circle
   - Clockwise: Yellow → Lime → Green → Aqua → Blue → Pink → Red → Orange
   - Visual feedback on hover/selection
   - Smooth animations

2. **Create CircularEmotionPicker Component**
   - Appears after color selected
   - Shows compatible emotions for chosen color
   - Clockwise: Joy → Trust → Feared → Surprised → Sad → Disgust → Angry → Anticipated
   - Icon + label for each emotion

3. **ECBridge Modal Component**
   - "Update Your Emotion Bridge" modal
   - Shows current bridge
   - Shows time since last update
   - Circular selection interface
   - "Update" button with confirmation

4. **ECBridge Timing Logic**
   - Track `last_bridge_update` timestamp in users table
   - Check on login: if > 2-3 hours, show modal
   - Allow manual updates anytime via button
   - Store history in `ecbridge_history` table

**Deliverable**: Beautiful circular UI for emotion-color selection with timed prompts

---

### **Phase 4: EditorJS Integration & Link Recognition** 📝

**Goal**: Rich text editor with automatic link embeds

**Tasks**:
1. **Fix EditorJS Initialization**
   - Debug mounting issue
   - Ensure proper cleanup on unmount
   - Test with simple config first

2. **Add Link Recognition Extensions**
   - @editorjs/link - Auto-fetch link previews
   - @editorjs/embed - YouTube, Vimeo, Facebook, Twitter embeds
   - @editorjs/image - Image uploads to Supabase Storage
   - @editorjs/attaches - File attachments

3. **Custom EmotionBlock Tool**
   - Inline emotion expressions
   - Renders as colored badges
   - Keyboard shortcut (CMD+SHIFT+E)

4. **Configure Supabase Storage**
   - Create `post-images` bucket
   - Upload handler in EditorJS Image tool
   - Proper RLS policies for images
   - CDN optimization

**Deliverable**: Rich text editor with automatic embeds for YouTube/social links

---

### **Phase 5: Post Creation & Display** 📄

**Goal**: Users can create and view posts

**Tasks**:
1. **Create Post Service**
   - `createPost()` - Save to Supabase
   - `getPosts()` - Fetch with pagination
   - `getPostById()` - Single post fetch
   - `updatePost()` - Edit existing
   - `deletePost()` - Delete with auth check

2. **Post Card Component**
   - Shows title, preview, emotion/color badges
   - User info (name, avatar)
   - Brace count, comment count
   - Timestamp

3. **Feed Implementation**
   - Replace welcome message with real posts
   - Infinite scroll / pagination
   - ECBridge filtering (later phase)
   - Loading states

4. **Single Post Page**
   - Full post display with EditorJS render
   - Comments section
   - Brace button
   - Share functionality

**Deliverable**: Users can create posts and see them in feed

---

### **Phase 6: Comments & ECBridge Interactions** 💬

**Goal**: Implement comment system with ECBridge emotion calculations

**Tasks**:
1. **Comment Service**
   - `addComment()` - With user's current emotion/color
   - `getComments()` - Fetch for a post
   - `deleteComment()` - Auth check

2. **ECBridge Comment Algorithm**
   - Implement `ECBrigeComment` calculation
   - Input: user emotion/color + post emotion/color
   - Output: new emotion/color based on interaction rules
   - Update post's emotion/color after each comment

3. **Comment Component**
   - Display commenter info
   - Show emotion/color badges
   - Timestamp
   - Nested replies (optional)

4. **Real-time Comments**
   - Supabase realtime subscription
   - Live updates when new comments added
   - Optimistic UI updates

**Deliverable**: Working comment system that affects post emotions via ECBridge

---

### **Phase 7: Follow System & User Profiles** 👥

**Goal**: Users can follow each other and view profiles

**Tasks**:
1. **Follow Service**
   - `followUser()`
   - `unfollowUser()`
   - `getFollowers()`
   - `getFollowing()`

2. **Profile Page**
   - User info display
   - Posts grid
   - Followers/Following counts
   - Follow/Unfollow button
   - Edit profile (own profile only)

3. **Feed Filtering**
   - Show posts from followed users only
   - Option to see "All Posts"
   - ECBridge-based sorting (next phase)

**Deliverable**: Complete user profile and follow system

---

### **Phase 8: ECBridge Feed Algorithm** 🌈

**Goal**: Filter and sort feed based on user's ECBridge state

**Tasks**:
1. **ECBrigeUser Algorithm**
   - Implement feed filtering logic
   - Input: user's emotion/color
   - Output: weighted/sorted posts
   - Consider emotional compatibility

2. **Feed Customization**
   - Toggle ECBridge filtering on/off
   - Show "Why am I seeing this?" explanations
   - Emotional compatibility score display

3. **Feed Performance**
   - Database indexes for emotion/color queries
   - Caching strategies
   - Pagination optimization

**Deliverable**: Intelligent emotional feed filtering

---

### **Phase 9: Realtime Features** ⚡

**Goal**: Live updates across the app

**Tasks**:
1. **Realtime Posts**
   - New posts appear without refresh
   - Post updates (emotion changes) reflect instantly

2. **Realtime Comments**
   - Comments appear live
   - Notifications for new comments on your posts

3. **Realtime Braces**
   - Brace counts update live
   - Who braced notifications

4. **Presence System**
   - Show who's online
   - Typing indicators (optional)

**Deliverable**: Real-time collaborative feel

---

### **Phase 10: Mobile Build & Testing** 📱

**Goal**: Cross-platform mobile apps (iOS/Android)

**Tasks**:
1. **Capacitor Configuration**
   - Configure `capacitor.config.ts`
   - Add iOS platform
   - Add Android platform

2. **iOS Build**
   - Xcode project setup
   - App icons & splash screens
   - Test on iPhone simulator
   - Test on real device

3. **Android Build**
   - Android Studio setup
   - App icons & splash screens
   - Test on Android emulator
   - Test on real device

4. **Mobile-Specific Features**
   - Native status bar styling
   - Keyboard handling
   - Push notifications (optional)
   - Native share sheet

5. **Testing Strategy**
   - Manual testing checklist
   - Device compatibility matrix
   - Performance testing

**Deliverable**: Working iOS and Android apps

---

### **Phase 11: Optimization & Polish** ✨

**Goal**: Production-ready performance and UX

**Tasks**:
1. **Performance Optimization**
   - Image compression (Supabase)
   - Lazy loading
   - Code splitting
   - Bundle size optimization
   - Database query optimization

2. **UI/UX Polish**
   - Animations and transitions
   - Loading states everywhere
   - Error handling and user feedback
   - Empty states
   - Skeleton screens

3. **Accessibility**
   - ARIA labels
   - Keyboard navigation
   - Screen reader support
   - Color contrast checks

4. **SEO (Web version)**
   - Meta tags
   - Open Graph tags
   - Sitemap

**Deliverable**: Production-ready app

---

### **Phase 12: Launch Preparation** 🚀

**Goal**: Deploy and monitor

**Tasks**:
1. **Production Deployment**
   - Vercel/Netlify for web
   - App Store submission (iOS)
   - Play Store submission (Android)

2. **Monitoring**
   - Error tracking (Sentry)
   - Analytics (PostHog/Mixpanel)
   - Performance monitoring

3. **Documentation**
   - User guide
   - API documentation
   - Developer docs

**Deliverable**: Live app in production

---

## 🔧 Architecture Decisions

### Serverless Approach (Supabase)

**Pros**:
- ✅ No backend code to maintain
- ✅ Built-in auth, storage, realtime
- ✅ PostgreSQL with full SQL power
- ✅ Auto-scaling
- ✅ Row Level Security for data protection
- ✅ Real-time subscriptions out of the box

**Considerations**:
- ⚠️ File compression: Handled via Supabase Storage transforms
- ⚠️ API optimization: Use database indexes and proper queries
- ✅ Storage: Supabase provides 1GB free, then pay-as-you-grow

### File Compression Strategy

**Images**:
- Upload original to Supabase Storage
- Use Supabase's image transformation API
- Example: `?width=800&quality=80` for thumbnails
- Store URLs in database, not files themselves

**EditorJS Content**:
- Store as JSONB in PostgreSQL
- Compress with gzip if needed (PostgreSQL handles this)
- Separate `body` (plain text preview) from `content` (full data)

**API Communication**:
- Supabase uses connection pooling
- Built-in caching
- Realtime uses WebSockets (efficient)

---

## 📊 Testing Strategy

### Development Testing
- Manual testing as we build
- Console logs for debugging
- React DevTools for component inspection

### Mobile Testing Plan

**iOS Testing**:
1. **Simulator Testing**
   - iPhone 14 Pro (latest)
   - iPhone SE (small screen)
   - iPad (tablet layout)

2. **Real Device Testing**
   - Test on at least 2 physical iPhones
   - Different iOS versions (15, 16, 17)

**Android Testing**:
1. **Emulator Testing**
   - Pixel 6 (latest)
   - Smaller device (budget phone simulation)
   - Tablet

2. **Real Device Testing**
   - Samsung Galaxy (OneUI)
   - Google Pixel (stock Android)
   - Different Android versions (11, 12, 13, 14)

**Test Cases**:
- [ ] Sign up / Login
- [ ] Create post with EditorJS
- [ ] View feed and scroll
- [ ] Comment on posts
- [ ] Follow/unfollow users
- [ ] Update ECBridge
- [ ] Upload images
- [ ] Navigate between pages
- [ ] Push notifications (if implemented)
- [ ] Offline behavior
- [ ] App resume from background

---

## 🎯 Immediate Next Steps (Priority Order)

1. **Apply SQL Migration** ⚠️ CRITICAL
   - Go to Supabase dashboard
   - Run `supabase/migrations/001_create_users_table.sql`
   - Test signup creates user profile

2. **Document ECBridge Circular UI**
   - Create mockups/wireframes
   - Define color-emotion mappings
   - Design component structure

3. **Create Remaining Database Tables**
   - Posts, Comments, Follows, Braces, ECBridge History
   - Write migration files
   - Apply to Supabase

4. **Fix Post Creation**
   - Implement `createPost()` service
   - Save to database instead of alert
   - Test end-to-end

5. **Build Circular ECBridge UI**
   - CircularColorPicker component
   - CircularEmotionPicker component
   - ECBridge modal with timer

---

## 📝 Notes & Decisions Log

### Why Supabase Over Traditional API?
- Faster development (no Express.js boilerplate)
- Built-in features (auth, storage, realtime)
- Better for MVP and quick iterations
- Can always migrate to custom API later if needed

### Why Textarea Instead of EditorJS (Temporary)?
- Unblocking decision to let you test immediately
- EditorJS will be re-enabled once debugged
- Users can still create content

### ECBridge Timing Decision
- User feedback: 2-3 hours is good interval
- Too short: annoying
- Too long: emotions change
- Allow manual updates anytime

---

## 🤝 Collaboration Notes

- Take iterative approach: build → test → refine
- Document as we go
- Don't try to perfect everything before shipping
- Test on real devices early and often
- Keep user feedback loop tight

---

**Last Updated**: 2025-10-17
**Current Phase**: Phase 1 - Foundation (70%)
**Next Milestone**: Complete Phase 1, start Phase 2 (Database Schema)
