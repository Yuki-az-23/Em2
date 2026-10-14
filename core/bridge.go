package core

import "fmt"

// Emotion is a position on the EM2 wheel (0..7).
type Emotion uint8

// Color is a position on the EM2 color wheel (0..7). Each emotion has the
// color with the same index as its home color.
type Color uint8

const (
	Joy Emotion = iota
	Trust
	Feared
	Surprised
	Sad
	Disgust
	Angry
	Anticipated
)

const (
	Yellow Color = iota
	Lime
	Green
	Aqua
	Blue
	Pink
	Red
	Orange
)

// WheelSize is the number of positions on both wheels.
const WheelSize = 8

var emotionNames = [WheelSize]string{"joy", "trust", "feared", "surprised", "sad", "disgust", "angry", "anticipated"}
var colorNames = [WheelSize]string{"yellow", "lime", "green", "aqua", "blue", "pink", "red", "orange"}

// valence is the emotional valence of each emotion, used by wellbeing.
var valence = [WheelSize]float64{1.0, 0.5, -0.5, 0.0, -1.0, -0.5, -0.75, 0.25}

// EmotionNames returns the wire names in wheel order.
func EmotionNames() []string { return append([]string(nil), emotionNames[:]...) }

// ColorNames returns the wire names in wheel order.
func ColorNames() []string { return append([]string(nil), colorNames[:]...) }

func (e Emotion) Valid() bool { return e < WheelSize }
func (c Color) Valid() bool   { return c < WheelSize }

func (e Emotion) String() string {
	if !e.Valid() {
		return fmt.Sprintf("emotion(%d)", uint8(e))
	}
	return emotionNames[e]
}

func (c Color) String() string {
	if !c.Valid() {
		return fmt.Sprintf("color(%d)", uint8(c))
	}
	return colorNames[c]
}

// Valence is the emotion's valence in [-1, 1].
func (e Emotion) Valence() float64 {
	if !e.Valid() {
		return 0
	}
	return valence[e]
}

// HomeColor is the color at the same wheel index.
func (e Emotion) HomeColor() Color { return Color(e) }

// ParseEmotion accepts only the exact lowercase wire name. There is no
// fallback: unknown input is an error.
func ParseEmotion(s string) (Emotion, error) {
	for i, n := range emotionNames {
		if n == s {
			return Emotion(i), nil
		}
	}
	return 0, fmt.Errorf("unknown emotion %q", s)
}

// ParseColor accepts only the exact lowercase wire name.
func ParseColor(s string) (Color, error) {
	for i, n := range colorNames {
		if n == s {
			return Color(i), nil
		}
	}
	return 0, fmt.Errorf("unknown color %q", s)
}

func (e Emotion) MarshalText() ([]byte, error) {
	if !e.Valid() {
		return nil, fmt.Errorf("invalid emotion %d", uint8(e))
	}
	return []byte(emotionNames[e]), nil
}

func (e *Emotion) UnmarshalText(b []byte) error {
	v, err := ParseEmotion(string(b))
	if err != nil {
		return err
	}
	*e = v
	return nil
}

func (c Color) MarshalText() ([]byte, error) {
	if !c.Valid() {
		return nil, fmt.Errorf("invalid color %d", uint8(c))
	}
	return []byte(colorNames[c]), nil
}

func (c *Color) UnmarshalText(b []byte) error {
	v, err := ParseColor(string(b))
	if err != nil {
		return err
	}
	*c = v
	return nil
}

// EC is an emotion and a color: a principal's bridge or a message's state.
type EC struct {
	Emotion Emotion `json:"emotion"`
	Color   Color   `json:"color"`
}

func (ec EC) String() string { return ec.Emotion.String() + "/" + ec.Color.String() }
