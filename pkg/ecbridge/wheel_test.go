package ecbridge

import (
	"testing"

	"em2.social/em2/core"
)

func TestDistIsAWheelMetric(t *testing.T) {
	for a := uint8(0); a < core.WheelSize; a++ {
		if Dist(a, a) != 0 {
			t.Fatalf("Dist(%d,%d) != 0", a, a)
		}
		for b := uint8(0); b < core.WheelSize; b++ {
			d := Dist(a, b)
			if d < 0 || d > 4 || d != Dist(b, a) {
				t.Fatalf("Dist(%d,%d) = %d", a, b, d)
			}
			for c := uint8(0); c < core.WheelSize; c++ {
				if Dist(a, c) > d+Dist(b, c) {
					t.Fatalf("triangle inequality fails for %d %d %d", a, b, c)
				}
			}
		}
	}
	if Dist(0, 7) != 1 || Dist(0, 4) != 4 || Dist(1, 6) != 3 {
		t.Fatal("wrap-around wrong")
	}
	opp := ECDist(core.EC{Emotion: core.Joy, Color: core.Yellow}, core.EC{Emotion: core.Sad, Color: core.Blue})
	if opp != 1 {
		t.Fatalf("opposite bridges distance %v, want 1", opp)
	}
}
