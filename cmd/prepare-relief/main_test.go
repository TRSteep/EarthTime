package main

import "testing"

func TestOceanFloodFillWrapsAndPreservesClosedDepressions(t *testing.T) {
	const w, h = 12, 6
	heights := make([]int16, w*h)
	for i := range heights {
		heights[i] = 100
	}
	for _, x := range []int{0, 1, 11} {
		heights[3*w+x] = -4000
	}
	closed := w + 3
	heights[closed] = -400
	mask := oceanMask(heights, w, h, 75, -165, 30, 30)
	for _, x := range []int{0, 1, 11} {
		if !mask[3*w+x] {
			t.Fatalf("ocean not connected across date line: x=%d", x)
		}
	}
	if mask[closed] {
		t.Fatal("closed depression must not be flooded")
	}
	if heights[closed] != -400 {
		t.Fatal("source heights were changed")
	}
}

func TestNetCDFRejectsTruncatedHeader(t *testing.T) {
	for _, data := range [][]byte{nil, []byte("not a dataset"), {'C', 'D', 'F', 1, 0, 0, 0, 0}} {
		if _, err := parseCDF(data); err == nil {
			t.Fatal("expected invalid NetCDF to fail")
		}
	}
}
