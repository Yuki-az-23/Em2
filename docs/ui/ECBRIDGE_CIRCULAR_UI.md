# ECBridge Circular UI Design

## Overview

The ECBridge (Emotion-Color Bridge) selection interface should be an intuitive, visual, clockwise circular system where users first select a color, then see compatible emotions arranged in a circle.

---

## Design Philosophy

### Current Problem
- Separate emotion and color pickers feel disconnected
- No visual connection between emotion-color relationships
- Users don't understand which emotions pair with which colors
- Set once at signup, never updated

### New Approach
1. **Visual & Intuitive**: Circular, clockwise layout mirrors emotional spectrum
2. **Progressive Disclosure**: Select color first, then emotions appear
3. **Time-Based**: Prompt users to update every 2-3 hours
4. **Always Accessible**: Allow manual updates anytime

---

## Component Structure

```
ECBridge Modal
├── ECBridgeTimer (shows time since last update)
├── CurrentBridge Display (shows current emotion + color)
├── CircularColorPicker (Step 1)
└── CircularEmotionPicker (Step 2 - appears after color selected)
```

---

## Step 1: Circular Color Picker

### Layout (Clockwise from Top)

```
         🟡 Yellow (Joy)
              |
    Orange 🟠 | 🟢 Lime (Trust)
        \     |     /
         \    |    /
    Red 🔴  --|--  🟢 Green (Feared)
         /    |    \
        /     |     \
    Pink 💗 | 🔵 Aqua (Surprised)
              |
         🔵 Blue (Sad)
```

### Visual Design

**Component**: `CircularColorPicker.jsx`

**Structure**:
- 8 color buttons arranged in 360° circle
- Each color: 45° apart (360° / 8 = 45°)
- Positions (clockwise from top, 0° = 12 o'clock):
  - Yellow: 0° (top)
  - Lime: 45°
  - Green: 90° (right)
  - Aqua: 135°
  - Blue: 180° (bottom)
  - Pink: 225°
  - Red: 270° (left)
  - Orange: 315°

**Styling**:
```css
.circular-color-picker {
  width: 320px;
  height: 320px;
  position: relative;
}

.color-button {
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 4px solid transparent;
  cursor: pointer;
  transition: all 0.3s ease;

  /* Calculate position using trigonometry */
  /* left: 50% + cos(angle) * radius */
  /* top: 50% + sin(angle) * radius */
}

.color-button:hover {
  transform: scale(1.2);
  border-color: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.color-button.selected {
  border-color: var(--color-white);
  border-width: 6px;
  transform: scale(1.3);
  box-shadow: 0 0 20px rgba(255,255,255,0.8);
}
```

**Interaction**:
1. User hovers → button scales up slightly
2. User clicks → button selected with thick white border
3. Selected color shows "glow" effect
4. Other colors dim slightly
5. Emotion picker fades in below

---

## Step 2: Circular Emotion Picker

### Layout (Clockwise from Top)

```
         😊 Joy
            |
   Anticipated 🎯 | 🤝 Trust
            \   |   /
             \  |  /
       Angry 😠---|--- 😨 Feared
             /  |  \
            /   |   \
   Disgust 🤢 | 😲 Surprised
            |
         😢 Sad
```

### Visual Design

**Component**: `CircularEmotionPicker.jsx`

**Structure**:
- 8 emotion buttons arranged in 360° circle
- Each emotion: 45° apart
- Positions (same as colors):
  - Joy: 0° (top)
  - Trust: 45°
  - Feared: 90°
  - Surprised: 135°
  - Sad: 180°
  - Disgust: 225°
  - Angry: 270°
  - Anticipated: 315°

**Styling**:
```css
.circular-emotion-picker {
  width: 280px;
  height: 280px;
  position: relative;
  margin-top: var(--space-6);
  opacity: 0;
  animation: fadeIn 0.5s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}

.emotion-button {
  position: absolute;
  width: 80px;
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 50%;
  border: 3px solid var(--color-gray-300);
  cursor: pointer;
  transition: all 0.3s ease;
}

.emotion-button__icon {
  font-size: 32px;
  margin-bottom: 4px;
}

.emotion-button__label {
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}

.emotion-button:hover {
  transform: scale(1.15);
  border-color: var(--emotion-color);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.emotion-button.selected {
  background: var(--emotion-color);
  color: white;
  border-width: 4px;
  transform: scale(1.2);
  box-shadow: 0 0 20px var(--emotion-color);
}
```

---

## Emotion-Color Mappings

### Primary Associations (8 emotions × 8 colors)

| Emotion | Icon | Primary Color | Compatible Colors |
|---------|------|---------------|-------------------|
| Joy | 😊 | Yellow | Lime, Orange |
| Trust | 🤝 | Lime | Green, Yellow |
| Feared | 😨 | Green | Lime, Aqua |
| Surprised | 😲 | Aqua | Green, Blue |
| Sad | 😢 | Blue | Aqua, Pink |
| Disgust | 🤢 | Pink | Blue, Red |
| Angry | 😠 | Red | Pink, Orange |
| Anticipated | 🎯 | Orange | Red, Yellow |

### Filtering Logic

When user selects a color, show:
1. **Primary emotion** (main match) - highlighted
2. **Adjacent emotions** (compatible) - normal
3. **All others** - slightly dimmed (but still selectable)

Example: User selects **Yellow**
- Primary: Joy (brightest)
- Compatible: Trust (Lime neighbor), Anticipated (Orange neighbor)
- Others: Still visible but dimmed

---

## ECBridge Modal Flow

### Component: `ECBridgeModal.jsx`

```jsx
<Modal isOpen={showECBridgeModal} size="lg">
  <div className="ecbridge-modal">
    {/* Header */}
    <div className="ecbridge-modal__header">
      <h2>Update Your Emotion Bridge</h2>
      <ECBridgeTimer lastUpdate={user.last_bridge_update} />
    </div>

    {/* Current Bridge */}
    <div className="ecbridge-modal__current">
      <p>Current Bridge:</p>
      <Badge emotion={currentEmotion}>{currentEmotion}</Badge>
      <Badge>{currentColor}</Badge>
    </div>

    {/* Step 1: Color Selection */}
    <div className="ecbridge-modal__step">
      <label>Step 1: Select Your Color</label>
      <CircularColorPicker
        selected={selectedColor}
        onChange={setSelectedColor}
      />
    </div>

    {/* Step 2: Emotion Selection (appears after color) */}
    {selectedColor && (
      <div className="ecbridge-modal__step">
        <label>Step 2: Select Your Emotion</label>
        <CircularEmotionPicker
          selected={selectedEmotion}
          onChange={setSelectedEmotion}
          filterByColor={selectedColor}
        />
      </div>
    )}

    {/* Preview */}
    {selectedEmotion && selectedColor && (
      <div className="ecbridge-modal__preview">
        <p>New Bridge:</p>
        <Badge emotion={selectedEmotion}>{selectedEmotion}</Badge>
        <Badge>{selectedColor}</Badge>
      </div>
    )}

    {/* Actions */}
    <div className="ecbridge-modal__actions">
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="primary"
        emotion={selectedEmotion}
        onClick={handleUpdateBridge}
        disabled={!selectedEmotion || !selectedColor}
      >
        Update Bridge
      </Button>
    </div>
  </div>
</Modal>
```

---

## ECBridge Timer Component

### Component: `ECBridgeTimer.jsx`

Shows time since last update and encourages updates.

```jsx
<div className="ecbridge-timer">
  <div className="ecbridge-timer__icon">🕐</div>
  <div className="ecbridge-timer__text">
    Last updated: <strong>{timeSince}</strong> ago
  </div>
  {shouldUpdate && (
    <div className="ecbridge-timer__badge">
      ⏰ Time to update!
    </div>
  )}
</div>
```

**Timer Logic**:
- Calculate: `Date.now() - last_bridge_update`
- Display: "2 hours ago", "3 hours 15 mins ago"
- If > 2 hours: Show "Time to update!" badge
- If > 3 hours: Show with warning color

---

## Timing Strategy

### When to Show ECBridge Modal

**On Login**:
```javascript
useEffect(() => {
  if (user && isAuthenticated) {
    const lastUpdate = new Date(user.last_bridge_update);
    const hoursSince = (Date.now() - lastUpdate) / (1000 * 60 * 60);

    if (hoursSince >= 2) {
      // Show modal automatically
      setShowECBridgeModal(true);
    }
  }
}, [user, isAuthenticated]);
```

**Manual Access**:
- Button in navigation: "Update Bridge"
- Button in user menu
- Always available, anytime

**After Update**:
- Save to database: `last_bridge_update = NOW()`
- Save to history: `INSERT INTO ecbridge_history ...`
- Update user state
- Close modal

---

## Database Schema Updates

### Users Table - Add Columns

```sql
ALTER TABLE public.users
ADD COLUMN last_bridge_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Index for performance
CREATE INDEX users_last_bridge_update_idx
ON public.users(last_bridge_update);
```

### ECBridge History Table

```sql
CREATE TABLE public.ecbridge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emotion TEXT NOT NULL,
  color TEXT NOT NULL,
  duration INTERVAL, -- Calculated: next_update - this_update
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user history queries
CREATE INDEX ecbridge_history_user_id_idx
ON public.ecbridge_history(user_id, created_at DESC);
```

---

## Animation & Transitions

### Entrance Animation
- Modal fades in with scale: 0.9 → 1.0
- Color picker appears immediately
- Emotion picker fades in 300ms after color selected

### Hover Effects
- Scale: 1.0 → 1.15
- Border color change
- Shadow intensity increase

### Selection Animation
- Selected button: scale 1.2, thick border
- Other buttons: dim to 0.6 opacity
- Next step fades in smoothly

### Exit Animation
- Modal fades out
- "Updated!" toast notification
- Feed refreshes with new ECBridge filter

---

## Accessibility

### Keyboard Navigation
- Tab through colors clockwise
- Enter/Space to select
- Arrow keys to navigate
- Escape to close modal

### Screen Readers
```jsx
<button
  aria-label={`Select ${color} color`}
  aria-pressed={selected === color}
  role="radio"
>
```

### Color Blindness
- Add pattern/texture overlays on colors
- Strong border contrast
- Text labels alongside colors

---

## Mobile Considerations

### Touch Interactions
- Larger tap targets (60px minimum)
- No hover states on mobile
- Haptic feedback on selection (Capacitor)

### Screen Sizes
- Scale circle to fit: min 280px, max 360px
- Stack on very small screens (< 375px width)
- Reduce spacing between buttons

---

## Implementation Plan

### Phase 1: Core Components
1. Create `CircularColorPicker.jsx`
2. Create `CircularEmotionPicker.jsx`
3. Create `ECBridgeTimer.jsx`
4. Create `ECBridgeModal.jsx`

### Phase 2: Positioning Logic
1. Calculate button positions using trigonometry
2. Implement responsive sizing
3. Add animations

### Phase 3: State Management
1. Track selected color/emotion
2. Filter emotions by color
3. Save to database

### Phase 4: Timing System
1. Add `last_bridge_update` to users table
2. Create check on login
3. Implement history tracking

### Phase 5: Polish
1. Animations and transitions
2. Sound effects (optional)
3. Haptic feedback (mobile)
4. Accessibility testing

---

## Testing Checklist

- [ ] Color selection works on all devices
- [ ] Emotion picker appears after color selected
- [ ] Selections persist correctly
- [ ] Timer calculates correctly
- [ ] Modal shows at right times
- [ ] Database updates successfully
- [ ] History tracking works
- [ ] Animations smooth on mobile
- [ ] Keyboard navigation works
- [ ] Screen reader announces correctly
- [ ] Works on iOS simulator
- [ ] Works on Android emulator

---

**Status**: Design Specification Complete
**Next Step**: Begin implementation in Phase 3
**Owner**: To be implemented
**Priority**: High (Core UX feature)
