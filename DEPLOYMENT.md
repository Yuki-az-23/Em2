# EM2 Deployment Guide 🚀

Complete guide for deploying EM2 to production across web and mobile platforms.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Web Deployment](#web-deployment)
  - [Vercel](#vercel-recommended)
  - [Netlify](#netlify)
  - [Custom Server](#custom-server)
- [Mobile Deployment](#mobile-deployment)
  - [iOS App Store](#ios-app-store)
  - [Google Play Store](#google-play-store)
- [Database Setup](#database-setup)
- [Environment Configuration](#environment-configuration)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring & Analytics](#monitoring--analytics)

---

## Prerequisites

### Required
- GitHub account
- Supabase project (production instance)
- Domain name (optional, for custom domains)

### For Mobile
- Apple Developer Account ($99/year) - for iOS
- Google Play Console Account ($25 one-time) - for Android
- macOS with Xcode 14+ - for iOS builds
- Android Studio with SDK 33+ - for Android builds

---

## Web Deployment

### Vercel (Recommended)

**Why Vercel?**
- Zero-config deployment for Vite
- Automatic HTTPS
- Global CDN
- Instant rollbacks
- Free tier available

#### Step 1: Prepare Repository

```bash
cd apps/mobile-web

# Ensure build works
npm run build

# Verify dist/ directory created
ls -la dist/
```

#### Step 2: Create vercel.json

Create `apps/mobile-web/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

#### Step 3: Deploy to Vercel

**Option A: Vercel CLI**

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd apps/mobile-web
vercel

# Deploy to production
vercel --prod
```

**Option B: Vercel Dashboard**

1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `apps/mobile-web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add environment variables (see [Environment Configuration](#environment-configuration))
6. Click "Deploy"

#### Step 4: Configure Domain (Optional)

1. In Vercel dashboard, go to project settings
2. Navigate to "Domains"
3. Add your custom domain
4. Update DNS records as instructed
5. Wait for SSL certificate (automatic)

---

### Netlify

#### Step 1: Create netlify.toml

Create `apps/mobile-web/netlify.toml`:

```toml
[build]
  base = "apps/mobile-web"
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

#### Step 2: Deploy

**Option A: Netlify CLI**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
cd apps/mobile-web
netlify deploy

# Deploy to production
netlify deploy --prod
```

**Option B: Netlify Dashboard**

1. Go to [netlify.com](https://netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect to GitHub
4. Configure:
   - **Base directory**: `apps/mobile-web`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Add environment variables
6. Click "Deploy site"

---

### Custom Server (VPS/Cloud)

For self-hosting on your own server:

#### Step 1: Build Application

```bash
cd apps/mobile-web
npm run build
```

#### Step 2: Set Up Server

```bash
# On your server (Ubuntu example)

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install nginx
sudo apt-get install -y nginx

# Install certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx
```

#### Step 3: Configure Nginx

Create `/etc/nginx/sites-available/em2`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/em2/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Security headers
    add_header X-Frame-Options "DENY";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/em2 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### Step 4: Enable HTTPS

```bash
sudo certbot --nginx -d your-domain.com
```

#### Step 5: Deploy Updates

```bash
# Upload dist/ to server
scp -r dist/* user@your-server:/var/www/em2/dist/
```

---

## Mobile Deployment

### iOS App Store

#### Prerequisites
- macOS with Xcode 14+
- Apple Developer Account ($99/year)
- Registered App ID on Apple Developer Portal

#### Step 1: Configure App

Edit `apps/mobile-web/capacitor.config.json`:

```json
{
  "appId": "com.yourcompany.em2",
  "appName": "EM2",
  "webDir": "dist",
  "ios": {
    "contentInset": "always"
  }
}
```

Edit `apps/mobile-web/package.json`:

```json
{
  "version": "1.0.0"
}
```

#### Step 2: Build Web Assets

```bash
cd apps/mobile-web
npm run build
npx cap sync ios
```

#### Step 3: Open in Xcode

```bash
npx cap open ios
```

#### Step 4: Configure in Xcode

1. **Signing & Capabilities**:
   - Select your Team
   - Update Bundle Identifier to match `appId`
   - Enable required capabilities (Camera, etc.)

2. **General**:
   - Set Display Name: "EM2"
   - Set Version: "1.0.0"
   - Set Build: "1"

3. **Info.plist**:
   - Add usage descriptions:
     ```xml
     <key>NSCameraUsageDescription</key>
     <string>EM2 needs camera access to capture photos for posts and profile</string>
     <key>NSPhotoLibraryUsageDescription</key>
     <string>EM2 needs photo library access to select images</string>
     ```

#### Step 5: Build for Release

1. Select "Any iOS Device" as target
2. Product → Archive
3. Wait for archive to complete
4. Click "Distribute App"
5. Choose "App Store Connect"
6. Select distribution certificate
7. Upload to App Store Connect

#### Step 6: App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Create new app
3. Fill in metadata:
   - **App Name**: EM2 - Emotion Manager
   - **Subtitle**: Express yourself through emotions
   - **Description**: (Write compelling description)
   - **Keywords**: emotion, social, feelings, color, community
   - **Category**: Social Networking
4. Upload screenshots (required sizes):
   - 6.5" iPhone (1242x2688)
   - 5.5" iPhone (1242x2208)
5. Add app icon (1024x1024)
6. Submit for review

**Review Time**: 1-3 days typically

---

### Google Play Store

#### Prerequisites
- Android Studio with SDK 33+
- Google Play Console Account ($25 one-time)

#### Step 1: Configure App

Edit `apps/mobile-web/capacitor.config.json`:

```json
{
  "appId": "com.yourcompany.em2",
  "appName": "EM2",
  "webDir": "dist",
  "android": {
    "allowMixedContent": false
  }
}
```

#### Step 2: Build Web Assets

```bash
cd apps/mobile-web
npm run build
npx cap sync android
```

#### Step 3: Open in Android Studio

```bash
npx cap open android
```

#### Step 4: Generate Signing Key

```bash
# Generate keystore
keytool -genkey -v -keystore em2-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias em2-key

# Follow prompts to set password and details
```

**IMPORTANT**: Store keystore file and passwords securely! You'll need them for every update.

#### Step 5: Configure Signing

Create `apps/mobile-web/android/key.properties`:

```properties
storePassword=your_store_password
keyPassword=your_key_password
keyAlias=em2-key
storeFile=../../../em2-release-key.jks
```

Edit `apps/mobile-web/android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file("key.properties")
            def keystoreProperties = new Properties()
            keystoreProperties.load(new FileInputStream(keystorePropertiesFile))

            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

#### Step 6: Build APK/AAB

In Android Studio:
1. Build → Generate Signed Bundle / APK
2. Select "Android App Bundle"
3. Select keystore file
4. Enter passwords
5. Choose "release" build variant
6. Click "Finish"

Or via command line:

```bash
cd apps/mobile-web/android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

#### Step 7: Google Play Console

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create new app
3. Fill in store listing:
   - **App name**: EM2 - Emotion Manager
   - **Short description**: Express yourself through emotions and colors
   - **Full description**: (Write compelling description)
   - **Category**: Social
   - **Tags**: emotion, social, feelings, community
4. Upload screenshots (required):
   - Phone: 16:9 aspect ratio (1080x1920 recommended)
   - Tablet (optional): 16:9 aspect ratio
5. Upload app icon (512x512)
6. Upload feature graphic (1024x500)
7. Content rating questionnaire
8. Upload AAB file
9. Submit for review

**Review Time**: Few hours to 1 week typically

---

## Database Setup

### Supabase Production

#### Step 1: Create Production Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Choose region (closest to users)
4. Set strong database password
5. Wait for provisioning (~2 minutes)

#### Step 2: Run Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to project
cd EM2
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

Or manually:
1. Go to SQL Editor in Supabase dashboard
2. Copy content of `supabase/migrations/001_initial_schema.sql`
3. Run query
4. Repeat for `002_row_level_security.sql`
5. Repeat for `003_ecbridge_functions.sql`

#### Step 3: Configure Storage

1. In Supabase dashboard, go to Storage
2. Create bucket: `avatars`
3. Set policies:
   - **SELECT**: public (anyone can view)
   - **INSERT**: authenticated (only logged-in users)
   - **UPDATE**: authenticated (owner only)
   - **DELETE**: authenticated (owner only)

#### Step 4: Enable Realtime

1. In Supabase dashboard, go to Database → Replication
2. Enable replication for:
   - `posts`
   - `comments`
   - `braces`
   - `follows`

---

## Environment Configuration

### Production Environment Variables

Create `.env.production` in `apps/mobile-web/`:

```env
# Supabase (Production)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_production_anon_key

# App Configuration
VITE_APP_NAME=EM2
VITE_APP_VERSION=1.0.0
VITE_APP_URL=https://em2.app

# Analytics (Optional)
VITE_GA_TRACKING_ID=G-XXXXXXXXXX
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_REPORTING=true
```

### Vercel Environment Variables

Add in Vercel dashboard (Settings → Environment Variables):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Set for: Production, Preview, Development

### Netlify Environment Variables

Add in Netlify dashboard (Site settings → Build & deploy → Environment):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Install dependencies
        run: |
          cd apps/mobile-web
          npm ci
      - name: Run tests
        run: |
          cd apps/mobile-web
          npm run test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Build
        run: |
          cd apps/mobile-web
          npm ci
          npm run build
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: dist
          path: apps/mobile-web/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - name: Download artifacts
        uses: actions/download-artifact@v3
        with:
          name: dist
          path: apps/mobile-web/dist
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: apps/mobile-web
```

---

## Monitoring & Analytics

### Error Tracking (Sentry)

```bash
npm install @sentry/react @sentry/vite-plugin
```

Add to `apps/mobile-web/src/main.jsx`:

```javascript
import * as Sentry from "@sentry/react";

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.1,
  });
}
```

### Analytics (Google Analytics)

```bash
npm install @analytics/google-analytics
```

Add to `apps/mobile-web/src/App.jsx`:

```javascript
import { useEffect } from 'react';

useEffect(() => {
  if (import.meta.env.VITE_GA_TRACKING_ID) {
    // Initialize GA
    window.gtag('config', import.meta.env.VITE_GA_TRACKING_ID);
  }
}, []);
```

### Performance Monitoring

- Use Vercel Analytics (built-in)
- Or Lighthouse CI for automated audits
- Monitor Core Web Vitals

---

## Post-Deployment Checklist

- [ ] SSL/HTTPS enabled and working
- [ ] All environment variables set correctly
- [ ] Database migrations applied
- [ ] Storage buckets configured
- [ ] Realtime enabled on tables
- [ ] Error tracking configured
- [ ] Analytics tracking verified
- [ ] Mobile apps signed and uploaded
- [ ] App store listings complete
- [ ] Test user flows end-to-end
- [ ] Monitor error logs first 24h
- [ ] Set up uptime monitoring

---

## Troubleshooting

### Build Fails

**Issue**: Vite build fails with memory error
**Solution**:
```bash
NODE_OPTIONS=--max_old_space_size=4096 npm run build
```

### Environment Variables Not Working

**Issue**: `import.meta.env.VITE_*` is undefined
**Solution**:
- Ensure variables start with `VITE_`
- Rebuild after adding new variables
- Check `.env` file is in correct location

### iOS Build Fails

**Issue**: Capacitor sync fails
**Solution**:
```bash
cd ios/App
pod install
```

### Android Build Fails

**Issue**: Gradle build error
**Solution**:
```bash
cd android
./gradlew clean
./gradlew build
```

---

## Support

For deployment issues:
- Check [Vercel Docs](https://vercel.com/docs)
- Check [Netlify Docs](https://docs.netlify.com)
- Check [Capacitor Docs](https://capacitorjs.com/docs)
- Open issue on [GitHub](https://github.com/Yuki-az-23/Em2/issues)

---

**Last Updated**: 2025-01-17
