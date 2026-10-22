# EM2 UI Reference - Design System

## ECBridge Circular Selector Design

### Visual Design (from mockup)

**Layout**:
```
           Joy (top)
              |
    Angry  ●--●--●  Trust
       ●          ●
         ●      ●
    Disgust  ●  Feared
         ●      ●
       ●          ●
      Sad  ●--●--●  Surprised
              |
        Anticipated
```

**Design Requirements**:
1. **Emotion Labels**: Text-only labels positioned around circle
2. **Stroked Circles**: Outline circles at each emotion position
3. **Center Display**: Shows selected "emotion + color" combination
4. **No Fill**: Black dots in mockup should be stroked outlines only
5. **Clean Typography**: Sans-serif, readable labels

**Interaction**:
- Tap emotion label to select
- Selected emotion highlights
- Center updates to show "emotion + color"

### CSS Implementation

```css
.ecbridge-selector {
  position: relative;
  width: 320px;
  height: 320px;
  margin: 0 auto;
}

.ecbridge-selector__center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  padding: 24px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  width: 120px;
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.ecbridge-selector__emotion {
  position: absolute;
  /* Position calculated based on angle */
}

.ecbridge-selector__emotion-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid var(--emotion-color);
  background: transparent;
  cursor: pointer;
  transition: all 0.3s ease;
}

.ecbridge-selector__emotion-circle:hover {
  background: var(--emotion-color);
  transform: scale(1.1);
}

.ecbridge-selector__emotion-circle.selected {
  background: var(--emotion-color);
  border-width: 3px;
  transform: scale(1.2);
}

.ecbridge-selector__emotion-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-gray-900);
  white-space: nowrap;
}
```

---

## Post Card Swipe Interactions

### Swipe Gesture System

**Behavior**:
1. **Swipe LEFT** → "Embrace" (brace/like the post)
   - Show embrace icon
   - Animate card left
   - Save brace to database
   - Remove from feed or mark as embraced

2. **Swipe RIGHT** → "Dissolve" (skip/hide the post)
   - Show dissolve icon
   - Animate card right
   - Don't show this post again
   - Move to next post

3. **Tap/Click** → View full post details

### Implementation Approach

**Using `react-swipeable` or custom touch events**:

```jsx
import { useSwipeable } from 'react-swipeable';

const PostCard = ({ post, onEmbrace, onDissolve }) => {
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [swipeDistance, setSwipeDistance] = useState(0);

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      // Track swipe in real-time
      setSwipeDistance(eventData.deltaX);
      if (eventData.deltaX < -50) {
        setSwipeDirection('left'); // Embrace
      } else if (eventData.deltaX > 50) {
        setSwipeDirection('right'); // Dissolve
      } else {
        setSwipeDirection(null);
      }
    },
    onSwipedLeft: () => {
      // Embrace action
      onEmbrace(post.id);
    },
    onSwipedRight: () => {
      // Dissolve action
      onDissolve(post.id);
    },
    trackMouse: true, // Allow mouse drag on desktop
    preventDefaultTouchmoveEvent: true
  });

  return (
    <div
      {...handlers}
      className="post-card"
      style={{
        transform: `translateX(${swipeDistance}px)`,
        transition: swipeDistance === 0 ? 'transform 0.3s ease' : 'none'
      }}
    >
      {/* Embrace indicator (left) */}
      {swipeDirection === 'left' && (
        <div className="swipe-indicator swipe-indicator--left">
          ❤️ Embrace
        </div>
      )}

      {/* Post content */}
      <div className="post-card__content">
        {/* Post UI */}
      </div>

      {/* Dissolve indicator (right) */}
      {swipeDirection === 'right' && (
        <div className="swipe-indicator swipe-indicator--right">
          🌫️ Dissolve
        </div>
      )}
    </div>
  );
};
```

### CSS for Swipe Indicators

```css
.post-card {
  position: relative;
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
  touch-action: pan-y; /* Allow vertical scroll but capture horizontal swipes */
  user-select: none;
}

.swipe-indicator {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: 24px;
  font-weight: bold;
  padding: 16px 24px;
  border-radius: 12px;
  opacity: 0.9;
  pointer-events: none;
  z-index: 10;
}

.swipe-indicator--left {
  left: 20px;
  background: linear-gradient(135deg, #ff6b6b, #ff4757);
  color: white;
  box-shadow: 0 4px 12px rgba(255, 71, 87, 0.4);
}

.swipe-indicator--right {
  right: 20px;
  background: linear-gradient(135deg, #a29bfe, #6c5ce7);
  color: white;
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.4);
}
```

---

## Feed Layout (Card Stack)

**Design from mockup**:
- Cards displayed one at a time (card stack)
- Current card in focus
- Navigation arrows (< >) for desktop
- Swipe for mobile
- Bottom navigation dots show position

```jsx
const Feed = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { posts } = usePosts();

  const handleEmbrace = (postId) => {
    // Save brace
    bracePost(postId);
    // Move to next
    setCurrentIndex(prev => prev + 1);
  };

  const handleDissolve = (postId) => {
    // Hide post
    // Move to next
    setCurrentIndex(prev => prev + 1);
  };

  const handlePrev = () => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => Math.min(posts.length - 1, prev + 1));
  };

  return (
    <div className="feed">
      <div className="feed-header">
        <button onClick={() => setShowECBridge(true)}>
          ECBridge
        </button>
      </div>

      <div className="feed-cards">
        {/* Previous button */}
        <button
          className="feed-nav feed-nav--prev"
          onClick={handlePrev}
          disabled={currentIndex === 0}
        >
          ‹
        </button>

        {/* Current card */}
        <PostCard
          post={posts[currentIndex]}
          onEmbrace={handleEmbrace}
          onDissolve={handleDissolve}
        />

        {/* Next button */}
        <button
          className="feed-nav feed-nav--next"
          onClick={handleNext}
          disabled={currentIndex === posts.length - 1}
        >
          ›
        </button>
      </div>

      {/* Position indicator dots */}
      <div className="feed-dots">
        {posts.map((_, idx) => (
          <button
            key={idx}
            className={`feed-dot ${idx === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
};
```

---

## Color Palette from Design

**Background**: Light gray/off-white (#F5F5F5)
**Post Card**: White with emotion-colored border
**Text**: Dark gray/black
**Emotion Colors**: As defined in variables.css

---

## Component Structure

```
src/components/
├── feed/
│   ├── PostCard/
│   │   ├── PostCard.jsx          # Main card with swipe
│   │   ├── PostCard.css
│   │   └── SwipeIndicator.jsx    # Embrace/Dissolve overlays
│   └── FeedStack/
│       ├── FeedStack.jsx         # Card stack container
│       └── FeedStack.css
├── ecbridge/
│   ├── ECBridgeModal/
│   │   ├── ECBridgeModal.jsx     # Modal wrapper
│   │   └── ECBridgeModal.css
│   └── CircularEmotionPicker/
│       ├── CircularEmotionPicker.jsx  # The circular selector
│       └── CircularEmotionPicker.css
```

---

## Animation Specs

**Swipe Animation**:
- Duration: 300ms
- Easing: cubic-bezier(0.4, 0, 0.2, 1)
- Transform: translateX()
- Fade out on complete swipe

**Card Transition**:
- New card fades in from center
- Duration: 400ms
- Scale from 0.95 to 1.0

**ECBridge Modal**:
- Backdrop fade: 200ms
- Modal scale: 300ms
- Start: scale(0.9), End: scale(1.0)

---

## Accessibility

**Keyboard Navigation**:
- Arrow keys: Navigate between posts
- Enter: View post details
- E key: Embrace current post
- D key: Dissolve current post
- ESC: Close modal

**Screen Readers**:
- Announce post author and emotion
- Announce swipe direction
- Announce current position (e.g., "Post 3 of 10")

---

## Mobile Considerations

**Touch Gestures**:
- Swipe threshold: 50px minimum
- Velocity detection for quick swipes
- Prevent accidental swipes (< 50px ignores)
- Visual feedback during swipe

**Responsive Breakpoints**:
- Mobile: < 768px (swipe only)
- Tablet: 768-1024px (swipe + arrows)
- Desktop: > 1024px (arrows prominent)

---

**Last Updated**: 2025-10-17
**Based on**: User-provided design mockups
**Status**: Ready for implementation
