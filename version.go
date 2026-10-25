package main

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var versionFile string

var appVersion = strings.TrimSpace(versionFile)
