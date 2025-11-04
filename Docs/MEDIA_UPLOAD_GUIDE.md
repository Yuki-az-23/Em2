# EM2 Media Upload System - Complete Guide

## Overview

This guide covers the complete media upload system for EM2, including image and video uploads via Supabase Storage, integrated with EditorJS.

---

## Architecture

### Components

1. **Supabase Storage Buckets**
   - `post-images` - For images uploaded in posts (5MB limit)
   - `post-videos` - For videos uploaded in posts (50MB limit)
   - `avatars` - For user avatar images (existing)

2. **Media Storage Service** (`src/services/storage/mediaStorage.js`)
   - Handles file uploads to Supabase Storage
   - Validates file types and sizes
   - Generates unique filenames
   - Returns public URLs

3. **EditorJS Configuration** (`src/config/editorConfig.js`)
   - Image tool with Supabase uploader
   - Video tool with Supabase uploader
   - External embeds (YouTube, Vimeo, etc.)

4. **Content Renderer** (`src/components/ContentRenderer/`)
   - Displays uploaded images
   - Displays uploaded videos with HTML5 player
   - Handles external embeds

---

## Setup Instructions

### 1. Apply Database Migration

Run this migration in your Supabase dashboard:

```bash
# In Supabase SQL Editor
/home/user/Em2/supabase/migrations/005_create_storage_buckets.sql
```

This creates:
- `post-images` bucket (public, 5MB limit)
- `post-videos` bucket (public, 50MB limit)
- Storage policies for authenticated users

### 2. Install NPM Packages

```bash
npm install @weekwood/editorjs-video
```

This adds video upload capability to EditorJS.

### 3. Verify Supabase Storage

In Supabase Dashboard:
1. Go to Storage → Buckets
2. Verify `post-images` bucket exists
3. Verify `post-videos` bucket exists
4. Check that both are marked as "Public"

---

## Usage

### For Users (in CreatePost page)

#### Uploading Images

1. **Via File Upload**:
   - Click image tool in EditorJS toolbar
   - Select "Upload from device"
   - Choose image file (JPEG, PNG, GIF, WebP, SVG)
   - Max size: 5MB
   - Add optional caption

2. **Via URL**:
   - Click image tool in EditorJS toolbar
   - Select "Paste from URL"
   - Enter image URL
   - Add optional caption

#### Uploading Videos

1. **Via File Upload**:
   - Click video tool in EditorJS toolbar
   - Select "Upload from device"
   - Choose video file (MP4, WebM, OGG, QuickTime)
   - Max size: 50MB
   - Add optional caption

2. **Via URL**:
   - Click video tool in EditorJS toolbar
   - Select "Paste from URL"
   - Enter video URL
   - Add optional caption

#### Embedding Videos (YouTube, Vimeo, etc.)

1. Click embed tool in EditorJS toolbar
2. Paste video URL (e.g., `https://www.youtube.com/watch?v=...`)
3. Embedded player will appear automatically

---

## File Storage Structure

### Supabase Storage Organization

```
post-images/
  └── {user_id}/
      └── {timestamp}-{random}.{ext}

post-videos/
  └── {user_id}/
      └── {timestamp}-{random}.{ext}

avatars/
  └── {user_id}.{ext}
```

### Example File Paths

```
post-images/a1b2c3d4-e5f6/1730739200000-k8j2n1.jpg
post-videos/a1b2c3d4-e5f6/1730739200000-x9m4p2.mp4
avatars/a1b2c3d4-e5f6.jpg
```

---

## File Limits

| Media Type | Max Size | Allowed Formats |
|------------|----------|-----------------|
| **Images** | 5 MB | JPEG, PNG, GIF, WebP, SVG |
| **Videos** | 50 MB | MP4, WebM, OGG, QuickTime |
| **Avatars** | 5 MB | JPEG, PNG, GIF, WebP |

---

## Security

### Row Level Security (RLS)

**Upload Policies**:
- Users can only upload to folders matching their user ID
- All uploads require authentication
- Files are organized by user to prevent conflicts

**Read Policies**:
- All media has public read access
- Required for displaying media in posts

**Update/Delete Policies**:
- Users can only update/delete their own media
- Prevents unauthorized modifications

### Validation

**Client-side**:
- File type validation
- File size validation
- User authentication check

**Storage-level**:
- MIME type enforcement via bucket configuration
- Size limits enforced by Supabase

---

## API Reference

### Media Storage Service

#### `uploadPostImage(file, userId)`

Upload an image to Supabase Storage.

**Parameters**:
- `file` (File) - Image file to upload
- `userId` (string) - User ID (for folder organization)

**Returns**:
```javascript
{
  success: 1,
  file: {
    url: "https://...supabase.co/storage/v1/object/public/post-images/..."
  }
}
```

**Example**:
```javascript
import { uploadPostImage } from '../services/storage/mediaStorage';

const result = await uploadPostImage(imageFile, currentUser.id);
if (result.success) {
  console.log('Uploaded to:', result.file.url);
} else {
  console.error('Upload failed:', result.error);
}
```

---

#### `uploadPostVideo(file, userId)`

Upload a video to Supabase Storage.

**Parameters**:
- `file` (File) - Video file to upload
- `userId` (string) - User ID (for folder organization)

**Returns**:
```javascript
{
  success: 1,
  file: {
    url: "https://...supabase.co/storage/v1/object/public/post-videos/..."
  }
}
```

**Example**:
```javascript
import { uploadPostVideo } from '../services/storage/mediaStorage';

const result = await uploadPostVideo(videoFile, currentUser.id);
if (result.success) {
  console.log('Uploaded to:', result.file.url);
} else {
  console.error('Upload failed:', result.error);
}
```

---

#### `validateImageUrl(url)`

Validate an image URL for uploadByUrl.

**Parameters**:
- `url` (string) - Image URL to validate

**Returns**:
```javascript
{
  success: 1,
  file: {
    url: "https://example.com/image.jpg"
  }
}
```

---

#### `deletePostImage(url)`

Delete an image from Supabase Storage.

**Parameters**:
- `url` (string) - Public URL of the image

**Returns**:
```javascript
{
  success: true
}
```

---

#### `deletePostVideo(url)`

Delete a video from Supabase Storage.

**Parameters**:
- `url` (string) - Public URL of the video

**Returns**:
```javascript
{
  success: true
}
```

---

## EditorJS Tool Configuration

### Image Tool

```javascript
image: {
  class: ImageTool,
  config: {
    uploader: {
      uploadByFile: async (file) => {
        const { data: { user } } = await supabase.auth.getUser();
        return await uploadPostImage(file, user.id);
      },
      uploadByUrl: async (url) => {
        return await validateImageUrl(url);
      },
    },
    types: 'image/*',
    captionPlaceholder: 'Enter image caption',
    buttonContent: 'Select an image',
  },
}
```

### Video Tool

```javascript
video: {
  class: VideoTool,
  config: {
    uploader: {
      uploadByFile: async (file) => {
        const { data: { user } } = await supabase.auth.getUser();
        return await uploadPostVideo(file, user.id);
      },
      uploadByUrl: async (url) => {
        // Validate and return URL
      },
    },
    captionPlaceholder: 'Enter video caption',
    buttonContent: 'Select a video',
  },
}
```

---

## Content Rendering

### Displaying Images

The ContentRenderer automatically handles image blocks:

```javascript
// EditorJS data
{
  "type": "image",
  "data": {
    "file": {
      "url": "https://...supabase.co/storage/v1/object/public/post-images/..."
    },
    "caption": "My image caption"
  }
}

// Renders as:
<figure className="content-block content-block--image">
  <img src={url} alt={caption} loading="lazy" />
  <figcaption>{caption}</figcaption>
</figure>
```

### Displaying Videos

The ContentRenderer automatically handles video blocks:

```javascript
// EditorJS data
{
  "type": "video",
  "data": {
    "file": {
      "url": "https://...supabase.co/storage/v1/object/public/post-videos/..."
    },
    "caption": "My video caption"
  }
}

// Renders as:
<figure className="content-block content-block--video">
  <video src={url} controls preload="metadata">
    Your browser does not support the video tag.
  </video>
  <figcaption>{caption}</figcaption>
</figure>
```

---

## Troubleshooting

### Images Not Uploading

**Check**:
1. Is user logged in? (`supabase.auth.getUser()` returns user)
2. Is `post-images` bucket created in Supabase?
3. Is bucket set to "Public"?
4. Are storage policies applied correctly?
5. Is file size under 5MB?
6. Is file type supported (JPEG, PNG, GIF, WebP, SVG)?

**Debug**:
```javascript
// Check authentication
const { data: { user } } = await supabase.auth.getUser();
console.log('User:', user);

// Check bucket exists
const { data: buckets } = await supabase.storage.listBuckets();
console.log('Buckets:', buckets);

// Test upload manually
const { data, error } = await supabase.storage
  .from('post-images')
  .upload('test/test.jpg', file);
console.log('Upload result:', data, error);
```

---

### Videos Not Playing

**Check**:
1. Is video format supported? (MP4 works best)
2. Is video size under 50MB?
3. Is video URL accessible (check CORS)?
4. Is browser video codec supported?

**Browser Support**:
- Chrome/Edge: MP4, WebM, OGG
- Firefox: MP4, WebM, OGG
- Safari: MP4, QuickTime

---

### Images Disappear After Refresh

**This was the old bug - now fixed!**

**Old broken code**:
```javascript
// ❌ BROKEN: Creates temporary URL
uploadByFile: async (file) => {
  return {
    success: 1,
    file: { url: URL.createObjectURL(file) }
  };
}
```

**New working code**:
```javascript
// ✅ FIXED: Uploads to Supabase Storage
uploadByFile: async (file) => {
  const { data: { user } } = await supabase.auth.getUser();
  return await uploadPostImage(file, user.id);
}
```

---

## Performance Optimization

### Image Loading

- Images use `loading="lazy"` for better performance
- Placeholder shown on load error
- Max width constrained to container

### Video Loading

- Videos use `preload="metadata"` to reduce initial load
- HTML5 video player for native browser optimization
- Controls enabled by default

### Storage Considerations

- **Cache Control**: Files cached for 1 hour (`cacheControl: '3600'`)
- **Public Access**: All media publicly accessible for fast CDN delivery
- **Organization**: Files organized by user ID for easy management

---

## Migration from Old System

### Old System (Broken)

- Images sent to `/api/posts/photo` (doesn't exist)
- Temporary URLs created with `URL.createObjectURL()`
- Images disappeared on page refresh
- No video support

### New System (Fixed)

- Images uploaded to Supabase Storage
- Permanent public URLs
- Images persist across sessions
- Video support included
- Same pattern as working avatar uploads

---

## Future Enhancements

### Planned Features

1. **Image Optimization**
   - Automatic resizing on upload
   - WebP conversion for smaller files
   - Thumbnail generation

2. **Video Transcoding**
   - Convert videos to optimal formats
   - Generate preview thumbnails
   - Adaptive streaming support

3. **Gallery Tool**
   - Multiple images in single block
   - Drag-and-drop reordering
   - Lightbox viewer

4. **Advanced Video Features**
   - Video trimming in-editor
   - Subtitle support
   - Playback speed control

---

## Resources

- [EditorJS Documentation](https://editorjs.io/)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [@weekwood/editorjs-video](https://www.npmjs.com/package/@weekwood/editorjs-video)
- [Awesome EditorJS](https://github.com/editor-js/awesome-editorjs)

---

## Support

If you encounter issues:

1. Check this documentation
2. Verify Supabase Storage configuration
3. Check browser console for errors
4. Test with small files first
5. Verify user authentication status

---

**Last Updated**: 2025-11-04
**Version**: 1.0
**Status**: Production Ready ✅
