# Contract: Bridge

Go types: `core.Emotion`, `core.Color`, `core.EC` (`core/bridge.go`).

A bridge is an emotion and a color. Principals have one (their stance); messages have one (their
current state). Both live on the same eight-position wheel:

| Index | Emotion | Home color | Valence |
|---|---|---|---|
| 0 | joy | yellow | +1.00 |
| 1 | trust | lime | +0.50 |
| 2 | feared | green | −0.50 |
| 3 | surprised | aqua | 0.00 |
| 4 | sad | blue | −1.00 |
| 5 | disgust | pink | −0.50 |
| 6 | angry | red | −0.75 |
| 7 | anticipated | orange | +0.25 |

- Wheel distance: `dist(a, b) = min(|a − b|, 8 − |a − b|)`, in 0..4.
- Names are lowercase on the wire. `ParseEmotion` and `ParseColor` reject anything else; there is no
  silent default (the legacy `Disgust/orange` fallback is gone).
- A principal changes its bridge only through `PUT /v1/me/bridge`; every change is journaled with its
  source (`self`, `prompt`, `intervention`, `onboarding`, `agent`).
- A message's state changes only through accumulated pressure crossing the ruleset threshold θ. No
  endpoint sets it. Scoring, targets and pressure are specified in `docs/BLUEPRINT.md` section B7.
