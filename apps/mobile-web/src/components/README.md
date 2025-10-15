# UI Components

Emotion-themed, accessible React components for EM2.

## Components Created (Phase 4 - Part 1)

### Base Components
- **Button** - Emotion-themed button with variants and loading states
- **Input** - Form input with label, error, and helper text
- **Card** - Versatile container with emotion accent borders
- **Modal** - Accessible modal dialog with backdrop

### Emotion Components
- **EmotionPicker** - Interactive picker for 8 Plutchik emotions
- **ColorPicker** - Color picker for ECBridge colors

## Usage

```jsx
import {
  Button,
  Input,
  Card,
  Modal,
  EmotionPicker,
  ColorPicker
} from './components';

function MyComponent() {
  const [emotion, setEmotion] = useState('Joy');
  const [color, setColor] = useState('yellow');

  return (
    <Card emotion={emotion}>
      <EmotionPicker value={emotion} onChange={setEmotion} />
      <ColorPicker value={color} onChange={setColor} />
      <Button emotion={emotion} variant="primary">
        Submit
      </Button>
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

## Component Details

See individual component files for full API documentation with JSDoc comments.

## Coming Soon (Phase 4 - Part 2)

- Avatar
- PostCard
- CommentCard
- BraceButton
- FollowButton
- Header
- Sidebar
- Feed layouts
