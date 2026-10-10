package core

import "time"

// Signal is one named, weighted piece of evidence in a dossier.
type Signal struct {
	Name     string  `json:"name"`
	Value    float64 `json:"value"`
	Weight   float64 `json:"weight"`
	Evidence string  `json:"evidence"`
}

// Dossier is the evidence EM2 gathers about one piece of content, keyed by
// content hash. Visible to the content's receivers, its author and the
// observer role only.
type Dossier struct {
	ContentHash []byte    `json:"content_hash"`
	FirstSeen   time.Time `json:"first_seen"`
	SeenCount   int       `json:"seen_count"`
	Senders     int       `json:"senders"`
	Receivers   int       `json:"receivers"`
	Clusters    int       `json:"clusters"`
	Velocity    float64   `json:"velocity"`
	Burstiness  float64   `json:"burstiness"`
	SenderConc  float64   `json:"sender_concentration"`
	Bridging    float64   `json:"bridging"`
	Drift       float64   `json:"drift"`
	Probe       float64   `json:"probe"`
	Links       []string  `json:"links,omitempty"`
	Signals     []Signal  `json:"signals"`
	Risk        float64   `json:"risk"`
	Version     string    `json:"version"`
}
