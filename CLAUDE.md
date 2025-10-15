# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EM2 (Emotion Manager 2) is a social media application built around emotions and colors. Users can create posts ("repeats") tagged with emotions and colors, and an "Emotion-Color Bridge" (ECBridge) algorithm determines how users interact with content based on their emotional state and color preferences.

The codebase consists of:
- **API** (Node.js/Express/MongoDB) - Backend REST API in `OLD/API/`
- **CLIENT** (React) - Frontend application in `OLD/CLIENT/`

## Core Architecture

### Emotion-Color Bridge (ECBridge) System

The ECBridge is the core algorithmic feature that determines user-content interactions. It exists in two forms:

1. **ECBrigeComment** (`OLD/API/services/ECBrigeComment/`) - Calculates emotional responses when users comment on posts
   - Takes 4 parameters: `userEmotion`, `userColor`, `postEmotion`, `postColor`
   - Returns calculated emotion/color combination based on interaction rules

2. **ECBrigeUser** (`OLD/API/services/ECBrigeUser/`) - Calculates user's feed filtering and emotional state
   - Takes 2 parameters: `userEmotion`, `userColor`
   - Determines what content users see in their feed

**Structure**: Both services follow a hierarchical pattern:
```
ECBrige.js (router)
  → emotions/{emotion}/{emotion}.js (emotion handler)
    → emotions/{emotion}/colors/{color}.js (emotion-color rules)
```

**8 Emotions**: Joy, Trust, Feared, Surprised, Sad, Disgust, Angry, Anticipated

**8 Colors**: yellow, lime, green, aqua, blue, pink, red, orange

Each emotion-color combination has specific interaction rules defined in individual color files. The system uses try-catch blocks with default fallbacks (`Disgust/orange`) for undefined combinations.

### Data Models

**User Schema** (`OLD/API/models/user.js`):
- Basic auth fields (name, email, hashed_password with salt using uuid)
- `emotion` and `color` - User's current emotional state
- `following`/`followers` arrays (ObjectId references)
- `photo` stored as Buffer
- Password encryption using crypto.createHmac with SHA1

**Post Schema** (`OLD/API/models/post.js`):
- `title` and `body` (supports EditorJS JSON format in `blooks` field)
- `emotion` and `color` - Current post state (can change based on interactions)
- `initialEmotion` and `initialColor` - Original post state (immutable)
- `postedBy` reference to User
- `brace` array - users who "braced" (liked) the post
- `comments` array with nested structure (text, created, postedBy)
- `photo` stored as Buffer
- `version` and `time` metadata

The distinction between initial and current emotion/color is critical - posts evolve emotionally based on user interactions.

## Common Development Commands

### API (OLD/API/)
```bash
cd OLD/API
npm install
npm start              # Runs on port 8080 (or PORT env variable)
```

**Environment Variables** (create `.env` file):
- `MONGO_URL` - MongoDB connection string
- `PORT` - Server port (default: 8080)
- `JWT_SECRET` - JSON Web Token secret

### CLIENT (OLD/CLIENT/)
```bash
cd OLD/CLIENT
npm install
npm start              # Development server (port 3000)
npm run build          # Production build (CI=false disables warnings as errors)
npm test               # Run tests
```

## API Architecture

**Entry Point**: `OLD/API/app.js`
- Express server with JWT authentication (express-jwt)
- Middleware: morgan (logging), body-parser, cookie-parser, express-validator, cors
- API documentation served at root `/` from `docs/apiDocs.json`
- Routes mounted at root level (no `/api` prefix)

**Routes**:
- `routes/auth.js` - Authentication endpoints
- `routes/user.js` - User CRUD, follow/unfollow, ECBridge updates
- `routes/post.js` - Post CRUD, comments, brace (like) functionality

**Controllers**:
- `conttrollers/auth.js` - Signup, signin logic
- `conttrollers/user.js` - User operations, profile management
- `conttrollers/post.js` - Post operations, ECBridge integration for comments

**Image Processing**: Uses `sharp` for image optimization and `formidable` for file uploads

## Frontend Architecture

**Entry Point**: `src/index.js` → `src/App.jsx` → `src/MainRouter.jsx`

**Routing** (React Router v5):
- All primary routes require authentication (PrivateRoute wrapper)
- Default route `/` shows Feed (user's personalized feed based on ECBridge)
- Lazy loading for heavy components (EditProfile, SinglePost, Following, Followers, Home, Feed)

**Key Components**:
- `core/EcBridge.jsx` - Modal for users to set their emotion/color bridge (affects feed algorithm)
- `post/Feed.jsx` - Main feed using ECBridge to filter and sort posts
- `post/Comment.jsx` - Comment system integrated with ECBridge calculations
- `post/EditorConfig.js` & `post/EditorStyle.js` - EditorJS configuration for rich text posts
- `user/FollowProfileBtn.jsx` - Follow/unfollow functionality

**State Management**: Uses local React state (useState) and authentication helpers in `auth/index.js`

**UI Framework**: Material-UI v4 for components and styling

## Important Implementation Notes

### Working with ECBridge

When modifying ECBridge logic:
1. Changes must be made symmetrically in both `ECBrigeComment` and `ECBrigeUser` services
2. Each emotion has a main file (e.g., `emotions/angry/angry.js`) that routes to color-specific rules
3. Color files (e.g., `emotions/angry/colors/red.js`) contain the actual calculation logic
4. Always provide fallback values in try-catch blocks
5. Test all 64 combinations (8 emotions × 8 colors) when adding new rules

### Authentication Flow

- JWT tokens stored in localStorage on client
- `isAuthenticated()` helper checks token validity
- API uses `express-jwt` middleware with `requireSignin` guard
- User authorization checks use `hasAuthorization` to verify ownership

### Post Creation and Updates

- Posts use EditorJS for rich content (stored in `blooks` field as JSON)
- Images are processed with Sharp (optimization) before storing as Buffer
- The `version` field tracks EditorJS version compatibility
- Comment additions trigger ECBridge recalculation of post emotion/color

### Typos in Codebase

Note these typos exist throughout:
- `conttrollers/` (should be `controllers/`)
- `ECBrige` (should be `ECBridge` but used consistently as "Brige")
- `SginIn`/`SginUp` (should be `SignIn`/`SignUp`)

Maintain consistency with existing spelling when working with these files to avoid breaking imports.

## Testing Strategy

No test framework is currently configured. When adding tests:
- API: Consider using Jest + Supertest for endpoint testing
- CLIENT: React Testing Library is already installed in package.json
- Focus on ECBridge calculation logic - this is the most critical business logic
- Test emotion-color combination edge cases and fallbacks
