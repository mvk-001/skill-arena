# Radial Hierarchies

- **Data shape:** Use nested objects or flat records that can be converted with `stratify`. Preserve each node path, depth, parent ID, and leaf value.
- **Animation pattern:** Reveal root-to-leaf, rotate labels after layout, and draw cross-links after the hierarchy appears. For tangled trees or tanglegrams, draw the base hierarchy first, then reveal multiple-parent or matched-leaf links. For collapsible live views, interpolate node positions from the previous layout.
- **Display guidance:** Use for hierarchy where circular space, containment, multiple inheritance, matched trees, or radial grouping clarifies structure. Use edge bundling when tree leaves have many cross-links.
- **D3 APIs:** `hierarchy`, `stratify`, `tree`, `cluster`, `pack`, `partition`, `lineRadial`, `linkRadial`.
- **Pitfalls:** Radial labels can collide or invert. Keep text upright, use leader lines for important leaves, and avoid tiny packed nodes without zoom or focus.
