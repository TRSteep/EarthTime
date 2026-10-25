package main

import (
	"encoding/json"
	"os"
	"regexp"
	"testing"
)

func TestReleaseVersionsMatch(t *testing.T) {
	if !regexp.MustCompile(`^\d+\.\d+\.\d+$`).MatchString(appVersion) {
		t.Fatalf("invalid VERSION: %q", appVersion)
	}
	for _, filename := range []string{"wails.json", "frontend/package.json"} {
		data, err := os.ReadFile(filename)
		if err != nil {
			t.Fatal(err)
		}
		var metadata struct {
			Version string `json:"version"`
			Info    struct {
				ProductVersion string `json:"productVersion"`
			} `json:"info"`
		}
		if err := json.Unmarshal(data, &metadata); err != nil {
			t.Fatal(err)
		}
		version := metadata.Version
		if filename == "wails.json" {
			version = metadata.Info.ProductVersion
		}
		if version != appVersion {
			t.Errorf("%s version %q does not match VERSION %q", filename, version, appVersion)
		}
	}
}
