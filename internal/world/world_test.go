package world

import (
	"testing"
	"time"
)

func TestClockAcrossDSTAndFractionalZones(t *testing.T) {
	s, err := New()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		utc, id, clock, date string
		offset               int
	}{
		{"2026-03-08T06:59:59Z", "new-york", "01:59:59", "2026-03-08", -5 * 3600},
		{"2026-03-08T07:00:00Z", "new-york", "03:00:00", "2026-03-08", -4 * 3600},
		{"2026-11-01T05:59:59Z", "new-york", "01:59:59", "2026-11-01", -4 * 3600},
		{"2026-11-01T06:00:00Z", "new-york", "01:00:00", "2026-11-01", -5 * 3600},
		{"2026-01-01T20:30:00Z", "delhi", "02:00:00", "2026-01-02", 19800},
		{"2026-01-01T20:30:00Z", "kathmandu", "02:15:00", "2026-01-02", 20700},
		{"2026-01-01T00:00:00Z", "adelaide", "10:30:00", "2026-01-01", 37800},
		{"2026-07-01T00:00:00Z", "adelaide", "09:30:00", "2026-07-01", 34200},
		{"2026-01-01T12:00:00Z", "kiritimati", "02:00:00", "2026-01-02", 50400},
	}
	for _, tc := range cases {
		t.Run(tc.id+tc.utc, func(t *testing.T) {
			now, err := time.Parse(time.RFC3339, tc.utc)
			if err != nil {
				t.Fatal(err)
			}
			snapshot := s.At(now)
			if snapshot.UTC != tc.utc {
				t.Fatalf("UTC = %s", snapshot.UTC)
			}
			for _, city := range snapshot.Cities {
				if city.ID != tc.id {
					continue
				}
				if city.Time != tc.clock || city.Date != tc.date || city.OffsetSeconds != tc.offset {
					t.Fatalf("got %+v, expected %s %s offset %d", city, tc.date, tc.clock, tc.offset)
				}
				return
			}
			t.Fatalf("missing city %s", tc.id)
		})
	}
}

func TestInvalidCatalogFailsInsteadOfSilentlyUsingUTC(t *testing.T) {
	for _, cities := range [][]City{
		{},
		{{ID: "bad", Name: "Bad", Timezone: "Invalid/Zone"}},
		{{ID: "bad", Name: "Bad", Timezone: "UTC", Lat: 91}},
		{{ID: "same", Name: "One", Timezone: "UTC"}, {ID: "same", Name: "Two", Timezone: "UTC"}},
	} {
		if _, err := newService(cities); err == nil {
			t.Fatal("expected invalid catalog to fail")
		}
	}
}
