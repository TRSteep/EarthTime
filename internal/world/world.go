package world

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"time"
	_ "time/tzdata" // Bundle IANA rules: no OS timezone database is required.
)

//go:embed cities.json
var catalog []byte

type City struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Country  string  `json:"country"`
	Lat      float64 `json:"lat"`
	Lon      float64 `json:"lon"`
	Timezone string  `json:"timezone"`
}

type CityTime struct {
	City
	Time          string `json:"time"`
	Date          string `json:"date"`
	OffsetSeconds int    `json:"offsetSeconds"`
}

type Snapshot struct {
	UTC    string     `json:"utc"`
	Cities []CityTime `json:"cities"`
}

type Service struct {
	cities    []City
	locations []*time.Location
}

func New() (*Service, error) {
	var cities []City
	if err := json.Unmarshal(catalog, &cities); err != nil {
		return nil, fmt.Errorf("decode city catalog: %w", err)
	}
	return newService(cities)
}

func newService(cities []City) (*Service, error) {
	if len(cities) == 0 {
		return nil, fmt.Errorf("city catalog is empty")
	}
	s := &Service{cities: append([]City(nil), cities...)}
	seen := make(map[string]bool)
	for _, city := range s.cities {
		if city.ID == "" || seen[city.ID] || city.Name == "" || city.Timezone == "" || city.Lat < -90 || city.Lat > 90 || city.Lon < -180 || city.Lon > 180 {
			return nil, fmt.Errorf("invalid city: %q", city.ID)
		}
		seen[city.ID] = true
		location, err := time.LoadLocation(city.Timezone)
		if err != nil {
			return nil, fmt.Errorf("timezone for %s: %w", city.ID, err)
		}
		s.locations = append(s.locations, location)
	}
	return s, nil
}

func (s *Service) At(now time.Time) Snapshot {
	snapshot := Snapshot{UTC: now.UTC().Format(time.RFC3339), Cities: make([]CityTime, len(s.cities))}
	for i, city := range s.cities {
		local := now.In(s.locations[i])
		_, offset := local.Zone()
		snapshot.Cities[i] = CityTime{City: city, Time: local.Format("15:04:05"), Date: local.Format("2006-01-02"), OffsetSeconds: offset}
	}
	return snapshot
}
