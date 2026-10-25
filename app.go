package main

import (
	"time"

	"earthtime/internal/world"
)

type App struct {
	world *world.Service
}

// GetWorldState uses one instant for every city, including at midnight and DST changes.
func (a *App) GetWorldState() world.Snapshot {
	return a.world.At(time.Now())
}
