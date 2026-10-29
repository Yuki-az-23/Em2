# EditorJS Integration for EM2

Complete EditorJS setup with emotion-aware theming and custom blocks for the EM2 social media platform.

## Components

### 1. Editor Component (`Editor.jsx`)

React wrapper for EditorJS with emotion theming and real-time stats.

**Features:**
- 8 Plutchik emotion themes
- Real-time word/character counting
- Max length validation with warnings
- Auto-save onChange callbacks
- Read-only mode support
- Loading states
- Accessibility support (ARIA, keyboard nav)

**Usage:**

```jsx
import { Editor } from '../components';
import { useState } from 'react';

function CreatePost() {
  const [content, setContent] = useState(null);
  const [emotion, setEmotion] = useState('joy');

  const handleChange = (data) => {
    setContent(data);
    console.log('Editor data:', data);
  };

  return (
    <Editor
      data={content}
      onChange={handleChange}
      emotion={emotion}
      placeholder="Share your emotions..."
      showStats={true}
      maxLength={5000}
      minHeight={400}
    />
  );
}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | object | null | Initial EditorJS data |
| `onChange` | function | () => {} | Callback when content changes |
| `onReady` | function | () => {} | Callback when editor is ready |
| `emotion` | string | 'joy' | Emotion theme (joy, trust, feared, etc.) |
| `placeholder` | string | 'Share your emotions...' | Placeholder text |
| `readOnly` | boolean | false | Read-only mode |
| `minHeight` | number | 300 | Minimum editor height (px) |
| `showStats` | boolean | true | Show word/character count |
| `maxLength` | number | null | Maximum character length |
| `className` | string | '' | Additional CSS classes |

### 2. ContentRenderer Component (`ContentRenderer.jsx`)

Renders EditorJS content as static HTML with emotion theming.

**Features:**
- Supports all EditorJS block types
- Emotion-themed quote blocks
- Truncation with "Read More" button
- Image lazy loading with error fallback
- Responsive embed containers
- Link preview cards
- HTML sanitization for security

**Usage:**

```jsx
import { ContentRenderer } from '../components';

function PostDisplay({ post }) {
  return (
    <ContentRenderer
      data={post.content}
      emotion={post.emotion}
      truncate={false}
    />
  );
}

// With truncation
function PostPreview({ post, onReadMore }) {
  return (
    <ContentRenderer
      data={post.content}
      emotion={post.emotion}
      truncate={true}
      maxBlocks={3}
      onReadMore={onReadMore}
    />
  );
}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | object | required | EditorJS data to render |
| `emotion` | string | 'joy' | Emotion theme |
| `truncate` | boolean | false | Truncate long content |
| `maxBlocks` | number | 3 | Max blocks when truncated |
| `onReadMore` | function | null | "Read More" button callback |
| `className` | string | '' | Additional CSS classes |

### 3. EmotionBlock (Custom Block)

Custom EditorJS block for expressing emotions within content.

**Features:**
- Interactive emotion picker (8 emotions)
- Optional text note
- Emotion badge display
- Emotion-themed styling

**Usage in Editor:**

The EmotionBlock is automatically available in the EditorJS toolbar with the 😊 icon.

**Keyboard Shortcut:** `CMD+SHIFT+E`

**Rendering:**

The EmotionBlock is automatically rendered by ContentRenderer when displaying posts.

## Configuration

### editorConfig.js

Central configuration for EditorJS setup.

**Available Tools:**
1. **Paragraph** - Default text block
2. **Header** - H2, H3, H4 headings (`CMD+SHIFT+H`)
3. **List** - Ordered/unordered lists (`CMD+SHIFT+L`)
4. **Quote** - Blockquotes with citation (`CMD+SHIFT+Q`)
5. **Code** - Code blocks (`CMD+SHIFT+C`)
6. **InlineCode** - Inline code snippets (`CMD+SHIFT+K`)
7. **Marker** - Text highlighting (`CMD+SHIFT+M`)
8. **Delimiter** - Section breaks (`CMD+SHIFT+D`)
9. **LinkTool** - Hyperlinks with previews
10. **Embed** - YouTube, Twitter, Instagram, CodePen, Vimeo
11. **Image** - Image uploads with captions
12. **EmotionBlock** - Custom emotion expression (`CMD+SHIFT+E`)

**Utility Functions:**

```javascript
import {
  getEditorConfig,
  validateEditorData,
  getPlainText,
  getWordCount,
  getCharacterCount,
  truncateEditorData,
  getEmotionTheme
} from '../config/editorConfig';

// Get configuration
const config = getEditorConfig({
  holder: 'editor-container',
  emotion: 'joy',
  placeholder: 'Start writing...',
});

// Validate data
const isValid = validateEditorData(editorData);

// Extract plain text
const text = getPlainText(editorData); // "Hello world..."

// Count words
const words = getWordCount(editorData); // 42

// Count characters
const chars = getCharacterCount(editorData); // 256

// Truncate content
const preview = truncateEditorData(editorData, 200); // First 200 chars

// Get emotion theme class
const themeClass = getEmotionTheme('joy'); // "editor-theme-joy"
```

## Complete Example: Post Creation

```jsx
import React, { useState } from 'react';
import { Editor, EmotionPicker, ColorPicker, Button, Input } from '../components';
import { usePost } from '../hooks';

function CreatePostPage() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(null);
  const [emotion, setEmotion] = useState('joy');
  const [color, setColor] = useState('yellow');
  const { createPost, loading } = usePost();

  const handleSubmit = async () => {
    if (!title || !content) {
      alert('Please provide a title and content');
      return;
    }

    try {
      await createPost({
        title,
        content,
        emotion,
        color,
      });

      // Navigate to post or feed
      navigate('/feed');
    } catch (error) {
      console.error('Failed to create post:', error);
      alert('Failed to create post');
    }
  };

  return (
    <div className="create-post">
      <h1>Create a New Post</h1>

      {/* Title Input */}
      <Input
        label="Post Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Give your post a title..."
        emotion={emotion}
        maxLength={100}
      />

      {/* Rich Text Editor */}
      <Editor
        data={content}
        onChange={setContent}
        emotion={emotion}
        placeholder="Share your thoughts and emotions..."
        showStats={true}
        maxLength={10000}
        minHeight={500}
      />

      {/* Emotion & Color Pickers */}
      <div className="emotion-controls">
        <EmotionPicker
          selected={emotion}
          onChange={setEmotion}
          layout="grid"
        />
        <ColorPicker
          selected={color}
          onChange={setColor}
          layout="inline"
        />
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        emotion={emotion}
        variant="primary"
        loading={loading}
        disabled={!title || !content}
      >
        Publish Post
      </Button>
    </div>
  );
}

export default CreatePostPage;
```

## Complete Example: Post Display

```jsx
import React from 'react';
import { ContentRenderer, Card, CardHeader, CardBody, Avatar, Badge, BraceButton, CommentCard } from '../components';
import { usePost, useBrace, useComments } from '../hooks';

function PostDetailPage({ postId }) {
  const { post, loading } = usePost(postId);
  const { toggleBrace, isBraced } = useBrace(postId);
  const { comments, addComment } = useComments(postId);

  if (loading) return <LoadingOverlay />;
  if (!post) return <div>Post not found</div>;

  return (
    <div className="post-detail">
      <Card emotion={post.emotion} variant="elevated">
        {/* Post Header */}
        <CardHeader>
          <Avatar
            name={post.postedBy.name}
            src={post.postedBy.photo}
            emotion={post.postedBy.emotion}
            status="online"
          />
          <div className="post-meta">
            <h3>{post.postedBy.name}</h3>
            <p>{formatTimeAgo(post.created)}</p>
          </div>
          <Badge variant="emotion" emotion={post.emotion}>
            {post.emotion}
          </Badge>
        </CardHeader>

        {/* Post Content */}
        <CardBody>
          <h1>{post.title}</h1>
          <ContentRenderer
            data={post.content}
            emotion={post.emotion}
          />
        </CardBody>

        {/* Post Actions */}
        <CardFooter>
          <BraceButton
            count={post.brace.length}
            isBraced={isBraced}
            onToggle={toggleBrace}
            emotion={post.emotion}
          />
        </CardFooter>
      </Card>

      {/* Comments Section */}
      <div className="comments">
        <h2>Comments ({comments.length})</h2>
        {comments.map(comment => (
          <CommentCard
            key={comment._id}
            author={comment.postedBy}
            emotion={comment.emotion}
            content={comment.text}
            timestamp={comment.created}
          />
        ))}
      </div>
    </div>
  );
}

export default PostDetailPage;
```

## Data Structure

### EditorJS Data Format

```json
{
  "time": 1672531200000,
  "blocks": [
    {
      "id": "block-1",
      "type": "header",
      "data": {
        "text": "My Emotional Journey",
        "level": 2
      }
    },
    {
      "id": "block-2",
      "type": "paragraph",
      "data": {
        "text": "Today I'm feeling <mark>amazing</mark>!"
      }
    },
    {
      "id": "block-3",
      "type": "emotion",
      "data": {
        "emotion": "joy",
        "color": "yellow",
        "text": "This captures how I feel right now"
      }
    },
    {
      "id": "block-4",
      "type": "image",
      "data": {
        "file": {
          "url": "https://example.com/image.jpg"
        },
        "caption": "Beautiful sunset",
        "withBorder": false,
        "stretched": false,
        "withBackground": false
      }
    }
  ],
  "version": "2.28.0"
}
```

### Post Model with EditorJS

```javascript
// MongoDB Post Schema
{
  _id: ObjectId,
  title: String,
  body: String,  // Plain text preview
  content: {     // Full EditorJS data
    time: Number,
    blocks: Array,
    version: String
  },
  emotion: String,
  color: String,
  initialEmotion: String,
  initialColor: String,
  postedBy: ObjectId,
  brace: [ObjectId],
  comments: [{
    text: String,
    emotion: String,
    color: String,
    created: Date,
    postedBy: ObjectId
  }],
  created: Date,
  updated: Date
}
```

## Styling

### Emotion Themes

All components support 8 emotion themes via CSS custom properties:

```css
/* Joy (Yellow) */
.editor--joy {
  --editor-theme-color: var(--emotion-joy-yellow);
}

/* Trust (Lime) */
.editor--trust {
  --editor-theme-color: var(--emotion-trust-lime);
}

/* Feared (Green) */
.editor--feared {
  --editor-theme-color: var(--emotion-feared-green);
}

/* Surprised (Aqua) */
.editor--surprised {
  --editor-theme-color: var(--emotion-surprised-aqua);
}

/* Sad (Blue) */
.editor--sad {
  --editor-theme-color: var(--emotion-sad-blue);
}

/* Disgust (Pink) */
.editor--disgust {
  --editor-theme-color: var(--emotion-disgust-pink);
}

/* Angry (Red) */
.editor--angry {
  --editor-theme-color: var(--emotion-angry-red);
}

/* Anticipated (Orange) */
.editor--anticipated {
  --editor-theme-color: var(--emotion-anticipated-orange);
}
```

### Custom Styling

Override default styles with custom classes:

```jsx
<Editor
  className="my-custom-editor"
  emotion="joy"
/>
```

```css
.my-custom-editor {
  border-radius: 24px;
  padding: 2rem;
}

.my-custom-editor:focus-within {
  box-shadow: 0 0 20px rgba(255, 255, 0, 0.3);
}
```

## Accessibility

- **ARIA Labels**: All interactive elements properly labeled
- **Keyboard Navigation**: Full keyboard support (Tab, Enter, Escape)
- **Screen Readers**: Semantic HTML with ARIA attributes
- **Focus Management**: Visible focus indicators
- **Reduced Motion**: Respects `prefers-reduced-motion`
- **High Contrast**: Supports `prefers-contrast: high`

## Performance

- **Lazy Loading**: Images load on demand
- **Code Splitting**: EditorJS loaded only when needed
- **Debounced Save**: onChange callbacks debounced
- **Optimized Rendering**: React.memo for ContentRenderer blocks
- **CSS-only Animations**: GPU-accelerated transforms

## Best Practices

1. **Always validate data** before saving:
   ```javascript
   if (validateEditorData(content)) {
     await savePost(content);
   }
   ```

2. **Store both EditorJS and plain text**:
   ```javascript
   const plainText = getPlainText(editorData);
   await savePost({
     content: editorData,  // Full EditorJS data
     body: plainText,      // Plain text for search/preview
   });
   ```

3. **Handle errors gracefully**:
   ```javascript
   try {
     await editor.save();
   } catch (error) {
     console.error('Save failed:', error);
     showErrorToast('Failed to save content');
   }
   ```

4. **Sanitize rendered content**:
   ```javascript
   // ContentRenderer automatically sanitizes HTML
   <ContentRenderer data={untrustedData} />
   ```

5. **Use emotion themes consistently**:
   ```javascript
   // Match editor emotion with post emotion
   <Editor emotion={post.emotion} />
   <ContentRenderer emotion={post.emotion} />
   ```

## Troubleshooting

### Editor not initializing
- Ensure holder element exists in DOM
- Check that EditorJS is imported correctly
- Verify all tools are installed via npm

### Content not rendering
- Validate data structure with `validateEditorData()`
- Check console for block type errors
- Ensure ContentRenderer CSS is imported

### Images not uploading
- Configure image upload endpoint in `editorConfig.js`
- Implement `/api/posts/photo` endpoint on backend
- Check Authorization header is set correctly

### EmotionBlock not appearing
- Verify EmotionBlock.js is imported in editorConfig
- Check that EmotionBlock.css is loaded
- Ensure emotion tool is registered in tools config

## Next Steps

- Phase 6: Build complete pages (Feed, CreatePost, PostDetail)
- Integrate with authentication system
- Add real-time collaboration
- Implement autosave functionality
- Add more custom blocks (poll, reaction, etc.)

---

**Generated**: Phase 5 | EditorJS Integration Complete
