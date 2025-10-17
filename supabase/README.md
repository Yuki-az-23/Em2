# EM2 Supabase Setup

This directory contains database migrations and setup instructions for the EM2 Supabase backend.

## Quick Setup

### 1. Apply the Users Table Migration

Go to your Supabase project dashboard:
- Navigate to **SQL Editor**
- Copy the contents of `migrations/001_create_users_table.sql`
- Paste and run the SQL

This will:
- ✅ Create the `users` table extending `auth.users`
- ✅ Set up Row Level Security (RLS) policies
- ✅ Create indexes for performance
- ✅ Add triggers to auto-create profiles on signup
- ✅ Add timestamp auto-update triggers

### 2. Verify Setup

Run this query in SQL Editor to verify:

```sql
-- Check if users table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'users';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'users';
```

## Database Schema

### Users Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, references auth.users(id) |
| `name` | TEXT | User's display name (2-50 chars) |
| `email` | TEXT | User's email (unique) |
| `emotion` | TEXT | Current emotion state (8 Plutchik emotions) |
| `color` | TEXT | Current color preference (8 colors) |
| `photo` | TEXT | Profile photo URL |
| `bio` | TEXT | User bio (max 500 chars) |
| `created_at` | TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | Last update time (auto-updated) |

### Valid Values

**Emotions:** `joy`, `trust`, `feared`, `surprised`, `sad`, `disgust`, `angry`, `anticipated`

**Colors:** `yellow`, `lime`, `green`, `aqua`, `blue`, `pink`, `red`, `orange`

## Row Level Security (RLS)

The users table has the following security policies:

1. **View all profiles**: Anyone can read all user profiles
2. **Insert own profile**: Users can only create their own profile
3. **Update own profile**: Users can only update their own profile
4. **Delete own profile**: Users can only delete their own profile

## Auto-Profile Creation

When a user signs up via Supabase Auth, a profile is automatically created in the `users` table with:
- Their email
- Name from signup metadata (or "Anonymous")
- Emotion from metadata (or "joy" default)
- Color from metadata (or "yellow" default)

This is handled by the `handle_new_user()` trigger function.

## Testing the Setup

After running the migration, test with:

```sql
-- Try inserting a test user (will fail due to foreign key constraint, which is good)
INSERT INTO public.users (id, name, email, emotion, color)
VALUES (
  gen_random_uuid(),
  'Test User',
  'test@example.com',
  'joy',
  'yellow'
);
-- Expected: Error (foreign key constraint)

-- Check policies
SELECT * FROM pg_policies WHERE tablename = 'users';
-- Expected: 4 policies (SELECT, INSERT, UPDATE, DELETE)
```

## Troubleshooting

### Migration fails with "relation already exists"

The table already exists. You can drop it first:

```sql
DROP TABLE IF EXISTS public.users CASCADE;
```

Then run the migration again.

### RLS policies not working

Check if RLS is enabled:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'users';
```

Should show `rowsecurity = true`.

### Trigger not creating profiles

Check if the trigger exists:

```sql
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
```

If missing, re-run the trigger creation part of the migration.

## Next Steps

After setting up the users table:

1. Test signup flow in the application
2. Create additional tables (posts, comments, follows, etc.)
3. Set up Supabase Storage for profile photos
4. Configure Supabase Realtime subscriptions

## Environment Variables

Make sure your `.env` file has:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase SQL Editor](https://supabase.com/docs/guides/database/overview)
