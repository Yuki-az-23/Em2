package ecbridge

import (
	"embed"
	"encoding/json"

	"em2.social/em2/core"
)

//go:embed golden/*.json
var goldenFS embed.FS

// GoldenFiles are the parity tables other implementations (the SQL feed and
// the browser mirror) must reproduce. `em2 golden` regenerates them.
var GoldenFiles = []string{"compat-64x64.json", "target-4096.json"}

func allEC() []core.EC {
	out := make([]core.EC, 0, core.WheelSize*core.WheelSize)
	for e := 0; e < core.WheelSize; e++ {
		for c := 0; c < core.WheelSize; c++ {
			out = append(out, core.EC{Emotion: core.Emotion(e), Color: core.Color(c)})
		}
	}
	return out
}

// Golden computes one golden table with the given ruleset.
//
// compat-64x64: rows are receiver bridges, columns message states, both in
// order emotion*8+color. target-4096: rows are actor stances, columns message
// states; each cell is the target state as emotion*8+color.
func Golden(name string, r *Ruleset) ([]byte, error) {
	all := allEC()
	var body any
	switch name {
	case "compat-64x64.json":
		rows := make([][]float64, len(all))
		for i, u := range all {
			rows[i] = make([]float64, len(all))
			for j, p := range all {
				rows[i][j] = Compat(u, p, r.WEmotion)
			}
		}
		body = map[string]any{"ruleset": r.Version, "w_emotion": r.WEmotion, "index": "emotion*8+color", "rows": rows}
	case "target-4096.json":
		rows := make([][]int, len(all))
		for i, a := range all {
			rows[i] = make([]int, len(all))
			for j, p := range all {
				t := Target(a, p)
				rows[i][j] = int(t.Emotion)*core.WheelSize + int(t.Color)
			}
		}
		body = map[string]any{"index": "emotion*8+color", "rows": rows}
	default:
		return nil, &unknownGolden{name}
	}
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return append(b, '\n'), nil
}

// CheckedInGolden returns the golden table shipped in the repository.
func CheckedInGolden(name string) ([]byte, error) { return goldenFS.ReadFile("golden/" + name) }

type unknownGolden struct{ name string }

func (e *unknownGolden) Error() string { return "ecbridge: unknown golden table " + e.name }
