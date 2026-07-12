# Packing And Proximity

- **Data shape:** Use points with IDs, positions or values, and grouping fields. For packing, use hierarchical values; for proximity, use x/y coordinates in a fixed domain.
- **Animation pattern:** Grow packed circles from parent centroids, animate bubbles from ranked bars into collision layout, reveal Voronoi cells after points appear, or grow stipple dots by sampled intensity.
- **Display guidance:** Use when neighborhood, ownership, collision, enclosure, or relative area is the main information.
- **D3 APIs:** `pack`, `forceSimulation`, `forceCollide`, `Delaunay.from`, `voronoi`, `polygonHull`, scalar sampling functions.
- **Pitfalls:** Area encodings are hard to compare precisely. Add labels, legends, or a sorted companion view when exact ranking matters.
