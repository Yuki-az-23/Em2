# Supabase Database Setup

This directory contains all database migrations and configuration for EM2.

## Quick Start

### 1. Run Migrations

Go to your Supabase project's **SQL Editor** and run these files in order:

1. **001_initial_schema.sql** - Creates all tables, indexes, and base functions
2. **002_row_level_security.sql** - Sets up RLS policies for security
3. **003_ecbridge_functions.sql** - Adds ECBridge integration functions

### 2. Create Storage Buckets

Go to **Storage** in your Supabase dashboard and create:

1. **avatars** - For user profile pictures (public)
2. **post-images** - For post images (public)

Then run the storage policies section from `002_row_level_security.sql` (commented out).

### 3. Verify Setup

Run this query to verify everything is working:

```sql
-- Check tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Check RLS policies
SELECT * FROM rls_policy_audit;

-- Check functions
SELECT proname FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
ORDER BY proname;
```

## Database Schema

### Core Tables

#### users
- User accounts with ECBridge emotional state
- Fields: id, email, name, emotion, color, avatar_url, bio
- Indexes: email, emotion, color, created_at

#### posts
- User posts with evolving emotional state
- Fields: id, user_id, title, content (JSONB), emotion, color, initial_emotion, initial_color, intensity
- Indexes: user_id, emotion, color, created_at, content (GIN)

#### comments
- Comments on posts
- Fields: id, post_id, user_id, text
- Indexes: post_id, user_id, created_at

#### braces
- Post reactions/likes
- Fields: id, post_id, user_id
- Constraint: Unique per user+post

#### follows
- User follow relationships
- Fields: id, follower_id, following_id
- Constraint: Unique, can't follow yourself

#### ecbridge_logs
- Analytics log of ECBridge calculations
- Fields: user_id, post_id, emotions, colors, results, metadata

### Views

#### posts_with_stats
Pre-computed post statistics (brace_count, comment_count, author info)

#### users_with_stats
Pre-computed user statistics (post_count, follower_count, following_count)

## Functions Reference

### Interaction Functions

#### `toggle_brace(post_id, user_id)` → BOOLEAN
Like/unlike a post. Returns TRUE if braced, FALSE if unbraced.

```sql
SELECT toggle_brace('post-uuid', 'user-uuid');
```

#### `toggle_follow(follower_id, following_id)` → BOOLEAN
Follow/unfollow a user. Returns TRUE if followed, FALSE if unfollowed.

```sql
SELECT toggle_follow('user1-uuid', 'user2-uuid');
```

#### `add_comment_with_ecbridge(post_id, user_id, text, new_emotion, new_color, intensity)` → UUID
Add a comment and update post's emotional state. Returns comment ID.

```sql
SELECT add_comment_with_ecbridge(
  'post-uuid',
  'user-uuid',
  'Great post!',
  'Joy',
  'yellow',
  1.2
);
```

### Feed Functions

#### `get_enhanced_feed(user_id, limit, offset)` → TABLE
Get personalized feed with ECBridge affinity scoring.

```sql
SELECT * FROM get_enhanced_feed('user-uuid', 20, 0);
```

Returns:
- post_id, title, content, image_url
- emotion, color, intensity
- author info (id, name, avatar, emotion, color)
- brace_count, comment_count
- user_has_braced, user_is_following
- created_at, affinity_score

#### `get_following_feed(user_id, limit, offset)` → TABLE
Get posts from users you follow.

```sql
SELECT * FROM get_following_feed('user-uuid', 20, 0);
```

### Analytics Functions

#### `get_emotion_distribution()` → TABLE
Get distribution of emotions across all posts.

```sql
SELECT * FROM get_emotion_distribution();
-- Returns: emotion, count, percentage
```

#### `get_user_emotional_journey(user_id, days)` → TABLE
Get user's emotional evolution over time.

```sql
SELECT * FROM get_user_emotional_journey('user-uuid', 30);
-- Returns: date, emotion, color, post_count
```

#### `get_trending_posts(hours, limit)` → TABLE
Get most engaged posts in the last N hours.

```sql
SELECT * FROM get_trending_posts(24, 10);
-- Returns: post_id, title, emotion, color, engagement_score, etc.
```

### Search Functions

#### `search_posts(query, limit, offset)` → TABLE
Full-text search across post titles and content.

```sql
SELECT * FROM search_posts('emotion', 20, 0);
-- Returns: post_id, title, content, emotion, relevance, etc.
```

### Logging Functions

#### `log_ecbridge_calculation(...)` → UUID
Log an ECBridge calculation for analytics.

```sql
SELECT log_ecbridge_calculation(
  'user-uuid',
  'post-uuid',
  'Joy', 'yellow',  -- User state
  'Sad', 'blue',    -- Post state
  'Trust', 'lime',  -- Result
  1.2,              -- Intensity
  0.9,              -- Confidence
  'opposite',       -- Emotion relation
  'complementary'   -- Color harmony
);
```

## Row Level Security

All tables have RLS enabled. Key policies:

### Users
- ✅ Anyone can view profiles
- ✅ Users can update own profile only
- ❌ No one can delete (use is_active flag)

### Posts
- ✅ Anyone can view posts
- ✅ Authenticated users can create
- ✅ Users can update/delete own posts only

### Comments
- ✅ Anyone can view comments
- ✅ Authenticated users can create
- ✅ Users can update/delete own comments only

### Braces & Follows
- ✅ Anyone can view
- ✅ Authenticated users can add/remove own

## Realtime

Realtime is enabled for:
- posts
- comments
- braces
- follows

Subscribe in your app:

```javascript
const channel = supabase
  .channel('public:posts')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, payload => {
    console.log('Post changed:', payload);
  })
  .subscribe();
```

## Testing Queries

### Create a test user
```sql
INSERT INTO users (id, email, name, emotion, color, bio)
VALUES (
  uuid_generate_v4(),
  'test@em2.app',
  'Test User',
  'Joy',
  'yellow',
  'Testing EM2!'
);
```

### Create a test post
```sql
INSERT INTO posts (user_id, title, content, emotion, color, initial_emotion, initial_color)
SELECT
  id,
  'My First Post',
  '{"time": 1234567890, "blocks": [{"type": "paragraph", "data": {"text": "Hello EM2!"}}], "version": "2.31.0"}',
  'Joy',
  'yellow',
  'Joy',
  'yellow'
FROM users WHERE email = 'test@em2.app';
```

### Test the feed
```sql
SELECT * FROM get_enhanced_feed(
  (SELECT id FROM users WHERE email = 'test@em2.app'),
  10,
  0
);
```

## Troubleshooting

### RLS Errors
If you get "permission denied" errors, check:
1. RLS policies are created
2. You're authenticated (check `SELECT auth.uid()`)
3. The policy conditions match your request

### Function Errors
If functions fail:
1. Check function exists: `\df` in psql or check pg_proc
2. Verify parameters match function signature
3. Check permissions with `SECURITY DEFINER`

### Performance Issues
If queries are slow:
1. Check indexes are created: `\di` in psql
2. Analyze query plan: `EXPLAIN ANALYZE <your query>`
3. Consider adding indexes for common queries

## Migration History

| Migration | Description | Date |
|-----------|-------------|------|
| 001 | Initial schema (tables, indexes, views) | 2025-01-15 |
| 002 | Row Level Security policies | 2025-01-15 |
| 003 | ECBridge integration functions | 2025-01-15 |

## Next Steps

After running migrations:

1. ✅ Test with sample data
2. ✅ Configure storage buckets and policies
3. ✅ Set up authentication in your app
4. ✅ Test realtime subscriptions
5. ✅ Monitor with Supabase dashboard

## Resources

- [Supabase SQL Docs](https://supabase.com/docs/guides/database)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Realtime Guide](https://supabase.com/docs/guides/realtime)

---

**Database Version**: PostgreSQL 15
**Supabase Version**: Latest
**Last Updated**: 2025-01-15
