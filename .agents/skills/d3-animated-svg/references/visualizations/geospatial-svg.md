# Geospatial SVG

- **Data shape:** Use local GeoJSON or TopoJSON plus keyed data tables for values, routes, or points. Keep all joins explicit by stable region or feature IDs.
- **Animation pattern:** Fit the projection once, then animate choropleth fills, route strokes, moving tokens, projection switches, Tissot circles, or symbol transitions. For portable SVG, inline paths and avoid runtime map tile dependencies.
- **Display guidance:** Use when projected geography, distance, route shape, adjacency, distortion, field direction, or spatial aggregation is central to the answer.
- **D3 APIs:** `geoPath`, `geoMercator`, `geoAlbers`, `geoEqualEarth`, `geoNaturalEarth1`, `geoOrthographic`, `geoGraticule`, `geoContains`, `geoCentroid`.
- **Pitfalls:** Unprojected coordinates, remote tiles, mismatched region IDs, and expensive full-sphere projection fitting make export fragile. Keep small maps readable with simplified features and restrained labels.
