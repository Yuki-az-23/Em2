# UI Components

Emotion-themed React components. Styled only through the tokens in `src/styles/variables.css`;
they render in light and dark and in RTL without changes.

| Component | Role |
|---|---|
| `Avatar` | Pseudonym avatar with emotion ring |
| `Badge` | Emotion and status badges |
| `BraceButton` | The brace verb |
| `Button` | Buttons, 4 variants |
| `Card` | Surface with optional emotion accent |
| `ColorPicker` | 8 colors |
| `CommentCard` | One step of the trail: who moved the post where |
| `ContentRenderer` | Renders EditorJS blocks |
| `ECBridge` | CircularEmotionPicker: the visitor declares a state |
| `Editor` | EditorJS wrapper (unused by the exhibit) |
| `EmotionPicker` | 8 emotions as a list |
| `ErrorBoundary` | Catches render errors |
| `FollowButton` | Follow a pseudonym |
| `Input` | Text input with label and error |
| `LazyImage` | Image with placeholder |
| `Modal` | Dialog |
| `Navigation` | Door, wall, machine, me |
| `Post` | PostCard: a card on the wall |
| `PostCard` | Older card variant with swipe |
| `SkeletonLoader` | Loading placeholders |
| `Spinner` | Spinner and LoadingOverlay |
| `Textarea` | Multiline input |
| `TypingIndicator` | Three dots |

Tests exist for Button, Avatar and Badge. New components take their colors from `--color-*` and `--emotion-*` tokens only.
