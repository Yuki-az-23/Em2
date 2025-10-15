# EM2 Setup Guide

This guide will help you get the EM2 application running on your local machine.

## Prerequisites

- **Node.js** 18+ and npm
- **Git**
- A **Supabase** account (free tier is fine)
- For mobile development:
  - **Xcode** (for iOS)
  - **Android Studio** (for Android)

## Quick Start

### 1. Install Dependencies

```bash
cd apps/mobile-web
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once created, go to Project Settings → API
3. Copy your project URL and anon/public key

### 3. Configure Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your Supabase credentials
# VITE_SUPABASE_URL=your_supabase_url_here
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 4. Set Up Database Schema

In your Supabase project, go to the SQL Editor and run the migrations from `/supabase/migrations/` (you'll create these in Phase 1).

For now, you can work without the database by using mock data.

### 5. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Mobile Development

### iOS Setup

```bash
# Add iOS platform
npx cap add ios

# Build and sync
npm run build
npx cap sync

# Open in Xcode
npx cap open ios
```

### Android Setup

```bash
# Add Android platform
npx cap add android

# Build and sync
npm run build
npx cap sync

# Open in Android Studio
npx cap open android
```

### Live Reload on Device

For a better development experience with live reload:

```bash
# Find your local IP
ipconfig getifaddr en0  # macOS
# or
ip addr show  # Linux

# Run dev server with host flag
npm run dev -- --host

# Then in capacitor.config.ts, temporarily add:
server: {
  url: 'http://YOUR_IP:5173',
  cleartext: true
}

# Sync and run
npx cap sync
npx cap run ios  # or android
```

## Project Structure

```
apps/mobile-web/
├── src/
│   ├── pages/           # Page components
│   ├── components/      # Reusable components
│   ├── services/        # Business logic & API
│   │   ├── supabase/    # Supabase client & services
│   │   └── ecbridge/    # ECBridge algorithm
│   ├── hooks/           # Custom React hooks
│   ├── context/         # React Context providers
│   ├── styles/          # Global styles & variables
│   ├── utils/           # Helper functions
│   └── types/           # Type definitions
├── public/              # Static assets
├── capacitor.config.ts  # Capacitor configuration
├── vite.config.js       # Vite configuration
└── package.json
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | Yes |
| `VITE_APP_NAME` | Application name | No |
| `VITE_APP_VERSION` | Application version | No |

## Troubleshooting

### Port Already in Use

If port 5173 is already in use:

```bash
npm run dev -- --port 3000
```

### Capacitor Not Found

If you get "capacitor: command not found":

```bash
npm install @capacitor/cli @capacitor/core
```

### Build Errors

Clear cache and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Supabase Connection Issues

1. Check your `.env` file has correct credentials
2. Ensure Supabase project is not paused (free tier pauses after inactivity)
3. Check Supabase project settings for API URL (should include `https://`)

## Next Steps

Once you have the app running:

1. ✅ Explore the ECBridge engine in `src/services/ecbridge/`
2. ✅ Read `src/services/ecbridge/README.md` to understand the algorithm
3. ✅ Check out the design system in `src/styles/variables.css`
4. ✅ Follow [MIGRATION_PLAN.md](../../MIGRATION_PLAN.md) to continue development

## Resources

- [Vite Documentation](https://vitejs.dev/)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev/)

## Getting Help

- Check the [MIGRATION_PLAN.md](../../MIGRATION_PLAN.md) for development roadmap
- Read [CLAUDE.md](../../CLAUDE.md) for architecture details
- Open an issue on GitHub for bugs or questions

---

Happy coding! 🎨✨
