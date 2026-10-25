package world

import (
	"math"
	"testing"
	"time"
)

func TestCityMarkersStayNearUrbanReferenceCenters(t *testing.T) {
	s, err := New()
	if err != nil {
		t.Fatal(err)
	}
	// WGS84 reference centres from GeoNames cities500 (CC BY 4.0), accessed 2026-10-25.
	// Keep a geographic tolerance rather than requiring one exact street address.
	references := map[string]struct{ lat, lon float64 }{
		"bogota":     {4.60971, -74.08175},  // GeoNames 3688689
		"lagos":      {6.45407, 3.39467},    // 2332459
		"kinshasa":   {-4.32758, 15.31357},  // 2314302
		"dhaka":      {23.7104, 90.40744},   // 1185241
		"singapore":  {1.28967, 103.85007},  // 1880252
		"kiritimati": {1.98487, -157.47502}, // 4030939, London Village rather than the island centroid
	}
	checked := 0
	for _, city := range s.cities {
		ref, ok := references[city.ID]
		if !ok {
			continue
		}
		lat1, lat2 := city.Lat*math.Pi/180, ref.lat*math.Pi/180
		dlat, dlon := (city.Lat-ref.lat)*math.Pi/180, (city.Lon-ref.lon)*math.Pi/180
		a := math.Pow(math.Sin(dlat/2), 2) + math.Cos(lat1)*math.Cos(lat2)*math.Pow(math.Sin(dlon/2), 2)
		km := 12742 * math.Asin(math.Sqrt(math.Min(1, a)))
		if km > 3 {
			t.Errorf("%s is %.2f km from its urban reference centre", city.ID, km)
		}
		checked++
	}
	if checked != len(references) {
		t.Errorf("checked %d of %d references", checked, len(references))
	}
}

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
		{"2026-01-01T20:30:00Z", "almaty", "01:30:00", "2026-01-02", 5 * 3600},
		{"2026-07-01T20:30:00Z", "almaty", "01:30:00", "2026-07-02", 5 * 3600},
		{"2024-02-29T17:59:59Z", "almaty", "23:59:59", "2024-02-29", 6 * 3600},
		{"2024-02-29T18:00:00Z", "almaty", "23:00:00", "2024-02-29", 5 * 3600},
		{"2026-01-01T20:30:00Z", "ulaanbaatar", "04:30:00", "2026-01-02", 8 * 3600},
		{"2026-07-01T20:30:00Z", "ulaanbaatar", "04:30:00", "2026-07-02", 8 * 3600},
		{"2026-01-01T12:00:00Z", "baker-island", "00:00:00", "2026-01-01", -12 * 3600},
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

func TestCatalogCoversUTCOffsetsInBothSeasons(t *testing.T) {
	s, err := New()
	if err != nil {
		t.Fatal(err)
	}
	// Integer UTC offsets -12..+14 and the non-seasonal fractional offsets.
	always := []int{-570, 210, 270, 330, 345, 390, 525, 570}
	for hour := -12; hour <= 14; hour++ {
		always = append(always, hour*60)
	}
	union := make(map[int]bool)
	for _, tc := range []struct {
		utc      string
		seasonal []int
	}{
		{"2026-01-15T12:00:00Z", []int{-210, 630, 825}}, // St John's standard, Adelaide summer, Chatham summer
		{"2026-07-15T12:00:00Z", []int{-150, 630, 765}}, // St John's summer, Lord Howe standard, Chatham standard
	} {
		now, err := time.Parse(time.RFC3339, tc.utc)
		if err != nil {
			t.Fatal(err)
		}
		available := make(map[int]bool)
		for _, city := range s.At(now).Cities {
			available[city.OffsetSeconds/60] = true
			union[city.OffsetSeconds/60] = true
		}
		for _, offset := range append(append([]int(nil), always...), tc.seasonal...) {
			if !available[offset] {
				t.Errorf("%s: missing UTC offset %+d minutes", tc.utc, offset)
			}
		}
	}
	if len(union) != 40 {
		t.Errorf("expected all 40 year-round/seasonal UTC offsets including the UTC-12 reference, got %d", len(union))
	}
}

func TestRequestedCitiesAndRegionalCoverage(t *testing.T) {
	s, err := New()
	if err != nil {
		t.Fatal(err)
	}
	byID := make(map[string]City)
	for _, city := range s.cities {
		byID[city.ID] = city
	}
	for _, group := range []struct {
		name   string
		cities map[string]string
	}{
		{"South America", map[string]string{"sao-paulo": "Бразилия", "buenos-aires": "Аргентина", "bogota": "Колумбия", "lima": "Перу", "santiago": "Чили", "caracas": "Венесуэла", "la-paz": "Боливия"}},
		{"Africa", map[string]string{"cairo": "Египет", "nairobi": "Кения", "lagos": "Нигерия", "kinshasa": "ДР Конго", "johannesburg": "ЮАР", "abidjan": "Кот-д’Ивуар"}},
	} {
		count := 0
		for id, country := range group.cities {
			city, ok := byID[id]
			if ok && city.Country == country && city.Kind == "" {
				count++
			}
		}
		if count < 3 {
			t.Errorf("%s: expected at least three major cities, got %d", group.name, count)
		}
	}
	for id, zone := range map[string]string{"almaty": "Asia/Almaty", "ulaanbaatar": "Asia/Ulaanbaatar"} {
		if byID[id].Timezone != zone {
			t.Errorf("%s must use %s", id, zone)
		}
	}
	if byID["baker-island"].Kind != "reference" {
		t.Error("uninhabited Baker Island must not be presented as a city")
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
