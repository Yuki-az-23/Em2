// Package ecbridge is the pure ECBridge engine (BLUEPRINT B7). M2 ships the
// wheel geometry the dossier needs; score, target and pressure follow in M3.
package ecbridge

import "em2.social/em2/core"

// Dist is the distance between two wheel positions, 0..4.
func Dist(a, b uint8) int {
	d := int(a) - int(b)
	if d < 0 {
		d = -d
	}
	d %= core.WheelSize
	if d > core.WheelSize-d {
		d = core.WheelSize - d
	}
	return d
}

// ECDist is the combined emotion and color distance of two bridges, 0..1.
func ECDist(a, b core.EC) float64 {
	return float64(Dist(uint8(a.Emotion), uint8(b.Emotion))+Dist(uint8(a.Color), uint8(b.Color))) / 8
}
