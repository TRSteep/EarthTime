// prepare-relief converts an ERDDAP ETOPO 2022 NetCDF subset into the offline terrain asset.
// It uses only the Go standard library; no Python/GDAL installation is required.
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
)

const bias = 12000
const sourceURL = "https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_60s.nc?z%5B3:6:10797%5D%5B3:6:21597%5D"

type variable struct {
	kind   uint32
	dims   []uint32
	offset uint64
}
type cdf struct {
	reader  *bytes.Reader
	version byte
	dims    []uint32
	vars    map[string]variable
}

func (c *cdf) integer() uint32 {
	var n uint32
	if err := binary.Read(c.reader, binary.BigEndian, &n); err != nil {
		panic(err)
	}
	return n
}
func (c *cdf) name() string {
	n := c.integer()
	if n > 1<<20 {
		panic("oversized NetCDF name")
	}
	b := make([]byte, (n+3)&^3)
	if _, err := io.ReadFull(c.reader, b); err != nil {
		panic(err)
	}
	return string(b[:n])
}
func (c *cdf) list(tag uint32) uint32 {
	actual, count := c.integer(), c.integer()
	if actual != tag && (actual != 0 || count != 0) {
		panic("unexpected NetCDF header tag")
	}
	if count > 1<<20 {
		panic("oversized NetCDF header list")
	}
	return count
}
func (c *cdf) attributes() {
	for n := c.list(12); n > 0; n-- {
		c.name()
		kind, count := c.integer(), c.integer()
		sizes := map[uint32]uint64{1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8}
		size, ok := sizes[kind]
		if !ok {
			panic("unsupported NetCDF attribute type")
		}
		length := (uint64(count)*size + 3) &^ 3
		if length > uint64(c.reader.Len()) {
			panic("truncated NetCDF attribute")
		}
		if _, err := c.reader.Seek(int64(length), io.SeekCurrent); err != nil {
			panic(err)
		}
	}
}

func parseCDF(data []byte) (result *cdf, err error) {
	defer func() {
		if p := recover(); p != nil {
			err = fmt.Errorf("invalid NetCDF: %v", p)
		}
	}()
	if len(data) < 8 || string(data[:3]) != "CDF" || (data[3] != 1 && data[3] != 2) {
		return nil, fmt.Errorf("expected classic NetCDF CDF-1/CDF-2")
	}
	c := &cdf{reader: bytes.NewReader(data[4:]), version: data[3], vars: map[string]variable{}}
	if c.integer() != 0 {
		return nil, fmt.Errorf("record variables are not supported")
	}
	for n := c.list(10); n > 0; n-- {
		c.name()
		c.dims = append(c.dims, c.integer())
	}
	c.attributes()
	for n := c.list(11); n > 0; n-- {
		name := c.name()
		v := variable{}
		count := c.integer()
		if count > uint32(len(c.dims)) {
			return nil, fmt.Errorf("invalid variable dimensions")
		}
		for i := uint32(0); i < count; i++ {
			v.dims = append(v.dims, c.integer())
		}
		c.attributes()
		v.kind = c.integer()
		c.integer() // padded variable size
		if c.version == 2 {
			if err := binary.Read(c.reader, binary.BigEndian, &v.offset); err != nil {
				return nil, err
			}
		} else {
			v.offset = uint64(c.integer())
		}
		c.vars[name] = v
	}
	return c, nil
}

func main() {
	input := flag.String("input", ".cache/relief/etopo-6min.nc", "NOAA ERDDAP NetCDF subset")
	output := flag.String("output", "frontend/public/terrain/etopo2022-6min.bin.gz", "output terrain asset")
	flag.Parse()
	if err := prepare(*input, *output); err != nil {
		log.Fatal(err)
	}
}

func prepare(input, output string) error {
	data, err := os.ReadFile(input)
	if err != nil {
		return err
	}
	c, err := parseCDF(data)
	if err != nil {
		return err
	}
	lat, latOK := c.vars["latitude"]
	lon, lonOK := c.vars["longitude"]
	z, zOK := c.vars["z"]
	if !latOK || !lonOK || !zOK || lat.kind != 6 || lon.kind != 6 || z.kind != 5 || len(lat.dims) != 1 || len(lon.dims) != 1 || len(z.dims) != 2 {
		return fmt.Errorf("unexpected ETOPO variables")
	}
	if int(lat.dims[0]) >= len(c.dims) || int(lon.dims[0]) >= len(c.dims) || z.dims[0] != lat.dims[0] || z.dims[1] != lon.dims[0] {
		return fmt.Errorf("invalid ETOPO dimensions")
	}
	w, h := int(c.dims[lon.dims[0]]), int(c.dims[lat.dims[0]])
	if w != 3600 || h != 1800 {
		return fmt.Errorf("expected 3600x1800 six-minute subset, got %dx%d", w, h)
	}
	for _, section := range []struct{ start, size uint64 }{{lat.offset, uint64(h) * 8}, {lon.offset, uint64(w) * 8}, {z.offset, uint64(w) * uint64(h) * 4}} {
		if section.start+section.size > uint64(len(data)) {
			return fmt.Errorf("truncated ETOPO array")
		}
	}
	latitude := func(y int) float64 {
		return math.Float64frombits(binary.BigEndian.Uint64(data[lat.offset+uint64(y)*8:]))
	}
	longitude := func(x int) float64 {
		return math.Float64frombits(binary.BigEndian.Uint64(data[lon.offset+uint64(x)*8:]))
	}
	dLat, dLon := latitude(1)-latitude(0), longitude(1)-longitude(0)
	if math.Abs(dLat-.1) > 1e-8 || math.Abs(dLon-.1) > 1e-8 {
		return fmt.Errorf("expected 0.1 degree grid")
	}
	split := 0
	for split < w && longitude(split) < 180 {
		split++
	}
	if split == w {
		return fmt.Errorf("expected NOAA 0..360 longitude axis")
	}
	north, west := latitude(h-1), longitude(split)-360
	heights := make([]int16, w*h)
	minimum, maximum := 12000, -12000
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			index := (h-1-y)*w + (x+split)%w
			height := float64(math.Float32frombits(binary.BigEndian.Uint32(data[z.offset+uint64(index)*4:])))
			if math.IsNaN(height) || math.IsInf(height, 0) || height < -12000 || height > 12000 {
				return fmt.Errorf("invalid ETOPO height %v", height)
			}
			m := int(math.Round(height))
			heights[y*w+x] = int16(m)
			minimum = min(minimum, m)
			maximum = max(maximum, m)
		}
	}
	ocean := oceanMask(heights, w, h, north, west, dLat, dLon)
	var raw bytes.Buffer
	raw.WriteString("ETR1")
	for _, v := range []uint32{uint32(w), uint32(h)} {
		binary.Write(&raw, binary.LittleEndian, v)
	}
	for _, v := range []float32{float32(north), float32(west), float32(dLat), float32(dLon)} {
		binary.Write(&raw, binary.LittleEndian, v)
	}
	binary.Write(&raw, binary.LittleEndian, uint32(bias))
	for i, height := range heights {
		packed := uint16(int(height) + bias)
		if ocean[i] {
			packed |= 0x8000
		}
		binary.Write(&raw, binary.LittleEndian, packed)
	}
	if err := os.MkdirAll(filepath.Dir(output), 0755); err != nil {
		return err
	}
	file, err := os.Create(output)
	if err != nil {
		return err
	}
	writer, err := gzip.NewWriterLevel(file, gzip.BestCompression)
	if err != nil {
		file.Close()
		return err
	}
	_, writeErr := writer.Write(raw.Bytes())
	closeErr := writer.Close()
	fileErr := file.Close()
	for _, e := range []error{writeErr, closeErr, fileErr} {
		if e != nil {
			return e
		}
	}
	metadata := map[string]any{
		"source":    "NOAA NCEI ETOPO 2022 (ice surface), 60 arc-second grid",
		"sourceURL": sourceURL, "sourceSHA256": fmt.Sprintf("%x", sha256.Sum256(data)),
		"citation": "NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. DOI: 10.25921/fd45-gt74. Accessed 2026-10-25.",
		"width":    w, "height": h, "north": north, "west": west, "stepDegrees": dLat,
		"sampling":      "Every sixth cell of the 60 arc-second grid; not averaged. Rounded to whole meters.",
		"verticalDatum": "EGM2008 (EPSG:3855)", "minimumMeters": minimum, "maximumMeters": maximum,
		"oceanMask": "Negative-height connected components seeded in open oceans and major marginal seas. Inland closed basins remain below sea level without being flooded.",
		"format":    "ETR1: 32-byte little-endian header, then uint16 samples, north to south/west to east. Height=(sample&32767)-12000 meters; sample&32768 is ocean. Gzip-compressed.",
	}
	encoded, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(filepath.Dir(output), "etopo2022-6min.json"), append(encoded, '\n'), 0644); err != nil {
		return err
	}
	fmt.Printf("Prepared %dx%d actual heights, range %d..%d m: %s\n", w, h, minimum, maximum, output)
	return nil
}

func oceanMask(heights []int16, w, h int, north, west, dLat, dLon float64) []bool {
	mask := make([]bool, len(heights))
	queue := make([]int32, 0, len(heights))
	// Major marginal seas may have straits narrower than the sampled grid.
	seeds := [][2]float64{{0, -150}, {0, -30}, {-30, 80}, {80, 0}, {35, 18}, {43, 34}, {20, 38}, {26, 52}, {57, 19}, {62, -85}, {46.5, 37}, {40.7, 28.2}}
	push := func(i int) {
		if !mask[i] && heights[i] < 0 {
			mask[i] = true
			queue = append(queue, int32(i))
		}
	}
	for _, point := range seeds {
		y := int(math.Round((north - point[0]) / dLat))
		x := int(math.Round((point[1] - west) / dLon))
		x = (x%w + w) % w
		if y >= 0 && y < h {
			push(y*w + x)
		}
	}
	for head := 0; head < len(queue); head++ {
		i := int(queue[head])
		x, y := i%w, i/w
		push(y*w + (x+w-1)%w)
		push(y*w + (x+1)%w)
		if y > 0 {
			push(i - w)
		}
		if y < h-1 {
			push(i + w)
		}
	}
	return mask
}
