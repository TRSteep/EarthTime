package main

import (
	"embed"
	"log"

	"earthtime/internal/world"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	service, err := world.New()
	if err != nil {
		log.Fatal(err)
	}
	if err := wails.Run(&options.App{
		Title: "EarthTime v" + appVersion,
		Width: 1440, Height: 960,
		MinWidth: 960, MinHeight: 640,
		BackgroundColour: options.NewRGB(5, 11, 19),
		AssetServer:      &assetserver.Options{Assets: assets},
		Bind:             []interface{}{&App{world: service}},
	}); err != nil {
		log.Fatal(err)
	}
}
