# UI Components

Emotion-themed, accessible React components for EM2.

## Components Library (Phase 4)

### Base Components (Part 1 & 2)
- **Button** - Emotion-themed button with variants and loading states
- **Input** - Form input with label, error, and helper text
- **Textarea** - Multi-line input with auto-resize and character counter
- **Card** - Versatile container with emotion accent borders
- **Modal** - Accessible modal dialog with backdrop

### UI Elements (Part 2)
- **Avatar** - User avatar with emotion ring and status indicator
- **AvatarGroup** - Multiple avatars with overlap and overflow
- **Badge** - Labels for counts, status, or categories
- **BadgeIcon** - Badge with icon wrapper (for notifications)
- **Spinner** - Loading indicators with 3 variants (circle, dots, pulse)
- **LoadingOverlay** - Full-screen loading overlay

### Emotion Components (Part 1)
- **EmotionPicker** - Interactive picker for 8 Plutchik emotions
- **ColorPicker** - Color picker for ECBridge colors

## Usage

```jsx
import {
  Button,
  Input,
  Textarea,
  Card,
  Modal,
  Avatar,
  Badge,
  Spinner,
  EmotionPicker,
  ColorPicker
} from './components';

function MyComponent() {
  const [emotion, setEmotion] = useState('Joy');
  const [color, setColor] = useState('yellow');
  const [loading, setLoading] = useState(false);

  return (
    <Card emotion={emotion}>
      <Avatar
        src={user.avatar_url}
        name={user.name}
        emotion={emotion}
        status="online"
        showStatus
      />

      <Badge emotion={emotion} variant="emotion">
        {commentCount}
      </Badge>

      <EmotionPicker value={emotion} onChange={setEmotion} />
      <ColorPicker value={color} onChange={setColor} />

      <Textarea
        label="Your thoughts"
        maxLength={280}
        showCount
        autoResize
      />

      <Button
        emotion={emotion}
        variant="primary"
        loading={loading}
      >
        Post
      </Button>

      {loading && <Spinner emotion={emotion} />}
    </Card>
  );
}
```

## Features

✅ **Emotion theming** - All components support 8 emotions
✅ **Accessible** - ARIA labels, keyboard navigation, focus states
✅ **Responsive** - Mobile-first design
✅ **Pure CSS** - No CSS-in-JS, scalable variables
✅ **Consistent API** - Similar props across components
✅ **Loading states** - Built-in spinners and disabled states
✅ **Dark mode ready** - CSS variables for easy theming
✅ **Auto-resize** - Textarea grows with content
✅ **Status indicators** - Avatar shows online/offline/busy/away
✅ **Character counter** - Textarea tracks character count
✅ **Animations** - Smooth transitions (respects prefers-reduced-motion)

## Component Details

See individual component files for full API documentation with JSDoc comments.

## Total Components: 10

**Complete**: 10/10 base UI components
**Coming Next** (Phase 4 - Part 3): Post and User components
- PostCard
- CommentCard
- BraceButton
- FollowButton
- ProfileCard
