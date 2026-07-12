(function () {
  const palette = {
    blue: "#007298",
    orange: "#e77204",
    green: "#45842a",
    red: "#9e1b32",
    purple: "#652f6c",
    cyan: "#00ace6",
    yellow: "#f1c319",
    gold: "#f1c319",
    ink: "#333e48",
    muted: "#696969",
    black: "#000000",
    white: "#ffffff",
    gray50: "#f7f7f7",
    gray100: "#e7e7e7",
    gray200: "#cfcfcf",
    gray300: "#b5b5b5",
    gray400: "#9c9c9c",
    gray500: "#828282",
    gray600: "#696969",
    gray700: "#4f4f4f",
    gray800: "#363636",
    gray900: "#1c1c1c",
    blueHover: "#004d66",
    orangeHover: "#994a00",
    yellowHover: "#98700c",
    greenHover: "#294d19",
    purpleHover: "#431f47",
    redHover: "#6d1222",
    blueHighlight: "#cdf3ff",
    orangeHighlight: "#ffe5cc",
    yellowHighlight: "#fff4cc",
    greenHighlight: "#dbffcc",
    purpleHighlight: "#f9ccff",
    redHighlight: "#ffccd5",
    error: "#e8002a",
    warning: "#ff9633",
    caution: "#ffd332",
    success: "#36b300",
    information: "#00ace6",
    special: "#9e00b3",
    surface: "#ffffff",
    line: "#cfcfcf"
  };

  const galleryStyleVersion = window.D3_GALLERY_STYLE_VERSION || document.body?.dataset?.styleVersion || "base";
  const galleryStyleConfig = window.D3_GALLERY_STYLE_CONFIG || {};
  if (galleryStyleConfig.paletteOverrides) {
    Object.entries(galleryStyleConfig.paletteOverrides).forEach(([key, value]) => {
      if (Object.hasOwn(palette, key) && typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
        palette[key] = value.toLowerCase();
      }
    });
  }
  const isStyledGallery = galleryStyleVersion !== "base";
  const galleryColorSet = galleryStyleConfig.colorSet || (galleryStyleVersion === "colorset2" ? "colorset2" : "base");
  const galleryPaletteName = galleryStyleConfig.paletteName || (galleryStyleVersion === "colorset2" ? "full-color-style" : "base");
  const galleryStyleAlignment = galleryStyleConfig.styleName || (galleryStyleVersion === "colorset2" ? "metro-minimal-tonal-motion" : null);
  const galleryAssetBase = window.D3_GALLERY_ASSET_BASE || "";
  const galleryExampleSetId = {
    base: "d3-animated-svg",
    cs1: "d3-animated-svg-cs1",
    colorset2: "d3-animated-svg-colorset2"
  }[galleryStyleVersion] || "d3-animated-svg";
  const styleAllowedColors = new Set((galleryStyleConfig.allowedColors || Object.values(palette)).map(value => String(value).toLowerCase()));
  const styleAllowedColorList = Array.from(styleAllowedColors);
  const namedColorMap = new Map([
    ["black", palette.black],
    ["white", palette.white]
  ]);

  const width = 560;
  const height = 420;
  const colors = [palette.blue, palette.orange, palette.green, palette.purple, palette.red];
  const ramps = {
    blue: [palette.blueHighlight, palette.cyan, palette.blue, palette.blueHover],
    heat: [palette.yellowHighlight, palette.orangeHighlight, palette.orange, palette.red],
    vaccine: [palette.yellowHighlight, palette.orangeHighlight, "#ff9633", palette.orange, palette.red],
    terrain: [palette.yellowHighlight, palette.greenHighlight, palette.blueHighlight, palette.blue, palette.purple],
    gray: [palette.gray100, palette.gray200, palette.gray300, palette.gray400, palette.gray700],
    bivariate: [
      [palette.gray100, palette.blueHighlight, palette.blue],
      [palette.purpleHighlight, palette.gray200, palette.blueHover],
      [palette.purple, palette.red, palette.purpleHover]
    ]
  };
  const remappedColors = new Map(Object.entries({
    "#111827": palette.gray900,
    "#2171b5": palette.blue,
    "#263142": palette.gray900,
    "#2c384c": palette.gray700,
    "#39465a": palette.gray600,
    "#5ac8c8": palette.blue,
    "#6baed6": palette.cyan,
    "#81b77b": palette.greenHighlight,
    "#8c62aa": palette.purple,
    "#9aa7b5": palette.gray300,
    "#9fb0c4": palette.gray300,
    "#a5add3": palette.gray200,
    "#a8b4c2": palette.gray300,
    "#aab5c2": palette.gray300,
    "#ace4e4": palette.blueHighlight,
    "#aebaca": palette.gray400,
    "#b7c4d2": palette.gray300,
    "#b8c4d1": palette.gray300,
    "#b9c4cf": palette.gray300,
    "#bac7d5": palette.gray300,
    "#be64ac": palette.purple,
    "#c6dbef": palette.blueHighlight,
    "#c8d6e4": palette.gray200,
    "#cbd8e6": palette.gray200,
    "#d3dee9": palette.gray200,
    "#d5dde8": palette.gray200,
    "#d7e0ea": palette.gray200,
    "#d9dee6": palette.gray200,
    "#d9e1ea": palette.gray200,
    "#dbe2ea": palette.gray100,
    "#dbeafe": palette.blueHighlight,
    "#dfb0d6": palette.purpleHighlight,
    "#e0e6ed": palette.gray100,
    "#e39a62": palette.orangeHighlight,
    "#e6f2fb": palette.blueHighlight,
    "#e7edf4": palette.gray100,
    "#e8e8e8": palette.gray100,
    "#edf1f5": palette.gray100,
    "#edf4f8": palette.blueHighlight,
    "#eef2f7": palette.blueHighlight,
    "#eef3f7": palette.blueHighlight,
    "#f1d36a": palette.gold,
    "#f7dfc6": palette.orangeHighlight,
    "#f7f9fb": palette.gray50,
    "#fff5b5": palette.yellowHighlight
  }));
  let renderPass = 0;
  const tableExampleIds = new Set([
    "data-grid",
    "inline-bar-table",
    "pivot-heat-table",
    "rank-table",
    "sparkline-table",
    "column-profile"
  ]);

  const legacyExampleIds = new Map([
    ["agent-loop-overlay", "agent-loop-partial-covers"],
    ["airport-voronoi", "airports-voronoi"],
    ["attention-tiles", "attention-matrix-tiles"],
    ["barcode-plot", "barcode"],
    ["bowtie-barriers", "critical-bowtie-barrier"],
    ["bulkhead-isolation", "critical-bulkhead-isolation"],
    ["cache-stampede", "critical-cache-stampede"],
    ["circuit-breaker", "critical-circuit-breaker"],
    ["column-profile", "column-profile-table"],
    ["context-window-fill", "token-boxes-to-context-window"],
    ["correlogram", "correlogram-histogram"],
    ["creature-stippling", "pocket-monster-stippling"],
    ["curve-contexts", "context-to-curve"],
    ["data-grid", "data-table-grid"],
    ["dependency-blast-radius", "critical-dependency-blast-radius"],
    ["document-token-bins", "document-token-extraction-buckets"],
    ["document-token-errors", "document-token-quality-red"],
    ["er-schema", "d3-er-schema"],
    ["facet-sparklines", "facets"],
    ["fault-tree", "critical-fault-tree"],
    ["flowchart-dag", "d3-flowchart-dag"],
    ["gantt-rollout", "d3-gantt-rollout"],
    ["git-graph", "d3-git-graph"],
    ["idempotency-guard", "critical-idempotency-replay-guard"],
    ["image-histogram", "mona-histogram"],
    ["incident-escalation", "critical-incident-escalation"],
    ["kanban-assignees", "kanban-assignee-board"],
    ["kanban-board", "d3-kanban-board"],
    ["kanban-legend-column", "kanban-assignee-virtual-legend"],
    ["kanban-legend-footer", "kanban-assignee-distributed-legend"],
    ["mlp-execution", "deep-learning-model-execution"],
    ["nature-geometry", "natural-math-archetypes"],
    ["organic-growth", "organic-growth-patterns"],
    ["overlap-3-chain", "asymmetric-three-circle-chain"],
    ["overlap-3-rosette", "symmetric-three-circle-rosette"],
    ["overlap-5-cluster", "asymmetric-five-circle-cluster"],
    ["overlap-5-rosette", "symmetric-five-circle-rosette"],
    ["overlap-7-bridge", "asymmetric-seven-circle-bridge"],
    ["overlap-7-flower", "symmetric-seven-circle-flower"],
    ["process-control-loop", "process-pid-control-loop"],
    ["projection-switch", "ortho-switch"],
    ["quadtree-partition", "animated-quadtree"],
    ["queue-backpressure", "critical-queue-backpressure"],
    ["rank-table", "sortable-rank-table"],
    ["rectbin", "rectbin-density"],
    ["replication-failover", "critical-replication-failover"],
    ["rope-rotation", "rope-position-rotation"],
    ["sequence-lifelines", "d3-sequence-lifelines"],
    ["slo-burn-rate", "critical-slo-burn-rate"],
    ["speculative-decoding", "speculative-decoding-verify"],
    ["state-machine", "d3-state-machine"],
    ["task-overlap", "asymmetric-task-overlap"],
    ["task-overlap-dense", "asymmetric-task-overlap-saturated"],
    ["tiled-matmul", "matmul-tile-accumulation"],
    ["token-bucket", "critical-rate-limit-token-bucket"],
    ["token-roulette", "token-roulette-sampler"],
    ["token-sampler", "token-probability-sampler"],
    ["user-journey", "d3-user-journey"],
    ["venn-3", "venn-three-circle"],
    ["venn-5", "venn-five-overlap"],
    ["venn-7", "venn-seven-overlap"]
  ]);
  window.D3_PATTERN_LEGACY_IDS = Object.fromEntries(legacyExampleIds);

  const examples = [
    { id: "force-network", kicker: "Simulation", title: "Force Network", copy: "Clustered topology with collision and link tension.", render: renderForceNetwork },
    { id: "category-burst", kicker: "Network", title: "Category Burst", copy: "A central category blooms into subcategory spokes that float outward and settle.", render: renderCategoryBurst },
    { id: "radial-hierarchy", kicker: "Hierarchy", title: "Radial Hierarchy", copy: "A tree layout with curved parent-child paths.", render: renderRadialHierarchy },
    { id: "beeswarm", kicker: "Distribution", title: "Beeswarm", copy: "Individual observations settle into grouped swarms.", render: renderBeeswarm },
    { id: "sketchy-beeswarm", kicker: "Sketchy", title: "Sketchy Beeswarm", copy: "The beeswarm distribution is redrawn with seeded hand-sketched dots and axes.", render: renderSketchyBeeswarm },
    { id: "streamgraph", kicker: "Temporal", title: "Streamgraph", copy: "Layered composition changes across time.", render: renderStreamgraph },
    { id: "sketchy-streamgraph", kicker: "Sketchy", title: "Sketchy Streamgraph", copy: "Stacked areas keep their D3 geometry while rough outlines and fills add drawn texture.", render: renderSketchyStreamgraph },
    { id: "voronoi", kicker: "Proximity", title: "Voronoi Field", copy: "Nearest-neighbor cells around point anchors.", render: renderVoronoi },
    { id: "chord", kicker: "Flow", title: "Chord Ribbons", copy: "Reciprocal category-to-category volume.", render: renderChord },
    { id: "treemap", kicker: "Hierarchy", title: "Treemap", copy: "Nested area allocation with readable groups.", render: renderTreemap },
    { id: "sketchy-treemap", kicker: "Sketchy", title: "Sketchy Treemap", copy: "A treemap keeps exact rectangular allocation but draws each cell as a rough marker block.", render: renderSketchyTreemap },
    { id: "circle-pack", kicker: "Hierarchy", title: "Circle Packing", copy: "Containment and relative area in packed circles.", render: renderCirclePack },
    { id: "sunburst", kicker: "Hierarchy", title: "Sunburst", copy: "Radial partition for nested composition.", render: renderSunburst },
    { id: "icicle", kicker: "Hierarchy", title: "Icicle", copy: "Rectangular partition for drilldown paths.", render: renderIcicle },
    { id: "tidy-tree", kicker: "Hierarchy", title: "Tidy Tree", copy: "Layered node-link hierarchy with balanced spacing.", render: renderTidyTree },
    { id: "edge-bundling", kicker: "Network", title: "Edge Bundling", copy: "Cross-links routed through hierarchy paths.", render: renderEdgeBundling },
    { id: "arc-diagram", kicker: "Network", title: "Arc Diagram", copy: "Ordered dependencies shown as curved arcs.", render: renderArcDiagram },
    { id: "adjacency-matrix", kicker: "Network", title: "Adjacency Matrix", copy: "Dense relationships as a sortable grid.", render: renderAdjacencyMatrix },
    { id: "data-grid", kicker: "Table", title: "Data Table Grid", copy: "Rows, typed columns, status chips, and row focus composed as SVG marks.", render: renderDataTableGrid },
    { id: "inline-bar-table", kicker: "Table", title: "Inline Bar Table", copy: "A compact token-price table embeds bars directly inside input and output cost cells.", render: renderInlineBarTable },
    { id: "pivot-heat-table", kicker: "Table", title: "Pivot Heat Table", copy: "A cross-tab table uses ordered color and totals to expose segment patterns.", render: renderPivotHeatTable },
    { id: "rank-table", kicker: "Table", title: "Sortable Rank Table", copy: "Rows animate from input order into a score-sorted analytical table.", render: renderSortableRankTable },
    { id: "sparkline-table", kicker: "Table", title: "Sparkline Table", copy: "Each table row carries a mini trend line, final value, and directional delta.", render: renderSparklineTable },
    { id: "column-profile", kicker: "Table", title: "Column Profile Table", copy: "Column-level data quality, cardinality, and distributions are rendered as row profiles.", render: renderColumnProfileTable },
    { id: "document-token-quality", kicker: "Document", title: "Document Token Quality", copy: "Three document blocks encode correct, filler, and wrong word-length shares at 20/70/10, 10/85/5, and 70/10/20.", render: renderDocumentTokenQuality },
    { id: "document-token-errors", kicker: "Document", title: "Document Token Quality Red", copy: "The same document-quality pattern uses red for wrong spans while preserving the length-weighted ratios and paragraph spacing.", render: renderDocumentTokenQualityRed },
    { id: "document-token-bins", kicker: "Document", title: "Document Extraction Buckets", copy: "A single page is scanned in writing order, then colored word blocks split into filler, correct, and wrong buckets with calculated totals.", render: renderDocumentTokenExtractionBuckets },
    { id: "agent-loop-overlay", kicker: "Image Overlay", title: "Agent Loop Partial Covers", copy: "A source diagram remains visible while animated translucent covers selectively pass over key areas.", render: renderAgentLoopPartialCovers },
    { id: "task-overlap", kicker: "Set Overlap", title: "Asymmetric Task Overlap", copy: "Nine uneven scope circles hold 20 task dots, including single-scope and shared multi-scope work.", render: renderAsymmetricTaskOverlap },
    { id: "task-overlap-dense", kicker: "Set Overlap", title: "Saturated Task Overlap", copy: "Nine asymmetric scope circles hold 100 task dots with external labels and direct color-optimized leader lines.", render: renderAsymmetricTaskOverlapSaturated, size: "wide" },
    { id: "venn-3", kicker: "Set Overlap", title: "Venn Three Circle", copy: "Three peer concepts reveal single, pairwise, and shared center intersections.", render: renderVennThreeCircle },
    { id: "venn-5", kicker: "Set Overlap", title: "Venn Five Overlap", copy: "Five domains converge around a shared center with labeled outer roles.", render: renderVennFiveOverlap },
    { id: "venn-7", kicker: "Set Overlap", title: "Venn Seven Overlap", copy: "Seven LLM workstreams overlap around a central alignment zone.", render: renderVennSevenOverlap },
    { id: "overlap-3-rosette", kicker: "Symmetric Overlap", title: "Symmetric Three Circle Rosette", copy: "Three equal circles use 120-degree rotational symmetry for balanced concepts.", render: renderSymmetricThreeCircleRosette },
    { id: "overlap-5-rosette", kicker: "Symmetric Overlap", title: "Symmetric Five Circle Rosette", copy: "Five equal circles form a peer-level rosette around one shared center.", render: renderSymmetricFiveCircleRosette },
    { id: "overlap-7-flower", kicker: "Symmetric Overlap", title: "Symmetric Seven Circle Flower", copy: "A center circle plus six equal neighbors forms a stable flower layout.", render: renderSymmetricSevenCircleFlower },
    { id: "overlap-3-chain", kicker: "Asymmetric Overlap", title: "Asymmetric Three Circle Chain", copy: "One bridge circle links two endpoints while the endpoints remain mostly separate.", render: renderAsymmetricThreeCircleChain },
    { id: "overlap-5-cluster", kicker: "Asymmetric Overlap", title: "Asymmetric Five Circle Cluster", copy: "A primary block of three circles gains two adjacent context circles.", render: renderAsymmetricFiveCircleCluster },
    { id: "overlap-7-bridge", kicker: "Asymmetric Overlap", title: "Asymmetric Seven Circle Bridge", copy: "Two blocks of three circles are joined by one bridge circle in a 3+1+3 structure.", render: renderAsymmetricSevenCircleBridge },
    { id: "sankey", kicker: "Flow", title: "Sankey Pipeline", copy: "Weighted handoffs across ordered stages.", render: renderSankey },
    { id: "flowchart-dag", kicker: "Diagram", title: "D3 Flowchart DAG", copy: "Mermaid-style process logic drawn as explicit D3 nodes, links, and decisions.", render: renderD3FlowchartDag },
    { id: "sequence-lifelines", kicker: "Diagram", title: "D3 Sequence Lifelines", copy: "Actor boxes, lifelines, activations, and replies composed directly in SVG.", render: renderD3SequenceLifelines },
    { id: "state-machine", kicker: "Diagram", title: "D3 State Machine", copy: "State, choice, fork, join, start, and end symbols laid out without Mermaid.", render: renderD3StateMachine },
    { id: "er-schema", kicker: "Diagram", title: "D3 ER Schema", copy: "Entity tables and cardinality connectors generated from structured records.", render: renderD3ErSchema },
    { id: "gantt-rollout", kicker: "Diagram", title: "D3 Gantt Rollout", copy: "Time-scaled tasks, sections, dependencies, milestones, and today marker.", render: renderD3GanttRollout },
    { id: "git-graph", kicker: "Diagram", title: "D3 Git Graph", copy: "Branches, commits, merge curves, and commit labels as SVG geometry.", render: renderD3GitGraph },
    { id: "kanban-board", kicker: "Diagram", title: "D3 Kanban Board", copy: "Columns and ticket cards recreated with D3 joins and staged reveal.", render: renderD3KanbanBoard },
    { id: "kanban-assignees", kicker: "Diagram", title: "Kanban Assignee Board", copy: "Five Kanban columns show compact task titles with two-letter colored assignee dots and a legend.", render: renderKanbanAssigneeBoard, size: "wide" },
    { id: "kanban-legend-column", kicker: "Diagram", title: "Kanban Virtual Legend", copy: "A five-column Kanban board keeps symmetry by rendering the people legend as a virtual sixth column.", render: renderKanbanAssigneeBoardVirtualLegend, size: "wide" },
    { id: "kanban-legend-footer", kicker: "Diagram", title: "Kanban Distributed Legend", copy: "A five-column Kanban board distributes person legend chips through the spare footer space in each column.", render: renderKanbanAssigneeBoardDistributedLegend, size: "wide" },
    { id: "user-journey", kicker: "Diagram", title: "D3 User Journey", copy: "Journey sections, steps, actors, and satisfaction scores as a custom chart.", render: renderD3UserJourney },
    { id: "parallel-coordinates", kicker: "Multivariate", title: "Parallel Coordinates", copy: "Many-dimensional profiles as polylines.", render: renderParallelCoordinates },
    { id: "bubble-scatter", kicker: "Correlation", title: "Bubble Scatter", copy: "Position, radius, and group encoded together.", render: renderBubbleScatter },
    { id: "point-cloud", kicker: "Distribution", title: "Point Cloud", copy: "Small gray circles float around an invisible horizontal line.", render: renderPointCloud },
    { id: "connected-scatter", kicker: "Correlation", title: "Connected Scatter", copy: "Trajectory across two changing measures.", render: renderConnectedScatter },
    { id: "sketchy-line-chart", kicker: "Sketchy", title: "Sketchy Line Chart", copy: "A connected scatter path is rendered as a seeded double-stroke hand sketch.", render: renderSketchyLineChart },
    { id: "histogram", kicker: "Distribution", title: "Histogram", copy: "Binned frequency with animated bars.", render: renderHistogram },
    { id: "sketchy-histogram", kicker: "Sketchy", title: "Sketchy Histogram", copy: "Histogram bins use rough rectangular marks and light hachure fills.", render: renderSketchyHistogram },
    { id: "sketchy-gemma-comparison", kicker: "Sketchy AI", title: "Sketchy Gemma Compare", copy: "Two Gemma sizes balance benchmark strength against memory and cloud hardware cost.", render: renderSketchyGemmaComparison },
    { id: "gemma-comparison", kicker: "AI Model", title: "Gemma Compare", copy: "A clean model scorecard compares two Gemma sizes across quality, memory, and GPU cost.", render: renderGemmaComparison },
    { id: "boxplot", kicker: "Distribution", title: "Box Plot", copy: "Quartiles, whiskers, and outliers per group.", render: renderBoxPlot },
    { id: "violin", kicker: "Distribution", title: "Violin Plot", copy: "Mirrored density shape for each group.", render: renderViolin },
    { id: "ridgeline", kicker: "Distribution", title: "Ridgeline", copy: "Stacked density curves for group comparison.", render: renderRidgeline },
    { id: "contours", kicker: "Density", title: "Density Contours", copy: "Two-dimensional concentration fields.", render: renderContours },
    { id: "hexbin", kicker: "Density", title: "Hexbin Field", copy: "Binned point density in hexagonal cells.", render: renderHexbin },
    { id: "calendar", kicker: "Heatmap", title: "Calendar Heatmap", copy: "Repeated temporal cells with intensity.", render: renderCalendar },
    { id: "lollipop", kicker: "Ranking", title: "Lollipop", copy: "Ranked values with reduced bar ink.", render: renderLollipop },
    { id: "circular-bar", kicker: "Ranking", title: "Circular Barplot", copy: "Radial magnitude around a categorical wheel.", render: renderCircularBar },
    { id: "radar", kicker: "Multivariate", title: "Radar Profile", copy: "Compact radial comparison across metrics.", render: renderRadar },
    { id: "bump", kicker: "Temporal", title: "Bump Chart", copy: "Rank changes across time periods.", render: renderBump },
    { id: "slope", kicker: "Temporal", title: "Slope Chart", copy: "Before-after movement with labels.", render: renderSlope },
    { id: "horizon", kicker: "Temporal", title: "Horizon Chart", copy: "Compressed time-series bands with color.", render: renderHorizon },
    { id: "geo-route", kicker: "Geospatial", title: "Projected Routes", copy: "Coordinates, projection, and route motion.", render: renderGeoRoute },
    { id: "symbol-glyphs", kicker: "Glyphs", title: "Symbol Glyphs", copy: "Custom point marks encode type and magnitude.", render: renderSymbolGlyphs },
    { id: "polar-area", kicker: "Radial", title: "Polar Area", copy: "Seasonal magnitude as radial arc segments.", render: renderPolarArea },
    { id: "marimekko", kicker: "Mosaic", title: "Marimekko", copy: "Variable-width stacked composition by segment.", render: renderMarimekko },
    { id: "alluvial", kicker: "Flow", title: "Alluvial Bands", copy: "Category handoffs as layered flowing ribbons.", render: renderAlluvial },
    { id: "cluster-hulls", kicker: "Proximity", title: "Cluster Hulls", copy: "Convex envelopes around related observations.", render: renderClusterHulls },
    { id: "delaunay-mesh", kicker: "Proximity", title: "Delaunay Mesh", copy: "Triangulated neighbor structure behind points.", render: renderDelaunayMesh },
    { id: "waffle", kicker: "Part-to-whole", title: "Waffle Matrix", copy: "Individual units grouped into exact shares.", render: renderWaffle },
    { id: "context-window-matrix", kicker: "Context", title: "Context Window Matrix", copy: "Token budget fills as agent context enters the active window.", render: renderContextWindowMatrix },
    { id: "context-window-fill", kicker: "Context", title: "Token Boxes To Context Window", copy: "Prompt tokens become ordered colored slots in a square context grid.", render: renderTokenBoxesToContextWindow },
    { id: "token-sampler", kicker: "LLM", title: "Token Probability Sampler", copy: "Candidate next tokens compete by probability before one token is sampled.", render: renderTokenProbabilitySampler },
    { id: "token-roulette", kicker: "LLM", title: "Token Roulette Sampler", copy: "A probability wheel spins, then reveals the selected token.", render: renderTokenRouletteSampler },
    { id: "temperature-softmax", kicker: "LLM", title: "Temperature Softmax", copy: "The same logits sharpen or flatten as temperature changes.", render: renderTemperatureSoftmax },
    { id: "nucleus-sampling", kicker: "LLM", title: "Nucleus Sampling", copy: "Top-p keeps the smallest token set whose cumulative probability crosses a threshold.", render: renderNucleusSampling },
    { id: "attention-routing", kicker: "LLM", title: "Attention Routing", copy: "A query token distributes attention across earlier context tokens.", render: renderAttentionRouting },
    { id: "attention-arc-decoding", kicker: "LLM", title: "Attention Arc Decoding", copy: "Attention arcs target an empty slot; each generated token joins the context for the next decode step.", render: renderAttentionArcDecoding },
    { id: "embedding-neighborhood", kicker: "LLM", title: "Embedding Neighborhood", copy: "Nearby vectors form semantic neighborhoods around a query.", render: renderEmbeddingNeighborhood },
    { id: "kv-cache-growth", kicker: "LLM", title: "KV Cache Growth", copy: "Generated tokens append reusable key-value columns while the active query advances.", render: renderKvCacheGrowth },
    { id: "attention-tiles", kicker: "LLM", title: "Attention Matrix Tiles", copy: "Causal attention scores become tiled rows, query focus, and masked future tokens.", render: renderAttentionMatrixTiles },
    { id: "qkv-projection-flow", kicker: "Transformer", title: "QKV Projection Flow", copy: "Token embeddings split into query, key, and value matrices before attention.", render: renderQkvProjectionFlow },
    { id: "lora-rank-update", kicker: "Adaptation", title: "LoRA Rank Update", copy: "A frozen weight matrix receives a compact low-rank update path.", render: renderLoraRankUpdate },
    { id: "flashattention-blocks", kicker: "Attention", title: "FlashAttention Blocks", copy: "Block tiles move between HBM and SRAM to reduce attention memory traffic.", render: renderFlashAttentionBlocks },
    { id: "moe-router-capacity", kicker: "LLM", title: "MoE Router Capacity", copy: "Token-level top-k routing fills expert slots and exposes capacity overflow.", render: renderMoeRouterCapacity, size: "wide" },
    { id: "speculative-decoding", kicker: "Inference", title: "Speculative Decode Verify", copy: "Draft tokens branch ahead while the target model accepts a prefix and rejects the tail.", render: renderSpeculativeDecodingVerify },
    { id: "rope-rotation", kicker: "Transformer", title: "RoPE Position Rotation", copy: "Position-indexed query and key vectors rotate before relative attention scoring.", render: renderRopePositionRotation },
    { id: "tiled-matmul", kicker: "Matrix", title: "Matmul Tile Accumulation", copy: "A and B tiles sweep into C while partial products accumulate.", render: renderMatmulTileAccumulation },
    { id: "scaled-dot-product-attention", kicker: "Attention", title: "Scaled Dot-Product Attention", copy: "QK scores are masked, normalized, then applied to V.", render: renderScaledDotProductAttention },
    { id: "multi-head-attention-merge", kicker: "Transformer", title: "Multi-Head Attention Merge", copy: "Several attention heads specialize before concatenation and output projection.", render: renderMultiHeadAttentionMerge },
    { id: "logit-lens-rank-bump", kicker: "Diagnostics", title: "Logit Lens Rank Bump", copy: "Candidate token ranks move across layers until the final answer separates.", render: renderLogitLensRankBump },
    { id: "residual-rmsnorm-stream", kicker: "Transformer", title: "Residual RMSNorm Stream", copy: "The residual stream branches through attention, adds back, then normalizes.", render: renderResidualRmsnormStream },
    { id: "swiglu-feed-forward", kicker: "Transformer", title: "SwiGLU Feed Forward", copy: "Up and gate projections multiply before down projection returns to model width.", render: renderSwigluFeedForward },
    { id: "paged-kv-cache", kicker: "Inference", title: "Paged KV Cache", copy: "Concurrent requests allocate fixed KV pages and reuse freed blocks.", render: renderPagedKvCache },
    { id: "web-load-timeline", kicker: "Performance", title: "Web Load Timeline", copy: "A page load unfolds across network, parsing, assets, paint, and interactivity lanes.", render: renderWebLoadTimeline, size: "wide" },
    { id: "tile-choropleth", kicker: "Geospatial", title: "Tile Choropleth", copy: "Region shapes colored by local intensity.", render: renderTileChoropleth },
    { id: "spiral-timeline", kicker: "Temporal", title: "Spiral Timeline", copy: "Long sequences wrapped into cyclic space.", render: renderSpiralTimeline },
    { id: "candlestick", kicker: "Financial", title: "Candlestick", copy: "Open-high-low-close movement with wicks.", render: renderCandlestick },
    { id: "flow-tokens", kicker: "Flow", title: "Flow Tokens", copy: "Moving particles reveal direction and cadence.", render: renderFlowTokens },
    { id: "process-control-loop", kicker: "Process Engineering", title: "P&ID Control Loop", copy: "A process vessel, pump, exchanger, valves, instrument bubbles, dashed signal lines, interlock, and flow pulses form a P&ID-style control loop.", render: renderProcessPidControlLoop, size: "wide" },
    { id: "nature-geometry", kicker: "Natural Math", title: "Natural Math Archetypes", copy: "Six archetypes connect a mathematical invariant, a generative rule, and a natural expression for the theory of three.", render: renderNaturalMathArchetypes, size: "full" },
    { id: "dorling", kicker: "Geospatial", title: "Dorling Cartogram", copy: "Values collide around geographic anchors.", render: renderDorlingCartogram },
    { id: "bar-race", kicker: "Ranking", title: "Bar Race", copy: "Ranks and magnitudes animate between states.", render: renderBarRace },
    { id: "focus-context", kicker: "Interaction", title: "Focus Context", copy: "A selected window links overview and detail.", render: renderFocusContext },
    { id: "quadtree-search", kicker: "Indexing", title: "Quadtree Search", copy: "Spatial index partitions reveal nearest lookup.", render: renderQuadtreeSearch },
    { id: "waterfall", kicker: "Accounting", title: "Waterfall", copy: "Sequential deltas build toward a final total.", render: renderWaterfall },
    { id: "diverging-stack", kicker: "Sentiment", title: "Diverging Stack", copy: "Likert responses split around a neutral center.", render: renderDivergingStack },
    { id: "ternary", kicker: "Composition", title: "Ternary Plot", copy: "Three-part mixtures mapped into simplex space.", render: renderTernary },
    { id: "point-range", kicker: "Uncertainty", title: "Point Range", copy: "Estimates with confidence intervals by group.", render: renderPointRange },
    { id: "bullet", kicker: "Performance", title: "Bullet Chart", copy: "Target, ranges, and current value in compact form.", render: renderBullet },
    { id: "facet-sparklines", kicker: "Small multiples", title: "Facet Sparklines", copy: "Repeated scales compare patterns across panels.", render: renderFacets },
    { id: "barcode-plot", kicker: "Events", title: "Barcode Plot", copy: "Dense event timing as ordered tick marks.", render: renderBarcode },
    { id: "event-cascade", kicker: "Causality", title: "Event Cascade", copy: "Timed events propagate across lagged lanes.", render: renderEventCascade },
    { id: "geofence-join", kicker: "Spatial join", title: "Geofenced Activity", copy: "Points classify into regions and roll up totals.", render: renderGeofenceJoin },
    { id: "isoline-terrain", kicker: "Surface", title: "Isoline Terrain", copy: "A scalar grid becomes nested elevation bands.", render: renderIsolineTerrain },
    { id: "ecdf", kicker: "Distribution", title: "Empirical CDF", copy: "Cumulative probability reveals quantiles and tails.", render: renderEcdf },
    { id: "forecast-fan", kicker: "Uncertainty", title: "Forecast Fan", copy: "Prediction intervals widen across future periods.", render: renderForecastFan },
    { id: "lasso-selection", kicker: "Selection", title: "Lasso Selection", copy: "A freeform region isolates an irregular cluster.", render: renderLassoSelection },
    { id: "freehand-trace", kicker: "Motion", title: "Freehand Trace", copy: "A red point draws a loose hand stroke and leaves ink behind.", render: renderFreehandTrace },
    { id: "ai-line-writing", kicker: "Motion", title: "AI Line Writing", copy: "Monoline strokes write AI Generated one letter at a time.", render: renderAiLineWriting },
    { id: "pen-curve-study", kicker: "Drawing", title: "Pen Curve Study", copy: "A precise pen point lays pressure-modulated calligraphic curves.", render: renderPenCurveStudy },
    { id: "pen-label-optimizer", kicker: "Labels", title: "Pen Label Optimizer", copy: "Dense mixed-length labels compare placement strategies and keep the best readable subset.", render: renderPenLabelOptimizer },
    { id: "critical-path", kicker: "Flow", title: "Critical Path DAG", copy: "Weighted dependencies reveal the bottleneck route.", render: renderCriticalPath },
    { id: "incident-escalation", kicker: "Critical", title: "Critical Incident Escalation", copy: "A SEV response timeline shows detection, command, comms, SLA pressure, mitigation, and recovery.", render: renderCriticalIncidentEscalation, size: "wide" },
    { id: "fault-tree", kicker: "Critical", title: "Critical Fault Tree", copy: "A safety fault tree traces a top event through OR and AND gates, basic events, minimal cut sets, and risk contribution.", render: renderCriticalFaultTree, size: "wide" },
    { id: "bowtie-barriers", kicker: "Critical", title: "Critical Bowtie Barrier", copy: "A safety bowtie maps threats, the top event, preventive barriers, consequences, mitigative barriers, and degraded controls.", render: renderCriticalBowtieBarrier, size: "wide" },
    { id: "mlp-simple", kicker: "AI", title: "MLP Simple", copy: "Gray neurons pulse red one layer at a time.", render: renderMlpSimple },
    { id: "mlp-execution", kicker: "AI", title: "Deep Learning Model Execution", copy: "A square model frame contains only an internal MLP pulsing through execution.", render: renderDeepLearningModelExecution },
    { id: "mlp-internals", kicker: "AI", title: "MLP Internals", copy: "A forward pass pulses neurons while x, z, a, W, b, and y_hat stay visible.", render: renderMlpInternals },
    { id: "binary-classifier", kicker: "AI", title: "Binary Classifier", copy: "A forward pass routes one sample into one of two outcomes.", render: renderBinaryClassifier },
    { id: "binary-classifier-labeled", kicker: "AI", title: "Binary Classifier Labels", copy: "The same binary decision includes feature, probability, and class labels.", render: renderBinaryClassifierLabeled },
    { id: "temporal-network", kicker: "Network", title: "Network Evolution", copy: "Topology snapshots settle as links change.", render: renderTemporalNetwork },
    { id: "tangled-tree", kicker: "Hierarchy", title: "Tangled Tree", copy: "A layered tree allows multiple parents per child.", render: renderTangledTree },
    { id: "tangled-tree-levels", kicker: "Hierarchy", title: "Tangled Tree Levels", copy: "A multi-parent DAG draws one hierarchy level at a time.", render: renderTangledTreeLevels, size: "wide" },
    { id: "calendar-year", kicker: "Calendar", title: "Calendar Year", copy: "Daily values wrap into month grids and weekly rows.", render: renderCalendarYear },
    { id: "vaccine-impact", kicker: "Public health", title: "Vaccine Impact", copy: "Disease incidence collapses after intervention markers.", render: renderVaccineImpact },
    { id: "word-cloud", kicker: "Text", title: "Word Cloud", copy: "Weighted terms occupy an animated text layout.", render: renderWordCloud },
    { id: "voronoi-stippling", kicker: "Sampling", title: "Voronoi Stippling", copy: "Points and cells approximate a continuous intensity field.", render: renderVoronoiStippling },
    { id: "creature-stippling", kicker: "Sampling", title: "Pocket Monster Stippling", copy: "Weighted Voronoi stipples settle into a stylized electric creature silhouette.", render: renderPocketMonsterStippling },
    { id: "tanglegram", kicker: "Comparison", title: "Tanglegram", copy: "Two trees connect matched leaves across the middle.", render: renderTanglegram },
    { id: "scatterplot-tour", kicker: "Projection", title: "Scatterplot Tour", copy: "Stable points move between two analytical projections.", render: renderScatterplotTour },
    { id: "zoom-to-bounds", kicker: "Focus", title: "Zoom to Bounds", copy: "A selected region expands into a linked detail panel.", render: renderZoomToBounds },
    { id: "difference-chart", kicker: "Temporal", title: "Difference Chart", copy: "Two series expose over and under performance bands.", render: renderDifferenceChart },
    { id: "hierarchical-bars", kicker: "Hierarchy", title: "Hierarchical Bars", copy: "Indented bars show parent and child magnitude together.", render: renderHierarchicalBars },
    { id: "stacked-grouped-bars", kicker: "Transition", title: "Stacked to Grouped", copy: "Bars move from composition to side-by-side comparison.", render: renderStackedGroupedBars },
    { id: "smooth-zoom", kicker: "Focus", title: "Smooth Zoom", copy: "A viewport path eases into a magnified data region.", render: renderSmoothZoom },
    { id: "projection-switch", kicker: "Projection", title: "Projection Switch", copy: "Geographic points shift between globe and flat views.", render: renderProjectionSwitch },
    { id: "world-tour", kicker: "Geospatial", title: "World Tour", copy: "Great-circle hops trace a route across a rotating globe.", render: renderWorldTour },
    { id: "moving-average", kicker: "Analysis", title: "Moving Average", copy: "A smoothed trend line separates signal from noise.", render: renderMovingAverage },
    { id: "bollinger-bands", kicker: "Financial", title: "Bollinger Bands", copy: "Rolling volatility wraps price with dynamic bands.", render: renderBollingerBands },
    { id: "qq-plot", kicker: "Diagnostics", title: "Q-Q Plot", copy: "Sample quantiles are compared against a reference line.", render: renderQqPlot },
    { id: "scatterplot-matrix", kicker: "Multivariate", title: "Scatterplot Matrix", copy: "Pairwise relationships fill a compact grid of panels.", render: renderScatterplotMatrix },
    { id: "variable-color-line", kicker: "Encoding", title: "Variable Color Line", copy: "Line segments change color as a thresholded value changes.", render: renderVariableColorLine },
    { id: "marey-trains", kicker: "Schedule", title: "Marey Trains", copy: "Moving services appear as diagonal space-time trajectories.", render: renderMareyTrains },
    { id: "radial-stacked-bars", kicker: "Radial", title: "Radial Stacked Bars", copy: "Stacked segments compare composition around a circular axis.", render: renderRadialStackedBars },
    { id: "bivariate-choropleth", kicker: "Geospatial", title: "Bivariate Choropleth", copy: "Two metrics combine into a 3-by-3 regional color key.", render: renderBivariateChoropleth },
    { id: "projection-comparison", kicker: "Projection", title: "Projection Comparison", copy: "The same coordinates expose projection distortion side by side.", render: renderProjectionComparison },
    { id: "tissot-indicatrix", kicker: "Projection", title: "Tissot Indicatrix", copy: "Equal angular circles reveal distortion across a map.", render: renderTissotIndicatrix },
    { id: "vector-field", kicker: "Field", title: "Vector Field", copy: "Direction and magnitude are encoded as small arrows.", render: renderVectorField },
    { id: "solar-terminator", kicker: "Geospatial", title: "Solar Terminator", copy: "A day-night boundary sweeps across a world grid.", render: renderSolarTerminator },
    { id: "star-map", kicker: "Astronomy", title: "Star Map", copy: "Spherical coordinates become a radial sky chart.", render: renderStarMap },
    { id: "polar-clock", kicker: "Radial", title: "Polar Clock", copy: "Nested arcs encode cyclic units of time.", render: renderPolarClock },
    { id: "moon-phases", kicker: "Astronomy", title: "Moon Phases", copy: "Repeated masks show the lunar cycle as changing illumination.", render: renderMoonPhases },
    { id: "parabolic-arcs", kicker: "Geometry", title: "Parabolic Arcs", copy: "Curved trajectories connect ordered endpoints with height encoding.", render: renderParabolicArcs },
    { id: "burtin-antibiotics", kicker: "Radial matrix", title: "Burtin Antibiotics", copy: "A radial sensitivity matrix compares organisms and treatments.", render: renderBurtinAntibiotics },
    { id: "sized-donut-multiples", kicker: "Multiples", title: "Sized Donut Multiples", copy: "Small radial pies compare share and total size together.", render: renderSizedDonutMultiples },
    { id: "colorbrewer-splines", kicker: "Color", title: "ColorBrewer Splines", copy: "Interpolated spline ribbons show sequential palette movement.", render: renderColorbrewerSplines },
    { id: "apollonius-circles", kicker: "Geometry", title: "Apollonius Circles", copy: "Circle solutions reveal tangent constraints between anchors.", render: renderApolloniusCircles },
    { id: "spike-map", kicker: "Geospatial", title: "Spike Map", copy: "Local intensity rises as vertical spikes over a projected grid.", render: renderSpikeMap },
    { id: "bubble-map", kicker: "Geospatial", title: "Bubble Map", copy: "Projected point symbols encode regional magnitude.", render: renderBubbleMap },
    { id: "normalized-stacked-area", kicker: "Temporal", title: "Normalized Stacked Area", copy: "Category shares sum to 100 percent across time.", render: renderNormalizedStackedArea },
    { id: "directed-chord", kicker: "Flow", title: "Directed Chord", copy: "Asymmetric ribbons expose sender and receiver imbalance.", render: renderDirectedChord },
    { id: "volcano-contours", kicker: "Surface", title: "Volcano Contours", copy: "A synthetic height field becomes nested contour bands.", render: renderVolcanoContours },
    { id: "radial-area", kicker: "Radial", title: "Radial Area", copy: "A cyclic time series wraps into a filled polar profile.", render: renderRadialArea },
    { id: "mirrored-beeswarm", kicker: "Distribution", title: "Mirrored Beeswarm", copy: "Two groups mirror around a central quantitative axis.", render: renderMirroredBeeswarm },
    { id: "index-chart", kicker: "Temporal", title: "Index Chart", copy: "Multiple series rebase to a common starting value.", render: renderIndexChart },
    { id: "quadtree-partition", kicker: "Indexing", title: "Animated Quadtree", copy: "Recursive spatial partitions reveal point index depth.", render: renderAnimatedQuadtree },
    { id: "drag-collisions", kicker: "Simulation", title: "Drag Collisions", copy: "Collision resolution spreads overlapping nodes from a dragged focus.", render: renderDragCollisions },
    { id: "dot-plot", kicker: "Ranking", title: "Dot Plot", copy: "Compact ranked points compare paired measures.", render: renderDotPlot },
    { id: "line-missing-data", kicker: "Temporal", title: "Line with Missing Data", copy: "Gaps preserve absent observations instead of implying continuity.", render: renderLineMissingData },
    { id: "area-missing-data", kicker: "Temporal", title: "Area with Missing Data", copy: "Filled segments stop and restart around missing periods.", render: renderAreaMissingData },
    { id: "orthographic-shading", kicker: "Projection", title: "Orthographic Shading", copy: "A globe projection uses radial light to suggest curvature.", render: renderOrthographicShading },
    { id: "parallel-sets", kicker: "Flow", title: "Parallel Sets", copy: "Categorical ribbons connect counts across multiple dimensions.", render: renderParallelSets },
    { id: "shape-tween", kicker: "Morph", title: "Shape Tween", copy: "A polygon morphs between two compatible point sets.", render: renderShapeTween },
    { id: "arc-tween", kicker: "Morph", title: "Arc Tween", copy: "Radial segments interpolate from one angle state to another.", render: renderArcTween },
    { id: "path-tween", kicker: "Morph", title: "Path Tween", copy: "A path interpolates between two line geometries.", render: renderPathTween },
    { id: "text-tween", kicker: "Motion", title: "Text Tween", copy: "Counters and labels animate value changes directly.", render: renderTextTween },
    { id: "brush-handles", kicker: "Interaction", title: "Brush Handles", copy: "Custom brush handles make a selected interval legible.", render: renderBrushHandles },
    { id: "brush-snapping", kicker: "Interaction", title: "Brush Snapping", copy: "A loose brush snaps to calendar-like interval boundaries.", render: renderBrushSnapping },
    { id: "ordinal-brushing", kicker: "Interaction", title: "Ordinal Brushing", copy: "Categorical bins are selected with an ordinal brush range.", render: renderOrdinalBrushing },
    { id: "zoomable-bar", kicker: "Focus", title: "Zoomable Bar", copy: "A local categorical range expands while context remains visible.", render: renderZoomableBar },
    { id: "xy-zoom", kicker: "Focus", title: "X/Y Zoom", copy: "Independent axis windows crop a two-dimensional scatter field.", render: renderXyZoom },
    { id: "versor-dragging", kicker: "Projection", title: "Versor Dragging", copy: "A globe rotates along a drag arc using spherical interpolation.", render: renderVersorDragging },
    { id: "you-draw-it", kicker: "Prediction", title: "You Draw It", copy: "A guessed trajectory reveals against the observed series.", render: renderYouDrawIt },
    { id: "image-histogram", kicker: "Raster", title: "Image Histogram", copy: "A brushed image region links to a pixel-value distribution.", render: renderMonaHistogram },
    { id: "population-pyramid", kicker: "Demography", title: "Population Pyramid", copy: "Mirrored age bins compare two demographic groups.", render: renderPopulationPyramid },
    { id: "hr-diagram", kicker: "Science", title: "H-R Diagram", copy: "Stars map temperature and luminosity into a scientific scatter.", render: renderHrDiagram },
    { id: "solar-path", kicker: "Astronomy", title: "Solar Path", copy: "Seasonal sun arcs cross a local horizon diagram.", render: renderSolarPath },
    { id: "non-contiguous-cartogram", kicker: "Geospatial", title: "Non-contiguous Cartogram", copy: "Region shapes scale around fixed centroids by value.", render: renderNonContiguousCartogram },
    { id: "hexbin-map", kicker: "Geospatial", title: "Hexbin Map", copy: "Projected points aggregate into geographic hexagonal bins.", render: renderHexbinMap },
    { id: "airport-voronoi", kicker: "Geospatial", title: "Airports Voronoi", copy: "Nearest-airport service areas partition a projected region.", render: renderAirportsVoronoi },
    { id: "polygon-clipping", kicker: "Geometry", title: "Polygon Clipping", copy: "An input polygon is intersected with a clipping window.", render: renderPolygonClipping },
    { id: "occlusion-labels", kicker: "Labels", title: "Occlusion Labels", copy: "Dense labels resolve into a readable non-overlapping subset.", render: renderOcclusionLabels },
    { id: "correlogram", kicker: "Matrix", title: "Correlogram + Histograms", copy: "Pairwise panels combine correlations, scatters, and diagonals.", render: renderCorrelogramHistogram },
    { id: "rectbin", kicker: "Density", title: "2D Rectangular Histogram", copy: "Rectangular bins aggregate point density without hex geometry.", render: renderRectbinDensity },
    { id: "pie-data-switch", kicker: "Transition", title: "Pie Data Switch", copy: "Arc slices tween between two part-to-whole states.", render: renderPieDataSwitch },
    { id: "line-cursor", kicker: "Interaction", title: "Line Cursor", copy: "A nearest-point cursor links a vertical guide and value label.", render: renderLineCursor },
    { id: "cluster-dendrogram", kicker: "Hierarchy", title: "Cluster Dendrogram", copy: "Equal-depth leaves reveal the structure of a clustered tree.", render: renderClusterDendrogram },
    { id: "antimeridian-cutting", kicker: "Projection", title: "Antimeridian Cutting", copy: "A route splits cleanly at the dateline instead of crossing the map.", render: renderAntimeridianCutting },
    { id: "adaptive-sampling", kicker: "Geometry", title: "Adaptive Sampling", copy: "More sample points appear where a curve bends sharply.", render: renderAdaptiveSampling },
    { id: "curve-contexts", kicker: "Geometry", title: "Context to Curve", copy: "The same control points render through multiple D3 curve contexts.", render: renderContextToCurve },
    { id: "satellite-projection", kicker: "Projection", title: "Satellite Projection", copy: "Perspective footprint and horizon rings explain a satellite view.", render: renderSatelliteProjection },
    { id: "exoplanet-orbits", kicker: "Science", title: "Exoplanet Orbits", copy: "Orbital radius and planet size encode a compact science catalog.", render: renderExoplanetOrbits },
    { id: "epicyclic-gearing", kicker: "Geometry", title: "Epicyclic Gearing", copy: "Nested circular motion traces gear-like paths.", render: renderEpicyclicGearing }
  ];

  function assignPatternIds() {
    const seen = new Set();
    examples.forEach(example => {
      const basePatternId = example.basePatternId || example.patternId || `d3-${example.id}`;
      const legacyExampleId = legacyExampleIds.get(example.id) || example.id;
      example.basePatternId = basePatternId;
      if (!isStyledGallery) {
        example.patternId = basePatternId;
        example.legacyPatternId = `d3-pattern-${legacyExampleId}`;
      } else if (galleryStyleConfig.versionPatternSuffix) {
        example.patternId = `${basePatternId}-${galleryStyleConfig.versionPatternSuffix}`;
        example.legacyPatternId = galleryStyleVersion === "colorset2"
          ? `d3-pattern-cs2-${legacyExampleId}`
          : `d3-pattern-${legacyExampleId}-${galleryStyleConfig.versionPatternSuffix}`;
      } else {
        throw new Error(`Styled gallery ${galleryStyleVersion} must define versionPatternSuffix.`);
      }
      if (!/^[a-z0-9][a-z0-9-]*$/.test(example.patternId)) {
        throw new Error(`Invalid pattern ID for ${example.id}: ${example.patternId}`);
      }
      if (seen.has(example.patternId)) {
        throw new Error(`Duplicate pattern ID: ${example.patternId}`);
      }
      seen.add(example.patternId);
    });
  }

  function assetHref(path) {
    return `${galleryAssetBase}${path}`;
  }

  function exposeExampleMetadata() {
    window.D3_ANIMATED_SVG_EXAMPLES = examples.map(({ id, kicker, title, copy, patternId, legacyPatternId, basePatternId, size }) => ({
      id,
      kicker,
      title,
      copy,
      patternId,
      legacyPatternId,
      basePatternId,
      styleVersion: galleryStyleVersion,
      colorSet: galleryColorSet,
      size: size || "standard"
    }));
  }

  function createCards() {
    const gallery = d3.select("#gallery");
    gallery.selectAll("*").remove();
    gallery.selectAll("article")
      .data(examples)
      .join("article")
      .attr("class", d => `example-card${d.size === "wide" ? " example-card--wide" : ""}${d.size === "full" ? " example-card--full" : ""}`)
      .attr("id", d => d.patternId)
      .attr("data-example", d => d.id)
      .attr("data-example-id", d => d.id)
      .attr("data-pattern-id", d => d.patternId)
      .attr("data-legacy-pattern-id", d => d.legacyPatternId)
      .attr("data-base-pattern-id", d => d.basePatternId)
      .attr("data-style-version", galleryStyleVersion)
      .html(d => `
        <div class="example-header">
          <div class="example-header-top">
            <p class="example-kicker">${d.kicker}</p>
            <button class="card-replay-button" type="button" data-replay="${d.id}" aria-label="Replay ${d.title} animation"><span class="material-symbols-rounded" aria-hidden="true">replay</span><span>Replay</span></button>
          </div>
          <h2>${d.title}</h2>
          <p class="example-pattern-id">${d.patternId}</p>
          <p class="example-copy">${d.copy}</p>
        </div>
        <div class="viz-frame"><svg id="${d.id}" data-pattern-id="${d.patternId}" data-legacy-pattern-id="${d.legacyPatternId}" data-base-pattern-id="${d.basePatternId}" data-style-version="${galleryStyleVersion}" role="img"></svg></div>
      `);

    d3.select("#example-count").text(examples.length);
    document.body.dataset.exampleCount = String(examples.length);
    document.body.dataset.exampleId = galleryExampleSetId;
    document.body.dataset.patternId = galleryExampleSetId;
    document.body.dataset.patternPage = "true";
    document.body.dataset.styleVersion = galleryStyleVersion;
    document.body.dataset.colorSet = galleryColorSet;
    document.body.dataset.paletteName = galleryPaletteName;
  }

  function redirectLegacyPatternHash() {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    const example = examples.find(item => item.legacyPatternId === hash);
    if (!example) return;
    const target = document.getElementById(example.patternId);
    if (!target) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${example.patternId}`);
    target.scrollIntoView({ block: "start" });
  }

  function prepareSvg(id, title, desc) {
    const svg = d3.select(`#${id}`);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("aria-labelledby", `${id}-title ${id}-desc`);
    svg
      .attr("data-style-version", galleryStyleVersion)
      .attr("data-color-set", galleryColorSet)
      .attr("data-base-pattern-id", `d3-${id}`);
    svg.append("title").attr("id", `${id}-title`).text(title);
    svg.append("desc").attr("id", `${id}-desc`).text(desc);
    return svg;
  }

  function fadeIn(selection, delay = 0, dur = 0.7) {
    selection.attr("opacity", 1).each(function () {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", `${dur}s`)
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
    });
  }

  function revealIn(selection, delay = 0, dur = 0.7) {
    selection.attr("opacity", 1).each(function (d, i) {
      const resolvedDelay = typeof delay === "function" ? Number(delay(d, i)) : Number(delay);
      const resolvedDur = typeof dur === "function" ? Number(dur(d, i)) : Number(dur);
      const safeDelay = Number.isFinite(resolvedDelay) ? Math.max(0, resolvedDelay) : 0;
      const safeDur = Number.isFinite(resolvedDur) ? Math.max(0.001, resolvedDur) : 0.7;
      const animation = d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("dur", `${safeDelay + safeDur}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
      if (safeDelay > 0) {
        animation
          .attr("values", "0;0;1")
          .attr("keyTimes", `0;${(safeDelay / (safeDelay + safeDur)).toFixed(3)};1`);
      } else {
        animation
          .attr("from", 0)
          .attr("to", 1);
      }
    });
  }

  function grow(selection, attr, from, to, delay = 0, dur = 0.7) {
    selection.attr(attr, to).each(function (_, i) {
      d3.select(this).append("animate")
        .attr("attributeName", attr)
        .attr("from", from)
        .attr("to", to)
        .attr("dur", `${dur}s`)
        .attr("begin", `${delay + i * 0.025}s`)
        .attr("fill", "freeze");
    });
  }

  function estimateSvgTextWidth(text, fontSize = 10) {
    return Array.from(String(text)).reduce((sum, char) => {
      if ("MW@#%".includes(char)) return sum + fontSize * .92;
      if ("ABCDEFGHKNOPQRSTUVWXYZ0123456789".includes(char)) return sum + fontSize * .68;
      if ("ilI.,:;!|".includes(char)) return sum + fontSize * .34;
      if (char === " ") return sum + fontSize * .32;
      return sum + fontSize * .56;
    }, 0);
  }

  function taskLabelBoxWidth(label, fontSize = 8.8, padding = 16, minWidth = 46) {
    return Math.ceil(Math.max(minWidth, estimateSvgTextWidth(label, fontSize) + padding));
  }

  function drawPath(selection, delay = 0, dur = 1.1) {
    selection.each(function () {
      const length = this.getTotalLength ? this.getTotalLength() : 240;
      d3.select(this)
        .attr("stroke-dasharray", `${length} ${length}`)
        .attr("stroke-dashoffset", 0);
      d3.select(this).append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("from", length)
        .attr("to", 0)
        .attr("dur", `${dur}s`)
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
    });
  }

  function sketchUnit(seed, index = 0) {
    const raw = Math.sin((seed + 1) * 127.1 + (index + 3) * 311.7) * 43758.5453123;
    return raw - Math.floor(raw);
  }

  function sketchJitter(seed, index, amount) {
    return (sketchUnit(seed, index) - .5) * 2 * amount;
  }

  function sketchPathD(points, seed, roughness = 1.5, curve = d3.curveLinear, closed = false) {
    const jittered = points.map(([x, y], i) => [
      x + sketchJitter(seed, i * 2, roughness),
      y + sketchJitter(seed, i * 2 + 1, roughness)
    ]);
    return d3.line().curve(closed ? d3.curveLinearClosed : curve)(jittered);
  }

  function sketchRectPoints(x, y, w, h, segments = 4) {
    const points = [];
    for (let i = 0; i <= segments; i += 1) points.push([x + w * (i / segments), y]);
    for (let i = 1; i <= segments; i += 1) points.push([x + w, y + h * (i / segments)]);
    for (let i = 1; i <= segments; i += 1) points.push([x + w - w * (i / segments), y + h]);
    for (let i = 1; i < segments; i += 1) points.push([x, y + h - h * (i / segments)]);
    return points;
  }

  function appendSketchStroke(parent, points, options = {}) {
    const {
      className = "sketch-stroke",
      stroke = palette.ink,
      strokeWidth = 2,
      opacity = .92,
      seed = 1,
      roughness = 1.4,
      delay = .08,
      dur = .9,
      curve = d3.curveLinear
    } = options;
    const group = parent.append("g").attr("class", className);
    const paths = group.selectAll("path")
      .data([0, 1])
      .join("path")
      .attr("d", layer => sketchPathD(points, seed + layer * 19, roughness * (layer ? .72 : 1), curve, false))
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", (d, i) => strokeWidth * (i ? .68 : 1))
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", (d, i) => opacity * (i ? .58 : 1));
    drawPath(paths, delay, dur);
    return group;
  }

  function appendSketchClosedShape(parent, points, options = {}) {
    const {
      className = "sketch-shape",
      fill = palette.blueHighlight,
      fillOpacity = .55,
      stroke = palette.ink,
      strokeWidth = 1.8,
      opacity = 1,
      seed = 1,
      roughness = 1.6,
      delay = .08,
      dur = .75
    } = options;
    const group = parent.append("g").attr("class", className);
    const fillPath = group.append("path")
      .attr("d", sketchPathD(points, seed, roughness, d3.curveLinear, true))
      .attr("fill", fill)
      .attr("fill-opacity", fillOpacity)
      .attr("stroke", "none")
      .attr("opacity", opacity);
    fadeIn(fillPath, delay, dur);
    const outlines = group.selectAll("path.sketch-outline")
      .data([0, 1])
      .join("path")
      .attr("class", "sketch-outline")
      .attr("d", layer => sketchPathD(points, seed + 31 + layer * 17, roughness * (layer ? .76 : 1), d3.curveLinear, true))
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", (d, i) => strokeWidth * (i ? .64 : 1))
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", (d, i) => (i ? .48 : .82) * opacity);
    drawPath(outlines, delay + .06, dur + .2);
    return group;
  }

  function appendSketchHachures(parent, x, y, w, h, options = {}) {
    const {
      stroke = palette.ink,
      strokeWidth = .9,
      opacity = .22,
      spacing = 12,
      seed = 1,
      roughness = .65,
      delay = .2,
      dur = .55
    } = options;
    if (w < 12 || h < 12) return parent.append("g");
    const lines = [];
    for (let s = x - h; s <= x + w; s += spacing) {
      const startX = Math.max(x, s);
      const endX = Math.min(x + w, s + h);
      const startY = y + h - (startX - s);
      const endY = y + h - (endX - s);
      if (startY >= y && startY <= y + h && endY >= y && endY <= y + h) {
        lines.push([[startX, startY], [endX, endY]]);
      }
    }
    const marks = parent.append("g").attr("class", "sketch-hachures").selectAll("path")
      .data(lines)
      .join("path")
      .attr("d", (line, i) => sketchPathD(line, seed + i * 7, roughness, d3.curveLinear, false))
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", strokeWidth)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", opacity);
    drawPath(marks, delay, dur);
    return marks;
  }

  function appendSketchRect(parent, x, y, w, h, options = {}) {
    const group = appendSketchClosedShape(parent, sketchRectPoints(x, y, w, h, options.segments || 4), options);
    if (options.hachure !== false) {
      appendSketchHachures(group, x, y, w, h, {
        stroke: options.hachureStroke || options.stroke || palette.ink,
        opacity: options.hachureOpacity ?? .18,
        seed: (options.seed || 1) + 211,
        delay: (options.delay || .08) + .18,
        spacing: options.hachureSpacing || 13
      });
    }
    return group;
  }

  function appendSketchBlob(parent, cx, cy, r, options = {}) {
    const count = options.points || 18;
    const seed = options.seed || 1;
    const roughness = options.roughness || .16;
    const points = d3.range(count).map(i => {
      const angle = (i / count) * Math.PI * 2;
      const radial = r * (1 + sketchJitter(seed, i, roughness));
      return [cx + Math.cos(angle) * radial, cy + Math.sin(angle) * radial];
    });
    return appendSketchClosedShape(parent, points, {
      fill: options.fill || palette.blue,
      fillOpacity: options.fillOpacity ?? .75,
      stroke: options.stroke || palette.surface,
      strokeWidth: options.strokeWidth || 1.2,
      opacity: options.opacity ?? 1,
      seed: seed + 79,
      roughness: (options.edgeRoughness || 1.1),
      delay: options.delay || .08,
      dur: options.dur || .62
    });
  }

  function appendSketchHorizontalAxis(svg, scale, y, ticks = 5, seed = 1) {
    const [x0, x1] = scale.range();
    appendSketchStroke(svg, [[x0, y], [x1, y]], { stroke: palette.gray500, strokeWidth: 1.25, seed, roughness: .9, delay: .02, dur: .55 });
    const tickValues = scale.ticks ? scale.ticks(ticks) : scale.domain();
    tickValues.forEach((tick, i) => {
      const x = scale(tick);
      appendSketchStroke(svg, [[x, y], [x, y + 7]], { stroke: palette.gray500, strokeWidth: 1, seed: seed + 20 + i, roughness: .5, delay: .04, dur: .45 });
      svg.append("text")
        .attr("class", "caption")
        .attr("x", x)
        .attr("y", y + 23)
        .attr("text-anchor", "middle")
        .text(typeof tick === "number" ? d3.format("~s")(tick) : tick);
    });
  }

  function appendSketchVerticalAxis(svg, scale, x, ticks = 5, seed = 1) {
    const [y0, y1] = scale.range();
    appendSketchStroke(svg, [[x, y0], [x, y1]], { stroke: palette.gray500, strokeWidth: 1.25, seed, roughness: .9, delay: .02, dur: .55 });
    const tickValues = scale.ticks ? scale.ticks(ticks) : scale.domain();
    tickValues.forEach((tick, i) => {
      const y = scale(tick);
      appendSketchStroke(svg, [[x - 7, y], [x, y]], { stroke: palette.gray500, strokeWidth: 1, seed: seed + 40 + i, roughness: .5, delay: .04, dur: .45 });
      svg.append("text")
        .attr("class", "caption")
        .attr("x", x - 11)
        .attr("y", y + 4)
        .attr("text-anchor", "end")
        .text(typeof tick === "number" ? d3.format("~s")(tick) : tick);
    });
  }

  function addArrowMarker(svg, id, color = palette.ink) {
    const markerId = `${id}-arrow`;
    svg.append("defs").append("marker")
      .attr("id", markerId)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 9)
      .attr("refY", 0)
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5Z")
      .attr("fill", color);
    return `url(#${markerId})`;
  }

  function addSoftTableRules(svg, x1, x2, y1, y2, rowYs = [], columnXs = [], color = palette.gray100, opacity = .86, strokeWidth = .8) {
    const rules = svg.append("g")
      .attr("stroke", color)
      .attr("stroke-opacity", opacity)
      .attr("stroke-width", strokeWidth)
      .attr("shape-rendering", "crispEdges");
    rules.selectAll("line.table-row-rule").data(rowYs).join("line")
      .attr("class", "table-row-rule")
      .attr("x1", x1)
      .attr("x2", x2)
      .attr("y1", d => d)
      .attr("y2", d => d);
    rules.selectAll("line.table-column-rule").data(columnXs).join("line")
      .attr("class", "table-column-rule")
      .attr("x1", d => d)
      .attr("x2", d => d)
      .attr("y1", y1)
      .attr("y2", y2);
    return rules;
  }

  function axisBottom(svg, scale, y, ticks = 5) {
    svg.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${y})`)
      .call(d3.axisBottom(scale).ticks(ticks));
  }

  function axisLeft(svg, scale, x, ticks = 5) {
    svg.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(${x},0)`)
      .call(d3.axisLeft(scale).ticks(ticks));
  }

  const schematicLand = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { region: "North America" }, geometry: { type: "Polygon", coordinates: [[[-168, 16], [-150, 68], [-108, 74], [-58, 50], [-80, 8], [-122, 12], [-168, 16]]] } },
      { type: "Feature", properties: { region: "South America" }, geometry: { type: "Polygon", coordinates: [[[-82, 12], [-50, 10], [-34, -54], [-70, -56], [-82, 12]]] } },
      { type: "Feature", properties: { region: "Eurasia" }, geometry: { type: "Polygon", coordinates: [[[-10, 35], [6, 70], [72, 76], [178, 54], [150, 8], [96, 6], [42, 28], [-10, 35]]] } },
      { type: "Feature", properties: { region: "Africa" }, geometry: { type: "Polygon", coordinates: [[[-18, 34], [48, 34], [42, -36], [12, -35], [-18, 34]]] } },
      { type: "Feature", properties: { region: "Australia" }, geometry: { type: "Polygon", coordinates: [[[112, -10], [154, -12], [150, -44], [114, -38], [112, -10]]] } },
      { type: "Feature", properties: { region: "Greenland" }, geometry: { type: "Polygon", coordinates: [[[-74, 60], [-60, 82], [-22, 84], [-20, 60], [-74, 60]]] } }
    ]
  };

  function appendSchematicLand(svg, path, fill = palette.gray100) {
    return svg.append("g")
      .attr("class", "schematic-land")
      .attr("data-map-context", "schematic-land")
      .selectAll("path")
      .data(schematicLand.features)
      .join("path")
      .attr("d", path)
      .attr("fill", fill)
      .attr("fill-opacity", .92)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", .8)
      .attr("stroke-linejoin", "round");
  }

  function quantizedRamp(domain, range) {
    return d3.scaleQuantize().domain(domain).range(range);
  }

  function normalizeHexColor(value) {
    const match = String(value).trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (!match) return null;
    const hex = match[1];
    if (hex.length === 3) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    }
    return `#${hex}`;
  }

  function channelToHex(value) {
    const channel = Math.max(0, Math.min(255, Math.round(Number(value))));
    return channel.toString(16).padStart(2, "0");
  }

  function normalizeColorValue(value) {
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    if (namedColorMap.has(lower)) return namedColorMap.get(lower).toLowerCase();
    const hex = normalizeHexColor(raw);
    if (hex) return hex;
    const rgbMatch = lower.match(/^rgba?\(([^)]+)\)$/);
    if (!rgbMatch) return null;
    const parts = rgbMatch[1].replace("/", " ").split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts.length > 3 ? Number(parts[3]) : 1;
    if (Number.isFinite(alpha) && alpha <= 0) return "transparent";
    return `#${channelToHex(parts[0])}${channelToHex(parts[1])}${channelToHex(parts[2])}`;
  }

  function rgbFromHex(hex) {
    const normalized = normalizeHexColor(hex);
    if (!normalized) return null;
    return [
      Number.parseInt(normalized.slice(1, 3), 16),
      Number.parseInt(normalized.slice(3, 5), 16),
      Number.parseInt(normalized.slice(5, 7), 16)
    ];
  }

  function nearestStyleColor(hex) {
    const source = rgbFromHex(hex);
    if (!source) return hex;
    let nearest = styleAllowedColorList[0] || hex;
    let bestDistance = Infinity;
    styleAllowedColorList.forEach(candidate => {
      const target = rgbFromHex(candidate);
      if (!target) return;
      const distance =
        (source[0] - target[0]) ** 2 +
        (source[1] - target[1]) ** 2 +
        (source[2] - target[2]) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = candidate;
      }
    });
    return nearest;
  }

  function remapTokenColor(value, forceStylePalette = false) {
    if (!value) return value;
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    if (lower === "none" || lower === "transparent" || lower === "currentcolor" || lower.startsWith("url(")) return raw;
    const direct = remappedColors.get(lower);
    if (direct) return direct;
    const normalized = normalizeColorValue(raw);
    if (!normalized) return raw;
    const remapped = remappedColors.get(normalized) || normalized;
    if (!forceStylePalette || remapped === "transparent" || styleAllowedColors.has(remapped)) return remapped;
    return nearestStyleColor(remapped);
  }

  function setReadableText(selection, fallback = palette.ink) {
    selection
      .style("fill", function () {
        const ownFill = this.getAttribute("fill");
        return remapTokenColor(ownFill) || fallback;
      })
      .style("paint-order", "stroke")
      .style("stroke", palette.surface)
      .style("stroke-width", 3)
      .style("stroke-linejoin", "round");
  }

  function polishSvg(id) {
    const svg = d3.select(`#${id}`);
    svg
      .attr("data-style-version", galleryStyleVersion)
      .attr("data-color-set", galleryColorSet)
      .attr("data-palette-name", galleryPaletteName)
      .attr("data-style-alignment", galleryStyleAlignment);

    svg.selectAll("*").each(function () {
      const node = d3.select(this);
      ["fill", "stroke", "stop-color", "flood-color"].forEach(attr => {
        const current = node.attr(attr);
        const next = remapTokenColor(current, isStyledGallery);
        if (next !== current) node.attr(attr, next);
      });
      if (isStyledGallery) {
        const styleText = node.attr("style");
        if (styleText) {
          const nextStyle = styleText.replace(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]+\)|\b(?:black|white)\b/g, match => remapTokenColor(match, true));
          if (nextStyle !== styleText) node.attr("style", nextStyle);
        }
      }
    });

    svg.selectAll(".axis path, .axis line").attr("stroke", palette.gray400);
    svg.selectAll(".axis text").style("fill", palette.gray700);
    svg.selectAll(".grid line").attr("stroke", palette.gray100);
    svg.selectAll("text").style("font-family", '"Open Sans", Arial, sans-serif');
    setReadableText(svg.selectAll(".caption, .label"), palette.gray700);
    setReadableText(svg.selectAll(".mark-label"), palette.ink);
    svg.selectAll(".reverse-label")
      .style("fill", palette.surface)
      .style("stroke", "none")
      .style("paint-order", "normal");

    if (tableExampleIds.has(id)) {
      svg.selectAll("text")
        .style("stroke", "none")
        .style("paint-order", "normal")
        .style("stroke-width", 0);
      svg.selectAll(".caption, .label").style("fill", palette.gray700);
      svg.selectAll(".reverse-label").style("fill", palette.surface);
    }

    if (id === "world-tour") {
      const route = svg.select("#world-tour-route");
      const node = route.node();
      if (node && !svg.select("#world-tour-route-halo").node()) {
        const halo = node.cloneNode(false);
        halo.setAttribute("id", "world-tour-route-halo");
        halo.setAttribute("stroke", palette.surface);
        halo.setAttribute("stroke-width", "6");
        halo.setAttribute("stroke-linecap", "round");
        halo.setAttribute("fill", "none");
        node.parentNode.insertBefore(halo, node);
      }
    }
  }

  function hierarchyData() {
    return {
      name: "Platform",
      children: [
        { name: "Create", children: [{ name: "Prompt", value: 4 }, { name: "Draft", value: 7 }, { name: "Review", value: 5 }] },
        { name: "Serve", children: [{ name: "Cache", value: 5 }, { name: "Route", value: 4 }, { name: "Observe", value: 7 }] },
        { name: "Learn", children: [{ name: "Eval", value: 6 }, { name: "Trace", value: 5 }, { name: "Tune", value: 8 }] }
      ]
    };
  }

  function renderForceNetwork() {
    const svg = prepareSvg("force-network", "Force network", "D3 force simulation showing clustered topology.");
    const nodes = [
      { id: "API", group: "core" }, { id: "Auth", group: "core" }, { id: "Jobs", group: "core" },
      { id: "Search", group: "data" }, { id: "Index", group: "data" }, { id: "Events", group: "data" },
      { id: "Billing", group: "ops" }, { id: "Alerts", group: "ops" }, { id: "Reports", group: "ops" }
    ];
    const links = [
      ["API", "Auth"], ["API", "Jobs"], ["API", "Search"], ["Auth", "Billing"], ["Jobs", "Events"],
      ["Search", "Index"], ["Events", "Reports"], ["Billing", "Reports"], ["Alerts", "Events"],
      ["Alerts", "Billing"], ["Index", "Reports"]
    ].map(([source, target]) => ({ source, target }));
    const color = new Map([["core", palette.blue], ["data", palette.green], ["ops", palette.orange]]);
    const simNodes = nodes.map(d => ({ ...d }));
    const simLinks = links.map(d => ({ ...d }));
    const simulation = d3.forceSimulation(simNodes)
      .randomSource(d3.randomLcg(0.63))
      .force("link", d3.forceLink(simLinks).id(d => d.id).distance(80).strength(.58))
      .force("charge", d3.forceManyBody().strength(-190))
      .force("collide", d3.forceCollide(25))
      .force("center", d3.forceCenter(width / 2, height / 2 + 12))
      .stop();
    for (let i = 0; i < 220; i += 1) simulation.tick();
    const link = svg.append("g").attr("stroke", palette.gray300).attr("stroke-width", 2)
      .selectAll("line").data(simLinks).join("line")
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    fadeIn(link, .1, .9);
    const node = svg.append("g").selectAll("g").data(simNodes, d => d.id).join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = node.append("circle")
      .attr("fill", d => color.get(d.group)).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(circles, "r", 3, 18, .15, .8);
    node.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 35).text(d => d.id);
    fadeIn(node.selectAll("text"), .7, .45);
  }

  function renderCategoryBurst() {
    const svg = prepareSvg("category-burst", "Category burst", "A central category blooms into floating subcategory nodes, then settles into a radial map.");
    const center = { x: width / 2, y: height / 2 + 4 };
    const toRadians = degrees => (degrees - 90) * Math.PI / 180;
    const spokes = [
      { id: "scope", label: "Scope", angle: 0, distance: 132, color: palette.blue, fill: palette.blueHighlight, r: 22 },
      { id: "inputs", label: "Inputs", angle: 42, distance: 142, color: palette.green, fill: palette.greenHighlight, r: 19 },
      { id: "people", label: "People", angle: 90, distance: 148, color: palette.orange, fill: palette.orangeHighlight, r: 21 },
      { id: "process", label: "Process", angle: 138, distance: 142, color: palette.purple, fill: palette.purpleHighlight, r: 19 },
      { id: "tools", label: "Tools", angle: 180, distance: 132, color: palette.red, fill: palette.redHighlight, r: 21 },
      { id: "outputs", label: "Outputs", angle: 222, distance: 142, color: palette.blueHover, fill: palette.blueHighlight, r: 20 },
      { id: "signals", label: "Signals", angle: 270, distance: 148, color: palette.greenHover, fill: palette.greenHighlight, r: 19 },
      { id: "risks", label: "Risks", angle: 318, distance: 142, color: palette.orangeHover, fill: palette.orangeHighlight, r: 18 }
    ].map((d, index) => {
      const angle = toRadians(d.angle);
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      const tangentX = -radialY;
      const tangentY = radialX;
      const wobble = index % 2 === 0 ? 18 : -18;
      return {
        ...d,
        index,
        angle,
        radialX,
        radialY,
        x: center.x + radialX * d.distance,
        y: center.y + radialY * d.distance,
        floatX: center.x + radialX * (d.distance * .78) + tangentX * wobble,
        floatY: center.y + radialY * (d.distance * .78) + tangentY * wobble,
        delay: .72 + index * .075
      };
    });

    const defs = svg.append("defs");
    const glow = defs.append("filter")
      .attr("id", "category-burst-soft-shadow")
      .attr("x", "-30%")
      .attr("y", "-30%")
      .attr("width", "160%")
      .attr("height", "160%");
    glow.append("feDropShadow")
      .attr("dx", 0)
      .attr("dy", 4)
      .attr("stdDeviation", 5)
      .attr("flood-color", palette.gray700)
      .attr("flood-opacity", .18);

    svg.append("circle")
      .attr("cx", center.x)
      .attr("cy", center.y)
      .attr("r", 152)
      .attr("fill", "none")
      .attr("stroke", palette.gray100)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "4 8")
      .attr("opacity", .72);

    const rootHalo = svg.append("circle")
      .attr("cx", center.x)
      .attr("cy", center.y)
      .attr("r", 12)
      .attr("fill", "none")
      .attr("stroke", palette.blueHighlight)
      .attr("stroke-width", 12)
      .attr("opacity", .55);
    rootHalo.append("animate")
      .attr("attributeName", "r")
      .attr("from", 12)
      .attr("to", 54)
      .attr("dur", ".85s")
      .attr("begin", "0s")
      .attr("fill", "freeze");
    rootHalo.append("animate")
      .attr("attributeName", "opacity")
      .attr("from", .55)
      .attr("to", 0)
      .attr("dur", ".85s")
      .attr("begin", "0s")
      .attr("fill", "freeze");

    const links = svg.append("g")
      .attr("class", "category-burst-links")
      .attr("fill", "none")
      .attr("stroke-linecap", "round")
      .selectAll("path")
      .data(spokes, d => d.id)
      .join("path")
      .attr("class", "category-burst-link")
      .attr("data-subcategory-id", d => d.id)
      .attr("d", d => {
        const bend = d.index % 2 === 0 ? 20 : -20;
        const c1x = center.x + d.radialX * 54 - d.radialY * bend;
        const c1y = center.y + d.radialY * 54 + d.radialX * bend;
        const c2x = center.x + d.radialX * (d.distance * .62) + d.radialY * bend * .75;
        const c2y = center.y + d.radialY * (d.distance * .62) - d.radialX * bend * .75;
        return `M${center.x},${center.y} C${c1x},${c1y} ${c2x},${c2y} ${d.x},${d.y}`;
      })
      .attr("stroke", d => d.color)
      .attr("stroke-width", 2.2)
      .attr("stroke-opacity", .68);
    links.each(function (d) {
      const length = this.getTotalLength ? this.getTotalLength() : d.distance;
      const delay = .52 + d.index * .07;
      const dur = 1.1;
      d3.select(this)
        .attr("stroke-dasharray", `${length} ${length}`)
        .attr("stroke-dashoffset", 0)
        .append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("values", `${length};${length};0`)
        .attr("keyTimes", `0;${(delay / (delay + dur)).toFixed(3)};1`)
        .attr("dur", `${delay + dur}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
    });

    const root = svg.append("g")
      .attr("class", "category-burst-root")
      .attr("data-node-role", "root")
      .attr("transform", `translate(${center.x},${center.y})`)
      .attr("filter", "url(#category-burst-soft-shadow)");
    const rootCircle = root.append("circle")
      .attr("r", 36)
      .attr("fill", palette.ink)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 3);
    rootCircle.append("animate")
      .attr("attributeName", "r")
      .attr("values", "0;36")
      .attr("dur", ".56s")
      .attr("begin", "0s")
      .attr("fill", "freeze")
      .attr("calcMode", "spline")
      .attr("keySplines", ".2 .8 .2 1");
    root.append("text")
      .attr("class", "reverse-label")
      .attr("text-anchor", "middle")
      .attr("y", -4)
      .attr("font-size", 12)
      .attr("font-weight", 800)
      .text("Main");
    root.append("text")
      .attr("class", "reverse-label")
      .attr("text-anchor", "middle")
      .attr("y", 12)
      .attr("font-size", 9)
      .attr("font-weight", 700)
      .text("category");

    const nodeGroups = svg.append("g")
      .attr("class", "category-burst-nodes")
      .selectAll("g")
      .data(spokes, d => d.id)
      .join("g")
      .attr("class", "category-burst-node")
      .attr("data-node-role", "subcategory")
      .attr("data-subcategory-id", d => d.id)
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("opacity", 1);
    nodeGroups.each(function (d) {
      const total = d.delay + 1.65;
      const floatAt = (d.delay + 1.16) / total;
      const group = d3.select(this);
      group.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "translate")
        .attr("values", `${center.x} ${center.y};${center.x} ${center.y};${d.floatX} ${d.floatY};${d.x} ${d.y}`)
        .attr("keyTimes", `0;${(d.delay / total).toFixed(3)};${floatAt.toFixed(3)};1`)
        .attr("dur", `${total}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze")
        .attr("calcMode", "spline")
        .attr("keySplines", ".4 0 .2 1;.22 .82 .22 1;.3 0 .1 1");
      group.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;0;1")
        .attr("keyTimes", `0;${(d.delay / (d.delay + .42)).toFixed(3)};1`)
        .attr("dur", `${d.delay + .42}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
    });
    const satelliteCircles = nodeGroups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 2.4);
    satelliteCircles.each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "r")
        .attr("values", `5;${d.r + 2};${d.r}`)
        .attr("dur", ".72s")
        .attr("begin", `${d.delay + .28}s`)
        .attr("fill", "freeze")
        .attr("calcMode", "spline")
        .attr("keySplines", ".2 .8 .2 1;.28 0 .22 1");
    });
    nodeGroups.append("circle")
      .attr("r", d => d.r + 5)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.4)
      .attr("stroke-opacity", .18);

    const labels = nodeGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.radialX * (d.r + 16))
      .attr("y", d => d.radialY * (d.r + 16) + 4)
      .attr("text-anchor", d => {
        if (Math.abs(d.radialX) < .24) return "middle";
        return d.radialX > 0 ? "start" : "end";
      })
      .attr("font-size", 11.2)
      .attr("font-weight", 800)
      .text(d => d.label);
    labels.each(function (d) {
      const delay = d.delay + 1.1;
      const dur = .42;
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;0;1")
        .attr("keyTimes", `0;${(delay / (delay + dur)).toFixed(3)};1`)
        .attr("dur", `${delay + dur}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
    });
  }

  function renderRadialHierarchy() {
    const svg = prepareSvg("radial-hierarchy", "Radial hierarchy", "D3 radial cluster with drawn parent-child paths.");
    const root = d3.hierarchy(hierarchyData());
    const radius = 156;
    d3.cluster().size([2 * Math.PI, radius])(root);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const radialPoint = d => [Math.cos(d.x - Math.PI / 2) * d.y, Math.sin(d.x - Math.PI / 2) * d.y];
    const link = d3.linkRadial().angle(d => d.x).radius(d => d.y);
    const links = center.append("g").attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-width", 1.7)
      .selectAll("path").data(root.links()).join("path").attr("d", link);
    drawPath(links, .15, 1.15);
    const nodes = center.append("g").selectAll("g").data(root.descendants()).join("g")
      .attr("transform", d => `translate(${radialPoint(d)})`);
    nodes.append("circle").attr("r", d => d.depth === 0 ? 18 : d.children ? 12 : 7)
      .attr("fill", d => d.depth === 0 ? palette.purple : d.children ? palette.blue : palette.green)
      .attr("stroke", "#fff").attr("stroke-width", 2);
    nodes.append("text").attr("class", "label").attr("dy", d => d.depth === 0 ? 34 : 4)
      .attr("x", d => d.depth === 0 ? 0 : (d.x < Math.PI ? 12 : -12))
      .attr("text-anchor", d => d.depth === 0 ? "middle" : (d.x < Math.PI ? "start" : "end"))
      .text(d => d.data.name);
    fadeIn(nodes, .35, .7);
  }

  function renderBeeswarm() {
    const svg = prepareSvg("beeswarm", "Beeswarm distribution", "D3 force collision layout for individual observations.");
    const data = [
      ["Baseline", 34], ["Baseline", 41], ["Baseline", 46], ["Baseline", 52], ["Baseline", 57], ["Baseline", 63], ["Baseline", 69], ["Baseline", 74],
      ["Pilot", 39], ["Pilot", 48], ["Pilot", 54], ["Pilot", 59], ["Pilot", 67], ["Pilot", 73], ["Pilot", 81], ["Pilot", 86],
      ["Scaled", 45], ["Scaled", 53], ["Scaled", 61], ["Scaled", 68], ["Scaled", 76], ["Scaled", 83], ["Scaled", 88], ["Scaled", 92]
    ].map((d, i) => ({ id: `p${i}`, group: d[0], score: d[1] }));
    const margin = { top: 36, right: 30, bottom: 56, left: 82 };
    const x = d3.scaleLinear().domain([30, 95]).range([margin.left, width - margin.right]);
    const y = d3.scalePoint().domain(["Baseline", "Pilot", "Scaled"]).range([92, 300]).padding(.5);
    const groupColor = new Map([["Baseline", palette.blue], ["Pilot", palette.orange], ["Scaled", palette.green]]);
    const nodes = data.map(d => ({ ...d, x: x(d.score), y: y(d.group) }));
    const simulation = d3.forceSimulation(nodes).randomSource(d3.randomLcg(0.42))
      .force("x", d3.forceX(d => x(d.score)).strength(.95))
      .force("y", d3.forceY(d => y(d.group)).strength(.25))
      .force("collide", d3.forceCollide(10.5)).stop();
    for (let i = 0; i < 160; i += 1) simulation.tick();
    svg.append("g").attr("class", "grid").attr("transform", "translate(0,320)")
      .call(d3.axisBottom(x).ticks(6).tickSize(-260).tickFormat(""));
    axisBottom(svg, x, 320, 6);
    svg.selectAll(".group-label").data(y.domain()).join("text").attr("class", "label")
      .attr("x", margin.left - 18).attr("y", d => y(d)).attr("text-anchor", "end").attr("dy", "0.35em").text(d => d);
    const dots = svg.append("g").selectAll("circle").data(nodes, d => d.id).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => groupColor.get(d.group)).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots, "r", 2, 9, .12, .65);
    fadeIn(dots, .05, .7);
  }

  function renderStreamgraph() {
    const svg = prepareSvg("streamgraph", "Streamgraph", "D3 stacked areas with wiggle offset over time.");
    const keys = ["Search", "Assist", "Automate", "Review"];
    const color = d3.scaleOrdinal(keys, [palette.blue, palette.green, palette.orange, palette.purple]);
    const data = d3.range(12).map(i => ({
      month: i,
      Search: 20 + Math.sin(i / 1.6) * 8 + i * 1.2,
      Assist: 18 + Math.cos(i / 2.2) * 7 + i * .8,
      Automate: 10 + Math.sin(i / 1.3 + 1) * 6 + i * 1.4,
      Review: 12 + Math.cos(i / 1.9 + 2) * 5 + i * .5
    }));
    const margin = { top: 34, right: 24, bottom: 44, left: 28 };
    const series = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(data);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.month)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
      .domain([d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))])
      .range([height - margin.bottom, margin.top]);
    const area = d3.area().x(d => x(d.data.month)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);
    const layers = svg.append("g").selectAll("path").data(series).join("path")
      .attr("d", area).attr("fill", d => color(d.key)).attr("opacity", .88);
    fadeIn(layers, .1, .9);
    axisBottom(svg, x, height - margin.bottom, 6);
    svg.selectAll(".stream-label").data(series).join("text").attr("class", "mark-label")
      .attr("x", width - margin.right - 4)
      .attr("y", d => y((d[d.length - 2][0] + d[d.length - 2][1]) / 2))
      .attr("text-anchor", "end").text(d => d.key);
  }

  function renderVoronoi() {
    const svg = prepareSvg("voronoi", "Voronoi field", "D3 Delaunay triangulation converted to nearest-neighbor cells.");
    const points = [[88, 95, "North"], [168, 62, "Edge"], [265, 112, "Core"], [378, 72, "Lab"], [470, 135, "Field"], [128, 204, "Ops"], [240, 232, "Design"], [346, 205, "Data"], [438, 282, "Pilot"], [180, 318, "Scale"], [304, 336, "Learn"]];
    const delaunay = d3.Delaunay.from(points, d => d[0], d => d[1]);
    const voronoi = delaunay.voronoi([34, 34, width - 34, height - 34]);
    const color = d3.scaleOrdinal(d3.range(points.length), ["#d7e5f7", "#f7dfc6", "#d9ebd7", "#ece1f5", "#dcecef", "#f2d3d0", "#cfddf0", "#f2e4bd", "#d8e7de", "#e4ddf2", "#f0d8c4"]);
    const cells = svg.append("g").selectAll("path").data(points).join("path")
      .attr("d", (d, i) => voronoi.renderCell(i)).attr("fill", (d, i) => color(i))
      .attr("stroke", "#ffffff").attr("stroke-width", 2);
    fadeIn(cells, .05, .8);
    svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 5).attr("fill", palette.red);
    svg.append("g").selectAll("text").data(points).join("text").attr("class", "mark-label")
      .attr("x", d => d[0] + 9).attr("y", d => d[1] + 4).text(d => d[2]);
  }

  function renderChord() {
    const svg = prepareSvg("chord", "Chord ribbons", "D3 chord layout showing reciprocal category flow.");
    const names = ["Research", "Build", "Ship", "Support"];
    const matrix = [[0, 18, 7, 4], [9, 0, 21, 8], [5, 11, 0, 17], [8, 5, 13, 0]];
    const color = d3.scaleOrdinal(names, [palette.blue, palette.orange, palette.green, palette.purple]);
    const outerRadius = 142;
    const innerRadius = outerRadius - 18;
    const groupArc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
    const ribbon = d3.ribbon().radius(innerRadius - 2).padAngle(.02);
    const chord = d3.chord().padAngle(.06).sortSubgroups(d3.descending)(matrix);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const ribbons = g.append("g").attr("fill-opacity", .68).selectAll("path").data(chord).join("path")
      .attr("d", ribbon).attr("fill", d => color(names[d.source.index]))
      .attr("stroke", d => d3.color(color(names[d.source.index])).darker(.55));
    fadeIn(ribbons, .25, .95);
    const groups = g.append("g").selectAll("g").data(chord.groups).join("g");
    groups.append("path").attr("d", groupArc).attr("fill", d => color(names[d.index])).attr("stroke", "#ffffff").attr("stroke-width", 1.5);
    groups.append("text").attr("class", "mark-label").attr("dy", "0.35em").attr("transform", d => {
      const angle = (d.startAngle + d.endAngle) / 2;
      const rotate = angle * 180 / Math.PI - 90;
      const flip = angle > Math.PI ? " rotate(180)" : "";
      return `rotate(${rotate}) translate(${outerRadius + 14})${flip}`;
    }).attr("text-anchor", d => ((d.startAngle + d.endAngle) / 2) > Math.PI ? "end" : "start").text(d => names[d.index]);
    fadeIn(groups, .05, .7);
  }

  function renderTreemap() {
    const svg = prepareSvg("treemap", "Treemap", "D3 treemap layout showing nested area allocation.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([width - 48, height - 56]).paddingOuter(5).paddingTop(20).paddingInner(3).round(true)(root);
    const g = svg.append("g").attr("transform", "translate(24,28)");
    const color = d3.scaleOrdinal(root.children.map(d => d.data.name), colors);
    const branchName = d => d.depth === 1 ? d.data.name : d.parent.data.name;
    const nodes = g.selectAll("g").data(root.descendants().filter(d => d.depth)).join("g")
      .attr("transform", d => `translate(${d.x0},${d.y0})`);
    nodes.append("rect").attr("width", d => Math.max(0, d.x1 - d.x0)).attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("rx", 3).attr("fill", d => color(branchName(d))).attr("fill-opacity", d => d.children ? .25 : .82)
      .attr("stroke", "#fff");
    nodes.filter(d => d.children && (d.x1 - d.x0) > 52 && (d.y1 - d.y0) > 22).append("text")
      .attr("class", "treemap-parent-label")
      .attr("x", 7).attr("y", 15)
      .attr("fill", palette.ink)
      .attr("stroke", "none")
      .attr("font-size", 12)
      .attr("font-weight", 800)
      .text(d => d.data.name);
    nodes.filter(d => !d.children && (d.x1 - d.x0) > 52 && (d.y1 - d.y0) > 24).append("text")
      .attr("class", "treemap-leaf-label")
      .attr("x", 7).attr("y", 17)
      .attr("fill", d => branchName(d) === "Create" ? palette.gray900 : palette.surface)
      .attr("stroke", "none")
      .attr("font-size", 12)
      .attr("font-weight", 760)
      .text(d => d.data.name);
    fadeIn(nodes, .05, .7);
  }

  function renderCirclePack() {
    const svg = prepareSvg("circle-pack", "Circle packing", "D3 pack layout showing containment and relative area.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
    d3.pack().size([width - 72, height - 72]).padding(8)(root);
    const g = svg.append("g").attr("transform", "translate(36,36)");
    const nodes = g.selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
    const parentFill = new Map([["Create", palette.blueHighlight], ["Serve", palette.orangeHighlight], ["Learn", palette.greenHighlight]]);
    const leafFill = new Map([["Create", palette.blue], ["Serve", palette.orange], ["Learn", palette.green]]);
    const branchName = d => d.depth === 1 ? d.data.name : d.parent?.data.name;
    nodes.append("circle").attr("fill", d => {
      if (d.depth === 0) return palette.gray50;
      if (d.children) return parentFill.get(d.data.name) || palette.blueHighlight;
      return leafFill.get(branchName(d)) || palette.blue;
    })
      .attr("fill-opacity", d => d.depth === 0 ? 1 : .94)
      .attr("stroke", d => d.depth === 0 ? palette.blueHighlight : "#fff").attr("stroke-width", d => d.depth === 0 ? 2 : 2.4);
    grow(nodes.selectAll("circle"), "r", 1, d => d.r, .05, .75);
    nodes.filter(d => d.depth === 1).append("text").attr("class", "mark-label")
      .attr("text-anchor", "middle").attr("y", d => -d.r - 8).text(d => d.data.name);
    nodes.filter(d => !d.children).append("text").attr("class", "reverse-label")
      .style("font-size", d => d.data.name.length > 5 ? "10px" : "12px")
      .attr("text-anchor", "middle").attr("dy", ".35em").text(d => d.data.name);
    fadeIn(nodes.selectAll("text"), .5, .45);
  }

  function renderSunburst() {
    const svg = prepareSvg("sunburst", "Sunburst", "D3 radial partition showing nested composition.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0);
    d3.partition().size([2 * Math.PI, 170])(root);
    const arc = d3.arc().startAngle(d => d.x0).endAngle(d => d.x1).innerRadius(d => d.y0).outerRadius(d => d.y1 - 2);
    const color = d3.scaleOrdinal(["Create", "Serve", "Learn"], [palette.blue, palette.orange, palette.green]);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 10})`);
    const paths = g.selectAll("path").data(root.descendants().filter(d => d.depth)).join("path")
      .attr("d", arc).attr("fill", d => color((d.depth === 1 ? d : d.parent).data.name))
      .attr("fill-opacity", d => d.depth === 1 ? .72 : .95).attr("stroke", "#fff");
    fadeIn(paths, .08, .75);
    g.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", ".35em").text("Platform");
    const legend = svg.append("g").attr("transform", "translate(48,48)").selectAll("g").data(["Create", "Serve", "Learn"]).join("g")
      .attr("transform", (d, i) => `translate(0,${i * 22})`);
    legend.append("rect").attr("x", 0).attr("y", -10).attr("width", 13).attr("height", 13).attr("rx", 2).attr("fill", d => color(d));
    legend.append("text").attr("class", "mark-label").attr("x", 20).attr("y", 1).text(d => d);
  }

  function renderIcicle() {
    const svg = prepareSvg("icicle", "Icicle", "D3 partition laid out as horizontal nested bands.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0);
    d3.partition().size([width - 48, height - 58]).padding(2)(root);
    const color = d3.scaleOrdinal(["Platform", "Create", "Serve", "Learn"], [palette.purple, palette.blue, palette.orange, palette.green]);
    const g = svg.append("g").attr("transform", "translate(24,30)");
    const nodes = g.selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.x0},${d.y0})`);
    nodes.append("rect").attr("width", d => d.x1 - d.x0).attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("fill", d => color(d.depth <= 1 ? d.data.name : d.parent.data.name)).attr("fill-opacity", d => d.depth ? .85 : .22)
      .attr("stroke", "#fff").attr("rx", 2);
    nodes.filter(d => (d.x1 - d.x0) > 42).append("text")
      .attr("class", d => d.depth === 0 ? "mark-label" : "reverse-label")
      .style("font-size", d => (d.x1 - d.x0) < 64 ? "10px" : "12px")
      .attr("x", 5).attr("y", 18).text(d => d.data.name);
    fadeIn(nodes, .05, .7);
  }

  function renderTidyTree() {
    const svg = prepareSvg("tidy-tree", "Tidy tree", "D3 tree layout with horizontal links.");
    const root = d3.hierarchy(hierarchyData());
    d3.tree().size([height - 72, width - 150])(root);
    const g = svg.append("g").attr("transform", "translate(70,36)");
    const link = d3.linkHorizontal().x(d => d.y).y(d => d.x);
    const links = g.append("g").attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-width", 1.8)
      .selectAll("path").data(root.links()).join("path").attr("d", link);
    drawPath(links, .08, .9);
    const nodes = g.append("g").selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.y},${d.x})`);
    nodes.append("circle").attr("r", d => d.children ? 8 : 6).attr("fill", d => d.children ? palette.blue : palette.green).attr("stroke", "#fff").attr("stroke-width", 2);
    nodes.append("text").attr("class", "label").attr("x", d => d.children ? -12 : 12).attr("dy", ".35em").attr("text-anchor", d => d.children ? "end" : "start").text(d => d.data.name);
    fadeIn(nodes, .28, .5);
  }

  function renderEdgeBundling() {
    const svg = prepareSvg("edge-bundling", "Hierarchical edge bundling", "D3 curve bundle routing cross-links through a hierarchy.");
    const root = d3.hierarchy({
      name: "root",
      children: [
        { name: "UI", children: [{ name: "Forms" }, { name: "Canvas" }, { name: "Themes" }] },
        { name: "Data", children: [{ name: "Events" }, { name: "Index" }, { name: "Models" }] },
        { name: "Ops", children: [{ name: "Deploy" }, { name: "Logs" }, { name: "Alerts" }] }
      ]
    });
    d3.cluster().size([2 * Math.PI, 145])(root);
    const leaves = root.leaves();
    const byName = new Map(leaves.map(d => [d.data.name, d]));
    const pairs = [["Forms", "Events"], ["Canvas", "Models"], ["Themes", "Deploy"], ["Index", "Alerts"], ["Logs", "Forms"], ["Models", "Alerts"], ["Events", "Deploy"]];
    const line = d3.lineRadial().curve(d3.curveBundle.beta(.82)).radius(d => d.y).angle(d => d.x);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const paths = g.append("g").attr("fill", "none").attr("stroke", palette.purple).attr("stroke-opacity", .45).attr("stroke-width", 1.5)
      .selectAll("path").data(pairs).join("path").attr("d", d => line(byName.get(d[0]).path(byName.get(d[1]))));
    drawPath(paths, .15, 1.15);
    const labels = g.append("g").selectAll("text").data(leaves).join("text")
      .attr("class", "label").attr("dy", ".31em")
      .attr("transform", d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y + 10})${d.x >= Math.PI ? " rotate(180)" : ""}`)
      .attr("text-anchor", d => d.x < Math.PI ? "start" : "end").text(d => d.data.name);
    fadeIn(labels, .35, .5);
  }

  function renderArcDiagram() {
    const svg = prepareSvg("arc-diagram", "Arc diagram", "Ordered dependencies as curved arcs over nodes.");
    const nodes = ["Auth", "API", "Jobs", "Index", "Search", "Events", "Billing", "Reports"];
    const links = [["Auth", "API", 2], ["API", "Jobs", 4], ["API", "Search", 3], ["Jobs", "Events", 2], ["Index", "Search", 3], ["Events", "Reports", 4], ["Billing", "Reports", 2], ["API", "Reports", 1]];
    const x = d3.scalePoint().domain(nodes).range([52, width - 52]);
    const y = 300;
    const path = d => {
      const x1 = x(d[0]), x2 = x(d[1]), r = Math.abs(x2 - x1) / 2;
      return `M${x1},${y}A${r},${r} 0 0,1 ${x2},${y}`;
    };
    const arcs = svg.append("g").attr("fill", "none").attr("stroke", palette.blue).attr("stroke-opacity", .55)
      .selectAll("path").data(links).join("path").attr("d", path).attr("stroke-width", d => d[2]);
    drawPath(arcs, .12, .9);
    svg.append("g").selectAll("circle").data(nodes).join("circle").attr("cx", d => x(d)).attr("cy", y).attr("r", 6).attr("fill", palette.orange);
    svg.append("g").selectAll("text").data(nodes).join("text").attr("class", "label").attr("x", d => x(d)).attr("y", y + 22).attr("text-anchor", "middle").text(d => d);
  }

  function renderAdjacencyMatrix() {
    const svg = prepareSvg("adjacency-matrix", "Adjacency matrix", "Dense network relationship weights as cells.");
    const names = ["API", "Auth", "Jobs", "Search", "Index", "Events", "Reports"];
    const links = [["API", "Auth", 4], ["API", "Jobs", 3], ["API", "Search", 5], ["Search", "Index", 4], ["Jobs", "Events", 2], ["Events", "Reports", 5], ["Auth", "Reports", 2], ["Index", "Reports", 3]];
    const matrix = new Map(links.flatMap(([a, b, v]) => [[[a, b].join("|"), v], [[b, a].join("|"), v]]));
    const band = d3.scaleBand().domain(names).range([82, 352]).padding(.04);
    const color = quantizedRamp([1, 5], ramps.blue);
    const cells = svg.append("g").selectAll("rect").data(names.flatMap(a => names.map(b => ({ a, b, value: matrix.get([a, b].join("|")) || 0 })))).join("rect")
      .attr("x", d => band(d.a)).attr("y", d => band(d.b)).attr("width", band.bandwidth()).attr("height", band.bandwidth())
      .attr("fill", d => d.value ? color(d.value) : palette.gray100).attr("stroke", "#fff");
    fadeIn(cells, .05, .55);
    svg.append("g").selectAll("text.row").data(names).join("text").attr("class", "label").attr("x", 74).attr("y", d => band(d) + band.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d);
    svg.append("g").selectAll("text.col").data(names).join("text").attr("class", "label").attr("transform", d => `translate(${band(d) + band.bandwidth() / 2},74) rotate(-45)`).attr("text-anchor", "start").text(d => d);
  }

  function renderDataTableGrid() {
    const svg = prepareSvg("data-grid", "Data table grid", "A D3-built SVG table with typed columns and row-level emphasis.");
    const x0 = 32, y0 = 56, tableW = 496, rowH = 36, headerH = 34;
    const columns = [
      { key: "id", label: "ID", x: 14, w: 58 },
      { key: "owner", label: "Owner", x: 82, w: 102 },
      { key: "stage", label: "Stage", x: 194, w: 98 },
      { key: "risk", label: "Risk", x: 304, w: 72 },
      { key: "eta", label: "ETA", x: 388, w: 86 }
    ];
    const rows = [
      { id: "A-17", owner: "Nora", stage: "Design", risk: "Low", eta: "2d", color: palette.green },
      { id: "B-04", owner: "Kai", stage: "Build", risk: "Med", eta: "5d", color: palette.orange },
      { id: "C-22", owner: "Mira", stage: "Review", risk: "High", eta: "1d", color: palette.red },
      { id: "D-11", owner: "Sol", stage: "Ship", risk: "Low", eta: "0d", color: palette.blue },
      { id: "E-08", owner: "Jules", stage: "Learn", risk: "Med", eta: "7d", color: palette.purple },
      { id: "F-31", owner: "Rae", stage: "Build", risk: "Low", eta: "3d", color: palette.green }
    ];
    svg.append("rect").attr("x", x0).attr("y", y0).attr("width", tableW).attr("height", headerH + rows.length * rowH).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    svg.append("rect").attr("x", x0).attr("y", y0).attr("width", tableW).attr("height", headerH).attr("rx", 8).attr("fill", palette.ink);
    svg.append("rect").attr("x", x0).attr("y", y0 + headerH - 8).attr("width", tableW).attr("height", 8).attr("fill", palette.ink);
    addSoftTableRules(
      svg,
      x0,
      x0 + tableW,
      y0,
      y0 + headerH,
      [y0 + headerH],
      [x0 + 70, x0 + 184, x0 + 292, x0 + 380],
      palette.surface,
      .58,
      1
    );
    svg.append("g").selectAll("text").data(columns).join("text")
      .attr("class", "reverse-label")
      .attr("x", d => x0 + d.x)
      .attr("y", y0 + 22)
      .attr("font-weight", 800)
      .attr("font-size", 12.5)
      .text(d => d.label);
    const groups = svg.append("g").selectAll("g.table-row").data(rows).join("g")
      .attr("class", "table-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + headerH + i * rowH})`);
    groups.append("rect")
      .attr("width", tableW)
      .attr("height", rowH)
      .attr("fill", (d, i) => d.risk === "High" ? palette.redHighlight : i % 2 ? palette.gray50 : palette.surface)
      .attr("stroke", "none");
    addSoftTableRules(
      svg,
      x0,
      x0 + tableW,
      y0 + headerH,
      y0 + headerH + rows.length * rowH,
      d3.range(rows.length).map(i => y0 + headerH + i * rowH),
      [x0 + 70, x0 + 184, x0 + 292, x0 + 380]
    );
    groups.append("circle").attr("cx", 20).attr("cy", rowH / 2).attr("r", 4.6).attr("fill", d => d.color).attr("stroke", palette.surface).attr("stroke-width", 1.2);
    columns.forEach(col => {
      groups.append("text")
        .attr("class", "mark-label")
        .attr("x", col.key === "id" ? col.x + 18 : col.x)
        .attr("y", rowH / 2 + 5)
        .attr("font-weight", col.key === "risk" ? 800 : 600)
        .attr("font-size", 12)
        .text(d => d[col.key]);
    });
    fadeIn(groups, .06, .5);
  }

  function renderInlineBarTable() {
    const svg = prepareSvg("inline-bar-table", "Inline bar table", "A D3 SVG table with embedded bars inside input and output token-price cells.");
    const x0 = 34, y0 = 76, rowH = 30;
    const rows = [
      { model: "Gemma 4 E4B", provider: "Google API", input: 0.2, output: 0.2, color: palette.blue },
      { model: "Gemma 4 31B", provider: "Google API", input: 0.12, output: 0.35, color: palette.purple },
      { model: "Gemini 3.5 Flash", provider: "Google", input: 1.5, output: 9, color: palette.red },
      { model: "Gemini 3.1 Pro", provider: "Google", input: 2, output: 12, color: palette.blue },
      { model: "GPT-5.5", provider: "OpenAI", input: 5, output: 30, color: palette.green },
      { model: "Opus 4.7", provider: "Anthropic", input: 5, output: 25, color: palette.orange }
    ];
    const visibleRows = rows.filter(row => row.visible !== false);
    const price = value => value === 0 ? "$0" : value < 0.1 ? `$${value.toFixed(3)}` : value < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(2)}`;
    const columns = [
      { label: "Model", x: 0 },
      { label: "Input / 1M", x: 190 },
      { label: "Output / 1M", x: 350 }
    ];
    const metricConfigs = [
      { key: "input", x: 188, barWidth: 86, fill: () => palette.blue, labelX: 282, text: d => price(d.input), opacity: 1 },
      { key: "output", x: 350, barWidth: 86, fill: () => palette.purple, labelX: 444, text: d => price(d.output), opacity: 1 }
    ];
    const metrics = metricConfigs.map(metric => {
      const columnMax = d3.max(visibleRows, d => d[metric.key]) || 1;
      return {
        ...metric,
        columnMax,
        scale: d3.scaleLinear().domain([0, columnMax]).range([0, metric.barWidth])
      };
    });
    svg.append("rect").attr("x", x0 - 10).attr("y", y0 - 48).attr("width", 504).attr("height", 232).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    svg.append("g").selectAll("text").data(columns).join("text")
      .attr("class", "caption")
      .attr("x", d => x0 + d.x)
      .attr("y", y0 - 24)
      .attr("font-weight", 800)
      .attr("font-size", 11.5)
      .text(d => d.label);
    const g = svg.append("g").selectAll("g.inline-row").data(rows).join("g")
      .attr("class", "inline-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + i * rowH})`);
    g.append("rect").attr("x", -10).attr("y", -18).attr("width", 504).attr("height", rowH).attr("fill", (d, i) => i % 2 ? palette.gray50 : palette.surface);
    addSoftTableRules(
      svg,
      x0 - 10,
      x0 + 494,
      y0 - 18,
      y0 + rows.length * rowH - 18,
      d3.range(1, rows.length).map(i => y0 - 18 + i * rowH)
    );
    g.append("circle").attr("cx", 4).attr("cy", 1).attr("r", 3.2).attr("fill", d => d.color).attr("fill-opacity", .86);
    g.append("text").attr("class", "mark-label").attr("x", 14).attr("y", 1).attr("font-weight", 700).attr("font-size", 11.5).text(d => d.model);
    g.append("text").attr("class", "caption").attr("x", 14).attr("y", 14).attr("font-weight", 700).attr("font-size", 9.2).attr("fill", palette.gray600).text(d => d.provider);
    metrics.forEach(metric => {
      g.append("rect").attr("x", metric.x).attr("y", -9).attr("width", metric.barWidth).attr("height", 18).attr("rx", 5).attr("fill", palette.gray100);
      const bars = g.append("rect")
        .attr("class", "inline-bar")
        .attr("data-metric-key", metric.key)
        .attr("data-value", d => d[metric.key])
        .attr("data-column-max", metric.columnMax)
        .attr("data-bar-width", metric.barWidth)
        .attr("x", metric.x)
        .attr("y", -9)
        .attr("height", 18)
        .attr("rx", 5)
        .attr("fill", metric.fill)
        .attr("fill-opacity", metric.opacity);
      grow(bars, "width", 0, d => metric.scale(d[metric.key]), .12, .58);
      g.append("text").attr("class", "mark-label").attr("x", metric.labelX).attr("y", 6).attr("text-anchor", "start").attr("font-size", 11).text(metric.text);
    });
    fadeIn(g, .04, .45);
  }

  function renderPivotHeatTable() {
    const svg = prepareSvg("pivot-heat-table", "Pivot heat table", "A pivot-style data table with heat-encoded values and totals.");
    const rows = ["Search", "Direct", "Partner", "Email", "Social"];
    const cols = ["Q1", "Q2", "Q3", "Q4"];
    const values = [
      [54, 61, 73, 88],
      [42, 58, 64, 77],
      [31, 46, 52, 69],
      [64, 62, 57, 71],
      [22, 28, 35, 44]
    ];
    const x0 = 118, y0 = 76, cellW = 70, cellH = 46;
    const color = d3.scaleQuantize().domain([20, 90]).range([palette.yellowHighlight, palette.orangeHighlight, palette.orange, palette.red]);
    const darkHeatCell = value => value >= 61;
    svg.append("rect").attr("x", 54).attr("y", 48).attr("width", 448).attr("height", 286).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    svg.append("g").selectAll("text.col").data(cols).join("text")
      .attr("class", "caption")
      .attr("x", (d, i) => x0 + i * cellW + cellW / 2)
      .attr("y", y0 - 9)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .attr("font-size", 11.5)
      .text(d => d);
    svg.append("text").attr("class", "caption").attr("x", x0 + cols.length * cellW + 44).attr("y", y0 - 9).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 11.5).text("Total");
    svg.append("g").selectAll("text.row").data(rows).join("text")
      .attr("class", "mark-label")
      .attr("x", x0 - 16)
      .attr("y", (d, i) => y0 + i * cellH + cellH / 2 + 5)
      .attr("text-anchor", "end")
      .attr("font-size", 11.5)
      .text(d => d);
    const cells = rows.flatMap((r, ri) => cols.map((c, ci) => ({ row: r, col: c, ri, ci, value: values[ri][ci] })));
    const cell = svg.append("g").selectAll("g.pivot-cell").data(cells).join("g")
      .attr("class", "pivot-cell")
      .attr("transform", d => `translate(${x0 + d.ci * cellW},${y0 + d.ri * cellH})`);
    cell.append("rect")
      .attr("width", cellW - 4)
      .attr("height", cellH - 4)
      .attr("rx", 6)
      .attr("fill", d => color(d.value))
      .attr("stroke", d => darkHeatCell(d.value) ? palette.surface : palette.gray100)
      .attr("stroke-opacity", d => darkHeatCell(d.value) ? 1 : .86)
      .attr("stroke-width", d => darkHeatCell(d.value) ? 1.3 : .8);
    cell.append("text")
      .attr("class", d => d.value >= 73 ? "reverse-label" : "mark-label")
      .attr("x", (cellW - 4) / 2)
      .attr("y", (cellH - 4) / 2 + 5)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .attr("font-size", 12)
      .attr("fill", d => d.value >= 73 ? palette.surface : palette.ink)
      .text(d => d.value);
    rows.forEach((row, i) => {
      const total = d3.sum(values[i]);
      svg.append("text").attr("class", "mark-label").attr("x", x0 + cols.length * cellW + 44).attr("y", y0 + i * cellH + cellH / 2 + 5).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 11.5).text(total);
    });
    fadeIn(cell, .06, .58);
  }

  function renderSortableRankTable() {
    const svg = prepareSvg("rank-table", "Sortable rank table", "Rows animate from source order into score-sorted order.");
    const x0 = 54, y0 = 92, rowH = 34, tableW = 450;
    const rows = [
      { name: "Atlas", segment: "Core", score: 78, delta: 5 },
      { name: "Beacon", segment: "Growth", score: 91, delta: 12 },
      { name: "Cedar", segment: "Ops", score: 66, delta: -3 },
      { name: "Delta", segment: "Core", score: 84, delta: 7 },
      { name: "Echo", segment: "Growth", score: 72, delta: 2 },
      { name: "Flux", segment: "Ops", score: 88, delta: 9 }
    ];
    const sorted = rows.slice().sort((a, b) => d3.descending(a.score, b.score));
    const rank = new Map(sorted.map((d, i) => [d.name, i]));
    const score = d3.scaleLinear().domain([60, 95]).range([0, 132]);
    svg.append("rect").attr("x", x0 - 16).attr("y", y0 - 64).attr("width", tableW + 32).attr("height", 274).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    [
      ["Rank", 0],
      ["Team", 54],
      ["Seg.", 156],
      ["Score", 258],
      ["Delta", 406]
    ].forEach(([label, x]) => {
      svg.append("text").attr("class", "caption").attr("x", x0 + x).attr("y", y0 - 30).attr("font-weight", 800).attr("font-size", 11.5).text(label);
    });
    const groups = svg.append("g").selectAll("g.sort-row").data(rows).join("g")
      .attr("class", "sort-row")
      .attr("transform", d => `translate(${x0},${y0 + rank.get(d.name) * rowH})`);
    groups.each(function (d, i) {
      const finalY = y0 + rank.get(d.name) * rowH;
      const startY = y0 + i * rowH;
      d3.select(this).append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "translate")
        .attr("from", `${x0} ${startY}`)
        .attr("to", `${x0} ${finalY}`)
        .attr("dur", ".95s")
        .attr("begin", ".22s")
        .attr("fill", "freeze");
    });
    groups.append("rect").attr("x", -8).attr("y", -16).attr("width", tableW + 24).attr("height", rowH - 4).attr("rx", 6).attr("fill", d => rank.get(d.name) === 0 ? palette.blueHighlight : palette.gray50).attr("stroke", "none");
    groups.append("line").attr("x1", -8).attr("x2", tableW + 16).attr("y1", 16).attr("y2", 16).attr("stroke", palette.gray100).attr("stroke-opacity", .86).attr("stroke-width", .8).attr("shape-rendering", "crispEdges");
    groups.append("text").attr("class", "mark-label").attr("x", 14).attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => rank.get(d.name) + 1);
    groups.append("text").attr("class", "mark-label").attr("x", 54).attr("y", 6).attr("font-weight", 700).attr("font-size", 11.5).text(d => d.name);
    groups.append("text").attr("class", "caption").attr("x", 156).attr("y", 6).attr("font-size", 11).text(d => d.segment);
    groups.append("rect").attr("x", 258).attr("y", -9).attr("width", 142).attr("height", 18).attr("rx", 5).attr("fill", palette.gray100);
    const bars = groups.append("rect").attr("x", 258).attr("y", -9).attr("height", 18).attr("rx", 5).attr("fill", palette.blue).attr("stroke", palette.surface).attr("stroke-width", .9);
    grow(bars, "width", 0, d => score(d.score), .62, .55);
    groups.append("text").attr("class", "mark-label").attr("x", 407).attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => d.score);
    groups.append("text").attr("class", "mark-label").attr("x", 452).attr("y", 6).attr("text-anchor", "end").attr("fill", d => d.delta < 0 ? palette.red : palette.green).attr("font-size", 11.5).text(d => `${d.delta > 0 ? "+" : ""}${d.delta}`);
    fadeIn(groups, .04, .45);
  }

  function renderSparklineTable() {
    const svg = prepareSvg("sparkline-table", "Sparkline table", "Rows combine labels, miniature trends, current values, and deltas.");
    const x0 = 46, y0 = 92, rowH = 40;
    const rows = [
      { metric: "Latency", unit: "ms", values: [148, 132, 140, 121, 116, 104, 98] },
      { metric: "Throughput", unit: "rps", values: [320, 348, 360, 342, 388, 430, 468] },
      { metric: "Errors", unit: "%", values: [4.2, 3.8, 3.1, 2.9, 2.2, 1.7, 1.4] },
      { metric: "Adoption", unit: "%", values: [41, 44, 50, 57, 61, 68, 73] },
      { metric: "Cost", unit: "$", values: [88, 91, 84, 79, 77, 74, 70] }
    ];
    svg.append("rect").attr("x", x0 - 18).attr("y", y0 - 64).attr("width", 494).attr("height", 264).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    [
      ["Metric", 0],
      ["Trend", 148],
      ["Now", 352],
      ["Delta", 426]
    ].forEach(([label, x]) => {
      svg.append("text").attr("class", "caption").attr("x", x0 + x).attr("y", y0 - 30).attr("font-weight", 800).attr("font-size", 11.5).text(label);
    });
    const groups = svg.append("g").selectAll("g.spark-row").data(rows).join("g")
      .attr("class", "spark-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + i * rowH})`);
    groups.append("rect").attr("x", -12).attr("y", -18).attr("width", 480).attr("height", rowH - 6).attr("rx", 6).attr("fill", (d, i) => i % 2 ? palette.gray50 : palette.surface);
    addSoftTableRules(
      svg,
      x0 - 12,
      x0 + 468,
      y0 - 18,
      y0 + rows.length * rowH - 18,
      d3.range(1, rows.length).map(i => y0 - 18 + i * rowH)
    );
    groups.append("text").attr("class", "mark-label").attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => d.metric);
    groups.each(function (d) {
      const g = d3.select(this);
      const x = d3.scalePoint().domain(d3.range(d.values.length)).range([148, 314]);
      const y = d3.scaleLinear().domain(d3.extent(d.values)).nice().range([18, -14]);
      const points = d.values.map((value, i) => ({ value, i }));
      const line = d3.line().x(p => x(p.i)).y(p => y(p.value)).curve(d3.curveMonotoneX);
      g.append("path").datum(points).attr("d", line).attr("fill", "none").attr("stroke", d.values.at(-1) >= d.values[0] ? palette.green : palette.blue).attr("stroke-width", 2.6).attr("stroke-linecap", "round");
      g.append("circle").attr("cx", x(points.at(-1).i)).attr("cy", y(points.at(-1).value)).attr("r", 4.6).attr("fill", palette.red).attr("stroke", palette.surface).attr("stroke-width", 1.5);
    });
    drawPath(groups.selectAll("path"), .08, .74);
    groups.append("text").attr("class", "mark-label").attr("x", 352).attr("y", 6).attr("font-weight", 800).attr("font-size", 11.5).text(d => `${d.values.at(-1)}${d.unit}`);
    groups.append("text").attr("class", "mark-label").attr("x", 456).attr("y", 6).attr("text-anchor", "end").attr("fill", d => d.values.at(-1) >= d.values[0] ? palette.green : palette.blue)
      .attr("font-size", 11.5)
      .text(d => {
        const delta = d.values.at(-1) - d.values[0];
        return `${delta > 0 ? "+" : ""}${delta.toFixed(Math.abs(delta) < 10 ? 1 : 0)}`;
      });
    fadeIn(groups, .04, .45);
  }

  function renderColumnProfileTable() {
    const svg = prepareSvg("column-profile", "Column profile table", "A data profiling table rendered with D3 row profiles and mini distributions.");
    const x0 = 46, y0 = 92, rowH = 38;
    const rows = [
      { column: "customer_id", type: "string", complete: 1, unique: 1180, bins: [1, 1, 1, 1, 1, 1] },
      { column: "region", type: "category", complete: .98, unique: 5, bins: [34, 22, 18, 16, 10] },
      { column: "plan", type: "category", complete: .96, unique: 4, bins: [48, 26, 18, 8] },
      { column: "score", type: "number", complete: .93, unique: 74, bins: [4, 9, 18, 27, 24, 12, 6] },
      { column: "latency_ms", type: "number", complete: .89, unique: 122, bins: [28, 34, 22, 9, 5, 2] }
    ];
    svg.append("rect").attr("x", x0 - 18).attr("y", y0 - 64).attr("width", 494).attr("height", 246).attr("rx", 8).attr("fill", palette.surface).attr("stroke", "none");
    [
      ["Column", 0],
      ["Type", 138],
      ["Filled", 236],
      ["Unique", 366],
      ["Dist.", 428]
    ].forEach(([label, x]) => {
      svg.append("text").attr("class", "caption").attr("x", x0 + x).attr("y", y0 - 30).attr("font-weight", 800).attr("font-size", 11.5).text(label);
    });
    const groups = svg.append("g").selectAll("g.profile-row").data(rows).join("g")
      .attr("class", "profile-row")
      .attr("transform", (d, i) => `translate(${x0},${y0 + i * rowH})`);
    groups.append("rect").attr("x", -12).attr("y", -17).attr("width", 480).attr("height", rowH - 6).attr("rx", 6).attr("fill", (d, i) => i % 2 ? palette.gray50 : palette.surface);
    addSoftTableRules(
      svg,
      x0 - 12,
      x0 + 468,
      y0 - 17,
      y0 + rows.length * rowH - 17,
      d3.range(1, rows.length).map(i => y0 - 17 + i * rowH)
    );
    groups.append("text").attr("class", "mark-label").attr("y", 6).attr("font-weight", 800).attr("font-size", 11.2).text(d => d.column);
    groups.append("rect").attr("x", 138).attr("y", -11).attr("width", 76).attr("height", 22).attr("rx", 6).attr("fill", d => d.type === "number" ? palette.blueHighlight : palette.greenHighlight).attr("stroke", "none");
    groups.append("text").attr("class", "mark-label").attr("x", 176).attr("y", 6).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 10.5).text(d => d.type);
    groups.append("rect").attr("x", 236).attr("y", -9).attr("width", 72).attr("height", 18).attr("rx", 5).attr("fill", palette.gray100);
    const completeBars = groups.append("rect").attr("x", 236).attr("y", -9).attr("height", 18).attr("rx", 5).attr("fill", d => d.complete >= .95 ? palette.green : palette.orange).attr("stroke", palette.surface).attr("stroke-width", .9);
    grow(completeBars, "width", 0, d => d.complete * 72, .12, .58);
    groups.append("text").attr("class", "mark-label").attr("x", 314).attr("y", 6).attr("font-weight", 800).attr("font-size", 11).text(d => d3.format(".0%")(d.complete));
    groups.append("text").attr("class", "mark-label").attr("x", 366).attr("y", 6).attr("font-weight", 800).attr("font-size", 11).text(d => d3.format(",")(d.unique));
    groups.each(function (d) {
      const g = d3.select(this);
      const barW = 7;
      const gap = 3;
      const y = d3.scaleLinear().domain([0, d3.max(d.bins)]).range([0, 24]);
      const bars = g.append("g").selectAll("rect.dist").data(d.bins).join("rect")
        .attr("class", "dist")
        .attr("x", (value, i) => 428 + i * (barW + gap))
        .attr("y", value => 12 - y(value))
        .attr("width", barW)
        .attr("height", value => y(value))
        .attr("rx", 2)
        .attr("fill", d.type === "number" ? palette.blue : palette.purple)
        .attr("fill-opacity", .82)
        .attr("stroke", palette.surface)
        .attr("stroke-width", .7);
      fadeIn(bars, .18, .45);
    });
    fadeIn(groups, .04, .45);
  }

  function renderDocumentTokenQuality() {
    renderDocumentTokenQualityVariant(
      "document-token-quality",
      "Document token quality",
      "Document word blocks encode correct, filler, and wrong spans by accumulated word length.",
      { wrong: { fill: palette.gold, stroke: palette.yellowHover } }
    );
  }

  function renderDocumentTokenQualityRed() {
    renderDocumentTokenQualityVariant(
      "document-token-errors",
      "Document token quality red",
      "Document word blocks encode correct, filler, and red wrong spans by accumulated word length.",
      { wrong: { fill: palette.red, stroke: palette.redHover } }
    );
  }

  function renderDocumentTokenQualityVariant(exampleId, title, description, overrides = {}) {
    const svg = prepareSvg(exampleId, title, description);
    const categories = {
      correct: overrides.correct || { fill: palette.green, stroke: palette.greenHover },
      filler: overrides.filler || { fill: palette.gray500, stroke: palette.gray600 },
      wrong: overrides.wrong || { fill: palette.gold, stroke: palette.yellowHover }
    };
    const documents = [
      { id: "correct-20-filler-70-wrong-10", ratios: { correct: .2, filler: .7, wrong: .1 }, x: 42, y: 58 },
      { id: "correct-10-filler-85-wrong-05", ratios: { correct: .1, filler: .85, wrong: .05 }, x: 211, y: 58 },
      { id: "correct-70-filler-10-wrong-20", ratios: { correct: .7, filler: .1, wrong: .2 }, x: 380, y: 58 }
    ];
    const docW = 138;
    const docH = 296;
    const innerPadX = 14;
    const innerTop = 34;
    const rowGap = 20;
    const wordGap = 3.4;
    const wordHeight = 7;
    const totalUnits = 420;
    const unitPx = 1.78;
    const order = ["correct", "filler", "wrong"];
    const linePlans = [
      { row: 0, fill: .98 },
      { row: 1, fill: .94 },
      { row: 2, fill: .66 },
      { row: 4, fill: .99 },
      { row: 5, fill: .96 },
      { row: 6, fill: .94 },
      { row: 7, fill: .72 },
      { row: 9, fill: .96 },
      { row: 10, fill: .92 },
      { row: 11, fill: .58 },
      { row: 12, fill: .5 }
    ];
    const seeded01 = value => {
      const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
      return raw - Math.floor(raw);
    };
    const splitUnits = (units, salt) => {
      let remaining = units;
      const chunks = [];
      while (remaining > 0) {
        let length = 4 + Math.floor(seeded01(salt + chunks.length * 17) * 10);
        if (remaining <= 13) length = remaining;
        else if (remaining - length > 0 && remaining - length < 4) length = remaining;
        chunks.push(Math.min(length, remaining));
        remaining -= chunks.at(-1);
      }
      return chunks;
    };
    const documentWords = (doc, docIndex) => {
      const correctUnits = Math.round(totalUnits * doc.ratios.correct);
      const wrongUnits = Math.round(totalUnits * doc.ratios.wrong);
      const fillerUnits = totalUnits - correctUnits - wrongUnits;
      const budgets = { correct: correctUnits, filler: fillerUnits, wrong: wrongUnits };
      const tokens = order.flatMap((kind, kindIndex) => splitUnits(budgets[kind], 100 + docIndex * 73 + kindIndex * 41).map((units, index) => ({
        id: `${doc.id}-${kind}-${index}`,
        docId: doc.id,
        docIndex,
        kind,
        units,
        w: Math.max(5, units * unitPx),
        sort: seeded01((docIndex + 1) * 211 + kindIndex * 43 + index * 19)
      }))).sort((a, b) => d3.ascending(a.sort, b.sort));
      const innerX = doc.x + innerPadX;
      const innerW = docW - innerPadX * 2;
      const remaining = tokens.slice();
      const lines = [];
      linePlans.forEach((linePlan, lineOrder) => {
        const target = innerW * linePlan.fill;
        const rowWords = [];
        let used = 0;
        while (remaining.length) {
          const gap = rowWords.length ? wordGap : 0;
          const available = target - used - gap;
          const localWindow = remaining.slice(0, Math.min(remaining.length, 14));
          let candidates = localWindow
            .map((token, index) => ({ token, index }))
            .filter(candidate => candidate.token.w <= available)
            .sort((a, b) => d3.descending(a.token.w, b.token.w) || d3.ascending(a.index, b.index));
          if (!candidates.length) {
            candidates = remaining
              .map((token, index) => ({ token, index }))
              .filter(candidate => candidate.token.w <= available)
              .sort((a, b) => d3.ascending(a.index, b.index));
          }
          if (!candidates.length) break;
          const candidate = candidates[0];
          remaining.splice(candidate.index, 1);
          rowWords.push(candidate.token);
          used += gap + candidate.token.w;
        }
        if (!rowWords.length) return;
        let cursorX = innerX;
        rowWords.forEach((token, wordOrder) => {
          token.x = cursorX;
          token.y = doc.y + innerTop + linePlan.row * rowGap - wordHeight / 2;
          token.row = linePlan.row;
          token.lineOrder = lineOrder;
          token.wordOrder = wordOrder;
          token.lineFill = used / innerW;
          token.wordGap = wordGap;
          cursorX += token.w + wordGap;
        });
        lines.push({
          docId: doc.id,
          docIndex,
          row: linePlan.row,
          lineOrder,
          x1: innerX,
          x2: innerX + used,
          y: doc.y + innerTop + linePlan.row * rowGap + wordHeight + 3,
          fill: used / innerW,
          wordCount: rowWords.length
        });
      });
      return { words: tokens.filter(token => Number.isFinite(token.x)), lines };
    };
    const layouts = documents.map((doc, docIndex) => ({ ...doc, ...documentWords(doc, docIndex) }));
    const visualWords = layouts.flatMap(layout => layout.words)
      .sort((a, b) => d3.ascending(a.docIndex, b.docIndex)
        || d3.ascending(a.lineOrder, b.lineOrder)
        || d3.ascending(a.x, b.x));
    visualWords.forEach((token, writingIndex) => {
      token.writingIndex = writingIndex;
      token.writingDelay = .12 + writingIndex * .018;
    });
    const firstWordDelay = new Map();
    visualWords.forEach(token => {
      const key = `${token.docIndex}-${token.lineOrder}`;
      if (!firstWordDelay.has(key)) firstWordDelay.set(key, token.writingDelay);
    });
    const visualLines = layouts.flatMap(layout => layout.lines)
      .sort((a, b) => d3.ascending(a.docIndex, b.docIndex)
        || d3.ascending(a.lineOrder, b.lineOrder));
    visualLines.forEach((line, writingIndex) => {
      line.writingIndex = writingIndex;
      line.writingDelay = Math.max(.04, (firstWordDelay.get(`${line.docIndex}-${line.lineOrder}`) || .12) - .045);
    });

    const docGroups = svg.append("g").selectAll("g.document-quality-page").data(layouts).join("g")
      .attr("class", "document-quality-page")
      .attr("data-target-correct", d => d.ratios.correct)
      .attr("data-target-filler", d => d.ratios.filler)
      .attr("data-target-wrong", d => d.ratios.wrong)
      .attr("transform", d => `translate(${d.x},${d.y})`);
    docGroups.append("rect")
      .attr("width", docW)
      .attr("height", docH)
      .attr("rx", 6)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 2);

    const rules = svg.append("g").selectAll("line.document-rule")
      .data(visualLines)
      .join("line")
      .attr("class", "document-rule")
      .attr("data-doc-index", d => d.docIndex)
      .attr("data-line-order", d => d.lineOrder)
      .attr("data-writing-index", d => d.writingIndex)
      .attr("data-writing-delay", d => d.writingDelay.toFixed(3))
      .attr("data-line-fill", d => d.fill)
      .attr("data-word-count", d => d.wordCount)
      .attr("x1", d => d.x1)
      .attr("x2", d => d.x2)
      .attr("y1", d => d.y)
      .attr("y2", d => d.y)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", .85)
      .attr("stroke-linecap", "round");
    rules.each(function (d) {
      const line = d3.select(this);
      line.append("set")
        .attr("attributeName", "x2")
        .attr("to", d.x1)
        .attr("begin", "0s")
        .attr("dur", `${d.writingDelay}s`);
      line.append("animate")
        .attr("attributeName", "x2")
        .attr("from", d.x1)
        .attr("to", d.x2)
        .attr("dur", ".22s")
        .attr("begin", `${d.writingDelay}s`)
        .attr("fill", "freeze");
    });

    const words = svg.append("g").selectAll("rect.document-word")
      .data(visualWords)
      .join("rect")
      .attr("class", "document-word")
      .attr("data-doc-id", d => d.docId)
      .attr("data-doc-index", d => d.docIndex)
      .attr("data-line-order", d => d.lineOrder)
      .attr("data-word-order", d => d.wordOrder)
      .attr("data-writing-index", d => d.writingIndex)
      .attr("data-writing-delay", d => d.writingDelay.toFixed(3))
      .attr("data-kind", d => d.kind)
      .attr("data-units", d => d.units)
      .attr("data-word-width", d => d.w)
      .attr("data-word-gap", d => d.wordGap)
      .attr("data-line-fill", d => d.lineFill)
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("height", wordHeight)
      .attr("rx", 2.5)
      .attr("fill", d => categories[d.kind].fill)
      .attr("stroke", d => categories[d.kind].stroke)
      .attr("stroke-width", .4);
    words.each(function (d) {
      const word = d3.select(this);
      word.append("set")
        .attr("attributeName", "width")
        .attr("to", 0)
        .attr("begin", "0s")
        .attr("dur", `${d.writingDelay}s`);
      word.append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", d.w)
        .attr("dur", ".34s")
        .attr("begin", `${d.writingDelay}s`)
        .attr("fill", "freeze");
    });
    fadeIn(docGroups, .04, .34);
  }

  function renderDocumentTokenExtractionBuckets() {
    const svg = prepareSvg("document-token-bins", "Document token extraction buckets", "A single colored document page is extracted into filler, correct, and wrong buckets with calculated totals.");
    const totalUnits = 420;
    const wordHeight = 7;
    const wordGap = 3.3;
    const unitPx = 1.58;
    const doc = { x: 40, y: 58, w: 148, h: 302 };
    const categories = {
      filler: { label: "Filler", fill: palette.gray500, stroke: palette.gray600, light: palette.gray100, ratio: .7 },
      correct: { label: "Correct", fill: palette.green, stroke: palette.greenHover, light: palette.greenHighlight, ratio: .2 },
      wrong: { label: "Wrong", fill: palette.red, stroke: palette.redHover, light: palette.redHighlight, ratio: .1 }
    };
    const buckets = [
      { kind: "filler", x: 238, y: 62, w: 282, h: 82 },
      { kind: "correct", x: 238, y: 171, w: 282, h: 82 },
      { kind: "wrong", x: 238, y: 280, w: 282, h: 82 }
    ];
    const seeded01 = value => {
      const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
      return raw - Math.floor(raw);
    };
    const splitUnits = (units, salt) => {
      let remaining = units;
      const chunks = [];
      while (remaining > 0) {
        let length = 4 + Math.floor(seeded01(salt + chunks.length * 17) * 10);
        if (remaining <= 13) length = remaining;
        else if (remaining - length > 0 && remaining - length < 4) length = remaining;
        chunks.push(Math.min(length, remaining));
        remaining -= chunks.at(-1);
      }
      return chunks;
    };
    const budgets = {
      filler: Math.round(totalUnits * categories.filler.ratio),
      correct: Math.round(totalUnits * categories.correct.ratio)
    };
    budgets.wrong = totalUnits - budgets.filler - budgets.correct;
    const kindOrder = ["filler", "correct", "wrong"];
    const tokens = kindOrder.flatMap((kind, kindIndex) => splitUnits(budgets[kind], 200 + kindIndex * 57).map((units, index) => ({
      id: `${kind}-${index}`,
      kind,
      units,
      w: Math.max(5.2, units * unitPx),
      sort: seeded01((kindIndex + 1) * 311 + index * 23)
    }))).sort((a, b) => d3.ascending(a.sort, b.sort));
    const innerX = doc.x + 14;
    const innerW = doc.w - 28;
    const linePlans = [
      { row: 0, fill: .98 },
      { row: 1, fill: .92 },
      { row: 2, fill: .7 },
      { row: 4, fill: .97 },
      { row: 5, fill: .96 },
      { row: 6, fill: .74 },
      { row: 8, fill: .95 },
      { row: 9, fill: .9 },
      { row: 10, fill: .58 },
      { row: 12, fill: .62 }
    ];
    const remaining = tokens.slice();
    const sourceLines = [];
    linePlans.forEach((linePlan, lineOrder) => {
      const target = innerW * linePlan.fill;
      const rowWords = [];
      let used = 0;
      while (remaining.length) {
        const gap = rowWords.length ? wordGap : 0;
        const available = target - used - gap;
        const localWindow = remaining.slice(0, Math.min(remaining.length, 14));
        let candidates = localWindow
          .map((token, index) => ({ token, index }))
          .filter(candidate => candidate.token.w <= available)
          .sort((a, b) => d3.descending(a.token.w, b.token.w) || d3.ascending(a.index, b.index));
        if (!candidates.length) {
          candidates = remaining
            .map((token, index) => ({ token, index }))
            .filter(candidate => candidate.token.w <= available)
            .sort((a, b) => d3.ascending(a.index, b.index));
        }
        if (!candidates.length) break;
        const candidate = candidates[0];
        remaining.splice(candidate.index, 1);
        rowWords.push(candidate.token);
        used += gap + candidate.token.w;
      }
      if (!rowWords.length) return;
      let cursorX = innerX;
      rowWords.forEach((token, wordOrder) => {
        token.sourceX = cursorX;
        token.sourceY = doc.y + 36 + linePlan.row * 18 - wordHeight / 2;
        token.lineOrder = lineOrder;
        token.wordOrder = wordOrder;
        cursorX += token.w + wordGap;
      });
      sourceLines.push({
        lineOrder,
        x1: innerX,
        x2: innerX + used,
        y: doc.y + 36 + linePlan.row * 18 + wordHeight + 3,
        fill: used / innerW,
        wordCount: rowWords.length
      });
    });
    const sourceTokens = tokens.filter(token => Number.isFinite(token.sourceX))
      .sort((a, b) => d3.ascending(a.lineOrder, b.lineOrder) || d3.ascending(a.sourceX, b.sourceX));
    sourceTokens.forEach((token, writingIndex) => {
      token.writingIndex = writingIndex;
      token.writeDelay = .08 + writingIndex * .006;
      token.extractDelay = .82 + writingIndex * .012;
    });

    const bucketByKind = new Map(buckets.map(bucket => [bucket.kind, bucket]));
    kindOrder.forEach(kind => {
      const bucket = bucketByKind.get(kind);
      const list = sourceTokens.filter(token => token.kind === kind).sort((a, b) => d3.ascending(a.writingIndex, b.writingIndex));
      const x0 = bucket.x + 14;
      const maxX = bucket.x + bucket.w - 14;
      let x = x0;
      let y = bucket.y + 38;
      list.forEach((token, index) => {
        if (x > x0 && x + token.w > maxX) {
          x = x0;
          y += 11;
        }
        token.bucketIndex = index;
        token.targetX = x;
        token.targetY = y;
        x += token.w + 2.2;
      });
    });
    const summaries = buckets.map(bucket => {
      const words = sourceTokens.filter(token => token.kind === bucket.kind);
      const units = d3.sum(words, d => d.units);
      return {
        ...bucket,
        ...categories[bucket.kind],
        units,
        tokens: words.length,
        ratio: units / totalUnits
      };
    });

    svg.append("rect")
      .attr("x", doc.x)
      .attr("y", doc.y)
      .attr("width", doc.w)
      .attr("height", doc.h)
      .attr("rx", 7)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 2);
    svg.append("g").selectAll("line.extraction-source-rule")
      .data(sourceLines)
      .join("line")
      .attr("class", "extraction-source-rule")
      .attr("data-line-order", d => d.lineOrder)
      .attr("data-line-fill", d => d.fill)
      .attr("data-word-count", d => d.wordCount)
      .attr("x1", d => d.x1)
      .attr("x2", d => d.x2)
      .attr("y1", d => d.y)
      .attr("y2", d => d.y)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", .85)
      .attr("stroke-linecap", "round");

    const route = svg.append("g").selectAll("path.extraction-route")
      .data(summaries)
      .join("path")
      .attr("class", "extraction-route")
      .attr("data-kind", d => d.kind)
      .attr("d", d => `M${doc.x + doc.w + 10},${d.y + d.h / 2}H${d.x - 12}`)
      .attr("fill", "none")
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1.15)
      .attr("stroke-opacity", .18)
      .attr("stroke-linecap", "round");
    drawPath(route, .72, .55);

    const bucketGroups = svg.append("g").selectAll("g.extraction-bucket")
      .data(summaries)
      .join("g")
      .attr("class", "extraction-bucket")
      .attr("data-kind", d => d.kind)
      .attr("data-total-units", d => d.units)
      .attr("data-total-ratio", d => d.ratio.toFixed(3))
      .attr("data-token-count", d => d.tokens);
    bucketGroups.append("rect")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1.5);
    bucketGroups.append("text")
      .attr("class", "label")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + 21)
      .attr("fill", d => d.stroke)
      .attr("font-weight", 800)
      .text(d => d.label);
    bucketGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x + d.w - 14)
      .attr("y", d => d.y + 21)
      .attr("text-anchor", "end")
      .attr("fill", palette.ink)
      .text(d => `${d.units} / ${totalUnits}`);
    bucketGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x + d.w - 14)
      .attr("y", d => d.y + 36)
      .attr("text-anchor", "end")
      .attr("fill", palette.muted)
      .text(d => `${d3.format(".0%")(d.ratio)} · ${d.tokens}`);
    bucketGroups.append("rect")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + d.h - 13)
      .attr("width", d => d.w - 28)
      .attr("height", 5)
      .attr("rx", 2.5)
      .attr("fill", palette.gray100);
    const bucketBars = bucketGroups.append("rect")
      .attr("class", "extraction-bucket-bar")
      .attr("data-kind", d => d.kind)
      .attr("data-units", d => d.units)
      .attr("data-total-units", totalUnits)
      .attr("data-ratio", d => d.ratio.toFixed(3))
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + d.h - 13)
      .attr("width", d => (d.w - 28) * d.ratio)
      .attr("height", 5)
      .attr("rx", 2.5)
      .attr("fill", d => d.fill);
    grow(bucketBars, "width", 0, d => (d.w - 28) * d.ratio, 1.64, .42);

    const sourceWords = svg.append("g").selectAll("rect.extraction-source-word")
      .data(sourceTokens)
      .join("rect")
      .attr("class", "extraction-source-word")
      .attr("data-kind", d => d.kind)
      .attr("data-units", d => d.units)
      .attr("data-writing-index", d => d.writingIndex)
      .attr("data-writing-delay", d => d.writeDelay.toFixed(3))
      .attr("data-extract-delay", d => d.extractDelay.toFixed(3))
      .attr("x", d => d.sourceX)
      .attr("y", d => d.sourceY)
      .attr("height", wordHeight)
      .attr("rx", 2.5)
      .attr("width", d => d.w)
      .attr("fill", d => categories[d.kind].fill)
      .attr("stroke", d => categories[d.kind].stroke)
      .attr("stroke-width", .35);
    sourceWords.each(function (d) {
      const word = d3.select(this);
      word.append("set")
        .attr("attributeName", "width")
        .attr("to", 0)
        .attr("begin", "0s")
        .attr("dur", `${d.writeDelay}s`);
      word.append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", d.w)
        .attr("dur", ".2s")
        .attr("begin", `${d.writeDelay}s`)
        .attr("fill", "freeze");
      word.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 1)
        .attr("to", .18)
        .attr("dur", ".26s")
        .attr("begin", `${d.extractDelay + .08}s`)
        .attr("fill", "freeze");
    });

    const movers = svg.append("g").selectAll("g.extracted-token")
      .data(sourceTokens)
      .join("g")
      .attr("class", "extracted-token")
      .attr("data-kind", d => d.kind)
      .attr("data-units", d => d.units)
      .attr("data-writing-index", d => d.writingIndex)
      .attr("data-bucket-index", d => d.bucketIndex)
      .attr("data-source-x", d => d.sourceX)
      .attr("data-source-y", d => d.sourceY)
      .attr("data-target-x", d => d.targetX)
      .attr("data-target-y", d => d.targetY)
      .attr("transform", d => `translate(${d.targetX},${d.targetY})`)
      .attr("opacity", 0);
    movers.append("rect")
      .attr("width", d => d.w)
      .attr("height", wordHeight)
      .attr("rx", 2.5)
      .attr("fill", d => categories[d.kind].fill)
      .attr("stroke", d => categories[d.kind].stroke)
      .attr("stroke-width", .35);
    movers.each(function (d) {
      const mover = d3.select(this);
      mover.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".16s")
        .attr("begin", `${d.extractDelay}s`)
        .attr("fill", "freeze");
      mover.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "translate")
        .attr("additive", "sum")
        .attr("from", `${d.sourceX - d.targetX} ${d.sourceY - d.targetY}`)
        .attr("to", "0 0")
        .attr("dur", ".52s")
        .attr("begin", `${d.extractDelay}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".2 .7 .2 1")
        .attr("fill", "freeze");
    });
  }

  function renderAgentLoopPartialCovers() {
    const svg = prepareSvg("agent-loop-overlay", "Agent loop partial covers", "An image-backed SVG with animated partial covers over selected regions of the agent loop diagram.");
    const image = { x: 16, y: 34, w: 528, h: 333 };
    const source = { w: 980, h: 618 };
    const sx = image.w / source.w;
    const sy = image.h / source.h;
    const mapRegion = region => ({
      ...region,
      x: image.x + region.x * sx,
      y: image.y + region.y * sy,
      w: region.w * sx,
      h: region.h * sy
    });
    const regions = [
      { id: "main-loop", x: 38, y: 82, w: 272, h: 488, cover: .34, fill: palette.orange, stroke: palette.orangeHover, delay: .1 },
      { id: "prompt-builder", x: 354, y: 68, w: 586, h: 98, cover: .62, fill: palette.purple, stroke: palette.purpleHover, delay: .48 },
      { id: "tool-system", x: 354, y: 220, w: 382, h: 236, cover: .5, fill: palette.green, stroke: palette.greenHover, delay: .86 },
      { id: "sub-agents", x: 752, y: 220, w: 192, h: 232, cover: .55, fill: palette.blue, stroke: palette.blueHover, delay: 1.24 },
      { id: "compaction", x: 354, y: 512, w: 590, h: 94, cover: .58, fill: palette.gold, stroke: palette.yellowHover, delay: 1.62 }
    ].map(mapRegion);

    svg.append("rect")
      .attr("x", image.x - 8)
      .attr("y", image.y - 8)
      .attr("width", image.w + 16)
      .attr("height", image.h + 16)
      .attr("rx", 10)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.4);

    svg.append("clipPath")
      .attr("id", "agent-loop-overlay-clip")
      .append("rect")
      .attr("x", image.x)
      .attr("y", image.y)
      .attr("width", image.w)
      .attr("height", image.h)
      .attr("rx", 8);

    svg.append("image")
      .attr("href", assetHref("assets/agent-loop-reference.png"))
      .attr("x", image.x)
      .attr("y", image.y)
      .attr("width", image.w)
      .attr("height", image.h)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .attr("clip-path", "url(#agent-loop-overlay-clip)")
      .attr("opacity", .72);

    svg.append("rect")
      .attr("x", image.x)
      .attr("y", image.y)
      .attr("width", image.w)
      .attr("height", image.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("opacity", .08)
      .attr("clip-path", "url(#agent-loop-overlay-clip)");

    const coverGroups = svg.append("g")
      .attr("clip-path", "url(#agent-loop-overlay-clip)")
      .selectAll("g.agent-cover")
      .data(regions)
      .join("g")
      .attr("class", "agent-cover")
      .attr("data-region", d => d.id)
      .attr("data-cover-ratio", d => d.cover)
      .attr("data-target-width", d => (d.w * d.cover).toFixed(2));

    const covers = coverGroups.append("rect")
      .attr("class", "agent-cover-fill")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w * d.cover)
      .attr("height", d => d.h)
      .attr("rx", 7)
      .attr("fill", d => d.fill)
      .attr("fill-opacity", .19)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1.4)
      .attr("stroke-opacity", .78)
      .attr("stroke-dasharray", "6 5");
    covers.each(function (d) {
      const cover = d3.select(this);
      const targetWidth = d.w * d.cover;
      cover.append("set")
        .attr("attributeName", "width")
        .attr("to", 0)
        .attr("begin", "0s")
        .attr("dur", `${d.delay}s`);
      cover.append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", targetWidth)
        .attr("dur", ".58s")
        .attr("begin", `${d.delay}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".2 .7 .2 1")
        .attr("fill", "freeze");
      cover.append("animate")
        .attr("attributeName", "fill-opacity")
        .attr("values", ".08;.23;.19")
        .attr("dur", ".9s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
    });

    const sweeps = coverGroups.append("line")
      .attr("class", "agent-cover-sweep")
      .attr("x1", d => d.x)
      .attr("x2", d => d.x)
      .attr("y1", d => d.y + 4)
      .attr("y2", d => d.y + d.h - 4)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 2.2)
      .attr("stroke-opacity", 0)
      .attr("stroke-linecap", "round");
    sweeps.each(function (d) {
      const sweep = d3.select(this);
      const end = d.x + d.w * d.cover;
      sweep.append("animate")
        .attr("attributeName", "x1")
        .attr("from", d.x)
        .attr("to", end)
        .attr("dur", ".58s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
      sweep.append("animate")
        .attr("attributeName", "x2")
        .attr("from", d.x)
        .attr("to", end)
        .attr("dur", ".58s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
      sweep.append("animate")
        .attr("attributeName", "stroke-opacity")
        .attr("values", "0;.85;0")
        .attr("dur", ".7s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
    });

    const outlineData = regions.map(region => ({
      ...region,
      points: [
        [region.x, region.y],
        [region.x + region.w, region.y],
        [region.x + region.w, region.y + region.h],
        [region.x, region.y + region.h],
        [region.x, region.y]
      ]
    }));
    const outlines = svg.append("g")
      .attr("clip-path", "url(#agent-loop-overlay-clip)")
      .selectAll("path.agent-cover-outline")
      .data(outlineData)
      .join("path")
      .attr("class", "agent-cover-outline")
      .attr("data-region", d => d.id)
      .attr("d", d => d3.line()(d.points))
      .attr("fill", "none")
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 1)
      .attr("stroke-opacity", .5)
      .attr("stroke-dasharray", "4 6");
    outlines.each(function (d) {
      const length = this.getTotalLength();
      d3.select(this)
        .attr("stroke-dasharray", `${length} ${length}`)
        .attr("stroke-dashoffset", 0)
        .append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("from", length)
        .attr("to", 0)
        .attr("dur", ".74s")
        .attr("begin", `${d.delay + .12}s`)
        .attr("fill", "freeze");
    });
  }

  function renderAsymmetricTaskOverlap() {
    const svg = prepareSvg("task-overlap", "Asymmetric task overlap", "Nine asymmetric scope circles with 20 labeled task dots distributed across single and shared memberships.");
    svg.attr("data-target-count", 20).attr("data-circle-count", 9);
    const circles = [
      { id: "backlog", label: "Backlog", cx: 150, cy: 135, r: 74, fill: palette.blueHighlight, stroke: palette.blue, lx: 82, ly: 58 },
      { id: "ux", label: "UX", cx: 232, cy: 100, r: 66, fill: palette.orangeHighlight, stroke: palette.orange, lx: 218, ly: 42 },
      { id: "api", label: "API", cx: 326, cy: 135, r: 76, fill: palette.greenHighlight, stroke: palette.green, lx: 344, ly: 58 },
      { id: "security", label: "Security", cx: 414, cy: 100, r: 58, fill: palette.redHighlight, stroke: palette.red, lx: 416, ly: 42 },
      { id: "docs", label: "Docs", cx: 96, cy: 215, r: 62, fill: palette.purpleHighlight, stroke: palette.purple, lx: 48, ly: 167 },
      { id: "data", label: "Data", cx: 232, cy: 206, r: 86, fill: palette.yellowHighlight, stroke: palette.yellowHover, lx: 214, ly: 204 },
      { id: "qa", label: "QA", cx: 344, cy: 228, r: 74, fill: palette.blueHighlight, stroke: palette.blueHover, lx: 378, ly: 214 },
      { id: "release", label: "Release", cx: 160, cy: 280, r: 68, fill: palette.greenHighlight, stroke: palette.greenHover, lx: 102, ly: 346 },
      { id: "ops", label: "Ops", cx: 420, cy: 290, r: 60, fill: palette.orangeHighlight, stroke: palette.orangeHover, lx: 444, ly: 356 }
    ];
    const tasks = [
      { id: "T01", label: "T01 Intake", x: 132, y: 124, lx: 54, ly: 96, memberships: ["backlog"] },
      { id: "T02", label: "T02 Copy", x: 226, y: 77, lx: 196, ly: 58, memberships: ["ux"] },
      { id: "T03", label: "T03 API", x: 336, y: 124, lx: 358, ly: 106, memberships: ["api"] },
      { id: "T04", label: "T04 Dataset", x: 226, y: 236, lx: 162, ly: 236, memberships: ["data"] },
      { id: "T05", label: "T05 Smoke", x: 365, y: 245, lx: 388, ly: 236, memberships: ["qa"] },
      { id: "T06", label: "T06 Cutover", x: 160, y: 306, lx: 70, ly: 332, memberships: ["release"] },
      { id: "T07", label: "T07 FAQ", x: 78, y: 212, lx: 42, ly: 194, memberships: ["docs"] },
      { id: "T08", label: "T08 Threat", x: 422, y: 76, lx: 430, ly: 68, memberships: ["security"] },
      { id: "T09", label: "T09 Runbook", x: 430, y: 310, lx: 442, ly: 322, memberships: ["ops"] },
      { id: "T10", label: "T10 UX copy", x: 188, y: 108, lx: 140, ly: 82, memberships: ["backlog", "ux"] },
      { id: "T11", label: "T11 Schema", x: 298, y: 172, lx: 320, ly: 166, memberships: ["api", "data"] },
      { id: "T12", label: "T12 Test seed", x: 292, y: 222, lx: 298, ly: 246, memberships: ["data", "qa"] },
      { id: "T13", label: "T13 Ops QA", x: 382, y: 262, lx: 402, ly: 262, memberships: ["qa", "ops"] },
      { id: "T14", label: "T14 Release doc", x: 118, y: 258, lx: 44, ly: 262, memberships: ["docs", "release"] },
      { id: "T15", label: "T15 Auth risk", x: 374, y: 118, lx: 396, ly: 128, memberships: ["api", "security"] },
      { id: "T16", label: "T16 QA gate", x: 240, y: 280, lx: 242, ly: 318, memberships: ["data", "qa", "release"] },
      { id: "T17", label: "T17 Criteria", x: 212, y: 150, lx: 154, ly: 148, memberships: ["backlog", "ux", "data"] },
      { id: "T18", label: "T18 Migration", x: 326, y: 196, lx: 356, ly: 184, memberships: ["api", "data", "qa"] },
      { id: "T19", label: "T19 Notes", x: 206, y: 252, lx: 158, ly: 356, memberships: ["docs", "data", "release"] },
      { id: "T20", label: "T20 Drill", x: 360, y: 286, lx: 356, ly: 344, memberships: ["data", "qa", "ops"] }
    ];
    const labelWidth = d => taskLabelBoxWidth(d.label, 8.8, 16, 50);
    const dotColor = d => d.memberships.length === 1 ? palette.blue : d.memberships.length === 2 ? palette.orange : palette.red;
    const labelEdgeX = d => d.lx < d.x ? d.lx + labelWidth(d) : d.lx;

    svg.append("rect")
      .attr("x", 24)
      .attr("y", 30)
      .attr("width", 512)
      .attr("height", 352)
      .attr("rx", 10)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.2);

    const circleLayer = svg.append("g").attr("class", "overlap-circle-layer");
    const overlapCircles = circleLayer.selectAll("circle.overlap-circle")
      .data(circles)
      .join("circle")
      .attr("class", "overlap-circle")
      .attr("data-set-id", d => d.id)
      .attr("cx", d => d.cx)
      .attr("cy", d => d.cy)
      .attr("fill", d => d.fill)
      .attr("fill-opacity", .24)
      .attr("stroke", d => d.stroke)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", .9);
    grow(overlapCircles, "r", 4, d => d.r, .05, .7);

    const circleLabels = circleLayer.selectAll("text.overlap-circle-label")
      .data(circles)
      .join("text")
      .attr("class", "caption overlap-circle-label")
      .attr("x", d => d.lx)
      .attr("y", d => d.ly)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .attr("fill", palette.gray700)
      .text(d => d.label);
    fadeIn(circleLabels, .28, .45);

    const leader = svg.append("g")
      .attr("class", "task-leader-layer")
      .attr("stroke", palette.gray500)
      .attr("stroke-opacity", .55)
      .attr("stroke-width", .9)
      .selectAll("line.task-leader")
      .data(tasks)
      .join("line")
      .attr("class", "task-leader")
      .attr("data-task-id", d => d.id)
      .attr("x1", d => d.x)
      .attr("y1", d => d.y)
      .attr("x2", d => labelEdgeX(d))
      .attr("y2", d => d.ly - 3);
    fadeIn(leader, .35, .5);

    const taskGroups = svg.append("g")
      .attr("class", "task-layer")
      .selectAll("g.task")
      .data(tasks)
      .join("g")
      .attr("class", "task")
      .attr("data-task-id", d => d.id)
      .attr("data-memberships", d => d.memberships.join(" "))
      .attr("data-membership-count", d => d.memberships.length);

    const labelBoxes = taskGroups.append("rect")
      .attr("class", "task-label-bg")
      .attr("x", d => d.lx)
      .attr("y", d => d.ly - 12)
      .attr("width", d => labelWidth(d))
      .attr("height", 17)
      .attr("rx", 5)
      .attr("fill", palette.surface)
      .attr("fill-opacity", .9)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", .8);
    fadeIn(labelBoxes, .42, .45);

    const labels = taskGroups.append("text")
      .attr("class", "task-label mark-label")
      .attr("x", d => d.lx + 6)
      .attr("y", d => d.ly)
      .attr("font-size", 8.8)
      .attr("font-weight", 700)
      .attr("fill", palette.ink)
      .style("font-size", "8.8px")
      .style("font-weight", 700)
      .text(d => d.label);
    fadeIn(labels, .5, .45);

    const dots = taskGroups.append("circle")
      .attr("class", "task-dot")
      .attr("data-task-id", d => d.id)
      .attr("data-memberships", d => d.memberships.join(" "))
      .attr("data-membership-count", d => d.memberships.length)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", dotColor)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.5);
    grow(dots, "r", 1.2, 4.2, .62, .48);

    const legend = [
      { label: "1 scope", fill: palette.blue },
      { label: "2 scopes", fill: palette.orange },
      { label: "3+ scopes", fill: palette.red }
    ];
    const legendGroup = svg.append("g").attr("transform", "translate(330,366)");
    const legendItems = legendGroup.selectAll("g").data(legend).join("g").attr("transform", (_, i) => `translate(${i * 66},0)`);
    legendItems.append("circle").attr("r", 4.2).attr("cx", 0).attr("cy", 0).attr("fill", d => d.fill).attr("stroke", palette.surface).attr("stroke-width", 1.5);
    legendItems.append("text").attr("class", "caption").attr("x", 8).attr("y", 4).attr("font-size", 9).text(d => d.label);
    fadeIn(legendItems, .72, .45);

    svg.append("text")
      .attr("class", "caption")
      .attr("x", 34)
      .attr("y", 370)
      .attr("font-weight", 800)
      .text("20 tasks across 9 asymmetric scopes");
  }

  function renderAsymmetricTaskOverlapSaturated() {
    const layout = window.D3_TASK_OVERLAP_LAYOUTS && window.D3_TASK_OVERLAP_LAYOUTS.saturated;
    const svg = prepareSvg("task-overlap-dense", "Saturated task overlap", "Nine asymmetric scope circles with 100 task dots, external collision-audited labels, and direct leader lines colored to reduce same-color crossings.");
    if (!layout) {
      svg.append("text")
        .attr("class", "mark-label")
        .attr("x", 36)
        .attr("y", 70)
        .text("Missing generated task-overlap layout.");
      return;
    }

    const svgWidth = layout.width || width;
    const svgHeight = layout.height || height;
    svg
      .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
      .attr("data-target-count", layout.targetCount)
      .attr("data-circle-count", layout.circleCount)
      .attr("data-label-count", layout.tasks.length)
      .attr("data-label-algorithm", layout.labelAlgorithm)
      .attr("data-label-overlap-count", layout.labelOverlapCount)
      .attr("data-label-circle-overlap-count", layout.labelCircleOverlapCount)
      .attr("data-label-dot-overlap-count", layout.labelDotOverlapCount)
      .attr("data-label-leader-overlap-count", layout.labelLeaderOverlapCount)
      .attr("data-label-leader-underpass-count", layout.labelLeaderOverlapCount)
      .attr("data-label-nonlabel-overlap-count", (layout.labelCircleOverlapCount || 0) + (layout.labelDotOverlapCount || 0))
      .attr("data-label-placement", "external-lanes")
      .attr("data-label-clearance-policy", "no-label-label-circle-dot-overlap")
      .attr("data-leader-route", layout.leaderRoute || "direct")
      .attr("data-leader-style-count", 1)
      .attr("data-leader-color-count", (layout.leaderColorKeys || []).length)
      .attr("data-leader-crossing-count", layout.leaderCrossingCount)
      .attr("data-same-color-leader-crossing-count", layout.sameColorLeaderCrossingCount)
      .attr("data-membership-buckets", Object.entries(layout.membershipBuckets).map(([key, value]) => `${key}:${value}`).join(" "))
      .attr("data-label-length-buckets", Object.entries(layout.labelLengthBuckets || {}).map(([key, value]) => `${key}:${value}`).join(" "))
      .attr("data-label-font-range", layout.labelFontRange ? `${layout.labelFontRange.min}-${layout.labelFontRange.max}` : layout.labelFontSize)
      .attr("data-longest-label", layout.longestLabel || "");

    const circles = layout.circles.map(circle => ({
      ...circle,
      fillColor: palette[circle.fill] || circle.fill,
      strokeColor: palette[circle.stroke] || circle.stroke
    }));
    const tasks = layout.tasks;
    const dotColor = d => d.membershipCount === 1 ? palette.blue : d.membershipCount === 2 ? palette.orange : palette.red;
    const leaderColor = d => palette[d.leaderColorKey] || dotColor(d);
    const labelEdgeX = d => d.labelEdgeX ?? (d.labelX < d.x ? d.labelX + d.labelWidth : d.labelX);
    const labelEdgeY = d => d.labelEdgeY ?? (d.labelY + d.labelHeight / 2);

    svg.append("rect")
      .attr("x", 8)
      .attr("y", 18)
      .attr("width", svgWidth - 16)
      .attr("height", svgHeight - 28)
      .attr("rx", 10)
      .attr("fill", palette.surface)
      .attr("stroke", "none");

    const overlapCircles = svg.append("g")
      .attr("class", "overlap-circle-layer")
      .selectAll("circle.overlap-circle")
      .data(circles)
      .join("circle")
      .attr("class", "overlap-circle")
      .attr("data-set-id", d => d.id)
      .attr("cx", d => d.cx)
      .attr("cy", d => d.cy)
      .attr("fill", d => d.fillColor)
      .attr("fill-opacity", .18)
      .attr("stroke", d => d.strokeColor)
      .attr("stroke-width", 1.7)
      .attr("stroke-opacity", .78);
    grow(overlapCircles, "r", 4, d => d.r, .05, .7);

    const circleLabels = svg.append("g")
      .attr("class", "overlap-circle-label-layer")
      .selectAll("text.overlap-circle-label")
      .data(circles)
      .join("text")
      .attr("class", "caption overlap-circle-label")
      .attr("x", d => d.lx)
      .attr("y", d => d.ly)
      .attr("text-anchor", "middle")
      .attr("font-size", 8.5)
      .attr("font-weight", 800)
      .attr("fill", palette.gray700)
      .text(d => d.label);
    fadeIn(circleLabels, .22, .42);

    const leaderLayer = svg.append("g")
      .attr("class", "task-leader-layer")
      .attr("stroke-linecap", "round");

    const leaderHalos = leaderLayer.selectAll("line.task-leader-halo")
      .data(tasks)
      .join("line")
      .attr("class", "task-leader-halo")
      .attr("x1", d => d.x)
      .attr("y1", d => d.y)
      .attr("x2", labelEdgeX)
      .attr("y2", labelEdgeY)
      .attr("stroke", palette.surface)
      .attr("stroke-opacity", .42)
      .attr("stroke-width", 1.8);
    fadeIn(leaderHalos, .26, .38);

    const leaders = leaderLayer.selectAll("line.task-leader")
      .data(tasks)
      .join("line")
      .attr("class", "task-leader")
      .attr("data-task-id", d => d.id)
      .attr("data-membership-count", d => d.membershipCount)
      .attr("data-leader-style", "solid")
      .attr("data-leader-color-key", d => d.leaderColorKey)
      .attr("data-leader-conflict-degree", d => d.leaderConflictDegree)
      .attr("x1", d => d.x)
      .attr("y1", d => d.y)
      .attr("x2", labelEdgeX)
      .attr("y2", labelEdgeY)
      .attr("stroke", leaderColor)
      .attr("stroke-opacity", .46)
      .attr("stroke-width", .82);
    fadeIn(leaders, .28, .4);

    const dots = svg.append("g")
      .attr("class", "task-dot-layer")
      .selectAll("circle.task-dot")
      .data(tasks)
      .join("circle")
      .attr("class", "task-dot")
      .attr("data-task-id", d => d.id)
      .attr("data-memberships", d => d.memberships.join(" "))
      .attr("data-membership-count", d => d.membershipCount)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", dotColor)
      .attr("stroke", palette.surface)
      .attr("stroke-width", .9);
    dots.append("title").text(d => `${d.id}: ${d.memberships.join(", ")}`);
    grow(dots, "r", .7, layout.dotRadius, .42, .5);

    const labelGroups = svg.append("g")
      .attr("class", "task-label-layer")
      .selectAll("g.task-label-group")
      .data(tasks)
      .join("g")
      .attr("class", "task-label-group")
      .attr("data-task-id", d => d.id)
      .attr("data-memberships", d => d.memberships.join(" "))
      .attr("data-membership-count", d => d.membershipCount)
      .attr("data-label-lane", d => d.labelLane)
      .attr("data-label-side", d => d.labelSide)
      .attr("data-label-length-bucket", d => d.labelLengthBucket)
      .attr("data-label-font-size", d => d.labelFontSize || layout.labelFontSize);

    const labelBoxes = labelGroups.append("rect")
      .attr("class", "task-label-bg")
      .attr("x", d => d.labelX)
      .attr("y", d => d.labelY)
      .attr("width", d => d.labelWidth)
      .attr("height", d => d.labelHeight)
      .attr("rx", 3.6)
      .attr("fill", palette.surface)
      .attr("fill-opacity", .96)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", .65);
    fadeIn(labelBoxes, .5, .42);

    const labels = labelGroups.append("text")
      .attr("class", "task-label mark-label")
      .attr("x", d => d.labelX + (d.labelTextPaddingX || 4.4))
      .attr("y", d => d.labelY + d.labelHeight / 2 + (d.labelFontSize || layout.labelFontSize) * .36)
      .attr("font-size", d => d.labelFontSize || layout.labelFontSize)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .style("font-size", d => `${d.labelFontSize || layout.labelFontSize}px`)
      .style("font-weight", 800)
      .text(d => d.label);
    fadeIn(labels, .56, .42);

    const legend = [
      { label: "1 scope", fill: palette.blue },
      { label: "2 scopes", fill: palette.orange },
      { label: "3+ scopes", fill: palette.red }
    ];
    const legendGroup = svg.append("g").attr("transform", `translate(${svgWidth - 438},${svgHeight - 22})`);
    const legendItems = legendGroup.selectAll("g").data(legend).join("g").attr("transform", (_, i) => `translate(${i * 66},0)`);
    legendItems.append("circle").attr("r", 3.6).attr("cx", 0).attr("cy", 0).attr("fill", d => d.fill).attr("stroke", palette.surface).attr("stroke-width", 1.1);
    legendItems.append("text").attr("class", "caption").attr("x", 7).attr("y", 3.5).attr("font-size", 8.4).text(d => d.label);
    fadeIn(legendItems, .76, .42);

    svg.append("text")
      .attr("class", "caption")
      .attr("x", svgWidth - 470)
      .attr("y", svgHeight - 22)
      .attr("text-anchor", "end")
      .attr("font-weight", 800)
      .text("100 tasks, direct leaders, 0 label collisions");
  }

  function vennCircleReveal(selection, delay = .08, opacity = .38) {
    selection.each(function (d, i) {
      const circle = d3.select(this)
        .attr("r", d.r)
        .attr("fill-opacity", opacity)
        .attr("opacity", 1);
      circle.append("animate")
        .attr("attributeName", "r")
        .attr("from", 4)
        .attr("to", d.r)
        .attr("dur", ".72s")
        .attr("begin", `${delay + i * .08}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".2 .8 .2 1")
        .attr("fill", "freeze");
      circle.append("animate")
        .attr("attributeName", "fill-opacity")
        .attr("from", 0)
        .attr("to", opacity)
        .attr("dur", ".62s")
        .attr("begin", `${delay + i * .08}s`)
        .attr("fill", "freeze");
    });
  }

  function vennSetLabel(parent, item, delay) {
    const label = parent.append("g")
      .attr("class", "venn-set-label")
      .attr("data-set-id", item.id)
      .attr("transform", `translate(${item.lx},${item.ly})`);
    label.append("circle")
      .attr("r", 15)
      .attr("fill", item.color)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2);
    label.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10.5)
      .attr("font-weight", 900)
      .attr("fill", palette.surface)
      .text(item.code);
    label.append("text")
      .attr("class", "caption")
      .attr("x", 0)
      .attr("y", 31)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 800)
      .attr("fill", item.color)
      .text(item.label);
    fadeIn(label, delay, .45);
  }

  function vennTextBlock(parent, lines, x, y, options = {}) {
    const group = parent.append("g")
      .attr("class", options.className || "venn-note")
      .attr("transform", `translate(${x},${y})`);
    group.selectAll("text")
      .data(Array.isArray(lines) ? lines : [lines])
      .join("text")
      .attr("class", options.textClass || "mark-label")
      .attr("x", 0)
      .attr("y", (_, i) => i * (options.lineHeight || 16))
      .attr("text-anchor", options.anchor || "middle")
      .attr("font-size", options.fontSize || 12)
      .attr("font-weight", options.fontWeight || 800)
      .attr("fill", options.fill || palette.ink)
      .text(d => d);
    fadeIn(group, options.delay || .66, .42);
    return group;
  }

  function vennRosettePoints(count, center, ringRadius, startAngle = -Math.PI / 2) {
    return d3.range(count).map(index => {
      const angle = startAngle + index * Math.PI * 2 / count;
      return {
        x: center.x + Math.cos(angle) * ringRadius,
        y: center.y + Math.sin(angle) * ringRadius,
        angle
      };
    });
  }

  function renderVennPattern(id, title, desc, options) {
    const svg = prepareSvg(id, title, desc);
    const circles = options.circles;
    svg
      .attr("data-pattern-family", "venn-overlap")
      .attr("data-layout", options.layout)
      .attr("data-circle-count", circles.length);

    svg.append("rect")
      .attr("x", 28)
      .attr("y", 34)
      .attr("width", width - 56)
      .attr("height", height - 72)
      .attr("rx", 10)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.1);

    if (options.guideCircle) {
      svg.append("circle")
        .attr("cx", options.guideCircle.x)
        .attr("cy", options.guideCircle.y)
        .attr("r", options.guideCircle.r)
        .attr("fill", "none")
        .attr("stroke", palette.gray200)
        .attr("stroke-dasharray", "5 6")
        .attr("stroke-width", 1.2)
        .attr("opacity", .8);
    }

    const circleLayer = svg.append("g")
      .attr("class", "venn-circle-layer")
      .attr("style", "isolation:isolate");
    const marks = circleLayer.selectAll("circle.venn-circle")
      .data(circles)
      .join("circle")
      .attr("class", "venn-circle")
      .attr("data-set-id", d => d.id)
      .attr("data-set-code", d => d.code)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", d => d.color)
      .attr("stroke", d => d.stroke || d.color)
      .attr("stroke-width", d => d.center ? 2.6 : 2)
      .attr("stroke-opacity", .88)
      .attr("style", "mix-blend-mode:multiply");
    vennCircleReveal(marks, .08, options.opacity || .34);

    const center = options.center || { x: width / 2, y: height / 2 };
    if (options.centerLabel) {
      const core = svg.append("g")
        .attr("class", "venn-core-label")
        .attr("transform", `translate(${center.x},${center.y})`);
      core.append("circle")
        .attr("r", options.coreRadius || 34)
        .attr("fill", palette.surface)
        .attr("stroke", palette.ink)
        .attr("stroke-width", 1.6)
        .attr("fill-opacity", .86);
      vennTextBlock(core, options.centerLabel, 0, -5, {
        className: "venn-core-text",
        fontSize: 11,
        lineHeight: 14,
        delay: .58
      });
      core.select("circle").append("animate")
        .attr("attributeName", "r")
        .attr("values", `${options.coreRadius || 34};${(options.coreRadius || 34) + 5};${options.coreRadius || 34}`)
        .attr("dur", "1.4s")
        .attr("begin", ".65s")
        .attr("repeatCount", "indefinite");
      fadeIn(core, .5, .35);
    }

    const labelLayer = svg.append("g").attr("class", "venn-label-layer");
    circles.filter(item => !item.hideExternalLabel).forEach((item, index) => vennSetLabel(labelLayer, item, .38 + index * .04));
    if (options.note) {
      vennTextBlock(svg, options.note, width / 2, height - 38, {
        textClass: "caption",
        fontSize: 11,
        fontWeight: 800,
        delay: .74
      });
    }
  }

  function makeVennCircle(id, code, label, x, y, r, color, lx, ly, extra = {}) {
    return { id, code, label, x, y, r, color, lx, ly, ...extra };
  }

  function renderVennThreeCircle() {
    renderVennPattern("venn-3", "Venn three circle", "Three peer concepts with single, pairwise, and central shared regions.", {
      layout: "three-circle-classic",
      center: { x: 280, y: 214 },
      coreRadius: 31,
      centerLabel: ["shared", "meaning"],
      note: "classic three-set overlap",
      circles: [
        makeVennCircle("prompt", "PR", "Prompt", 232, 174, 92, palette.blue, 154, 80),
        makeVennCircle("data", "DA", "Data", 328, 174, 92, palette.orange, 406, 80),
        makeVennCircle("model", "MO", "Model", 280, 252, 92, palette.green, 280, 334)
      ]
    });
  }

  function renderVennFiveOverlap() {
    const center = { x: 280, y: 210 };
    const labels = [
      ["data", "DA", "Data", palette.blue],
      ["model", "MO", "Model", palette.orange],
      ["eval", "EV", "Eval", palette.green],
      ["product", "PD", "Product", palette.purple],
      ["policy", "PL", "Policy", palette.red]
    ];
    const points = vennRosettePoints(5, center, 64);
    renderVennPattern("venn-5", "Venn five overlap", "Five domains converge around a shared center with direct labels.", {
      layout: "five-circle-shared-center",
      center,
      guideCircle: { ...center, r: 66 },
      coreRadius: 34,
      centerLabel: ["shared", "pilot"],
      note: "five domains, one shared center",
      opacity: .3,
      circles: labels.map((item, index) => makeVennCircle(
        item[0],
        item[1],
        item[2],
        points[index].x,
        points[index].y,
        98,
        item[3],
        center.x + Math.cos(points[index].angle) * 196,
        center.y + Math.sin(points[index].angle) * 146
      ))
    });
  }

  function renderVennSevenOverlap() {
    const center = { x: 280, y: 206 };
    const labels = [
      ["prompting", "PR", "Prompt", palette.blue],
      ["retrieval", "RT", "Retrieval", palette.orange],
      ["memory", "ME", "Memory", palette.green],
      ["tooling", "TL", "Tools", palette.purple],
      ["evals", "EV", "Evals", palette.red],
      ["safety", "SF", "Safety", palette.blueHover],
      ["product", "PD", "Product", palette.orangeHover]
    ];
    const points = vennRosettePoints(7, center, 75);
    renderVennPattern("venn-7", "Venn seven overlap", "Seven LLM workstreams overlap around a central alignment zone.", {
      layout: "seven-circle-ecosystem",
      center,
      guideCircle: { ...center, r: 78 },
      coreRadius: 38,
      centerLabel: ["LLM", "alignment"],
      note: "ecosystem convergence",
      opacity: .25,
      circles: labels.map((item, index) => makeVennCircle(
        item[0],
        item[1],
        item[2],
        points[index].x,
        points[index].y,
        85,
        item[3],
        center.x + Math.cos(points[index].angle) * 214,
        center.y + Math.sin(points[index].angle) * 152
      ))
    });
  }

  function renderSymmetricThreeCircleRosette() {
    const center = { x: 280, y: 210 };
    const labels = [
      ["syntax", "SY", "Syntax", palette.blue],
      ["semantics", "SE", "Meaning", palette.orange],
      ["context", "CX", "Context", palette.green]
    ];
    const points = vennRosettePoints(3, center, 56);
    renderVennPattern("overlap-3-rosette", "Symmetric three circle rosette", "Three equal circles arranged with 120-degree rotational symmetry.", {
      layout: "symmetric-3-rosette",
      center,
      guideCircle: { ...center, r: 58 },
      centerLabel: ["balanced", "center"],
      note: "120-degree rotational symmetry",
      opacity: .33,
      circles: labels.map((item, index) => makeVennCircle(
        item[0],
        item[1],
        item[2],
        points[index].x,
        points[index].y,
        108,
        item[3],
        center.x + Math.cos(points[index].angle) * 188,
        center.y + Math.sin(points[index].angle) * 138
      ))
    });
  }

  function renderSymmetricFiveCircleRosette() {
    const center = { x: 280, y: 210 };
    const labels = [
      ["product", "PD", "Product", palette.blue],
      ["research", "RS", "Research", palette.orange],
      ["infra", "IN", "Infra", palette.green],
      ["design", "DG", "Design", palette.purple],
      ["risk", "RK", "Risk", palette.red]
    ];
    const points = vennRosettePoints(5, center, 66);
    renderVennPattern("overlap-5-rosette", "Symmetric five circle rosette", "Five equal circles arranged with 72-degree rotational symmetry.", {
      layout: "symmetric-5-rosette",
      center,
      guideCircle: { ...center, r: 68 },
      centerLabel: ["shared", "strategy"],
      note: "72-degree rotational symmetry",
      opacity: .3,
      circles: labels.map((item, index) => makeVennCircle(
        item[0],
        item[1],
        item[2],
        points[index].x,
        points[index].y,
        96,
        item[3],
        center.x + Math.cos(points[index].angle) * 202,
        center.y + Math.sin(points[index].angle) * 148
      ))
    });
  }

  function renderSymmetricSevenCircleFlower() {
    const center = { x: 280, y: 210 };
    const outer = [
      ["input", "IN", "Input", palette.blue],
      ["embed", "EM", "Embed", palette.orange],
      ["attend", "AT", "Attend", palette.green],
      ["route", "RT", "Route", palette.purple],
      ["decode", "DC", "Decode", palette.red],
      ["eval", "EV", "Eval", palette.blueHover]
    ];
    const ring = vennRosettePoints(6, center, 82);
    const circles = [
      makeVennCircle("core", "LL", "Core", center.x, center.y, 82, palette.gold, center.x, center.y, { center: true, hideExternalLabel: true })
    ].concat(outer.map((item, index) => makeVennCircle(
      item[0],
      item[1],
      item[2],
      ring[index].x,
      ring[index].y,
      82,
      item[3],
      index === 3 ? 420 : center.x + Math.cos(ring[index].angle) * 210,
      index === 3 ? 330 : center.y + Math.sin(ring[index].angle) * 148
    )));
    renderVennPattern("overlap-7-flower", "Symmetric seven circle flower", "A center circle plus six equal neighboring domains in a stable flower pattern.", {
      layout: "symmetric-7-flower",
      center,
      guideCircle: { ...center, r: 82 },
      centerLabel: ["Core", "+ six"],
      note: "one center with six equal neighbors",
      opacity: .27,
      circles
    });
  }

  function renderAsymmetricThreeCircleChain() {
    renderVennPattern("overlap-3-chain", "Asymmetric three circle chain", "A middle concept bridges two endpoints while the endpoints stay mostly separate.", {
      layout: "asymmetric-3-chain",
      center: { x: 280, y: 214 },
      centerLabel: ["bridge", "set"],
      note: "A overlaps B, B overlaps C",
      opacity: .34,
      circles: [
        makeVennCircle("source", "SO", "Source", 184, 214, 84, palette.blue, 102, 126),
        makeVennCircle("bridge", "BR", "Bridge", 280, 214, 84, palette.orange, 280, 102),
        makeVennCircle("target", "TG", "Target", 376, 214, 84, palette.green, 458, 126)
      ]
    });
  }

  function renderAsymmetricFiveCircleCluster() {
    renderVennPattern("overlap-5-cluster", "Asymmetric five circle cluster", "Three primary circles form the main block and two secondary circles attach as context.", {
      layout: "asymmetric-5-cluster",
      center: { x: 258, y: 208 },
      coreRadius: 30,
      centerLabel: ["main", "block"],
      note: "3+2 attached context",
      opacity: .32,
      circles: [
        makeVennCircle("prompt", "PR", "Prompt", 190, 178, 78, palette.blue, 98, 104),
        makeVennCircle("model", "MO", "Model", 268, 166, 82, palette.orange, 280, 72),
        makeVennCircle("data", "DA", "Data", 236, 252, 80, palette.green, 154, 332),
        makeVennCircle("eval", "EV", "Eval", 334, 244, 72, palette.purple, 420, 318),
        makeVennCircle("policy", "PL", "Policy", 390, 168, 64, palette.red, 458, 106)
      ]
    });
  }

  function renderAsymmetricSevenCircleBridge() {
    renderVennPattern("overlap-7-bridge", "Asymmetric seven circle bridge", "Two blocks of three circles connected by one bridge circle in a 3+1+3 structure.", {
      layout: "asymmetric-7-bridge-3-1-3",
      center: { x: 280, y: 206 },
      coreRadius: 31,
      centerLabel: ["bridge", "circle"],
      note: "left block 3 + bridge 1 + right block 3",
      opacity: .31,
      circles: [
        makeVennCircle("left-a", "LA", "Left A", 158, 176, 66, palette.blue, 72, 102),
        makeVennCircle("left-b", "LB", "Left B", 214, 144, 66, palette.orange, 196, 66),
        makeVennCircle("left-c", "LC", "Left C", 214, 226, 66, palette.green, 98, 318),
        makeVennCircle("bridge", "BR", "Bridge", 280, 202, 66, palette.gold, 280, 106),
        makeVennCircle("right-a", "RA", "Right A", 346, 144, 66, palette.purple, 364, 66),
        makeVennCircle("right-b", "RB", "Right B", 402, 176, 66, palette.red, 488, 102),
        makeVennCircle("right-c", "RC", "Right C", 346, 226, 66, palette.blueHover, 462, 318)
      ]
    });
  }

  function renderSankey() {
    const svg = prepareSvg("sankey", "Sankey pipeline", "D3 Sankey layout for weighted handoffs.");
    const graph = {
      nodes: ["Visit", "Trial", "Sales", "Self serve", "Paid", "Churn", "Expand"].map(name => ({ name })),
      links: [
        { source: 0, target: 1, value: 18 }, { source: 0, target: 2, value: 10 },
        { source: 1, target: 3, value: 12 }, { source: 1, target: 5, value: 6 },
        { source: 2, target: 4, value: 8 }, { source: 2, target: 5, value: 2 },
        { source: 3, target: 4, value: 9 }, { source: 4, target: 6, value: 7 }
      ]
    };
    if (!d3.sankey) {
      svg.append("text").attr("class", "mark-label").attr("x", 40).attr("y", 210).text("Install d3-sankey to render this example.");
      return;
    }
    const layout = d3.sankey().nodeWidth(16).nodePadding(14).extent([[46, 36], [width - 48, height - 52]]);
    const { nodes, links } = layout({ nodes: graph.nodes.map(d => ({ ...d })), links: graph.links.map(d => ({ ...d })) });
    const color = d3.scaleOrdinal(nodes.map(d => d.name), colors);
    const link = svg.append("g").attr("fill", "none").attr("stroke-opacity", .35).selectAll("path").data(links).join("path")
      .attr("d", d3.sankeyLinkHorizontal()).attr("stroke", d => color(d.source.name)).attr("stroke-width", d => Math.max(1, d.width));
    drawPath(link, .1, .95);
    const node = svg.append("g").selectAll("g").data(nodes).join("g");
    node.append("rect").attr("x", d => d.x0).attr("y", d => d.y0).attr("height", d => d.y1 - d.y0).attr("width", d => d.x1 - d.x0).attr("fill", d => color(d.name)).attr("rx", 3);
    node.append("text").attr("class", "label").attr("x", d => d.x0 < width / 2 ? d.x1 + 7 : d.x0 - 7).attr("y", d => (d.y0 + d.y1) / 2).attr("dy", ".35em").attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end").text(d => d.name);
    fadeIn(node, .25, .55);
  }

  function renderD3FlowchartDag() {
    const svg = prepareSvg("flowchart-dag", "D3 flowchart DAG", "A Mermaid-style flowchart rendered directly with D3 SVG marks.");
    const arrow = addArrowMarker(svg, "flowchart-dag", palette.green);
    const nodes = [
      { id: "start", label: "Start", type: "circle", x: 52, y: 210, w: 56, h: 56, fill: palette.blueHighlight, stroke: palette.blue },
      { id: "collect", label: "Collect\nrequest", type: "input", x: 145, y: 210, w: 90, h: 54, fill: palette.surface, stroke: palette.blue },
      { id: "validate", label: "Valid\npayload?", type: "diamond", x: 258, y: 210, w: 82, h: 70, fill: palette.yellowHighlight, stroke: palette.orange },
      { id: "persist", label: "Store\nevent", type: "store", x: 374, y: 140, w: 96, h: 48, fill: palette.yellowHighlight, stroke: palette.orange },
      { id: "repair", label: "Repair\ninput", type: "rect", x: 374, y: 282, w: 96, h: 48, fill: palette.redHighlight, stroke: palette.red },
      { id: "notify", label: "Notify\nsubscriber", type: "rect", x: 486, y: 140, w: 112, h: 48, fill: palette.greenHighlight, stroke: palette.green },
      { id: "done", label: "Done", type: "double", x: 522, y: 250, w: 58, h: 58, fill: palette.blueHighlight, stroke: palette.blue }
    ];
    const byId = new Map(nodes.map(d => [d.id, d]));
    const links = [
      { source: "start", target: "collect" },
      { source: "collect", target: "validate" },
      { source: "validate", target: "persist", label: "yes", bend: -42 },
      { source: "validate", target: "repair", label: "no", bend: 44 },
      { source: "repair", target: "collect", label: "retry", loop: true },
      { source: "persist", target: "notify" },
      { source: "notify", target: "done", bend: 54 }
    ];
    const nodeEdge = (node, toward) => {
      const dx = toward.x - node.x;
      const dy = toward.y - node.y;
      if (Math.abs(dx) > Math.abs(dy)) return { x: node.x + Math.sign(dx) * node.w / 2, y: node.y };
      return { x: node.x, y: node.y + Math.sign(dy) * node.h / 2 };
    };
    const edgePath = d => {
      const source = byId.get(d.source);
      const target = byId.get(d.target);
      if (d.loop) return "M330,282C248,336 132,326 116,238";
      const s = nodeEdge(source, target);
      const t = nodeEdge(target, source);
      const mx = (s.x + t.x) / 2;
      const bend = d.bend || 0;
      return `M${s.x},${s.y}C${mx},${s.y + bend} ${mx},${t.y + bend} ${t.x},${t.y}`;
    };
    const paths = svg.append("g").selectAll("path.flow-link").data(links).join("path")
      .attr("class", "flow-link")
      .attr("d", edgePath)
      .attr("fill", "none")
      .attr("stroke", palette.green)
      .attr("stroke-width", 2.2)
      .attr("stroke-linecap", "round")
      .attr("marker-end", arrow);
    drawPath(paths, .08, .85);
    svg.append("g").selectAll("text.flow-label").data(links.filter(d => d.label)).join("text")
      .attr("class", "caption")
      .attr("x", d => d.loop ? 205 : (byId.get(d.source).x + byId.get(d.target).x) / 2)
      .attr("y", d => d.loop ? 318 : (byId.get(d.source).y + byId.get(d.target).y) / 2 + (d.bend || 0) * .38 - 7)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .text(d => d.label);
    const groups = svg.append("g").selectAll("g.flow-node").data(nodes).join("g")
      .attr("class", "flow-node")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    groups.each(function (d) {
      const g = d3.select(this);
      if (d.type === "circle" || d.type === "double") {
        g.append("circle").attr("r", d.w / 2).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.3);
        if (d.type === "double") g.append("circle").attr("r", d.w / 2 - 6).attr("fill", "none").attr("stroke", d.stroke).attr("stroke-width", 1.4);
      } else if (d.type === "diamond") {
        g.append("path").attr("d", `M0,${-d.h / 2}L${d.w / 2},0L0,${d.h / 2}L${-d.w / 2},0Z`).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.3);
      } else if (d.type === "input") {
        g.append("path").attr("d", `M${-d.w / 2 + 12},${-d.h / 2}H${d.w / 2}L${d.w / 2 - 12},${d.h / 2}H${-d.w / 2}Z`).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.1);
      } else {
        g.append("rect").attr("x", -d.w / 2).attr("y", -d.h / 2).attr("width", d.w).attr("height", d.h).attr("rx", d.type === "store" ? 16 : 8).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 2.1);
      }
    });
    groups.selectAll("text").data(d => d.label.split("\n").map((line, i, lines) => ({ line, offset: (i - (lines.length - 1) / 2) * 14 }))).join("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("dy", d => d.offset + 4)
      .attr("font-weight", 800)
      .text(d => d.line);
    fadeIn(groups, .22, .48);
  }

  function renderD3SequenceLifelines() {
    const svg = prepareSvg("sequence-lifelines", "D3 sequence lifelines", "A sequence diagram rendered from actor and message records.");
    const arrow = addArrowMarker(svg, "sequence-lifelines", palette.blueHover);
    const actors = [
      { id: "Client", x: 54, color: palette.blueHighlight },
      { id: "API", x: 176, color: palette.yellowHighlight },
      { id: "DB", x: 294, color: palette.greenHighlight },
      { id: "Job", x: 412, color: palette.purpleHighlight },
      { id: "Worker", x: 514, color: palette.blueHighlight }
    ];
    const x = new Map(actors.map(d => [d.id, d.x]));
    const messages = [
      { from: "Client", to: "API", y: 118, label: "Submit order" },
      { from: "API", to: "DB", y: 156, label: "Reserve inventory" },
      { from: "DB", to: "API", y: 194, label: "Reservation id", reply: true },
      { from: "API", to: "Job", y: 232, label: "Schedule pick list" },
      { from: "API", to: "Client", y: 270, label: "Accepted", reply: true },
      { from: "Worker", to: "Job", y: 314, label: "Process queue item" },
      { from: "Job", to: "Worker", y: 352, label: "Complete", reply: true }
    ];
    const actorGroups = svg.append("g").selectAll("g.seq-actor").data(actors).join("g")
      .attr("class", "seq-actor")
      .attr("transform", d => `translate(${d.x},50)`);
    actorGroups.append("rect").attr("x", -39).attr("y", -17).attr("width", 78).attr("height", 34).attr("rx", 8).attr("fill", d => d.color).attr("stroke", palette.blue).attr("stroke-width", 1.7);
    actorGroups.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 4).attr("font-weight", 800).text(d => d.id);
    fadeIn(actorGroups, .06, .38);
    const lifelines = svg.append("g").selectAll("line.seq-lifeline").data(actors).join("line")
      .attr("class", "seq-lifeline")
      .attr("x1", d => d.x)
      .attr("x2", d => d.x)
      .attr("y1", 72)
      .attr("y2", 374)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "4 5");
    drawPath(lifelines, .15, .75);
    const activation = svg.append("rect").attr("x", x.get("API") - 8).attr("y", 104).attr("width", 16).attr("height", 182).attr("rx", 4).attr("fill", palette.yellowHighlight).attr("stroke", palette.orange).attr("stroke-width", 1.4);
    fadeIn(activation, .35, .4);
    const msg = svg.append("g").selectAll("g.seq-message").data(messages).join("g").attr("class", "seq-message");
    const paths = msg.append("path")
      .attr("d", d => `M${x.get(d.from)},${d.y}H${x.get(d.to)}`)
      .attr("fill", "none")
      .attr("stroke", d => d.reply ? palette.green : palette.blueHover)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", d => d.reply ? "5 5" : null)
      .attr("marker-end", arrow);
    drawPath(paths, .28, .72);
    msg.append("text")
      .attr("class", "caption")
      .attr("x", d => (x.get(d.from) + x.get(d.to)) / 2)
      .attr("y", d => d.y - 7)
      .attr("text-anchor", "middle")
      .attr("font-size", 10.5)
      .text(d => d.label);
    const note = svg.append("g").attr("transform", "translate(64,386)");
    note.append("rect").attr("width", 386).attr("height", 22).attr("rx", 7).attr("fill", palette.greenHighlight).attr("stroke", palette.green).attr("stroke-width", 1.2);
    note.append("text").attr("class", "caption").attr("x", 193).attr("y", 15).attr("text-anchor", "middle").text("actors, activations, replies");
    fadeIn(note, .95, .35);
  }

  function renderD3StateMachine() {
    const svg = prepareSvg("state-machine", "D3 state machine", "A state diagram rendered with explicit D3 node symbols and transitions.");
    const arrow = addArrowMarker(svg, "state-machine", palette.purple);
    const nodes = [
      { id: "start", label: "", type: "start", x: 38, y: 210, w: 18, h: 18 },
      { id: "Draft", label: "Draft", type: "state", x: 112, y: 210, w: 78, h: 42 },
      { id: "Review", label: "Review", type: "state", x: 214, y: 210, w: 86, h: 42 },
      { id: "Choice", label: "", type: "choice", x: 306, y: 210, w: 36, h: 36 },
      { id: "Approved", label: "Approved", type: "state", x: 390, y: 142, w: 92, h: 42 },
      { id: "Fork", label: "", type: "barV", x: 476, y: 142, w: 9, h: 62 },
      { id: "Publish", label: "Publish", type: "state", x: 520, y: 96, w: 76, h: 38 },
      { id: "Archive", label: "Archive", type: "state", x: 520, y: 190, w: 76, h: 38 },
      { id: "Join", label: "", type: "barH", x: 438, y: 302, w: 62, h: 9 },
      { id: "end", label: "", type: "end", x: 520, y: 302, w: 22, h: 22 }
    ];
    const byId = new Map(nodes.map(d => [d.id, d]));
    const links = [
      ["start", "Draft", ""], ["Draft", "Review", "submit"], ["Review", "Choice", ""],
      ["Choice", "Approved", "accepted"], ["Choice", "Draft", "changes", true],
      ["Approved", "Fork", ""], ["Fork", "Publish", ""], ["Fork", "Archive", ""],
      ["Publish", "Join", ""], ["Archive", "Join", ""], ["Join", "end", ""]
    ].map(([source, target, label, loop]) => ({ source, target, label, loop }));
    const pathFor = d => {
      const a = byId.get(d.source);
      const b = byId.get(d.target);
      if (d.loop) return "M300,228C260,294 114,294 96,232";
      const bend = Math.abs(a.y - b.y) > 50 ? 34 : 0;
      return `M${a.x},${a.y}C${(a.x + b.x) / 2},${a.y + bend} ${(a.x + b.x) / 2},${b.y - bend} ${b.x},${b.y}`;
    };
    const paths = svg.append("g").selectAll("path.state-link").data(links).join("path")
      .attr("class", "state-link")
      .attr("d", pathFor)
      .attr("fill", "none")
      .attr("stroke", palette.purple)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", .72)
      .attr("marker-end", arrow);
    drawPath(paths, .08, .85);
    svg.append("g").selectAll("text.state-link-label").data(links.filter(d => d.label)).join("text")
      .attr("class", "caption")
      .attr("x", d => d.loop ? 178 : (byId.get(d.source).x + byId.get(d.target).x) / 2)
      .attr("y", d => d.loop ? 286 : (byId.get(d.source).y + byId.get(d.target).y) / 2 - 8)
      .attr("text-anchor", "middle")
      .text(d => d.label);
    const groups = svg.append("g").selectAll("g.state-node").data(nodes).join("g")
      .attr("class", "state-node")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    groups.each(function (d) {
      const g = d3.select(this);
      if (d.type === "start") g.append("circle").attr("r", 9).attr("fill", palette.ink);
      else if (d.type === "end") {
        g.append("circle").attr("r", 13).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2);
        g.append("circle").attr("r", 8).attr("fill", palette.ink);
      } else if (d.type === "choice") {
        g.append("path").attr("d", "M0,-20L20,0L0,20L-20,0Z").attr("fill", palette.yellowHighlight).attr("stroke", palette.orange).attr("stroke-width", 2);
      } else if (d.type === "barV") g.append("rect").attr("x", -5).attr("y", -31).attr("width", 10).attr("height", 62).attr("rx", 4).attr("fill", palette.ink);
      else if (d.type === "barH") g.append("rect").attr("x", -31).attr("y", -5).attr("width", 62).attr("height", 10).attr("rx", 4).attr("fill", palette.ink);
      else g.append("rect").attr("x", -d.w / 2).attr("y", -d.h / 2).attr("width", d.w).attr("height", d.h).attr("rx", 10).attr("fill", palette.blueHighlight).attr("stroke", palette.blue).attr("stroke-width", 2);
    });
    groups.filter(d => d.label).append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 4).attr("font-weight", 800).text(d => d.label);
    fadeIn(groups, .2, .45);
  }

  function renderD3ErSchema() {
    const svg = prepareSvg("er-schema", "D3 ER schema", "Entity tables and relationship cardinalities rendered directly with D3.");
    const entities = [
      { id: "CUSTOMER", x: 44, y: 60, fields: ["customer_id PK", "email", "status"], color: palette.blue },
      { id: "ORDER", x: 228, y: 60, fields: ["order_id PK", "created_at", "state"], color: palette.orange },
      { id: "LINE_ITEM", x: 228, y: 246, fields: ["line_id PK", "quantity"], color: palette.green },
      { id: "PRODUCT", x: 410, y: 246, fields: ["sku PK", "name", "price"], color: palette.purple }
    ];
    const box = { w: 128, header: 28, row: 21 };
    entities.forEach(d => { d.h = box.header + d.fields.length * box.row + 10; });
    const byId = new Map(entities.map(d => [d.id, d]));
    const relations = [
      { a: "CUSTOMER", b: "ORDER", label: "places", ca: "1", cb: "0..n", sideA: "right", sideB: "left" },
      { a: "ORDER", b: "LINE_ITEM", label: "contains", ca: "1", cb: "1..n", sideA: "bottom", sideB: "top" },
      { a: "LINE_ITEM", b: "PRODUCT", label: "references", ca: "0..n", cb: "1", sideA: "right", sideB: "left" }
    ];
    const anchor = (entity, side) => {
      if (side === "right") return { x: entity.x + box.w, y: entity.y + entity.h / 2 };
      if (side === "left") return { x: entity.x, y: entity.y + entity.h / 2 };
      if (side === "bottom") return { x: entity.x + box.w / 2, y: entity.y + entity.h };
      return { x: entity.x + box.w / 2, y: entity.y };
    };
    const paths = svg.append("g").selectAll("path.er-link").data(relations).join("path")
      .attr("class", "er-link")
      .attr("d", d => {
        const a = anchor(byId.get(d.a), d.sideA);
        const b = anchor(byId.get(d.b), d.sideB);
        const mx = (a.x + b.x) / 2;
        return d.sideA === "bottom" ? `M${a.x},${a.y}V${(a.y + b.y) / 2}H${b.x}V${b.y}` : `M${a.x},${a.y}C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
      })
      .attr("fill", "none")
      .attr("stroke", palette.purple)
      .attr("stroke-width", 2.1)
      .attr("stroke-opacity", .75);
    drawPath(paths, .12, .85);
    svg.append("g").selectAll("text.er-cardinality-a").data(relations).join("text")
      .attr("class", "caption")
      .attr("x", d => anchor(byId.get(d.a), d.sideA).x + (d.sideA === "right" ? 8 : -8))
      .attr("y", d => anchor(byId.get(d.a), d.sideA).y - 8)
      .attr("text-anchor", d => d.sideA === "right" ? "start" : "end")
      .attr("font-weight", 800)
      .text(d => d.ca);
    svg.append("g").selectAll("text.er-cardinality-b").data(relations).join("text")
      .attr("class", "caption")
      .attr("x", d => anchor(byId.get(d.b), d.sideB).x + (d.sideB === "left" ? -8 : 8))
      .attr("y", d => anchor(byId.get(d.b), d.sideB).y - 8)
      .attr("text-anchor", d => d.sideB === "left" ? "end" : "start")
      .attr("font-weight", 800)
      .text(d => d.cb);
    const groups = svg.append("g").selectAll("g.er-entity").data(entities).join("g")
      .attr("class", "er-entity")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    groups.append("rect").attr("width", box.w).attr("height", d => d.h).attr("rx", 8).attr("fill", palette.surface).attr("stroke", d => d.color).attr("stroke-width", 2);
    groups.append("rect").attr("width", box.w).attr("height", box.header).attr("rx", 8).attr("fill", d => d.color).attr("fill-opacity", .88);
    groups.append("text").attr("class", "reverse-label").attr("x", box.w / 2).attr("y", 19).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.id);
    groups.each(function (entity) {
      d3.select(this).selectAll("text.er-field").data(entity.fields).join("text")
        .attr("class", "caption")
        .attr("x", 10)
        .attr("y", (_, i) => box.header + 20 + i * box.row)
        .text(d => d);
    });
    fadeIn(groups, .18, .45);
  }

  function renderD3GanttRollout() {
    const svg = prepareSvg("gantt-rollout", "D3 Gantt rollout", "A Mermaid-style rollout schedule drawn with D3 time scales.");
    const parse = d3.timeParse("%Y-%m-%d");
    const tasks = [
      { section: "Build", name: "Draft sources", start: "2026-06-19", end: "2026-06-21", status: "active", color: palette.blue },
      { section: "Build", name: "Add wrappers", start: "2026-06-21", end: "2026-06-22", status: "normal", color: palette.green },
      { section: "Build", name: "Validate", start: "2026-06-22", end: "2026-06-23", status: "crit", color: palette.red },
      { section: "Release", name: "Review palette", start: "2026-06-23", end: "2026-06-24", status: "normal", color: palette.orange },
      { section: "Release", name: "Publish", start: "2026-06-24", end: "2026-06-24", status: "milestone", color: palette.purple }
    ].map(d => ({ ...d, startDate: parse(d.start), endDate: parse(d.end) }));
    const x = d3.scaleTime().domain([parse("2026-06-19"), parse("2026-06-25")]).range([142, 518]);
    const y = d3.scaleBand().domain(tasks.map(d => d.name)).range([82, 326]).padding(.34);
    svg.append("g").attr("class", "axis").attr("transform", "translate(0,348)").call(d3.axisBottom(x).ticks(d3.timeDay.every(1)).tickFormat(d3.timeFormat("%b %d")));
    svg.append("g").attr("class", "grid").selectAll("line").data(x.ticks(d3.timeDay.every(1))).join("line")
      .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 56).attr("y2", 340);
    const sections = d3.group(tasks, d => d.section);
    [...sections].forEach(([name, rows]) => {
      const y0 = d3.min(rows, d => y(d.name));
      svg.append("text").attr("class", "mark-label").attr("x", 32).attr("y", y0 - 8).attr("font-weight", 800).style("font-size", "10px").text(name);
    });
    svg.append("g").selectAll("text.task-label").data(tasks).join("text")
      .attr("class", "label")
      .attr("x", 132)
      .attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .style("font-size", "10px")
      .text(d => d.name);
    const bars = svg.append("g").selectAll("g.gantt-task").data(tasks).join("g").attr("class", "gantt-task");
    bars.filter(d => d.status !== "milestone").append("rect")
      .attr("x", d => x(d.startDate))
      .attr("y", d => y(d.name))
      .attr("height", y.bandwidth())
      .attr("width", d => Math.max(8, x(d.endDate) - x(d.startDate)))
      .attr("rx", 7)
      .attr("fill", d => d.color)
      .attr("fill-opacity", .82)
      .attr("stroke", d => d.status === "crit" ? palette.redHover : palette.surface)
      .attr("stroke-width", d => d.status === "crit" ? 2.4 : 1.2);
    bars.filter(d => d.status === "milestone").append("path")
      .attr("d", d => {
        const cx = x(d.startDate), cy = y(d.name) + y.bandwidth() / 2;
        return `M${cx},${cy - 12}L${cx + 12},${cy}L${cx},${cy + 12}L${cx - 12},${cy}Z`;
      })
      .attr("fill", d => d.color);
    fadeIn(bars, .18, .45);
    const today = svg.append("line").attr("x1", x(parse("2026-06-22"))).attr("x2", x(parse("2026-06-22"))).attr("y1", 54).attr("y2", 338).attr("stroke", palette.green).attr("stroke-width", 3).attr("stroke-opacity", .72);
    drawPath(today, .55, .7);
  }

  function renderD3GitGraph() {
    const svg = prepareSvg("git-graph", "D3 git graph", "Branch lanes, commits, and merge geometry rendered without Mermaid.");
    const lanes = { main: 156, examples: 252 };
    const commits = [
      { id: "init", branch: "main", x: 70, y: lanes.main, color: palette.blue },
      { id: "mmd", branch: "examples", x: 160, y: lanes.examples, color: palette.green, highlight: true },
      { id: "md", branch: "examples", x: 250, y: lanes.examples, color: palette.green },
      { id: "validator", branch: "main", x: 250, y: lanes.main, color: palette.orange },
      { id: "merge", branch: "main", x: 370, y: lanes.main, color: palette.purple, label: "examples/mermaid" },
      { id: "verify", branch: "main", x: 488, y: lanes.main, color: palette.red }
    ];
    const mainLine = svg.append("path").attr("d", `M${commits[0].x},${lanes.main}H${commits.at(-1).x}`).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 4).attr("stroke-linecap", "round");
    const branchLine = svg.append("path").attr("d", `M${commits[0].x},${lanes.main}C104,${lanes.main} 108,${lanes.examples} 160,${lanes.examples}H250C308,${lanes.examples} 318,${lanes.main} 370,${lanes.main}`).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 4).attr("stroke-linecap", "round");
    drawPath(mainLine, .08, .9);
    drawPath(branchLine, .22, 1.05);
    Object.entries(lanes).forEach(([name, y]) => {
      svg.append("text").attr("class", "mark-label").attr("x", 34).attr("y", y + 4).attr("text-anchor", "start").attr("font-weight", 800).text(name);
    });
    const groups = svg.append("g").selectAll("g.git-commit").data(commits).join("g")
      .attr("class", "git-commit")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle").attr("fill", d => d.color).attr("stroke", palette.surface).attr("stroke-width", d => d.highlight ? 4 : 2.2);
    grow(circles, "r", 4, d => d.highlight ? 13 : 10, .35, .5);
    groups.append("text").attr("class", "label").attr("y", d => d.branch === "main" ? -22 : 28).attr("text-anchor", "middle").attr("font-weight", d => d.highlight ? 800 : 600).text(d => d.id);
    svg.append("text").attr("class", "caption").attr("x", 370).attr("y", lanes.main + 32).attr("text-anchor", "middle").text("examples/mermaid");
  }

  function renderD3KanbanBoard() {
    const svg = prepareSvg("kanban-board", "D3 kanban board", "Mermaid kanban data rendered as D3 columns and cards.");
    const columns = [
      { id: "Backlog", x: 32, color: palette.blue },
      { id: "In progress", x: 204, color: palette.orange },
      { id: "Done", x: 376, color: palette.green }
    ];
    const cards = [
      { col: "Backlog", title: "Define colors", ticket: "EX-101", owner: "Design", priority: "High" },
      { col: "Backlog", title: "Choose shapes", ticket: "EX-102", owner: "Docs", priority: "High" },
      { col: "In progress", title: "Create wrappers", ticket: "EX-201", owner: "Docs", priority: "Very High" },
      { col: "Done", title: "Allow examples", ticket: "EX-301", owner: "Maintainer", priority: "Low" }
    ];
    const colW = 150;
    const cardH = 70;
    const priorityColor = { "Very High": palette.red, High: palette.orange, Low: palette.green };
    const priorityLegend = [
      { label: "Very High", color: priorityColor["Very High"] },
      { label: "High", color: priorityColor.High },
      { label: "Low", color: priorityColor.Low }
    ];
    const colById = new Map(columns.map(d => [d.id, d]));
    const columnOrder = new Map(columns.map((d, i) => [d.id, i]));
    const legendGroup = svg.append("g")
      .attr("class", "kanban-priority-legend")
      .attr("data-legend", "priority");
    legendGroup.append("text")
      .attr("class", "caption")
      .attr("x", 32)
      .attr("y", 35)
      .attr("font-size", 10.5)
      .attr("font-weight", 850)
      .text("Priority");
    const priorityItems = legendGroup.selectAll("g.kanban-priority-item")
      .data(priorityLegend)
      .join("g")
      .attr("class", "kanban-priority-item")
      .attr("data-priority", d => d.label)
      .attr("transform", (_, i) => `translate(${102 + i * 112},31)`);
    priorityItems.append("rect")
      .attr("x", 0)
      .attr("y", -9)
      .attr("width", 12)
      .attr("height", 12)
      .attr("rx", 3)
      .attr("fill", d => d.color);
    priorityItems.append("text")
      .attr("class", "caption")
      .attr("x", 18)
      .attr("y", 1.5)
      .attr("font-size", 10.5)
      .attr("font-weight", 750)
      .text(d => d.label);
    revealIn(legendGroup, .06, .3);
    const colGroups = svg.append("g").selectAll("g.kanban-column").data(columns).join("g")
      .attr("class", "kanban-column")
      .attr("data-column-order", d => columnOrder.get(d.id))
      .attr("transform", d => `translate(${d.x},54)`);
    colGroups.append("rect").attr("width", colW).attr("height", 310).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    colGroups.append("rect").attr("width", colW).attr("height", 34).attr("rx", 10).attr("fill", d => d.color).attr("fill-opacity", .86);
    colGroups.append("text").attr("class", "reverse-label").attr("x", colW / 2).attr("y", 22).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.id);
    revealIn(colGroups, (_, i) => .08 + i * .04, .34);
    const counts = new Map();
    const indexed = cards.map(card => {
      const preceding = counts.get(card.col) || 0;
      counts.set(card.col, preceding + 1);
      return { ...card, x: colById.get(card.col).x + 10, y: 104 + preceding * 92, columnOrder: columnOrder.get(card.col), order: preceding };
    });
    [...indexed]
      .sort((a, b) => d3.ascending(a.x, b.x) || d3.ascending(a.y, b.y))
      .forEach((card, revealOrder) => {
        card.revealOrder = revealOrder;
      });
    const cardRevealStart = .62;
    const cardRevealGap = .16;
    const cardGroups = svg.append("g").selectAll("g.kanban-card").data(indexed).join("g")
      .attr("class", "kanban-card")
      .attr("data-column", d => d.col)
      .attr("data-reveal-order", d => d.revealOrder)
      .attr("data-reveal-begin-ms", d => Math.round((cardRevealStart + d.revealOrder * cardRevealGap) * 1000))
      .attr("transform", d => `translate(${d.x},${d.y})`);
    cardGroups.append("rect").attr("width", colW - 20).attr("height", cardH).attr("rx", 8).attr("fill", palette.surface).attr("stroke", palette.gray300).attr("stroke-width", 1.3);
    cardGroups.append("rect").attr("x", 0).attr("y", 0).attr("width", 6).attr("height", cardH).attr("rx", 3).attr("fill", d => priorityColor[d.priority]);
    cardGroups.append("text").attr("class", "mark-label").attr("x", 16).attr("y", 21).attr("font-weight", 800).text(d => d.title);
    cardGroups.append("text").attr("class", "caption").attr("x", 16).attr("y", 43).text(d => d.ticket);
    cardGroups.append("text").attr("class", "caption").attr("x", 16).attr("y", 61).text(d => `${d.owner} / ${d.priority}`);
    revealIn(cardGroups, d => cardRevealStart + d.revealOrder * cardRevealGap, .34);
  }

  function renderKanbanAssigneeBoard() {
    renderKanbanAssigneeBoardVariant({
      id: "kanban-assignees",
      title: "Kanban assignee board",
      desc: "Five Kanban columns with task cards, colored assignee dots, and a compact team legend.",
      legendMode: "top-row"
    });
  }

  function renderKanbanAssigneeBoardVirtualLegend() {
    renderKanbanAssigneeBoardVariant({
      id: "kanban-legend-column",
      title: "Kanban virtual legend",
      desc: "Five Kanban columns with task cards and a person legend rendered as a virtual sixth column.",
      legendMode: "virtual-column"
    });
  }

  function renderKanbanAssigneeBoardDistributedLegend() {
    renderKanbanAssigneeBoardVariant({
      id: "kanban-legend-footer",
      title: "Kanban distributed legend",
      desc: "Five Kanban columns with task cards and person legend chips distributed through spare column footer space.",
      legendMode: "distributed-columns"
    });
  }

  function renderKanbanAssigneeBoardVariant({ id, title, desc, legendMode }) {
    const svg = prepareSvg(id, title, desc)
      .attr("data-pattern-family", "kanban-assignees")
      .attr("data-legend-mode", legendMode)
      .attr("data-column-count", 5)
      .attr("data-assignee-count", 5);
    const people = [
      { id: "AM", name: "Avery", color: palette.blue },
      { id: "BR", name: "Blair", color: palette.orange },
      { id: "CL", name: "Chen", color: palette.green },
      { id: "DN", name: "Dana", color: palette.purple },
      { id: "ES", name: "Ellis", color: palette.cyan }
    ];
    const personById = new Map(people.map(person => [person.id, person]));
    const tasks = [
      { col: "Intake", title: "Brief", assignees: ["AM", "BR"] },
      { col: "Intake", title: "Map release\nnotes draft", assignees: ["CL"], expectedLines: 2 },
      { col: "Intake", title: "Risks", assignees: ["DN", "ES"] },
      { col: "Ready", title: "Spec", assignees: ["AM", "CL"] },
      { col: "Ready", title: "Copy", assignees: ["BR"] },
      { col: "Ready", title: "Flow", assignees: ["DN", "AM"] },
      { col: "Ready", title: "API", assignees: ["ES", "CL"] },
      { col: "Build", title: "Data", assignees: ["CL", "ES"] },
      { col: "Build", title: "UI", assignees: ["AM", "DN"] },
      { col: "Build", title: "Reconcile\nmobile check\nstates", assignees: ["BR", "CL", "ES"], expectedLines: 3 },
      { col: "Build", title: "Tests", assignees: ["DN"] },
      { col: "Build", title: "Fixes", assignees: ["AM", "BR"] },
      { col: "Review", title: "QA", assignees: ["ES", "DN"] },
      { col: "Review", title: "Legal", assignees: ["BR"] },
      { col: "Review", title: "Perf", assignees: ["CL", "AM"] },
      { col: "Review", title: "Docs", assignees: ["DN", "BR"] },
      { col: "Ship", title: "Launch", assignees: ["AM", "ES"] },
      { col: "Ship", title: "Monitor", assignees: ["CL", "DN"] },
      { col: "Ship", title: "Retro", assignees: ["BR", "ES", "AM"] }
    ];
    const isVirtualColumn = legendMode === "virtual-column";
    const isDistributed = legendMode === "distributed-columns";
    const colW = isVirtualColumn ? 85 : 105;
    const columnGap = 4;
    const leftX = isVirtualColumn ? 6 : 8;
    const columns = [
      { id: "Intake", color: palette.blue },
      { id: "Ready", color: palette.green },
      { id: "Build", color: palette.orange },
      { id: "Review", color: palette.purple },
      { id: "Ship", color: palette.cyan }
    ].map((column, index) => ({
      ...column,
      x: leftX + index * (colW + columnGap)
    }));
    const headerH = 24;
    const cardW = colW - 8;
    const cardGap = 4;
    const boardY = legendMode === "top-row" ? 48 : 34;
    const titleX = 6;
    const titleY = 12.4;
    const titleLineHeight = isVirtualColumn ? 9.7 : 10.1;
    const titleFontSize = isVirtualColumn ? 8.9 : 9.7;
    const titleFontWeight = 850;
    const titleMaxLines = 3;
    const titleFullWidth = cardW - titleX * 2;
    const titleDotSafeWidth = Math.max(30, cardW - (isVirtualColumn ? 54 : 60));
    const cardHeightForLines = lineCount => 34 + Math.min(titleMaxLines, Math.max(1, lineCount)) * 8;
    const dotRadius = isVirtualColumn ? 7.7 : 9.4;
    const dotSpacing = isVirtualColumn ? 15.2 : 18;
    const dotRight = isVirtualColumn ? 9.5 : 12;
    const dotFontSize = isVirtualColumn ? 5.7 : 6.4;

    function fitKanbanTitleLine(probe, value, width) {
      let fitted = value.trim();
      probe.text(fitted);
      if (probe.node().getComputedTextLength() <= width) return fitted;
      while (fitted.length > 1) {
        fitted = fitted.slice(0, -1).trimEnd();
        probe.text(`${fitted}...`);
        if (probe.node().getComputedTextLength() <= width) return `${fitted}...`;
      }
      return "...";
    }

    const titleProbe = svg.append("text")
      .attr("class", "mark-label")
      .attr("x", -999)
      .attr("y", -999)
      .attr("font-size", titleFontSize)
      .attr("font-weight", titleFontWeight)
      .attr("visibility", "hidden");

    function measureKanbanTitle(title) {
      const widthForLine = index => index >= titleMaxLines - 1 ? titleDotSafeWidth : titleFullWidth;
      const raw = String(title);
      let lines;
      if (raw.includes("\n")) {
        const hardLines = raw.split(/\n/).map(line => line.trim()).filter(Boolean);
        lines = hardLines.slice(0, titleMaxLines);
        if (hardLines.length > titleMaxLines) {
          lines[titleMaxLines - 1] = `${lines[titleMaxLines - 1]} ${hardLines.slice(titleMaxLines).join(" ")}`;
        }
        lines = lines.map((line, index) => fitKanbanTitleLine(titleProbe, line, widthForLine(index)));
      } else {
        const words = raw.split(/\s+/).filter(Boolean);
        lines = [];
        let current = "";
        for (let i = 0; i < words.length; i += 1) {
          const candidate = current ? `${current} ${words[i]}` : words[i];
          titleProbe.text(candidate);
          if (!current || titleProbe.node().getComputedTextLength() <= widthForLine(lines.length)) {
            current = candidate;
          } else {
            lines.push(current);
            current = words[i];
            if (lines.length === titleMaxLines - 1) {
              current = [current, ...words.slice(i + 1)].join(" ");
              break;
            }
          }
        }
        if (current && lines.length < titleMaxLines) lines.push(current);
        lines = lines.map((line, index) => fitKanbanTitleLine(titleProbe, line, widthForLine(index)));
      }
      return lines.length ? lines : [""];
    }

    const sizedTasks = tasks.map(task => {
      const lines = measureKanbanTitle(task.title);
      return {
        ...task,
        titleLines: lines,
        lineCount: lines.length,
        cardH: cardHeightForLines(lines.length)
      };
    });
    titleProbe.remove();

    const tasksByColumn = d3.group(sizedTasks, task => task.col);
    const columnHeight = column => {
      const columnTasks = tasksByColumn.get(column.id) || [];
      return headerH + 16 + d3.sum(columnTasks, task => task.cardH) + Math.max(0, columnTasks.length - 1) * cardGap;
    };
    const maxCompactColumnH = d3.max(columns, column => columnHeight(column));
    const unifiedColumnH = isDistributed
      ? maxCompactColumnH + 34
      : isVirtualColumn
        ? Math.max(maxCompactColumnH, headerH + 18 + people.length * 37)
        : null;
    const displayColumnHeight = column => unifiedColumnH || columnHeight(column);

    function wrapKanbanTitle(text, lines) {
      text.attr("data-line-count", lines.length)
        .selectAll("tspan")
        .data(lines)
        .join("tspan")
        .attr("x", titleX)
        .attr("y", (_, index) => titleY + index * titleLineHeight)
        .text(d => d);
    }

    function drawLegendChips(chips, options = {}) {
      const radius = options.radius || 9.2;
      chips.append("circle")
        .attr("fill", d => d.color)
        .attr("stroke", palette.surface)
        .attr("stroke-width", options.strokeWidth || 1.6);
      grow(chips.selectAll("circle"), "r", 2, radius, options.delay || .04, .35);
      chips.append("text")
        .attr("class", "reverse-label")
        .attr("x", 0)
        .attr("y", options.idY || 3.2)
        .attr("text-anchor", "middle")
        .attr("font-size", options.idFontSize || 6.8)
        .attr("font-weight", 900)
        .text(d => d.id);
      chips.append("text")
        .attr("class", "caption")
        .attr("x", options.nameX || 15)
        .attr("y", options.nameY || 3.8)
        .attr("font-size", options.nameFontSize || 10)
        .attr("font-weight", 800)
        .text(d => d.name);
    }

    if (legendMode === "top-row") {
      const legendGroup = svg.append("g")
        .attr("class", "kanban-assignee-legend")
        .attr("data-legend", "assignee")
        .attr("data-legend-mode", legendMode);
      const legend = legendGroup.selectAll("g.legend-chip")
        .data(people)
        .join("g")
        .attr("class", "legend-chip")
        .attr("data-person-id", d => d.id)
        .attr("data-legend-placement", "top-row")
        .attr("transform", (_, i) => `translate(${22 + i * 106},22)`);
      drawLegendChips(legend, { radius: 10.2, strokeWidth: 1.7, idFontSize: 7.2, idY: 3.5, nameX: 16, nameY: 4, nameFontSize: 10.5 });
      revealIn(legendGroup, .06, .3);
    }

    const colById = new Map(columns.map(column => [column.id, column]));
    const columnOrder = new Map(columns.map((column, index) => [column.id, index]));
    const colGroups = svg.append("g").selectAll("g.kanban-assignee-column").data(columns).join("g")
      .attr("class", "kanban-assignee-column")
      .attr("data-column-order", d => columnOrder.get(d.id))
      .attr("data-column", d => d.id)
      .attr("data-display-height", d => displayColumnHeight(d))
      .attr("transform", d => `translate(${d.x},${boardY})`);
    colGroups.append("rect")
      .attr("width", colW)
      .attr("height", displayColumnHeight)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray200);
    colGroups.append("rect")
      .attr("width", colW)
      .attr("height", headerH)
      .attr("fill", d => d.color)
      .attr("fill-opacity", .88);
    colGroups.append("text")
      .attr("class", "reverse-label")
      .attr("x", colW / 2)
      .attr("y", 16)
      .attr("text-anchor", "middle")
      .attr("font-size", 11)
      .attr("font-weight", 850)
      .text(d => d.id);
    revealIn(colGroups, (_, i) => .08 + i * .035, .34);

    if (isVirtualColumn) {
      const legendX = leftX + columns.length * (colW + columnGap);
      const legendW = width - legendX - 7;
      const legendColumn = svg.append("g")
        .attr("class", "kanban-assignee-legend kanban-assignee-legend-column")
        .attr("data-legend-mode", legendMode)
        .attr("data-legend-placement", "virtual-column")
        .attr("data-display-height", unifiedColumnH)
        .attr("transform", `translate(${legendX},${boardY})`);
      legendColumn.append("rect")
        .attr("width", legendW)
        .attr("height", unifiedColumnH)
        .attr("fill", palette.gray50)
        .attr("stroke", palette.gray200);
      legendColumn.append("rect")
        .attr("width", legendW)
        .attr("height", headerH)
        .attr("fill", palette.gray800)
        .attr("fill-opacity", .9);
      legendColumn.append("text")
        .attr("class", "reverse-label")
        .attr("x", legendW / 2)
        .attr("y", 16)
        .attr("text-anchor", "middle")
        .attr("font-size", 10.5)
        .attr("font-weight", 850)
        .text("Team");
      const chips = legendColumn.selectAll("g.legend-chip")
        .data(people)
        .join("g")
        .attr("class", "legend-chip")
        .attr("data-person-id", d => d.id)
        .attr("data-legend-placement", "virtual-column")
        .attr("transform", (_, i) => `translate(17,${headerH + 22 + i * 36})`);
      drawLegendChips(chips, { radius: 8.8, idFontSize: 6.4, nameX: 14, nameY: 3.6, nameFontSize: 9.7 });
      revealIn(legendColumn, .1, .34);
    }

    const counts = new Map();
    const offsets = new Map();
    const indexed = sizedTasks.map(task => {
      const order = counts.get(task.col) || 0;
      const offset = offsets.get(task.col) || 0;
      counts.set(task.col, order + 1);
      offsets.set(task.col, offset + task.cardH + cardGap);
      const column = colById.get(task.col);
      return {
        ...task,
        x: column.x + 4,
        y: boardY + headerH + 8 + offset,
        columnOrder: columnOrder.get(task.col),
        order
      };
    });
    [...indexed]
      .sort((a, b) => d3.ascending(a.x, b.x) || d3.ascending(a.y, b.y))
      .forEach((task, revealOrder) => {
        task.revealOrder = revealOrder;
      });
    const cardRevealStart = .66;
    const cardRevealGap = .115;
    const cardGroups = svg.append("g").selectAll("g.kanban-assignee-card").data(indexed).join("g")
      .attr("class", "kanban-assignee-card")
      .attr("data-column", d => d.col)
      .attr("data-column-order", d => d.columnOrder)
      .attr("data-task-order", d => d.order)
      .attr("data-reveal-order", d => d.revealOrder)
      .attr("data-reveal-begin-ms", d => Math.round((cardRevealStart + d.revealOrder * cardRevealGap) * 1000))
      .attr("data-task-title", d => d.title)
      .attr("data-expected-lines", d => d.expectedLines || d.lineCount)
      .attr("data-card-height", d => d.cardH)
      .attr("data-assignees", d => d.assignees.join(","))
      .attr("transform", d => `translate(${d.x},${d.y})`);
    cardGroups.append("rect")
      .attr("width", cardW)
      .attr("height", d => d.cardH)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.15);
    cardGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", titleX)
      .attr("font-size", titleFontSize)
      .attr("font-weight", titleFontWeight)
      .each(function (task) {
        wrapKanbanTitle(d3.select(this), task.titleLines);
      });
    cardGroups.each(function (task) {
      const stack = d3.select(this).append("g").attr("class", "assignee-dots");
      const dots = task.assignees.map((id, index) => ({
        ...personById.get(id),
        x: cardW - dotRight - (task.assignees.length - 1 - index) * dotSpacing
      }));
      const dotGroups = stack.selectAll("g.assignee-dot").data(dots).join("g")
        .attr("class", "assignee-dot")
        .attr("transform", d => `translate(${d.x},${task.cardH - 11.5})`);
      dotGroups.append("circle")
        .attr("fill", d => d.color)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.6);
      grow(dotGroups.selectAll("circle"), "r", 2, dotRadius, cardRevealStart + task.revealOrder * cardRevealGap + .2, .32);
      dotGroups.append("text")
        .attr("fill", palette.surface)
        .attr("x", 0)
        .attr("y", 2.9)
        .attr("text-anchor", "middle")
        .attr("font-size", dotFontSize)
        .attr("font-weight", 900)
        .text(d => d.id);
    });
    revealIn(cardGroups, d => cardRevealStart + d.revealOrder * cardRevealGap, .32);

    if (isDistributed) {
      const placements = people.map((person, index) => {
        const column = columns[index % columns.length];
        return {
          ...person,
          column: column.id,
          x: column.x + 13,
          y: boardY + unifiedColumnH - 16
        };
      });
      const legendGroup = svg.append("g")
        .attr("class", "kanban-assignee-legend")
        .attr("data-legend", "assignee")
        .attr("data-legend-mode", legendMode);
      const legend = legendGroup.selectAll("g.legend-chip")
        .data(placements)
        .join("g")
        .attr("class", "legend-chip")
        .attr("data-person-id", d => d.id)
        .attr("data-column", d => d.column)
        .attr("data-legend-placement", "column-footer")
        .attr("transform", d => `translate(${d.x},${d.y})`);
      drawLegendChips(legend, { radius: 8.8, idFontSize: 6.4, nameX: 15, nameY: 3.7, nameFontSize: 9.5, delay: .12 });
      revealIn(legendGroup, .12, .3);
    }
  }

  function renderD3UserJourney() {
    const svg = prepareSvg("user-journey", "D3 user journey", "A journey diagram rendered as scored steps and actor participation.");
    const steps = [
      { section: "Discover", label: "Open", score: 4, actors: ["R"] },
      { section: "Discover", label: "Pick", score: 5, actors: ["R"] },
      { section: "Inspect", label: "Colors", score: 5, actors: ["R", "M"] },
      { section: "Inspect", label: "Shapes", score: 4, actors: ["R"] },
      { section: "Reuse", label: "Copy", score: 5, actors: ["M"] },
      { section: "Reuse", label: "Palette", score: 3, actors: ["M"] }
    ];
    const x = d3.scalePoint().domain(d3.range(steps.length)).range([58, 512]);
    const y = d3.scaleLinear().domain([1, 5]).range([318, 104]);
    const sectionColors = { Discover: palette.blueHighlight, Inspect: palette.greenHighlight, Reuse: palette.purpleHighlight };
    const line = d3.line().x((_, i) => x(i)).y(d => y(d.score)).curve(d3.curveMonotoneX);
    const sections = d3.groups(steps, d => d.section).map(([section, values]) => {
      const indexes = values.map(d => steps.indexOf(d));
      return { section, x0: x(d3.min(indexes)) - 36, x1: x(d3.max(indexes)) + 36 };
    });
    svg.append("g").selectAll("rect.journey-section").data(sections).join("rect")
      .attr("class", "journey-section")
      .attr("x", d => d.x0)
      .attr("y", 54)
      .attr("width", d => d.x1 - d.x0)
      .attr("height", 34)
      .attr("rx", 8)
      .attr("fill", d => sectionColors[d.section])
      .attr("stroke", palette.surface);
    svg.append("g").selectAll("text.journey-section-label").data(sections).join("text")
      .attr("class", "mark-label")
      .attr("x", d => (d.x0 + d.x1) / 2)
      .attr("y", 76)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .text(d => d.section);
    svg.append("g").attr("class", "axis").attr("transform", "translate(0,0)").call(d3.axisLeft(y).tickValues([1, 2, 3, 4, 5])).attr("transform", "translate(36,0)");
    const path = svg.append("path").datum(steps).attr("d", line).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(path, .18, .95);
    const groups = svg.append("g").selectAll("g.journey-step").data(steps).join("g")
      .attr("class", "journey-step")
      .attr("transform", (d, i) => `translate(${x(i)},${y(d.score)})`);
    const circles = groups.append("circle").attr("fill", d => d.score >= 5 ? palette.green : d.score <= 3 ? palette.red : palette.orange).attr("stroke", palette.surface).attr("stroke-width", 2.2);
    grow(circles, "r", 4, 13, .35, .45);
    groups.append("text").attr("class", "reverse-label").attr("text-anchor", "middle").attr("dy", 4).attr("font-weight", 800).text(d => d.score);
    svg.append("g").selectAll("text.journey-label").data(steps).join("text")
      .attr("class", "label")
      .attr("x", (_, i) => x(i))
      .attr("y", 356)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .attr("font-weight", 800)
      .text(d => d.label);
    const actorMarks = svg.append("g").selectAll("g.journey-actors").data(steps).join("g")
      .attr("class", "journey-actors")
      .attr("transform", (d, i) => `translate(${x(i)},378)`);
    actorMarks.each(function (d) {
      const group = d3.select(this);
      d.actors.forEach((actor, i) => {
        const cx = (i - (d.actors.length - 1) / 2) * 18;
        group.append("circle").attr("cx", cx).attr("cy", 0).attr("r", 8).attr("fill", actor === "R" ? palette.blueHighlight : palette.purpleHighlight).attr("stroke", actor === "R" ? palette.blue : palette.purple);
        group.append("text").attr("class", "mark-label").attr("x", cx).attr("y", 4).attr("text-anchor", "middle").style("font-size", "9px").attr("font-weight", 800).text(actor);
      });
    });
  }

  function renderParallelCoordinates() {
    const svg = prepareSvg("parallel-coordinates", "Parallel coordinates", "Multiple numeric dimensions drawn as connected axes.");
    const dims = ["Speed", "Cost", "Quality", "Risk", "Reach"];
    const rows = [
      { name: "A", values: [82, 35, 76, 42, 66] }, { name: "B", values: [58, 62, 64, 38, 74] },
      { name: "C", values: [70, 47, 88, 58, 52] }, { name: "D", values: [45, 72, 55, 66, 86] }
    ];
    const x = d3.scalePoint().domain(dims).range([58, width - 44]);
    const y = d3.scaleLinear().domain([0, 100]).range([330, 62]);
    const line = d3.line().x((d, i) => x(dims[i])).y(d => y(d)).curve(d3.curveMonotoneX);
    dims.forEach(dim => {
      svg.append("g").attr("class", "axis").attr("transform", `translate(${x(dim)},0)`).call(d3.axisLeft(y).ticks(4));
      svg.append("text").attr("class", "mark-label").attr("x", x(dim)).attr("y", 42).attr("text-anchor", "middle").text(dim);
    });
    const paths = svg.append("g").attr("fill", "none").attr("stroke-width", 2.4).selectAll("path").data(rows).join("path")
      .attr("d", d => line(d.values)).attr("stroke", (d, i) => colors[i]).attr("stroke-opacity", .78);
    drawPath(paths, .15, .95);
  }

  function renderBubbleScatter() {
    const svg = prepareSvg("bubble-scatter", "Bubble scatter", "D3 scatterplot using radius and color encodings.");
    const data = d3.range(24).map(i => ({ x: 20 + i * 3 + (i % 4) * 8, y: 40 + Math.sin(i * .7) * 18 + (i % 5) * 9, r: 5 + (i % 6) * 2, group: i % 3 }));
    const margin = { top: 34, right: 36, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain([15, 120]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([15, 100]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("fill", d => colors[d.group]).attr("fill-opacity", .78).attr("stroke", "#fff");
    grow(dots, "r", 1, d => d.r, .08, .7);
  }

  function renderPointCloud() {
    const svg = prepareSvg("point-cloud", "Point cloud", "A deterministic gray point cloud densest along a horizontal line near the top.");
    const rng = d3.randomLcg(0.84);
    const normal = d3.randomNormal.source(rng)(0, 1);
    const density = {
      count: 86,
      coreShare: .7,
      midShare: .22,
      coreSpread: 8,
      midSpread: 22,
      outerSpread: 42,
      collisionRatio: .62
    };
    const lineY = height * .3;
    const lineStart = [72, lineY];
    const lineEnd = [width - 72, lineY];
    const lineDx = lineEnd[0] - lineStart[0];
    const lineDy = lineEnd[1] - lineStart[1];
    const lineLength = Math.hypot(lineDx, lineDy);
    const ux = lineDx / lineLength;
    const uy = lineDy / lineLength;
    const px = -uy;
    const py = ux;
    const points = d3.range(density.count).map(i => {
      const roll = rng();
      const spread = roll < density.coreShare
        ? density.coreSpread
        : roll < density.coreShare + density.midShare
          ? density.midSpread
          : density.outerSpread;
      const t = .04 + rng() * .92;
      const along = normal() * 10;
      const away = normal() * spread;
      const baseX = lineStart[0] + lineDx * t;
      const baseY = lineStart[1] + lineDy * t;
      const targetX = baseX + ux * along + px * away;
      const targetY = baseY + uy * along + py * away;
      return {
        id: i,
        targetX,
        targetY,
        x: targetX + normal() * 16,
        y: targetY + normal() * 10,
        r: 3.6 + rng() * 4.6
      };
    });
    const simulation = d3.forceSimulation(points)
      .randomSource(d3.randomLcg(0.42))
      .force("x", d3.forceX(d => d.targetX).strength(.42))
      .force("y", d3.forceY(d => d.targetY).strength(.42))
      .force("collide", d3.forceCollide(d => d.r * density.collisionRatio).strength(.38).iterations(1))
      .stop();
    for (let i = 0; i < 90; i += 1) simulation.tick();
    points.forEach(d => {
      d.x = Math.max(52 + d.r, Math.min(width - 52 - d.r, d.x));
      d.y = Math.max(52 + d.r, Math.min(height - 52 - d.r, d.y));
    });
    const floatRng = d3.randomLcg(0.27);
    points.forEach(d => {
      d.floatDx = (floatRng() < .5 ? -1 : 1) * (2.4 + floatRng() * 4.2);
      d.floatDy = (floatRng() < .5 ? -1 : 1) * (2 + floatRng() * 3.8);
      d.floatDur = 4.6 + floatRng() * 4.4;
      d.floatBegin = -floatRng() * d.floatDur;
    });
    const dots = svg.append("g").selectAll("circle").data(points, d => d.id).join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.r)
      .attr("fill", palette.gray200)
      .attr("fill-opacity", .9);
    dots.each(function (d) {
      const dot = d3.select(this);
      dot.append("animate")
        .attr("attributeName", "cx")
        .attr("values", `${d.x};${d.x + d.floatDx};${d.x - d.floatDx * .55};${d.x}`)
        .attr("dur", `${d.floatDur}s`)
        .attr("begin", `${d.floatBegin}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".42 0 .58 1;.42 0 .58 1;.42 0 .58 1")
        .attr("repeatCount", "indefinite");
      dot.append("animate")
        .attr("attributeName", "cy")
        .attr("values", `${d.y};${d.y + d.floatDy};${d.y - d.floatDy * .6};${d.y}`)
        .attr("dur", `${d.floatDur * (1.08 + (d.id % 5) * .025)}s`)
        .attr("begin", `${d.floatBegin - (d.id % 7) * .19}s`)
        .attr("calcMode", "spline")
        .attr("keySplines", ".42 0 .58 1;.42 0 .58 1;.42 0 .58 1")
        .attr("repeatCount", "indefinite");
    });
  }

  function renderConnectedScatter() {
    const svg = prepareSvg("connected-scatter", "Connected scatter", "A D3 line through paired measures over time.");
    const data = d3.range(10).map(i => ({ t: i, x: 20 + i * 8 + Math.sin(i) * 5, y: 25 + i * 6 + Math.cos(i * .8) * 16 }));
    const margin = { top: 34, right: 36, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain([15, 100]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([10, 100]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveCatmullRom);
    const path = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.purple).attr("stroke-width", 3);
    drawPath(path, .1, 1);
    svg.append("g").selectAll("circle").data(data).join("circle").attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", 5).attr("fill", palette.orange);
  }

  function renderHistogram() {
    const svg = prepareSvg("histogram", "Histogram", "D3 bins continuous values into frequency bars.");
    const values = d3.range(90).map(i => 42 + Math.sin(i * .31) * 18 + Math.cos(i * .17) * 13 + (i % 7));
    const margin = { top: 34, right: 28, bottom: 48, left: 48 };
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, width - margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(12)(values);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const bars = svg.append("g").selectAll("rect").data(bins).join("rect")
      .attr("x", d => x(d.x0) + 1).attr("y", d => y(d.length)).attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 2))
      .attr("height", d => y(0) - y(d.length)).attr("fill", palette.blue).attr("rx", 2);
    fadeIn(bars, .05, .7);
  }

  function renderSketchyLineChart() {
    const svg = prepareSvg("sketchy-line-chart", "Sketchy line chart", "A connected scatter path is drawn with deterministic rough strokes.");
    const data = d3.range(10).map(i => ({ t: i, x: 20 + i * 8 + Math.sin(i) * 5, y: 25 + i * 6 + Math.cos(i * .8) * 16 }));
    const margin = { top: 36, right: 36, bottom: 52, left: 58 };
    const x = d3.scaleLinear().domain([15, 100]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([10, 100]).range([height - margin.bottom, margin.top]);

    x.ticks(5).forEach((tick, i) => {
      appendSketchStroke(svg, [[x(tick), margin.top], [x(tick), height - margin.bottom]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .62,
        seed: 620 + i,
        roughness: .75,
        delay: .02,
        dur: .45
      });
    });
    y.ticks(4).forEach((tick, i) => {
      appendSketchStroke(svg, [[margin.left, y(tick)], [width - margin.right, y(tick)]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .62,
        seed: 640 + i,
        roughness: .75,
        delay: .02,
        dur: .45
      });
    });
    appendSketchHorizontalAxis(svg, x, height - margin.bottom, 5, 660);
    appendSketchVerticalAxis(svg, y, margin.left, 4, 680);

    const points = data.map(d => [x(d.x), y(d.y)]);
    appendSketchStroke(svg, points, {
      stroke: palette.purple,
      strokeWidth: 3.4,
      opacity: .94,
      seed: 700,
      roughness: 2.2,
      curve: d3.curveCatmullRom.alpha(.55),
      delay: .18,
      dur: 1.25
    });
    data.forEach((d, i) => {
      appendSketchBlob(svg, x(d.x), y(d.y), 6.4, {
        fill: palette.orange,
        fillOpacity: .78,
        stroke: palette.surface,
        strokeWidth: 1.3,
        seed: 730 + i * 11,
        delay: .34 + i * .035,
        dur: .5
      });
    });
  }

  function renderSketchyHistogram() {
    const svg = prepareSvg("sketchy-histogram", "Sketchy histogram", "Continuous values are binned into rough marker-like rectangles.");
    const values = d3.range(90).map(i => 42 + Math.sin(i * .31) * 18 + Math.cos(i * .17) * 13 + (i % 7));
    const margin = { top: 38, right: 30, bottom: 52, left: 52 };
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, width - margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(12)(values);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([height - margin.bottom, margin.top]);

    y.ticks(4).forEach((tick, i) => {
      appendSketchStroke(svg, [[margin.left, y(tick)], [width - margin.right, y(tick)]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .6,
        seed: 760 + i,
        roughness: .65,
        delay: .02,
        dur: .45
      });
    });
    appendSketchHorizontalAxis(svg, x, height - margin.bottom, 5, 780);
    appendSketchVerticalAxis(svg, y, margin.left, 4, 800);

    bins.forEach((bin, i) => {
      const barX = x(bin.x0) + 2;
      const barY = y(bin.length);
      const barW = Math.max(2, x(bin.x1) - x(bin.x0) - 4);
      const barH = y(0) - y(bin.length);
      appendSketchRect(svg, barX, barY, barW, barH, {
        fill: palette.blueHighlight,
        fillOpacity: .64,
        stroke: palette.blue,
        strokeWidth: 1.8,
        seed: 830 + i * 13,
        roughness: 1.35,
        delay: .1 + i * .025,
        dur: .58,
        hachureStroke: palette.blueHover,
        hachureOpacity: .22,
        hachureSpacing: 10
      });
    });
  }

  function renderSketchyBeeswarm() {
    const svg = prepareSvg("sketchy-beeswarm", "Sketchy beeswarm", "Individual observations settle into grouped swarms with seeded rough dots.");
    const data = [
      ["Baseline", 34], ["Baseline", 41], ["Baseline", 46], ["Baseline", 52], ["Baseline", 57], ["Baseline", 63], ["Baseline", 69], ["Baseline", 74],
      ["Pilot", 39], ["Pilot", 48], ["Pilot", 54], ["Pilot", 59], ["Pilot", 67], ["Pilot", 73], ["Pilot", 81], ["Pilot", 86],
      ["Scaled", 45], ["Scaled", 53], ["Scaled", 61], ["Scaled", 68], ["Scaled", 76], ["Scaled", 83], ["Scaled", 88], ["Scaled", 92]
    ].map((d, i) => ({ id: `sp${i}`, group: d[0], score: d[1] }));
    const margin = { top: 42, right: 30, bottom: 58, left: 84 };
    const x = d3.scaleLinear().domain([30, 95]).range([margin.left, width - margin.right]);
    const y = d3.scalePoint().domain(["Baseline", "Pilot", "Scaled"]).range([96, 302]).padding(.5);
    const groupColor = new Map([["Baseline", palette.blue], ["Pilot", palette.orange], ["Scaled", palette.green]]);
    const nodes = data.map(d => ({ ...d, x: x(d.score), y: y(d.group) }));
    const simulation = d3.forceSimulation(nodes).randomSource(d3.randomLcg(0.42))
      .force("x", d3.forceX(d => x(d.score)).strength(.95))
      .force("y", d3.forceY(d => y(d.group)).strength(.25))
      .force("collide", d3.forceCollide(11)).stop();
    for (let i = 0; i < 160; i += 1) simulation.tick();

    x.ticks(6).forEach((tick, i) => {
      appendSketchStroke(svg, [[x(tick), 76], [x(tick), 322]], {
        stroke: palette.gray100,
        strokeWidth: 1,
        opacity: .62,
        seed: 860 + i,
        roughness: .65,
        delay: .02,
        dur: .45
      });
    });
    appendSketchHorizontalAxis(svg, x, 322, 6, 880);
    y.domain().forEach((group, i) => {
      appendSketchStroke(svg, [[margin.left, y(group)], [width - margin.right, y(group)]], {
        stroke: palette.gray200,
        strokeWidth: 1.25,
        opacity: .56,
        seed: 900 + i,
        roughness: .9,
        delay: .04,
        dur: .5
      });
      svg.append("text")
        .attr("class", "label")
        .attr("x", margin.left - 18)
        .attr("y", y(group) + 4)
        .attr("text-anchor", "end")
        .text(group);
    });

    nodes.sort((a, b) => a.score - b.score).forEach((d, i) => {
      appendSketchBlob(svg, d.x, d.y, 8.6, {
        fill: groupColor.get(d.group),
        fillOpacity: .72,
        stroke: palette.surface,
        strokeWidth: 1.2,
        seed: 930 + i * 17,
        roughness: .18,
        edgeRoughness: 1.15,
        delay: .12 + i * .018,
        dur: .5
      });
    });
  }

  function renderSketchyStreamgraph() {
    const svg = prepareSvg("sketchy-streamgraph", "Sketchy streamgraph", "Stacked areas keep their data shape while rendered as rough filled bands.");
    const keys = ["Search", "Assist", "Automate", "Review"];
    const color = d3.scaleOrdinal(keys, [palette.blue, palette.green, palette.orange, palette.purple]);
    const data = d3.range(12).map(i => ({
      month: i,
      Search: 20 + Math.sin(i / 1.6) * 8 + i * 1.2,
      Assist: 18 + Math.cos(i / 2.2) * 7 + i * .8,
      Automate: 10 + Math.sin(i / 1.3 + 1) * 6 + i * 1.4,
      Review: 12 + Math.cos(i / 1.9 + 2) * 5 + i * .5
    }));
    const margin = { top: 42, right: 34, bottom: 50, left: 30 };
    const series = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(data);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.month)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear()
      .domain([d3.min(series, s => d3.min(s, d => d[0])), d3.max(series, s => d3.max(s, d => d[1]))])
      .range([height - margin.bottom, margin.top]);

    appendSketchHorizontalAxis(svg, x, height - margin.bottom, 6, 980);
    const legend = svg.append("g").attr("transform", "translate(46,24)");
    keys.forEach((key, i) => {
      const lx = i * 118;
      appendSketchStroke(legend, [[lx, 0], [lx + 20, 0]], {
        stroke: color(key),
        strokeWidth: 3.4,
        seed: 990 + i * 13,
        roughness: .7,
        delay: .04,
        dur: .45
      });
      legend.append("text")
        .attr("class", "caption")
        .attr("x", lx + 27)
        .attr("y", 4)
        .attr("font-weight", 700)
        .text(key);
    });
    series.forEach((layer, layerIndex) => {
      const top = layer.map(d => [x(d.data.month), y(d[1])]);
      const bottom = layer.slice().reverse().map(d => [x(d.data.month), y(d[0])]);
      const areaPoints = top.concat(bottom);
      const layerColor = color(layer.key);
      appendSketchClosedShape(svg, areaPoints, {
        fill: layerColor,
        fillOpacity: .42,
        stroke: d3.color(layerColor).darker(.55).formatHex(),
        strokeWidth: 2,
        seed: 1000 + layerIndex * 41,
        roughness: 2.1,
        delay: .1 + layerIndex * .08,
        dur: .78
      });
    });
  }

  function renderSketchyTreemap() {
    const svg = prepareSvg("sketchy-treemap", "Sketchy treemap", "Nested area allocation is rendered with rough rectangular cells.");
    const root = d3.hierarchy(hierarchyData()).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
    d3.treemap().size([width - 50, height - 62]).paddingOuter(6).paddingTop(22).paddingInner(4).round(true)(root);
    const g = svg.append("g").attr("transform", "translate(25,31)");
    const color = d3.scaleOrdinal(root.children.map(d => d.data.name), colors);
    const branchName = d => d.depth === 1 ? d.data.name : d.parent.data.name;
    const nodes = root.descendants().filter(d => d.depth);
    nodes.filter(d => d.children).forEach((d, i) => {
      appendSketchRect(g, d.x0, d.y0, Math.max(0, d.x1 - d.x0), Math.max(0, d.y1 - d.y0), {
        fill: color(branchName(d)),
        fillOpacity: .13,
        stroke: d3.color(color(branchName(d))).darker(.75).formatHex(),
        strokeWidth: 1.5,
        seed: 1060 + i * 23,
        roughness: 1.5,
        delay: .08 + i * .04,
        dur: .62,
        hachure: false
      });
    });
    nodes.filter(d => !d.children).forEach((d, i) => {
      const w = Math.max(0, d.x1 - d.x0);
      const h = Math.max(0, d.y1 - d.y0);
      appendSketchRect(g, d.x0, d.y0, w, h, {
        fill: color(branchName(d)),
        fillOpacity: .54,
        stroke: d3.color(color(branchName(d))).darker(.72).formatHex(),
        strokeWidth: 1.6,
        seed: 1100 + i * 29,
        roughness: 1.55,
        delay: .18 + i * .035,
        dur: .58,
        hachureStroke: d3.color(color(branchName(d))).darker(.75).formatHex(),
        hachureOpacity: .16,
        hachureSpacing: 14
      });
      if (w > 56 && h > 26) {
        g.append("text")
          .attr("class", "mark-label")
          .attr("x", d.x0 + 7)
          .attr("y", d.y0 + 18)
          .attr("font-size", 11.5)
          .text(d.data.name);
      }
    });
    nodes.filter(d => d.children && (d.x1 - d.x0) > 70).forEach(d => {
      g.append("text")
        .attr("class", "label")
        .attr("x", d.x0 + 8)
        .attr("y", d.y0 + 16)
        .attr("font-weight", 800)
        .text(d.data.name);
    });
  }

  function gemmaComparisonData() {
    // Current-source examples: benchmark/spec and memory data come from Google Gemma 4 docs.
    // VM prices are approximate on-demand examples and should be refreshed before budgeting.
    const tokens = {
      e4b: palette.blue,
      e4bLight: palette.blueHighlight,
      large: palette.purple,
      largeLight: palette.purpleHighlight,
      grid: palette.gray100,
      axis: palette.gray400,
      connector: palette.gray400,
      sketchPanel: palette.gray50,
      sketchPanelStroke: palette.gray300,
      panel: palette.surface,
      panelStroke: palette.gray200,
      q4Fill: palette.gray100,
      q4Stroke: palette.gray600,
      costFill: palette.orangeHighlight,
      costStroke: palette.orange
    };
    const models = [
      {
        id: "e4b",
        name: "Gemma 4 E4B",
        short: "E4B",
        params: "4.5B eff / 8B total",
        context: "128K ctx",
        modalities: "text image audio",
        bf16: 17.9,
        q4: 4.5,
        hardware: "L4 24GB",
        instance: "g2-standard-4",
        cost: .707,
        color: tokens.e4b,
        light: tokens.e4bLight,
        metrics: { mmlu: 69.4, gpqa: 58.6, code: 52.0, aime: 42.5 }
      },
      {
        id: "31b",
        name: "Gemma 4 31B",
        short: "31B",
        params: "30.7B dense",
        context: "256K ctx",
        modalities: "text image",
        bf16: 69.9,
        q4: 17.5,
        hardware: "A100 80GB",
        instance: "a2-ultragpu-1g",
        cost: 5.058,
        color: tokens.large,
        light: tokens.largeLight,
        metrics: { mmlu: 85.2, gpqa: 84.3, code: 80.0, aime: 89.2 }
      }
    ];
    const metricRows = [
      { key: "mmlu", label: "MMLU Pro" },
      { key: "gpqa", label: "GPQA" },
      { key: "code", label: "LiveCode" },
      { key: "aime", label: "AIME" }
    ];
    return { models, metricRows, tokens };
  }

  function renderSketchyGemmaComparison() {
    const svg = prepareSvg("sketchy-gemma-comparison", "Sketchy Gemma comparison", "Two Google Gemma model sizes compared by benchmark score, memory footprint, hardware fit, and estimated GPU VM cost.");
    const { models, metricRows, tokens } = gemmaComparisonData();
    const score = d3.scaleLinear().domain([35, 92]).range([152, 498]);
    const mem = d3.scaleLinear().domain([0, 80]).range([0, 118]);
    const price = d3.scaleLinear().domain([0, 6]).range([0, 118]);
    const fmtScore = d3.format(".1f");

    const topCards = [
      { model: models[0], x: 42, y: 28, w: 224, h: 76 },
      { model: models[1], x: 294, y: 28, w: 224, h: 76 }
    ];
    topCards.forEach((card, i) => {
      appendSketchRect(svg, card.x, card.y, card.w, card.h, {
        fill: card.model.light,
        fillOpacity: .36,
        stroke: card.model.color,
        strokeWidth: 1.7,
        seed: 1360 + i * 31,
        roughness: 1.2,
        delay: .03 + i * .04,
        dur: .58,
        hachure: false
      });
      const text = svg.append("g").attr("transform", `translate(${card.x + 14},${card.y + 22})`);
      text.append("text")
        .attr("class", "mark-label")
        .attr("font-size", 14)
        .attr("font-weight", 800)
        .attr("fill", card.model.color)
        .text(card.model.name);
      text.append("text")
        .attr("class", "caption")
        .attr("y", 22)
        .text(`${card.model.params} / ${card.model.context}`);
      text.append("text")
        .attr("class", "caption")
        .attr("y", 42)
        .text(card.model.modalities);
      fadeIn(text.selectAll("text"), .08 + i * .05, .48);
    });

    metricRows.forEach((row, i) => {
      const y = 142 + i * 32;
      appendSketchStroke(svg, [[score(35), y], [score(92), y]], {
        stroke: tokens.grid,
        strokeWidth: 1.1,
        opacity: .78,
        seed: 1420 + i,
        roughness: .55,
        delay: .08,
        dur: .44
      });
      svg.append("text")
        .attr("class", "label")
        .attr("x", 52)
        .attr("y", y + 4)
        .attr("font-size", 11.4)
        .text(row.label);
      appendSketchStroke(svg, models.map(model => [score(model.metrics[row.key]), y]), {
        stroke: tokens.connector,
        strokeWidth: 1.45,
        opacity: .7,
        seed: 1460 + i * 13,
        roughness: .9,
        delay: .22 + i * .08,
        dur: .55
      });
      models.forEach((model, mi) => {
        const x = score(model.metrics[row.key]);
        appendSketchBlob(svg, x, y, 5.7, {
          fill: model.color,
          fillOpacity: .84,
          stroke: palette.surface,
          strokeWidth: 1.1,
          seed: 1500 + i * 29 + mi * 11,
          roughness: .12,
          edgeRoughness: .72,
          delay: .32 + i * .08 + mi * .04,
          dur: .42
        });
        svg.append("text")
          .attr("class", "caption")
          .attr("x", x + (mi === 0 ? -9 : 9))
          .attr("y", y + (mi === 0 ? -8 : 15))
          .attr("text-anchor", mi === 0 ? "end" : "start")
          .attr("font-size", 10.2)
          .attr("font-weight", 700)
          .attr("fill", model.color)
          .text(fmtScore(model.metrics[row.key]));
      });
    });
    [40, 60, 80].forEach((tick, i) => {
      const x = score(tick);
      appendSketchStroke(svg, [[x, 270], [x, 278]], {
        stroke: tokens.axis,
        strokeWidth: 1,
        seed: 1580 + i,
        roughness: .45,
        delay: .18,
        dur: .35
      });
      svg.append("text")
        .attr("class", "caption")
        .attr("x", x)
        .attr("y", 294)
        .attr("text-anchor", "middle")
        .attr("font-size", 10.5)
        .text(tick);
    });
    appendSketchStroke(svg, [[score(35), 274], [score(92), 274]], {
      stroke: tokens.axis,
      strokeWidth: 1.1,
      seed: 1590,
      roughness: .6,
      delay: .14,
      dur: .45
    });
    svg.append("text")
      .attr("class", "caption")
      .attr("x", 502)
      .attr("y", 294)
      .attr("text-anchor", "end")
      .attr("font-size", 10.5)
      .text("score %");

    const footprintCards = [
      { model: models[0], x: 42, y: 316, w: 224, h: 70 },
      { model: models[1], x: 294, y: 316, w: 224, h: 70 }
    ];
    footprintCards.forEach((card, i) => {
      appendSketchRect(svg, card.x, card.y, card.w, card.h, {
        fill: tokens.sketchPanel,
        fillOpacity: .9,
        stroke: tokens.sketchPanelStroke,
        strokeWidth: 1.3,
        seed: 1620 + i * 31,
        roughness: 1.05,
        delay: .46 + i * .04,
        dur: .52,
        hachure: false
      });
      const barX = card.x + 58;
      const rows = [
        { label: "BF16", value: card.model.bf16, max: mem, suffix: " GB", y: card.y + 20, fill: card.model.light, stroke: card.model.color },
        { label: "Q4", value: card.model.q4, max: mem, suffix: " GB", y: card.y + 40, fill: tokens.q4Fill, stroke: tokens.q4Stroke },
        { label: "VM", value: card.model.cost, max: price, suffix: "/h", y: card.y + 60, fill: tokens.costFill, stroke: tokens.costStroke }
      ];
      rows.forEach((row, ri) => {
        svg.append("text")
          .attr("class", "caption")
          .attr("x", card.x + 14)
          .attr("y", row.y + 4)
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label);
        appendSketchRect(svg, barX, row.y - 8, row.max(row.value), 10, {
          fill: row.fill,
          fillOpacity: .72,
          stroke: row.stroke,
          strokeWidth: 1.1,
          seed: 1680 + i * 41 + ri * 11,
          roughness: .55,
          delay: .54 + i * .04 + ri * .05,
          dur: .42,
          hachure: false
        });
        svg.append("text")
          .attr("class", "caption")
          .attr("x", card.x + card.w - 14)
          .attr("y", row.y + 4)
          .attr("text-anchor", "end")
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label === "VM" ? `$${row.value.toFixed(row.value < 1 ? 3 : 2)}${row.suffix}` : `${row.value}${row.suffix}`);
      });
      svg.append("text")
        .attr("class", "caption")
        .attr("x", card.x + card.w - 14)
        .attr("y", card.y - 7)
        .attr("text-anchor", "end")
        .attr("font-size", 10.4)
        .attr("font-weight", 700)
        .attr("fill", card.model.color)
        .text(`${card.model.hardware} / ${card.model.instance}`);
    });
  }

  function renderGemmaComparison() {
    const svg = prepareSvg("gemma-comparison", "Gemma model comparison", "Two Google Gemma model sizes compared by benchmark score, memory footprint, hardware fit, and estimated GPU VM cost.");
    const { models, metricRows, tokens } = gemmaComparisonData();
    const score = d3.scaleLinear().domain([35, 92]).range([150, 502]);
    const mem = d3.scaleLinear().domain([0, 80]).range([0, 120]);
    const price = d3.scaleLinear().domain([0, 6]).range([0, 120]);
    const fmtScore = d3.format(".1f");

    const modelCards = [
      { model: models[0], x: 38, y: 30, w: 232, h: 78 },
      { model: models[1], x: 290, y: 30, w: 232, h: 78 }
    ];
    const cards = svg.append("g").selectAll("g.model-card")
      .data(modelCards)
      .join("g")
      .attr("class", "model-card");
    cards.append("rect")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 7)
      .attr("fill", tokens.panel)
      .attr("fill-opacity", .88)
      .attr("stroke", tokens.panelStroke)
      .attr("stroke-width", .85);
    cards.append("circle")
      .attr("cx", d => d.x + 15)
      .attr("cy", d => d.y + 23)
      .attr("r", 3.8)
      .attr("fill", d => d.model.color)
      .each(function (d, i) {
        d3.select(this).append("animate")
          .attr("attributeName", "r")
          .attr("from", 0)
          .attr("to", 3.8)
          .attr("dur", ".38s")
          .attr("begin", `${.05 + i * .08}s`)
          .attr("fill", "freeze");
      });
    cards.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x + 25)
      .attr("y", d => d.y + 27)
      .attr("font-size", 14)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.model.name);
    cards.append("text")
      .attr("class", "caption")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + 47)
      .attr("font-size", 10.8)
      .text(d => `${d.model.params} / ${d.model.context}`);
    cards.append("text")
      .attr("class", "caption")
      .attr("x", d => d.x + 14)
      .attr("y", d => d.y + 65)
      .attr("font-size", 10.8)
      .text(d => d.model.modalities);
    fadeIn(cards.selectAll("rect, text"), .04, .48);

    const benchmarkGroup = svg.append("g");
    metricRows.forEach((row, i) => {
      const y = 144 + i * 32;
      benchmarkGroup.append("line")
        .attr("x1", score(35))
        .attr("x2", score(92))
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", tokens.grid)
        .attr("stroke-width", 1);
      benchmarkGroup.append("text")
        .attr("class", "label")
        .attr("x", 50)
        .attr("y", y + 4)
        .attr("font-size", 11.2)
        .text(row.label);
      const connector = benchmarkGroup.append("path")
        .attr("d", `M${score(models[0].metrics[row.key])},${y}L${score(models[1].metrics[row.key])},${y}`)
        .attr("fill", "none")
        .attr("stroke", tokens.connector)
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round");
      drawPath(connector, .18 + i * .07, .48);
      models.forEach((model, mi) => {
        const x = score(model.metrics[row.key]);
        const dot = benchmarkGroup.append("circle")
          .attr("cx", x)
          .attr("cy", y)
          .attr("r", 5.8)
          .attr("fill", model.color)
          .attr("stroke", palette.surface)
          .attr("stroke-width", 1.2);
        dot.append("animate")
          .attr("attributeName", "r")
          .attr("from", 0)
          .attr("to", 5.8)
          .attr("dur", ".38s")
          .attr("begin", `${.28 + i * .07 + mi * .05}s`)
          .attr("fill", "freeze");
        const value = benchmarkGroup.append("text")
          .attr("class", "caption")
          .attr("x", x + (mi === 0 ? -9 : 9))
          .attr("y", y + (mi === 0 ? -8 : 15))
          .attr("text-anchor", mi === 0 ? "end" : "start")
          .attr("font-size", 10.2)
          .attr("font-weight", 700)
          .attr("fill", model.color)
          .text(fmtScore(model.metrics[row.key]));
        fadeIn(value, .34 + i * .07 + mi * .05, .35);
      });
    });
    [40, 60, 80].forEach(tick => {
      const x = score(tick);
      benchmarkGroup.append("line")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", 269)
        .attr("y2", 277)
        .attr("stroke", tokens.axis)
        .attr("stroke-width", 1);
      benchmarkGroup.append("text")
        .attr("class", "caption")
        .attr("x", x)
        .attr("y", 294)
        .attr("text-anchor", "middle")
        .attr("font-size", 10.5)
        .text(tick);
    });
    benchmarkGroup.append("line")
      .attr("x1", score(35))
      .attr("x2", score(92))
      .attr("y1", 273)
      .attr("y2", 273)
      .attr("stroke", tokens.axis)
      .attr("stroke-width", 1.1);
    benchmarkGroup.append("text")
      .attr("class", "caption")
      .attr("x", 502)
      .attr("y", 294)
      .attr("text-anchor", "end")
      .attr("font-size", 10.5)
      .text("score %");

    const footprintCards = [
      { model: models[0], x: 38, y: 316, w: 232, h: 72 },
      { model: models[1], x: 290, y: 316, w: 232, h: 72 }
    ];
    const footprint = svg.append("g").selectAll("g.footprint-card")
      .data(footprintCards)
      .join("g")
      .attr("class", "footprint-card");
    footprint.append("rect")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", 7)
      .attr("fill", tokens.panel)
      .attr("stroke", tokens.panelStroke)
      .attr("stroke-width", 1.1);
    footprint.append("text")
      .attr("class", "caption")
      .attr("x", d => d.x + d.w - 12)
      .attr("y", d => d.y - 8)
      .attr("text-anchor", "end")
      .attr("font-size", 10.4)
      .attr("font-weight", 700)
      .attr("fill", palette.gray700)
      .text(d => `${d.model.hardware} / ${d.model.instance}`);

    footprint.each(function (card, cardIndex) {
      const group = d3.select(this);
      const barX = card.x + 58;
      const rows = [
        { label: "BF16", value: card.model.bf16, scale: mem, suffix: " GB", y: card.y + 20, fill: card.model.light, stroke: card.model.color },
        { label: "Q4", value: card.model.q4, scale: mem, suffix: " GB", y: card.y + 41, fill: tokens.q4Fill, stroke: tokens.q4Stroke },
        { label: "VM", value: card.model.cost, scale: price, suffix: "/h", y: card.y + 62, fill: tokens.costFill, stroke: tokens.costStroke }
      ];
      rows.forEach((row, rowIndex) => {
        group.append("text")
          .attr("class", "caption")
          .attr("x", card.x + 14)
          .attr("y", row.y + 4)
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label);
        group.append("rect")
          .attr("x", barX)
          .attr("y", row.y - 8)
          .attr("width", row.scale(row.value))
          .attr("height", 10)
          .attr("rx", 2)
          .attr("fill", row.fill)
          .attr("fill-opacity", .78)
          .attr("stroke", "none")
          .each(function () {
            d3.select(this).append("animate")
              .attr("attributeName", "width")
              .attr("from", 0)
              .attr("to", row.scale(row.value))
              .attr("dur", ".54s")
              .attr("begin", `${.48 + cardIndex * .08 + rowIndex * .06}s`)
              .attr("fill", "freeze");
          });
        group.append("text")
          .attr("class", "caption")
          .attr("x", card.x + card.w - 12)
          .attr("y", row.y + 4)
          .attr("text-anchor", "end")
          .attr("font-size", 10.6)
          .attr("font-weight", 700)
          .text(row.label === "VM" ? `$${row.value.toFixed(row.value < 1 ? 3 : 2)}${row.suffix}` : `${row.value}${row.suffix}`);
      });
    });
    fadeIn(svg.selectAll(".footprint-card text, .footprint-card > rect"), .38, .42);
  }

  function renderBoxPlot() {
    const svg = prepareSvg("boxplot", "Box plot", "Quartile summaries and outliers across groups.");
    const groups = ["A", "B", "C"];
    const values = groups.map((g, gi) => d3.range(28).map(i => 36 + gi * 12 + Math.sin(i * .6 + gi) * 10 + (i % 5)));
    const stats = values.map((arr, i) => {
      const sorted = arr.slice().sort(d3.ascending);
      return { group: groups[i], min: d3.min(sorted), q1: d3.quantile(sorted, .25), median: d3.quantile(sorted, .5), q3: d3.quantile(sorted, .75), max: d3.max(sorted) };
    });
    const x = d3.scaleBand().domain(groups).range([80, width - 50]).padding(.35);
    const y = d3.scaleLinear().domain([20, 85]).range([height - 58, 42]);
    axisLeft(svg, y, 56, 5);
    const g = svg.append("g").selectAll("g").data(stats).join("g").attr("transform", d => `translate(${x(d.group) + x.bandwidth() / 2},0)`);
    g.append("line").attr("y1", d => y(d.min)).attr("y2", d => y(d.max)).attr("stroke", palette.ink);
    g.append("rect").attr("x", -28).attr("y", d => y(d.q3)).attr("width", 56).attr("height", d => y(d.q1) - y(d.q3)).attr("fill", palette.orange).attr("fill-opacity", .75).attr("stroke", "#fff");
    g.append("line").attr("x1", -32).attr("x2", 32).attr("y1", d => y(d.median)).attr("y2", d => y(d.median)).attr("stroke", palette.ink).attr("stroke-width", 2);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - 58})`).call(d3.axisBottom(x));
    fadeIn(g, .05, .7);
  }

  function renderViolin() {
    const svg = prepareSvg("violin", "Violin plot", "Mirrored density shapes derived from deterministic samples.");
    const groups = ["A", "B", "C"];
    const x = d3.scalePoint().domain(groups).range([105, width - 85]);
    const y = d3.scaleLinear().domain([15, 95]).range([height - 54, 42]);
    axisLeft(svg, y, 56, 5);
    const area = d3.area().x0(d => -d.w).x1(d => d.w).y(d => y(d.v)).curve(d3.curveBasis);
    groups.forEach((g, gi) => {
      const density = d3.range(28).map(i => {
        const v = 18 + i * 2.8;
        const w = 8 + Math.exp(-Math.pow((v - (42 + gi * 12)) / 18, 2)) * 35 + Math.sin(i * .5 + gi) * 3;
        return { v, w };
      });
      const grp = svg.append("g").attr("transform", `translate(${x(g)},0)`);
      grp.append("path").datum(density).attr("d", area).attr("fill", colors[gi]).attr("fill-opacity", .75).attr("stroke", "#fff");
      grp.append("text").attr("class", "mark-label").attr("x", 0).attr("y", height - 28).attr("text-anchor", "middle").text(g);
      fadeIn(grp, .1 + gi * .08, .7);
    });
  }

  function renderRidgeline() {
    const svg = prepareSvg("ridgeline", "Ridgeline", "Stacked density curves reveal group shape differences.");
    const groups = ["North", "South", "East", "West"];
    const x = d3.scaleLinear().domain([0, 100]).range([54, width - 34]);
    const yBase = d3.scalePoint().domain(groups).range([82, 314]);
    const line = d3.area().x(d => x(d.x)).y0(0).y1(d => -d.y).curve(d3.curveBasis);
    groups.forEach((group, gi) => {
      const data = d3.range(28).map(i => ({ x: i * 3.7, y: 12 + Math.exp(-Math.pow((i - (9 + gi * 4)) / 5, 2)) * 62 }));
      const g = svg.append("g").attr("transform", `translate(0,${yBase(group)})`);
      g.append("path").datum(data).attr("d", line).attr("fill", colors[gi]).attr("fill-opacity", .72).attr("stroke", d3.color(colors[gi]).darker(.45));
      g.append("text").attr("class", "mark-label").attr("x", 42).attr("y", -8).text(group);
      fadeIn(g, .08 + gi * .08, .6);
    });
  }

  function renderContours() {
    const svg = prepareSvg("contours", "Density contours", "D3 contourDensity estimates two-dimensional concentration.");
    const pts = d3.range(160).map(i => {
      const cluster = i % 3;
      const cx = [180, 300, 390][cluster], cy = [150, 240, 140][cluster];
      return [cx + Math.sin(i * 1.7) * (34 + cluster * 6), cy + Math.cos(i * 1.3) * (28 + cluster * 8)];
    });
    const contours = d3.contourDensity().x(d => d[0]).y(d => d[1]).size([width, height]).bandwidth(24).thresholds(8)(pts);
    const color = quantizedRamp([0, d3.max(contours, d => d.value)], [palette.purpleHighlight, palette.blueHighlight, palette.cyan, palette.blue, palette.blueHover]);
    const path = d3.geoPath();
    const shapes = svg.append("g").selectAll("path").data(contours).join("path")
      .attr("d", path).attr("fill", d => color(d.value)).attr("stroke", "#fff").attr("stroke-width", .8);
    fadeIn(shapes, .06, .8);
    svg.append("g").selectAll("circle").data(pts.filter((d, i) => i % 5 === 0)).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 2).attr("fill", palette.ink).attr("opacity", .35);
  }

  function renderHexbin() {
    const svg = prepareSvg("hexbin", "Hexbin field", "Point density aggregated into hand-built hexagonal cells.");
    const pts = d3.range(180).map(i => [80 + (i * 37 % 390) + Math.sin(i) * 18, 62 + (i * 53 % 280) + Math.cos(i * .7) * 18]);
    const r = 16;
    const bins = new Map();
    pts.forEach(([px, py]) => {
      const q = Math.round(px / (r * 1.5));
      const row = Math.round((py - (q % 2) * r * .86) / (r * 1.72));
      const key = `${q}|${row}`;
      const cx = q * r * 1.5;
      const cy = row * r * 1.72 + (q % 2) * r * .86;
      const item = bins.get(key) || { x: cx, y: cy, count: 0 };
      item.count += 1;
      bins.set(key, item);
    });
    const cells = Array.from(bins.values()).filter(d => d.x > 45 && d.x < width - 35 && d.y > 35 && d.y < height - 35);
    const color = quantizedRamp([0, d3.max(cells, d => d.count)], ramps.heat);
    const hex = d3.range(6).map(i => [Math.cos(Math.PI / 3 * i) * r, Math.sin(Math.PI / 3 * i) * r]).map(d => d.join(",")).join(" ");
    const polygons = svg.append("g").selectAll("polygon").data(cells).join("polygon")
      .attr("points", hex).attr("transform", d => `translate(${d.x},${d.y})`).attr("fill", d => color(d.count)).attr("stroke", "#fff");
    fadeIn(polygons, .05, .65);
  }

  function renderCalendar() {
    const svg = prepareSvg("calendar", "Calendar heatmap", "Repeated temporal cells showing intensity by day.");
    const days = d3.range(35).map(i => ({ i, value: 1 + (i * 7) % 13 }));
    const cell = 34;
    const color = quantizedRamp([1, 13], ramps.blue);
    const g = svg.append("g").attr("transform", "translate(80,58)");
    const cells = g.selectAll("rect").data(days).join("rect")
      .attr("x", d => (d.i % 7) * cell).attr("y", d => Math.floor(d.i / 7) * cell)
      .attr("width", cell - 3).attr("height", cell - 3).attr("rx", 4)
      .attr("fill", d => color(d.value));
    fadeIn(cells, .05, .6);
    ["Mon", "Tue", "Wed", "Thu", "Fri"].forEach((d, i) => g.append("text").attr("class", "label").attr("x", -12).attr("y", i * cell + 20).attr("text-anchor", "end").text(d));
    d3.range(7).forEach(i => g.append("text").attr("class", "label").attr("x", i * cell + 15).attr("y", -12).attr("text-anchor", "middle").text(`D${i + 1}`));
  }

  function renderLollipop() {
    const svg = prepareSvg("lollipop", "Lollipop chart", "Ranked values with stems and endpoints.");
    const data = ["API", "Search", "Jobs", "Billing", "Reports", "Auth"].map((name, i) => ({ name, value: [86, 74, 68, 59, 51, 45][i] }));
    const x = d3.scaleLinear().domain([0, 100]).range([100, width - 50]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([54, 330]).padding(.42);
    axisBottom(svg, x, 350, 5);
    svg.append("g").selectAll("line").data(data).join("line").attr("x1", x(0)).attr("x2", d => x(d.value)).attr("y1", d => y(d.name) + y.bandwidth() / 2).attr("y2", d => y(d.name) + y.bandwidth() / 2).attr("stroke", palette.gray200).attr("stroke-width", 3);
    const circles = svg.append("g").selectAll("circle").data(data).join("circle").attr("cx", d => x(d.value)).attr("cy", d => y(d.name) + y.bandwidth() / 2).attr("fill", palette.blue);
    grow(circles, "r", 1, 9, .1, .65);
    svg.append("g").selectAll("text").data(data).join("text").attr("class", "mark-label").attr("x", 88).attr("y", d => y(d.name) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d.name);
  }

  function renderCircularBar() {
    const svg = prepareSvg("circular-bar", "Circular barplot", "Categorical magnitudes arranged around a radial axis.");
    const data = d3.range(18).map(i => ({ name: `C${i + 1}`, value: 30 + (i * 17) % 70 }));
    const inner = 68, outer = 166;
    const x = d3.scaleBand().domain(data.map(d => d.name)).range([0, 2 * Math.PI]).padding(.08);
    const y = d3.scaleRadial().domain([0, 100]).range([inner, outer]);
    const arc = d3.arc().innerRadius(inner).outerRadius(d => y(d.value)).startAngle(d => x(d.name)).endAngle(d => x(d.name) + x.bandwidth()).padAngle(.01);
    const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 14})`);
    [50, 100].forEach(value => g.append("circle")
      .attr("r", y(value))
      .attr("fill", "none")
      .attr("stroke", palette.gray200)
      .attr("stroke-dasharray", "3 5"));
    const bars = g.selectAll("path").data(data).join("path").attr("d", arc).attr("fill", (d, i) => colors[i % colors.length]).attr("fill-opacity", .86);
    fadeIn(bars, .06, .75);
    g.append("g").selectAll("text").data(data).join("text")
      .attr("class", "caption")
      .attr("x", d => Math.sin(x(d.name) + x.bandwidth() / 2) * 180)
      .attr("y", d => -Math.cos(x(d.name) + x.bandwidth() / 2) * 180 + 3)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .text(d => d.name);
    g.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 4).text("0-100");
  }

  function renderRadar() {
    const svg = prepareSvg("radar", "Radar profile", "Radial profile comparison across multiple metrics.");
    const metrics = ["Speed", "Cost", "Reach", "Risk", "Quality", "Fit"];
    const profiles = [
      { name: "Pilot", values: [82, 58, 72, 44, 68, 76], color: palette.blue },
      { name: "Scale", values: [66, 72, 88, 52, 74, 64], color: palette.orange }
    ];
    const center = [width / 2, height / 2 + 12];
    const r = d3.scaleLinear().domain([0, 100]).range([0, 138]);
    const angle = i => i / metrics.length * 2 * Math.PI - Math.PI / 2;
    const line = d3.lineRadial().radius((d, i) => r(d)).angle((d, i) => angle(i)).curve(d3.curveLinearClosed);
    const g = svg.append("g").attr("transform", `translate(${center[0]},${center[1]})`);
    [40, 70, 100].forEach(v => g.append("circle").attr("r", r(v)).attr("fill", "none").attr("stroke", "#d8dee6"));
    metrics.forEach((m, i) => {
      const a = angle(i);
      g.append("line").attr("x2", Math.cos(a) * r(100)).attr("y2", Math.sin(a) * r(100)).attr("stroke", "#d8dee6");
      g.append("text").attr("class", "label").attr("x", Math.cos(a) * 160).attr("y", Math.sin(a) * 160).attr("text-anchor", "middle").text(m);
    });
    const areas = g.selectAll(".profile").data(profiles).join("path").attr("d", d => line(d.values)).attr("fill", d => d.color).attr("fill-opacity", .24).attr("stroke", d => d.color).attr("stroke-width", 2.2);
    drawPath(areas, .12, .9);
  }

  function renderBump() {
    const svg = prepareSvg("bump", "Bump chart", "Rank movement across ordered periods.");
    const names = ["Alpha", "Beta", "Gamma", "Delta"];
    const periods = ["Q1", "Q2", "Q3", "Q4", "Q5"];
    const ranks = { Alpha: [1, 2, 2, 1, 1], Beta: [2, 1, 3, 3, 2], Gamma: [3, 4, 1, 2, 3], Delta: [4, 3, 4, 4, 4] };
    const x = d3.scalePoint().domain(periods).range([70, width - 50]);
    const y = d3.scalePoint().domain([1, 2, 3, 4]).range([70, 320]);
    periods.forEach(p => svg.append("text").attr("class", "label").attr("x", x(p)).attr("y", 350).attr("text-anchor", "middle").text(p));
    [1, 2, 3, 4].forEach(r => svg.append("text").attr("class", "label").attr("x", 48).attr("y", y(r) + 4).attr("text-anchor", "end").text(`#${r}`));
    const line = d3.line().x((d, i) => x(periods[i])).y(d => y(d)).curve(d3.curveMonotoneX);
    names.forEach((name, i) => {
      const path = svg.append("path").datum(ranks[name]).attr("d", line).attr("fill", "none").attr("stroke", colors[i]).attr("stroke-width", 3);
      drawPath(path, .12 + i * .05, .9);
      svg.append("text").attr("class", "mark-label").attr("x", width - 46).attr("y", y(ranks[name].at(-1)) + 4).attr("text-anchor", "end").text(name);
    });
  }

  function renderSlope() {
    const svg = prepareSvg("slope", "Slope chart", "Before-after comparison with connected labels.");
    const data = [
      { name: "API", a: 42, b: 75 }, { name: "Search", a: 61, b: 68 }, { name: "Jobs", a: 74, b: 52 },
      { name: "Billing", a: 38, b: 59 }, { name: "Reports", a: 52, b: 82 }
    ];
    const y = d3.scaleLinear().domain([30, 90]).range([330, 54]);
    const x1 = 130, x2 = 410;
    axisLeft(svg, y, 70, 5);
    svg.append("text").attr("class", "mark-label").attr("x", x1).attr("y", 36).attr("text-anchor", "middle").text("Before");
    svg.append("text").attr("class", "mark-label").attr("x", x2).attr("y", 36).attr("text-anchor", "middle").text("After");
    const lines = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", x1).attr("x2", x2).attr("y1", d => y(d.a)).attr("y2", d => y(d.b)).attr("stroke", (d, i) => colors[i]).attr("stroke-width", 2.5);
    fadeIn(lines, .1, .7);
    svg.append("g").selectAll("text").data(data).join("text").attr("class", "label")
      .attr("x", x2 + 12).attr("y", d => y(d.b) + 4).text(d => d.name);
  }

  function renderHorizon() {
    const svg = prepareSvg("horizon", "Horizon chart", "Compressed time-series bands with layered color.");
    const data = d3.range(48).map(i => ({ x: i, y: Math.sin(i / 4) * 28 + Math.cos(i / 9) * 18 + 42 }));
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.x)).range([42, width - 34]);
    const y = d3.scaleLinear().domain([0, 90]).range([116, 0]);
    const baseY = 300;
    const bandHeight = 108;
    const bandColors = [palette.blueHighlight, palette.cyan, palette.blue];
    const area = d3.area().x(d => x(d.x)).y0(baseY).y1(d => baseY - Math.min(bandHeight, y(0) - y(d.y))).curve(d3.curveBasis);
    svg.append("rect").attr("x", 42).attr("y", baseY - bandHeight).attr("width", width - 76).attr("height", bandHeight)
      .attr("fill", palette.gray50).attr("stroke", palette.gray100);
    [0, 1, 2].forEach(i => {
      const shifted = data.map(d => ({ x: d.x, y: Math.max(0, d.y - i * 22) }));
      const path = svg.append("path").datum(shifted).attr("d", area).attr("fill", bandColors[i]).attr("fill-opacity", .78);
      fadeIn(path, .08 + i * .08, .75);
    });
    svg.append("line").attr("x1", 42).attr("x2", width - 34).attr("y1", baseY).attr("y2", baseY).attr("stroke", "#9ba6b3");
    d3.range(0, 49, 8).forEach(tick => {
      svg.append("line").attr("x1", x(tick)).attr("x2", x(tick)).attr("y1", baseY).attr("y2", baseY + 6).attr("stroke", "#9ba6b3");
      svg.append("text").attr("class", "label").attr("x", x(tick)).attr("y", baseY + 22).attr("text-anchor", "middle").text(`T${tick}`);
    });
    ["low", "mid", "high"].forEach((label, i) => {
      svg.append("rect").attr("x", 54 + i * 60).attr("y", 48).attr("width", 14).attr("height", 14).attr("fill", bandColors[i]);
      svg.append("text").attr("class", "label").attr("x", 74 + i * 60).attr("y", 60).text(label);
    });
  }

  function renderGeoRoute() {
    const svg = prepareSvg("geo-route", "Projected routes", "D3 geographic projection and route motion.");
    const projection = d3.geoNaturalEarth1().fitExtent([[38, 42], [width - 38, height - 52]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    const graticule = d3.geoGraticule10();
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("fill-opacity", .22).attr("stroke", palette.gray300);
    appendSchematicLand(svg, path);
    svg.append("path").datum(graticule).attr("d", path).attr("fill", "none").attr("stroke", "#d4dbe4").attr("stroke-width", .7);
    const cities = [
      { name: "SF", lon: -122.4, lat: 37.8, dx: 7, dy: -7, anchor: "start" },
      { name: "NY", lon: -74, lat: 40.7, dx: 7, dy: -7, anchor: "start" },
      { name: "LDN", lon: -0.1, lat: 51.5, dx: -8, dy: -10, anchor: "end" },
      { name: "BER", lon: 13.4, lat: 52.5, dx: 8, dy: 13, anchor: "start" },
      { name: "TKY", lon: 139.7, lat: 35.7, dx: 7, dy: -7, anchor: "start" }
    ];
    const route = { type: "LineString", coordinates: cities.map(d => [d.lon, d.lat]) };
    const routePath = svg.append("path").datum(route).attr("d", path).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2.8);
    drawPath(routePath, .2, 1.2);
    svg.append("g").selectAll("circle").data(cities).join("circle").attr("cx", d => projection([d.lon, d.lat])[0]).attr("cy", d => projection([d.lon, d.lat])[1]).attr("r", 4.5).attr("fill", palette.blue);
    svg.append("g").selectAll("text").data(cities).join("text").attr("class", "mark-label")
      .attr("x", d => projection([d.lon, d.lat])[0] + d.dx).attr("y", d => projection([d.lon, d.lat])[1] + d.dy)
      .attr("text-anchor", d => d.anchor).text(d => d.name);
  }

  function renderSymbolGlyphs() {
    const svg = prepareSvg("symbol-glyphs", "Symbol glyphs", "D3 symbol marks encode category, magnitude, and position.");
    const types = [d3.symbolCircle, d3.symbolTriangle, d3.symbolDiamond, d3.symbolSquare, d3.symbolCross];
    const names = ["Ops", "Data", "UX", "Infra", "ML"];
    const data = d3.range(25).map(i => ({
      x: 12 + (i * 17) % 82,
      y: 18 + (i * 29) % 74,
      value: 2 + (i * 7) % 9,
      type: i % types.length
    }));
    const margin = { top: 38, right: 34, bottom: 52, left: 54 };
    const x = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    const size = d3.scaleLinear().domain([2, 10]).range([42, 280]);
    const symbol = d3.symbol().type(d => types[d.type]).size(d => size(d.value));
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const glyphs = svg.append("g").selectAll("path").data(data).join("path")
      .attr("d", symbol)
      .attr("transform", d => `translate(${x(d.x)},${y(d.y)})`)
      .attr("fill", d => colors[d.type])
      .attr("fill-opacity", .78)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2);
    fadeIn(glyphs, .06, .72);
    const legend = svg.append("g").attr("transform", "translate(84,28)").selectAll("g").data(names).join("g")
      .attr("transform", (d, i) => `translate(${i * 84},0)`);
    legend.append("path").attr("d", (d, i) => d3.symbol().type(types[i]).size(82)()).attr("fill", (d, i) => colors[i]);
    legend.append("text").attr("class", "label").attr("x", 11).attr("y", 4).text(d => d);
  }

  function renderPolarArea() {
    const svg = prepareSvg("polar-area", "Polar area", "D3 pie and arc generators create radial seasonal segments.");
    const data = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, i) => ({
      month,
      value: 36 + Math.sin(i / 1.7) * 22 + (i % 4) * 8
    }));
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 12})`);
    const radius = d3.scaleRadial().domain([0, 86]).range([44, 164]);
    const angle = d3.scaleBand().domain(data.map(d => d.month)).range([0, 2 * Math.PI]).padding(.025);
    const arc = d3.arc()
      .innerRadius(42)
      .outerRadius(d => radius(d.value))
      .startAngle(d => angle(d.month))
      .endAngle(d => angle(d.month) + angle.bandwidth())
      .padAngle(.012)
      .padRadius(44);
    [40, 60, 80].forEach(v => center.append("circle").attr("r", radius(v)).attr("fill", "none").attr("stroke", palette.gray200));
    const wedges = center.selectAll("path").data(data).join("path")
      .attr("d", arc)
      .attr("fill", (d, i) => colors[i % colors.length])
      .attr("fill-opacity", .82)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2);
    fadeIn(wedges, .06, .75);
    center.selectAll("text").data(data.filter((d, i) => i % 2 === 0)).join("text")
      .attr("class", "label")
      .attr("x", d => Math.cos(angle(d.month) + angle.bandwidth() / 2 - Math.PI / 2) * 184)
      .attr("y", d => Math.sin(angle(d.month) + angle.bandwidth() / 2 - Math.PI / 2) * 184 + 4)
      .attr("text-anchor", "middle")
      .text(d => d.month);
  }

  function renderMarimekko() {
    const svg = prepareSvg("marimekko", "Marimekko", "Variable-width stacked rectangles show two proportional dimensions.");
    const keys = ["Retain", "Expand", "New"];
    const data = [
      { name: "Core", width: 34, Retain: 46, Expand: 28, New: 12 },
      { name: "Growth", width: 26, Retain: 18, Expand: 36, New: 24 },
      { name: "Labs", width: 18, Retain: 10, Expand: 22, New: 34 },
      { name: "Field", width: 22, Retain: 24, Expand: 18, New: 20 }
    ];
    const margin = { top: 42, right: 28, bottom: 54, left: 44 };
    const totalWidth = d3.sum(data, d => d.width);
    let offset = 0;
    const cells = [];
    data.forEach(group => {
      const x0 = offset / totalWidth;
      offset += group.width;
      const x1 = offset / totalWidth;
      const total = d3.sum(keys, key => group[key]);
      let y0 = 0;
      keys.forEach((key, ki) => {
        const y1 = y0 + group[key] / total;
        cells.push({ group: group.name, key, ki, x0, x1, y0, y1 });
        y0 = y1;
      });
    });
    const x = d3.scaleLinear().domain([0, 1]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    const rects = svg.append("g").selectAll("rect").data(cells).join("rect")
      .attr("x", d => x(d.x0) + 1)
      .attr("y", d => y(d.y1))
      .attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 2))
      .attr("height", d => Math.max(1, y(d.y0) - y(d.y1)))
      .attr("fill", d => colors[d.ki])
      .attr("fill-opacity", .84)
      .attr("stroke", "#fff");
    fadeIn(rects, .05, .7);
    const labels = svg.append("g").selectAll("text").data(data).join("text")
      .attr("class", "mark-label")
      .attr("x", d => x((cells.find(c => c.group === d.name).x0 + cells.filter(c => c.group === d.name).at(-1).x1) / 2))
      .attr("y", height - 26)
      .attr("text-anchor", "middle")
      .text(d => d.name);
    fadeIn(labels, .4, .45);
    keys.forEach((key, i) => {
      svg.append("rect").attr("x", 72 + i * 94).attr("y", 24).attr("width", 12).attr("height", 12).attr("fill", colors[i]);
      svg.append("text").attr("class", "label").attr("x", 90 + i * 94).attr("y", 35).text(key);
    });
  }

  function renderAlluvial() {
    const svg = prepareSvg("alluvial", "Alluvial bands", "Layered D3 path ribbons show categorical handoffs.");
    const left = ["Acquire", "Engage", "Support"];
    const right = ["Retain", "Expand", "Churn"];
    const flows = [
      ["Acquire", "Retain", 18], ["Acquire", "Expand", 8], ["Acquire", "Churn", 5],
      ["Engage", "Retain", 14], ["Engage", "Expand", 18], ["Engage", "Churn", 4],
      ["Support", "Retain", 9], ["Support", "Expand", 7], ["Support", "Churn", 12]
    ].map(([source, target, value]) => ({ source, target, value }));
    const leftTotals = new Map(left.map(name => [name, d3.sum(flows.filter(d => d.source === name), d => d.value)]));
    const rightTotals = new Map(right.map(name => [name, d3.sum(flows.filter(d => d.target === name), d => d.value)]));
    const scale = d3.scaleLinear().domain([0, d3.max([...leftTotals.values(), ...rightTotals.values()])]).range([0, 86]);
    const x0 = 94, x1 = width - 94, top = 76, gap = 30;
    const stackedPositions = (names, totals) => {
      const positions = new Map();
      let y = top;
      names.forEach(name => {
        positions.set(name, y);
        y += Math.max(8, scale(totals.get(name))) + gap;
      });
      return positions;
    };
    const leftY = stackedPositions(left, leftTotals);
    const rightY = stackedPositions(right, rightTotals);
    const leftOffset = new Map(left.map(name => [name, 0]));
    const rightOffset = new Map(right.map(name => [name, 0]));
    const band = d => {
      const h = Math.max(7, scale(d.value));
      const sy0 = leftY.get(d.source) + leftOffset.get(d.source);
      const ty0 = rightY.get(d.target) + rightOffset.get(d.target);
      leftOffset.set(d.source, leftOffset.get(d.source) + h);
      rightOffset.set(d.target, rightOffset.get(d.target) + h);
      const sy1 = sy0 + h, ty1 = ty0 + h, cx = (x0 + x1) / 2;
      return { ...d, h, path: `M${x0},${sy0} C${cx},${sy0} ${cx},${ty0} ${x1},${ty0} L${x1},${ty1} C${cx},${ty1} ${cx},${sy1} ${x0},${sy1} Z` };
    };
    const ribbons = svg.append("g").selectAll("path").data(flows.map(band)).join("path")
      .attr("d", d => d.path)
      .attr("fill", d => colors[left.indexOf(d.source)])
      .attr("fill-opacity", .32)
      .attr("stroke", d => colors[left.indexOf(d.source)])
      .attr("stroke-width", .8);
    fadeIn(ribbons, .08, .85);
    [left, right].forEach((side, si) => {
      const x = si === 0 ? x0 - 20 : x1 + 20;
      const totals = si === 0 ? leftTotals : rightTotals;
      const yMap = si === 0 ? leftY : rightY;
      svg.append("g").selectAll("rect").data(side).join("rect")
        .attr("x", si === 0 ? x0 - 32 : x1 + 14)
        .attr("y", d => yMap.get(d))
        .attr("width", 18)
        .attr("height", d => Math.max(8, scale(totals.get(d))))
        .attr("fill", (d, i) => si === 0 ? colors[i] : "#6f7b8a");
      svg.append("g").selectAll("text").data(side).join("text")
        .attr("class", "mark-label")
        .attr("x", x)
        .attr("y", d => yMap.get(d) + scale(totals.get(d)) / 2 + 4)
        .attr("text-anchor", si === 0 ? "end" : "start")
        .text(d => d);
    });
  }

  function renderClusterHulls() {
    const svg = prepareSvg("cluster-hulls", "Cluster hulls", "D3 polygon hulls wrap clustered point neighborhoods.");
    const clusters = [
      { name: "North", center: [160, 140], color: palette.blue },
      { name: "South", center: [304, 245], color: palette.orange },
      { name: "West", center: [390, 132], color: palette.green }
    ];
    const points = clusters.flatMap((cluster, ci) => d3.range(14).map(i => ({
      cluster: cluster.name,
      color: cluster.color,
      x: cluster.center[0] + Math.cos(i * 1.7 + ci) * (28 + (i % 4) * 7),
      y: cluster.center[1] + Math.sin(i * 1.35 + ci) * (22 + (i % 5) * 6)
    })));
    clusters.forEach(cluster => {
      const hull = d3.polygonHull(points.filter(d => d.cluster === cluster.name).map(d => [d.x, d.y]));
      svg.append("path")
        .attr("d", hull ? `M${hull.join("L")}Z` : "")
        .attr("fill", cluster.color)
        .attr("fill-opacity", .16)
        .attr("stroke", cluster.color)
        .attr("stroke-width", 2);
    });
    fadeIn(svg.selectAll("path"), .06, .65);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.color).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 1, 5.5, .12, .6);
    svg.append("g").selectAll("text").data(clusters).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d.center[0])
      .attr("y", d => d.center[1] - 54)
      .attr("text-anchor", "middle")
      .text(d => d.name);
  }

  function renderDelaunayMesh() {
    const svg = prepareSvg("delaunay-mesh", "Delaunay mesh", "D3 Delaunay triangulation reveals nearest-neighbor topology.");
    const pts = d3.range(38).map(i => [
      58 + (i * 89 % 440) + Math.sin(i * 1.1) * 16,
      54 + (i * 53 % 292) + Math.cos(i * .9) * 14
    ]);
    const delaunay = d3.Delaunay.from(pts);
    const mesh = svg.append("path")
      .attr("d", delaunay.render())
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.1);
    drawPath(mesh, .08, 1);
    const dots = svg.append("g").selectAll("circle").data(pts).join("circle")
      .attr("cx", d => d[0]).attr("cy", d => d[1])
      .attr("fill", palette.purple)
      .attr("fill-opacity", .86)
      .attr("stroke", "#fff");
    grow(dots, "r", 1, 4.6, .18, .62);
  }

  function renderWaffle() {
    const svg = prepareSvg("waffle", "Waffle matrix", "D3 unit grid shows exact part-to-whole composition.");
    const shares = [
      { name: "Build", count: 36, color: palette.blue },
      { name: "Review", count: 24, color: palette.orange },
      { name: "Ship", count: 22, color: palette.green },
      { name: "Learn", count: 18, color: palette.purple }
    ];
    const units = shares.flatMap(group => d3.range(group.count).map(() => group));
    const cell = 25;
    const origin = [118, 70];
    const marks = svg.append("g").selectAll("rect").data(units).join("rect")
      .attr("x", (d, i) => origin[0] + (i % 10) * cell)
      .attr("y", (d, i) => origin[1] + Math.floor(i / 10) * cell)
      .attr("width", cell - 4)
      .attr("height", cell - 4)
      .attr("rx", 5)
      .attr("fill", d => d.color)
      .attr("stroke", "#fff");
    fadeIn(marks, .04, .55);
    let y = 92;
    shares.forEach(group => {
      svg.append("rect").attr("x", 392).attr("y", y - 12).attr("width", 14).attr("height", 14).attr("fill", group.color).attr("rx", 3);
      svg.append("text").attr("class", "mark-label").attr("x", 414).attr("y", y).text(`${group.name} ${group.count}%`);
      y += 30;
    });
  }

  function renderContextWindowMatrix() {
    const svg = prepareSvg("context-window-matrix", "Context window matrix", "A D3 waffle matrix shows how agent context fills a finite token window.");
    const totalTokens = 200000;
    const unitTokens = 1000;
    const cols = 20;
    const rows = 10;
    const totalCells = cols * rows;
    const segments = [
      { name: "System prompt", tokens: 18000, color: palette.blue },
      { name: "Project rules", tokens: 24000, color: palette.green },
      { name: "Tool schemas", tokens: 30000, color: palette.orange },
      { name: "User task", tokens: 16000, color: palette.purple },
      { name: "Files & docs", tokens: 34000, color: palette.cyan },
      { name: "Tool results", tokens: 22000, color: palette.gold },
      { name: "Memory summary", tokens: 12000, color: palette.red },
      { name: "Free budget", tokens: 44000, color: palette.gray100, unused: true }
    ];
    const freeColor = segments.find(d => d.unused).color;
    const usedTokens = d3.sum(segments.filter(d => !d.unused), d => d.tokens);
    const cellSegments = segments.flatMap(segment => {
      const count = Math.round(segment.tokens / unitTokens);
      return d3.range(count).map(() => segment);
    }).slice(0, totalCells);
    const cells = d3.range(totalCells).map(i => ({
      index: i,
      col: i % cols,
      row: Math.floor(i / cols),
      segment: cellSegments[i] || segments.at(-1)
    }));
    const frame = { x: 36, y: 58, w: 374, h: 214 };
    const gap = 3;
    const cell = 15;
    const pitch = cell + gap;
    const matrixX = frame.x + 9;
    const matrixY = frame.y + 20;
    const usedCells = Math.round(usedTokens / unitTokens);
    const pct = usedTokens / totalTokens;
    const fillStart = 0.35;

    svg.append("rect")
      .attr("x", frame.x)
      .attr("y", frame.y)
      .attr("width", frame.w)
      .attr("height", frame.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.ink)
      .attr("stroke-width", 2);
    svg.append("rect")
      .attr("x", frame.x + 8)
      .attr("y", frame.y + 8)
      .attr("width", frame.w - 16)
      .attr("height", frame.h - 16)
      .attr("rx", 5)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray100);

    svg.append("g").selectAll("rect.context-cell").data(cells).join("rect")
      .attr("class", "context-cell")
      .attr("x", d => matrixX + d.col * pitch)
      .attr("y", d => matrixY + d.row * pitch)
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 3)
      .attr("fill", freeColor)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1)
      .attr("opacity", .72);

    const usedRows = d3.range(rows).map(row => {
      const rowStart = row * cols;
      const count = Math.max(0, Math.min(cols, usedCells - rowStart));
      return {
        row,
        count,
        width: count > 0 ? (count - 1) * pitch + cell : 0
      };
    }).filter(d => d.count > 0);
    const rowDuration = 0.42;
    const sweepDuration = usedRows.length * rowDuration;
    const defs = svg.append("defs");
    usedRows.forEach(row => {
      const clipRect = defs.append("clipPath")
        .attr("id", `context-window-row-${row.row}-clip`)
        .append("rect")
        .attr("x", matrixX)
        .attr("y", matrixY + row.row * pitch)
        .attr("width", 0)
        .attr("height", cell);
      clipRect.append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", row.width)
        .attr("dur", `${rowDuration}s`)
        .attr("begin", `${fillStart + row.row * rowDuration}s`)
        .attr("fill", "freeze");
    });

    const usedLayer = svg.append("g");
    usedRows.forEach(row => {
      usedLayer.append("g")
        .attr("class", "context-used-row")
        .attr("clip-path", `url(#context-window-row-${row.row}-clip)`)
        .selectAll("rect.context-used-cell")
        .data(cells.filter(d => !d.segment.unused && d.row === row.row))
        .join("rect")
        .attr("class", "context-used-cell")
        .attr("x", d => matrixX + d.col * pitch)
        .attr("y", d => matrixY + d.row * pitch)
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 3)
        .attr("fill", d => d.segment.color)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1)
        .attr("opacity", 1);
    });

    svg.selectAll("rect.context-used-cell")
      .attr("data-linear-index", d => d.index);

    const boundaryCol = usedCells % cols;
    const boundaryRow = Math.floor(usedCells / cols);
    svg.append("path")
      .attr("d", `M${matrixX + boundaryCol * pitch - gap / 2},${matrixY + boundaryRow * pitch - 8}v${cell + 16}`)
      .attr("fill", "none")
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", "4 4")
      .attr("opacity", 0)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", .92)
      .attr("dur", ".36s")
      .attr("begin", `${fillStart + sweepDuration + 0.08}s`)
      .attr("fill", "freeze");

    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", frame.x + frame.w / 2)
      .attr("y", frame.y + frame.h + 32)
      .attr("text-anchor", "middle")
      .attr("font-size", 20)
      .attr("font-weight", 800)
      .text(`${Math.round(usedTokens / 1000)}K / ${Math.round(totalTokens / 1000)}K tokens`);
    svg.append("text")
      .attr("class", "caption")
      .attr("x", frame.x + frame.w / 2)
      .attr("y", frame.y + frame.h + 52)
      .attr("text-anchor", "middle")
      .text("token / total");

    const barX = frame.x + 42;
    const barY = frame.y + frame.h + 64;
    const barW = frame.w - 84;
    svg.append("rect").attr("x", barX).attr("y", barY).attr("width", barW).attr("height", 7).attr("rx", 3.5).attr("fill", palette.gray100);
    const usedBar = svg.append("rect").attr("x", barX).attr("y", barY).attr("width", 0).attr("height", 7).attr("rx", 3.5).attr("fill", palette.blue);
    usedBar.append("animate").attr("attributeName", "width").attr("from", 0).attr("to", barW * pct).attr("dur", `${sweepDuration}s`).attr("begin", `${fillStart}s`).attr("fill", "freeze");

    const legend = svg.append("g").attr("transform", "translate(418,58)");
    legend.append("text")
      .attr("class", "mark-label")
      .attr("x", 0)
      .attr("y", -18)
      .attr("font-weight", 800)
      .text("Context Window");
    legend.append("text")
      .attr("class", "caption")
      .attr("x", 0)
      .attr("y", 2)
      .text("token sources");
    const rowsG = legend.selectAll("g").data(segments).join("g")
      .attr("transform", (d, i) => `translate(0,${24 + i * 25})`);
    rowsG.append("rect")
      .attr("width", 13)
      .attr("height", 13)
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .attr("stroke", d => d.unused ? palette.gray300 : palette.surface)
      .attr("stroke-width", 1.2);
    rowsG.append("text")
      .attr("class", "mark-label")
      .attr("x", 19)
      .attr("y", 11)
      .style("font-size", "10px")
      .text(d => `${d.name} ${Math.round(d.tokens / 1000)}K`);
  }

  function renderTokenBoxesToContextWindow() {
    const svg = prepareSvg("context-window-fill", "Token boxes to context window", "Token-owned text boxes become ordered colored slots in a square context grid.");
    const tokens = [
      { text: "AI", id: "15836", color: palette.blue, width: 42 },
      { text: "tools", id: "7526", color: palette.green, width: 66 },
      { text: "write", id: "3350", color: palette.orange, width: 68 },
      { text: "code", id: "2082", color: palette.red, width: 62 }
    ];
    const prompt = { x: 52, y: 46, w: 456, h: 86 };
    const gap = 13;
    const pad = 10;
    const sourceH = 42;
    const sourceY = prompt.y + 24;
    const totalWords = d3.sum(tokens, d => d.width) + gap * (tokens.length - 1);
    let cursor = prompt.x + (prompt.w - totalWords) / 2;
    tokens.forEach(token => {
      token.source = { x: cursor - pad, y: sourceY, w: token.width + pad * 2, h: sourceH };
      cursor += token.width + gap;
    });

    const idY = 166;
    const idGap = 18;
    const idW = 64;
    const totalIds = tokens.length * idW + (tokens.length - 1) * idGap;
    let idCursor = (width - totalIds) / 2;
    tokens.forEach(token => {
      token.idBox = { x: idCursor, y: idY, w: idW, h: 34 };
      idCursor += idW + idGap;
    });

    const matrix = { x: 198, y: 232, size: 176 };
    const rows = 8;
    const cols = 8;
    const cell = 16;
    const cellGap = 6;
    const gridSize = cols * cell + (cols - 1) * cellGap;
    const grid = {
      x: matrix.x + (matrix.size - gridSize) / 2,
      y: matrix.y + (matrix.size - gridSize) / 2
    };
    tokens.forEach((token, index) => {
      token.slot = {
        x: grid.x + index * (cell + cellGap),
        y: grid.y,
        w: cell,
        h: cell
      };
    });

    svg.append("rect")
      .attr("x", prompt.x)
      .attr("y", prompt.y)
      .attr("width", prompt.w)
      .attr("height", prompt.h)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 2);

    const cells = d3.range(rows * cols).map(index => ({
      index,
      row: Math.floor(index / cols),
      col: index % cols
    }));
    svg.append("g")
      .selectAll("rect")
      .data(cells)
      .join("rect")
      .attr("x", d => grid.x + d.col * (cell + cellGap))
      .attr("y", d => grid.y + d.row * (cell + cellGap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 3)
      .attr("fill", palette.gray100)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2)
      .attr("opacity", .76)
      .each(function (_, index) {
        d3.select(this).append("animate")
          .attr("attributeName", "opacity")
          .attr("from", 0)
          .attr("to", .76)
          .attr("dur", ".42s")
          .attr("begin", `${1.45 + index * 0.004}s`)
          .attr("fill", "freeze");
      });

    const flowLayer = svg.append("g");
    tokens.forEach((token, index) => {
      const source = token.source;
      const id = token.idBox;
      const slot = token.slot;
      const begin = 0.62 + index * 0.08;
      const dur = 2.4;
      const keyTimes = "0;.34;.66;1";
      const line = d3.path();
      line.moveTo(source.x + source.w / 2, source.y + source.h + 4);
      line.bezierCurveTo(source.x + source.w / 2, 138, id.x + id.w / 2, 138, id.x + id.w / 2, id.y - 8);
      line.moveTo(id.x + id.w / 2, id.y + id.h + 8);
      line.bezierCurveTo(id.x + id.w / 2, 222, slot.x + slot.w / 2, 214, slot.x + slot.w / 2, slot.y - 6);
      const path = flowLayer.append("path")
        .attr("d", line.toString())
        .attr("fill", "none")
        .attr("stroke", token.color)
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
        .attr("opacity", .24);
      drawPath(path, begin + .1, 1.4);
      path.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;.24;.18;0")
        .attr("keyTimes", "0;.2;.72;1")
        .attr("dur", `${dur}s`)
        .attr("begin", `${begin}s`)
        .attr("fill", "freeze");

      const card = svg.append("rect")
        .attr("x", slot.x)
        .attr("y", slot.y)
        .attr("width", slot.w)
        .attr("height", slot.h)
        .attr("rx", 3)
        .attr("fill", token.color)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.4);
      card.append("animate").attr("attributeName", "x").attr("values", `${source.x};${source.x};${id.x};${slot.x}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "y").attr("values", `${source.y};${source.y};${id.y};${slot.y}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "width").attr("values", `${source.w};${source.w};${id.w};${slot.w}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "height").attr("values", `${source.h};${source.h};${id.h};${slot.h}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "fill").attr("values", `${palette.surface};${palette.surface};${palette.surface};${token.color}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      card.append("animate").attr("attributeName", "opacity").attr("values", "0;.95;.95;1").attr("keyTimes", "0;.25;.66;1").attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");

      const word = svg.append("text")
        .attr("class", "mark-label")
        .attr("x", slot.x + slot.w / 2)
        .attr("y", slot.y + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", 18)
        .attr("font-weight", 800)
        .attr("opacity", 0)
        .text(token.text);
      word.append("animate").attr("attributeName", "x").attr("values", `${source.x + source.w / 2};${source.x + source.w / 2};${id.x + id.w / 2};${slot.x + slot.w / 2}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      word.append("animate").attr("attributeName", "y").attr("values", `${source.y + 27};${source.y + 27};${id.y + 21};${slot.y + 12}`).attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      word.append("animate").attr("attributeName", "font-size").attr("values", "28;28;16;8").attr("keyTimes", keyTimes).attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");
      word.append("animate").attr("attributeName", "opacity").attr("values", "1;1;.15;0").attr("keyTimes", "0;.42;.68;1").attr("dur", `${dur}s`).attr("begin", `${begin}s`).attr("fill", "freeze");

      const idText = svg.append("text")
        .attr("class", "caption")
        .attr("x", slot.x + slot.w / 2)
        .attr("y", slot.y + 12)
        .attr("text-anchor", "middle")
        .attr("font-size", 15)
        .attr("font-weight", 800)
        .attr("fill", token.color)
        .attr("opacity", 0)
        .text(token.id);
      idText.append("animate").attr("attributeName", "x").attr("values", `${id.x + id.w / 2};${id.x + id.w / 2};${slot.x + slot.w / 2}`).attr("keyTimes", "0;.7;1").attr("dur", `${dur * .68}s`).attr("begin", `${begin + dur * .34}s`).attr("fill", "freeze");
      idText.append("animate").attr("attributeName", "y").attr("values", `${id.y + 21};${id.y + 21};${slot.y + 12}`).attr("keyTimes", "0;.7;1").attr("dur", `${dur * .68}s`).attr("begin", `${begin + dur * .34}s`).attr("fill", "freeze");
      idText.append("animate").attr("attributeName", "opacity").attr("values", "0;1;1;0").attr("keyTimes", "0;.16;.62;1").attr("dur", `${dur * .66}s`).attr("begin", `${begin + dur * .34}s`).attr("fill", "freeze");
    });
  }

  function renderTokenProbabilitySampler() {
    const svg = prepareSvg("token-sampler", "Token probability sampler", "A next-token distribution is sampled by cumulative probability.");
    const tokens = [
      { text: "the", p: .34, color: palette.blue },
      { text: "code", p: .23, color: palette.red, selected: true },
      { text: "model", p: .17, color: palette.green },
      { text: "next", p: .11, color: palette.orange },
      { text: "blue", p: .08, color: palette.purple },
      { text: ".", p: .07, color: palette.gray500 }
    ];
    let cumulative = 0;
    tokens.forEach(token => {
      token.x0 = cumulative;
      cumulative += token.p;
      token.x1 = cumulative;
    });
    const sampleU = .47;
    const selected = tokens.find(token => sampleU >= token.x0 && sampleU < token.x1);
    const x = d3.scaleLinear().domain([0, .38]).range([134, 476]);
    const y = d3.scaleBand().domain(tokens.map(d => d.text)).range([72, 246]).padding(.28);

    svg.append("g").selectAll("text.token-label").data(tokens).join("text")
      .attr("class", "mark-label token-label")
      .attr("x", 68)
      .attr("y", d => y(d.text) + y.bandwidth() / 2 + 5)
      .attr("text-anchor", "end")
      .text(d => d.text);
    const bars = svg.append("g").selectAll("rect.probability-bar").data(tokens).join("rect")
      .attr("class", "probability-bar")
      .attr("x", x(0))
      .attr("y", d => y(d.text))
      .attr("width", d => x(d.p) - x(0))
      .attr("height", y.bandwidth())
      .attr("rx", 5)
      .attr("fill", d => d.selected ? palette.red : d.color)
      .attr("fill-opacity", d => d.selected ? .92 : .68);
    bars.append("animate")
      .attr("attributeName", "width")
      .attr("from", 0)
      .attr("to", d => x(d.p) - x(0))
      .attr("dur", ".72s")
      .attr("begin", (d, i) => `${.1 + i * .06}s`)
      .attr("fill", "freeze");

    svg.append("g").selectAll("text.probability-value").data(tokens).join("text")
      .attr("class", "caption")
      .attr("x", d => x(d.p) + 8)
      .attr("y", d => y(d.text) + y.bandwidth() / 2 + 4)
      .text(d => `${Math.round(d.p * 100)}%`);

    const strip = { x: 66, y: 304, w: 428, h: 30 };
    const segments = svg.append("g").selectAll("rect.cumulative-token").data(tokens).join("rect")
      .attr("class", "cumulative-token")
      .attr("x", d => strip.x + d.x0 * strip.w)
      .attr("y", strip.y)
      .attr("width", d => d.p * strip.w)
      .attr("height", strip.h)
      .attr("rx", 4)
      .attr("fill", d => d.selected ? palette.red : d.color)
      .attr("fill-opacity", d => d.selected ? .92 : .62)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.4);
    fadeIn(segments, .55, .5);

    const selectedX = strip.x + sampleU * strip.w;
    const selectionLine = svg.append("line")
      .attr("x1", selectedX).attr("x2", selectedX)
      .attr("y1", strip.y - 12).attr("y2", strip.y + strip.h + 16)
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 2.4)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0);
    selectionLine.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".2s").attr("begin", "1.85s").attr("fill", "freeze");

    const path = svg.append("path")
      .attr("id", "token-sampler-path")
      .attr("d", `M${strip.x},${strip.y - 24}C${strip.x + 120},${strip.y - 64} ${selectedX - 100},${strip.y - 58} ${selectedX},${strip.y - 24}`)
      .attr("fill", "none")
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 2);
    drawPath(path, .85, 1);
    const sampler = svg.append("circle")
      .attr("r", 8)
      .attr("fill", palette.red)
      .attr("fill-opacity", .96);
    sampler.append("animateMotion")
      .attr("dur", "1.65s")
      .attr("begin", ".45s")
      .attr("fill", "freeze")
      .append("mpath")
      .attr("href", "#token-sampler-path");

    const result = svg.append("g").attr("opacity", 0);
    result.append("rect").attr("x", 186).attr("y", 356).attr("width", 188).attr("height", 36).attr("rx", 8).attr("fill", palette.redHighlight).attr("stroke", palette.red);
    result.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 379).attr("text-anchor", "middle").attr("font-weight", 800).text(`sampled: ${selected.text}`);
    result.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".25s").attr("begin", "2.15s").attr("fill", "freeze");
  }

  function renderTokenRouletteSampler() {
    const svg = prepareSvg("token-roulette", "Token roulette sampler", "A probability-weighted roulette wheel spins before landing on a sampled next token.");
    const tokens = [
      { text: "the", p: .34, color: palette.blue },
      { text: "code", p: .23, color: palette.red, selected: true },
      { text: "model", p: .17, color: palette.green },
      { text: "next", p: .11, color: palette.orange },
      { text: "blue", p: .08, color: palette.purple },
      { text: ".", p: .07, color: palette.gray500 }
    ];
    const selected = tokens.find(d => d.selected);
    const cx = 198;
    const cy = 214;
    const outerR = 112;
    const innerR = 0;
    const pie = d3.pie().sort(null).value(d => d.p);
    const arcs = pie(tokens);
    const selectedArc = arcs.find(d => d.data.selected);
    const selectedCenterDeg = ((selectedArc.startAngle + selectedArc.endAngle) / 2) * 180 / Math.PI;
    const finalRotation = 1440 - selectedCenterDeg;
    const arc = d3.arc().innerRadius(innerR).outerRadius(outerR).cornerRadius(4).padAngle(.012);

    svg.append("circle")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", outerR + 10)
      .attr("fill", palette.gray100)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 2);
    const wheel = svg.append("g").attr("transform", `translate(${cx},${cy})`).attr("class", "token-roulette-wheel");

    const wedgeGroups = wheel.selectAll("g.token-roulette-wedge").data(arcs).join("g")
      .attr("class", "token-roulette-wedge");
    wedgeGroups.append("path")
      .attr("d", arc)
      .attr("fill", d => d.data.color)
      .attr("fill-opacity", d => d.data.selected ? .94 : .72)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2);
    wedgeGroups.append("path")
      .filter(d => d.data.selected)
      .attr("d", d3.arc().innerRadius(innerR).outerRadius(outerR + 5).cornerRadius(5).padAngle(.012))
      .attr("fill", "none")
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 3.2)
      .attr("opacity", 0)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".25s")
      .attr("begin", "3.45s")
      .attr("fill", "freeze");
    wheel.append("animateTransform")
      .attr("attributeName", "transform")
      .attr("type", "rotate")
      .attr("additive", "sum")
      .attr("values", `0;760;1180;${finalRotation}`)
      .attr("keyTimes", "0;.42;.72;1")
      .attr("keySplines", ".25 .7 .35 1;.18 .8 .32 1;.12 .9 .25 1")
      .attr("calcMode", "spline")
      .attr("dur", "3.1s")
      .attr("begin", ".25s")
      .attr("fill", "freeze");

    const legend = svg.append("g").attr("transform", "translate(352,104)");
    const legendRows = legend.selectAll("g").data(tokens).join("g")
      .attr("transform", (d, i) => `translate(0,${i * 24})`);
    legendRows.append("rect")
      .attr("width", 13)
      .attr("height", 13)
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .attr("fill-opacity", d => d.selected ? .94 : .7);
    legendRows.append("text")
      .attr("class", "mark-label")
      .attr("x", 20)
      .attr("y", 11)
      .style("font-size", "11px")
      .attr("font-weight", d => d.selected ? 800 : 600)
      .text(d => `${d.text} ${Math.round(d.p * 100)}%`);

    const pointer = svg.append("g").attr("transform", `translate(${cx},${cy - outerR - 18})`);
    pointer.append("path")
      .attr("d", "M0,0L-13,-24H13Z")
      .attr("fill", palette.red)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round");
    pointer.append("circle")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 4)
      .attr("fill", palette.redHover);

    const tickLayer = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    d3.range(24).forEach(i => {
      const angle = i * 15 * Math.PI / 180;
      const r0 = outerR + 6;
      const r1 = outerR + (i % 3 === 0 ? 15 : 11);
      tickLayer.append("line")
        .attr("x1", Math.sin(angle) * r0)
        .attr("y1", -Math.cos(angle) * r0)
        .attr("x2", Math.sin(angle) * r1)
        .attr("y2", -Math.cos(angle) * r1)
        .attr("stroke", i % 3 === 0 ? palette.gray600 : palette.gray300)
        .attr("stroke-width", i % 3 === 0 ? 1.6 : 1);
    });

    const result = svg.append("g").attr("class", "token-roulette-result").attr("opacity", 0);
    result.append("rect").attr("x", 354).attr("y", 272).attr("width", 112).attr("height", 48).attr("rx", 10).attr("fill", palette.redHighlight).attr("stroke", palette.red);
    result.append("text").attr("class", "mark-label").attr("x", 410).attr("y", 303).attr("text-anchor", "middle").attr("font-size", 22).attr("font-weight", 800).attr("fill", palette.redHover).text(selected.text);
    result.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".28s").attr("begin", "3.48s").attr("fill", "freeze");
  }

  function renderTemperatureSoftmax() {
    const svg = prepareSvg("temperature-softmax", "Temperature softmax", "The same logits are normalized into sharper or flatter next-token distributions.");
    const logits = [
      { token: "safe", logit: 3.6 },
      { token: "fast", logit: 2.3 },
      { token: "novel", logit: 1.8 },
      { token: "rare", logit: 1.1 },
      { token: "wild", logit: .6 }
    ];
    const softmax = temp => {
      const weights = logits.map(d => Math.exp(d.logit / temp));
      const sum = d3.sum(weights);
      return logits.map((d, i) => ({ ...d, p: weights[i] / sum }));
    };
    const panels = [
      { label: "T = 0.4", color: palette.blue, y: 72, values: softmax(.4) },
      { label: "T = 1.4", color: palette.orange, y: 236, values: softmax(1.4) }
    ];
    const x = d3.scaleLinear().domain([0, .84]).range([150, 486]);
    const rowHeight = 22;
    panels.forEach((panel, panelIndex) => {
      svg.append("text").attr("class", "mark-label").attr("x", 48).attr("y", panel.y - 18).attr("font-weight", 800).text(panel.label);
      const rows = svg.append("g").selectAll(`g.temperature-row-${panelIndex}`).data(panel.values).join("g")
        .attr("transform", (d, i) => `translate(0,${panel.y + i * 27})`);
      rows.append("text")
        .attr("class", "mark-label")
        .attr("x", 104)
        .attr("y", 16)
        .attr("text-anchor", "end")
        .text(d => d.token);
      rows.append("rect")
        .attr("x", x(0))
        .attr("y", 1)
        .attr("width", d => x(d.p) - x(0))
        .attr("height", rowHeight)
        .attr("rx", 5)
        .attr("fill", (d, i) => i === 0 ? panel.color : palette.gray300)
        .attr("fill-opacity", (d, i) => i === 0 ? .86 : .55)
        .each(function (d, i) {
          d3.select(this).append("animate")
            .attr("attributeName", "width")
            .attr("from", 0)
            .attr("to", x(d.p) - x(0))
            .attr("dur", ".8s")
            .attr("begin", `${.12 + panelIndex * .35 + i * .05}s`)
            .attr("fill", "freeze");
        });
      rows.append("text")
        .attr("class", "caption")
        .attr("x", d => x(d.p) + 7)
        .attr("y", 16)
        .text(d => `${Math.round(d.p * 100)}%`);
    });
    svg.append("path")
      .attr("d", "M66,206H494")
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.4)
      .attr("stroke-dasharray", "4 5");
  }

  function renderNucleusSampling() {
    const svg = prepareSvg("nucleus-sampling", "Nucleus sampling", "Top-p keeps the smallest ordered set whose cumulative probability exceeds the threshold.");
    const p = .86;
    const tokens = [
      { token: "answer", prob: .39, color: palette.blue },
      { token: "explain", prob: .22, color: palette.green },
      { token: "show", prob: .15, color: palette.orange },
      { token: "derive", prob: .10, color: palette.red },
      { token: "maybe", prob: .06, color: palette.gray400 },
      { token: "wildcard", prob: .04, color: palette.gray300 },
      { token: "noise", prob: .03, color: palette.gray300 },
      { token: "other", prob: .01, color: palette.gray300 }
    ];
    let cumulative = 0;
    tokens.forEach(token => {
      token.x0 = cumulative;
      cumulative += token.prob;
      token.x1 = cumulative;
      token.included = token.x0 < p;
    });
    const strip = { x: 54, y: 126, w: 452, h: 52 };
    svg.append("rect").attr("x", strip.x).attr("y", strip.y).attr("width", strip.w).attr("height", strip.h).attr("rx", 8).attr("fill", palette.gray100);
    const rects = svg.append("g").selectAll("rect.nucleus-segment").data(tokens).join("rect")
      .attr("class", "nucleus-segment")
      .attr("x", d => strip.x + d.x0 * strip.w)
      .attr("y", strip.y)
      .attr("width", d => d.prob * strip.w)
      .attr("height", strip.h)
      .attr("rx", 6)
      .attr("fill", d => d.included ? d.color : palette.gray300)
      .attr("fill-opacity", d => d.included ? .86 : .34)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.5);
    fadeIn(rects, .12, .45);
    svg.append("line")
      .attr("x1", strip.x + p * strip.w)
      .attr("x2", strip.x + p * strip.w)
      .attr("y1", strip.y - 22)
      .attr("y2", strip.y + strip.h + 28)
      .attr("stroke", palette.redHover)
      .attr("stroke-width", 2.6)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".22s")
      .attr("begin", "1.05s")
      .attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", strip.x + p * strip.w - 6).attr("y", strip.y - 30).attr("text-anchor", "end").attr("font-weight", 800).text("p = 0.86");
    const pills = svg.append("g").selectAll("g.nucleus-pill").data(tokens).join("g")
      .attr("class", "nucleus-pill")
      .attr("transform", (d, i) => `translate(${64 + (i % 4) * 122},${236 + Math.floor(i / 4) * 58})`)
      .attr("opacity", 0);
    pills.append("rect").attr("width", 104).attr("height", 34).attr("rx", 8).attr("fill", d => d.included ? palette.surface : palette.gray100).attr("stroke", d => d.included ? d.color : palette.gray300).attr("stroke-width", d => d.included ? 2 : 1.2);
    pills.append("text").attr("class", "mark-label").attr("x", 52).attr("y", 22).attr("text-anchor", "middle").style("font-size", "12px").text(d => d.token);
    pills.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", d => d.included ? 1 : .38).attr("dur", ".24s").attr("begin", (d, i) => `${.55 + i * .06}s`).attr("fill", "freeze");
  }

  function renderAttentionRouting() {
    const svg = prepareSvg("attention-routing", "Attention routing", "A query token weights earlier tokens before producing the next representation.");
    const tokens = [
      { text: "The", x: 72, w: 54, weight: .10 },
      { text: "key", x: 142, w: 54, weight: .38 },
      { text: "opens", x: 212, w: 78, weight: .14 },
      { text: "the", x: 306, w: 54, weight: .26 },
      { text: "door", x: 376, w: 62, weight: .12 }
    ];
    const query = { text: "it", x: 468, y: 270, w: 52, h: 38 };
    const tokenGroups = svg.append("g").selectAll("g.attention-token").data(tokens).join("g")
      .attr("class", "attention-token")
      .attr("transform", d => `translate(${d.x},112)`);
    tokenGroups.append("rect").attr("width", d => d.w).attr("height", 36).attr("rx", 8).attr("fill", palette.surface).attr("stroke", palette.gray300).attr("stroke-width", 1.6);
    tokenGroups.append("text").attr("class", "mark-label").attr("x", d => d.w / 2).attr("y", 23).attr("text-anchor", "middle").text(d => d.text);

    const queryGroup = svg.append("g").attr("transform", `translate(${query.x},${query.y})`);
    queryGroup.append("rect").attr("width", query.w).attr("height", query.h).attr("rx", 9).attr("fill", palette.redHighlight).attr("stroke", palette.red).attr("stroke-width", 2.2);
    queryGroup.append("text").attr("class", "mark-label").attr("x", query.w / 2).attr("y", 24).attr("text-anchor", "middle").attr("font-weight", 800).text(query.text);
    queryGroup.append("text").attr("class", "caption").attr("x", query.w / 2).attr("y", 56).attr("text-anchor", "middle").text("query");

    const paths = svg.append("g").selectAll("path.attention-link").data(tokens).join("path")
      .attr("class", "attention-link")
      .attr("d", d => {
        const sx = query.x + query.w / 2;
        const sy = query.y;
        const tx = d.x + d.w / 2;
        const ty = 150;
        return `M${sx},${sy}C${sx - 54},${sy - 78} ${tx + 38},${ty + 74} ${tx},${ty}`;
      })
      .attr("fill", "none")
      .attr("stroke", d => d.weight > .25 ? palette.red : palette.blue)
      .attr("stroke-width", d => 1.4 + d.weight * 14)
      .attr("stroke-opacity", d => .22 + d.weight * 1.05)
      .attr("stroke-linecap", "round");
    drawPath(paths, .18, .95);

    const heatX = 74;
    const heatY = 338;
    const heatW = 76;
    tokens.forEach((token, i) => {
      const fill = token.weight > .25 ? palette.red : token.weight > .12 ? palette.orange : palette.blueHighlight;
      svg.append("rect")
        .attr("x", heatX + i * heatW)
        .attr("y", heatY)
        .attr("width", heatW - 8)
        .attr("height", 28)
        .attr("rx", 6)
        .attr("fill", fill)
        .attr("fill-opacity", token.weight > .25 ? .86 : .48)
        .attr("stroke", palette.surface)
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".3s")
        .attr("begin", `${.72 + i * .08}s`)
        .attr("fill", "freeze");
      svg.append("text")
        .attr("class", token.weight > .25 ? "reverse-label" : "caption")
        .attr("x", heatX + i * heatW + (heatW - 8) / 2)
        .attr("y", heatY + 19)
        .attr("text-anchor", "middle")
        .text(`${Math.round(token.weight * 100)}%`);
    });
  }

  function renderAttentionArcDecoding() {
    const svg = prepareSvg("attention-arc-decoding", "Attention arc decoding", "Autoregressive decoding draws attention arcs into empty slots before revealing three generated tokens.");
    const tokenY = 244;
    const tokenH = 40;
    const gap = 10;
    const tokens = [
      { text: "The", kind: "prompt", w: 52 },
      { text: "model", kind: "prompt", w: 74 },
      { text: "predicts", kind: "prompt", w: 90 },
      { text: "the", kind: "generated", w: 54, step: 0, color: palette.red, fill: palette.redHighlight },
      { text: "next", kind: "generated", w: 62, step: 1, color: palette.orange, fill: palette.orangeHighlight },
      { text: "word", kind: "generated", w: 62, step: 2, color: palette.purple, fill: palette.purpleHighlight }
    ];
    const totalW = d3.sum(tokens, d => d.w) + gap * (tokens.length - 1);
    let cursor = (width - totalW) / 2;
    tokens.forEach((token, index) => {
      token.index = index;
      token.x = cursor;
      token.y = tokenY;
      token.cx = cursor + token.w / 2;
      token.generated = token.kind === "generated";
      cursor += token.w + gap;
    });
    const steps = [
      { step: 1, target: 3, begin: .18, color: palette.red, weights: [.18, .30, .52] },
      { step: 2, target: 4, begin: .86, color: palette.orange, weights: [.10, .16, .26, .48] },
      { step: 3, target: 5, begin: 1.54, color: palette.purple, weights: [.08, .12, .18, .25, .37] }
    ];
    const stage = svg.append("g").attr("class", "attention-arc-decoding-stage");
    stage.append("rect")
      .attr("x", 34)
      .attr("y", 82)
      .attr("width", 492)
      .attr("height", 260)
      .attr("rx", 14)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray200);
    stage.append("path")
      .attr("d", `M${tokens[0].x},${tokenY + tokenH + 22}H${tokens[5].x + tokens[5].w}`)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round")
      .attr("stroke-dasharray", "5 7");
    stage.append("text")
      .attr("class", "caption")
      .attr("x", tokens[0].x)
      .attr("y", tokenY + tokenH + 48)
      .text("context grows left to right");

    const haloLayer = stage.append("g").attr("class", "attention-arc-context-halos");
    steps.forEach(step => {
      tokens.slice(0, step.target).forEach((source, sourceIndex) => {
        const halo = haloLayer.append("rect")
          .attr("x", source.x - 4)
          .attr("y", source.y - 4)
          .attr("width", source.w + 8)
          .attr("height", tokenH + 8)
          .attr("rx", 10)
          .attr("fill", source.generated ? source.fill : palette.blueHighlight)
          .attr("opacity", 0);
        halo.append("animate")
          .attr("attributeName", "opacity")
          .attr("values", "0;.28;.08")
          .attr("keyTimes", "0;.42;1")
          .attr("dur", ".48s")
          .attr("begin", `${step.begin + sourceIndex * .018}s`)
          .attr("fill", "freeze");
      });
    });

    const arcLayer = stage.append("g").attr("class", "attention-arc-layer");
    const arcPath = (source, target, stepIndex) => {
      const distance = Math.abs(target.index - source.index);
      const apexY = tokenY - 48 - distance * 10 - stepIndex * 7;
      return `M${source.cx},${tokenY + 2}C${source.cx},${apexY} ${target.cx},${apexY} ${target.cx},${tokenY + 2}`;
    };
    steps.forEach(step => {
      const target = tokens[step.target];
      const sources = tokens.slice(0, step.target).map((source, sourceIndex) => ({
        source,
        target,
        weight: step.weights[sourceIndex],
        step
      }));
      const paths = arcLayer.selectAll(`path.decode-step-${step.step}`)
        .data(sources)
        .join("path")
        .attr("id", d => `attention-arc-decoding-step-${d.step.step}-source-${d.source.index}`)
        .attr("class", `attention-arc decode-step-${step.step}`)
        .attr("data-decode-step", step.step)
        .attr("data-source-token", d => d.source.text)
        .attr("data-target-token", d => d.target.text)
        .attr("data-attention-weight", d => d.weight.toFixed(2))
        .attr("d", d => arcPath(d.source, d.target, step.step))
        .attr("fill", "none")
        .attr("stroke", d => d.source.generated ? d.source.color : d.weight > .28 ? step.color : palette.blue)
        .attr("stroke-width", d => 1.2 + d.weight * 7.2)
        .attr("stroke-opacity", d => .22 + d.weight * .95)
        .attr("stroke-linecap", "round");
      paths.each(function (d, i) {
        const length = this.getTotalLength();
        d3.select(this)
          .attr("stroke-dasharray", `${length} ${length}`)
          .attr("stroke-dashoffset", 0)
          .append("animate")
          .attr("attributeName", "stroke-dashoffset")
          .attr("from", length)
          .attr("to", 0)
          .attr("dur", ".42s")
          .attr("begin", `${d.step.begin + i * .014}s`)
          .attr("fill", "freeze");
      });
      const query = stage.append("g")
        .attr("class", "decode-query-cursor")
        .attr("transform", `translate(${target.cx},${tokenY - 24})`)
        .attr("opacity", 0);
      query.append("circle")
        .attr("r", 12)
        .attr("fill", palette.surface)
        .attr("stroke", step.color)
        .attr("stroke-width", 2.2);
      query.append("text")
        .attr("class", "mark-label")
        .attr("x", 0)
        .attr("y", 4)
        .attr("text-anchor", "middle")
        .attr("font-size", 11)
        .attr("font-weight", 800)
        .text("Q");
      query.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1;1;0")
        .attr("keyTimes", "0;.2;.78;1")
        .attr("dur", ".58s")
        .attr("begin", `${step.begin - .04}s`)
        .attr("fill", "freeze");
    });

    const tokenLayer = stage.append("g").attr("class", "attention-arc-token-layer");
    const tokenGroups = tokenLayer.selectAll("g.attention-arc-token")
      .data(tokens)
      .join("g")
      .attr("class", d => `attention-arc-token ${d.kind}`)
      .attr("transform", d => `translate(${d.x},${d.y})`);
    tokenGroups.append("rect")
      .attr("width", d => d.w)
      .attr("height", tokenH)
      .attr("rx", 9)
      .attr("fill", d => d.generated ? palette.surface : palette.surface)
      .attr("stroke", d => d.generated ? palette.gray300 : palette.gray400)
      .attr("stroke-width", d => d.generated ? 1.4 : 1.6)
      .attr("stroke-dasharray", d => d.generated ? "5 5" : null);
    tokenGroups.filter(d => !d.generated).append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.w / 2)
      .attr("y", 25)
      .attr("text-anchor", "middle")
      .attr("font-weight", 760)
      .text(d => d.text);
    const generated = tokenGroups.filter(d => d.generated);
    generated.append("rect")
      .attr("width", d => d.w)
      .attr("height", tokenH)
      .attr("rx", 9)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 2.2)
      .attr("opacity", 0)
      .each(function (d) {
        const begin = steps[d.step].begin + .46;
        d3.select(this).append("animate")
          .attr("attributeName", "opacity")
          .attr("from", 0)
          .attr("to", 1)
          .attr("dur", ".22s")
          .attr("begin", `${begin}s`)
          .attr("fill", "freeze");
      });
    generated.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.w / 2)
      .attr("y", 25)
      .attr("text-anchor", "middle")
      .attr("font-weight", 820)
      .attr("opacity", 0)
      .text(d => d.text)
      .each(function (d) {
        const begin = steps[d.step].begin + .50;
        d3.select(this).append("animate")
          .attr("attributeName", "opacity")
          .attr("from", 0)
          .attr("to", 1)
          .attr("dur", ".18s")
          .attr("begin", `${begin}s`)
          .attr("fill", "freeze");
      });
    generated.append("text")
      .attr("class", "caption")
      .attr("x", d => d.w / 2)
      .attr("y", 58)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("opacity", 0)
      .text((d, i) => `step ${i + 1}`)
      .each(function (d) {
        const begin = steps[d.step].begin + .55;
        d3.select(this).append("animate")
          .attr("attributeName", "opacity")
          .attr("from", 0)
          .attr("to", .9)
          .attr("dur", ".18s")
          .attr("begin", `${begin}s`)
          .attr("fill", "freeze");
      });
  }

  function renderEmbeddingNeighborhood() {
    const svg = prepareSvg("embedding-neighborhood", "Embedding neighborhood", "A query vector sits near semantically related vectors in a compact embedding space.");
    const points = [
      { text: "query", x: 242, y: 206, r: 9, color: palette.red, query: true },
      { text: "fruit", x: 184, y: 176, r: 6, color: palette.blue, near: true },
      { text: "pear", x: 214, y: 244, r: 6, color: palette.blue, near: true },
      { text: "recipe", x: 288, y: 166, r: 6, color: palette.blue, near: true },
      { text: "tree", x: 314, y: 238, r: 6, color: palette.blue, near: true },
      { text: "cache", x: 104, y: 306, r: 5, color: palette.gray400 },
      { text: "orbit", x: 430, y: 110, r: 5, color: palette.gray400 },
      { text: "ledger", x: 404, y: 306, r: 5, color: palette.gray400 },
      { text: "syntax", x: 126, y: 112, r: 5, color: palette.gray400 },
      { text: "matrix", x: 470, y: 226, r: 5, color: palette.gray400 }
    ];
    const query = points[0];
    svg.append("rect").attr("x", 52).attr("y", 86).attr("width", 456).attr("height", 266).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("path").attr("d", "M68,278C170,222 258,292 366,238S464,150 496,182").attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", 1.4).attr("stroke-dasharray", "5 6");
    const links = svg.append("g").selectAll("line.embedding-link").data(points.filter(d => d.near)).join("line")
      .attr("class", "embedding-link")
      .attr("x1", query.x).attr("y1", query.y)
      .attr("x2", d => d.x).attr("y2", d => d.y)
      .attr("stroke", palette.blue)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", .42);
    drawPath(links, .35, .8);
    const dots = svg.append("g").selectAll("g.embedding-dot").data(points).join("g")
      .attr("class", "embedding-dot")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    dots.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => d.color)
      .attr("fill-opacity", d => d.query ? .96 : d.near ? .76 : .42)
      .attr("stroke", palette.surface)
      .attr("stroke-width", d => d.query ? 2.2 : 1.4);
    dots.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.query ? 14 : 10)
      .attr("y", 4)
      .style("font-size", "11px")
      .text(d => d.text);
    fadeIn(dots, .1, .5);
    const ring = svg.append("circle").attr("cx", query.x).attr("cy", query.y).attr("r", 26).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2).attr("opacity", .85);
    ring.append("animate").attr("attributeName", "r").attr("values", "18;52;64").attr("dur", "1.4s").attr("begin", ".8s").attr("fill", "freeze");
    ring.append("animate").attr("attributeName", "opacity").attr("values", ".9;.34;0").attr("dur", "1.4s").attr("begin", ".8s").attr("fill", "freeze");
  }

  function renderKvCacheGrowth() {
    const svg = prepareSvg("kv-cache-growth", "KV cache growth", "Autoregressive generation appends reusable key-value states while the active query moves forward.");
    const tokens = ["Prompt", "cat", "sat", "on", "mat", "."];
    const rows = [
      { name: "K", y: 136, color: palette.blue },
      { name: "V", y: 202, color: palette.green }
    ];
    const startX = 104;
    const colW = 58;
    const gap = 10;
    const cellH = 42;
    rows.forEach(row => {
      svg.append("text").attr("class", "mark-label").attr("x", 76).attr("y", row.y + 27).attr("text-anchor", "end").attr("font-weight", 800).text(row.name);
      tokens.forEach((token, i) => {
        const x = startX + i * (colW + gap);
        const rect = svg.append("rect")
          .attr("x", x)
          .attr("y", row.y)
          .attr("width", colW)
          .attr("height", cellH)
          .attr("rx", 7)
          .attr("fill", palette.gray100)
          .attr("stroke", palette.surface)
          .attr("stroke-width", 1.4);
        rect.append("animate")
          .attr("attributeName", "fill")
          .attr("values", `${palette.gray100};${row.color}`)
          .attr("dur", ".22s")
          .attr("begin", `${.35 + i * .36}s`)
          .attr("fill", "freeze");
        rect.append("animate")
          .attr("attributeName", "fill-opacity")
          .attr("values", ".58;.82")
          .attr("dur", ".22s")
          .attr("begin", `${.35 + i * .36}s`)
          .attr("fill", "freeze");
      });
    });
    tokens.forEach((token, i) => {
      const x = startX + i * (colW + gap) + colW / 2;
      svg.append("text").attr("class", "caption").attr("x", x).attr("y", 116).attr("text-anchor", "middle").style("font-size", "11px").text(token);
      svg.append("text").attr("class", "caption").attr("x", x).attr("y", 276).attr("text-anchor", "middle").style("font-size", "10px").text(`t${i}`);
    });
    const queryY = 326;
    const queryPath = svg.append("path")
      .attr("id", "kv-cache-query-path")
      .attr("d", `M${startX + colW / 2},${queryY}H${startX + (tokens.length - 1) * (colW + gap) + colW / 2}`)
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 2)
      .attr("stroke-linecap", "round");
    drawPath(queryPath, .25, 2.1);
    const query = svg.append("g");
    query.append("circle").attr("r", 9).attr("fill", palette.red);
    query.append("text").attr("class", "caption").attr("x", 0).attr("y", 28).attr("text-anchor", "middle").attr("font-weight", 800).text("Q");
    query.append("animateMotion")
      .attr("dur", "2.15s")
      .attr("begin", ".28s")
      .attr("fill", "freeze")
      .append("mpath")
      .attr("href", "#kv-cache-query-path");
    const reuse = svg.append("path")
      .attr("d", `M${startX},88H${startX + (tokens.length - 2) * (colW + gap) + colW}`)
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("opacity", 0);
    reuse.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", .82).attr("dur", ".25s").attr("begin", "2.3s").attr("fill", "freeze");
  }

  function renderAttentionMatrixTiles() {
    const svg = prepareSvg("attention-tiles", "Attention matrix tiles", "Causal self-attention as a tiled score matrix with masked future tokens and an active query row.");
    const n = 9;
    const cell = 26;
    const gap = 4;
    const x0 = 96;
    const y0 = 88;
    const cells = [];
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        const causal = col <= row;
        const diagonal = row === col;
        const weight = causal ? Math.max(.08, .86 - Math.abs(row - col) * .14 + ((row + col) % 3) * .035) : 0;
        cells.push({ row, col, causal, diagonal, weight });
      }
    }

    svg.append("rect").attr("x", x0 - 18).attr("y", y0 - 18).attr("width", n * (cell + gap) + 14).attr("height", n * (cell + gap) + 14).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);

    const tileColor = d => !d.causal ? palette.gray100 : d.diagonal ? palette.red : d.weight > .55 ? palette.orange : d.weight > .28 ? palette.green : palette.blueHighlight;
    const tiles = svg.append("g").selectAll("rect.attention-tile").data(cells).join("rect")
      .attr("class", "attention-tile")
      .attr("x", d => x0 + d.col * (cell + gap))
      .attr("y", d => y0 + d.row * (cell + gap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 4)
      .attr("fill", tileColor)
      .attr("fill-opacity", d => d.causal ? .36 + d.weight * .58 : .36)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2);
    tiles.append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".35s")
      .attr("begin", d => `${.12 + (d.row * n + d.col) * .006}s`)
      .attr("fill", "freeze");

    const activeRow = 6;
    const rowBand = svg.append("rect")
      .attr("x", x0 - 8)
      .attr("y", y0 + activeRow * (cell + gap) - 8)
      .attr("width", n * (cell + gap) - gap + 16)
      .attr("height", cell + 16)
      .attr("rx", 8)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 3)
      .attr("opacity", 0);
    rowBand.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", .88).attr("dur", ".24s").attr("begin", "1.15s").attr("fill", "freeze");

    const labels = d3.range(n);
    svg.append("g").selectAll("text.query-label").data(labels).join("text")
      .attr("class", "caption")
      .attr("x", x0 - 14)
      .attr("y", d => y0 + d * (cell + gap) + cell / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => `q${d}`);
    svg.append("g").selectAll("text.key-label").data(labels).join("text")
      .attr("class", "caption")
      .attr("x", d => x0 + d * (cell + gap) + cell / 2)
      .attr("y", y0 - 24)
      .attr("text-anchor", "middle")
      .text(d => `k${d}`);

    const legend = svg.append("g").attr("transform", "translate(388,102)");
    [
      { name: "active row", color: palette.red },
      { name: "near context", color: palette.orange },
      { name: "far context", color: palette.blueHighlight },
      { name: "future mask", color: palette.gray100 }
    ].forEach((item, i) => {
      const row = legend.append("g").attr("transform", `translate(0,${i * 29})`);
      row.append("rect").attr("width", 18).attr("height", 18).attr("rx", 4).attr("fill", item.color).attr("fill-opacity", i === 3 ? .56 : .86).attr("stroke", palette.surface);
      row.append("text").attr("class", "mark-label").attr("x", 26).attr("y", 14).style("font-size", "11px").text(item.name);
    });

    const headY = 338;
    const heads = [
      { name: "head 1", color: palette.blue, offset: 0 },
      { name: "head 2", color: palette.green, offset: 1 },
      { name: "head 3", color: palette.purple, offset: 2 }
    ];
    heads.forEach((head, i) => {
      const group = svg.append("g").attr("transform", `translate(${96 + i * 132},${headY})`);
      group.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -8).style("font-size", "10px").text(head.name);
      d3.range(7).forEach(j => {
        group.append("rect")
          .attr("x", j * 15)
          .attr("y", 0)
          .attr("width", 12)
          .attr("height", 14 + ((j + head.offset) % 4) * 5)
          .attr("rx", 3)
          .attr("fill", j === activeRow % 7 ? palette.red : head.color)
          .attr("fill-opacity", .74)
          .append("animate")
          .attr("attributeName", "height")
          .attr("values", `4;${14 + ((j + head.offset) % 4) * 5};${14 + ((j + head.offset) % 4) * 5}`)
          .attr("dur", "1.4s")
          .attr("begin", `${.35 + i * .12 + j * .03}s`)
          .attr("fill", "freeze");
      });
    });
  }

  function renderQkvProjectionFlow() {
    const svg = prepareSvg("qkv-projection-flow", "QKV projection flow", "Token embeddings split into query, key, and value projections before attention.");
    const tokens = ["The", "model", "routes", "tokens"];
    const inputX = 58;
    const inputY = 104;
    const tokenH = 42;
    const tokenW = 76;
    const rows = tokens.map((token, i) => ({ token, x: inputX, y: inputY + i * 58, color: colors[i % colors.length] }));
    const planes = [
      { name: "Q", x: 198, y: 84, color: palette.red },
      { name: "K", x: 300, y: 84, color: palette.blue },
      { name: "V", x: 402, y: 84, color: palette.green }
    ];

    rows.forEach((row, i) => {
      const g = svg.append("g").attr("transform", `translate(${row.x},${row.y})`);
      g.append("rect").attr("width", tokenW).attr("height", tokenH).attr("rx", 8).attr("fill", row.color).attr("fill-opacity", .82).attr("stroke", palette.surface);
      g.append("text").attr("class", "reverse-label").attr("x", tokenW / 2).attr("y", 26).attr("text-anchor", "middle").attr("font-weight", 800).text(row.token);
      fadeIn(g, .08 + i * .05, .34);
    });

    planes.forEach((plane, planeIndex) => {
      const g = svg.append("g").attr("transform", `translate(${plane.x},${plane.y})`);
      g.append("rect").attr("width", 64).attr("height", 232).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", plane.color).attr("stroke-width", 2);
      g.append("text").attr("class", "mark-label").attr("x", 32).attr("y", -12).attr("text-anchor", "middle").attr("font-weight", 800).attr("fill", plane.color).text(plane.name);
      rows.forEach((row, i) => {
        g.append("rect")
          .attr("x", 12)
          .attr("y", 18 + i * 50)
          .attr("width", 40)
          .attr("height", 32)
          .attr("rx", 6)
          .attr("fill", plane.color)
          .attr("fill-opacity", .28 + i * .09)
          .append("animate")
          .attr("attributeName", "fill-opacity")
          .attr("values", `.16;${.72 - planeIndex * .08};${.28 + i * .09}`)
          .attr("dur", "1.2s")
          .attr("begin", `${.6 + planeIndex * .16 + i * .04}s`)
          .attr("fill", "freeze");
      });
    });

    rows.forEach((row, rowIndex) => {
      planes.forEach((plane, planeIndex) => {
        const path = svg.append("path")
          .attr("id", `qkv-projection-flow-${rowIndex}-${planeIndex}`)
          .attr("d", `M${row.x + tokenW},${row.y + tokenH / 2}C${row.x + 118},${row.y + tokenH / 2} ${plane.x - 42},${plane.y + 34 + rowIndex * 50} ${plane.x + 12},${plane.y + 34 + rowIndex * 50}`)
          .attr("fill", "none")
          .attr("stroke", plane.color)
          .attr("stroke-opacity", .34)
          .attr("stroke-width", 2)
          .attr("stroke-linecap", "round");
        drawPath(path, .28 + rowIndex * .04 + planeIndex * .05, .9);
        const dot = svg.append("circle").attr("r", 4.5).attr("fill", plane.color);
        dot.append("animateMotion")
          .attr("dur", ".95s")
          .attr("begin", `${.34 + rowIndex * .05 + planeIndex * .08}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#qkv-projection-flow-${rowIndex}-${planeIndex}`);
      });
    });

    const attention = svg.append("g").attr("transform", "translate(196,348)");
    attention.append("rect").attr("width", 272).attr("height", 34).attr("rx", 9).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    attention.append("text").attr("class", "mark-label").attr("x", 136).attr("y", 22).attr("text-anchor", "middle").attr("font-weight", 800).text("scaled dot-product attention");
    fadeIn(attention, 1.25, .35);
  }

  function renderLoraRankUpdate() {
    const svg = prepareSvg("lora-rank-update", "LoRA rank update", "Frozen model weights receive a compact low-rank adaptation update.");

    const drawMatrix = (group, rows, cols, cell, colorFn, delayBase = .1) => {
      const cells = d3.range(rows * cols).map(index => ({ row: Math.floor(index / cols), col: index % cols, index }));
      const rects = group.selectAll("rect.matrix-cell").data(cells).join("rect")
        .attr("class", "matrix-cell")
        .attr("x", d => d.col * (cell + 3))
        .attr("y", d => d.row * (cell + 3))
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 3)
        .attr("fill", colorFn)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1);
      rects.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".35s")
        .attr("begin", d => `${delayBase + d.index * .01}s`)
        .attr("fill", "freeze");
      return rects;
    };

    const base = svg.append("g").attr("transform", "translate(58,112)");
    base.append("text").attr("class", "mark-label").attr("x", 62).attr("y", -18).attr("text-anchor", "middle").text("frozen W");
    drawMatrix(base, 7, 7, 16, d => (d.row + d.col) % 2 ? palette.gray200 : palette.gray100, .08);

    const a = svg.append("g").attr("transform", "translate(224,104)");
    a.append("text").attr("class", "mark-label").attr("x", 22).attr("y", -18).attr("text-anchor", "middle").text("A");
    drawMatrix(a, 7, 2, 16, d => [palette.blue, palette.green][d.col], .34);

    const b = svg.append("g").attr("transform", "translate(302,126)");
    b.append("text").attr("class", "mark-label").attr("x", 63).attr("y", -18).attr("text-anchor", "middle").text("B");
    drawMatrix(b, 2, 7, 16, d => [palette.orange, palette.purple][d.row], .52);

    const delta = svg.append("g").attr("transform", "translate(410,112)");
    delta.append("text").attr("class", "mark-label").attr("x", 62).attr("y", -18).attr("text-anchor", "middle").text("Delta W");
    drawMatrix(delta, 7, 7, 16, d => {
      const score = (d.row * 2 + d.col * 3) % 6;
      return [palette.blueHighlight, palette.greenHighlight, palette.orangeHighlight, palette.purpleHighlight, palette.yellowHighlight, palette.redHighlight][score];
    }, .82);

    const formula = svg.append("g").attr("transform", "translate(82,306)");
    [
      { text: "W", x: 0, fill: palette.gray700 },
      { text: "+", x: 64, fill: palette.ink },
      { text: "B", x: 118, fill: palette.orange },
      { text: "A", x: 170, fill: palette.blue },
      { text: "=", x: 230, fill: palette.ink },
      { text: "adapted layer", x: 306, fill: palette.red }
    ].forEach((item, i) => {
      const label = formula.append("text").attr("class", "mark-label").attr("x", item.x).attr("y", 0).attr("font-size", i === 5 ? 18 : 25).attr("font-weight", 800).attr("fill", item.fill).text(item.text);
      label.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".24s").attr("begin", `${1.15 + i * .08}s`).attr("fill", "freeze");
    });

    [["M184,170C206,170 210,154 224,154", palette.blue], ["M270,154C288,154 292,154 302,154", palette.orange], ["M394,154C404,154 408,154 410,154", palette.red]].forEach(([d, stroke], i) => {
      const path = svg.append("path").attr("d", d).attr("fill", "none").attr("stroke", stroke).attr("stroke-width", 2.2).attr("stroke-linecap", "round");
      drawPath(path, .65 + i * .18, .7);
    });
  }

  function renderFlashAttentionBlocks() {
    const svg = prepareSvg("flashattention-blocks", "FlashAttention blocks", "Tiled attention blocks reuse SRAM to reduce memory traffic.");

    const grid = { x: 68, y: 96, n: 8, cell: 24, gap: 3 };
    const blocks = [];
    for (let br = 0; br < 4; br += 1) {
      for (let bc = 0; bc < 4; bc += 1) blocks.push({ br, bc, active: br === 2 && bc <= 2 });
    }
    const cells = d3.range(grid.n * grid.n).map(index => {
      const row = Math.floor(index / grid.n);
      const col = index % grid.n;
      return { row, col, future: col > row, block: `${Math.floor(row / 2)}-${Math.floor(col / 2)}` };
    });

    svg.append("rect").attr("x", grid.x - 14).attr("y", grid.y - 14).attr("width", 234).attr("height", 234).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("g").selectAll("rect.flash-cell").data(cells).join("rect")
      .attr("class", "flash-cell")
      .attr("x", d => grid.x + d.col * (grid.cell + grid.gap))
      .attr("y", d => grid.y + d.row * (grid.cell + grid.gap))
      .attr("width", grid.cell)
      .attr("height", grid.cell)
      .attr("rx", 3)
      .attr("fill", d => d.future ? palette.gray100 : ((d.row + d.col) % 3 ? palette.blueHighlight : palette.greenHighlight))
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".3s")
      .attr("begin", d => `${.08 + (d.row * grid.n + d.col) * .004}s`)
      .attr("fill", "freeze");

    blocks.forEach((block, i) => {
      const rect = svg.append("rect")
        .attr("x", grid.x + block.bc * 2 * (grid.cell + grid.gap) - 4)
        .attr("y", grid.y + block.br * 2 * (grid.cell + grid.gap) - 4)
        .attr("width", 2 * grid.cell + grid.gap + 8)
        .attr("height", 2 * grid.cell + grid.gap + 8)
        .attr("rx", 7)
        .attr("fill", "none")
        .attr("stroke", block.active ? palette.red : palette.gray300)
        .attr("stroke-width", block.active ? 3 : 1.2)
        .attr("opacity", block.active ? 0 : .44);
      if (block.active) {
        rect.append("animate").attr("attributeName", "opacity").attr("values", "0;1;.48;1").attr("dur", "1.4s").attr("begin", `${.9 + i * .04}s`).attr("fill", "freeze");
      }
    });

    const hbm = svg.append("g").attr("transform", "translate(340,96)");
    hbm.append("rect").attr("width", 150).attr("height", 74).attr("rx", 10).attr("fill", palette.gray100).attr("stroke", palette.gray300);
    hbm.append("text").attr("class", "mark-label").attr("x", 75).attr("y", 28).attr("text-anchor", "middle").attr("font-weight", 800).text("HBM");
    hbm.append("text").attr("class", "caption").attr("x", 75).attr("y", 51).attr("text-anchor", "middle").text("Q K V blocks");
    const sram = svg.append("g").attr("transform", "translate(340,224)");
    sram.append("rect").attr("width", 150).attr("height", 82).attr("rx", 10).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    sram.append("text").attr("class", "mark-label").attr("x", 75).attr("y", 30).attr("text-anchor", "middle").attr("font-weight", 800).text("SRAM tile");
    sram.append("text").attr("class", "caption").attr("x", 75).attr("y", 54).attr("text-anchor", "middle").text("softmax + output");

    const route = svg.append("path")
      .attr("id", "flashattention-blocks-route")
      .attr("d", "M334,134C298,134 292,188 334,240")
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(route, .55, 1.2);
    d3.range(4).forEach(i => {
      const dot = svg.append("circle").attr("r", 6).attr("fill", [palette.blue, palette.green, palette.orange, palette.red][i]);
      dot.append("animateMotion")
        .attr("dur", "1.25s")
        .attr("begin", `${.65 + i * .16}s`)
        .attr("fill", "freeze")
        .append("mpath")
        .attr("href", "#flashattention-blocks-route");
    });

  }

  function renderMoeRouterCapacity() {
    const svg = prepareSvg("moe-router-capacity", "MoE router capacity", "Sparse mixture-of-experts routing sends tokens to top-k experts while finite capacity creates overflow.");
    const tokenLabels = ["ctx", "retr", "plan", "sql", "tool", "json"];
    const expertIds = ["E0", "E1", "E2", "E3"];
    const tokenY = d3.scalePoint().domain(d3.range(tokenLabels.length)).range([106, 310]);
    const expertY = d3.scalePoint().domain(expertIds).range([104, 304]);
    const experts = expertIds.map((id, i) => ({ id, y: expertY(id), color: colors[i % colors.length] }));
    const tokens = tokenLabels.map((label, i) => ({ id: `T${i}`, label, y: tokenY(i), color: colors[i % colors.length] }));
    const tokenX = 58;
    const matrixX = 176;
    const matrixY = 98;
    const expertX = 382;
    const scoreMatrix = [
      [.72, .12, .18, .08],
      [.10, .64, .25, .12],
      [.09, .57, .11, .29],
      [.16, .08, .68, .22],
      [.12, .49, .32, .19],
      [.18, .16, .24, .58]
    ];
    const links = [
      { token: 0, expert: 0, p: .72, rank: 1 },
      { token: 0, expert: 2, p: .18, rank: 2 },
      { token: 1, expert: 1, p: .64, rank: 1 },
      { token: 1, expert: 2, p: .25, rank: 2 },
      { token: 2, expert: 1, p: .57, rank: 1 },
      { token: 2, expert: 3, p: .29, rank: 2 },
      { token: 3, expert: 2, p: .68, rank: 1 },
      { token: 3, expert: 0, p: .16, rank: 2 },
      { token: 4, expert: 1, p: .49, rank: 1, overflow: true },
      { token: 4, expert: 2, p: .32, rank: 2 },
      { token: 5, expert: 3, p: .58, rank: 1 },
      { token: 5, expert: 2, p: .24, rank: 2 }
    ];

    svg.append("text").attr("class", "mark-label").attr("x", tokenX + 34).attr("y", 72).attr("text-anchor", "middle").text("tokens");
    svg.append("text").attr("class", "mark-label").attr("x", matrixX + 54).attr("y", 72).attr("text-anchor", "middle").text("router scores");
    svg.append("text").attr("class", "mark-label").attr("x", expertX + 74).attr("y", 72).attr("text-anchor", "middle").text("capacity = 2");

    const cell = 17;
    const gap = 4;
    const scoreCells = [];
    scoreMatrix.forEach((row, r) => row.forEach((value, c) => scoreCells.push({ row: r, col: c, value, color: experts[c].color })));
    svg.append("rect").attr("x", matrixX - 14).attr("y", matrixY - 16).attr("width", 124).attr("height", 172).attr("rx", 9).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("g").selectAll("rect.moe-score-cell").data(scoreCells).join("rect")
      .attr("class", "moe-score-cell")
      .attr("x", d => matrixX + d.col * (cell + gap))
      .attr("y", d => matrixY + d.row * (cell + gap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 3)
      .attr("fill", d => d.color)
      .attr("fill-opacity", d => .16 + d.value * .78)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".32s")
      .attr("begin", d => `${.12 + (d.row * expertIds.length + d.col) * .01}s`)
      .attr("fill", "freeze");
    expertIds.forEach((id, i) => {
      svg.append("text").attr("class", "caption").attr("x", matrixX + i * (cell + gap) + cell / 2).attr("y", matrixY - 8).attr("text-anchor", "middle").text(id);
    });

    links.forEach((link, i) => {
      const token = tokens[link.token];
      const expert = experts[link.expert];
      const path = svg.append("path")
        .attr("id", `moe-router-capacity-route-${i}`)
        .attr("d", `M${tokenX + 72},${token.y}C${matrixX - 20},${token.y} ${matrixX + 134},${expert.y} ${expertX - 18},${expert.y}`)
        .attr("fill", "none")
        .attr("stroke", link.overflow ? palette.red : expert.color)
        .attr("stroke-width", link.rank === 1 ? 1.6 + link.p * 4 : 1.2 + link.p * 2.2)
        .attr("stroke-opacity", link.overflow ? .78 : link.rank === 1 ? .48 : .22)
        .attr("stroke-linecap", "round");
      drawPath(path, .42 + i * .035, .9);
      if (link.rank === 1 || link.overflow) {
        const dot = svg.append("circle").attr("r", link.overflow ? 5.4 : 4.6).attr("fill", link.overflow ? palette.red : expert.color).attr("stroke", palette.surface).attr("stroke-width", 1.2);
        dot.append("animateMotion")
          .attr("dur", ".95s")
          .attr("begin", `${.55 + i * .045}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#moe-router-capacity-route-${i}`);
      }
    });

    const tokenGroups = svg.append("g").selectAll("g.moe-token").data(tokens).join("g")
      .attr("class", "moe-token")
      .attr("transform", d => `translate(${tokenX},${d.y - 16})`);
    tokenGroups.append("rect").attr("width", 68).attr("height", 32).attr("rx", 8).attr("fill", d => d.color).attr("fill-opacity", .82).attr("stroke", palette.surface).attr("stroke-width", 1.5);
    tokenGroups.append("text").attr("class", "reverse-label").attr("x", 34).attr("y", 21).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.label);
    fadeIn(tokenGroups, .08, .35);

    const slots = {
      E0: ["T0", "T3"],
      E1: ["T1", "T2"],
      E2: ["T3", "T4"],
      E3: ["T5", ""]
    };
    const expertGroups = svg.append("g").selectAll("g.moe-expert").data(experts).join("g")
      .attr("class", "moe-expert")
      .attr("transform", d => `translate(${expertX},${d.y - 31})`);
    expertGroups.append("rect").attr("width", 136).attr("height", 62).attr("rx", 9).attr("fill", palette.gray50).attr("stroke", d => d.color).attr("stroke-width", 2);
    expertGroups.append("text").attr("class", "mark-label").attr("x", 20).attr("y", 37).attr("text-anchor", "middle").attr("font-weight", 800).text(d => d.id);
    expertGroups.each(function (expert) {
      const group = d3.select(this);
      slots[expert.id].forEach((tokenId, slotIndex) => {
        group.append("rect")
          .attr("x", 48 + slotIndex * 30)
          .attr("y", 18)
          .attr("width", 22)
          .attr("height", 22)
          .attr("rx", 5)
          .attr("fill", tokenId ? expert.color : palette.gray100)
          .attr("fill-opacity", tokenId ? .76 : .5)
          .attr("stroke", palette.surface);
        if (tokenId) group.append("text").attr("class", "reverse-label").attr("x", 59 + slotIndex * 30).attr("y", 33).attr("text-anchor", "middle").style("font-size", "9px").text(tokenId);
      });
      if (expert.id === "E1") {
        group.append("text").attr("class", "mark-label").attr("x", 112).attr("y", 18).attr("text-anchor", "middle").style("font-size", "10px").attr("fill", palette.red).text("spill");
        group.append("rect").attr("x", 101).attr("y", 24).attr("width", 22).attr("height", 16).attr("rx", 4).attr("fill", palette.red).attr("fill-opacity", .76);
        group.append("text").attr("class", "reverse-label").attr("x", 112).attr("y", 36).attr("text-anchor", "middle").style("font-size", "8px").text("T4");
      }
    });
    fadeIn(expertGroups, .35, .35);
  }

  function renderSpeculativeDecodingVerify() {
    const svg = prepareSvg("speculative-decoding", "Speculative decoding verify", "A draft model proposes future tokens while the target model accepts a prefix and rejects the divergent tail.");
    const x = d3.scalePoint().domain(d3.range(6)).range([66, 494]);
    const nodes = [
      { id: "prompt", label: "prompt", x: x(0), y: 196, status: "base", color: palette.ink },
      { id: "draft1", label: "the", x: x(1), y: 196, status: "accept", color: palette.blue },
      { id: "draft2", label: "answer", x: x(2), y: 196, status: "accept", color: palette.blue },
      { id: "draft3", label: "is", x: x(3), y: 196, status: "accept", color: palette.green },
      { id: "draft4", label: "42", x: x(4), y: 196, status: "reject", color: palette.red },
      { id: "target", label: "next", x: x(5), y: 196, status: "target", color: palette.purple },
      { id: "alt2", label: "maybe", x: x(2), y: 126, status: "branch", color: palette.gray400 },
      { id: "alt3", label: "was", x: x(3), y: 126, status: "branch", color: palette.gray400 },
      { id: "alt4", label: "late", x: x(4), y: 276, status: "branch", color: palette.gray400 }
    ];
    const byId = new Map(nodes.map(node => [node.id, node]));
    const line = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveMonotoneX);
    const draftPath = line(["prompt", "draft1", "draft2", "draft3", "draft4"].map(id => byId.get(id)));
    const acceptedPath = line(["prompt", "draft1", "draft2", "draft3"].map(id => byId.get(id)));
    const rejectedPath = line(["draft3", "draft4", "target"].map(id => byId.get(id)));

    svg.append("rect").attr("x", 52).attr("y", 62).attr("width", 456).attr("height", 44).attr("rx", 10).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    const sweep = svg.append("rect").attr("x", 66).attr("y", 72).attr("width", 396).attr("height", 24).attr("rx", 6).attr("fill", palette.gold);
    sweep.append("animate").attr("attributeName", "width").attr("from", 0).attr("to", 396).attr("dur", "1.15s").attr("begin", ".8s").attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 90).attr("text-anchor", "middle").attr("font-weight", 800).text("target model verifies draft tokens in parallel");

    const branchLinks = [
      ["draft1", "alt2", palette.gray300],
      ["alt2", "alt3", palette.gray300],
      ["draft3", "alt4", palette.gray300]
    ];
    branchLinks.forEach(([sourceId, targetId, stroke], i) => {
      const source = byId.get(sourceId);
      const target = byId.get(targetId);
      const path = svg.append("path")
        .attr("d", line([source, { x: (source.x + target.x) / 2, y: target.y }, target]))
        .attr("fill", "none")
        .attr("stroke", stroke)
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
        .attr("stroke-opacity", .72);
      drawPath(path, .25 + i * .12, .7);
    });

    const draft = svg.append("path")
      .attr("id", "speculative-decoding-draft")
      .attr("d", draftPath)
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(draft, .18, 1.05);
    const accept = svg.append("path")
      .attr("d", acceptedPath)
      .attr("fill", "none")
      .attr("stroke", palette.green)
      .attr("stroke-width", 5)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", .62);
    drawPath(accept, 1.05, .75);
    const reject = svg.append("path")
      .attr("d", rejectedPath)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", .72);
    drawPath(reject, 1.35, .65);

    const dot = svg.append("circle").attr("r", 6).attr("fill", palette.orange).attr("stroke", palette.surface).attr("stroke-width", 2);
    dot.append("animateMotion")
      .attr("dur", "1.2s")
      .attr("begin", ".24s")
      .attr("fill", "freeze")
      .append("mpath")
      .attr("href", "#speculative-decoding-draft");

    const nodeGroups = svg.append("g").selectAll("g.spec-node").data(nodes).join("g")
      .attr("class", "spec-node")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    nodeGroups.append("rect")
      .attr("x", -29)
      .attr("y", -17)
      .attr("width", 58)
      .attr("height", 34)
      .attr("rx", 8)
      .attr("fill", d => d.status === "branch" ? palette.gray100 : d.color)
      .attr("stroke", d => d.status === "reject" ? palette.redHover : palette.surface)
      .attr("stroke-width", d => d.status === "reject" ? 2.4 : 1.4);
    nodeGroups.append("text")
      .attr("class", d => d.status === "branch" ? "mark-label" : "reverse-label")
      .attr("x", 0)
      .attr("y", 5)
      .attr("text-anchor", "middle")
      .attr("font-weight", 800)
      .style("font-size", "10px")
      .text(d => d.label);
    fadeIn(nodeGroups, .08, .36);

    [
      { id: "draft1", text: "accept", color: palette.green },
      { id: "draft2", text: "accept", color: palette.green },
      { id: "draft3", text: "accept", color: palette.green },
      { id: "draft4", text: "drop", color: palette.red }
    ].forEach((badge, i) => {
      const node = byId.get(badge.id);
      const group = svg.append("g").attr("transform", `translate(${node.x},${node.y + 43})`);
      group.append("rect").attr("x", -22).attr("y", -13).attr("width", 44).attr("height", 21).attr("rx", 7).attr("fill", badge.color);
      group.append("text").attr("class", "reverse-label").attr("x", 0).attr("y", 2).attr("text-anchor", "middle").style("font-size", "9px").text(badge.text);
      fadeIn(group, 1.2 + i * .12, .24);
    });

    svg.append("text").attr("class", "caption").attr("x", 68).attr("y", 342).text("accepted prefix commits immediately");
    svg.append("text").attr("class", "caption").attr("x", 352).attr("y", 342).text("target resumes after mismatch");
  }

  function renderRopePositionRotation() {
    const svg = prepareSvg("rope-rotation", "RoPE position rotation", "Rotary position embedding rotates query and key vectors by token position before attention scores are compared.");
    const positions = d3.range(5).map(index => ({
      index,
      x: d3.scalePoint().domain(d3.range(5)).range([76, 484])(index),
      angleQ: 12 + index * 24,
      angleK: -8 + index * 24,
      color: colors[index % colors.length]
    }));
    const radius = 32;

    svg.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 62).attr("text-anchor", "middle").text("position rotates each 2D pair");
    positions.forEach((position, i) => {
      const group = svg.append("g").attr("transform", `translate(${position.x},158)`);
      group.append("circle").attr("r", radius + 7).attr("fill", palette.gray50).attr("stroke", palette.gray200);
      group.append("line").attr("x1", -radius).attr("x2", radius).attr("y1", 0).attr("y2", 0).attr("stroke", palette.gray200);
      group.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -radius).attr("y2", radius).attr("stroke", palette.gray200);
      const arc = d3.arc().innerRadius(radius + 11).outerRadius(radius + 14).startAngle(0).endAngle(position.angleQ * Math.PI / 180);
      group.append("path").attr("d", arc()).attr("fill", position.color).attr("fill-opacity", .46);
      const qVector = group.append("g").attr("transform", `rotate(${position.angleQ})`);
      qVector.append("line").attr("x1", 0).attr("y1", 0).attr("x2", radius).attr("y2", 0).attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
      qVector.append("circle").attr("cx", radius).attr("cy", 0).attr("r", 4.5).attr("fill", palette.red);
      qVector.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "rotate")
        .attr("from", 0)
        .attr("to", position.angleQ)
        .attr("dur", ".8s")
        .attr("begin", `${.18 + i * .12}s`)
        .attr("fill", "freeze");
      const kVector = group.append("g").attr("transform", `rotate(${position.angleK})`);
      kVector.append("line").attr("x1", 0).attr("y1", 0).attr("x2", radius - 6).attr("y2", 0).attr("stroke", palette.blue).attr("stroke-width", 2.6).attr("stroke-linecap", "round");
      kVector.append("circle").attr("cx", radius - 6).attr("cy", 0).attr("r", 3.8).attr("fill", palette.blue);
      kVector.append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "rotate")
        .attr("from", 0)
        .attr("to", position.angleK)
        .attr("dur", ".8s")
        .attr("begin", `${.3 + i * .12}s`)
        .attr("fill", "freeze");
      group.append("text").attr("class", "caption").attr("x", 0).attr("y", 62).attr("text-anchor", "middle").text(`pos ${position.index}`);
      fadeIn(group, .08 + i * .06, .3);
    });

    const chart = svg.append("g").attr("transform", "translate(78,278)");
    const distances = d3.range(6).map(distance => ({ distance, score: .86 * Math.exp(-distance / 3.2) * Math.cos(distance * .42) + .08 }));
    const x = d3.scaleLinear().domain([0, 5]).range([0, 404]);
    const y = d3.scaleLinear().domain([-.35, 1]).range([74, 0]);
    chart.append("rect").attr("x", -12).attr("y", -16).attr("width", 432).attr("height", 112).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    chart.append("line").attr("x1", 0).attr("x2", 404).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", palette.gray300);
    chart.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -24).text("relative phase score by distance");
    chart.append("text").attr("class", "caption").attr("x", 404).attr("y", 94).attr("text-anchor", "end").text("token distance");
    const phaseLine = d3.line().x(d => x(d.distance)).y(d => y(d.score)).curve(d3.curveCatmullRom.alpha(.5));
    const path = chart.append("path").attr("d", phaseLine(distances)).attr("fill", "none").attr("stroke", palette.purple).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(path, 1.0, .8);
    chart.selectAll("circle.phase-point").data(distances).join("circle")
      .attr("class", "phase-point")
      .attr("cx", d => x(d.distance))
      .attr("cy", d => y(d.score))
      .attr("r", 4.8)
      .attr("fill", d => d.distance < 3 ? palette.green : palette.orange)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.4)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".24s")
      .attr("begin", d => `${1.15 + d.distance * .08}s`)
      .attr("fill", "freeze");
    const legend = svg.append("g").attr("transform", "translate(432,238)");
    [
      { label: "Q", color: palette.red },
      { label: "K", color: palette.blue }
    ].forEach((item, i) => {
      legend.append("line").attr("x1", 0).attr("x2", 22).attr("y1", i * 20).attr("y2", i * 20).attr("stroke", item.color).attr("stroke-width", 3);
      legend.append("text").attr("class", "mark-label").attr("x", 30).attr("y", i * 20 + 4).text(item.label);
    });
  }

  function renderMatmulTileAccumulation() {
    const svg = prepareSvg("tiled-matmul", "Matmul tile accumulation", "Matrix multiplication as tiled A and B blocks accumulating partial sums into an output tile.");
    const n = 4;
    const cell = 24;
    const band = d3.scaleBand().domain(d3.range(n)).range([0, 112]).paddingInner(.12);
    const bw = band.bandwidth();
    const matrices = {
      A: { x: 62, y: 142, color: palette.blue, active: d => d.row >= 2 && d.col <= 1 },
      B: { x: 226, y: 80, color: palette.orange, active: d => d.row <= 1 && d.col >= 2 },
      C: { x: 376, y: 158, color: palette.green, active: d => d.row >= 2 && d.col >= 2 }
    };
    const cells = d3.range(n * n).map(index => ({ row: Math.floor(index / n), col: index % n, index }));

    const drawMatrix = (name, matrix, label) => {
      const group = svg.append("g").attr("transform", `translate(${matrix.x},${matrix.y})`);
      group.append("text").attr("class", "mark-label").attr("x", 56).attr("y", -20).attr("text-anchor", "middle").attr("font-weight", 800).text(label);
      group.append("rect").attr("x", -10).attr("y", -10).attr("width", 132).attr("height", 132).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
      const rects = group.selectAll(`rect.${name}-cell`).data(cells).join("rect")
        .attr("class", `${name}-cell`)
        .attr("x", d => band(d.col))
        .attr("y", d => band(d.row))
        .attr("width", bw)
        .attr("height", bw)
        .attr("rx", 4)
        .attr("fill", d => matrix.active(d) ? matrix.color : palette.gray100)
        .attr("fill-opacity", d => matrix.active(d) ? .62 : .48)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.2);
      rects.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".28s")
        .attr("begin", d => `${.08 + d.index * .008}s`)
        .attr("fill", "freeze");
      const activeCol = name === "B" || name === "C" ? 2 : 0;
      const activeRow = name === "A" || name === "C" ? 2 : 0;
      const outline = group.append("rect")
        .attr("x", band(activeCol) - 5)
        .attr("y", band(activeRow) - 5)
        .attr("width", band.step() * 2 - 3)
        .attr("height", band.step() * 2 - 3)
        .attr("rx", 7)
        .attr("fill", "none")
        .attr("stroke", matrix.color)
        .attr("stroke-width", 3)
        .attr("opacity", 0);
      outline.append("animate").attr("attributeName", "opacity").attr("values", "0;1;.55;1").attr("dur", "1.1s").attr("begin", name === "C" ? "1.15s" : ".55s").attr("fill", "freeze");
      return group;
    };

    drawMatrix("A", matrices.A, "A tile");
    drawMatrix("B", matrices.B, "B tile");
    drawMatrix("C", matrices.C, "C output");

    const tileCenter = (matrix, col, row) => ({
      x: matrix.x + band(col) + (band.step() * 2 - 3) / 2,
      y: matrix.y + band(row) + (band.step() * 2 - 3) / 2
    });
    const aCenter = tileCenter(matrices.A, 0, 2);
    const bCenter = tileCenter(matrices.B, 2, 0);
    const cCenter = tileCenter(matrices.C, 2, 2);
    [
      { id: "a", from: aCenter, mid: { x: 250, y: 250 }, stroke: palette.blue, begin: .7 },
      { id: "b", from: bCenter, mid: { x: 306, y: 106 }, stroke: palette.orange, begin: .82 }
    ].forEach(route => {
      const path = svg.append("path")
        .attr("id", `tiled-matmul-${route.id}-route`)
        .attr("d", `M${route.from.x},${route.from.y}C${route.mid.x},${route.mid.y} ${cCenter.x - 70},${cCenter.y} ${cCenter.x},${cCenter.y}`)
        .attr("fill", "none")
        .attr("stroke", route.stroke)
        .attr("stroke-width", 3)
        .attr("stroke-linecap", "round")
        .attr("stroke-opacity", .66);
      drawPath(path, route.begin, .86);
      d3.range(3).forEach(i => {
        const dot = svg.append("circle").attr("r", 4.8).attr("fill", route.stroke).attr("stroke", palette.surface).attr("stroke-width", 1.2);
        dot.append("animateMotion")
          .attr("dur", ".95s")
          .attr("begin", `${route.begin + .1 + i * .18}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#tiled-matmul-${route.id}-route`);
      });
    });

    const kSteps = d3.range(4).map(k => ({ k, x: 102 + k * 92, value: 18 + k * 11 }));
    svg.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 324).attr("text-anchor", "middle").text("partial sums across k");
    svg.append("g").selectAll("g.matmul-k").data(kSteps).join("g")
      .attr("class", "matmul-k")
      .attr("transform", d => `translate(${d.x},342)`)
      .each(function (d) {
        const group = d3.select(this);
        group.append("rect").attr("x", -24).attr("y", 0).attr("width", 48).attr("height", 26).attr("rx", 7).attr("fill", palette.gray100).attr("stroke", palette.gray300);
        const fill = group.append("rect").attr("x", -24).attr("y", 0).attr("width", 48).attr("height", 26).attr("rx", 7).attr("fill", d.k % 2 ? palette.orange : palette.blue).attr("fill-opacity", .58);
        fill.append("animate").attr("attributeName", "width").attr("from", 0).attr("to", 48).attr("dur", ".28s").attr("begin", `${1.1 + d.k * .18}s`).attr("fill", "freeze");
        group.append("text").attr("class", "reverse-label").attr("x", 0).attr("y", 17).attr("text-anchor", "middle").attr("font-weight", 800).style("font-size", "10px").text(`k${d.k}`);
      });

    const cPulse = svg.append("rect")
      .attr("x", matrices.C.x + band(2) - 6)
      .attr("y", matrices.C.y + band(2) - 6)
      .attr("width", band.step() * 2 - 2)
      .attr("height", band.step() * 2 - 2)
      .attr("rx", 8)
      .attr("fill", palette.green)
      .attr("fill-opacity", .08)
      .attr("stroke", palette.red)
      .attr("stroke-width", 3)
      .attr("opacity", 0);
    cPulse.append("animate").attr("attributeName", "opacity").attr("values", "0;.9;.25;.8").attr("dur", "1.1s").attr("begin", "1.25s").attr("fill", "freeze");
    svg.append("text").attr("class", "caption").attr("x", cCenter.x).attr("y", cCenter.y + 70).attr("text-anchor", "middle").text("C block keeps accumulating");
  }

  function renderScaledDotProductAttention() {
    const svg = prepareSvg("scaled-dot-product-attention", "Scaled dot-product attention", "Query-key scores are masked, passed through softmax, and used to weight value vectors.");
    svg.append("text").attr("class", "mark-label").attr("x", width / 2).attr("y", 42).attr("text-anchor", "middle")
      .text("softmax((QK^T / sqrt(d_k)) + mask) V");
    const cell = 15;
    const gap = 3;
    const n = 5;
    const drawMatrix = (x0, y0, rows, cols, label, color, valueFn, delay) => {
      const group = svg.append("g").attr("transform", `translate(${x0},${y0})`);
      group.append("text").attr("class", "mark-label").attr("x", cols * (cell + gap) / 2 - gap).attr("y", -14).attr("text-anchor", "middle").text(label);
      group.append("rect").attr("x", -8).attr("y", -8).attr("width", cols * (cell + gap) + 4).attr("height", rows * (cell + gap) + 4).attr("rx", 8).attr("fill", palette.gray50).attr("stroke", palette.gray200);
      const cells = d3.range(rows * cols).map(index => ({ row: Math.floor(index / cols), col: index % cols, index, value: valueFn(Math.floor(index / cols), index % cols) }));
      group.selectAll("rect.attn-step-cell").data(cells).join("rect")
        .attr("class", "attn-step-cell")
        .attr("x", d => d.col * (cell + gap))
        .attr("y", d => d.row * (cell + gap))
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 3)
        .attr("fill", d => d.value < 0 ? palette.gray100 : color)
        .attr("fill-opacity", d => d.value < 0 ? .5 : .18 + d.value * .72)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1)
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".24s")
        .attr("begin", d => `${delay + d.index * .01}s`)
        .attr("fill", "freeze");
      return group;
    };

    drawMatrix(42, 126, n, 3, "Q", palette.red, (r, c) => .25 + ((r + c * 2) % 4) * .16, .08);
    drawMatrix(134, 126, 3, n, "K^T", palette.blue, (r, c) => .22 + ((r * 2 + c) % 5) * .13, .18);
    drawMatrix(246, 112, n, n, "scaled scores", palette.orange, (r, c) => c > r ? -1 : .2 + ((r + c * 3) % 5) * .14, .45);
    drawMatrix(376, 112, n, n, "softmax", palette.green, (r, c) => c > r ? .02 : Math.max(.08, .68 - Math.abs(r - c) * .16), .82);
    drawMatrix(476, 126, n, 2, "V", palette.purple, (r, c) => .24 + ((r + c) % 4) * .15, 1.02);

    [
      { d: "M116,164H132", color: palette.gray500, text: "x", labelX: 124, labelY: 156 },
      { d: "M228,164H244", color: palette.gray500, text: "mask", labelX: 236, labelY: 156 },
      { d: "M352,164H374", color: palette.green, text: "softmax", labelX: 363, labelY: 156 },
      { d: "M454,164H474", color: palette.gray500, text: "x", labelX: 464, labelY: 156 }
    ].forEach((route, i) => {
      const path = svg.append("path").attr("d", route.d).attr("fill", "none").attr("stroke", route.color).attr("stroke-width", 2.4).attr("stroke-linecap", "round");
      drawPath(path, .55 + i * .16, .38);
      svg.append("text").attr("class", "caption").attr("x", route.labelX).attr("y", route.labelY).attr("text-anchor", "middle").text(route.text);
    });

    const activeY = 112 + 3 * (cell + gap);
    const row = svg.append("rect").attr("x", 376 - 5).attr("y", activeY - 5).attr("width", n * (cell + gap) + 1).attr("height", cell + 10).attr("rx", 6).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2.4).attr("opacity", 0);
    row.append("animate").attr("attributeName", "opacity").attr("values", "0;1;.55;1").attr("dur", ".9s").attr("begin", "1.25s").attr("fill", "freeze");

    const out = svg.append("g").attr("transform", "translate(226,296)");
    out.append("rect").attr("x", -12).attr("y", -28).attr("width", 124).attr("height", 56).attr("rx", 10).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    [34, 58, 82].forEach((x, i) => {
      out.append("rect").attr("x", x).attr("y", -16).attr("width", 14).attr("height", 32).attr("rx", 4).attr("fill", [palette.blue, palette.green, palette.orange][i]).attr("fill-opacity", .74)
        .append("animate").attr("attributeName", "height").attr("from", 4).attr("to", 32).attr("dur", ".35s").attr("begin", `${1.45 + i * .12}s`).attr("fill", "freeze");
    });
    out.append("text").attr("class", "mark-label").attr("x", 50).attr("y", 47).attr("text-anchor", "middle").text("weighted output");
    fadeIn(out, 1.2, .32);
  }

  function renderMultiHeadAttentionMerge() {
    const svg = prepareSvg("multi-head-attention-merge", "Multi-head attention merge", "Attention heads specialize independently before concatenation and output projection.");
    const heads = [
      { name: "syntax", x: 74, y: 82, color: palette.blue, hot: [3, 0] },
      { name: "entity", x: 228, y: 82, color: palette.green, hot: [2, 1] },
      { name: "position", x: 74, y: 222, color: palette.orange, hot: [3, 3] },
      { name: "tool", x: 228, y: 222, color: palette.purple, hot: [1, 2] }
    ];
    const n = 4;
    const cell = 19;
    const gap = 3;
    heads.forEach((head, headIndex) => {
      const group = svg.append("g").attr("transform", `translate(${head.x},${head.y})`);
      group.append("rect").attr("x", -14).attr("y", -24).attr("width", 112).attr("height", 122).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", head.color).attr("stroke-width", 1.8);
      group.append("text").attr("class", "mark-label").attr("x", 42).attr("y", -8).attr("text-anchor", "middle").style("font-size", "10px").text(head.name);
      const cells = d3.range(n * n).map(index => {
        const row = Math.floor(index / n);
        const col = index % n;
        const future = col > row;
        const focused = row === head.hot[0] && col === head.hot[1];
        return { row, col, index, future, focused, value: focused ? .95 : future ? .02 : .18 + ((row + col + headIndex) % 4) * .13 };
      });
      group.selectAll("rect.head-cell").data(cells).join("rect")
        .attr("class", "head-cell")
        .attr("x", d => d.col * (cell + gap))
        .attr("y", d => 14 + d.row * (cell + gap))
        .attr("width", cell)
        .attr("height", cell)
        .attr("rx", 4)
        .attr("fill", d => d.future ? palette.gray100 : d.focused ? palette.red : head.color)
        .attr("fill-opacity", d => d.future ? .46 : .22 + d.value * .62)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1)
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".25s")
        .attr("begin", d => `${.08 + headIndex * .14 + d.index * .008}s`)
        .attr("fill", "freeze");
    });

    const concatX = 398;
    const concatY = 118;
    const strips = heads.map((head, i) => ({ ...head, y: concatY + i * 42 }));
    strips.forEach((strip, i) => {
      svg.append("rect").attr("x", concatX).attr("y", strip.y).attr("width", 74).attr("height", 24).attr("rx", 6).attr("fill", strip.color).attr("fill-opacity", .72).attr("stroke", palette.surface);
      svg.append("text").attr("class", "reverse-label").attr("x", concatX + 37).attr("y", strip.y + 16).attr("text-anchor", "middle").style("font-size", "9px").text(`head ${i + 1}`);
      const source = { x: strip.x + 86, y: strip.y < 210 ? strip.y - 20 : strip.y + 6 };
      const path = svg.append("path")
        .attr("d", `M${source.x},${source.y}C${source.x + 56},${source.y} ${concatX - 42},${strip.y + 12} ${concatX},${strip.y + 12}`)
        .attr("fill", "none")
        .attr("stroke", strip.color)
        .attr("stroke-width", 2.1)
        .attr("stroke-opacity", .5)
        .attr("stroke-linecap", "round");
      drawPath(path, .72 + i * .09, .72);
    });
    svg.append("text").attr("class", "mark-label").attr("x", concatX + 37).attr("y", 92).attr("text-anchor", "middle").text("concat");
    const output = svg.append("g").attr("transform", "translate(398,310)");
    output.append("rect").attr("width", 112).attr("height", 42).attr("rx", 9).attr("fill", palette.yellowHighlight).attr("stroke", palette.gold).attr("stroke-width", 2);
    output.append("text").attr("class", "mark-label").attr("x", 56).attr("y", 26).attr("text-anchor", "middle").attr("font-weight", 800).text("W_o projection");
    fadeIn(output, 1.18, .32);
    const mergePath = svg.append("path").attr("id", "multi-head-attention-merge-output").attr("d", "M435,286V310").attr("fill", "none").attr("stroke", palette.gold).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(mergePath, 1.2, .35);
  }

  function renderLogitLensRankBump() {
    const svg = prepareSvg("logit-lens-rank-bump", "Logit lens rank bump", "Candidate next-token ranks are decoded from intermediate layers and compared as a bump chart.");
    const layers = ["L0", "L4", "L8", "L12", "L16"];
    const tokens = [
      { token: "matrix", color: palette.blue, ranks: [4, 3, 2, 1, 1] },
      { token: "vector", color: palette.green, ranks: [2, 2, 3, 3, 4] },
      { token: "cache", color: palette.orange, ranks: [5, 4, 4, 4, 3] },
      { token: "route", color: palette.purple, ranks: [1, 1, 1, 2, 2] },
      { token: "mask", color: palette.red, ranks: [3, 5, 5, 5, 5] }
    ];
    const x = d3.scalePoint().domain(layers).range([78, 464]);
    const y = d3.scalePoint().domain([1, 2, 3, 4, 5]).range([96, 304]);
    svg.append("rect").attr("x", 54).attr("y", 72).attr("width", 444).attr("height", 258).attr("rx", 10).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    layers.forEach(layer => {
      svg.append("line").attr("x1", x(layer)).attr("x2", x(layer)).attr("y1", 88).attr("y2", 312).attr("stroke", palette.gray200);
      svg.append("text").attr("class", "caption").attr("x", x(layer)).attr("y", 334).attr("text-anchor", "middle").text(layer);
    });
    [1, 2, 3, 4, 5].forEach(rank => {
      svg.append("text").attr("class", "caption").attr("x", 40).attr("y", y(rank) + 4).attr("text-anchor", "end").text(`#${rank}`);
    });
    const line = d3.line()
      .x((d, i) => x(layers[i]))
      .y(d => y(d))
      .curve(d3.curveMonotoneX);
    tokens.forEach((series, seriesIndex) => {
      const path = svg.append("path")
        .attr("d", line(series.ranks))
        .attr("fill", "none")
        .attr("stroke", series.color)
        .attr("stroke-width", series.token === "matrix" ? 4 : 2.3)
        .attr("stroke-opacity", series.token === "matrix" ? .9 : .55)
        .attr("stroke-linecap", "round");
      drawPath(path, .18 + seriesIndex * .08, .95);
      series.ranks.forEach((rank, i) => {
        const dot = svg.append("circle")
          .attr("cx", x(layers[i]))
          .attr("cy", y(rank))
          .attr("r", series.token === "matrix" && i === layers.length - 1 ? 6.8 : 4.6)
          .attr("fill", series.color)
          .attr("stroke", palette.surface)
          .attr("stroke-width", 1.4);
        dot.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".22s").attr("begin", `${.62 + i * .07 + seriesIndex * .04}s`).attr("fill", "freeze");
      });
      svg.append("text").attr("class", "mark-label").attr("x", 478).attr("y", y(series.ranks.at(-1)) + 4).style("font-size", "10px").attr("fill", series.color).text(series.token);
    });
    svg.append("text").attr("class", "mark-label").attr("x", 280).attr("y", 48).attr("text-anchor", "middle").text("rank decoded at each layer");
    svg.append("path").attr("d", `M${x("L12") - 24},${y(1) - 16}h48`).attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
    svg.append("text").attr("class", "caption").attr("x", x("L12")).attr("y", y(1) - 24).attr("text-anchor", "middle").text("winner separates");
  }

  function renderResidualRmsnormStream() {
    const svg = prepareSvg("residual-rmsnorm-stream", "Residual RMSNorm stream", "The residual stream branches through attention, adds back, and is normalized before the next block.");
    const streamY = 212;
    const stages = [
      { label: "x", x: 58, color: palette.blue },
      { label: "attention", x: 188, color: palette.orange },
      { label: "add", x: 312, color: palette.red },
      { label: "RMSNorm", x: 420, color: palette.green },
      { label: "next", x: 514, color: palette.purple }
    ];
    const streamPath = svg.append("path")
      .attr("id", "residual-rmsnorm-stream-main")
      .attr("d", `M${stages[0].x},${streamY}H${stages.at(-1).x}`)
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round");
    drawPath(streamPath, .1, 1.35);
    const branchPath = svg.append("path")
      .attr("id", "residual-rmsnorm-stream-branch")
      .attr("d", `M${stages[0].x + 34},${streamY}C128,118 220,118 ${stages[2].x - 10},${streamY - 6}`)
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", .72);
    drawPath(branchPath, .35, .95);
    stages.forEach((stage, i) => {
      const group = svg.append("g").attr("transform", `translate(${stage.x},${streamY})`);
      if (stage.label === "add") {
        group.append("circle").attr("r", 18).attr("fill", palette.redHighlight).attr("stroke", palette.red).attr("stroke-width", 2.2);
        group.append("text").attr("class", "mark-label").attr("x", 0).attr("y", 6).attr("text-anchor", "middle").attr("font-size", 20).text("+");
      } else {
        group.append("rect").attr("x", -35).attr("y", -18).attr("width", 70).attr("height", 36).attr("rx", 8).attr("fill", stage.color).attr("fill-opacity", .8).attr("stroke", palette.surface);
        group.append("text").attr("class", "reverse-label").attr("x", 0).attr("y", 5).attr("text-anchor", "middle").attr("font-weight", 800).style("font-size", stage.label === "attention" || stage.label === "RMSNorm" ? "9px" : "11px").text(stage.label);
      }
      fadeIn(group, .12 + i * .1, .28);
    });
    d3.range(5).forEach(i => {
      const dot = svg.append("circle").attr("r", 5).attr("fill", colors[i % colors.length]).attr("stroke", palette.surface).attr("stroke-width", 1.3);
      dot.append("animateMotion")
        .attr("dur", "1.4s")
        .attr("begin", `${.26 + i * .12}s`)
        .attr("fill", "freeze")
        .append("mpath")
        .attr("href", "#residual-rmsnorm-stream-main");
    });
    const dot = svg.append("circle").attr("r", 5.5).attr("fill", palette.orange).attr("stroke", palette.surface).attr("stroke-width", 1.4);
    dot.append("animateMotion").attr("dur", "1s").attr("begin", ".5s").attr("fill", "freeze").append("mpath").attr("href", "#residual-rmsnorm-stream-branch");

    const vectors = [
      { x: 92, before: [44, 22, 35, 14], after: [28, 27, 29, 26], color: palette.blue },
      { x: 420, before: [48, 18, 39, 12], after: [29, 28, 27, 27], color: palette.green }
    ];
    vectors.forEach((block, blockIndex) => {
      const group = svg.append("g").attr("transform", `translate(${block.x},300)`);
      group.append("text").attr("class", "caption").attr("x", 34).attr("y", -18).attr("text-anchor", "middle").text(blockIndex ? "after norm" : "raw stream");
      block.before.forEach((h, i) => {
        group.append("rect").attr("x", i * 17).attr("y", -h).attr("width", 12).attr("height", h).attr("rx", 3).attr("fill", block.color).attr("fill-opacity", blockIndex ? .3 : .62);
      });
      block.after.forEach((h, i) => {
        const bar = group.append("rect").attr("x", i * 17).attr("y", -h).attr("width", 12).attr("height", h).attr("rx", 3).attr("fill", block.color).attr("fill-opacity", .76);
        if (blockIndex) bar.append("animate").attr("attributeName", "height").attr("values", `${block.before[i]};${h}`).attr("dur", ".45s").attr("begin", `${1.15 + i * .06}s`).attr("fill", "freeze");
      });
    });
  }

  function renderSwigluFeedForward() {
    const svg = prepareSvg("swiglu-feed-forward", "SwiGLU feed forward", "Transformer FFN expansion uses an up projection, gated activation, elementwise product, and down projection.");
    const lanes = [
      { label: "input", x: 56, color: palette.blue },
      { label: "up", x: 170, y: 118, color: palette.orange },
      { label: "gate", x: 170, y: 238, color: palette.purple },
      { label: "multiply", x: 322, color: palette.red },
      { label: "down", x: 452, color: palette.green }
    ];
    const drawVector = (x, y, label, color, values, delay) => {
      const group = svg.append("g").attr("transform", `translate(${x},${y})`);
      group.append("text").attr("class", "mark-label").attr("x", 28).attr("y", -18).attr("text-anchor", "middle").text(label);
      values.forEach((value, i) => {
        const bar = group.append("rect").attr("x", i * 14).attr("y", -value).attr("width", 10).attr("height", value).attr("rx", 3).attr("fill", color).attr("fill-opacity", .72).attr("stroke", palette.surface);
        bar.append("animate").attr("attributeName", "height").attr("from", 3).attr("to", value).attr("dur", ".34s").attr("begin", `${delay + i * .035}s`).attr("fill", "freeze");
      });
      return group;
    };
    drawVector(42, 210, "d_model", palette.blue, [30, 46, 26, 38], .08);
    drawVector(156, 172, "up proj", palette.orange, [22, 36, 52, 34, 44, 28], .36);
    drawVector(156, 292, "gate proj", palette.purple, [46, 20, 36, 54, 24, 42], .44);
    drawVector(306, 236, "SiLU gate x up", palette.red, [24, 16, 42, 45, 26, 30], .95);
    drawVector(450, 210, "down proj", palette.green, [36, 28, 42, 30], 1.25);
    [
      { d: "M100,198C128,168 130,150 154,150", color: palette.orange },
      { d: "M100,214C128,254 130,270 154,270", color: palette.purple },
      { d: "M240,150C270,166 288,196 306,214", color: palette.orange },
      { d: "M240,270C270,254 288,236 306,226", color: palette.purple },
      { d: "M390,222C414,214 424,210 448,210", color: palette.green }
    ].forEach((route, i) => {
      const path = svg.append("path").attr("d", route.d).attr("fill", "none").attr("stroke", route.color).attr("stroke-width", 2.6).attr("stroke-linecap", "round").attr("stroke-opacity", .68);
      drawPath(path, .42 + i * .12, .7);
    });
    const product = svg.append("g").attr("transform", "translate(286,196)");
    product.append("circle").attr("cx", 36).attr("cy", 32).attr("r", 20).attr("fill", palette.redHighlight).attr("stroke", palette.red).attr("stroke-width", 2.3);
    product.append("text").attr("class", "mark-label").attr("x", 36).attr("y", 39).attr("text-anchor", "middle").attr("font-size", 20).text("*");
    fadeIn(product, .82, .28);
    svg.append("rect").attr("x", 132).attr("y", 92).attr("width", 334).attr("height", 232).attr("rx", 14).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-dasharray", "5 6");
    svg.append("text").attr("class", "caption").attr("x", 300).attr("y", 346).attr("text-anchor", "middle").text("expand, gate, contract back to model width");
  }

  function renderPagedKvCache() {
    const svg = prepareSvg("paged-kv-cache", "Paged KV cache", "Serving-time KV cache memory is allocated as fixed pages for concurrent requests and reused after completion.");
    const requests = [
      { id: "req A", y: 94, color: palette.blue, pages: [0, 1, 2] },
      { id: "req B", y: 154, color: palette.orange, pages: [3, 4] },
      { id: "req C", y: 214, color: palette.green, pages: [5, 6, 7] },
      { id: "req D", y: 274, color: palette.purple, pages: [1, 8], reused: true }
    ];
    const pages = d3.range(12).map(index => ({ index, col: index % 4, row: Math.floor(index / 4) }));
    const gridX = 306;
    const gridY = 98;
    const cell = 42;
    const gap = 10;
    svg.append("text").attr("class", "mark-label").attr("x", 88).attr("y", 62).attr("text-anchor", "middle").text("decode requests");
    svg.append("text").attr("class", "mark-label").attr("x", 396).attr("y", 62).attr("text-anchor", "middle").text("KV memory pages");
    requests.forEach((request, i) => {
      const group = svg.append("g").attr("transform", `translate(48,${request.y - 18})`);
      group.append("rect").attr("width", 94).attr("height", 36).attr("rx", 8).attr("fill", request.color).attr("fill-opacity", .8).attr("stroke", palette.surface);
      group.append("text").attr("class", "reverse-label").attr("x", 47).attr("y", 23).attr("text-anchor", "middle").attr("font-weight", 800).text(request.id);
      if (request.reused) {
        group.append("text").attr("class", "caption").attr("x", 108).attr("y", 23).attr("fill", palette.green).text("reuses freed page");
      }
      fadeIn(group, .08 + i * .1, .25);
    });
    const pageOwner = new Map();
    requests.forEach(request => request.pages.forEach(page => {
      if (!pageOwner.has(page) || request.reused) pageOwner.set(page, request);
    }));
    const grid = svg.append("g").attr("transform", `translate(${gridX},${gridY})`);
    grid.append("rect").attr("x", -16).attr("y", -18).attr("width", 4 * (cell + gap) + 22).attr("height", 3 * (cell + gap) + 22).attr("rx", 12).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    grid.selectAll("rect.page").data(pages).join("rect")
      .attr("class", "page")
      .attr("x", d => d.col * (cell + gap))
      .attr("y", d => d.row * (cell + gap))
      .attr("width", cell)
      .attr("height", cell)
      .attr("rx", 7)
      .attr("fill", d => pageOwner.get(d.index)?.color || palette.gray100)
      .attr("fill-opacity", d => pageOwner.has(d.index) ? .72 : .48)
      .attr("stroke", d => d.index === 1 ? palette.green : palette.surface)
      .attr("stroke-width", d => d.index === 1 ? 2.6 : 1.2)
      .append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".28s")
      .attr("begin", d => `${.25 + d.index * .035}s`)
      .attr("fill", "freeze");
    grid.selectAll("text.page-label").data(pages).join("text")
      .attr("class", "reverse-label")
      .attr("x", d => d.col * (cell + gap) + cell / 2)
      .attr("y", d => d.row * (cell + gap) + 26)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .text(d => `p${d.index}`);
    requests.forEach((request, requestIndex) => {
      request.pages.forEach((pageIndex, pageOffset) => {
        const page = pages[pageIndex];
        const targetX = gridX + page.col * (cell + gap);
        const targetY = gridY + page.row * (cell + gap) + cell / 2;
        const path = svg.append("path")
          .attr("id", `paged-kv-cache-${requestIndex}-${pageOffset}`)
          .attr("d", `M142,${request.y}C206,${request.y} 226,${targetY} ${targetX},${targetY}`)
          .attr("fill", "none")
          .attr("stroke", request.reused && pageIndex === 1 ? palette.green : request.color)
          .attr("stroke-width", request.reused && pageIndex === 1 ? 3 : 2)
          .attr("stroke-opacity", .42)
          .attr("stroke-linecap", "round");
        drawPath(path, .42 + requestIndex * .14 + pageOffset * .04, .7);
        const dot = svg.append("circle").attr("r", 4.5).attr("fill", request.color).attr("stroke", palette.surface).attr("stroke-width", 1.2);
        dot.append("animateMotion")
          .attr("dur", ".78s")
          .attr("begin", `${.52 + requestIndex * .14 + pageOffset * .06}s`)
          .attr("fill", "freeze")
          .append("mpath")
          .attr("href", `#paged-kv-cache-${requestIndex}-${pageOffset}`);
      });
    });
    svg.append("path").attr("d", "M346,292H450").attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round").attr("stroke-dasharray", "6 6");
    svg.append("text").attr("class", "caption").attr("x", 398).attr("y", 318).attr("text-anchor", "middle").text("page table remaps logical cache");
  }

  function renderWebLoadTimeline() {
    const svg = prepareSvg("web-load-timeline", "Web load timeline", "A D3 timeline inspired by historical timelines shows how browser load phases overlap from navigation start to interactivity.");
    const x = d3.scaleLinear().domain([0, 2500]).range([78, 514]);
    const laneY = d3.scalePoint()
      .domain(["Network", "Document", "Assets", "Render", "Main thread"])
      .range([104, 304]);
    const phaseColor = {
      Network: palette.blue,
      Document: palette.purple,
      Assets: palette.orange,
      Render: palette.green,
      "Main thread": palette.red
    };
    const phaseFill = {
      Network: palette.blueHighlight,
      Document: palette.purpleHighlight,
      Assets: palette.orangeHighlight,
      Render: palette.greenHighlight,
      "Main thread": palette.redHighlight
    };
    const eras = [
      { label: "connect", start: 0, end: 320, fill: palette.blueHighlight },
      { label: "response", start: 320, end: 820, fill: palette.yellowHighlight },
      { label: "parse", start: 820, end: 1420, fill: palette.purpleHighlight },
      { label: "paint", start: 1420, end: 2040, fill: palette.greenHighlight },
      { label: "interactive", start: 2040, end: 2500, fill: palette.redHighlight }
    ];
    const spans = [
      { lane: "Network", label: "DNS", start: 0, end: 70, track: 0 },
      { lane: "Network", label: "TCP + TLS", start: 70, end: 260, track: 0 },
      { lane: "Network", label: "request", start: 260, end: 360, track: 0 },
      { lane: "Network", label: "TTFB", start: 360, end: 820, track: 0, showLabel: true },
      { lane: "Document", label: "HTML stream", start: 820, end: 1080, track: -1 },
      { lane: "Document", label: "DOM parse", start: 980, end: 1340, track: 0, showLabel: true },
      { lane: "Document", label: "CSSOM", start: 1080, end: 1460, track: 1, showLabel: true },
      { lane: "Assets", label: "CSS", start: 840, end: 1180, track: -1.5 },
      { lane: "Assets", label: "JS bundle", start: 920, end: 1680, track: -.5, showLabel: true },
      { lane: "Assets", label: "fonts", start: 1220, end: 1740, track: .5 },
      { lane: "Assets", label: "hero image", start: 1360, end: 2140, track: 1.5, showLabel: true },
      { lane: "Render", label: "style", start: 1320, end: 1580, track: -1 },
      { lane: "Render", label: "layout", start: 1480, end: 1740, track: 0, showLabel: true },
      { lane: "Render", label: "paint", start: 1720, end: 1960, track: 1, showLabel: true },
      { lane: "Main thread", label: "hydrate", start: 1580, end: 2140, track: -.5, showLabel: true },
      { lane: "Main thread", label: "idle", start: 2140, end: 2380, track: .5, showLabel: true }
    ];
    const milestones = [
      { label: "nav", time: 0, lane: "Network", y: 34, color: palette.ink, anchor: "start" },
      { label: "TTFB 820", time: 820, lane: "Network", y: 78, color: palette.blue, anchor: "middle" },
      { label: "FCP 1.32s", time: 1320, lane: "Render", y: 336, color: palette.green, anchor: "middle" },
      { label: "LCP 1.86s", time: 1860, lane: "Render", y: 78, color: palette.red, anchor: "middle" },
      { label: "TTI 2.32s", time: 2320, lane: "Main thread", y: 336, color: palette.purple, anchor: "end" }
    ];
    const totalDuration = 6.2;
    const timeToDelay = ms => .28 + ms / 2500 * totalDuration;
    const spanDuration = d => Math.max(.36, (d.end - d.start) / 2500 * totalDuration);
    const trackOffset = d => (d.track ?? 0) * 9;

    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", 28)
      .attr("y", 34)
      .attr("font-size", 13)

    const eraGroup = svg.append("g");
    eraGroup.selectAll("rect").data(eras).join("rect")
      .attr("x", d => x(d.start))
      .attr("y", 48)
      .attr("width", d => x(d.end) - x(d.start))
      .attr("height", 24)
      .attr("rx", 4)
      .attr("fill", d => d.fill)
      .attr("stroke", palette.surface);
    eraGroup.selectAll("text").data(eras).join("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("font-size", 9.5)
      .attr("x", d => (x(d.start) + x(d.end)) / 2)
      .attr("y", 64)
      .text(d => d.label);

    const axisY = 344;
    svg.append("line")
      .attr("x1", x(0))
      .attr("x2", x(2500))
      .attr("y1", axisY)
      .attr("y2", axisY)
      .attr("stroke", palette.gray400)
      .attr("stroke-width", 1.2);
    const tick = svg.append("g").selectAll("g.tick").data([0, 500, 1000, 1500, 2000, 2500]).join("g")
      .attr("class", "tick")
      .attr("transform", d => `translate(${x(d)},0)`);
    tick.append("line")
      .attr("y1", axisY)
      .attr("y2", axisY + 6)
      .attr("stroke", palette.gray400);
    tick.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("font-size", 9.5)
      .attr("y", axisY + 20)
      .text(d => d === 0 ? "0" : `${d / 1000}s`);

    const lane = svg.append("g").selectAll("g.lane").data(laneY.domain()).join("g")
      .attr("class", "lane")
      .attr("transform", d => `translate(0,${laneY(d)})`);
    lane.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "end")
      .attr("x", 68)
      .attr("y", 4)
      .attr("font-size", 10)
      .text(d => d);
    lane.append("line")
      .attr("x1", x(0))
      .attr("x2", x(2500))
      .attr("y1", 0)
      .attr("y2", 0)
      .attr("stroke", palette.gray100)
      .attr("stroke-dasharray", "2 5");

    const spanGroups = svg.append("g").selectAll("g.load-span").data(spans).join("g")
      .attr("class", "load-span")
      .attr("transform", d => `translate(${x(d.start)},${laneY(d.lane) + trackOffset(d) - 6})`);
    spanGroups.append("rect")
      .attr("width", d => x(d.end) - x(d.start))
      .attr("height", 12)
      .attr("rx", 4)
      .attr("fill", d => phaseFill[d.lane])
      .attr("stroke", d => phaseColor[d.lane])
      .attr("stroke-width", 1.2);
    const activeBars = spanGroups.append("rect")
      .attr("height", 12)
      .attr("rx", 4)
      .attr("fill", d => phaseColor[d.lane])
      .attr("opacity", .82)
      .attr("width", d => x(d.end) - x(d.start));
    activeBars.each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", x(d.end) - x(d.start))
        .attr("dur", `${spanDuration(d)}s`)
        .attr("begin", `${timeToDelay(d.start)}s`)
        .attr("fill", "freeze");
    });
    spanGroups.append("text")
      .attr("class", "reverse-label")
      .attr("x", d => Math.min(8, Math.max(4, (x(d.end) - x(d.start)) * .18)))
      .attr("y", 8.5)
      .attr("font-size", 7.4)
      .attr("font-weight", 800)
      .text(d => d.showLabel ? d.label : "");

    const milestone = svg.append("g").selectAll("g.milestone").data(milestones).join("g")
      .attr("class", "milestone");
    milestone.append("line")
      .attr("x1", d => x(d.time))
      .attr("x2", d => x(d.time))
      .attr("y1", d => laneY(d.lane))
      .attr("y2", d => d.y + (d.y < laneY(d.lane) ? 13 : -13))
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.2)
      .attr("stroke-opacity", .64)
      .attr("stroke-dasharray", "3 4");
    const milestoneDot = milestone.append("circle")
      .attr("cx", d => x(d.time))
      .attr("cy", d => laneY(d.lane))
      .attr("r", 5)
      .attr("fill", d => d.color)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2)
      .attr("opacity", 0);
    milestoneDot.each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1;1")
        .attr("keyTimes", "0;.2;1")
        .attr("dur", ".7s")
        .attr("begin", `${timeToDelay(d.time)}s`)
        .attr("fill", "freeze");
      d3.select(this).append("animate")
        .attr("attributeName", "r")
        .attr("values", "3;8;5")
        .attr("keyTimes", "0;.35;1")
        .attr("dur", ".7s")
        .attr("begin", `${timeToDelay(d.time)}s`)
        .attr("fill", "freeze");
    });
    milestone.append("rect")
      .attr("x", d => d.anchor === "end" ? x(d.time) - 61 : d.anchor === "start" ? x(d.time) : x(d.time) - 31)
      .attr("y", d => d.y - 12)
      .attr("width", 62)
      .attr("height", 20)
      .attr("rx", 5)
      .attr("fill", palette.surface)
      .attr("stroke", d => d.color)
      .attr("opacity", .96);
    const milestoneLabel = milestone.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("x", d => d.anchor === "end" ? x(d.time) - 30 : d.anchor === "start" ? x(d.time) + 31 : x(d.time))
      .attr("y", d => d.y + 2)
      .attr("opacity", 0)
      .text(d => d.label);
    fadeIn(milestoneLabel, .65, .6);

    const cursor = svg.append("g").attr("class", "load-cursor");
    const cursorLine = cursor.append("line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", 42)
      .attr("y2", axisY)
      .attr("stroke", palette.red)
      .attr("stroke-width", 2)
      .attr("stroke-opacity", .86);
    cursorLine.append("animate")
      .attr("attributeName", "x1")
      .attr("from", x(0))
      .attr("to", x(2500))
      .attr("dur", `${totalDuration}s`)
      .attr("begin", ".28s")
      .attr("fill", "freeze");
    cursorLine.append("animate")
      .attr("attributeName", "x2")
      .attr("from", x(0))
      .attr("to", x(2500))
      .attr("dur", `${totalDuration}s`)
      .attr("begin", ".28s")
      .attr("fill", "freeze");
    const cursorHead = cursor.append("circle")
      .attr("cx", x(0))
      .attr("cy", 42)
      .attr("r", 5)
      .attr("fill", palette.red);
    cursorHead.append("animate")
      .attr("attributeName", "cx")
      .attr("from", x(0))
      .attr("to", x(2500))
      .attr("dur", `${totalDuration}s`)
      .attr("begin", ".28s")
      .attr("fill", "freeze");

  }

  function renderTileChoropleth() {
    const svg = prepareSvg("tile-choropleth", "Tile choropleth", "D3 geoPath renders local region polygons colored by intensity.");
    const color = d3.scaleQuantize().domain([18, 88]).range(["#d7e8f4", "#9ecae1", "#6baed6", "#3182bd", "#08519c"]);
    const features = d3.range(12).map(i => {
      const col = i % 4, row = Math.floor(i / 4);
      const x = 86 + col * 92 + (row % 2) * 16;
      const y = 62 + row * 86;
      const points = [[x, y + 10], [x + 76, y], [x + 88, y + 58], [x + 16, y + 70], [x, y + 10]];
      return {
        type: "Feature",
        properties: { name: `R${i + 1}`, value: 20 + (i * 19) % 68 },
        geometry: { type: "Polygon", coordinates: [points] }
      };
    });
    const path = d3.geoPath();
    const regions = svg.append("g").selectAll("path").data(features).join("path")
      .attr("d", path)
      .attr("fill", d => color(d.properties.value))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
    fadeIn(regions, .05, .7);
    svg.append("g").selectAll("text").data(features).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d3.geoPath().centroid(d)[0])
      .attr("y", d => d3.geoPath().centroid(d)[1] + 4)
      .attr("text-anchor", "middle")
      .text(d => d.properties.name);
    color.range().forEach((swatch, i) => {
      svg.append("rect").attr("x", 122 + i * 46).attr("y", 344).attr("width", 42).attr("height", 12).attr("fill", swatch);
    });
    svg.append("text").attr("class", "label").attr("x", 122).attr("y", 374).text("low");
    svg.append("text").attr("class", "label").attr("x", 346).attr("y", 374).attr("text-anchor", "end").text("high");
  }

  function renderSpiralTimeline() {
    const svg = prepareSvg("spiral-timeline", "Spiral timeline", "D3 line geometry wraps a long sequence into cyclic space.");
    const center = [width / 2, height / 2 + 8];
    const data = d3.range(72).map(i => {
      const theta = i * .38;
      const r = 24 + i * 2.08;
      return {
        i,
        x: center[0] + Math.cos(theta) * r,
        y: center[1] + Math.sin(theta) * r,
        event: i % 9 === 0
      };
    });
    const line = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveCatmullRom.alpha(.65));
    const path = svg.append("path")
      .datum(data)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", palette.cyan)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(path, .08, 1.25);
    const events = svg.append("g").selectAll("circle").data(data.filter(d => d.event)).join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", palette.orange)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    grow(events, "r", 1, 7, .2, .6);
    svg.append("text").attr("class", "mark-label").attr("x", center[0]).attr("y", center[1] + 5).attr("text-anchor", "middle").text("start");
    svg.append("text").attr("class", "mark-label").attr("x", data.at(-1).x + 10).attr("y", data.at(-1).y + 4).text("end");
  }

  function renderCandlestick() {
    const svg = prepareSvg("candlestick", "Candlestick", "D3 scales encode open, high, low, and close values.");
    const data = d3.range(18).map(i => {
      const open = 54 + Math.sin(i * .72) * 12 + i * .7;
      const close = open + Math.cos(i * .9) * 11;
      const high = Math.max(open, close) + 5 + (i % 4);
      const low = Math.min(open, close) - 5 - (i % 3);
      return { day: i + 1, open, close, high, low };
    });
    const margin = { top: 38, right: 32, bottom: 52, left: 54 };
    const x = d3.scaleBand().domain(data.map(d => d.day)).range([margin.left, width - margin.right]).padding(.36);
    const y = d3.scaleLinear().domain([d3.min(data, d => d.low) - 3, d3.max(data, d => d.high) + 3]).nice().range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const g = svg.append("g").selectAll("g").data(data).join("g").attr("transform", d => `translate(${x(d.day) + x.bandwidth() / 2},0)`);
    const wicks = g.append("line")
      .attr("y1", d => y(d.low))
      .attr("y2", d => y(d.high))
      .attr("stroke", palette.ink)
      .attr("stroke-width", 1.3);
    fadeIn(wicks, .05, .6);
    const bodies = g.append("rect")
      .attr("x", -x.bandwidth() / 2)
      .attr("y", d => y(Math.max(d.open, d.close)))
      .attr("width", x.bandwidth())
      .attr("height", d => Math.max(2, Math.abs(y(d.open) - y(d.close))))
      .attr("fill", d => d.close >= d.open ? palette.green : palette.red)
      .attr("rx", 2);
    fadeIn(bodies, .12, .65);
    svg.append("text").attr("class", "mark-label").attr("x", width - 32).attr("y", 30).attr("text-anchor", "end").text("OHLC");
  }

  function renderFlowTokens() {
    const svg = prepareSvg("flow-tokens", "Flow tokens", "SVG animateMotion tokens move along D3-generated flow paths.");
    const routes = [
      { name: "Ingest", color: palette.blue, points: [[72, 260], [164, 132], [278, 184], [480, 92]] },
      { name: "Score", color: palette.orange, points: [[70, 160], [190, 236], [320, 118], [486, 214]] },
      { name: "Route", color: palette.green, points: [[82, 316], [220, 276], [336, 314], [486, 276]] }
    ];
    const line = d3.line().x(d => d[0]).y(d => d[1]).curve(d3.curveBasis);
    const paths = svg.append("g").selectAll("path").data(routes).join("path")
      .attr("id", (d, i) => `flow-tokens-route-${i}`)
      .attr("d", d => line(d.points))
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", 4)
      .attr("stroke-opacity", .62)
      .attr("stroke-linecap", "round");
    drawPath(paths, .08, 1);
    routes.forEach((route, i) => {
      const token = svg.append("circle")
        .attr("r", 6)
        .attr("fill", route.color)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.6);
      const motion = token.append("animateMotion")
        .attr("dur", `${2.6 + i * .25}s`)
        .attr("begin", `${i * .28}s`)
        .attr("repeatCount", "indefinite")
        .attr("rotate", "auto");
      motion.append("mpath").attr("href", `#flow-tokens-route-${i}`);
      svg.append("text").attr("class", "mark-label").attr("x", 38).attr("y", route.points[0][1] + 5).text(route.name);
    });
    ["Collect", "Transform", "Deliver"].forEach((label, i) => {
      svg.append("text").attr("class", "label").attr("x", 88 + i * 184).attr("y", 44).attr("text-anchor", "middle").text(label);
    });
  }

  function renderProcessPidControlLoop() {
    const svg = prepareSvg("process-control-loop", "P&ID control loop", "A process engineering piping and instrumentation diagram with equipment, valves, instruments, signal lines, interlock logic, and animated flow.");
    svg
      .attr("data-pattern-family", "process-engineering")
      .attr("data-equipment-count", 4)
      .attr("data-valve-count", 3)
      .attr("data-instrument-count", 4)
      .attr("data-signal-line-count", 5)
      .attr("data-process-line-count", 3);

    const flowArrow = addArrowMarker(svg, "process-control-loop-flow", palette.blue);
    const signalArrow = addArrowMarker(svg, "process-control-loop-signal", palette.purple);
    const tripArrow = addArrowMarker(svg, "process-control-loop-trip", palette.red);
    const shell = svg.append("g").attr("class", "pid-shell");
    shell.append("rect")
      .attr("x", 24)
      .attr("y", 28)
      .attr("width", 512)
      .attr("height", 374)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.4);
    shell.append("text").attr("class", "caption").attr("x", 40).attr("y", 54).text("P&ID 101 - reactor feed control");

    const grid = svg.append("g")
      .attr("class", "pid-grid")
      .attr("stroke", palette.gray100)
      .attr("stroke-width", .8);
    d3.range(64, 500, 44).forEach(x => grid.append("line").attr("x1", x).attr("x2", x).attr("y1", 72).attr("y2", 348));
    d3.range(88, 348, 44).forEach(y => grid.append("line").attr("x1", 42).attr("x2", 518).attr("y1", y).attr("y2", y));

    const pipeLayer = svg.append("g").attr("class", "pid-process-lines");
    const route = [
      { id: "feed-main", kind: "process", d: "M40,262H136H180H252H286H374H414H496H536", color: palette.blue, width: 5, dash: "" },
      { id: "steam-utility", kind: "utility", d: "M304,344V292H326V282", color: palette.orange, width: 3.4, dash: "8 6" },
      { id: "drain", kind: "drain", d: "M448,306V342H484", color: palette.gray600, width: 2.4, dash: "5 5" }
    ];
    const processPaths = pipeLayer.selectAll("path.pid-process-line")
      .data(route)
      .join("path")
      .attr("id", d => `pid-route-${d.id}`)
      .attr("class", "pid-process-line")
      .attr("data-line-id", d => d.id)
      .attr("data-line-kind", d => d.kind)
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", d => d.width)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-dasharray", d => d.dash)
      .attr("marker-end", d => d.id === "feed-main" ? flowArrow : null);
    drawPath(processPaths.filter(d => !d.dash), .08, 1.12);
    fadeIn(processPaths.filter(d => d.dash), .18, .62);

    const equipmentLayer = svg.append("g").attr("class", "pid-equipment-layer");
    function label(x, y, text, anchor = "middle") {
      return equipmentLayer.append("text")
        .attr("class", "mark-label")
        .attr("x", x)
        .attr("y", y)
        .attr("text-anchor", anchor)
        .attr("font-size", 9)
        .text(text);
    }

    const tank = equipmentLayer.append("g").attr("class", "pid-equipment pid-vessel").attr("data-equipment-id", "t-101");
    tank.append("rect").attr("x", 70).attr("y", 170).attr("width", 58).attr("height", 106).attr("fill", palette.gray50).attr("stroke", palette.ink).attr("stroke-width", 1.7);
    tank.append("ellipse").attr("cx", 99).attr("cy", 170).attr("rx", 29).attr("ry", 9).attr("fill", palette.surface).attr("stroke", palette.ink).attr("stroke-width", 1.7);
    tank.append("ellipse").attr("cx", 99).attr("cy", 276).attr("rx", 29).attr("ry", 9).attr("fill", palette.gray100).attr("stroke", palette.ink).attr("stroke-width", 1.4);
    tank.append("rect").attr("x", 76).attr("y", 220).attr("width", 46).attr("height", 48).attr("fill", palette.blueHighlight).attr("fill-opacity", .55).attr("stroke", "none");
    tank.append("line").attr("x1", 76).attr("x2", 122).attr("y1", 220).attr("y2", 220).attr("stroke", palette.blue).attr("stroke-width", 2);
    label(99, 300, "T-101 feed");

    const pump = equipmentLayer.append("g").attr("class", "pid-equipment pid-pump").attr("data-equipment-id", "p-101").attr("transform", "translate(204 262)");
    pump.append("circle").attr("r", 22).attr("fill", palette.gray50).attr("stroke", palette.ink).attr("stroke-width", 1.8);
    pump.append("path").attr("d", "M-8,-10L14,0L-8,10Z").attr("fill", palette.blueHighlight).attr("stroke", palette.blue).attr("stroke-width", 1.4);
    label(204, 300, "P-101");

    const exchanger = equipmentLayer.append("g").attr("class", "pid-equipment pid-heat-exchanger").attr("data-equipment-id", "e-101");
    exchanger.append("rect").attr("x", 286).attr("y", 218).attr("width", 82).attr("height", 58).attr("rx", 6).attr("fill", palette.gray50).attr("stroke", palette.ink).attr("stroke-width", 1.7);
    exchanger.append("path").attr("d", "M298,248C306,226 320,226 328,248S350,270 358,248").attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 2.4).attr("stroke-linecap", "round");
    exchanger.append("line").attr("x1", 286).attr("x2", 368).attr("y1", 247).attr("y2", 247).attr("stroke", palette.gray300).attr("stroke-width", 1);
    label(327, 300, "E-101 HX");

    const reactor = equipmentLayer.append("g").attr("class", "pid-equipment pid-reactor").attr("data-equipment-id", "r-101");
    reactor.append("rect").attr("x", 412).attr("y", 154).attr("width", 72).attr("height", 142).attr("fill", palette.gray50).attr("stroke", palette.ink).attr("stroke-width", 1.8);
    reactor.append("ellipse").attr("cx", 448).attr("cy", 154).attr("rx", 36).attr("ry", 10).attr("fill", palette.surface).attr("stroke", palette.ink).attr("stroke-width", 1.8);
    reactor.append("ellipse").attr("cx", 448).attr("cy", 296).attr("rx", 36).attr("ry", 10).attr("fill", palette.gray100).attr("stroke", palette.ink).attr("stroke-width", 1.4);
    reactor.append("path").attr("d", "M432,188H464M432,220H464M432,252H464").attr("stroke", palette.gray300).attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4");
    label(448, 322, "R-101 reactor");

    function drawValve(data) {
      const g = svg.append("g")
        .attr("class", `pid-valve ${data.kind}`)
        .attr("data-valve-id", data.id)
        .attr("transform", `translate(${data.x} ${data.y})`);
      g.append("path")
        .attr("d", "M-15,-10L0,0L-15,10ZM15,-10L0,0L15,10Z")
        .attr("fill", data.fill)
        .attr("stroke", data.color)
        .attr("stroke-width", 1.8)
        .attr("stroke-linejoin", "round");
      g.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -18).attr("y2", -3).attr("stroke", data.color).attr("stroke-width", 1.4);
      g.append("rect").attr("x", -10).attr("y", -32).attr("width", 20).attr("height", 10).attr("rx", 3).attr("fill", palette.surface).attr("stroke", data.color).attr("stroke-width", 1.2);
      g.append("text")
        .attr("class", "mark-label")
        .attr("x", data.labelX || 0)
        .attr("y", data.labelY || 28)
        .attr("text-anchor", data.labelAnchor || "middle")
        .attr("font-size", 8.4)
        .text(data.label);
      return g;
    }
    const valves = [
      { id: "lv-101", label: "LV-101", x: 146, y: 262, color: palette.green, fill: palette.greenHighlight, kind: "level-control" },
      { id: "tv-102", label: "TV-102", x: 304, y: 344, color: palette.orange, fill: palette.orangeHighlight, kind: "temperature-control", labelX: 36, labelY: 5, labelAnchor: "start" },
      { id: "fv-103", label: "FV-103", x: 506, y: 262, color: palette.purple, fill: palette.purpleHighlight, kind: "flow-control" }
    ];
    const valveMarks = valves.map(drawValve);

    const instruments = [
      { id: "lic-101", tag: "LIC", loop: "101", x: 98, y: 104, color: palette.green, target: [146, 230], note: "level" },
      { id: "tic-102", tag: "TIC", loop: "102", x: 326, y: 96, color: palette.orange, target: [304, 312], note: "heat duty" },
      { id: "fic-103", tag: "FIC", loop: "103", x: 506, y: 108, color: palette.purple, target: [506, 230], note: "outlet flow" },
      { id: "hs-104", tag: "HS", loop: "104", x: 430, y: 72, color: palette.red, target: [488, 238], note: "HH trip" }
    ];
    const instrumentLayer = svg.append("g").attr("class", "pid-instrument-layer");
    const instrumentGroups = instrumentLayer.selectAll("g.pid-instrument")
      .data(instruments)
      .join("g")
      .attr("class", "pid-instrument")
      .attr("data-instrument-id", d => d.id)
      .attr("data-loop", d => d.loop)
      .attr("transform", d => `translate(${d.x} ${d.y})`);
    instrumentGroups.append("circle").attr("r", 22).attr("fill", palette.surface).attr("stroke", d => d.color).attr("stroke-width", 1.8);
    instrumentGroups.append("line").attr("x1", -16).attr("x2", 16).attr("y1", 1).attr("y2", 1).attr("stroke", palette.gray300).attr("stroke-width", 1);
    instrumentGroups.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -5).attr("text-anchor", "middle").attr("font-size", 8.5).text(d => d.tag);
    instrumentGroups.append("text").attr("class", "mark-label").attr("x", 0).attr("y", 12).attr("text-anchor", "middle").attr("font-size", 8.2).text(d => d.loop);
    grow(instrumentGroups.select("circle"), "r", 5, 22, .18, .55);

    const signals = [
      { id: "lic-to-lv", source: "lic-101", d: "M98,126V152H146V230", color: palette.green, target: "lv-101" },
      { id: "tic-to-tv", source: "tic-102", d: "M326,118V184H304V312", color: palette.orange, target: "tv-102" },
      { id: "fic-to-fv", source: "fic-103", d: "M506,130V230", color: palette.purple, target: "fv-103" },
      { id: "reactor-temp", source: "r-101", d: "M448,154V116H350", color: palette.orange, target: "tic-102" },
      { id: "high-high-trip", source: "hs-104", d: "M430,94H482V238", color: palette.red, target: "fv-103", trip: true }
    ];
    const signalPaths = svg.append("g").attr("class", "pid-signal-lines").selectAll("path.pid-signal-line")
      .data(signals)
      .join("path")
      .attr("id", d => `pid-signal-${d.id}`)
      .attr("class", d => `pid-signal-line${d.trip ? " pid-trip-line" : ""}`)
      .attr("data-signal-id", d => d.id)
      .attr("data-source", d => d.source)
      .attr("data-target", d => d.target)
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", d => d.trip ? 2 : 1.55)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-dasharray", d => d.trip ? "8 5" : "4 5")
      .attr("marker-end", d => d.trip ? tripArrow : signalArrow);
    fadeIn(signalPaths, .28, .62);

    const pulseLayer = svg.append("g").attr("class", "pid-flow-pulses");
    [0, .9, 1.8].forEach((begin, index) => {
      const pulse = pulseLayer.append("circle")
        .attr("class", "pid-flow-pulse")
        .attr("data-pulse-index", index)
        .attr("r", 5)
        .attr("fill", palette.blue)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.4);
      pulse.append("animateMotion")
        .attr("dur", "3.8s")
        .attr("begin", `${begin}s`)
        .attr("repeatCount", "indefinite")
        .attr("rotate", "auto")
        .append("mpath")
        .attr("href", "#pid-route-feed-main");
    });
    const steamPulse = pulseLayer.append("circle")
      .attr("class", "pid-utility-pulse")
      .attr("r", 4.6)
      .attr("fill", palette.orange)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.3);
    steamPulse.append("animateMotion").attr("dur", "2.8s").attr("begin", ".75s").attr("repeatCount", "indefinite").append("mpath").attr("href", "#pid-route-steam-utility");

    const trip = svg.append("g").attr("class", "pid-safety-interlock").attr("data-interlock-id", "hh-104-shutdown");
    trip.append("rect").attr("x", 372).attr("y", 26).attr("width", 98).attr("height", 24).attr("rx", 5).attr("fill", palette.redHighlight).attr("stroke", palette.red).attr("stroke-width", 1.3);
    trip.append("text").attr("class", "mark-label").attr("x", 421).attr("y", 42).attr("text-anchor", "middle").attr("font-size", 8.2).text("HH closes FV");

    const legend = svg.append("g").attr("class", "pid-legend").attr("transform", "translate(58 386)");
    [
      { label: "process pipe", color: palette.blue, dash: "" },
      { label: "control signal", color: palette.purple, dash: "4 5" },
      { label: "safety trip", color: palette.red, dash: "8 5" }
    ].forEach((item, index) => {
      const x = index * 150;
      legend.append("line").attr("x1", x).attr("x2", x + 34).attr("y1", 0).attr("y2", 0).attr("stroke", item.color).attr("stroke-width", 2.4).attr("stroke-dasharray", item.dash);
      legend.append("text").attr("class", "caption").attr("x", x + 42).attr("y", 4).text(item.label);
    });

    fadeIn(equipmentLayer.selectAll(".pid-equipment"), .1, .55);
    fadeIn(d3.selectAll(valveMarks.map(mark => mark.node())), .18, .55);
    fadeIn(trip, .38, .5);
  }

  function renderNaturalMathArchetypes() {
    const svg = prepareSvg("nature-geometry", "Natural math archetypes", "Six mathematically specified nature patterns arranged as invariant, generative rule, and natural expression.");
    const phi = (1 + Math.sqrt(5)) / 2;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const hexDensity = Math.PI / (2 * Math.sqrt(3));
    svg
      .attr("data-pattern-family", "natural-math")
      .attr("data-archetype-count", 6)
      .attr("data-theory-of-three", "invariant-rule-nature")
      .attr("data-phi", phi.toFixed(12))
      .attr("data-pi", Math.PI.toFixed(12))
      .attr("data-golden-angle-degrees", (goldenAngle * 180 / Math.PI).toFixed(9))
      .attr("data-hex-circle-packing-density", hexDensity.toFixed(12));

    const panels = [
      { id: "golden-angle-phyllotaxis", title: "Golden-angle phyllotaxis", invariant: "phi, 137.508 deg", rule: "theta=n*golden angle", nature: "seed head or rosette", x: 20, y: 44 },
      { id: "pi-circular-wave", title: "Pi circular wave", invariant: "C=2*pi*r", rule: "radius expands evenly", nature: "ripples or rings", x: 194, y: 44 },
      { id: "logarithmic-spiral-shell", title: "Logarithmic spiral", invariant: "r=a*exp(b*t)", rule: "equiangular growth", nature: "shell-like growth", x: 368, y: 44 },
      { id: "fractal-branching", title: "Fractal branching", invariant: "scale repeats", rule: "recursive branches", nature: "ferns, trees, rivers", x: 20, y: 226 },
      { id: "hexagonal-packing", title: "Hexagonal packing", invariant: "density .9069", rule: "120 deg neighbors", nature: "honeycomb cells", x: 194, y: 226 },
      { id: "voronoi-leaf-cells", title: "Voronoi cell field", invariant: "nearest boundary", rule: "bisectors split cells", nature: "leaf pavement cells", x: 368, y: 226 }
    ];
    const panelWidth = 162;
    const panelHeight = 154;
    const panelMap = new Map();

    panels.forEach(panel => {
      const group = svg.append("g")
        .attr("class", "natural-archetype")
        .attr("data-archetype-id", panel.id)
        .attr("transform", `translate(${panel.x},${panel.y})`);
      panelMap.set(panel.id, group);
      group.append("rect")
        .attr("width", panelWidth)
        .attr("height", panelHeight)
        .attr("rx", 8)
        .attr("fill", palette.surface)
        .attr("stroke", palette.gray200)
        .attr("stroke-width", 1.15);
      group.append("text")
        .attr("class", "mark-label")
        .attr("x", 10)
        .attr("y", 18)
        .attr("font-size", 9.2)
        .attr("font-weight", 850)
        .text(panel.title);
      [
        ["Invariant", panel.invariant, palette.blueHighlight, palette.blue],
        ["Rule", panel.rule, palette.greenHighlight, palette.green],
        ["Nature", panel.nature, palette.purpleHighlight, palette.purple]
      ].forEach(([label, value, fill, stroke], index) => {
        const y = 110 + index * 13;
        group.append("rect")
          .attr("class", "archetype-chip")
          .attr("data-chip-role", label.toLowerCase())
          .attr("x", 9)
          .attr("y", y - 9)
          .attr("width", 144)
          .attr("height", 11)
          .attr("rx", 4)
          .attr("fill", fill)
          .attr("stroke", stroke)
          .attr("stroke-opacity", .42);
        group.append("text")
          .attr("class", "mark-label")
          .attr("x", 14)
          .attr("y", y)
          .style("font-size", "5.7px")
          .style("font-weight", "780")
          .text(`${label}: ${value}`);
      });
    });

    const phyllo = panelMap.get("golden-angle-phyllotaxis").append("g")
      .attr("class", "archetype-visual phyllotaxis-visual")
      .attr("data-model", "phyllotaxis")
      .attr("data-phi", phi.toFixed(12))
      .attr("data-golden-angle-radians", goldenAngle.toFixed(12))
      .attr("data-golden-angle-degrees", (goldenAngle * 180 / Math.PI).toFixed(9));
    phyllo.append("circle").attr("cx", 81).attr("cy", 62).attr("r", 41).attr("fill", palette.yellowHighlight).attr("stroke", palette.gray200);
    const seeds = d3.range(64).map(i => {
      const theta = i * goldenAngle;
      const r = 3.65 * Math.sqrt(i);
      return { i, x: 81 + Math.cos(theta) * r, y: 62 + Math.sin(theta) * r, radius: 1.55 + (1 - i / 64) * .55 };
    });
    const seedMarks = phyllo.selectAll("circle.natural-seed").data(seeds).join("circle")
      .attr("class", "natural-seed")
      .attr("data-seed-index", d => d.i)
      .attr("data-divergence-degrees", (goldenAngle * 180 / Math.PI).toFixed(6))
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", d => [palette.blue, palette.green, palette.orange, palette.purple][Math.floor(d.i / 10) % 4])
      .attr("stroke", palette.surface)
      .attr("stroke-width", .38);
    grow(seedMarks, "r", 0, d => d.radius, .04, .34);

    const waves = panelMap.get("pi-circular-wave").append("g")
      .attr("class", "archetype-visual pi-circular-wave-visual")
      .attr("data-model", "circle-wave")
      .attr("data-pi", Math.PI.toFixed(12));
    [12, 23, 34, 45].forEach((radius, index) => {
      const ring = waves.append("circle")
        .attr("class", "natural-wave-ring")
        .attr("data-radius", radius)
        .attr("data-circumference", (2 * Math.PI * radius).toFixed(6))
        .attr("cx", 81)
        .attr("cy", 62)
        .attr("r", radius)
        .attr("fill", "none")
        .attr("stroke", palette.blue)
        .attr("stroke-width", 2.4 - index * .3)
        .attr("stroke-opacity", .72 - index * .1);
      ring.append("animate").attr("attributeName", "stroke-opacity").attr("values", ".16;.86;.5").attr("dur", "1.3s").attr("begin", `${index * .16}s`).attr("fill", "freeze");
    });
    waves.append("circle").attr("cx", 81).attr("cy", 62).attr("r", 4.3).attr("fill", palette.orange).attr("stroke", palette.surface).attr("stroke-width", 1.2);

    const spiral = panelMap.get("logarithmic-spiral-shell").append("g")
      .attr("class", "archetype-visual logarithmic-spiral-visual")
      .attr("data-model", "logarithmic-spiral")
      .attr("data-spiral-a", 4.4)
      .attr("data-spiral-b", .178);
    const spiralPoints = d3.range(104).map(i => {
      const theta = i * .13;
      const r = 4.4 * Math.exp(.178 * theta);
      return [81 + Math.cos(theta) * r, 64 + Math.sin(theta) * r, theta, r];
    });
    const spiralPath = spiral.append("path")
      .attr("class", "natural-log-spiral")
      .attr("d", d3.line().x(d => d[0]).y(d => d[1])(spiralPoints))
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(spiralPath, .08, 1.18);
    spiral.selectAll("circle.spiral-growth-sample").data(spiralPoints.filter((_, i) => i % 10 === 0)).join("circle")
      .attr("class", "spiral-growth-sample")
      .attr("data-theta", d => d[2].toFixed(3))
      .attr("data-radius", d => d[3].toFixed(3))
      .attr("cx", d => d[0])
      .attr("cy", d => d[1])
      .attr("r", (_, i) => 2 + i * .28)
      .attr("fill", palette.orangeHighlight)
      .attr("stroke", palette.orange)
      .attr("stroke-width", .85);

    const branching = panelMap.get("fractal-branching").append("g")
      .attr("class", "archetype-visual fractal-branching-visual")
      .attr("data-model", "recursive-branching")
      .attr("data-fractal-depth", 4);
    const branches = [];
    function branch(x, y, length, angle, depth) {
      const x2 = x + Math.cos(angle) * length;
      const y2 = y + Math.sin(angle) * length;
      branches.push({ x1: x, y1: y, x2, y2, depth, index: branches.length });
      if (depth <= 0) return;
      branch(x2, y2, length * .67, angle - Math.PI / 6.4, depth - 1);
      branch(x2, y2, length * .61, angle + Math.PI / 5.3, depth - 1);
      if (depth >= 2) branch(x2, y2, length * .46, angle + Math.PI / 36, depth - 1);
    }
    branch(81, 94, 23, -Math.PI / 2, 4);
    branching.attr("data-branch-count", branches.length);
    branching.append("line").attr("x1", 38).attr("x2", 124).attr("y1", 96).attr("y2", 96).attr("stroke", palette.gray200);
    const branchPaths = branching.selectAll("path.fractal-branch").data(branches).join("path")
      .attr("class", "fractal-branch")
      .attr("data-branch-index", d => d.index)
      .attr("data-depth", d => d.depth)
      .attr("d", d => `M${d.x1},${d.y1}L${d.x2},${d.y2}`)
      .attr("fill", "none")
      .attr("stroke", d => d.depth < 2 ? palette.green : palette.blue)
      .attr("stroke-width", d => 1 + d.depth * .42)
      .attr("stroke-linecap", "round");
    branchPaths.each(function (d) {
      const length = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
      d3.select(this).attr("pathLength", length.toFixed(3)).attr("stroke-dasharray", `${length} ${length}`).attr("stroke-dashoffset", 0)
        .append("animate").attr("attributeName", "stroke-dashoffset").attr("values", `${length};0`).attr("dur", ".48s").attr("begin", `${d.index * .012}s`).attr("fill", "freeze");
    });

    const hexes = panelMap.get("hexagonal-packing").append("g")
      .attr("class", "archetype-visual hexagonal-packing-visual")
      .attr("data-model", "hexagonal-packing")
      .attr("data-neighbor-angle-degrees", 120)
      .attr("data-circle-packing-density", hexDensity.toFixed(12));
    function hexPoints(cx, cy, r) {
      return d3.range(6).map(i => {
        const a = Math.PI / 180 * (60 * i + 30);
        return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
      }).join(" ");
    }
    const hexData = [];
    d3.range(4).forEach(row => {
      d3.range(5).forEach(col => {
        if ((row === 0 || row === 3) && (col === 0 || col === 4)) return;
        hexData.push({ row, col, i: hexData.length, x: 45 + col * 17.4 + (row % 2) * 8.7, y: 35 + row * 15.2 });
      });
    });
    const hexMarks = hexes.selectAll("polygon.hex-pack-cell").data(hexData).join("polygon")
      .attr("class", "hex-pack-cell")
      .attr("data-cell-index", d => d.i)
      .attr("points", d => hexPoints(d.x, d.y, 10.1))
      .attr("fill", palette.yellowHighlight)
      .attr("stroke", palette.gold)
      .attr("stroke-width", 1.05);
    fadeIn(hexMarks, .04, .5);

    const voronoiPanel = panelMap.get("voronoi-leaf-cells").append("g")
      .attr("class", "archetype-visual voronoi-leaf-cells-visual")
      .attr("data-model", "voronoi");
    const leafPath = "M18,55C29,25 132,23 146,55C129,89 32,87 18,55Z";
    voronoiPanel.append("clipPath").attr("id", "natural-math-leaf-clip").append("path").attr("d", leafPath);
    voronoiPanel.append("path").attr("d", leafPath).attr("fill", palette.greenHighlight).attr("stroke", palette.green).attr("stroke-width", 1.2);
    const sites = [[28, 46], [49, 58], [62, 36], [82, 53], [101, 34], [123, 56], [137, 45], [44, 74], [76, 76], [112, 72]];
    voronoiPanel.attr("data-site-count", sites.length);
    const delaunay = d3.Delaunay.from(sites);
    const voronoi = delaunay.voronoi([16, 24, 148, 88]);
    const cellGroup = voronoiPanel.append("g").attr("clip-path", "url(#natural-math-leaf-clip)");
    const cells = cellGroup.selectAll("path.voronoi-leaf-cell").data(sites).join("path")
      .attr("class", "voronoi-leaf-cell")
      .attr("data-cell-index", (_, i) => i)
      .attr("d", (_, i) => voronoi.renderCell(i))
      .attr("fill", (_, i) => [palette.blueHighlight, palette.greenHighlight, palette.orangeHighlight, palette.purpleHighlight][i % 4])
      .attr("stroke", palette.green)
      .attr("stroke-width", .8)
      .attr("opacity", .92);
    fadeIn(cells, .05, .48);
    voronoiPanel.selectAll("circle.voronoi-site").data(sites).join("circle")
      .attr("class", "voronoi-site")
      .attr("data-site-index", (_, i) => i)
      .attr("cx", d => d[0])
      .attr("cy", d => d[1])
      .attr("r", 1.9)
      .attr("fill", palette.green);
    voronoiPanel.append("path").attr("d", "M27,55C57,51 102,62 138,54").attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 1).attr("stroke-dasharray", "4 5");

    fadeIn(svg.selectAll(".natural-archetype > rect, .natural-archetype > text, .archetype-chip"), .03, .46);
  }

  function renderDorlingCartogram() {
    const svg = prepareSvg("dorling", "Dorling cartogram", "D3 force collision places value circles near geographic anchors.");
    const projection = d3.geoNaturalEarth1().fitExtent([[42, 48], [width - 42, height - 56]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#eef3f7").attr("stroke", "#c1cbd6");
    const regions = [
      { name: "NA", lon: -100, lat: 43, value: 42 }, { name: "SA", lon: -60, lat: -15, value: 24 },
      { name: "EU", lon: 12, lat: 50, value: 31 }, { name: "AF", lon: 22, lat: 2, value: 27 },
      { name: "IN", lon: 78, lat: 22, value: 36 }, { name: "EA", lon: 116, lat: 34, value: 44 },
      { name: "OC", lon: 135, lat: -25, value: 18 }
    ].map((d, i) => {
      const [x, y] = projection([d.lon, d.lat]);
      return { ...d, index: i, anchorX: x, anchorY: y, x, y };
    });
    const r = d3.scaleSqrt().domain([18, 44]).range([18, 36]);
    const nodes = regions.map(d => ({ ...d, radius: r(d.value) }));
    const simulation = d3.forceSimulation(nodes)
      .randomSource(d3.randomLcg(0.28))
      .force("x", d3.forceX(d => d.anchorX).strength(.42))
      .force("y", d3.forceY(d => d.anchorY).strength(.42))
      .force("collide", d3.forceCollide(d => d.radius + 2))
      .stop();
    for (let i = 0; i < 160; i += 1) simulation.tick();
    svg.append("g").selectAll("line").data(nodes).join("line")
      .attr("x1", d => d.anchorX).attr("y1", d => d.anchorY)
      .attr("x2", d => d.x).attr("y2", d => d.y)
      .attr("stroke", "#c9d2dc").attr("stroke-dasharray", "3 4");
    const circles = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => colors[d.index % colors.length])
      .attr("fill-opacity", .78)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    grow(circles, "r", 2, d => d.radius, .12, .72);
    svg.append("g").selectAll("text").data(nodes).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d.x)
      .attr("y", d => d.y + 4)
      .attr("text-anchor", "middle")
      .text(d => d.name);
  }

  function renderBarRace() {
    const svg = prepareSvg("bar-race", "Bar race", "Keyed ranked bars animate from one state to another.");
    const data = [
      { name: "Search", before: 48, after: 82 },
      { name: "API", before: 72, after: 74 },
      { name: "Jobs", before: 61, after: 58 },
      { name: "Assist", before: 36, after: 69 },
      { name: "Data", before: 54, after: 45 },
      { name: "Review", before: 28, after: 63 }
    ];
    const beforeOrder = data.slice().sort((a, b) => d3.descending(a.before, b.before)).map(d => d.name);
    const afterOrder = data.slice().sort((a, b) => d3.descending(a.after, b.after)).map(d => d.name);
    const margin = { top: 40, right: 52, bottom: 46, left: 92 };
    const x = d3.scaleLinear().domain([0, 90]).range([margin.left, width - margin.right]);
    const yBefore = d3.scaleBand().domain(beforeOrder).range([margin.top, height - margin.bottom]).padding(.28);
    const yAfter = d3.scaleBand().domain(afterOrder).range([margin.top, height - margin.bottom]).padding(.28);
    axisBottom(svg, x, height - margin.bottom, 5);
    const rows = svg.append("g").selectAll("g").data(data, d => d.name).join("g");
    const bars = rows.append("rect")
      .attr("x", x(0))
      .attr("y", d => yAfter(d.name))
      .attr("width", d => x(d.after) - x(0))
      .attr("height", yAfter.bandwidth())
      .attr("rx", 4)
      .attr("fill", (d, i) => colors[i]);
    bars.append("animate")
      .attr("attributeName", "width")
      .attr("from", d => x(d.before) - x(0))
      .attr("to", d => x(d.after) - x(0))
      .attr("dur", "1.1s")
      .attr("fill", "freeze");
    bars.append("animate")
      .attr("attributeName", "y")
      .attr("from", d => yBefore(d.name))
      .attr("to", d => yAfter(d.name))
      .attr("dur", "1.1s")
      .attr("fill", "freeze");
    rows.append("text").attr("class", "mark-label")
      .attr("x", 80)
      .attr("y", d => yAfter(d.name) + yAfter.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => d.name);
    rows.append("text").attr("class", "label")
      .attr("x", d => x(d.after) + 8)
      .attr("y", d => yAfter(d.name) + yAfter.bandwidth() / 2 + 4)
      .text(d => d.after);
    svg.append("text").attr("class", "mark-label").attr("x", margin.left).attr("y", 28).text("State B rank");
  }

  function renderFocusContext() {
    const svg = prepareSvg("focus-context", "Focus context", "A selected overview window drives a detailed D3 time-series view.");
    const data = d3.range(64).map(i => ({
      t: i,
      value: 48 + Math.sin(i / 4) * 18 + Math.cos(i / 9) * 12 + (i % 7)
    }));
    const focus = { top: 40, right: 34, bottom: 172, left: 54 };
    const context = { top: 292, right: 34, bottom: 52, left: 54 };
    const windowRange = [18, 44];
    const x = d3.scaleLinear().domain(windowRange).range([focus.left, width - focus.right]);
    const y = d3.scaleLinear().domain([25, 85]).range([height - focus.bottom, focus.top]);
    const x2 = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([context.left, width - context.right]);
    const y2 = d3.scaleLinear().domain([25, 85]).range([height - context.bottom, context.top]);
    const focusData = data.filter(d => d.t >= windowRange[0] && d.t <= windowRange[1]);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    const line2 = d3.line().x(d => x2(d.t)).y(d => y2(d.value)).curve(d3.curveMonotoneX);
    const clipId = "focus-context-clip";
    svg.append("clipPath").attr("id", clipId).append("rect")
      .attr("x", focus.left).attr("y", focus.top)
      .attr("width", width - focus.left - focus.right)
      .attr("height", height - focus.top - focus.bottom);
    axisBottom(svg, x, height - focus.bottom, 5);
    axisLeft(svg, y, focus.left, 4);
    const focusPath = svg.append("path")
      .datum(focusData)
      .attr("clip-path", `url(#${clipId})`)
      .attr("d", line)
      .attr("fill", "none")
      .attr("stroke", palette.blue)
      .attr("stroke-width", 3);
    drawPath(focusPath, .08, .95);
    svg.append("path")
      .datum(data)
      .attr("d", line2)
      .attr("fill", "none")
      .attr("stroke", "#91a2b5")
      .attr("stroke-width", 2);
    const brush = svg.append("rect")
      .attr("x", x2(windowRange[0]))
      .attr("y", context.top - 12)
      .attr("width", x2(windowRange[1]) - x2(windowRange[0]))
      .attr("height", height - context.bottom - context.top + 24)
      .attr("fill", palette.orange)
      .attr("fill-opacity", .18)
      .attr("stroke", palette.orange)
      .attr("rx", 4);
    brush.append("animate")
      .attr("attributeName", "width")
      .attr("from", 24)
      .attr("to", x2(windowRange[1]) - x2(windowRange[0]))
      .attr("dur", ".75s")
      .attr("fill", "freeze");
    axisBottom(svg, x2, height - context.bottom, 5);
    svg.append("text").attr("class", "mark-label").attr("x", focus.left).attr("y", 26).text("Detail");
    svg.append("text").attr("class", "mark-label").attr("x", context.left + 8).attr("y", context.top + 16).text("Context window");
  }

  function renderQuadtreeSearch() {
    const svg = prepareSvg("quadtree-search", "Quadtree search", "D3 quadtree partitions points for nearest-neighbor lookup.");
    const bounds = { x0: 50, y0: 42, x1: width - 42, y1: height - 46 };
    const points = d3.range(42).map(i => ({
      id: i,
      x: bounds.x0 + 16 + ((i * 83) % 420) + Math.sin(i * 1.4) * 10,
      y: bounds.y0 + 16 + ((i * 47) % 292) + Math.cos(i * .8) * 9
    }));
    const tree = d3.quadtree().x(d => d.x).y(d => d.y).extent([[bounds.x0, bounds.y0], [bounds.x1, bounds.y1]]).addAll(points);
    const cells = [];
    tree.visit((node, x0, y0, x1, y1) => {
      cells.push({ x0, y0, x1, y1, leaf: !node.length });
      return false;
    });
    const visibleCells = cells.map(cell => ({
      ...cell,
      x0: Math.max(bounds.x0, cell.x0),
      y0: Math.max(bounds.y0, cell.y0),
      x1: Math.min(bounds.x1, cell.x1),
      y1: Math.min(bounds.y1, cell.y1)
    })).filter(cell => cell.x1 > cell.x0 && cell.y1 > cell.y0);
    const target = [366, 178];
    const nearest = tree.find(target[0], target[1]);
    const cellRects = svg.append("g").selectAll("rect").data(visibleCells).join("rect")
      .attr("x", d => d.x0).attr("y", d => d.y0)
      .attr("width", d => Math.max(0, d.x1 - d.x0))
      .attr("height", d => Math.max(0, d.y1 - d.y0))
      .attr("fill", "none")
      .attr("stroke", d => d.leaf ? palette.gray100 : palette.gray300)
      .attr("stroke-width", d => d.leaf ? .8 : 1.2);
    fadeIn(cellRects, .04, .55);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", palette.blue).attr("fill-opacity", .72).attr("stroke", "#fff");
    grow(dots, "r", 1, 4.4, .1, .55);
    const link = svg.append("line")
      .attr("x1", target[0]).attr("y1", target[1])
      .attr("x2", nearest.x).attr("y2", nearest.y)
      .attr("stroke", palette.red).attr("stroke-width", 2).attr("stroke-dasharray", "4 5");
    fadeIn(link, .25, .55);
    svg.append("circle").attr("cx", target[0]).attr("cy", target[1]).attr("r", 10).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2);
    svg.append("text").attr("class", "mark-label").attr("x", target[0] + 14).attr("y", target[1] - 10).text("query");
  }

  function renderWaterfall() {
    const svg = prepareSvg("waterfall", "Waterfall", "Sequential positive and negative deltas produce a final total.");
    const steps = [
      { name: "Start", value: 42, total: true },
      { name: "New", value: 18 },
      { name: "Upsell", value: 11 },
      { name: "Cost", value: -14 },
      { name: "Churn", value: -9 },
      { name: "End", total: true }
    ];
    let running = 0;
    const data = steps.map((step, i) => {
      if (i === 0) {
        running = step.value;
        return { ...step, start: 0, end: running };
      }
      if (step.total) {
        return { ...step, value: running, start: 0, end: running };
      }
      const start = running;
      running += step.value;
      return { ...step, start, end: running };
    });
    const margin = { top: 38, right: 30, bottom: 58, left: 54 };
    const x = d3.scaleBand().domain(data.map(d => d.name)).range([margin.left, width - margin.right]).padding(.28);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => Math.max(d.start, d.end)) + 8]).nice().range([height - margin.bottom, margin.top]);
    axisLeft(svg, y, margin.left, 5);
    axisBottom(svg, x, height - margin.bottom, 6);
    const bars = svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x", d => x(d.name))
      .attr("y", d => y(Math.max(d.start, d.end)))
      .attr("width", x.bandwidth())
      .attr("height", d => Math.abs(y(d.start) - y(d.end)))
      .attr("rx", 4)
      .attr("fill", d => d.total ? palette.blue : d.value >= 0 ? palette.green : palette.red);
    fadeIn(bars, .08, .65);
    const connectors = svg.append("g").selectAll("line").data(data.slice(0, -1)).join("line")
      .attr("x1", d => x(d.name) + x.bandwidth())
      .attr("x2", (d, i) => x(data[i + 1].name))
      .attr("y1", d => y(d.end)).attr("y2", d => y(d.end))
      .attr("stroke", palette.gray300).attr("stroke-dasharray", "3 4");
    fadeIn(connectors, .25, .5);
  }

  function renderDivergingStack() {
    const svg = prepareSvg("diverging-stack", "Diverging stack", "Likert-style stacked bars diverge around neutral responses.");
    const keys = ["Strong no", "No", "Neutral", "Yes", "Strong yes"];
    const data = [
      { name: "Docs", values: [8, 14, 18, 36, 24] },
      { name: "API", values: [5, 11, 16, 40, 28] },
      { name: "UX", values: [14, 20, 22, 30, 14] },
      { name: "Speed", values: [7, 12, 17, 34, 30] }
    ];
    const x = d3.scaleLinear().domain([-50, 80]).range([88, width - 34]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([70, 320]).padding(.32);
    const segmentColors = [palette.red, palette.redHighlight, palette.gray200, palette.greenHighlight, palette.green];
    const legend = svg.append("g").attr("transform", "translate(48,28)");
    const legendItems = legend.selectAll("g").data(keys).join("g").attr("transform", (_, i) => `translate(${i * 100},0)`);
    legendItems.append("rect").attr("width", 11).attr("height", 11).attr("rx", 2).attr("fill", (_, i) => segmentColors[i]).attr("stroke", palette.gray200);
    legendItems.append("text").attr("class", "caption").attr("x", 16).attr("y", 9).attr("font-size", 9).text(d => d);
    axisBottom(svg, x, 344, 5);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 48).attr("y2", 330).attr("stroke", palette.ink).attr("stroke-opacity", .45);
    const segments = [];
    data.forEach(row => {
      let neg = -row.values[2] / 2;
      let pos = row.values[2] / 2;
      row.values.forEach((value, i) => {
        if (i < 2) {
          const x1 = neg;
          neg -= value;
          segments.push({ row: row.name, key: keys[i], i, x0: neg, x1, value });
        } else if (i === 2) {
          segments.push({ row: row.name, key: keys[i], i, x0: -value / 2, x1: value / 2, value });
        } else {
          const x0 = pos;
          pos += value;
          segments.push({ row: row.name, key: keys[i], i, x0, x1: pos, value });
        }
      });
    });
    const rects = svg.append("g").selectAll("rect").data(segments).join("rect")
      .attr("x", d => x(Math.min(d.x0, d.x1)))
      .attr("y", d => y(d.row))
      .attr("width", d => Math.abs(x(d.x1) - x(d.x0)))
      .attr("height", y.bandwidth())
      .attr("fill", d => segmentColors[d.i])
      .attr("stroke", "#fff");
    fadeIn(rects, .05, .62);
    svg.append("g").selectAll("text").data(data).join("text")
      .attr("class", "mark-label").attr("x", 76).attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d.name);
  }

  function renderTernary() {
    const svg = prepareSvg("ternary", "Ternary plot", "Three-component compositions are projected into triangular simplex coordinates.");
    const triangle = [[280, 58], [92, 330], [468, 330]];
    const toPoint = d => [
      triangle[0][0] * d.a + triangle[1][0] * d.b + triangle[2][0] * d.c,
      triangle[0][1] * d.a + triangle[1][1] * d.b + triangle[2][1] * d.c
    ];
    const data = d3.range(28).map(i => {
      const a = 0.18 + (i % 7) * .07;
      const b = 0.12 + ((i * 3) % 8) * .06;
      const sum = Math.min(.92, a + b);
      return { a: a / sum * .78, b: b / sum * .78, c: .22, group: i % 3 };
    }).map(d => {
      const total = d.a + d.b + d.c;
      return { ...d, a: d.a / total, b: d.b / total, c: d.c / total };
    });
    const outline = svg.append("path")
      .attr("d", `M${triangle[0]}L${triangle[1]}L${triangle[2]}Z`)
      .attr("fill", palette.gray50).attr("stroke", palette.gray300).attr("stroke-width", 1.5);
    fadeIn(outline, .04, .5);
    d3.range(.2, 1, .2).forEach(t => {
      const ab = toPoint({ a: t, b: 1 - t, c: 0 });
      const ac = toPoint({ a: t, b: 0, c: 1 - t });
      const ba = toPoint({ a: 1 - t, b: t, c: 0 });
      const bc = toPoint({ a: 0, b: t, c: 1 - t });
      const ca = toPoint({ a: 1 - t, b: 0, c: t });
      const cb = toPoint({ a: 0, b: 1 - t, c: t });
      [[ab, ac], [ba, bc], [ca, cb]].forEach(pair => svg.append("line")
        .attr("x1", pair[0][0]).attr("y1", pair[0][1]).attr("x2", pair[1][0]).attr("y2", pair[1][1])
        .attr("stroke", "#dbe2ea").attr("stroke-width", .8));
    });
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => toPoint(d)[0]).attr("cy", d => toPoint(d)[1])
      .attr("fill", d => colors[d.group]).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 1, 6, .08, .62);
    [["A", triangle[0][0], triangle[0][1] - 16], ["B", triangle[1][0] - 16, triangle[1][1] + 18], ["C", triangle[2][0] + 16, triangle[2][1] + 18]].forEach(([label, x, y]) => {
      svg.append("text").attr("class", "mark-label").attr("x", x).attr("y", y).attr("text-anchor", "middle").text(label);
    });
  }

  function renderPointRange() {
    const svg = prepareSvg("point-range", "Point range", "Estimates and uncertainty intervals show overlap across groups.");
    const data = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((name, i) => {
      const estimate = [42, 55, 63, 48, 71][i];
      const low = estimate - [8, 11, 7, 13, 9][i];
      const high = estimate + [10, 8, 12, 9, 7][i];
      return { name, estimate, low, high };
    });
    const x = d3.scaleLinear().domain([25, 85]).range([86, width - 44]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([64, 326]).padding(.45);
    axisBottom(svg, x, 350, 5);
    const ranges = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => x(d.low)).attr("x2", d => x(d.high))
      .attr("y1", d => y(d.name) + y.bandwidth() / 2)
      .attr("y2", d => y(d.name) + y.bandwidth() / 2)
      .attr("stroke", "#8fa0b3").attr("stroke-width", 4).attr("stroke-linecap", "round");
    drawPath(ranges, .08, .75);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.estimate)).attr("cy", d => y(d.name) + y.bandwidth() / 2)
      .attr("fill", palette.orange).attr("stroke", "#fff").attr("stroke-width", 1.6);
    grow(dots, "r", 2, 8, .18, .55);
    svg.append("g").selectAll("text").data(data).join("text")
      .attr("class", "mark-label").attr("x", 74).attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d.name);
  }

  function renderBullet() {
    const svg = prepareSvg("bullet", "Bullet chart", "Compact performance bands compare current value against a target.");
    const data = [
      { name: "Latency", value: 72, target: 64, ranges: [45, 68, 90] },
      { name: "Quality", value: 83, target: 78, ranges: [55, 75, 95] },
      { name: "Reach", value: 58, target: 70, ranges: [40, 62, 88] }
    ];
    const x = d3.scaleLinear().domain([0, 100]).range([122, width - 44]);
    const y = d3.scaleBand().domain(data.map(d => d.name)).range([78, 310]).padding(.42);
    data.forEach(row => {
      const g = svg.append("g").attr("transform", `translate(0,${y(row.name)})`);
      row.ranges.slice().reverse().forEach((range, i) => {
        g.append("rect").attr("x", x(0)).attr("y", 0).attr("width", x(range) - x(0)).attr("height", y.bandwidth())
          .attr("fill", ["#dfe6ee", "#c4ceda", "#aab8c7"][i]).attr("rx", 4);
      });
      const value = g.append("rect").attr("x", x(0)).attr("y", y.bandwidth() * .28)
        .attr("width", x(row.value) - x(0)).attr("height", y.bandwidth() * .44)
        .attr("fill", palette.blue).attr("rx", 3);
      value.append("animate").attr("attributeName", "width").attr("from", 0).attr("to", x(row.value) - x(0)).attr("dur", ".8s").attr("fill", "freeze");
      g.append("line").attr("x1", x(row.target)).attr("x2", x(row.target)).attr("y1", -4).attr("y2", y.bandwidth() + 4)
        .attr("stroke", palette.ink).attr("stroke-width", 2.2);
      g.append("text").attr("class", "mark-label").attr("x", 108).attr("y", y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(row.name);
    });
    axisBottom(svg, x, 342, 5);
  }

  function renderFacets() {
    const svg = prepareSvg("facet-sparklines", "Facet sparklines", "Small multiples repeat scale and encoding across comparable panels.");
    const groups = ["North", "South", "East", "West", "Core", "Labs"];
    const data = groups.map((name, gi) => ({
      name,
      values: d3.range(18).map(i => ({ x: i, y: 42 + Math.sin(i / 2.5 + gi) * 18 + Math.cos(i / 4 + gi * .7) * 9 }))
    }));
    const panelW = 150, panelH = 92;
    const x = d3.scaleLinear().domain([0, 17]).range([18, panelW - 14]);
    const y = d3.scaleLinear().domain([15, 75]).range([panelH - 22, 16]);
    const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    const panels = svg.append("g").selectAll("g").data(data).join("g")
      .attr("transform", (d, i) => `translate(${54 + (i % 3) * 162},${48 + Math.floor(i / 3) * 142})`);
    panels.append("rect").attr("width", panelW).attr("height", panelH).attr("rx", 6).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const paths = panels.append("path").attr("d", d => line(d.values)).attr("fill", "none").attr("stroke", (d, i) => colors[i % colors.length]).attr("stroke-width", 2.3);
    drawPath(paths, .08, .7);
    panels.append("text").attr("class", "mark-label").attr("x", 12).attr("y", 14).text(d => d.name);
  }

  function renderBarcode() {
    const svg = prepareSvg("barcode-plot", "Barcode plot", "Dense event times are encoded as ordered ticks on multiple lanes.");
    const lanes = ["API", "Jobs", "Search", "Billing"];
    const data = lanes.flatMap((lane, li) => d3.range(24).map(i => ({
      lane,
      time: (i * (7 + li * 2) + li * 9) % 96,
      severity: (i + li) % 4
    }))).sort((a, b) => d3.ascending(a.time, b.time));
    const x = d3.scaleLinear().domain([0, 100]).range([82, width - 36]);
    const y = d3.scaleBand().domain(lanes).range([72, 314]).padding(.34);
    axisBottom(svg, x, 346, 5);
    svg.append("g").selectAll("text").data(lanes).join("text")
      .attr("class", "mark-label").attr("x", 68).attr("y", d => y(d) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d);
    const ticks = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => x(d.time)).attr("x2", d => x(d.time))
      .attr("y1", d => y(d.lane)).attr("y2", d => y(d.lane) + y.bandwidth())
      .attr("stroke", d => colors[d.severity]).attr("stroke-width", 2.1).attr("stroke-linecap", "round");
    fadeIn(ticks, .035, .55);
    lanes.forEach(lane => {
      svg.append("line").attr("x1", x(0)).attr("x2", x(100)).attr("y1", y(lane) + y.bandwidth() + 7).attr("y2", y(lane) + y.bandwidth() + 7)
        .attr("stroke", "#e3e8ee");
    });
  }

  function renderEventCascade() {
    const svg = prepareSvg("event-cascade", "Event cascade", "Timed lane events propagate through lagged dependencies.");
    const lanes = ["Detect", "Route", "Act", "Recover"];
    const events = [
      { id: "e1", lane: "Detect", t: 8 }, { id: "e2", lane: "Route", t: 21 }, { id: "e3", lane: "Act", t: 35 }, { id: "e4", lane: "Recover", t: 52 },
      { id: "e5", lane: "Detect", t: 28 }, { id: "e6", lane: "Route", t: 42 }, { id: "e7", lane: "Act", t: 58 }, { id: "e8", lane: "Recover", t: 76 }
    ];
    const links = [["e1", "e2"], ["e2", "e3"], ["e3", "e4"], ["e5", "e6"], ["e6", "e7"], ["e7", "e8"]];
    const byId = new Map(events.map(d => [d.id, d]));
    const x = d3.scaleLinear().domain([0, 84]).range([78, width - 42]);
    const y = d3.scaleBand().domain(lanes).range([70, 318]).padding(.42);
    axisBottom(svg, x, 350, 5);
    svg.append("g").selectAll("text").data(lanes).join("text")
      .attr("class", "mark-label").attr("x", 66).attr("y", d => y(d) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end").text(d => d);
    lanes.forEach(lane => svg.append("line").attr("x1", x(0)).attr("x2", x(84)).attr("y1", y(lane) + y.bandwidth() / 2).attr("y2", y(lane) + y.bandwidth() / 2).attr("stroke", palette.gray100));
    const linkPath = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const paths = svg.append("g").selectAll("path").data(links).join("path")
      .attr("d", ([source, target]) => linkPath({
        source: { x: x(byId.get(source).t), y: y(byId.get(source).lane) + y.bandwidth() / 2 },
        target: { x: x(byId.get(target).t), y: y(byId.get(target).lane) + y.bandwidth() / 2 }
      }))
      .attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 2.4).attr("stroke-opacity", .72);
    drawPath(paths, .15, .9);
    const dots = svg.append("g").selectAll("circle").data(events).join("circle")
      .attr("cx", d => x(d.t)).attr("cy", d => y(d.lane) + y.bandwidth() / 2)
      .attr("fill", d => colors[lanes.indexOf(d.lane)]).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots, "r", 1, 7, .08, .55);
  }

  function renderGeofenceJoin() {
    const svg = prepareSvg("geofence-join", "Geofenced activity", "Point-in-polygon grouping rolls up local activity totals.");
    const regions = [
      { id: "North", points: [[96, 66], [236, 48], [258, 158], [132, 182], [96, 66]], color: "#d9e9f7" },
      { id: "Core", points: [[258, 72], [430, 90], [402, 210], [250, 178], [258, 72]], color: "#d9ebd7" },
      { id: "South", points: [[112, 198], [250, 182], [394, 224], [366, 334], [142, 324], [112, 198]], color: "#f7dfc6" }
    ];
    const points = d3.range(42).map(i => ({
      x: 104 + (i * 53) % 310 + Math.sin(i) * 18,
      y: 78 + (i * 37) % 236 + Math.cos(i * .7) * 14
    }));
    points.forEach(point => {
      point.region = regions.find(region => d3.polygonContains(region.points, [point.x, point.y]))?.id || "Outside";
    });
    const counts = d3.rollup(points.filter(d => d.region !== "Outside"), v => v.length, d => d.region);
    const path = d3.line().x(d => d[0]).y(d => d[1]);
    const shapes = svg.append("g").selectAll("path").data(regions).join("path")
      .attr("d", d => `${path(d.points)}Z`)
      .attr("fill", d => d.color).attr("stroke", "#fff").attr("stroke-width", 2);
    fadeIn(shapes, .05, .7);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.region === "Outside" ? "#9aa7b5" : palette.blue)
      .attr("fill-opacity", d => d.region === "Outside" ? .35 : .82)
      .attr("stroke", "#fff");
    grow(dots, "r", 1, d => d.region === "Outside" ? 3 : 5, .1, .55);
    svg.append("g").selectAll("text").data(regions).join("text")
      .attr("class", "mark-label")
      .attr("x", d => d3.polygonCentroid(d.points)[0])
      .attr("y", d => d3.polygonCentroid(d.points)[1])
      .attr("text-anchor", "middle")
      .text(d => `${d.id} ${counts.get(d.id) || 0}`);
  }

  function renderIsolineTerrain() {
    const svg = prepareSvg("isoline-terrain", "Isoline terrain", "D3 contours turn a scalar grid into nested elevation bands.");
    const cols = 36, rows = 24;
    const values = d3.range(cols * rows).map(i => {
      const x = i % cols, y = Math.floor(i / cols);
      const ridge = Math.exp(-((x - 14) ** 2 + (y - 10) ** 2) / 90) * 1.3;
      const peak = Math.exp(-((x - 25) ** 2 + (y - 15) ** 2) / 34) * 1.6;
      return ridge + peak + Math.sin(x / 4) * .12 + Math.cos(y / 3) * .1;
    });
    const thresholds = d3.range(.25, 1.9, .22);
    const contours = d3.contours().size([cols, rows]).thresholds(thresholds)(values);
    const projection = d3.geoIdentity().scale(12.8).translate([48, 48]);
    const path = d3.geoPath(projection);
    const color = quantizedRamp([0, thresholds.at(-1)], ramps.terrain);
    const bands = svg.append("g").selectAll("path").data(contours).join("path")
      .attr("d", path)
      .attr("fill", d => color(d.value))
      .attr("stroke", "#fff")
      .attr("stroke-width", .8);
    fadeIn(bands, .05, .7);
    const ridge = svg.append("path").datum(contours.at(-1)).attr("d", path).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 2.2);
    drawPath(ridge, .35, .9);
  }

  function renderEcdf() {
    const svg = prepareSvg("ecdf", "Empirical CDF", "Sorted observations accumulate into cumulative probability.");
    const values = d3.range(48).map(i => 28 + Math.sin(i * .47) * 15 + Math.cos(i * .19) * 12 + i * .65).sort(d3.ascending);
    const data = values.map((value, i) => ({ value, p: (i + 1) / values.length }));
    const margin = { top: 38, right: 34, bottom: 52, left: 56 };
    const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const rug = svg.append("g").selectAll("line").data(values).join("line")
      .attr("x1", d => x(d)).attr("x2", d => x(d))
      .attr("y1", height - margin.bottom + 8).attr("y2", height - margin.bottom + 20)
      .attr("stroke", palette.cyan).attr("stroke-width", 1.4);
    fadeIn(rug, .03, .5);
    const line = d3.line().x(d => x(d.value)).y(d => y(d.p)).curve(d3.curveStepAfter);
    const path = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3);
    drawPath(path, .15, 1);
    [.25, .5, .75].forEach(q => {
      const value = d3.quantileSorted(values, q);
      svg.append("line").attr("x1", x(value)).attr("x2", x(value)).attr("y1", y(q)).attr("y2", height - margin.bottom)
        .attr("stroke", palette.orange).attr("stroke-dasharray", "4 5");
      svg.append("text").attr("class", "label").attr("x", x(value) + 5).attr("y", y(q) - 5).text(`q${q * 100}`);
    });
  }

  function renderForecastFan() {
    const svg = prepareSvg("forecast-fan", "Forecast fan", "Nested prediction intervals widen across future periods.");
    const history = d3.range(12).map(i => ({ t: i, y: 42 + Math.sin(i / 2) * 8 + i * 1.5 }));
    const future = d3.range(12, 21).map(i => {
      const median = 42 + Math.sin(i / 2) * 8 + i * 1.5;
      const spread = (i - 11) * 2.3;
      return { t: i, median, lo80: median - spread, hi80: median + spread, lo50: median - spread * .55, hi50: median + spread * .55 };
    });
    const margin = { top: 34, right: 34, bottom: 50, left: 54 };
    const x = d3.scaleLinear().domain([0, 20]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([20, 95]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const area = (lo, hi) => d3.area().x(d => x(d.t)).y0(d => y(d[lo])).y1(d => y(d[hi])).curve(d3.curveMonotoneX);
    const bands = [
      { lo: "lo80", hi: "hi80", fill: palette.blueHighlight },
      { lo: "lo50", hi: "hi50", fill: palette.cyan }
    ];
    const bandPaths = svg.append("g").selectAll("path").data(bands).join("path")
      .attr("d", d => area(d.lo, d.hi)(future))
      .attr("fill", d => d.fill).attr("fill-opacity", .66);
    fadeIn(bandPaths, .12, .75);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.y ?? d.median)).curve(d3.curveMonotoneX);
    const historyPath = svg.append("path").datum(history).attr("d", line).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2.6);
    const medianPath = svg.append("path").datum(future).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 2.6).attr("stroke-dasharray", "5 4");
    drawPath(historyPath, .05, .9);
    drawPath(medianPath, .3, .8);
  }

  function renderLassoSelection() {
    const svg = prepareSvg("lasso-selection", "Lasso selection", "A freeform polygon isolates an irregular point cluster.");
    const points = d3.range(46).map(i => ({
      x: 72 + (i * 61) % 414 + Math.sin(i * 1.2) * 15,
      y: 62 + (i * 43) % 272 + Math.cos(i * .9) * 14
    }));
    const lasso = [[178, 102], [292, 78], [392, 136], [365, 246], [250, 282], [158, 210], [178, 102]];
    points.forEach(point => point.selected = d3.polygonContains(lasso, [point.x, point.y]));
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.selected ? palette.orange : "#9aa7b5")
      .attr("fill-opacity", d => d.selected ? .88 : .28)
      .attr("stroke", "#fff").attr("stroke-width", 1.2);
    grow(dots, "r", 1, d => d.selected ? 6 : 4, .06, .55);
    const lassoPath = svg.append("path").attr("d", `${d3.line()(lasso)}Z`).attr("fill", palette.orange).attr("fill-opacity", .1).attr("stroke", palette.orange).attr("stroke-width", 2.5);
    drawPath(lassoPath, .2, .9);
    const selected = points.filter(d => d.selected).length;
    svg.append("text").attr("class", "mark-label").attr("x", 352).attr("y", 70).text(`${selected} selected`);
  }

  function renderFreehandTrace() {
    const svg = prepareSvg("freehand-trace", "Freehand trace", "A red point simulates hand drawing by leaving a progressive red ink trail on a white field.");
    svg.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", palette.surface);

    const points = [
      [70, 236], [100, 206], [137, 219], [153, 272], [116, 302], [86, 274],
      [96, 228], [154, 182], [229, 168], [289, 196], [274, 254], [214, 263],
      [190, 226], [229, 182], [320, 156], [409, 166], [470, 218], [443, 278],
      [367, 298], [315, 264], [335, 213], [409, 190], [481, 224]
    ].map(([x, y], i) => ({
      x,
      y: y + Math.sin(i * 1.9) * 5,
      pressure: .7 + ((i * 13) % 7) / 18
    }));
    const line = d3.line()
      .x(d => d.x)
      .y(d => d.y)
      .curve(d3.curveCatmullRom.alpha(.72));
    const pathData = line(points);
    const drawDuration = 3.45;
    const drawBegin = .12;

    const guide = svg.append("path")
      .attr("id", "freehand-trace-motion-path")
      .attr("d", pathData)
      .attr("fill", "none")
      .attr("stroke", "none");

    const revealStroke = (selection, delay, duration) => {
      selection.each(function () {
        const length = this.getTotalLength ? this.getTotalLength() : 760;
        d3.select(this)
          .attr("stroke-dasharray", `${length} ${length}`)
          .attr("stroke-dashoffset", length);
        d3.select(this).append("animate")
          .attr("attributeName", "stroke-dashoffset")
          .attr("from", length)
          .attr("to", 0)
          .attr("dur", `${duration}s`)
          .attr("begin", `${delay}s`)
          .attr("fill", "freeze");
      });
    };

    const underlay = svg.append("path")
      .attr("d", pathData)
      .attr("fill", "none")
      .attr("stroke", palette.redHighlight)
      .attr("stroke-width", 12)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .7);
    const trace = svg.append("path")
      .attr("d", pathData)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 5.6)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .95);
    revealStroke(underlay, drawBegin, drawDuration);
    revealStroke(trace, drawBegin, drawDuration);

    const guideNode = guide.node();
    const totalLength = guideNode && guideNode.getTotalLength ? guideNode.getTotalLength() : 760;
    const deposits = d3.range(38).map(i => {
      const t = (i + .35) / 38;
      const point = guideNode && guideNode.getPointAtLength ? guideNode.getPointAtLength(totalLength * t) : { x: points[0].x, y: points[0].y };
      return {
        x: point.x + Math.sin(i * 2.3) * 2.8,
        y: point.y + Math.cos(i * 1.7) * 2.1,
        r: 1.2 + ((i * 11) % 8) * .18,
        opacity: .1 + ((i * 5) % 7) * .022,
        delay: drawBegin + t * drawDuration
      };
    });
    const inkDots = svg.append("g").selectAll("circle.ink-dot").data(deposits).join("circle")
      .attr("class", "ink-dot")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 0)
      .attr("fill", palette.red)
      .attr("opacity", 0);
    inkDots.each(function (d) {
      const dot = d3.select(this);
      dot.append("animate")
        .attr("attributeName", "r")
        .attr("from", 0)
        .attr("to", d.r)
        .attr("dur", ".16s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
      dot.append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", d.opacity)
        .attr("dur", ".18s")
        .attr("begin", `${d.delay}s`)
        .attr("fill", "freeze");
    });

    const point = svg.append("g").attr("class", "drawing-point");
    point.append("circle")
      .attr("r", 13)
      .attr("fill", palette.redHighlight)
      .attr("fill-opacity", .78);
    point.append("circle")
      .attr("r", 6.6)
      .attr("fill", palette.red)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2.4);
    point.append("animateMotion")
      .attr("dur", `${drawDuration}s`)
      .attr("begin", `${drawBegin}s`)
      .attr("fill", "freeze")
      .append("mpath")
      .attr("href", "#freehand-trace-motion-path");
  }

  function renderAiLineWriting() {
    const svg = prepareSvg("ai-line-writing", "AI line writing", "Line paths progressively write the words AI Generated as monoline lettering.");
    svg.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", palette.surface);

    const glyphs = {
      A: { w: 1.02, strokes: [[[.05, 1], [.5, 0], [.97, 1]], [[.25, .6], [.75, .6]]] },
      I: { w: .5, strokes: [[[.5, 0], [.5, 1]], [[.18, 0], [.82, 0]], [[.18, 1], [.82, 1]]] },
      G: { w: 1.08, strokes: [[[.92, .27], [.72, .08], [.34, .08], [.1, .29], [.1, .72], [.34, .94], [.74, .91], [.96, .7], [.96, .54], [.64, .54]]] },
      e: { w: .88, strokes: [[[.78, .5], [.22, .5], [.2, .3], [.42, .16], [.7, .23], [.82, .5], [.72, .78], [.44, .92], [.18, .75], [.2, .5]]] },
      n: { w: .92, strokes: [[[.14, 1], [.14, .34], [.18, .48], [.42, .26], [.7, .35], [.8, 1]]] },
      r: { w: .7, strokes: [[[.16, 1], [.16, .3], [.18, .48], [.4, .3], [.68, .34]]] },
      a: { w: .88, strokes: [[[.72, .98], [.72, .38], [.55, .18], [.28, .24], [.12, .52], [.18, .8], [.42, .94], [.7, .72]], [[.72, .4], [.84, .28]]] },
      t: { w: .62, strokes: [[[.45, .08], [.45, .88], [.56, 1]], [[.16, .34], [.76, .34]]] },
      d: { w: .92, strokes: [[[.78, .06], [.78, 1]], [[.78, .38], [.58, .2], [.28, .25], [.12, .54], [.18, .82], [.44, .94], [.78, .76]]] }
    };
    const line = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveCatmullRom.alpha(.72));
    const measure = (word, gap) => {
      let total = 0;
      [...word].forEach((letter, index) => {
        total += letter === " " ? .74 : glyphs[letter].w;
        if (index < word.length - 1) total += gap;
      });
      return total;
    };
    const makeWord = (word, y, scale, strokeWidth, gap) => {
      const totalWidth = measure(word, gap) * scale;
      let x = (width - totalWidth) / 2;
      const strokes = [];
      [...word].forEach(letter => {
        if (letter === " ") {
          x += (.74 + gap) * scale;
          return;
        }
        const glyph = glyphs[letter];
        glyph.strokes.forEach(points => {
          const absolutePoints = points.map(point => [x + point[0] * scale, y + point[1] * scale]);
          strokes.push({
            d: line(absolutePoints),
            points: absolutePoints,
            strokeWidth
          });
        });
        x += (glyph.w + gap) * scale;
      });
      return strokes;
    };

    let writeCursor = .08;
    const rawStrokes = [
      ...makeWord("AI", 54, 118, 7.6, .24),
      ...makeWord("Generated", 226, 54, 4.9, .14)
    ];
    const connectorDuration = .055;
    const strokes = rawStrokes.map((stroke, index) => {
      const duration = index < 5 ? .22 + (index % 2) * .025 : .13 + (index % 4) * .012;
      const delay = writeCursor;
      writeCursor += duration + (index < rawStrokes.length - 1 ? connectorDuration : 0);
      return {
        ...stroke,
        id: `ai-line-writing-stroke-${index}`,
        delay,
        duration
      };
    });
    const animateStroke = selection => {
      selection.each(function (d) {
        const length = this.getTotalLength ? this.getTotalLength() : 140;
        d3.select(this)
          .attr("stroke-dasharray", `${length} ${length}`)
          .attr("stroke-dashoffset", length);
        d3.select(this).append("animate")
          .attr("attributeName", "stroke-dashoffset")
          .attr("from", length)
          .attr("to", 0)
          .attr("dur", `${d.duration}s`)
          .attr("begin", `${d.delay}s`)
          .attr("fill", "freeze");
      });
    };

    const halo = svg.append("g").selectAll("path.ai-line-halo").data(strokes).join("path")
      .attr("class", "ai-line-halo")
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.redHighlight)
      .attr("stroke-width", d => d.strokeWidth + 5)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .82);
    const lettering = svg.append("g").selectAll("path.ai-line-letter").data(strokes).join("path")
      .attr("class", "ai-line-letter")
      .attr("id", d => d.id)
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", d => d.strokeWidth)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");
    animateStroke(halo);
    animateStroke(lettering);
    const approximateLength = points => d3.pairs(points).reduce((sum, pair) => sum + Math.hypot(pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]), 0);
    lettering.each(function (d) {
      d.pathLength = this.getTotalLength ? this.getTotalLength() : approximateLength(d.points);
    });

    let motionDistance = 0;
    const motionCommands = [];
    strokes.forEach((stroke, index) => {
      const start = stroke.points[0];
      if (index === 0) {
        motionCommands.push(`M${start[0]},${start[1]}`);
      } else {
        const previousEnd = strokes[index - 1].points.at(-1);
        motionDistance += Math.hypot(start[0] - previousEnd[0], start[1] - previousEnd[1]);
        motionCommands.push(`L${start[0]},${start[1]}`);
      }
      stroke.motionStart = motionDistance;
      motionCommands.push(stroke.d.replace(/^M[^A-Za-z]*/, ""));
      motionDistance += stroke.pathLength;
      stroke.motionEnd = motionDistance;
    });
    const motionPath = svg.append("path")
      .attr("id", "ai-line-writing-pen-path")
      .attr("d", motionCommands.join(""))
      .attr("fill", "none")
      .attr("stroke", "none");
    const motionLength = motionPath.node()?.getTotalLength?.() || motionDistance || 1;
    const totalDuration = writeCursor + .18;
    const keyTimes = [0];
    const keyPoints = [0];
    strokes.forEach(stroke => {
      keyTimes.push(stroke.delay / totalDuration, (stroke.delay + stroke.duration) / totalDuration);
      keyPoints.push(stroke.motionStart / motionLength, stroke.motionEnd / motionLength);
    });
    keyTimes.push(1);
    keyPoints.push(strokes.at(-1).motionEnd / motionLength);

    const pen = svg.append("g")
      .attr("class", "ai-line-writing-pen");
    pen.append("circle")
      .attr("r", 11.5)
      .attr("fill", palette.red)
      .attr("fill-opacity", .96);
    pen.append("animateMotion")
      .attr("dur", `${totalDuration}s`)
      .attr("begin", "0s")
      .attr("fill", "freeze")
      .attr("calcMode", "linear")
      .attr("keyTimes", keyTimes.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .attr("keyPoints", keyPoints.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .append("mpath")
      .attr("href", "#ai-line-writing-pen-path");

  }

  function renderPenCurveStudy() {
    const svg = prepareSvg("pen-curve-study", "Pen curve study", "A precise pen point lays pressure-modulated calligraphic curves as a base technique for more complex line-art drawings.");
    svg.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", width).attr("height", height)
      .attr("fill", palette.surface);

    const cubicPath = segments => segments.map((segment, index) => {
      const [p0, p1, p2, p3] = segment;
      return `${index === 0 ? `M${p0[0]},${p0[1]}` : ""}C${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`;
    }).join("");
    const cubicPoint = (segment, t) => {
      const mt = 1 - t;
      const [p0, p1, p2, p3] = segment;
      return [
        mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0],
        mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1]
      ];
    };
    const pressure = (t, min, max, lift = .76) => min + (max - min) * Math.pow(Math.sin(Math.PI * t), lift);
    const ribbonLine = d3.line()
      .x(d => d[0])
      .y(d => d[1])
      .curve(d3.curveBasis);
    const buildRibbonPath = stroke => {
      const left = [];
      const right = [];
      stroke.sampled.forEach((sample, index, samples) => {
        const prev = samples[Math.max(0, index - 1)].point;
        const next = samples[Math.min(samples.length - 1, index + 1)].point;
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const length = Math.hypot(dx, dy) || 1;
        const normal = [-dy / length, dx / length];
        const radius = pressure(sample.t, stroke.minWidth, stroke.maxWidth) / 2;
        left.push([sample.point[0] + normal[0] * radius, sample.point[1] + normal[1] * radius]);
        right.push([sample.point[0] - normal[0] * radius, sample.point[1] - normal[1] * radius]);
      });
      return `${ribbonLine(left)}${ribbonLine(right.reverse()).replace(/^M/, "L")}Z`;
    };
    const rawStrokes = [
      {
        minWidth: 1.15, maxWidth: 5.8, samples: 22,
        segments: [
          [[54, 314], [142, 354], [230, 316], [304, 330]],
          [[304, 330], [382, 346], [440, 310], [510, 326]]
        ]
      },
      {
        minWidth: 1.1, maxWidth: 7.9, samples: 24,
        segments: [
          [[184, 312], [142, 238], [170, 124], [254, 112]],
          [[254, 112], [354, 96], [372, 214], [292, 244]],
          [[292, 244], [216, 274], [160, 210], [214, 164]],
          [[214, 164], [274, 112], [352, 146], [350, 218]]
        ]
      },
      {
        minWidth: 1, maxWidth: 4.8, samples: 22,
        segments: [
          [[78, 152], [142, 84], [226, 92], [286, 134]],
          [[286, 134], [350, 178], [414, 146], [478, 90]]
        ]
      },
      {
        minWidth: 1.1, maxWidth: 7.2, samples: 24,
        segments: [
          [[316, 280], [336, 190], [432, 168], [472, 224]],
          [[472, 224], [506, 272], [444, 326], [374, 286]],
          [[374, 286], [330, 260], [346, 210], [390, 202]],
          [[390, 202], [438, 192], [486, 228], [506, 270]]
        ]
      },
      {
        minWidth: 1.1, maxWidth: 6.4, samples: 22,
        segments: [
          [[62, 282], [88, 216], [166, 214], [182, 270]],
          [[182, 270], [192, 314], [126, 344], [84, 302]],
          [[84, 302], [52, 272], [70, 234], [116, 226]]
        ]
      },
      {
        minWidth: 1, maxWidth: 4.8, samples: 20,
        segments: [
          [[244, 324], [276, 276], [342, 292], [322, 334]],
          [[322, 334], [304, 370], [244, 354], [252, 320]]
        ]
      }
    ];
    let writeCursor = .1;
    const connectorDuration = .12;
    const strokes = rawStrokes.map((stroke, index) => {
      const d = cubicPath(stroke.segments);
      const duration = .78 + index * .08;
      const delay = writeCursor;
      writeCursor += duration + (index < rawStrokes.length - 1 ? connectorDuration : 0);
      const sampled = stroke.segments.flatMap((segment, segmentIndex) => d3.range(0, stroke.samples + 1).map(step => ({
        point: cubicPoint(segment, step / stroke.samples),
        t: (segmentIndex + step / stroke.samples) / stroke.segments.length
      })).slice(segmentIndex ? 1 : 0));
      const prepared = {
        ...stroke,
        d,
        points: sampled.map(datum => datum.point),
        sampled,
        id: `pen-curve-study-stroke-${index}`,
        delay,
        duration,
        strokeWidth: stroke.maxWidth
      };
      prepared.ribbonD = buildRibbonPath(prepared);
      return prepared;
    });
    const drawStroke = selection => {
      selection.each(function (d) {
        const length = this.getTotalLength ? this.getTotalLength() : 280;
        d.pathLength = length;
        d3.select(this)
          .attr("stroke-dasharray", `${length} ${length}`)
          .attr("stroke-dashoffset", length);
        d3.select(this).append("animate")
          .attr("attributeName", "stroke-dashoffset")
          .attr("from", length)
          .attr("to", 0)
          .attr("dur", `${d.duration}s`)
          .attr("begin", `${d.delay}s`)
          .attr("fill", "freeze");
      });
    };

    const halo = svg.append("g").selectAll("path.pen-curve-halo").data(strokes).join("path")
      .attr("class", "pen-curve-halo")
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.redHighlight)
      .attr("stroke-width", d => d.strokeWidth + 6.4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .38);
    drawStroke(halo);

    const pressureSegments = strokes.flatMap(stroke => stroke.sampled.slice(0, -1).map((sample, index) => {
      const next = stroke.sampled[index + 1];
      const segmentLength = Math.hypot(next.point[0] - sample.point[0], next.point[1] - sample.point[1]);
      const t = (sample.t + next.t) / 2;
      return {
        stroke,
        x1: sample.point[0],
        y1: sample.point[1],
        x2: next.point[0],
        y2: next.point[1],
        length: segmentLength,
        begin: stroke.delay + stroke.duration * index / Math.max(1, stroke.sampled.length - 1),
        duration: Math.max(.05, stroke.duration / Math.max(1, stroke.sampled.length - 1) * 1.6),
        width: pressure(t, stroke.minWidth, stroke.maxWidth)
      };
    }));

    const ink = svg.append("g").selectAll("line.pen-curve-pressure").data(pressureSegments).join("line")
      .attr("class", "pen-curve-pressure")
      .attr("x1", d => d.x1).attr("y1", d => d.y1)
      .attr("x2", d => d.x2).attr("y2", d => d.y2)
      .attr("stroke", palette.redHover)
      .attr("stroke-width", d => d.width)
      .attr("stroke-linecap", "round")
      .attr("stroke-opacity", .97)
      .attr("stroke-dasharray", d => `${d.length} ${d.length}`)
      .attr("stroke-dashoffset", d => d.length);
    ink.append("animate")
      .attr("attributeName", "stroke-dashoffset")
      .attr("from", d => d.length)
      .attr("to", 0)
      .attr("dur", d => `${d.duration}s`)
      .attr("begin", d => `${d.begin}s`)
      .attr("fill", "freeze");
    ink.append("animate")
      .attr("attributeName", "stroke-opacity")
      .attr("from", .97)
      .attr("to", .04)
      .attr("dur", ".16s")
      .attr("begin", d => `${d.stroke.delay + d.stroke.duration + .03}s`)
      .attr("fill", "freeze");

    const ribbon = svg.append("g").selectAll("path.pen-curve-ribbon").data(strokes).join("path")
      .attr("class", "pen-curve-ribbon")
      .attr("d", d => d.ribbonD)
      .attr("fill", palette.redHover)
      .attr("fill-opacity", .98)
      .attr("opacity", 0);
    ribbon.append("animate")
      .attr("attributeName", "opacity")
      .attr("from", 0)
      .attr("to", 1)
      .attr("dur", ".18s")
      .attr("begin", d => `${d.delay + d.duration - .08}s`)
      .attr("fill", "freeze");

    const hairline = svg.append("g").selectAll("path.pen-curve-hairline").data(strokes).join("path")
      .attr("class", "pen-curve-hairline")
      .attr("id", d => d.id)
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.15)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-opacity", .9);
    drawStroke(hairline);

    let motionDistance = 0;
    const motionCommands = [];
    strokes.forEach((stroke, index) => {
      const start = stroke.points[0];
      if (index === 0) {
        motionCommands.push(`M${start[0]},${start[1]}`);
      } else {
        const previousEnd = strokes[index - 1].points.at(-1);
        motionDistance += Math.hypot(start[0] - previousEnd[0], start[1] - previousEnd[1]);
        motionCommands.push(`L${start[0]},${start[1]}`);
      }
      stroke.motionStart = motionDistance;
      motionCommands.push(stroke.d.replace(/^M[^A-Za-z]*/, ""));
      motionDistance += stroke.pathLength;
      stroke.motionEnd = motionDistance;
    });
    const penPath = svg.append("path")
      .attr("id", "pen-curve-study-pen-path")
      .attr("d", motionCommands.join(""))
      .attr("fill", "none")
      .attr("stroke", "none");
    const motionLength = penPath.node()?.getTotalLength?.() || motionDistance || 1;
    const totalDuration = writeCursor + .2;
    const keyTimes = [0];
    const keyPoints = [0];
    strokes.forEach(stroke => {
      keyTimes.push(stroke.delay / totalDuration, (stroke.delay + stroke.duration) / totalDuration);
      keyPoints.push(stroke.motionStart / motionLength, stroke.motionEnd / motionLength);
    });
    keyTimes.push(1);
    keyPoints.push(strokes.at(-1).motionEnd / motionLength);

    const pen = svg.append("g").attr("class", "pen-curve-study-pen");
    pen.append("circle")
      .attr("r", 12.5)
      .attr("fill", palette.red)
      .attr("fill-opacity", .96);
    pen.append("animateMotion")
      .attr("dur", `${totalDuration}s`)
      .attr("begin", "0s")
      .attr("fill", "freeze")
      .attr("calcMode", "linear")
      .attr("keyTimes", keyTimes.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .attr("keyPoints", keyPoints.map(value => Math.max(0, Math.min(1, value)).toFixed(4)).join(";"))
      .append("mpath")
      .attr("href", "#pen-curve-study-pen-path");
  }

  function renderPenLabelOptimizer() {
    const svg = prepareSvg("pen-label-optimizer", "Pen label optimizer", "Dense pen-like points use measured mixed-length labels, candidate positions, and simulated annealing to maximize readable labels.");
    const plot = { x0: 34, y0: 50, x1: 392, y1: 356 };
    const labelTexts = [
      "QK", "Tokenizer", "KV cache", "GPU batch", "Attention head", "Logit lens", "RoPE phase", "MoE router",
      "Beam-4", "Prompt span", "Long context", "Cache page", "Draft token", "Verifier", "RMS norm", "SwiGLU gate",
      "LoRA rank", "Softmax tail", "Top-p cutoff", "Temp 0.8", "Embedding", "Head merge", "Matmul tile", "Residual",
      "Query", "Key vector", "Value vector", "Pos enc", "FFN up", "FFN down", "Spec decode", "Block mask",
      "Memory tier", "Token 42", "Batch slot", "Rank update", "Context ring", "Layer 07", "Shard A", "Expert 12",
      "Router cap", "EOS prob", "Safety tag", "Chunk id", "Page fault", "Latency p95", "Throughput", "Warm cache",
      "Cold start", "Loss curve", "Gradient", "Adapter", "Quant Q4", "FP8 block", "GPU lane", "Host queue",
      "Stream id", "Tool call", "JSON field", "System msg", "User intent", "Answer span", "Citation", "Stop seq"
    ];
    const labelCount = labelTexts.length;
    const clusters = [
      { cx: 172, cy: 168, rx: 78, ry: 56 },
      { cx: 255, cy: 188, rx: 82, ry: 62 },
      { cx: 204, cy: 248, rx: 96, ry: 48 },
      { cx: 306, cy: 264, rx: 58, ry: 60 }
    ];
    const points = d3.range(labelCount).map(i => {
      const cluster = clusters[i % clusters.length];
      const angle = i * 2.399963 + (i % 7) * .31;
      const radius = .22 + ((i * 37) % 78) / 100;
      return {
        id: `P${String(i + 1).padStart(2, "0")}`,
        label: labelTexts[i],
        x: Math.max(plot.x0 + 10, Math.min(plot.x1 - 10, cluster.cx + Math.cos(angle) * cluster.rx * radius + Math.sin(i * .9) * 10)),
        y: Math.max(plot.y0 + 10, Math.min(plot.y1 - 10, cluster.cy + Math.sin(angle) * cluster.ry * radius + Math.cos(i * .6) * 8)),
        priority: 100 - i + ((i * 13) % 19) / 20
      };
    }).sort((a, b) => d3.descending(a.priority, b.priority));
    const estimateLabelWidth = text => Array.from(text).reduce((sum, char) => {
      if (char === " ") return sum + 3.2;
      if ("MW@#%".includes(char)) return sum + 8.1;
      if ("ilI1|.,:;".includes(char)) return sum + 3.2;
      if (/[A-Z0-9]/.test(char)) return sum + 6.2;
      return sum + 5.2;
    }, 0);
    const measureLayer = svg.append("g")
      .attr("class", "pen-label-measure")
      .attr("opacity", 0)
      .attr("pointer-events", "none");
    measureLayer.selectAll("text")
      .data(points)
      .join("text")
      .attr("class", "mark-label")
      .attr("x", -900)
      .attr("y", -900)
      .attr("font-size", 8.8)
      .attr("font-weight", d => d.priority > 76 ? 900 : 700)
      .text(d => d.label)
      .each(function (d) {
        const measured = typeof this.getComputedTextLength === "function" ? this.getComputedTextLength() : 0;
        const boxWidth = typeof this.getBBox === "function" ? this.getBBox().width : 0;
        d.labelWidth = Math.ceil(Math.max(measured || 0, boxWidth || 0, estimateLabelWidth(d.label)));
        d.labelLength = d.label.length;
      });
    measureLayer.remove();
    const labelLengthExtent = d3.extent(points, d => d.labelLength);
    const labelWidthExtent = d3.extent(points, d => d.labelWidth);
    const labelSize = d => ({ w: Math.max(22, d.labelWidth + 10), h: 17 });
    const directions = [
      { dx: 1, dy: -1, anchor: "start" },
      { dx: 1, dy: 0, anchor: "start" },
      { dx: 1, dy: 1, anchor: "start" },
      { dx: -1, dy: -1, anchor: "end" },
      { dx: -1, dy: 0, anchor: "end" },
      { dx: -1, dy: 1, anchor: "end" },
      { dx: 0, dy: -1, anchor: "middle" },
      { dx: 0, dy: 1, anchor: "middle" }
    ];
    const offsets = [12, 28, 46, 68, 92];
    const candidatesFor = d => {
      const { w, h } = labelSize(d);
      return directions.flatMap((direction, directionIndex) => offsets.map((offset, offsetIndex) => {
        const cx = d.x + direction.dx * offset;
        const cy = d.y + direction.dy * offset;
        let x0 = cx;
        if (direction.anchor === "middle") x0 = cx - w / 2;
        if (direction.anchor === "end") x0 = cx - w;
        const y0 = cy - h / 2;
        return {
          x0,
          y0,
          x1: x0 + w,
          y1: y0 + h,
          w,
          h,
          anchor: direction.anchor,
          textX: direction.anchor === "end" ? x0 + w : direction.anchor === "middle" ? x0 + w / 2 : x0,
          textY: y0 + h - 3,
          offset,
          directionIndex,
          offsetIndex
        };
      }));
    };
    const overlapArea = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const outsideArea = box => {
      const ix0 = Math.max(box.x0, plot.x0);
      const iy0 = Math.max(box.y0, plot.y0);
      const ix1 = Math.min(box.x1, plot.x1);
      const iy1 = Math.min(box.y1, plot.y1);
      const inside = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
      return (box.x1 - box.x0) * (box.y1 - box.y0) - inside;
    };
    const intersects = (a, b, pad = 2) => !(a.x1 + pad < b.x0 || a.x0 - pad > b.x1 || a.y1 + pad < b.y0 || a.y0 - pad > b.y1);
    const labelDistance = (point, box) => {
      const cx = Math.max(box.x0, Math.min(point.x, box.x1));
      const cy = Math.max(box.y0, Math.min(point.y, box.y1));
      return Math.hypot(cx - point.x, cy - point.y);
    };
    const summarizePlacements = (name, placements) => {
      let pairOverlap = 0;
      let overlap = 0;
      placements.forEach((a, i) => {
        placements.slice(i + 1).forEach(b => {
          const area = overlapArea(a.box, b.box);
          if (area > 0) {
            pairOverlap += 1;
            overlap += area;
          }
        });
      });
      const visible = [];
      placements.slice().sort((a, b) => d3.descending(a.point.priority, b.point.priority)).forEach(item => {
        if (outsideArea(item.box) === 0 && !visible.some(kept => intersects(item.box, kept.box, 1))) {
          visible.push(item);
        }
      });
      return {
        name,
        placements,
        visible,
        readable: visible.length,
        pairOverlap,
        overlapArea: Math.round(overlap),
        meanDistance: d3.mean(placements, item => labelDistance(item.point, item.box))
      };
    };
    const baselineLayout = () => summarizePlacements("Radial", points.map(point => ({ point, box: candidatesFor(point)[0] })));
    const greedyLayout = () => {
      const kept = [];
      const placements = [];
      points.forEach(point => {
        const best = candidatesFor(point)
          .map(box => ({
            box,
            cost: outsideArea(box) * 999 + d3.sum(kept, keptItem => overlapArea(box, keptItem.box) * 999) + labelDistance(point, box) * .25 + box.offset * .07
          }))
          .sort((a, b) => d3.ascending(a.cost, b.cost))[0].box;
        const placement = { point, box: best };
        placements.push(placement);
        if (outsideArea(best) === 0 && !kept.some(keptItem => intersects(best, keptItem.box, 1))) {
          kept.push(placement);
        }
      });
      return summarizePlacements("Greedy", placements);
    };
    const forceLayout = () => {
      const labels = points.map(point => {
        const size = labelSize(point);
        return { point, w: size.w, h: size.h, cx: point.x + 12, cy: point.y - 12 };
      });
      for (let iteration = 0; iteration < 260; iteration += 1) {
        for (let i = 0; i < labels.length; i += 1) {
          const a = labels[i];
          a.cx += (a.point.x + 12 - a.cx) * .025;
          a.cy += (a.point.y - 12 - a.cy) * .025;
          const box = { x0: a.cx - a.w / 2, x1: a.cx + a.w / 2, y0: a.cy - a.h / 2, y1: a.cy + a.h / 2 };
          if (box.x0 < plot.x0) a.cx += (plot.x0 - box.x0) * .4;
          if (box.x1 > plot.x1) a.cx -= (box.x1 - plot.x1) * .4;
          if (box.y0 < plot.y0) a.cy += (plot.y0 - box.y0) * .4;
          if (box.y1 > plot.y1) a.cy -= (box.y1 - plot.y1) * .4;
          for (let j = i + 1; j < labels.length; j += 1) {
            const b = labels[j];
            const dx = a.cx - b.cx || .01;
            const dy = a.cy - b.cy || .01;
            const ox = (a.w + b.w) / 2 + 4 - Math.abs(dx);
            const oy = (a.h + b.h) / 2 + 4 - Math.abs(dy);
            if (ox > 0 && oy > 0) {
              const push = Math.min(ox, oy) * .025;
              const sx = dx < 0 ? -1 : 1;
              const sy = dy < 0 ? -1 : 1;
              if (ox < oy) {
                a.cx += sx * push;
                b.cx -= sx * push;
              } else {
                a.cy += sy * push;
                b.cy -= sy * push;
              }
            }
          }
        }
      }
      return summarizePlacements("Force", labels.map(item => ({
        point: item.point,
        box: {
          x0: item.cx - item.w / 2,
          y0: item.cy - item.h / 2,
          x1: item.cx + item.w / 2,
          y1: item.cy + item.h / 2,
          w: item.w,
          h: item.h,
          textX: item.cx,
          textY: item.cy + 4,
          anchor: "middle"
        }
      })));
    };
    const annealedLayout = () => {
      const candidatesByPoint = points.map(candidatesFor);
      let assignment = points.map(() => 0);
      const placed = [];
      points.forEach((point, pointIndex) => {
        const best = candidatesByPoint[pointIndex]
          .map((box, boxIndex) => ({
            boxIndex,
            cost: outsideArea(box) * 999 + d3.sum(placed, placedBox => overlapArea(box, placedBox) * 999) + labelDistance(point, box) * .18 + box.offset * .05
          }))
          .sort((a, b) => d3.ascending(a.cost, b.cost))[0].boxIndex;
        assignment[pointIndex] = best;
        placed.push(candidatesByPoint[pointIndex][best]);
      });
      const energy = trial => {
        const boxes = trial.map((boxIndex, pointIndex) => candidatesByPoint[pointIndex][boxIndex]);
        let score = 0;
        boxes.forEach((box, i) => {
          score += outsideArea(box) * 1200;
          score += labelDistance(points[i], box) * .45;
          score += box.offset * .08;
          for (let j = i + 1; j < boxes.length; j += 1) {
            score += overlapArea(box, boxes[j]) * 34;
          }
        });
        return score;
      };
      let bestAssignment = assignment.slice();
      let currentEnergy = energy(assignment);
      let bestEnergy = currentEnergy;
      let seed = 17;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let iteration = 0; iteration < 5200; iteration += 1) {
        const pointIndex = Math.floor(random() * points.length);
        const trial = assignment.slice();
        trial[pointIndex] = Math.floor(random() * candidatesByPoint[pointIndex].length);
        const trialEnergy = energy(trial);
        const temperature = 34 * Math.pow(.996, iteration) + .08;
        if (trialEnergy < currentEnergy || Math.exp((currentEnergy - trialEnergy) / temperature) > random()) {
          assignment = trial;
          currentEnergy = trialEnergy;
          if (trialEnergy < bestEnergy) {
            bestEnergy = trialEnergy;
            bestAssignment = trial.slice();
          }
        }
      }
      return summarizePlacements("Anneal", bestAssignment.map((boxIndex, pointIndex) => ({
        point: points[pointIndex],
        box: candidatesByPoint[pointIndex][boxIndex]
      })));
    };

    const results = [baselineLayout(), greedyLayout(), forceLayout(), annealedLayout()];
    const best = results.slice().sort((a, b) => d3.descending(a.readable, b.readable) || d3.ascending(a.meanDistance, b.meanDistance))[0];
    const visibleIds = new Set(best.visible.map(item => item.point.id));
    svg
      .attr("data-pattern-family", "label-placement")
      .attr("data-label-count", labelCount)
      .attr("data-variable-labels", "true")
      .attr("data-min-label-length", labelLengthExtent[0])
      .attr("data-max-label-length", labelLengthExtent[1])
      .attr("data-min-label-width", Math.round(labelWidthExtent[0]))
      .attr("data-max-label-width", Math.round(labelWidthExtent[1]))
      .attr("data-best-algorithm", best.name.toLowerCase())
      .attr("data-readable-labels", best.readable)
      .attr("data-baseline-readable", results[0].readable)
      .attr("data-greedy-readable", results[1].readable)
      .attr("data-force-readable", results[2].readable)
      .attr("data-anneal-readable", results[3].readable);

    svg.append("rect")
      .attr("x", plot.x0)
      .attr("y", plot.y0)
      .attr("width", plot.x1 - plot.x0)
      .attr("height", plot.y1 - plot.y0)
      .attr("rx", 8)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.2);
    clusters.forEach(cluster => {
      svg.append("ellipse")
        .attr("cx", cluster.cx)
        .attr("cy", cluster.cy)
        .attr("rx", cluster.rx)
        .attr("ry", cluster.ry)
        .attr("fill", palette.blueHighlight)
        .attr("fill-opacity", .12)
        .attr("stroke", palette.gray200)
        .attr("stroke-dasharray", "4 5");
    });
    const marks = svg.append("g").selectAll("circle.pen-label-point")
      .data(points)
      .join("circle")
      .attr("class", "pen-label-point")
      .attr("data-point-id", d => d.id)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", d => visibleIds.has(d.id) ? palette.blue : palette.gray300)
      .attr("fill-opacity", d => visibleIds.has(d.id) ? .82 : .5)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1);
    grow(marks, "r", 1, d => visibleIds.has(d.id) ? 3.6 : 2.2, .05, .45);

    const leaderGroup = svg.append("g")
      .attr("class", "pen-label-leaders")
      .attr("stroke", palette.gray500)
      .attr("stroke-opacity", .46)
      .attr("stroke-width", .85);
    const leaders = leaderGroup.selectAll("line")
      .data(best.visible)
      .join("line")
      .attr("data-point-id", d => d.point.id)
      .attr("x1", d => d.point.x)
      .attr("y1", d => d.point.y)
      .attr("x2", d => d.box.anchor === "end" ? d.box.x1 : d.box.anchor === "middle" ? (d.box.x0 + d.box.x1) / 2 : d.box.x0)
      .attr("y2", d => (d.box.y0 + d.box.y1) / 2);
    fadeIn(leaders, .28, .45);

    const labelGroups = svg.append("g")
      .attr("class", "pen-label-layer")
      .selectAll("g.pen-label")
      .data(best.visible)
      .join("g")
      .attr("class", "pen-label")
      .attr("data-point-id", d => d.point.id)
      .attr("data-label-text", d => d.point.label)
      .attr("data-label-length", d => d.point.labelLength)
      .attr("data-label-width", d => d.point.labelWidth)
      .attr("data-priority", d => d.point.priority.toFixed(2))
      .attr("transform", d => `translate(${d.box.x0},${d.box.y0})`);
    labelGroups.append("rect")
      .attr("width", d => d.box.w)
      .attr("height", d => d.box.h)
      .attr("rx", 4)
      .attr("fill", palette.surface)
      .attr("fill-opacity", .94)
      .attr("stroke", d => d.point.priority > 76 ? palette.blue : palette.gray200)
      .attr("stroke-width", .85);
    labelGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", d => d.box.anchor === "end" ? d.box.w - 4 : d.box.anchor === "middle" ? d.box.w / 2 : 4)
      .attr("y", 12)
      .attr("text-anchor", d => d.box.anchor)
      .attr("font-size", 8.8)
      .attr("font-weight", d => d.point.priority > 76 ? 900 : 700)
      .attr("fill", palette.ink)
      .text(d => d.point.label);
    fadeIn(labelGroups, .42, .55);

    const summary = svg.append("g").attr("transform", "translate(414,58)");
    summary.append("text")
      .attr("class", "mark-label")
      .attr("x", 0)
      .attr("y", 0)
      .attr("font-size", 12)
      .attr("font-weight", 900)
      .text(`${labelCount} mixed labels`);
    summary.append("text")
      .attr("class", "caption")
      .attr("x", 0)
      .attr("y", 18)
      .attr("font-size", 10)
      .text(`${labelLengthExtent[0]}-${labelLengthExtent[1]} chars measured`);
    const rows = summary.selectAll("g.pen-label-score")
      .data(results)
      .join("g")
      .attr("class", "pen-label-score")
      .attr("data-algorithm", d => d.name.toLowerCase())
      .attr("data-readable", d => d.readable)
      .attr("data-overlap-area", d => d.overlapArea)
      .attr("transform", (d, i) => `translate(0,${44 + i * 36})`);
    rows.append("rect")
      .attr("x", 0)
      .attr("y", -13)
      .attr("width", 116)
      .attr("height", 27)
      .attr("rx", 5)
      .attr("fill", d => d.name === best.name ? palette.greenHighlight : palette.surface)
      .attr("stroke", d => d.name === best.name ? palette.green : palette.gray200);
    rows.append("text")
      .attr("class", "mark-label")
      .attr("x", 8)
      .attr("y", -1)
      .attr("font-size", 9.5)
      .attr("font-weight", 850)
      .text(d => d.name);
    rows.append("text")
      .attr("class", "caption")
      .attr("x", 8)
      .attr("y", 10)
      .attr("font-size", 8.5)
      .text(d => `${d.readable}/64 readable`);
    rows.append("rect")
      .attr("x", 72)
      .attr("y", -4)
      .attr("width", d => d.readable / labelCount * 36)
      .attr("height", 6)
      .attr("rx", 3)
      .attr("fill", d => d.name === best.name ? palette.green : palette.blue)
      .attr("fill-opacity", .78);
    fadeIn(rows, .58, .5);

    svg.append("text")
      .attr("class", "caption")
      .attr("x", plot.x0)
      .attr("y", 382)
      .attr("font-size", 10)
      .attr("font-weight", 800)
      .text(`${best.name.toLowerCase()} kept ${best.readable} readable mixed labels; radial kept ${results[0].readable}`);
  }

  function renderCriticalPath() {
    const svg = prepareSvg("critical-path", "Critical path DAG", "Weighted dependencies reveal the bottleneck route.");
    const nodes = [
      { id: "Plan", rank: 0, row: 1 }, { id: "Design", rank: 1, row: 0 }, { id: "Data", rank: 1, row: 2 },
      { id: "Build", rank: 2, row: 1 }, { id: "Review", rank: 3, row: 0 }, { id: "Launch", rank: 4, row: 1 }, { id: "Learn", rank: 5, row: 1 }
    ];
    const links = [
      ["Plan", "Design", 4, true], ["Plan", "Data", 3, false], ["Design", "Build", 8, true],
      ["Data", "Build", 5, false], ["Build", "Review", 6, true], ["Review", "Launch", 3, true],
      ["Build", "Launch", 4, false], ["Launch", "Learn", 2, true]
    ].map(([source, target, duration, critical]) => ({ source, target, duration, critical }));
    const byId = new Map(nodes.map(d => [d.id, d]));
    const x = d3.scalePoint().domain([0, 1, 2, 3, 4, 5]).range([70, width - 56]);
    const y = d3.scalePoint().domain([0, 1, 2]).range([82, 298]);
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const paths = svg.append("g").selectAll("path").data(links).join("path")
      .attr("d", d => link({ source: { x: x(byId.get(d.source).rank), y: y(byId.get(d.source).row) }, target: { x: x(byId.get(d.target).rank), y: y(byId.get(d.target).row) } }))
      .attr("fill", "none").attr("stroke", d => d.critical ? palette.red : "#b8c4d1")
      .attr("stroke-width", d => d.critical ? 3 : 1.8).attr("stroke-opacity", d => d.critical ? .88 : .55);
    drawPath(paths, .08, .85);
    const groups = svg.append("g").selectAll("g").data(nodes).join("g").attr("transform", d => `translate(${x(d.rank)},${y(d.row)})`);
    const circles = groups.append("circle").attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(circles, "r", 4, 18, .15, .55);
    groups.append("text").attr("class", "label").attr("text-anchor", "middle").attr("dy", 34).text(d => d.id);
  }

  function renderCriticalIncidentEscalation() {
    const chartWidth = 820;
    const chartHeight = 420;
    const svg = prepareSvg(
      "incident-escalation",
      "Critical incident escalation",
      "A SEV response timeline shows detection, command, communications, SLA pressure, mitigation, recovery, and response roles."
    )
      .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
      .attr("data-pattern-family", "critical-incident");

    const left = 132;
    const right = 610;
    const maxMinute = 52;
    const slaMinute = 30;
    const currentMinute = 27;
    const x = d3.scaleLinear().domain([0, maxMinute]).range([left, right]);
    const lanes = [
      { id: "signal", label: "Signal", y: 150 },
      { id: "command", label: "Command", y: 216 },
      { id: "mitigation", label: "Mitigation", y: 282 }
    ];
    const laneY = new Map(lanes.map(d => [d.id, d.y]));
    const phases = [
      { id: "detect", label: "Detect", start: 0, end: 7, status: "sev1", color: palette.red, fill: palette.redHighlight },
      { id: "coordinate", label: "Coordinate", start: 7, end: 18, status: "command", color: palette.purple, fill: palette.purpleHighlight },
      { id: "contain", label: "Contain", start: 18, end: 32, status: "warning", color: palette.orange, fill: palette.orangeHighlight },
      { id: "recover", label: "Recover", start: 32, end: 52, status: "stable", color: palette.green, fill: palette.greenHighlight }
    ];
    const events = [
      { id: "alert", label: ["Alert", "fires"], minute: 0, lane: "signal", severity: "sev1", owner: "monitoring", color: palette.blue, fill: palette.blueHighlight, lx: 0, ly: -28, anchor: "middle" },
      { id: "impact", label: ["Impact", "confirmed"], minute: 4, lane: "signal", severity: "sev1", owner: "on-call", color: palette.red, fill: palette.redHighlight, lx: 0, ly: 36, anchor: "middle" },
      { id: "ic", label: ["IC", "assigned"], minute: 7, lane: "command", severity: "sev1", owner: "incident-commander", color: palette.purple, fill: palette.purpleHighlight, lx: -16, ly: -8, anchor: "end" },
      { id: "bridge", label: ["Bridge", "open"], minute: 11, lane: "command", severity: "sev1", owner: "incident-commander", color: palette.purple, fill: palette.purpleHighlight, lx: 11, ly: 35, anchor: "start" },
      { id: "comms", label: ["Stakeholder", "update"], minute: 16, lane: "command", severity: "warning", owner: "comms-lead", color: palette.purple, fill: palette.purpleHighlight, lx: 0, ly: -34, anchor: "middle" },
      { id: "failover", label: ["Failover", "starts"], minute: 23, lane: "mitigation", severity: "warning", owner: "ops-lead", color: palette.orange, fill: palette.orangeHighlight, lx: -10, ly: -46, anchor: "end" },
      { id: "contained", label: ["Impact", "contained"], minute: 29, lane: "mitigation", severity: "warning", owner: "ops-lead", color: palette.orange, fill: palette.orangeHighlight, lx: 10, ly: -46, anchor: "start" },
      { id: "recovered", label: ["Service", "healthy"], minute: 39, lane: "mitigation", severity: "stable", owner: "sre", color: palette.green, fill: palette.greenHighlight, lx: 0, ly: -35, anchor: "middle" },
      { id: "postmortem", label: ["Postmortem", "queued"], minute: 49, lane: "mitigation", severity: "stable", owner: "incident-commander", color: palette.green, fill: palette.greenHighlight, lx: 0, ly: -35, anchor: "middle" }
    ];
    const escalations = [
      { id: "alert-impact", source: "alert", target: "impact", kind: "detect", critical: true, color: palette.red },
      { id: "impact-ic", source: "impact", target: "ic", kind: "page", critical: true, color: palette.red },
      { id: "ic-bridge", source: "ic", target: "bridge", kind: "command", critical: true, color: palette.purple },
      { id: "bridge-comms", source: "bridge", target: "comms", kind: "coordinate", critical: true, color: palette.purple },
      { id: "comms-failover", source: "comms", target: "failover", kind: "handoff", critical: true, color: palette.orange },
      { id: "failover-contained", source: "failover", target: "contained", kind: "mitigate", critical: true, color: palette.orange },
      { id: "contained-recovered", source: "contained", target: "recovered", kind: "verify", critical: true, color: palette.green },
      { id: "recovered-postmortem", source: "recovered", target: "postmortem", kind: "learn", critical: false, color: palette.green }
    ];
    const communicationBeats = [
      { id: "first-update", minute: 16, label: "First update", color: palette.purple, fill: palette.purpleHighlight },
      { id: "sla-update", minute: 31, label: "SLA update", color: palette.orange, fill: palette.orangeHighlight },
      { id: "recovery-update", minute: 46, label: "Recovery update", color: palette.green, fill: palette.greenHighlight }
    ];
    const mitigations = [
      { id: "freeze", minute: 18, label: "Freeze deploys", status: "contain", color: palette.orange, fill: palette.orangeHighlight },
      { id: "failover", minute: 23, label: "Route failover", status: "mitigate", color: palette.orange, fill: palette.orangeHighlight },
      { id: "verify", minute: 39, label: "Verify SLOs", status: "validate", color: palette.green, fill: palette.greenHighlight },
      { id: "review", minute: 49, label: "Postmortem", status: "learn", color: palette.green, fill: palette.greenHighlight }
    ];
    const teams = [
      { id: "incident-commander", label: "Incident commander", status: "owns state", color: palette.purple, fill: palette.purpleHighlight },
      { id: "ops-lead", label: "Ops lead", status: "changes prod", color: palette.orange, fill: palette.orangeHighlight },
      { id: "comms-lead", label: "Comms lead", status: "updates", color: palette.blue, fill: palette.blueHighlight },
      { id: "scribe", label: "Scribe", status: "keeps log", color: palette.green, fill: palette.greenHighlight }
    ];
    const statusCards = [
      { id: "severity", label: "Severity", value: "SEV-1 contained", color: palette.red, fill: palette.redHighlight },
      { id: "owner", label: "Owner", value: "IC: Rivera", color: palette.purple, fill: palette.purpleHighlight },
      { id: "impact", label: "Impact", value: "partial -> low", color: palette.orange, fill: palette.orangeHighlight },
      { id: "next", label: "Next update", value: "+15m cadence", color: palette.blue, fill: palette.blueHighlight }
    ];
    const eventById = new Map(events.map(d => [d.id, d]));
    const criticalEscalations = escalations.filter(d => d.critical);

    svg
      .attr("data-event-count", events.length)
      .attr("data-escalation-count", escalations.length)
      .attr("data-critical-escalation-count", criticalEscalations.length)
      .attr("data-phase-count", phases.length)
      .attr("data-team-count", teams.length)
      .attr("data-mitigation-count", mitigations.length)
      .attr("data-communication-count", communicationBeats.length)
      .attr("data-status-card-count", statusCards.length);

    function pointFor(event) {
      return { x: x(event.minute), y: laneY.get(event.lane) };
    }

    function pathFor(link) {
      const source = pointFor(eventById.get(link.source));
      const target = pointFor(eventById.get(link.target));
      const dx = Math.max(32, Math.abs(target.x - source.x) * .42);
      const sameLaneBend = source.y === target.y ? 16 : 0;
      return `M${source.x},${source.y} C${source.x + dx},${source.y - sameLaneBend} ${target.x - dx},${target.y + sameLaneBend} ${target.x},${target.y}`;
    }

    function stackedText(parent, lines, x0, y0, attrs = {}) {
      const text = parent.append("text")
        .attr("x", x0)
        .attr("y", y0)
        .attr("class", attrs.className || "mark-label")
        .attr("text-anchor", attrs.anchor || "middle")
        .attr("font-size", attrs.fontSize || 8.7)
        .attr("font-weight", attrs.weight || 850);
      lines.forEach((line, index) => {
        text.append("tspan")
          .attr("x", x0)
          .attr("dy", index ? attrs.lineHeight || 10 : 0)
          .text(line);
      });
      return text;
    }

    svg.append("rect")
      .attr("x", 18)
      .attr("y", 18)
      .attr("width", chartWidth - 36)
      .attr("height", chartHeight - 26)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200);
    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", 34)
      .attr("y", 42)
      .attr("font-size", 17)
      .attr("font-weight", 900)
      .text("Critical incident escalation");
    svg.append("text")
      .attr("class", "caption")
      .attr("x", 34)
      .attr("y", 60)
      .attr("font-size", 9.7)
      .attr("font-weight", 760)
      .text("SEV response timeline with SLA pressure, command state, communications, mitigation, recovery, and learning.");

    const phaseGroups = svg.append("g")
      .attr("class", "severity-bands")
      .selectAll("g")
      .data(phases)
      .join("g")
      .attr("class", "severity-band")
      .attr("data-phase-id", d => d.id)
      .attr("data-status", d => d.status)
      .attr("transform", d => `translate(${x(d.start)},70)`);
    phaseGroups.append("rect")
      .attr("width", d => x(d.end) - x(d.start) - 2)
      .attr("height", 18)
      .attr("rx", 5)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.1);
    phaseGroups.append("text")
      .attr("class", "caption")
      .attr("x", d => (x(d.end) - x(d.start) - 2) / 2)
      .attr("y", 12)
      .attr("text-anchor", "middle")
      .attr("font-size", 8.2)
      .attr("font-weight", 860)
      .text(d => d.label);
    fadeIn(phaseGroups, .04, .32);

    const tickGroups = svg.append("g")
      .attr("class", "incident-axis")
      .selectAll("g")
      .data(d3.range(0, 53, 10))
      .join("g")
      .attr("class", "incident-tick")
      .attr("data-minute", d => d);
    tickGroups.append("line")
      .attr("x1", d => x(d))
      .attr("x2", d => x(d))
      .attr("y1", 104)
      .attr("y2", 304)
      .attr("stroke", palette.gray200)
      .attr("stroke-dasharray", "2 6");
    tickGroups.append("text")
      .attr("class", "caption")
      .attr("x", d => x(d))
      .attr("y", d => d === 0 ? 316 : 119)
      .attr("text-anchor", "middle")
      .attr("font-size", 8.5)
      .text(d => `${d}m`);
    fadeIn(tickGroups, .1, .35);

    const deadlineX = x(slaMinute);
    const currentX = x(currentMinute);
    const sla = svg.append("g")
      .attr("class", "sla-countdown")
      .attr("data-sla-minutes", slaMinute)
      .attr("data-current-minute", currentMinute);
    sla.append("line")
      .attr("x1", left)
      .attr("x2", deadlineX)
      .attr("y1", 106)
      .attr("y2", 106)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 6)
      .attr("stroke-linecap", "round");
    const pressure = sla.append("line")
      .attr("x1", left)
      .attr("x2", currentX)
      .attr("y1", 106)
      .attr("y2", 106)
      .attr("stroke", palette.orange)
      .attr("stroke-width", 6)
      .attr("stroke-linecap", "round");
    pressure.append("animate")
      .attr("attributeName", "x2")
      .attr("from", left)
      .attr("to", currentX)
      .attr("dur", "1.05s")
      .attr("begin", ".18s")
      .attr("fill", "freeze");
    sla.append("line")
      .attr("class", "incident-clock")
      .attr("data-minute", slaMinute)
      .attr("x1", deadlineX)
      .attr("x2", deadlineX)
      .attr("y1", 96)
      .attr("y2", 304)
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.7)
      .attr("stroke-dasharray", "5 5");
    sla.append("text").attr("class", "caption").attr("x", deadlineX + 16).attr("y", 101).attr("text-anchor", "start").attr("font-size", 8.3).attr("font-weight", 850).text("30m SLA");
    sla.append("text").attr("class", "caption").attr("x", currentX - 16).attr("y", 101).attr("text-anchor", "end").attr("font-size", 8.2).attr("font-weight", 850).attr("fill", palette.orangeHover).text("3m guardrail");

    const laneGroups = svg.append("g")
      .attr("class", "incident-lanes")
      .selectAll("g")
      .data(lanes)
      .join("g")
      .attr("class", "incident-lane")
      .attr("data-lane-id", d => d.id);
    laneGroups.append("rect")
      .attr("x", left - 10)
      .attr("y", d => d.y - 26)
      .attr("width", right - left + 20)
      .attr("height", 52)
      .attr("rx", 6)
      .attr("fill", palette.gray50)
      .attr("fill-opacity", .9);
    laneGroups.append("line")
      .attr("x1", left)
      .attr("x2", right)
      .attr("y1", d => d.y)
      .attr("y2", d => d.y)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.1);
    laneGroups.append("text")
      .attr("class", "mark-label")
      .attr("x", left - 18)
      .attr("y", d => d.y + 3)
      .attr("text-anchor", "end")
      .attr("font-size", 9)
      .attr("font-weight", 850)
      .text(d => d.label);

    const linkPaths = svg.append("g")
      .attr("class", "escalation-links")
      .selectAll("path")
      .data(escalations)
      .join("path")
      .attr("id", d => `incident-escalation-link-${d.id}`)
      .attr("class", d => `escalation-link${d.critical ? " critical-escalation" : ""}`)
      .attr("data-escalation-id", d => d.id)
      .attr("data-source-id", d => d.source)
      .attr("data-target-id", d => d.target)
      .attr("data-kind", d => d.kind)
      .attr("data-critical", d => String(d.critical))
      .attr("d", pathFor)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", d => d.critical ? 2.7 : 1.6)
      .attr("stroke-opacity", d => d.critical ? .88 : .55)
      .attr("stroke-linecap", "round")
      .attr("pathLength", 1)
      .attr("stroke-dasharray", "1 1")
      .attr("stroke-dashoffset", 0);
    linkPaths.each(function (_, index) {
      const delay = .62 + index * .09;
      const key = delay / (delay + .55);
      d3.select(this).append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("values", "1;1;0")
        .attr("keyTimes", `0;${key.toFixed(3)};1`)
        .attr("dur", `${(delay + .55).toFixed(2)}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
    });

    const eventGroups = svg.append("g")
      .attr("class", "incident-events")
      .selectAll("g")
      .data(events)
      .join("g")
      .attr("class", "critical-incident-event")
      .attr("data-event-id", d => d.id)
      .attr("data-minute", d => d.minute)
      .attr("data-lane-id", d => d.lane)
      .attr("data-severity", d => d.severity)
      .attr("data-owner", d => d.owner)
      .attr("transform", d => {
        const point = pointFor(d);
        return `translate(${point.x},${point.y})`;
      });
    const eventShells = eventGroups.append("circle")
      .attr("r", 14)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 2);
    eventShells.each(function (_, index) {
      const delay = .34 + index * .09;
      const node = d3.select(this);
      node.append("animate")
        .attr("attributeName", "r")
        .attr("values", "5;16;14")
        .attr("dur", ".45s")
        .attr("begin", `${delay.toFixed(2)}s`)
        .attr("fill", "freeze");
      node.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1")
        .attr("dur", ".2s")
        .attr("begin", `${delay.toFixed(2)}s`)
        .attr("fill", "freeze");
    });
    eventGroups.append("circle")
      .attr("r", 5)
      .attr("fill", d => d.severity === "stable" ? palette.green : d.color)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2);
    eventGroups.each(function (event) {
      stackedText(d3.select(this), event.label, event.lx, event.ly, {
        className: "event-label mark-label",
        anchor: event.anchor,
        fontSize: 8.4,
        lineHeight: 9.4
      });
    });

    const pulses = svg.append("g")
      .attr("class", "escalation-pulses")
      .selectAll("circle")
      .data(criticalEscalations)
      .join("circle")
      .attr("class", "escalation-pulse")
      .attr("data-escalation-id", d => d.id)
      .attr("r", 4.3)
      .attr("fill", d => d.color)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 1.2)
      .attr("opacity", 0);
    pulses.each(function (d, index) {
      const begin = 1.1 + index * .14;
      const key = begin / (begin + .12);
      const pulse = d3.select(this);
      pulse.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;0;1")
        .attr("keyTimes", `0;${key.toFixed(3)};1`)
        .attr("dur", `${(begin + .12).toFixed(2)}s`)
        .attr("begin", "0s")
        .attr("fill", "freeze");
      pulse.append("animateMotion")
        .attr("dur", "2.2s")
        .attr("begin", `${begin.toFixed(2)}s`)
        .attr("repeatCount", "indefinite")
        .attr("rotate", "auto")
        .append("mpath")
        .attr("href", `#incident-escalation-link-${d.id}`);
    });

    const beats = svg.append("g")
      .attr("class", "communication-beats")
      .selectAll("g")
      .data(communicationBeats)
      .join("g")
      .attr("class", "communication-beat")
      .attr("data-beat-id", d => d.id)
      .attr("data-minute", d => d.minute)
      .attr("transform", d => `translate(${x(d.minute)},318)`);
    beats.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -14).attr("y2", -5).attr("stroke", d => d.color).attr("stroke-width", 1.2);
    beats.append("rect").attr("x", -36).attr("y", -5).attr("width", 72).attr("height", 20).attr("rx", 5).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1);
    beats.append("text").attr("class", "caption").attr("x", 0).attr("y", 8).attr("text-anchor", "middle").attr("font-size", 7.8).attr("font-weight", 850).text(d => d.label);
    fadeIn(beats, 1.28, .32);

    const mitigationGroups = svg.append("g")
      .attr("class", "mitigation-steps")
      .selectAll("g")
      .data(mitigations)
      .join("g")
      .attr("class", "mitigation-step")
      .attr("data-step-id", d => d.id)
      .attr("data-minute", d => d.minute)
      .attr("data-status", d => d.status)
      .attr("transform", (d, i) => `translate(${x(d.minute)},${i % 2 ? 366 : 344})`);
    mitigationGroups.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -18).attr("y2", -6).attr("stroke", d => d.color).attr("stroke-width", 1.2);
    mitigationGroups.append("rect").attr("x", -38).attr("y", -6).attr("width", 76).attr("height", 18).attr("rx", 5).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1);
    mitigationGroups.append("text").attr("class", "caption").attr("x", 0).attr("y", 6.5).attr("text-anchor", "middle").attr("font-size", 7.4).attr("font-weight", 850).text(d => d.label);
    fadeIn(mitigationGroups, 1.44, .35);

    const panel = svg.append("g")
      .attr("class", "incident-command-panel")
      .attr("transform", "translate(636,82)");
    panel.append("rect")
      .attr("width", 160)
      .attr("height", 206)
      .attr("rx", 7)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.1);
    panel.append("text").attr("class", "mark-label").attr("x", 12).attr("y", 22).attr("font-size", 11.5).attr("font-weight", 900).text("Command post");
    panel.append("text").attr("class", "caption").attr("x", 12).attr("y", 38).attr("font-size", 8.3).attr("font-weight", 760).text("live incident state");
    const cards = panel.selectAll("g.incident-status-card")
      .data(statusCards)
      .join("g")
      .attr("class", "incident-status-card")
      .attr("data-status-id", d => d.id)
      .attr("transform", (_, i) => `translate(12,${54 + i * 34})`);
    cards.append("rect").attr("width", 136).attr("height", 27).attr("rx", 5).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1);
    cards.append("circle").attr("cx", 11).attr("cy", 13.5).attr("r", 4.3).attr("fill", d => d.color);
    cards.append("text").attr("class", "caption").attr("x", 22).attr("y", 11).attr("font-size", 7.6).attr("font-weight", 850).text(d => d.label);
    cards.append("text").attr("class", "mark-label").attr("x", 22).attr("y", 22).attr("font-size", 8.3).attr("font-weight", 900).text(d => d.value);
    const gaugeWidth = 136;
    panel.append("rect").attr("x", 12).attr("y", 190).attr("width", gaugeWidth).attr("height", 6).attr("rx", 3).attr("fill", palette.gray100);
    panel.append("rect").attr("x", 12).attr("y", 190).attr("width", gaugeWidth * currentMinute / slaMinute).attr("height", 6).attr("rx", 3).attr("fill", palette.orange);
    panel.append("line").attr("x1", 12 + gaugeWidth).attr("x2", 12 + gaugeWidth).attr("y1", 185).attr("y2", 201).attr("stroke", palette.red).attr("stroke-width", 1.5);
    fadeIn(panel, .36, .42);

    const teamGroups = svg.append("g")
      .attr("class", "response-teams")
      .selectAll("g")
      .data(teams)
      .join("g")
      .attr("class", "response-team")
      .attr("data-team-id", d => d.id)
      .attr("transform", (_, i) => `translate(${34 + i * 192},388)`);
    teamGroups.append("rect").attr("width", 176).attr("height", 24).attr("rx", 6).attr("fill", d => d.fill).attr("stroke", d => d.color).attr("stroke-width", 1.1);
    teamGroups.append("circle").attr("cx", 12).attr("cy", 12).attr("r", 4.4).attr("fill", d => d.color);
    teamGroups.append("text").attr("class", "mark-label").attr("x", 23).attr("y", 10.5).attr("font-size", 8.1).attr("font-weight", 900).text(d => d.label);
    teamGroups.append("text").attr("class", "caption").attr("x", 23).attr("y", 20).attr("font-size", 7.1).attr("font-weight", 820).text(d => d.status);
    fadeIn(teamGroups, 1.6, .35);
  }

  function renderCriticalFaultTree() {
    const chartWidth = 760;
    const chartHeight = 450;
    const svg = prepareSvg(
      "fault-tree",
      "Critical fault tree",
      "A safety fault tree traces a critical top event through OR and AND gates, basic events, minimal cut sets, and risk contribution."
    )
      .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
      .attr("data-pattern-family", "fault-tree")
      .attr("data-event-count", 10)
      .attr("data-basic-event-count", 5)
      .attr("data-gate-count", 4)
      .attr("data-minimal-cut-count", 3)
      .attr("data-risk-panel-count", 3)
      .attr("data-top-event-probability", "2.4e-4");

    const shell = svg.append("g").attr("class", "fault-tree-shell");
    shell.append("rect")
      .attr("x", 18)
      .attr("y", 22)
      .attr("width", 724)
      .attr("height", 420)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.2);
    shell.append("text").attr("class", "caption").attr("x", 36).attr("y", 48).text("FTA - critical cooling unavailable");

    const hazardBand = svg.append("g").attr("class", "fault-hazard-band");
    hazardBand.append("rect")
      .attr("x", 548)
      .attr("y", 48)
      .attr("width", 170)
      .attr("height", 90)
      .attr("rx", 7)
      .attr("fill", palette.redHighlight)
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.3);
    hazardBand.append("text").attr("class", "mark-label").attr("x", 563).attr("y", 70).attr("font-size", 9.5).attr("font-weight", 850).text("Top event probability");
    hazardBand.append("text").attr("class", "label").attr("x", 563).attr("y", 96).attr("font-size", 18).attr("font-weight", 900).attr("fill", palette.red).text("2.4e-4 / hr");
    hazardBand.append("text").attr("class", "caption").attr("x", 563).attr("y", 120).text("driven by 3 minimal cuts");

    const eventData = [
      { id: "top", type: "top", x: 346, y: 72, w: 168, h: 42, lines: ["Critical cooling", "unavailable"], color: palette.red, fill: palette.redHighlight, probability: "2.4e-4" },
      { id: "pump-train", type: "intermediate", x: 158, y: 202, w: 136, h: 38, lines: ["Pump train", "unavailable"], color: palette.orange, fill: palette.orangeHighlight, probability: "1.1e-6" },
      { id: "cooling-path", type: "intermediate", x: 346, y: 202, w: 138, h: 38, lines: ["Cooling path", "blocked"], color: palette.red, fill: palette.redHighlight, probability: "2.0e-4" },
      { id: "trip-inhibited", type: "intermediate", x: 534, y: 202, w: 138, h: 38, lines: ["Trip logic", "inhibited"], color: palette.purple, fill: palette.purpleHighlight, probability: "4.8e-5" },
      { id: "pump-a", type: "basic", x: 92, y: 340, label: "Pump A fails", code: "P-101A", color: palette.orange, fill: palette.orangeHighlight, probability: "1.2e-3", cut: "C1" },
      { id: "pump-b", type: "basic", x: 224, y: 340, label: "Pump B fails", code: "P-101B", color: palette.orange, fill: palette.orangeHighlight, probability: "9.0e-4", cut: "C1" },
      { id: "valve-stuck", type: "basic", x: 346, y: 340, label: "Valve stuck shut", code: "V-201", color: palette.red, fill: palette.redHighlight, probability: "2.0e-4", cut: "C2" },
      { id: "sensor-fails", type: "basic", x: 486, y: 340, label: "Temp sensor fails", code: "TT-301", color: palette.purple, fill: palette.purpleHighlight, probability: "8.0e-4", cut: "C3" },
      { id: "bypass-left", type: "basic", x: 612, y: 340, label: "Interlock bypassed", code: "BYP-4", color: palette.purple, fill: palette.purpleHighlight, probability: "6.0e-2", cut: "C3" },
      { id: "common-cause", type: "undeveloped", x: 690, y: 266, label: "Common cause", code: "CCF", color: palette.gray600, fill: palette.gray100, probability: "screened" }
    ];
    const eventById = new Map(eventData.map(d => [d.id, d]));
    const gates = [
      { id: "top-or", kind: "OR", x: 346, y: 150, color: palette.red },
      { id: "pump-and", kind: "AND", x: 158, y: 270, color: palette.orange },
      { id: "path-or", kind: "OR", x: 346, y: 270, color: palette.red },
      { id: "trip-and", kind: "AND", x: 534, y: 270, color: palette.purple }
    ];
    const gateById = new Map(gates.map(d => [d.id, d]));
    const links = [
      { id: "top-to-or", source: "top", target: "top-or", kind: "event-gate", color: palette.red, cut: "" },
      { id: "or-to-pump", source: "top-or", target: "pump-train", kind: "gate-event", color: palette.orange, cut: "C1" },
      { id: "or-to-path", source: "top-or", target: "cooling-path", kind: "gate-event", color: palette.red, cut: "C2" },
      { id: "or-to-trip", source: "top-or", target: "trip-inhibited", kind: "gate-event", color: palette.purple, cut: "C3" },
      { id: "pump-to-and", source: "pump-train", target: "pump-and", kind: "event-gate", color: palette.orange, cut: "C1" },
      { id: "and-to-pump-a", source: "pump-and", target: "pump-a", kind: "gate-event", color: palette.orange, cut: "C1" },
      { id: "and-to-pump-b", source: "pump-and", target: "pump-b", kind: "gate-event", color: palette.orange, cut: "C1" },
      { id: "path-to-or", source: "cooling-path", target: "path-or", kind: "event-gate", color: palette.red, cut: "C2" },
      { id: "or-to-valve", source: "path-or", target: "valve-stuck", kind: "gate-event", color: palette.red, cut: "C2" },
      { id: "trip-to-and", source: "trip-inhibited", target: "trip-and", kind: "event-gate", color: palette.purple, cut: "C3" },
      { id: "and-to-sensor", source: "trip-and", target: "sensor-fails", kind: "gate-event", color: palette.purple, cut: "C3" },
      { id: "and-to-bypass", source: "trip-and", target: "bypass-left", kind: "gate-event", color: palette.purple, cut: "C3" },
      { id: "trip-to-common", source: "trip-inhibited", target: "common-cause", kind: "screened", color: palette.gray600, cut: "" }
    ];

    function anchor(recordId, role) {
      const event = eventById.get(recordId);
      if (event) {
        if (event.type === "basic" || event.type === "undeveloped") {
          return { x: event.x, y: role === "top" ? event.y - 22 : event.y + 22 };
        }
        return { x: event.x, y: role === "top" ? event.y - event.h / 2 : event.y + event.h / 2 };
      }
      const gate = gateById.get(recordId);
      return { x: gate.x, y: role === "top" ? gate.y - 20 : gate.y + 20 };
    }

    function faultLinkPath(link) {
      const start = anchor(link.source, "bottom");
      const end = anchor(link.target, "top");
      const mid = (start.y + end.y) / 2;
      return `M${start.x},${start.y}V${mid}H${end.x}V${end.y}`;
    }

    const linkPaths = svg.append("g")
      .attr("class", "fault-tree-links")
      .selectAll("path.fault-link")
      .data(links)
      .join("path")
      .attr("id", d => `fault-link-${d.id}`)
      .attr("class", d => `fault-link${d.cut ? " minimal-cut-link" : ""}${d.kind === "screened" ? " screened-link" : ""}`)
      .attr("data-link-id", d => d.id)
      .attr("data-source-id", d => d.source)
      .attr("data-target-id", d => d.target)
      .attr("data-minimal-cut", d => d.cut)
      .attr("d", faultLinkPath)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", d => d.cut ? 2.6 : 1.5)
      .attr("stroke-opacity", d => d.cut ? .82 : .42)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("stroke-dasharray", d => d.kind === "screened" ? "4 5" : "");
    drawPath(linkPaths.filter(d => d.kind !== "screened"), .1, .9);
    fadeIn(linkPaths.filter(d => d.kind === "screened"), .35, .45);

    const gateGroups = svg.append("g")
      .attr("class", "fault-gates")
      .selectAll("g.fault-gate")
      .data(gates)
      .join("g")
      .attr("class", d => `fault-gate ${d.kind.toLowerCase()}-gate`)
      .attr("data-gate-id", d => d.id)
      .attr("data-gate-kind", d => d.kind)
      .attr("transform", d => `translate(${d.x} ${d.y})`);
    gateGroups.append("path")
      .attr("class", "fault-gate-symbol")
      .attr("d", d => d.kind === "AND"
        ? "M-30,20V2C-30,-19 30,-19 30,2V20Z"
        : "M-32,20C-20,-14 20,-14 32,20C18,10 -18,10 -32,20Z")
      .attr("fill", d => d.kind === "AND" ? palette.gray50 : palette.surface)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.7)
      .attr("stroke-linejoin", "round");
    gateGroups.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", 12)
      .attr("font-size", 9)
      .attr("font-weight", 900)
      .text(d => d.kind);
    fadeIn(gateGroups, .18, .5);

    const eventLayer = svg.append("g").attr("class", "fault-events");
    const intermediateEvents = eventLayer.selectAll("g.fault-event-box")
      .data(eventData.filter(d => d.type === "top" || d.type === "intermediate"))
      .join("g")
      .attr("class", d => `fault-event fault-event-box ${d.type === "top" ? "top-event" : "intermediate-event"}`)
      .attr("data-event-id", d => d.id)
      .attr("data-event-type", d => d.type)
      .attr("data-probability", d => d.probability)
      .attr("transform", d => `translate(${d.x} ${d.y})`);
    intermediateEvents.append("rect")
      .attr("x", d => -d.w / 2)
      .attr("y", d => -d.h / 2)
      .attr("width", d => d.w)
      .attr("height", d => d.h)
      .attr("rx", d => d.type === "top" ? 7 : 5)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", d => d.type === "top" ? 2.1 : 1.4);
    intermediateEvents.each(function (d) {
      const group = d3.select(this);
      d.lines.forEach((line, index) => {
        group.append("text")
          .attr("class", "mark-label")
          .attr("text-anchor", "middle")
          .attr("x", 0)
          .attr("y", -5 + index * 13)
          .attr("font-size", d.type === "top" ? 10.3 : 9.2)
          .attr("font-weight", d.type === "top" ? 900 : 800)
          .text(line);
      });
      group.append("text")
        .attr("class", "caption")
        .attr("text-anchor", "start")
        .attr("x", d.w / 2 + 6)
        .attr("y", 5)
        .attr("font-size", 7.8)
        .text(`p=${d.probability}`);
    });
    fadeIn(intermediateEvents, .05, .5);

    const basicEvents = eventLayer.selectAll("g.basic-event")
      .data(eventData.filter(d => d.type === "basic"))
      .join("g")
      .attr("class", "fault-event basic-event")
      .attr("data-event-id", d => d.id)
      .attr("data-event-code", d => d.code)
      .attr("data-minimal-cut", d => d.cut)
      .attr("data-probability", d => d.probability)
      .attr("transform", d => `translate(${d.x} ${d.y})`);
    basicEvents.append("circle")
      .attr("r", 23)
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.7);
    basicEvents.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", -5)
      .attr("font-size", 8.1)
      .attr("font-weight", 850)
      .text(d => d.code);
    basicEvents.append("text")
      .attr("class", "caption")
      .attr("text-anchor", "middle")
      .attr("y", 8)
      .attr("font-size", 6.9)
      .text(d => d.probability);
    basicEvents.append("text")
      .attr("class", "caption")
      .attr("text-anchor", "middle")
      .attr("y", 38)
      .attr("font-size", 7.4)
      .text(d => d.label);
    basicEvents.append("rect")
      .attr("class", "minimal-cut-badge")
      .attr("x", 16)
      .attr("y", -31)
      .attr("width", 22)
      .attr("height", 14)
      .attr("rx", 4)
      .attr("fill", palette.surface)
      .attr("stroke", d => d.color);
    basicEvents.append("text")
      .attr("class", "mark-label")
      .attr("x", 27)
      .attr("y", -21)
      .attr("text-anchor", "middle")
      .attr("font-size", 7.4)
      .text(d => d.cut);
    grow(basicEvents.select("circle"), "r", 4, 23, .22, .52);

    const undeveloped = eventLayer.selectAll("g.undeveloped-event")
      .data(eventData.filter(d => d.type === "undeveloped"))
      .join("g")
      .attr("class", "fault-event undeveloped-event")
      .attr("data-event-id", d => d.id)
      .attr("data-event-code", d => d.code)
      .attr("data-probability", d => d.probability)
      .attr("transform", d => `translate(${d.x} ${d.y})`);
    undeveloped.append("path")
      .attr("d", "M0,-21L26,0L0,21L-26,0Z")
      .attr("fill", d => d.fill)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.4);
    undeveloped.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("y", 3).attr("font-size", 8).text("CCF");
    undeveloped.append("text").attr("class", "caption").attr("text-anchor", "middle").attr("y", 34).attr("font-size", 7.2).text("screened");
    fadeIn(undeveloped, .32, .42);

    const cutPaths = [
      { id: "c1", label: "C1", color: palette.orange, d: "M92,340V304H158V270V221H158V202V176H346V130V72" },
      { id: "c2", label: "C2", color: palette.red, d: "M346,340V270V221H346V202V176H346V130V72" },
      { id: "c3", label: "C3", color: palette.purple, d: "M612,340V304H534V270V221H534V202V176H346V130V72" }
    ];
    svg.append("g")
      .attr("class", "minimal-cut-motion-paths")
      .selectAll("path")
      .data(cutPaths)
      .join("path")
      .attr("id", d => `fault-minimal-cut-path-${d.id}`)
      .attr("class", "minimal-cut-motion-path")
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", "none");
    const pulseLayer = svg.append("g").attr("class", "fault-cut-pulses");
    cutPaths.forEach((cut, index) => {
      const pulse = pulseLayer.append("circle")
        .attr("class", "fault-cut-pulse")
        .attr("data-minimal-cut", cut.label)
        .attr("r", 5.4)
        .attr("fill", cut.color)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.4);
      pulse.append("animateMotion")
        .attr("dur", "3.2s")
        .attr("begin", `${.5 + index * .7}s`)
        .attr("repeatCount", "indefinite")
        .append("mpath")
        .attr("href", `#fault-minimal-cut-path-${cut.id}`);
    });

    const riskCards = [
      { id: "c2", label: "C2 valve", value: "83%", note: "single basic event", color: palette.red, fill: palette.redHighlight },
      { id: "c3", label: "C3 trip", value: "16%", note: "sensor + bypass", color: palette.purple, fill: palette.purpleHighlight },
      { id: "c1", label: "C1 pumps", value: "<1%", note: "redundant train", color: palette.orange, fill: palette.orangeHighlight }
    ];
    const riskPanel = svg.append("g").attr("class", "fault-risk-panel").attr("transform", "translate(44 400)");
    riskCards.forEach((card, index) => {
      const x = index * 154;
      const group = riskPanel.append("g")
        .attr("class", "fault-risk-card")
        .attr("data-minimal-cut", card.id.toUpperCase())
        .attr("transform", `translate(${x} 0)`);
      group.append("rect").attr("width", 138).attr("height", 28).attr("rx", 6).attr("fill", card.fill).attr("stroke", card.color).attr("stroke-width", 1);
      group.append("text").attr("class", "mark-label").attr("x", 10).attr("y", 11).attr("font-size", 7.7).text(card.label);
      group.append("text").attr("class", "label").attr("x", 10).attr("y", 24).attr("font-size", 12).attr("font-weight", 900).attr("fill", card.color).text(card.value);
      group.append("text").attr("class", "caption").attr("x", 52).attr("y", 23).attr("font-size", 7.2).text(card.note);
    });
    fadeIn(riskPanel.selectAll(".fault-risk-card"), .42, .5);

    const legend = svg.append("g").attr("class", "fault-tree-legend").attr("transform", "translate(548 400)");
    [
      { label: "rectangle = event", shape: "rect", color: palette.red },
      { label: "circle = basic event", shape: "circle", color: palette.orange },
      { label: "diamond = undeveloped", shape: "diamond", color: palette.gray600 }
    ].forEach((item, index) => {
      const y = index * 15;
      if (item.shape === "circle") legend.append("circle").attr("cx", 8).attr("cy", y).attr("r", 5).attr("fill", palette.surface).attr("stroke", item.color);
      else if (item.shape === "diamond") legend.append("path").attr("d", `M8,${y - 6}L15,${y}L8,${y + 6}L1,${y}Z`).attr("fill", palette.surface).attr("stroke", item.color);
      else legend.append("rect").attr("x", 1).attr("y", y - 5).attr("width", 14).attr("height", 10).attr("rx", 2).attr("fill", palette.surface).attr("stroke", item.color);
      legend.append("text").attr("class", "caption").attr("x", 22).attr("y", y + 3).attr("font-size", 7.4).text(item.label);
    });
    fadeIn(legend, .46, .45);
  }

  function renderCriticalBowtieBarrier() {
    const chartWidth = 820;
    const chartHeight = 450;
    const svg = prepareSvg(
      "bowtie-barriers",
      "Critical bowtie barrier",
      "A safety bowtie maps threats, the top event, preventive barriers, consequences, mitigative barriers, and degraded controls."
    )
      .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
      .attr("data-pattern-family", "bowtie-barriers")
      .attr("data-threat-count", 4)
      .attr("data-preventive-barrier-count", 4)
      .attr("data-mitigative-barrier-count", 4)
      .attr("data-consequence-count", 4)
      .attr("data-barrier-count", 8)
      .attr("data-critical-gap-count", 2)
      .attr("data-degradation-control-count", 3)
      .attr("data-top-event", "loss-of-containment");

    const threatArrow = addArrowMarker(svg, "critical-bowtie-threat", palette.orange);
    const consequenceArrow = addArrowMarker(svg, "critical-bowtie-consequence", palette.purple);
    const gapArrow = addArrowMarker(svg, "critical-bowtie-gap", palette.red);

    const shell = svg.append("g").attr("class", "bowtie-shell");
    shell.append("rect")
      .attr("x", 18)
      .attr("y", 22)
      .attr("width", 784)
      .attr("height", 410)
      .attr("rx", 8)
      .attr("fill", palette.surface)
      .attr("stroke", palette.gray200)
      .attr("stroke-width", 1.2);
    shell.append("text").attr("class", "caption").attr("x", 36).attr("y", 48).text("Bowtie - pressure release risk");
    shell.append("text").attr("class", "caption").attr("x", 93).attr("y", 68).attr("text-anchor", "middle").text("Threats");
    shell.append("text").attr("class", "caption").attr("x", 252).attr("y", 68).attr("text-anchor", "middle").text("Preventive barriers");
    shell.append("text").attr("class", "caption").attr("x", 568).attr("y", 68).attr("text-anchor", "middle").text("Mitigative barriers");
    shell.append("text").attr("class", "caption").attr("x", 728).attr("y", 86).attr("text-anchor", "middle").text("Consequences");

    const hazard = svg.append("g").attr("class", "bowtie-hazard").attr("transform", "translate(328 42)");
    hazard.append("rect")
      .attr("width", 164)
      .attr("height", 42)
      .attr("rx", 7)
      .attr("fill", palette.redHighlight)
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.4);
    hazard.append("text").attr("class", "mark-label").attr("x", 82).attr("y", 17).attr("text-anchor", "middle").attr("font-size", 8.2).text("Hazard");
    hazard.append("text").attr("class", "caption").attr("x", 82).attr("y", 31).attr("text-anchor", "middle").attr("font-size", 7.6).text("pressurized ammonia");
    fadeIn(hazard, .08, .42);

    const healthPanel = svg.append("g").attr("class", "bowtie-health-panel").attr("transform", "translate(650 30)");
    healthPanel.append("rect").attr("width", 132).attr("height", 34).attr("rx", 7).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    healthPanel.append("text").attr("class", "caption").attr("x", 10).attr("y", 13).attr("font-size", 7.4).text("Barrier health");
    healthPanel.append("text").attr("class", "label").attr("x", 10).attr("y", 28).attr("font-size", 12).attr("font-weight", 900).attr("fill", palette.green).text("6 OK");
    healthPanel.append("text").attr("class", "label").attr("x", 54).attr("y", 28).attr("font-size", 12).attr("font-weight", 900).attr("fill", palette.red).text("2 weak");
    fadeIn(healthPanel, .18, .42);

    const center = { x: 410, y: 216, w: 142, h: 58 };
    const topEntries = [194, 208, 224, 238];
    const topExits = [194, 208, 224, 238];
    const rows = [128, 182, 236, 290];
    const boxW = 116;
    const boxH = 34;
    const barrierW = 112;
    const barrierH = 38;

    const threats = [
      { id: "corrosion-growth", label: ["Corrosion", "growth"], x: 96, y: rows[0], severity: "high" },
      { id: "overpressure", label: ["Overpressure", "spike"], x: 96, y: rows[1], severity: "critical" },
      { id: "seal-failure", label: ["Seal", "failure"], x: 96, y: rows[2], severity: "high" },
      { id: "operator-error", label: ["Operator", "error"], x: 96, y: rows[3], severity: "medium" }
    ];
    const preventive = [
      { id: "inspection-program", label: ["Inspection", "program"], x: 252, y: rows[0], code: "B1", status: "weak", gap: true },
      { id: "relief-valve", label: ["Relief", "valve"], x: 252, y: rows[1], code: "B2", status: "healthy", gap: false },
      { id: "seal-plan", label: ["Seal plan", "flush"], x: 252, y: rows[2], code: "B3", status: "healthy", gap: false },
      { id: "permit-check", label: ["Permit", "check"], x: 252, y: rows[3], code: "B4", status: "healthy", gap: false }
    ];
    const mitigative = [
      { id: "gas-detection", label: ["Gas", "detection"], x: 568, y: rows[0], code: "M1", status: "healthy", gap: false },
      { id: "deluge-system", label: ["Deluge", "system"], x: 568, y: rows[1], code: "M2", status: "weak", gap: true },
      { id: "isolation-valves", label: ["Remote", "isolation"], x: 568, y: rows[2], code: "M3", status: "healthy", gap: false },
      { id: "evacuation-plan", label: ["Evacuation", "plan"], x: 568, y: rows[3], code: "M4", status: "healthy", gap: false }
    ];
    const consequences = [
      { id: "personnel-exposure", label: ["Personnel", "exposure"], x: 728, y: rows[0], severity: "critical" },
      { id: "fire-escalation", label: ["Fire", "escalation"], x: 728, y: rows[1], severity: "critical" },
      { id: "environmental-release", label: ["Environmental", "release"], x: 728, y: rows[2], severity: "high" },
      { id: "production-outage", label: ["Production", "outage"], x: 728, y: rows[3], severity: "medium" }
    ];
    const controls = [
      { id: "barrier-audit", label: "Barrier audit", value: "14 d", x: 216, color: palette.blue },
      { id: "proof-test", label: "Proof test", value: "due", x: 410, color: palette.red },
      { id: "override-review", label: "Override review", value: "open", x: 604, color: palette.purple }
    ];
    const gaps = [
      { id: "inspection-gap", barrierId: "inspection-program", label: "inspection overdue", x: 252, y: 96, targetX: 252, targetY: rows[0] - 22 },
      { id: "deluge-gap", barrierId: "deluge-system", label: "deluge offline", x: 568, y: 96, targetX: 568, targetY: rows[1] - 22, viaX: 502 }
    ];

    function labelLines(group, lines, x, y, fontSize = 8.4, cls = "mark-label") {
      lines.forEach((line, index) => {
        group.append("text")
          .attr("class", cls)
          .attr("x", x)
          .attr("y", y + index * (fontSize + 2.8))
          .attr("text-anchor", "middle")
          .attr("font-size", fontSize)
          .attr("font-weight", cls === "caption" ? 760 : 850)
          .text(line);
      });
    }

    function sidePath(fromX, fromY, toX, toY, bend) {
      return `M${fromX},${fromY}C${fromX + bend},${fromY} ${toX - bend},${toY} ${toX},${toY}`;
    }

    const linkLayer = svg.append("g").attr("class", "bowtie-links");
    const leftLinks = threats.map((threat, index) => {
      const barrier = preventive[index];
      return [
        { id: `${threat.id}-to-${barrier.id}`, kind: "threat-to-barrier", source: threat.id, target: barrier.id, d: `M${threat.x + boxW / 2},${threat.y}H${barrier.x - barrierW / 2}`, color: palette.orange, width: 1.7, marker: threatArrow },
        { id: `${barrier.id}-to-top`, kind: "barrier-to-top", source: barrier.id, target: "loss-of-containment", d: sidePath(barrier.x + barrierW / 2, barrier.y, center.x - center.w / 2, topEntries[index], 72), color: barrier.gap ? palette.red : palette.orange, width: barrier.gap ? 2.8 : 2.1, marker: threatArrow }
      ];
    }).flat();
    const rightLinks = consequences.map((consequence, index) => {
      const barrier = mitigative[index];
      return [
        { id: `top-to-${barrier.id}`, kind: "top-to-barrier", source: "loss-of-containment", target: barrier.id, d: sidePath(center.x + center.w / 2, topExits[index], barrier.x - barrierW / 2, barrier.y, 72), color: barrier.gap ? palette.red : palette.purple, width: barrier.gap ? 2.8 : 2.1, marker: consequenceArrow },
        { id: `${barrier.id}-to-${consequence.id}`, kind: "barrier-to-consequence", source: barrier.id, target: consequence.id, d: `M${barrier.x + barrierW / 2},${barrier.y}H${consequence.x - boxW / 2}`, color: palette.purple, width: 1.7, marker: consequenceArrow }
      ];
    }).flat();
    const linkPaths = linkLayer.selectAll("path.bowtie-link")
      .data([...leftLinks, ...rightLinks])
      .join("path")
      .attr("id", d => `bowtie-link-${d.id}`)
      .attr("class", d => `bowtie-link ${d.kind}${d.color === palette.red ? " critical-gap-link" : ""}`)
      .attr("data-link-id", d => d.id)
      .attr("data-source-id", d => d.source)
      .attr("data-target-id", d => d.target)
      .attr("d", d => d.d)
      .attr("fill", "none")
      .attr("stroke", d => d.color)
      .attr("stroke-width", d => d.width)
      .attr("stroke-opacity", d => d.color === palette.red ? .86 : .58)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("marker-end", d => d.marker);
    drawPath(linkPaths, .12, .72);

    const motionLayer = svg.append("g").attr("class", "bowtie-motion-paths");
    threats.forEach((threat, index) => {
      const barrier = preventive[index];
      motionLayer.append("path")
        .attr("id", `bowtie-threat-motion-${threat.id}`)
        .attr("d", `M${threat.x + boxW / 2},${threat.y}H${barrier.x}H${barrier.x + barrierW / 2}${sidePath(barrier.x + barrierW / 2, barrier.y, center.x - center.w / 2, topEntries[index], 72).replace(/^M[^C]+/, "")}`)
        .attr("fill", "none")
        .attr("stroke", "none");
    });
    consequences.forEach((consequence, index) => {
      const barrier = mitigative[index];
      motionLayer.append("path")
        .attr("id", `bowtie-consequence-motion-${consequence.id}`)
        .attr("d", `${sidePath(center.x + center.w / 2, topExits[index], barrier.x - barrierW / 2, barrier.y, 72)}H${barrier.x + barrierW / 2}H${consequence.x - boxW / 2}`)
        .attr("fill", "none")
        .attr("stroke", "none");
    });
    const pulseLayer = svg.append("g").attr("class", "bowtie-pulses");
    threats.forEach((threat, index) => {
      const pulse = pulseLayer.append("circle")
        .attr("class", "bowtie-threat-pulse")
        .attr("data-threat-id", threat.id)
        .attr("r", preventive[index].gap ? 5.4 : 4.4)
        .attr("fill", preventive[index].gap ? palette.red : palette.orange)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.2);
      pulse.append("animateMotion")
        .attr("dur", "3.2s")
        .attr("begin", `${.42 + index * .34}s`)
        .attr("repeatCount", "indefinite")
        .append("mpath")
        .attr("href", `#bowtie-threat-motion-${threat.id}`);
    });
    consequences.forEach((consequence, index) => {
      const pulse = pulseLayer.append("circle")
        .attr("class", "bowtie-consequence-pulse")
        .attr("data-consequence-id", consequence.id)
        .attr("r", mitigative[index].gap ? 5.4 : 4.4)
        .attr("fill", mitigative[index].gap ? palette.red : palette.purple)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1.2);
      pulse.append("animateMotion")
        .attr("dur", "3.4s")
        .attr("begin", `${.74 + index * .34}s`)
        .attr("repeatCount", "indefinite")
        .append("mpath")
        .attr("href", `#bowtie-consequence-motion-${consequence.id}`);
    });

    const topEvent = svg.append("g")
      .attr("class", "bowtie-top-event")
      .attr("data-event-id", "loss-of-containment")
      .attr("transform", `translate(${center.x} ${center.y})`);
    topEvent.append("rect")
      .attr("x", -center.w / 2)
      .attr("y", -center.h / 2)
      .attr("width", center.w)
      .attr("height", center.h)
      .attr("rx", 8)
      .attr("fill", palette.redHighlight)
      .attr("stroke", palette.red)
      .attr("stroke-width", 2.2);
    topEvent.append("text").attr("class", "caption").attr("x", 0).attr("y", -10).attr("text-anchor", "middle").attr("font-size", 7.6).text("TOP EVENT");
    topEvent.append("text").attr("class", "mark-label").attr("x", 0).attr("y", 5).attr("text-anchor", "middle").attr("font-size", 10.1).attr("font-weight", 900).text("Loss of");
    topEvent.append("text").attr("class", "mark-label").attr("x", 0).attr("y", 19).attr("text-anchor", "middle").attr("font-size", 10.1).attr("font-weight", 900).text("containment");
    fadeIn(topEvent, .2, .45);

    function renderEndpoint(records, className, color, fill) {
      const groups = svg.append("g")
        .attr("class", `${className}s`)
        .selectAll(`g.${className}`)
        .data(records)
        .join("g")
        .attr("class", className)
        .attr("data-node-id", d => d.id)
        .attr("data-severity", d => d.severity)
        .attr("transform", d => `translate(${d.x} ${d.y})`);
      groups.append("rect")
        .attr("x", -boxW / 2)
        .attr("y", -boxH / 2)
        .attr("width", boxW)
        .attr("height", boxH)
        .attr("rx", 6)
        .attr("fill", fill)
        .attr("stroke", color)
        .attr("stroke-width", d => d.severity === "critical" ? 1.8 : 1.2);
      groups.each(function (d) {
        labelLines(d3.select(this), d.label, 0, -3, 8.2);
      });
      fadeIn(groups, .28, .42);
    }
    renderEndpoint(threats, "bowtie-threat", palette.orange, palette.orangeHighlight);
    renderEndpoint(consequences, "bowtie-consequence", palette.purple, palette.purpleHighlight);

    function renderBarriers(records, className, color) {
      const groups = svg.append("g")
        .attr("class", `${className}s`)
        .selectAll(`g.${className}`)
        .data(records)
        .join("g")
        .attr("class", d => `bowtie-barrier ${className}${d.gap ? " degraded-barrier" : ""}`)
        .attr("data-barrier-id", d => d.id)
        .attr("data-barrier-code", d => d.code)
        .attr("data-barrier-side", className.includes("preventive") ? "preventive" : "mitigative")
        .attr("data-status", d => d.status)
        .attr("data-critical-gap", d => d.gap ? "true" : "false")
        .attr("transform", d => `translate(${d.x} ${d.y})`);
      groups.append("rect")
        .attr("x", -barrierW / 2)
        .attr("y", -barrierH / 2)
        .attr("width", barrierW)
        .attr("height", barrierH)
        .attr("rx", 6)
        .attr("fill", d => d.gap ? palette.redHighlight : palette.gray50)
        .attr("stroke", d => d.gap ? palette.red : color)
        .attr("stroke-width", d => d.gap ? 2 : 1.4)
        .attr("stroke-dasharray", d => d.gap ? "5 3" : "");
      groups.append("rect")
        .attr("x", -barrierW / 2)
        .attr("y", -barrierH / 2)
        .attr("width", 9)
        .attr("height", barrierH)
        .attr("rx", 4)
        .attr("fill", d => d.gap ? palette.red : palette.green);
      groups.append("circle")
        .attr("cx", barrierW / 2 - 13)
        .attr("cy", -barrierH / 2 + 11)
        .attr("r", 4.2)
        .attr("fill", d => d.gap ? palette.red : palette.green)
        .attr("stroke", palette.surface)
        .attr("stroke-width", 1);
      groups.append("text").attr("class", "caption").attr("x", -barrierW / 2 + 16).attr("y", -6).attr("font-size", 7.2).attr("font-weight", 850).text(d => d.code);
      groups.each(function (d) {
        labelLines(d3.select(this), d.label, 0, 4, 7.8);
      });
      fadeIn(groups, .34, .44);
    }
    renderBarriers(preventive, "preventive-barrier", palette.blue);
    renderBarriers(mitigative, "mitigative-barrier", palette.purple);

    const gapLayer = svg.append("g").attr("class", "critical-barrier-gaps");
    const gapGroups = gapLayer.selectAll("g.critical-barrier-gap")
      .data(gaps)
      .join("g")
      .attr("class", "critical-barrier-gap")
      .attr("data-gap-id", d => d.id)
      .attr("data-barrier-id", d => d.barrierId);
    gapGroups.append("path")
      .attr("d", d => d.viaX
        ? `M${d.x},${d.y + 12}H${d.viaX}V${d.targetY}H${d.targetX}`
        : `M${d.x},${d.y + 12}L${d.targetX},${d.targetY}`)
      .attr("fill", "none")
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.2)
      .attr("stroke-dasharray", "3 3")
      .attr("marker-end", gapArrow);
    gapGroups.append("rect")
      .attr("x", d => d.x - 52)
      .attr("y", d => d.y - 11)
      .attr("width", 104)
      .attr("height", 22)
      .attr("rx", 6)
      .attr("fill", palette.surface)
      .attr("stroke", palette.red)
      .attr("stroke-width", 1.1);
    gapGroups.append("text")
      .attr("class", "caption")
      .attr("x", d => d.x)
      .attr("y", d => d.y + 4)
      .attr("text-anchor", "middle")
      .attr("font-size", 7.2)
      .attr("font-weight", 850)
      .attr("fill", palette.red)
      .text(d => d.label);
    fadeIn(gapGroups, .68, .42);

    const controlLayer = svg.append("g").attr("class", "degradation-controls");
    controlLayer.append("text").attr("class", "caption").attr("x", 56).attr("y", 376).text("Degradation controls");
    const controlGroups = controlLayer.selectAll("g.degradation-control")
      .data(controls)
      .join("g")
      .attr("class", "degradation-control")
      .attr("data-control-id", d => d.id)
      .attr("transform", d => `translate(${d.x} 386)`);
    controlGroups.append("rect")
      .attr("x", -72)
      .attr("y", -12)
      .attr("width", 144)
      .attr("height", 34)
      .attr("rx", 6)
      .attr("fill", palette.gray50)
      .attr("stroke", d => d.color)
      .attr("stroke-width", 1.1);
    controlGroups.append("circle").attr("cx", -56).attr("cy", 5).attr("r", 5).attr("fill", d => d.color);
    controlGroups.append("text").attr("class", "mark-label").attr("x", -44).attr("y", 1).attr("font-size", 7.6).text(d => d.label);
    controlGroups.append("text").attr("class", "caption").attr("x", -44).attr("y", 15).attr("font-size", 7.2).text(d => `status: ${d.value}`);
    fadeIn(controlGroups, .76, .4);
  }

  function mlpLayout(architecture, xRange = [76, width - 76], yRange = [82, 318]) {
    const x = d3.scalePoint().domain(d3.range(architecture.length)).range(xRange);
    const layers = architecture.map((count, layer) => {
      const y = d3.scalePoint().domain(d3.range(count)).range(yRange);
      return d3.range(count).map(index => ({
        id: `l${layer}n${index}`,
        layer,
        index,
        count,
        x: x(layer),
        y: y(index)
      }));
    });
    const links = [];
    for (let layer = 1; layer < layers.length; layer += 1) {
      layers[layer - 1].forEach(source => {
        layers[layer].forEach(target => {
          links.push({ id: `${source.id}-${target.id}`, source, target, layer });
        });
      });
    }
    return { layers, nodes: layers.flat(), links };
  }

  function mlpPulseSteps(d) {
    return Array.isArray(d.pulseLayers) && d.pulseLayers.length
      ? d.pulseLayers
      : [d.pulseLayer ?? d.layer];
  }

  function pulseMlpNodes(circles, delayForLayer) {
    circles.each(function (d) {
      const base = d3.select(this);
      const parent = d3.select(this.parentNode);
      const cx = base.attr("cx") ?? 0;
      const cy = base.attr("cy") ?? 0;
      const radius = d.r ?? Number(base.attr("r"));
      mlpPulseSteps(d).forEach(step => {
        const pulse = parent.append("circle")
          .datum(d)
          .attr("class", "mlp-pulse-overlay")
          .attr("cx", cx)
          .attr("cy", cy)
          .attr("r", radius)
          .attr("fill", palette.red)
          .attr("opacity", 0)
          .attr("pointer-events", "none");
        pulse.append("animate")
          .attr("attributeName", "opacity")
          .attr("values", "0;1;1;0")
          .attr("keyTimes", "0;.15;.85;1")
          .attr("dur", "1.1s")
          .attr("begin", `${delayForLayer(step)}s`)
          .attr("fill", "remove");
        pulse.append("animate")
          .attr("attributeName", "r")
          .attr("values", `${radius};${radius + 3};${radius + 3};${radius}`)
          .attr("keyTimes", "0;.2;.8;1")
          .attr("dur", "1.1s")
          .attr("begin", `${delayForLayer(step)}s`)
          .attr("fill", "remove");
      });
    });
  }

  function pulseMlpText(labels, delayForLayer) {
    labels.each(function (d) {
      const label = d3.select(this);
      mlpPulseSteps(d).forEach(step => {
        label.append("animate")
          .attr("attributeName", "fill")
          .attr("values", `${palette.ink};${palette.surface};${palette.ink}`)
          .attr("keyTimes", "0;.15;.85")
          .attr("calcMode", "discrete")
          .attr("dur", "1.1s")
          .attr("begin", `${delayForLayer(step)}s`)
          .attr("fill", "remove");
      });
    });
  }

  function pulseMlpVisibility(selection, delayForLayer) {
    selection.each(function (d) {
      const mark = d3.select(this);
      mlpPulseSteps(d).forEach(step => {
        mark.append("animate")
          .attr("attributeName", "opacity")
          .attr("values", "0;1;1;0")
          .attr("keyTimes", "0;.16;.72;1")
          .attr("dur", "1.1s")
          .attr("begin", `${delayForLayer(step)}s`)
          .attr("fill", "remove");
      });
    });
  }

  function renderMlpSimple() {
    const svg = prepareSvg("mlp-simple", "MLP simple network", "A multilayer perceptron activates each layer progressively.");
    const layout = mlpLayout([4, 5, 4, 2], [70, width - 70], [80, 318]);
    layout.nodes.forEach(d => d.r = d.layer === 0 || d.layer === layout.layers.length - 1 ? 12 : 13);
    const delayForLayer = layer => .2 + layer * 1.55;
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const paths = svg.append("g").selectAll("path").data(layout.links, d => d.id).join("path")
      .attr("d", d => link({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", .62)
      .attr("stroke-linecap", "round");
    const groups = svg.append("g").selectAll("g").data(layout.nodes, d => d.id).join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => [palette.blueHighlight, palette.orangeHighlight, palette.greenHighlight, palette.purpleHighlight][d.layer])
      .attr("stroke", d => [palette.blue, palette.orange, palette.green, palette.purple][d.layer])
      .attr("stroke-width", 1.4);
    pulseMlpNodes(circles, delayForLayer);
    ["input", "hidden 1", "hidden 2", "output"].forEach((label, index) => {
      svg.append("text").attr("class", "caption").attr("x", layout.layers[index][0].x).attr("y", 48).attr("text-anchor", "middle").text(label);
    });
  }

  function renderDeepLearningModelExecution() {
    const svg = prepareSvg("mlp-execution", "Deep learning model execution", "A square model frame contains only an internal multilayer network pulsing through execution.");
    const model = { x: 150, y: 80, size: 260 };
    const network = {
      x0: model.x + 52,
      x1: model.x + model.size - 52,
      y0: model.y + 58,
      y1: model.y + model.size - 58,
      layers: [4, 5, 5, 3]
    };

    const modelGroup = svg.append("g").attr("class", "model-execution-square");
    modelGroup.append("rect")
      .attr("x", model.x)
      .attr("y", model.y)
      .attr("width", model.size)
      .attr("height", model.size)
      .attr("rx", 0)
      .attr("fill", palette.surface)
      .attr("stroke", palette.red)
      .attr("stroke-width", 4);

    const xScale = d3.scalePoint().domain(d3.range(network.layers.length)).range([network.x0, network.x1]);
    const nodes = network.layers.flatMap((count, layer) => {
      const yScale = d3.scalePoint().domain(d3.range(count)).range([network.y0, network.y1]);
      return d3.range(count).map(index => ({
        id: `${layer}-${index}`,
        layer,
        index,
        x: xScale(layer),
        y: yScale(index)
      }));
    });
    const byLayer = d3.group(nodes, d => d.layer);
    const links = [];
    for (let layer = 0; layer < network.layers.length - 1; layer += 1) {
      byLayer.get(layer).forEach(source => {
        byLayer.get(layer + 1).forEach(target => links.push({ source, target, layer: layer + 1 }));
      });
    }
    const networkGroup = modelGroup.append("g").attr("class", "model-execution-network");
    networkGroup.selectAll("line")
      .data(links)
      .join("line")
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.45)
      .attr("stroke-opacity", .72)
      .attr("stroke-linecap", "round");
    networkGroup.selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 9.2)
      .attr("fill", palette.gray200)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 2);

    const activeNodes = modelGroup.append("g").selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 9.2)
      .attr("fill", palette.red)
      .attr("stroke", palette.red)
      .attr("stroke-width", 2)
      .attr("opacity", 0);
    activeNodes.each(function (d) {
      const node = d3.select(this);
      node.append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1;1;0")
        .attr("keyTimes", "0;.18;.62;1")
        .attr("dur", "1.05s")
        .attr("begin", `${.35 + d.layer * .5}s`)
        .attr("repeatCount", "indefinite");
      node.append("animate")
        .attr("attributeName", "r")
        .attr("values", "9.2;14.8;11;9.2")
        .attr("keyTimes", "0;.18;.62;1")
        .attr("dur", "1.05s")
        .attr("begin", `${.35 + d.layer * .5}s`)
        .attr("repeatCount", "indefinite");
    });
  }

  function renderMlpInternals() {
    const svg = prepareSvg("mlp-internals", "MLP internal variables", "A multilayer perceptron reveals internal variables during layer activation.");
    const layout = mlpLayout([3, 4, 3, 2], [78, width - 68], [120, 294]);
    const layerNames = ["input x", "z1 / a1", "z2 / a2", "output y_hat"];
    const nodeLabels = [
      ["x1", "x2", "x3"],
      ["a1", "a2", "a3", "a4"],
      ["a1", "a2", "a3"],
      ["y1", "y2"]
    ];
    layout.nodes.forEach(d => {
      d.r = d.layer === 0 || d.layer === layout.layers.length - 1 ? 17 : 18;
      d.label = nodeLabels[d.layer][d.index];
    });
    const delayForLayer = layer => .25 + layer * 1.55;
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const paths = svg.append("g").selectAll("path").data(layout.links, d => d.id).join("path")
      .attr("d", d => link({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", palette.gray100)
      .attr("stroke-width", 1.45)
      .attr("stroke-opacity", .32)
      .attr("stroke-linecap", "round");

    const layerLabel = svg.append("g").selectAll("text").data(layout.layers, (_, i) => i).join("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("x", layer => layer[0].x)
      .attr("y", 62)
      .text((_, i) => layerNames[i]);

    const groups = svg.append("g").selectAll("g.neuron").data(layout.nodes, d => d.id).join("g")
      .attr("class", "neuron")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", palette.gray200);
    pulseMlpNodes(circles, delayForLayer);
    const labels = groups.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 11)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.label);
    pulseMlpText(labels, delayForLayer);

    const bias = layout.layers.slice(1).map((layer, i) => ({
      id: `b${i + 1}`,
      x: layer[0].x,
      y: 88,
      layer: i + 1,
      index: 0,
      r: 9
    }));
    const biasGroups = svg.append("g").selectAll("g.bias").data(bias).join("g")
      .attr("class", "bias")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    biasGroups.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 9)
      .attr("y2", 13)
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.4);
    const biasDots = biasGroups.append("circle")
      .attr("r", 9)
      .attr("fill", palette.gray200);
    pulseMlpNodes(biasDots, delayForLayer);
    const biasLabels = biasGroups.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 3.5)
      .attr("font-size", 9)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.id);
    pulseMlpText(biasLabels, delayForLayer);

    const weightLabels = [
      { label: "W1", x: 156, y: 116, layer: 1 },
      { label: "W2", x: 292, y: 296, layer: 2 },
      { label: "W3", x: 432, y: 116, layer: 3 }
    ];
    const weights = svg.append("g").selectAll("text.weight").data(weightLabels).join("text")
      .attr("class", "mark-label weight")
      .attr("text-anchor", "middle")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .text(d => d.label);

    const formulas = [
      { text: "z = W*a + b", x: 122, layer: 1 },
      { text: "a = relu(z)", x: 286, layer: 2 },
      { text: "y_hat = softmax(z)", x: 450, layer: 3 }
    ];
    const formulaGroups = svg.append("g").selectAll("g.formula").data(formulas).join("g")
      .attr("class", "formula")
      .attr("transform", d => `translate(${d.x},340)`);
    formulaGroups.append("rect")
      .attr("x", -68)
      .attr("y", -17)
      .attr("width", 136)
      .attr("height", 30)
      .attr("rx", 5)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray200);
    formulaGroups.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", 3)
      .text(d => d.text);
  }

  function renderBinaryClassifier() {
    const svg = prepareSvg("binary-classifier", "Binary classifier", "A binary classifier activates a winning output without visible labels.");
    const layout = mlpLayout([3, 4, 2], [82, 430], [112, 286]);
    layout.nodes.forEach(d => {
      d.r = d.layer === 2 ? 19 : 15;
      d.active = true;
      d.pulseLayers = d.layer === 0 ? [0, 3] : d.layer === 1 ? [1, 4] : [d.index === 0 ? 2 : 5];
    });
    const delayForLayer = layer => .24 + layer * 1.28;
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    svg.append("g").selectAll("path").data(layout.links, d => d.id).join("path")
      .attr("d", d => link({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", palette.gray300)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", .62)
      .attr("stroke-linecap", "round");
    const decisionRegion = svg.append("g");
    decisionRegion.selectAll("circle.base").data([
      { cx: 504, cy: 162 },
      { cx: 504, cy: 270 }
    ]).join("circle")
      .attr("class", "base")
      .attr("cx", d => d.cx)
      .attr("cy", d => d.cy)
      .attr("r", 26)
      .attr("fill", (d, i) => i === 0 ? palette.greenHighlight : palette.purpleHighlight)
      .attr("stroke", (d, i) => i === 0 ? palette.green : palette.purple)
      .attr("stroke-width", 1.6);
    const classPulse = decisionRegion.selectAll("circle.pulse").data([
      { layer: 2, pulseLayer: 2, r: 26, cx: 504, cy: 162 },
      { layer: 2, pulseLayer: 5, r: 26, cx: 504, cy: 270 }
    ]).join("circle")
      .attr("class", "pulse")
      .attr("cx", d => d.cx)
      .attr("cy", d => d.cy)
      .attr("r", 26)
      .attr("fill", (_, i) => i === 0 ? palette.greenHighlight : palette.purpleHighlight)
      .attr("stroke", (_, i) => i === 0 ? palette.green : palette.purple)
      .attr("stroke-width", 1.6);
    pulseMlpNodes(classPulse, delayForLayer);
    const groups = svg.append("g").selectAll("g").data(layout.nodes, d => d.id).join("g")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", d => [palette.blueHighlight, palette.orangeHighlight, palette.greenHighlight][d.layer])
      .attr("stroke", d => [palette.blue, palette.orange, palette.green][d.layer])
      .attr("stroke-width", 1.4);
    pulseMlpNodes(circles.filter(d => d.active), delayForLayer);
  }

  function renderBinaryClassifierLabeled() {
    const svg = prepareSvg("binary-classifier-labeled", "Binary classifier with labels", "A binary classifier labels features, probabilities, and the selected class.");
    const layout = mlpLayout([3, 4, 2], [78, 416], [118, 286]);
    const layerNames = ["features", "hidden", "probability"];
    const nodeLabels = [
      ["x1", "x2", "x3"],
      ["h1", "h2", "h3", "h4"],
      ["p1", "p0"]
    ];
    layout.nodes.forEach(d => {
      d.r = d.layer === 2 ? 18 : 16;
      d.label = nodeLabels[d.layer][d.index];
      d.active = true;
      d.pulseLayers = d.layer === 0 ? [0, 3] : d.layer === 1 ? [1, 4] : [d.index === 0 ? 2 : 5];
    });
    const delayForLayer = layer => .25 + layer * 1.28;
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    svg.append("g").selectAll("path").data(layout.links, d => d.id).join("path")
      .attr("d", d => link({ source: d.source, target: d.target }))
      .attr("fill", "none")
      .attr("stroke", palette.gray100)
      .attr("stroke-width", 1.45)
      .attr("stroke-opacity", .34)
      .attr("stroke-linecap", "round");
    svg.append("g").selectAll("text.layer").data(layout.layers).join("text")
      .attr("class", "mark-label layer")
      .attr("text-anchor", "middle")
      .attr("x", layer => layer[0].x)
      .attr("y", 76)
      .text((_, i) => layerNames[i]);
    const groups = svg.append("g").selectAll("g.neuron").data(layout.nodes, d => d.id).join("g")
      .attr("class", "neuron")
      .attr("transform", d => `translate(${d.x},${d.y})`);
    const circles = groups.append("circle")
      .attr("r", d => d.r)
      .attr("fill", palette.gray200);
    pulseMlpNodes(circles.filter(d => d.active), delayForLayer);
    const labels = groups.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", 4)
      .attr("font-size", 10)
      .attr("font-weight", 800)
      .attr("fill", palette.ink)
      .text(d => d.label);
    pulseMlpText(labels.filter(d => d.active), delayForLayer);

    const resultData = [
      { label: "class 1", probability: "p = 0.83", pulseLayer: 2, y: layout.layers[2][0].y },
      { label: "class 0", probability: "p = 0.71", pulseLayer: 5, y: layout.layers[2][1].y }
    ];
    const results = svg.append("g").selectAll("g.result").data(resultData).join("g")
      .attr("class", "result")
      .attr("transform", d => `translate(496,${d.y})`)
      .attr("opacity", 0);
    results.append("rect")
      .attr("x", -46)
      .attr("y", -26)
      .attr("width", 92)
      .attr("height", 52)
      .attr("rx", 6)
      .attr("fill", palette.gray50)
      .attr("stroke", palette.gray200);
    results.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", -5)
      .text(d => d.label);
    results.append("text")
      .attr("class", "mark-label")
      .attr("text-anchor", "middle")
      .attr("y", 14)
      .text(d => d.probability);
    pulseMlpVisibility(results, delayForLayer);

    svg.append("text")
      .attr("class", "mark-label")
      .attr("x", 84)
      .attr("y", 336)
      .text("binary threshold: p >= 0.5");
  }

  function renderTemporalNetwork() {
    const svg = prepareSvg("temporal-network", "Network evolution", "Stable nodes shift as topology snapshots change.");
    const nodes = ["API", "Auth", "Jobs", "Data", "UI", "Ops"].map((id, i) => ({ id, group: i % 3 }));
    const linksA = [["API", "Auth"], ["API", "Jobs"], ["Jobs", "Data"], ["UI", "API"], ["Ops", "Jobs"]];
    const linksB = [["API", "Auth"], ["Auth", "Data"], ["Data", "UI"], ["Ops", "API"], ["Jobs", "Ops"], ["UI", "Auth"]];
    const settle = links => {
      const simNodes = nodes.map(d => ({ ...d }));
      const simLinks = links.map(([source, target]) => ({ source, target }));
      const simulation = d3.forceSimulation(simNodes)
        .randomSource(d3.randomLcg(0.71))
        .force("link", d3.forceLink(simLinks).id(d => d.id).distance(82).strength(.7))
        .force("charge", d3.forceManyBody().strength(-230))
        .force("collide", d3.forceCollide(24))
        .force("center", d3.forceCenter(width / 2, height / 2 + 10))
        .stop();
      for (let i = 0; i < 180; i += 1) simulation.tick();
      return new Map(simNodes.map(d => [d.id, d]));
    };
    const start = settle(linksA);
    const end = settle(linksB);
    const linkLines = svg.append("g").selectAll("line").data(linksB).join("line")
      .attr("x1", d => end.get(d[0]).x).attr("y1", d => end.get(d[0]).y)
      .attr("x2", d => end.get(d[1]).x).attr("y2", d => end.get(d[1]).y)
      .attr("stroke", palette.gray300).attr("stroke-width", 2.2).attr("stroke-opacity", .72);
    fadeIn(linkLines, .2, .7);
    const node = svg.append("g").selectAll("g").data(nodes).join("g");
    node.attr("transform", d => `translate(${end.get(d.id).x},${end.get(d.id).y})`);
    node.append("animateTransform")
      .attr("attributeName", "transform")
      .attr("type", "translate")
      .attr("from", d => `${start.get(d.id).x} ${start.get(d.id).y}`)
      .attr("to", d => `${end.get(d.id).x} ${end.get(d.id).y}`)
      .attr("dur", "1.1s")
      .attr("fill", "freeze");
    node.append("circle").attr("r", 17).attr("fill", d => colors[d.group]).attr("stroke", "#fff").attr("stroke-width", 2);
    node.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 34).text(d => d.id);
    svg.append("text").attr("class", "label").attr("x", 52).attr("y", 36).text("snapshot A -> B");
  }

  function renderTangledTree() {
    const svg = prepareSvg("tangled-tree", "Tangled tree", "A layered hierarchy with children that can inherit from multiple parents.");
    const nodes = [
      { id: "Root", layer: 0, row: 1 },
      { id: "Alpha", layer: 1, row: 0 }, { id: "Beta", layer: 1, row: 2 },
      { id: "Spec", layer: 2, row: 0 }, { id: "Model", layer: 2, row: 1.4 }, { id: "Ops", layer: 2, row: 2.8 },
      { id: "Pilot", layer: 3, row: .45 }, { id: "Launch", layer: 3, row: 1.65 }, { id: "Audit", layer: 3, row: 2.75 },
      { id: "Learn", layer: 4, row: 1.45 }
    ];
    const links = [
      ["Root", "Alpha"], ["Root", "Beta"], ["Alpha", "Spec"], ["Alpha", "Model"], ["Beta", "Model"], ["Beta", "Ops"],
      ["Spec", "Pilot"], ["Model", "Pilot"], ["Model", "Launch"], ["Ops", "Launch"], ["Ops", "Audit"], ["Pilot", "Learn"], ["Launch", "Learn"], ["Audit", "Learn"]
    ];
    const byId = new Map(nodes.map(d => [d.id, d]));
    const x = d3.scalePoint().domain([0, 1, 2, 3, 4]).range([72, width - 70]);
    const y = d3.scaleLinear().domain([0, 3]).range([78, 310]);
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const linkColors = [palette.blue, palette.orange, palette.green, palette.purple, palette.red];
    const paths = svg.append("g").selectAll("path").data(links).join("path")
      .attr("d", ([source, target], i) => {
        const a = byId.get(source);
        const b = byId.get(target);
        return link({
          source: { x: x(a.layer) + 34, y: y(a.row) },
          target: { x: x(b.layer) - 34, y: y(b.row) }
        });
      })
      .attr("fill", "none")
      .attr("stroke", (d, i) => linkColors[i % linkColors.length])
      .attr("stroke-width", 2.2)
      .attr("stroke-opacity", .5);
    drawPath(paths, .08, .95);
    const groups = svg.append("g").selectAll("g").data(nodes).join("g")
      .attr("transform", d => `translate(${x(d.layer)},${y(d.row)})`);
    groups.append("rect")
      .attr("x", -39).attr("y", -16).attr("width", 78).attr("height", 32).attr("rx", 6)
      .attr("fill", d => d.layer === 0 ? palette.blueHover : d.layer === 4 ? palette.ink : palette.gray50)
      .attr("stroke", d => d.layer === 0 || d.layer === 4 ? palette.ink : palette.gray300)
      .attr("stroke-width", d => d.layer === 0 || d.layer === 4 ? 1.6 : 1.2);
    groups.append("text")
      .attr("class", d => d.layer === 0 || d.layer === 4 ? "reverse-label" : "mark-label")
      .attr("fill", d => d.layer === 0 || d.layer === 4 ? "#fff" : palette.ink)
      .attr("text-anchor", "middle").attr("dy", 4).text(d => d.id);
    fadeIn(groups, .18, .7);
  }

  function renderTangledTreeLevels() {
    const svg = prepareSvg("tangled-tree-levels", "Tangled tree cascade", "A cascade-style tangled tree uses small node markers and metro-style bundles to reveal multiple inheritance by generation.");
    const generations = [
      [{ id: "Chaos" }],
      [{ id: "Gaea", parents: ["Chaos"] }, { id: "Uranus" }],
      [
        { id: "Oceanus", parents: ["Gaea", "Uranus"] },
        { id: "Tethys", parents: ["Gaea", "Uranus"] },
        { id: "Rhea", parents: ["Gaea", "Uranus"] },
        { id: "Cronus", parents: ["Gaea", "Uranus"] },
        { id: "Coeus", parents: ["Gaea", "Uranus"] },
        { id: "Phoebe", parents: ["Gaea", "Uranus"] },
        { id: "Iapetus", parents: ["Gaea", "Uranus"] }
      ],
      [
        { id: "Doris", parents: ["Oceanus", "Tethys"] },
        { id: "Nereus", parents: ["Oceanus", "Tethys"] },
        { id: "Dione", parents: ["Oceanus", "Tethys"] },
        { id: "Demeter", parents: ["Rhea", "Cronus"] },
        { id: "Hades", parents: ["Rhea", "Cronus"] },
        { id: "Hera", parents: ["Rhea", "Cronus"] },
        { id: "Zeus", parents: ["Rhea", "Cronus"] },
        { id: "Leto", parents: ["Coeus", "Phoebe"] },
        { id: "Atlas", parents: ["Iapetus"] }
      ],
      [
        { id: "Thetis", parents: ["Doris", "Nereus"] },
        { id: "Peleus" },
        { id: "Aphrodite", parents: ["Dione", "Zeus"] },
        { id: "Persephone", parents: ["Demeter", "Zeus"] },
        { id: "Ares", parents: ["Hera", "Zeus"] },
        { id: "Apollo", parents: ["Leto", "Zeus"] }
      ],
      [
        { id: "Achilles", parents: ["Thetis", "Peleus"] },
        { id: "Aeneas", parents: ["Aphrodite"] },
        { id: "Eros", parents: ["Aphrodite", "Ares"] }
      ]
    ];
    const xPositions = [34, 122, 212, 316, 430, 518];
    const generationStartY = [60, 118, 178, 222, 292, 342];
    const rowGap = [0, 34, 20, 18, 18, 22];
    const bundleColors = [palette.blue, palette.orange, palette.purple, palette.green, palette.red, palette.gray700, palette.gold, palette.blueHover];
    const nodeRadius = 4.2;
    const nodes = generations.flatMap((generation, layer) => generation.map((node, index) => ({
      ...node,
      layer,
      index,
      x: xPositions[layer],
      y: generationStartY[layer] + index * rowGap[layer]
    })));
    const byId = new Map(nodes.map(d => [d.id, d]));
    const families = new Map();
    nodes.forEach(node => {
      if (!node.parents) return;
      const key = `${node.layer}:${node.parents.join("+")}`;
      if (!families.has(key)) families.set(key, {
        key,
        layer: node.layer,
        parents: node.parents,
        children: []
      });
      families.get(key).children.push(node);
    });
    const lanesByLayer = new Map();
    const familyList = [...families.values()].map((family, index) => {
      const lane = lanesByLayer.get(family.layer) || 0;
      lanesByLayer.set(family.layer, lane + 1);
      const parentMaxX = d3.max(family.parents.map(parentId => byId.get(parentId)?.x).filter(Number.isFinite));
      const childX = xPositions[family.layer];
      const laneOffsets = [0, -8, 8, -16, 16, -24, 24];
      const bundleX = Math.min(childX - 20, parentMaxX + (childX - parentMaxX) * .66 + laneOffsets[lane % laneOffsets.length]);
      return {
        ...family,
        index,
        lane,
        color: bundleColors[index % bundleColors.length],
        bundleX
      };
    });
    const familyByKey = new Map(familyList.map(family => [family.key, family]));
    const links = [];
    nodes.forEach(node => {
      if (!node.parents) return;
      const family = familyByKey.get(`${node.layer}:${node.parents.join("+")}`);
      node.parents.forEach(parentId => {
        const parent = byId.get(parentId);
        if (parent) links.push({ parent, child: node, family });
      });
    });
    const generationDelay = layer => .16 + layer * .58;
    const linkDelay = layer => Math.max(.06, generationDelay(layer) - .18);
    const waterfallPath = d => {
      const xs = d.parent.x + nodeRadius;
      const ys = d.parent.y;
      const xt = d.child.x - nodeRadius;
      const yt = d.child.y;
      const xb = d.family.bundleX;
      const c = 9;
      const sign = yt >= ys ? 1 : -1;
      return [
        `M${xs},${ys}`,
        `H${xb - c}`,
        `Q${xb},${ys} ${xb},${ys + sign * c}`,
        `V${yt - sign * c}`,
        `Q${xb},${yt} ${xb + c},${yt}`,
        `H${xt}`
      ].join(" ");
    };

    const haloLinks = svg.append("g")
      .attr("fill", "none")
      .selectAll("path.halo-link")
      .data(links)
      .join("path")
      .attr("class", "halo-link")
      .attr("d", waterfallPath)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 4.6)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0);
    const colorLinks = svg.append("g")
      .attr("fill", "none")
      .selectAll("path.color-link")
      .data(links)
      .join("path")
      .attr("class", "color-link")
      .attr("d", waterfallPath)
      .attr("stroke", d => d.family.color)
      .attr("stroke-width", d => d.family.parents.length > 1 ? 2.2 : 1.7)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("opacity", 0);
    svg.selectAll("path.halo-link, path.color-link").each(function (d) {
      const length = this.getTotalLength ? this.getTotalLength() : 180;
      const delay = linkDelay(d.child.layer) + d.child.index * .025;
      d3.select(this)
        .attr("stroke-dasharray", `${length} ${length}`)
        .attr("stroke-dashoffset", length);
      d3.select(this).append("animate")
        .attr("attributeName", "stroke-dashoffset")
        .attr("from", length)
        .attr("to", 0)
        .attr("dur", ".72s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", this.classList.contains("halo-link") ? .95 : .86)
        .attr("dur", ".2s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
    });

    const node = svg.append("g").selectAll("g.cascade-node").data(nodes).join("g")
      .attr("class", "cascade-node")
      .attr("opacity", 0);
    node.append("circle")
      .attr("r", nodeRadius)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", palette.surface)
      .attr("stroke", palette.ink)
      .attr("stroke-width", 2);
    node.append("text")
      .attr("class", "tangle-cascade-label")
      .attr("x", d => d.x + 7.5)
      .attr("y", d => d.y - 5.5)
      .attr("font-size", 8.2)
      .attr("font-weight", 700)
      .attr("fill", palette.ink)
      .attr("stroke", palette.surface)
      .attr("stroke-width", 3)
      .attr("paint-order", "stroke")
      .text(d => d.id);
    node.each(function (d) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", 1)
        .attr("dur", ".34s")
        .attr("begin", `${generationDelay(d.layer) + d.index * .018}s`)
        .attr("fill", "freeze");
    });
  }

  function renderCalendarYear() {
    const svg = prepareSvg("calendar-year", "Calendar year", "Daily observations are wrapped into monthly week grids.");
    const year = 2026;
    const cell = 10.5;
    const monthW = 126;
    const monthH = 111;
    const startX = 44;
    const startY = 42;
    const days = d3.utcDays(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1))).map(date => ({
      date,
      value: .32 + .36 * Math.sin(d3.utcDay.count(new Date(Date.UTC(year, 0, 1)), date) / 18) + .28 * Math.cos(date.getUTCMonth() * .9)
    }));
    const valueExtent = d3.extent(days, d => d.value);
    const color = quantizedRamp(valueExtent, [palette.blueHighlight, palette.greenHighlight, palette.gold, palette.blue]);
    const monthFormat = d3.utcFormat("%b");
    svg.append("g").selectAll("text").data(d3.range(12)).join("text")
      .attr("class", "mark-label")
      .attr("x", month => startX + (month % 4) * monthW)
      .attr("y", month => startY + Math.floor(month / 4) * monthH - 12)
      .text(month => monthFormat(new Date(Date.UTC(year, month, 1))));
    const cells = svg.append("g").selectAll("rect").data(days).join("rect")
      .attr("x", d => {
        const month = d.date.getUTCMonth();
        const week = d3.utcSunday.count(d3.utcMonth.floor(d.date), d.date);
        return startX + (month % 4) * monthW + week * cell;
      })
      .attr("y", d => startY + Math.floor(d.date.getUTCMonth() / 4) * monthH + d.date.getUTCDay() * cell)
      .attr("width", cell - 1.4)
      .attr("height", cell - 1.4)
      .attr("rx", 1.3)
      .attr("fill", d => color(d.value));
    fadeIn(cells, .003, .35);
    svg.append("text").attr("class", "label").attr("x", width - 124).attr("y", height - 28).text(String(year));
  }

  function renderVaccineImpact() {
    const svg = prepareSvg("vaccine-impact", "Vaccine impact", "A public-health heatmap shows incidence dropping after vaccine introduction.");
    const diseases = [
      { name: "Measles", vaccine: 1963, base: 92 },
      { name: "Polio", vaccine: 1955, base: 76 },
      { name: "Rubella", vaccine: 1969, base: 58 },
      { name: "Mumps", vaccine: 1967, base: 49 }
    ];
    const years = d3.range(1940, 1985, 5);
    const data = diseases.flatMap((disease, di) => years.map((year, yi) => {
      const before = year < disease.vaccine;
      const decay = Math.max(0, year - disease.vaccine) / 8;
      return {
        ...disease,
        year,
        value: before ? disease.base - yi * 2 + Math.sin(yi + di) * 6 : disease.base * Math.exp(-decay) * .22 + Math.cos(yi) * 2
      };
    }));
    const x = d3.scaleBand().domain(years).range([116, width - 32]).padding(.08);
    const y = d3.scaleBand().domain(diseases.map(d => d.name)).range([72, 304]).padding(.16);
    const color = quantizedRamp([0, d3.max(data, d => d.value)], ramps.vaccine);
    axisBottom(svg, d3.scaleLinear().domain(d3.extent(years)).range([x(years[0]) + x.bandwidth() / 2, x(years.at(-1)) + x.bandwidth() / 2]), 338, 5);
    svg.append("g").selectAll("text").data(diseases).join("text")
      .attr("class", "mark-label")
      .attr("x", 102)
      .attr("y", d => y(d.name) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => d.name);
    const cells = svg.append("g").selectAll("rect").data(data).join("rect")
      .attr("x", d => x(d.year))
      .attr("y", d => y(d.name))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("fill", d => color(d.value))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1);
    fadeIn(cells, .018, .5);
    const markers = svg.append("g").selectAll("line").data(diseases).join("line")
      .attr("x1", d => x(years.find(year => year >= d.vaccine)) || x(years.at(-1)))
      .attr("x2", d => x(years.find(year => year >= d.vaccine)) || x(years.at(-1)))
      .attr("y1", d => y(d.name) - 6)
      .attr("y2", d => y(d.name) + y.bandwidth() + 6)
      .attr("stroke", palette.blue)
      .attr("stroke-width", 2.4)
      .attr("stroke-linecap", "round");
    fadeIn(markers, .35, .55);
  }

  function renderWordCloud() {
    const svg = prepareSvg("word-cloud", "Word cloud", "Weighted text marks are placed around a compact semantic center.");
    const terms = [
      ["D3", 100], ["SVG", 82], ["layout", 68], ["scales", 58], ["joins", 54], ["force", 46],
      ["paths", 43], ["axis", 38], ["hierarchy", 36], ["voronoi", 34], ["motion", 31], ["shape", 29],
      ["data", 27], ["brush", 25], ["ticks", 23], ["ribbon", 21], ["cells", 19], ["labels", 18]
    ].map(([text, value], i) => ({ text, value, i }));
    const size = d3.scaleSqrt().domain(d3.extent(terms, d => d.value)).range([14, 54]);
    const color = d3.scaleOrdinal(terms.map(d => d.text), [palette.ink, palette.blue, palette.red, palette.orange, palette.green, palette.purple, palette.gray700]);
    const boxes = [];
    const placed = terms.map((d, i) => {
      const fontSize = size(d.value);
      const rotate = i === 0 ? 0 : i % 5 === 0 ? -24 : i % 4 === 0 ? 22 : 0;
      const textWidth = estimateSvgTextWidth(d.text, fontSize);
      const textHeight = fontSize * 1.08;
      const radians = Math.abs(rotate) * Math.PI / 180;
      const boxWidth = Math.abs(textWidth * Math.cos(radians)) + Math.abs(textHeight * Math.sin(radians));
      const boxHeight = Math.abs(textWidth * Math.sin(radians)) + Math.abs(textHeight * Math.cos(radians));
      let position = { x: width / 2, y: height / 2 };
      let accepted = false;
      for (let step = 0; step < 1200; step += 1) {
        const angle = i * 1.17 + step * 2.399963;
        const radius = i === 0 ? 0 : 8 + Math.sqrt(step) * 7.2;
        const x = width / 2 + Math.cos(angle) * radius * 1.18;
        const y = height / 2 + Math.sin(angle) * radius * .76;
        const candidate = {
          x0: x - boxWidth / 2,
          y0: y - boxHeight / 2,
          x1: x + boxWidth / 2,
          y1: y + boxHeight / 2
        };
        const inside = candidate.x0 >= 28 && candidate.x1 <= width - 28 && candidate.y0 >= 36 && candidate.y1 <= height - 36;
        const clear = !boxes.some(box => candidate.x0 < box.x1 + 5 && candidate.x1 + 5 > box.x0 && candidate.y0 < box.y1 + 4 && candidate.y1 + 4 > box.y0);
        if (inside && clear) {
          position = { x, y };
          boxes.push(candidate);
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        position = { x: 62 + (i % 6) * 86, y: 76 + Math.floor(i / 6) * 120 };
        boxes.push({ x0: position.x - boxWidth / 2, y0: position.y - boxHeight / 2, x1: position.x + boxWidth / 2, y1: position.y + boxHeight / 2 });
      }
      return { ...d, ...position, rotate, fontSize };
    });
    svg.attr("data-layout", "collision-aware-spiral").attr("data-word-count", terms.length);
    const words = svg.append("g").selectAll("text").data(placed).join("text")
      .attr("class", "word-mark")
      .attr("data-word", d => d.text)
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", d => d.fontSize)
      .attr("font-weight", d => d.value > 50 ? 750 : 600)
      .attr("fill", d => color(d.text))
      .attr("transform", d => `rotate(${d.rotate},${d.x},${d.y})`)
      .text(d => d.text);
    fadeIn(words, .04, .7);
    words.each(function (_, i) {
      d3.select(this).append("animateTransform")
        .attr("attributeName", "transform")
        .attr("type", "scale")
        .attr("additive", "sum")
        .attr("from", ".82")
        .attr("to", "1")
        .attr("dur", ".65s")
        .attr("begin", `${i * .025}s`)
        .attr("fill", "freeze");
    });
  }

  function renderVoronoiStippling() {
    const svg = prepareSvg("voronoi-stippling", "Voronoi stippling", "Voronoi cells and weighted points approximate a continuous intensity image.");
    const bounds = [58, 52, width - 58, height - 52];
    const field = (x, y) => {
      const a = Math.exp(-(((x - 214) / 95) ** 2 + ((y - 174) / 70) ** 2));
      const b = Math.exp(-(((x - 338) / 74) ** 2 + ((y - 244) / 86) ** 2)) * .85;
      const c = Math.exp(-(((x - 292) / 128) ** 2 + ((y - 118) / 44) ** 2)) * .5;
      return Math.min(1, a + b + c);
    };
    const points = d3.range(72).map(i => {
      const x = 74 + (i * 67) % 414 + Math.sin(i * 1.7) * 13;
      const y = 64 + (i * 47) % 286 + Math.cos(i * .83) * 15;
      return { x, y, weight: field(x, y) };
    }).filter(d => d.weight > .13);
    const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);
    const voronoi = delaunay.voronoi(bounds);
    const cells = svg.append("g").selectAll("path").data(points).join("path")
      .attr("d", (d, i) => voronoi.renderCell(i))
      .attr("fill", d => quantizedRamp([0, 1], ramps.gray)(d.weight))
      .attr("stroke", "#d6dde6")
      .attr("stroke-width", .8);
    fadeIn(cells, .025, .6);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("fill", palette.ink)
      .attr("fill-opacity", d => .34 + d.weight * .55);
    grow(dots, "r", .8, d => 1.9 + d.weight * 4.8, .1, .65);
    svg.append("path")
      .attr("d", "M168,68 C244,38 384,62 432,144 C480,226 410,330 286,344 C176,356 92,278 106,184 C114,126 124,92 168,68Z")
      .attr("fill", "none")
      .attr("stroke", palette.orange)
      .attr("stroke-width", 2.2)
      .attr("stroke-dasharray", "6 7");
  }

  function renderPocketMonsterStippling() {
    const svg = prepareSvg("creature-stippling", "Pocket monster Voronoi stippling", "Weighted centroidal Voronoi stipples form a stylized electric pocket creature silhouette.");
    const bounds = [70, 34, width - 58, height - 36];
    const leftEar = [[218, 132], [178, 42], [252, 103], [244, 146]];
    const rightEar = [[342, 132], [384, 42], [308, 103], [316, 146]];
    const leftTip = [[178, 42], [197, 83], [229, 85], [204, 55]];
    const rightTip = [[384, 42], [364, 83], [331, 85], [356, 55]];
    const tail = [[374, 232], [438, 184], [422, 224], [486, 218], [424, 280], [440, 238], [386, 260]];
    const sampleStep = 5.4;

    function polygonPath(points) {
      return `M${points.map(point => point.join(",")).join("L")}Z`;
    }

    function pointInPolygon(x, y, polygon) {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
      }
      return inside;
    }

    function ellipseScore(x, y, cx, cy, rx, ry) {
      const value = 1 - (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
      return Math.max(0, value);
    }

    function segmentDistance(px, py, ax, ay, bx, by) {
      const dx = bx - ax;
      const dy = by - ay;
      const length2 = dx * dx + dy * dy;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2));
      const x = ax + t * dx;
      const y = ay + t * dy;
      return Math.hypot(px - x, py - y);
    }

    function creatureSignal(x, y) {
      const head = ellipseScore(x, y, 280, 184, 100, 84);
      const body = ellipseScore(x, y, 280, 260, 94, 88);
      const leftFoot = ellipseScore(x, y, 238, 330, 38, 18);
      const rightFoot = ellipseScore(x, y, 322, 330, 38, 18);
      const inLeftEar = pointInPolygon(x, y, leftEar);
      const inRightEar = pointInPolygon(x, y, rightEar);
      const inTail = pointInPolygon(x, y, tail);
      const cheek = Math.max(ellipseScore(x, y, 228, 214, 22, 16), ellipseScore(x, y, 332, 214, 22, 16));
      const eye = Math.max(ellipseScore(x, y, 252, 174, 9, 13), ellipseScore(x, y, 308, 174, 9, 13));
      const nose = ellipseScore(x, y, 280, 196, 5.5, 4.2);
      const mouth = Math.min(segmentDistance(x, y, 280, 202, 268, 216), segmentDistance(x, y, 280, 202, 292, 216)) < 4.2 ? 1 : 0;
      const tip = pointInPolygon(x, y, leftTip) || pointInPolygon(x, y, rightTip);
      const silhouette = Math.max(
        head * .9,
        body * .82,
        leftFoot * .46,
        rightFoot * .46,
        inLeftEar ? .74 : 0,
        inRightEar ? .74 : 0,
        inTail ? .62 : 0
      );

      if (tip) return { density: .98, region: "tip" };
      if (eye || nose || mouth) return { density: 1, region: "ink" };
      if (cheek) return { density: .94, region: "cheek" };
      if (inTail) return { density: .72, region: "tail" };
      if (silhouette > 0) return { density: Math.min(1, .34 + silhouette * .62), region: "body" };
      return { density: 0, region: "none" };
    }

    const samples = [];
    for (let y = bounds[1]; y <= bounds[3]; y += sampleStep) {
      for (let x = bounds[0]; x <= bounds[2]; x += sampleStep) {
        const signal = creatureSignal(x, y);
        if (signal.density > .2) {
          samples.push({ x, y, weight: signal.density ** 1.55, region: signal.region });
        }
      }
    }

    let totalWeight = 0;
    const cumulative = samples.map(sample => {
      totalWeight += sample.weight;
      return totalWeight;
    });
    const seeded01 = value => {
      const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
      return raw - Math.floor(raw);
    };
    const sampleAt = value => samples[Math.min(samples.length - 1, d3.bisectLeft(cumulative, value))];
    let points = d3.range(158).map(i => {
      const sample = sampleAt(((i * .61803398875 + .17) % 1) * totalWeight);
      const jitterX = (seeded01(i + 11) - .5) * sampleStep * .9;
      const jitterY = (seeded01(i + 29) - .5) * sampleStep * .9;
      const candidateX = sample.x + jitterX;
      const candidateY = sample.y + jitterY;
      const signal = creatureSignal(candidateX, candidateY);
      const x = signal.density > .18 ? candidateX : sample.x;
      const y = signal.density > .18 ? candidateY : sample.y;
      return { x, y, x0: x, y0: y, region: signal.density > .18 ? signal.region : sample.region };
    });

    for (let iteration = 0; iteration < 6; iteration++) {
      const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);
      const accumulators = points.map(() => ({ x: 0, y: 0, weight: 0 }));
      samples.forEach(sample => {
        const index = delaunay.find(sample.x, sample.y);
        const accumulator = accumulators[index];
        accumulator.x += sample.x * sample.weight;
        accumulator.y += sample.y * sample.weight;
        accumulator.weight += sample.weight;
      });
      points = points.map((point, index) => {
        const accumulator = accumulators[index];
        if (!accumulator.weight) return point;
        return {
          ...point,
          x: accumulator.x / accumulator.weight,
          y: accumulator.y / accumulator.weight
        };
      });
    }

    points.forEach((point, index) => {
      const signal = creatureSignal(point.x, point.y);
      point.region = signal.region === "none" ? point.region : signal.region;
      point.weight = Math.max(.22, signal.density);
      point.cellIndex = index;
    });

    const defs = svg.append("defs");
    const clipId = "creature-stippling-clip";
    const clip = defs.append("clipPath").attr("id", clipId);
    clip.append("path").attr("d", polygonPath(leftEar));
    clip.append("path").attr("d", polygonPath(rightEar));
    clip.append("path").attr("d", polygonPath(tail));
    clip.append("ellipse").attr("cx", 280).attr("cy", 184).attr("rx", 100).attr("ry", 84);
    clip.append("ellipse").attr("cx", 280).attr("cy", 260).attr("rx", 94).attr("ry", 88);
    clip.append("ellipse").attr("cx", 238).attr("cy", 330).attr("rx", 38).attr("ry", 18);
    clip.append("ellipse").attr("cx", 322).attr("cy", 330).attr("rx", 38).attr("ry", 18);

    const dotFill = {
      body: palette.gold,
      tail: palette.orange,
      cheek: palette.red,
      ink: palette.gray900,
      tip: palette.gray900
    };
    const cellFill = {
      body: palette.yellowHighlight,
      tail: palette.orangeHighlight,
      cheek: palette.redHighlight,
      ink: palette.gray800,
      tip: palette.gray800
    };
    const orderedPoints = points.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);
    const voronoi = delaunay.voronoi(bounds);

    const cells = svg.append("g")
      .attr("clip-path", `url(#${clipId})`)
      .selectAll("path")
      .data(orderedPoints)
      .join("path")
      .attr("d", d => voronoi.renderCell(d.cellIndex))
      .attr("fill", d => cellFill[d.region] || palette.yellowHighlight)
      .attr("fill-opacity", d => d.region === "ink" || d.region === "tip" ? .22 : .58)
      .attr("stroke", palette.surface)
      .attr("stroke-width", .95)
      .attr("opacity", .96);

    cells.each(function (_, i) {
      d3.select(this).append("animate")
        .attr("attributeName", "opacity")
        .attr("from", 0)
        .attr("to", .96)
        .attr("dur", ".72s")
        .attr("begin", `${i * .006}s`)
        .attr("fill", "freeze");
    });

    const dots = svg.append("g")
      .selectAll("circle")
      .data(orderedPoints)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", d => d.region === "ink" || d.region === "tip" ? 2.9 + d.weight * 2.4 : 2.1 + d.weight * 2.1)
      .attr("fill", d => dotFill[d.region] || palette.gold)
      .attr("fill-opacity", d => d.region === "body" ? .78 : .92);

    dots.each(function (d, i) {
      const delay = .16 + i * .006;
      const radius = d.region === "ink" || d.region === "tip" ? 2.9 + d.weight * 2.4 : 2.1 + d.weight * 2.1;
      const dot = d3.select(this);
      dot.append("animate")
        .attr("attributeName", "cx")
        .attr("from", d.x0)
        .attr("to", d.x)
        .attr("dur", ".96s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
      dot.append("animate")
        .attr("attributeName", "cy")
        .attr("from", d.y0)
        .attr("to", d.y)
        .attr("dur", ".96s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
      dot.append("animate")
        .attr("attributeName", "r")
        .attr("from", .4)
        .attr("to", radius)
        .attr("dur", ".64s")
        .attr("begin", `${delay}s`)
        .attr("fill", "freeze");
    });
  }

  function renderTanglegram() {
    const svg = prepareSvg("tanglegram", "Tanglegram", "Two comparable trees connect matched leaves across a shared center.");
    const left = [
      { id: "L0", label: "Source", x: 74, y: 202 },
      { id: "L1", label: "A", x: 150, y: 124, parent: "L0" }, { id: "L2", label: "B", x: 150, y: 278, parent: "L0" },
      { id: "L3", label: "a1", x: 230, y: 84, parent: "L1" }, { id: "L4", label: "a2", x: 230, y: 164, parent: "L1" },
      { id: "L5", label: "b1", x: 230, y: 252, parent: "L2" }, { id: "L6", label: "b2", x: 230, y: 326, parent: "L2" }
    ];
    const right = [
      { id: "R0", label: "Target", x: 486, y: 202 },
      { id: "R1", label: "X", x: 410, y: 114, parent: "R0" }, { id: "R2", label: "Y", x: 410, y: 278, parent: "R0" },
      { id: "R3", label: "x1", x: 330, y: 86, parent: "R1" }, { id: "R4", label: "x2", x: 330, y: 182, parent: "R1" },
      { id: "R5", label: "y1", x: 330, y: 248, parent: "R2" }, { id: "R6", label: "y2", x: 330, y: 330, parent: "R2" }
    ];
    const byId = new Map([...left, ...right].map(d => [d.id, d]));
    const treeLinks = [...left, ...right].filter(d => d.parent).map(d => [d.parent, d.id]);
    const link = d3.linkHorizontal().x(d => d.x).y(d => d.y);
    const treePaths = svg.append("g").selectAll("path").data(treeLinks).join("path")
      .attr("d", ([source, target]) => link({ source: byId.get(source), target: byId.get(target) }))
      .attr("fill", "none")
      .attr("stroke", "#aebaca")
      .attr("stroke-width", 1.8);
    drawPath(treePaths, .05, .7);
    const matches = [["L3", "R5"], ["L4", "R3"], ["L5", "R6"], ["L6", "R4"]];
    const matchPaths = svg.append("g").selectAll("path").data(matches).join("path")
      .attr("d", ([source, target]) => link({ source: byId.get(source), target: byId.get(target) }))
      .attr("fill", "none")
      .attr("stroke", (d, i) => colors[i])
      .attr("stroke-width", 2.4)
      .attr("stroke-opacity", .72);
    drawPath(matchPaths, .25, .9);
    const nodes = svg.append("g").selectAll("g").data([...left, ...right]).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
    nodes.append("circle").attr("fill", d => d.parent ? "#fff" : palette.ink).attr("stroke", palette.blue).attr("stroke-width", 2);
    grow(nodes.selectAll("circle"), "r", 3, d => d.parent ? 8 : 12, .15, .55);
    nodes.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", d => d.parent ? -13 : 25).text(d => d.label);
  }

  function renderScatterplotTour() {
    const svg = prepareSvg("scatterplot-tour", "Scatterplot tour", "Points preserve identity while moving between two projected views.");
    const data = d3.range(34).map(i => ({
      id: i,
      a: 15 + (i * 19) % 84,
      b: 22 + (i * 37) % 72,
      c: 20 + ((i * 29 + 18) % 78),
      d: 18 + ((i * 17 + 45) % 74),
      group: i % 3
    }));
    const margin = { top: 42, right: 40, bottom: 52, left: 58 };
    const xA = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);
    const yA = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    const xB = d3.scaleLinear().domain([0, 100]).range([margin.left, width - margin.right]);
    const yB = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, xA, height - margin.bottom, 4);
    axisLeft(svg, yA, margin.left, 4);
    const trails = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => xA(d.a)).attr("y1", d => yA(d.b))
      .attr("x2", d => xB(d.c)).attr("y2", d => yB(d.d))
      .attr("stroke", "#d5dce5").attr("stroke-width", 1.2);
    fadeIn(trails, .05, .5);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => xB(d.c))
      .attr("cy", d => yB(d.d))
      .attr("r", 6.2)
      .attr("fill", d => colors[d.group])
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2);
    dots.append("animate").attr("attributeName", "cx").attr("from", d => xA(d.a)).attr("to", d => xB(d.c)).attr("dur", "1.15s").attr("fill", "freeze");
    dots.append("animate").attr("attributeName", "cy").attr("from", d => yA(d.b)).attr("to", d => yB(d.d)).attr("dur", "1.15s").attr("fill", "freeze");
    svg.append("text").attr("class", "label").attr("x", 74).attr("y", 34).text("view A -> view B");
  }

  function renderZoomToBounds() {
    const svg = prepareSvg("zoom-to-bounds", "Zoom to bounds", "A bounded selection is magnified into a linked detail pane.");
    const plot = { x: 56, y: 54, w: 292, h: 296 };
    const focus = { x0: 145, y0: 125, x1: 244, y1: 225 };
    const detail = { x: 386, y: 72, w: 132, h: 190 };
    const points = d3.range(48).map(i => ({
      x: plot.x + 18 + (i * 53) % (plot.w - 36) + Math.sin(i) * 8,
      y: plot.y + 18 + (i * 41) % (plot.h - 36) + Math.cos(i * .6) * 8,
      group: i % 4
    }));
    points.forEach(d => {
      d.selected = d.x >= focus.x0 && d.x <= focus.x1 && d.y >= focus.y0 && d.y <= focus.y1;
    });
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y)
      .attr("fill", d => d.selected ? palette.orange : colors[d.group])
      .attr("fill-opacity", d => d.selected ? .9 : .42)
      .attr("stroke", "#fff");
    grow(dots, "r", 1.5, d => d.selected ? 5.8 : 4.2, .05, .5);
    const focusRect = svg.append("rect")
      .attr("x", focus.x0).attr("y", focus.y0).attr("width", focus.x1 - focus.x0).attr("height", focus.y1 - focus.y0)
      .attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 2.4);
    drawPath(focusRect, .18, .8);
    svg.append("rect").attr("x", detail.x).attr("y", detail.y).attr("width", detail.w).attr("height", detail.h).attr("rx", 6).attr("fill", "#fff").attr("stroke", palette.orange).attr("stroke-width", 2);
    const zx = d3.scaleLinear().domain([focus.x0, focus.x1]).range([detail.x + 16, detail.x + detail.w - 16]);
    const zy = d3.scaleLinear().domain([focus.y0, focus.y1]).range([detail.y + 18, detail.y + detail.h - 18]);
    const detailDots = svg.append("g").selectAll("circle").data(points.filter(d => d.selected)).join("circle")
      .attr("cx", d => zx(d.x)).attr("cy", d => zy(d.y)).attr("fill", palette.orange).attr("stroke", "#fff").attr("stroke-width", 1.2);
    grow(detailDots, "r", 1, 7, .3, .55);
    const connectors = [
      [[focus.x1, focus.y0], [detail.x, detail.y]],
      [[focus.x1, focus.y1], [detail.x, detail.y + detail.h]]
    ];
    const lines = svg.append("g").selectAll("line").data(connectors).join("line")
      .attr("x1", d => d[0][0]).attr("y1", d => d[0][1]).attr("x2", d => d[1][0]).attr("y2", d => d[1][1])
      .attr("stroke", palette.orange).attr("stroke-width", 1.6).attr("stroke-dasharray", "4 5");
    fadeIn(lines, .35, .45);
    svg.append("text").attr("class", "mark-label").attr("x", detail.x + detail.w / 2).attr("y", detail.y + detail.h + 24).attr("text-anchor", "middle").text("magnified");
  }

  function renderDifferenceChart() {
    const svg = prepareSvg("difference-chart", "Difference chart", "Area between two time series highlights over and under performance.");
    const data = d3.range(16).map(i => ({
      t: i,
      plan: 54 + Math.sin(i / 2.2) * 8 + i * 1.2,
      actual: 52 + Math.cos(i / 2.4) * 10 + i * 1.55 + Math.sin(i * .9) * 5
    }));
    const margin = { top: 36, right: 36, bottom: 52, left: 56 };
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([35, 90]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const area = d3.area().x(d => x(d.t)).y0(d => y(d.plan)).y1(d => y(d.actual)).curve(d3.curveMonotoneX);
    const band = svg.append("path").datum(data).attr("d", area).attr("fill", palette.green).attr("fill-opacity", .22);
    fadeIn(band, .1, .6);
    const line = key => d3.line().x(d => x(d.t)).y(d => y(d[key])).curve(d3.curveMonotoneX);
    const plan = svg.append("path").datum(data).attr("d", line("plan")).attr("fill", "none").attr("stroke", palette.muted).attr("stroke-width", 2.3).attr("stroke-dasharray", "5 5");
    const actual = svg.append("path").datum(data).attr("d", line("actual")).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 3);
    drawPath(plan, .08, .9);
    drawPath(actual, .15, .95);
    const end = data.at(-1);
    svg.append("text").attr("class", "mark-label").attr("x", x(end.t) - 4).attr("y", y(end.actual) - 10).attr("text-anchor", "end").text("actual");
    svg.append("text").attr("class", "mark-label").attr("x", x(end.t) - 4).attr("y", y(end.plan) + 18).attr("text-anchor", "end").text("plan");
  }

  function renderHierarchicalBars() {
    const svg = prepareSvg("hierarchical-bars", "Hierarchical bars", "A hierarchy is shown as indented bars with parent totals and child shares.");
    const root = d3.hierarchy({
      name: "Portfolio",
      children: [
        { name: "Core", children: [{ name: "API", value: 34 }, { name: "Auth", value: 22 }, { name: "Search", value: 29 }] },
        { name: "Growth", children: [{ name: "Assist", value: 27 }, { name: "Agents", value: 31 }, { name: "Eval", value: 18 }] },
        { name: "Ops", children: [{ name: "Billing", value: 19 }, { name: "Support", value: 24 }] }
      ]
    }).sum(d => d.value || 0);
    const rows = root.descendants().slice(1);
    const x = d3.scaleLinear().domain([0, d3.max(rows, d => d.value)]).range([0, 332]);
    const y = d3.scaleBand().domain(rows.map((d, i) => `${d.depth}-${d.data.name}-${i}`)).range([58, 344]).padding(.18);
    const row = svg.append("g").selectAll("g").data(rows).join("g")
      .attr("transform", (d, i) => `translate(${74 + (d.depth - 1) * 34},${y(`${d.depth}-${d.data.name}-${i}`)})`);
    row.append("text")
      .attr("class", d => d.children ? "mark-label" : "label")
      .attr("x", -12)
      .attr("y", y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text(d => d.data.name);
    const bars = row.append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.value))
      .attr("rx", 5)
      .attr("fill", d => d.children ? palette.blue : palette.cyan)
      .attr("fill-opacity", d => d.children ? .82 : .58);
    bars.each(function (d, i) {
      d3.select(this).append("animate")
        .attr("attributeName", "width")
        .attr("from", 0)
        .attr("to", x(d.value))
        .attr("dur", ".7s")
        .attr("begin", `${i * .05}s`)
        .attr("fill", "freeze");
    });
    row.append("text")
      .attr("class", "mark-label")
      .attr("x", d => x(d.value) + 8)
      .attr("y", y.bandwidth() / 2 + 4)
      .text(d => d.value);
  }

  function renderStackedGroupedBars() {
    const svg = prepareSvg("stacked-grouped-bars", "Stacked to grouped bars", "Bars move from stacked composition into grouped category comparison.");
    const keys = ["Core", "Growth", "Ops"];
    const data = [
      { quarter: "Q1", Core: 32, Growth: 18, Ops: 12 },
      { quarter: "Q2", Core: 29, Growth: 25, Ops: 15 },
      { quarter: "Q3", Core: 36, Growth: 31, Ops: 19 },
      { quarter: "Q4", Core: 41, Growth: 34, Ops: 22 }
    ];
    const margin = { top: 42, right: 28, bottom: 52, left: 52 };
    const x0 = d3.scaleBand().domain(data.map(d => d.quarter)).range([margin.left, width - margin.right]).padding(.22);
    const x1 = d3.scaleBand().domain(keys).range([0, x0.bandwidth()]).padding(.08);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d3.sum(keys, key => d[key]))]).nice().range([height - margin.bottom, margin.top]);
    axisBottom(svg, x0, height - margin.bottom, 4);
    axisLeft(svg, y, margin.left, 4);
    const stacked = d3.stack().keys(keys)(data);
    const marks = stacked.flatMap(series => series.map((d, i) => ({
      key: series.key,
      quarter: data[i].quarter,
      value: data[i][series.key],
      stack0: d[0],
      stack1: d[1]
    })));
    const rects = svg.append("g").selectAll("rect").data(marks).join("rect")
      .attr("x", d => x0(d.quarter) + x1(d.key))
      .attr("y", d => y(d.value))
      .attr("width", x1.bandwidth())
      .attr("height", d => y(0) - y(d.value))
      .attr("fill", d => colors[keys.indexOf(d.key)])
      .attr("rx", 3);
    rects.append("animate").attr("attributeName", "x").attr("from", d => x0(d.quarter)).attr("to", d => x0(d.quarter) + x1(d.key)).attr("dur", "1s").attr("fill", "freeze");
    rects.append("animate").attr("attributeName", "width").attr("from", x0.bandwidth()).attr("to", x1.bandwidth()).attr("dur", "1s").attr("fill", "freeze");
    rects.append("animate").attr("attributeName", "y").attr("from", d => y(d.stack1)).attr("to", d => y(d.value)).attr("dur", "1s").attr("fill", "freeze");
    rects.append("animate").attr("attributeName", "height").attr("from", d => y(d.stack0) - y(d.stack1)).attr("to", d => y(0) - y(d.value)).attr("dur", "1s").attr("fill", "freeze");
    const legend = svg.append("g").attr("transform", "translate(70,24)").selectAll("g").data(keys).join("g")
      .attr("transform", (d, i) => `translate(${i * 94},0)`);
    legend.append("rect").attr("x", 0).attr("y", -9).attr("width", 13).attr("height", 13).attr("rx", 2).attr("fill", (d, i) => colors[i]);
    legend.append("text").attr("class", "mark-label").attr("x", 18).attr("y", 2).text(d => d);
  }

  function renderSmoothZoom() {
    const svg = prepareSvg("smooth-zoom", "Smooth zoom", "A focus window eases from overview bounds into a magnified region.");
    const plot = { x: 48, y: 48, w: 464, h: 296 };
    const target = { x: 202, y: 132, w: 104, h: 78 };
    const points = d3.range(64).map(i => ({
      x: plot.x + 18 + (i * 71) % (plot.w - 36) + Math.sin(i * .9) * 9,
      y: plot.y + 20 + (i * 43) % (plot.h - 40) + Math.cos(i * .8) * 10,
      group: i % 4
    }));
    points.forEach(d => {
      d.focus = d.x >= target.x && d.x <= target.x + target.w && d.y >= target.y && d.y <= target.y + target.h;
    });
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.focus ? palette.orange : colors[d.group]).attr("fill-opacity", d => d.focus ? .9 : .36).attr("stroke", "#fff");
    grow(dots, "r", 1, d => d.focus ? 6 : 4, .04, .5);
    const view = svg.append("rect")
      .attr("x", 136).attr("y", 74).attr("width", 286).attr("height", 216).attr("rx", 8)
      .attr("fill", palette.orangeHighlight).attr("fill-opacity", .48).attr("stroke", palette.orange).attr("stroke-width", 2.6);
    view.append("animate").attr("attributeName", "x").attr("from", target.x).attr("to", 136).attr("dur", "1s").attr("fill", "freeze");
    view.append("animate").attr("attributeName", "y").attr("from", target.y).attr("to", 74).attr("dur", "1s").attr("fill", "freeze");
    view.append("animate").attr("attributeName", "width").attr("from", target.w).attr("to", 286).attr("dur", "1s").attr("fill", "freeze");
    view.append("animate").attr("attributeName", "height").attr("from", target.h).attr("to", 216).attr("dur", "1s").attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", 278).attr("y", 322).attr("text-anchor", "middle").text("overview -> focus");
  }

  function renderProjectionSwitch() {
    const svg = prepareSvg("projection-switch", "Projection switch", "The same coordinates shift from orthographic globe to flat projection.");
    const points = [
      ["SEA", -122, 47], ["SFO", -122, 38], ["MEX", -99, 19], ["NYC", -74, 41],
      ["RIO", -43, -23], ["LON", 0, 51], ["CAI", 31, 30], ["DEL", 77, 29], ["TKY", 139, 36]
    ].map(([id, lon, lat], i) => ({ id, lon, lat, i }));
    const globe = d3.geoOrthographic().rotate([35, -10]).scale(105).translate([165, 179]);
    const flat = d3.geoEquirectangular().fitExtent([[320, 82], [522, 282]], { type: "Sphere" });
    const globePoint = d => globe([d.lon, d.lat]) || [165, 179];
    svg.append("circle").attr("cx", 165).attr("cy", 179).attr("r", 105).attr("fill", palette.blueHighlight).attr("fill-opacity", .28).attr("stroke", palette.gray200);
    svg.append("rect").attr("x", 320).attr("y", 82).attr("width", 202).attr("height", 200).attr("rx", 5).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    const lines = d3.geoGraticule().step([45, 30]).lines();
    const globePath = d3.geoPath(globe);
    const flatPath = d3.geoPath(flat);
    svg.append("g").selectAll("path").data(lines).join("path").attr("d", globePath).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    svg.append("g").selectAll("path").data(lines).join("path").attr("d", flatPath).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle")
      .attr("cx", d => flat([d.lon, d.lat])[0]).attr("cy", d => flat([d.lon, d.lat])[1])
      .attr("r", 5.5).attr("fill", d => colors[d.i % colors.length]).attr("stroke", "#fff").attr("stroke-width", 1.2);
    dots.append("animate").attr("attributeName", "cx").attr("from", d => globePoint(d)[0]).attr("to", d => flat([d.lon, d.lat])[0]).attr("dur", "1.1s").attr("fill", "freeze");
    dots.append("animate").attr("attributeName", "cy").attr("from", d => globePoint(d)[1]).attr("to", d => flat([d.lon, d.lat])[1]).attr("dur", "1.1s").attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", 165).attr("y", 322).attr("text-anchor", "middle").text("orthographic");
    svg.append("text").attr("class", "mark-label").attr("x", 421).attr("y", 322).attr("text-anchor", "middle").text("equirectangular");
  }

  function renderWorldTour() {
    const svg = prepareSvg("world-tour", "World tour", "Great-circle route segments move through a projected globe.");
    const projection = d3.geoOrthographic().rotate([78, -16]).scale(156).translate([width / 2, height / 2 + 8]);
    const path = d3.geoPath(projection);
    const cities = [
      { name: "SF", coord: [-122, 38] }, { name: "NY", coord: [-74, 41] }, { name: "LDN", coord: [0, 51] },
      { name: "CAI", coord: [31, 30] }, { name: "DEL", coord: [77, 29] }, { name: "TKY", coord: [139, 36] }
    ];
    const route = d3.pairs(cities).flatMap(([a, b]) => d3.range(24).map(i => d3.geoInterpolate(a.coord, b.coord)(i / 24)));
    route.push(cities.at(-1).coord);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("fill-opacity", .26).attr("stroke", palette.gray200);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    const routePath = svg.append("path").datum({ type: "LineString", coordinates: route })
      .attr("id", "world-tour-route")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(routePath, .12, 1.35);
    const stops = svg.append("g").selectAll("g").data(cities).join("g").attr("transform", d => `translate(${projection(d.coord) || [width / 2, height / 2 + 8]})`);
    stops.append("circle").attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.2);
    grow(stops.selectAll("circle"), "r", 2, 6, .2, .5);
    stops.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", -10).text(d => d.name);
    const token = svg.append("circle").attr("r", 6).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.5);
    token.append("animateMotion").attr("dur", "3s").attr("repeatCount", "indefinite").attr("rotate", "auto").append("mpath").attr("href", "#world-tour-route");
  }

  function renderMovingAverage() {
    const svg = prepareSvg("moving-average", "Moving average", "A rolling mean separates a smoother trend from noisy observations.");
    const data = d3.range(32).map(i => ({ t: i, y: 44 + Math.sin(i / 2.4) * 13 + Math.cos(i * .85) * 7 + i * .8 }));
    const smooth = data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 2), Math.min(data.length, i + 3));
      return { t: d.t, y: d3.mean(window, item => item.y) };
    });
    const margin = { top: 34, right: 34, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([25, 88]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    const noisy = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-width", 2);
    const avg = svg.append("path").datum(smooth).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3.3);
    drawPath(noisy, .05, .8);
    drawPath(avg, .35, 1);
    const dots = svg.append("g").selectAll("circle").data(data.filter((_, i) => i % 3 === 0)).join("circle")
      .attr("cx", d => x(d.t)).attr("cy", d => y(d.y)).attr("fill", palette.orange).attr("stroke", "#fff");
    grow(dots, "r", 1, 4, .18, .45);
  }

  function renderBollingerBands() {
    const svg = prepareSvg("bollinger-bands", "Bollinger bands", "Rolling volatility wraps a price series in upper and lower bands.");
    const data = d3.range(34).map(i => ({ t: i, price: 58 + Math.sin(i / 3) * 8 + Math.cos(i * .7) * 5 + i * .6 }));
    const bands = data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 4), i + 1);
      const mean = d3.mean(window, item => item.price);
      const dev = Math.sqrt(d3.mean(window, item => (item.price - mean) ** 2)) || 3;
      return { t: d.t, price: d.price, mid: mean, hi: mean + dev * 1.8, lo: mean - dev * 1.8 };
    });
    const margin = { top: 34, right: 34, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain(d3.extent(bands, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([40, 92]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const area = d3.area().x(d => x(d.t)).y0(d => y(d.lo)).y1(d => y(d.hi)).curve(d3.curveMonotoneX);
    const band = svg.append("path").datum(bands).attr("d", area).attr("fill", palette.blueHighlight).attr("fill-opacity", .72);
    fadeIn(band, .12, .6);
    const line = key => d3.line().x(d => x(d.t)).y(d => y(d[key])).curve(d3.curveMonotoneX);
    const price = svg.append("path").datum(bands).attr("d", line("price")).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2.7);
    const mid = svg.append("path").datum(bands).attr("d", line("mid")).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 2).attr("stroke-dasharray", "5 4");
    drawPath(price, .1, .9);
    drawPath(mid, .25, .8);
  }

  function renderQqPlot() {
    const svg = prepareSvg("qq-plot", "Q-Q plot", "Sample quantiles are compared against a theoretical reference line.");
    const theoretical = [-2.05, -1.55, -1.2, -.94, -.72, -.53, -.34, -.17, 0, .17, .34, .53, .72, .94, 1.2, 1.55, 2.05];
    const sample = theoretical.map((q, i) => ({ q, value: q * 1.12 + Math.sin(i * .8) * .32 + (i > 12 ? .3 : 0) }));
    const margin = { top: 40, right: 40, bottom: 56, left: 58 };
    const x = d3.scaleLinear().domain([-2.3, 2.3]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([-2.6, 2.8]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const ref = svg.append("line").attr("x1", x(-2.2)).attr("x2", x(2.2)).attr("y1", y(-2.2)).attr("y2", y(2.2)).attr("stroke", palette.gray400).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    fadeIn(ref, .05, .5);
    const dots = svg.append("g").selectAll("circle").data(sample).join("circle")
      .attr("cx", d => x(d.q)).attr("cy", d => y(d.value)).attr("fill", d => Math.abs(d.value - d.q) > .42 ? palette.red : palette.blue).attr("stroke", "#fff");
    grow(dots, "r", 1, 6, .08, .55);
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", width - 46).attr("y", 34).attr("text-anchor", "end").text("tail deviation");
  }

  function renderScatterplotMatrix() {
    const svg = prepareSvg("scatterplot-matrix", "Scatterplot matrix", "Pairwise relationships are repeated across a compact grid.");
    const vars = ["speed", "load", "latency"];
    const data = d3.range(30).map(i => ({
      speed: 20 + (i * 17) % 78,
      load: 25 + (i * 29 + Math.sin(i) * 8) % 70,
      latency: 18 + (i * 11 + Math.cos(i * .7) * 18) % 76,
      group: i % 3
    }));
    const size = 104;
    const gap = 16;
    const startX = 112;
    const startY = 60;
    const scales = new Map(vars.map(v => [v, d3.scaleLinear().domain(d3.extent(data, d => d[v])).nice().range([14, size - 14])]));
    const panels = svg.append("g").selectAll("g").data(vars.flatMap((yVar, yi) => vars.map((xVar, xi) => ({ xVar, yVar, xi, yi })))).join("g")
      .attr("transform", d => `translate(${startX + d.xi * (size + gap)},${startY + d.yi * (size + gap)})`);
    panels.append("rect").attr("width", size).attr("height", size).attr("rx", 5).attr("fill", d => d.xi === d.yi ? palette.gray100 : palette.gray50).attr("stroke", palette.gray200);
    panels.filter(d => d.xi === d.yi).append("text").attr("class", "mark-label").attr("x", size / 2).attr("y", size / 2 + 4).attr("text-anchor", "middle").text(d => d.xVar);
    const offDiagonal = panels.filter(d => d.xi !== d.yi);
    const dots = offDiagonal.selectAll("circle").data(d => data.map(row => ({ row, xVar: d.xVar, yVar: d.yVar }))).join("circle")
      .attr("cx", d => scales.get(d.xVar)(d.row[d.xVar]))
      .attr("cy", d => size - scales.get(d.yVar)(d.row[d.yVar]))
      .attr("fill", d => colors[d.row.group])
      .attr("fill-opacity", .7)
      .attr("stroke", "#fff")
      .attr("stroke-width", .8);
    grow(dots, "r", 1, 3.4, .02, .45);
  }

  function renderVariableColorLine() {
    const svg = prepareSvg("variable-color-line", "Variable color line", "A line changes segment color when values cross thresholds.");
    const data = d3.range(24).map(i => ({ t: i, y: 48 + Math.sin(i / 2) * 18 + Math.cos(i * .85) * 8 + i * .7 }));
    const margin = { top: 34, right: 34, bottom: 48, left: 54 };
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([25, 90]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const threshold = 58;
    svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(threshold)).attr("y2", y(threshold)).attr("stroke", palette.gray600).attr("stroke-dasharray", "4 5");
    const segments = d3.pairs(data);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    const paths = svg.append("g").selectAll("path").data(segments).join("path")
      .attr("d", d => line(d))
      .attr("fill", "none")
      .attr("stroke", d => d3.mean(d, p => p.y) >= threshold ? palette.red : palette.blue)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round");
    drawPath(paths, .03, .55);
    svg.append("text").attr("class", "mark-label").attr("x", width - 38).attr("y", y(threshold) - 8).attr("text-anchor", "end").text("threshold");
  }

  function renderMareyTrains() {
    const svg = prepareSvg("marey-trains", "Marey trains", "Space-time trajectories show scheduled movement between stops.");
    const stations = ["North", "Civic", "Market", "Harbor", "South"];
    const services = d3.range(7).map(i => ({
      id: `T${i + 1}`,
      start: 6 + i * 1.15,
      speed: .82 + (i % 3) * .08,
      color: colors[i % colors.length]
    }));
    const latestArrival = d3.max(services, service => service.start + (stations.length - 1) * service.speed);
    const x = d3.scaleLinear().domain([6, Math.ceil(latestArrival * 2) / 2]).range([70, width - 42]);
    const y = d3.scalePoint().domain(stations).range([72, 318]);
    axisBottom(svg, x, 350, 5);
    svg.append("g").selectAll("text").data(stations).join("text")
      .attr("class", "mark-label").attr("x", 58).attr("y", d => y(d) + 4).attr("text-anchor", "end").text(d => d);
    stations.forEach(station => svg.append("line").attr("x1", x(6)).attr("x2", x(15)).attr("y1", y(station)).attr("y2", y(station)).attr("stroke", palette.gray100));
    const line = d3.line().x(d => x(d.time)).y(d => y(d.station));
    const paths = svg.append("g").selectAll("path").data(services).join("path")
      .attr("d", service => line(stations.map((station, si) => ({ station, time: service.start + si * service.speed }))))
      .attr("fill", "none").attr("stroke", d => d.color).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    drawPath(paths, .08, 1);
  }

  function renderRadialStackedBars() {
    const svg = prepareSvg("radial-stacked-bars", "Radial stacked bars", "Stacked values wrap around a circular categorical axis.");
    const categories = ["North", "East", "South", "West", "Core", "Labs"];
    const keys = ["A", "B", "C"];
    const data = categories.map((name, i) => ({ name, A: 12 + i * 2, B: 8 + (i * 5) % 14, C: 7 + (i * 7) % 13 }));
    const stack = d3.stack().keys(keys)(data);
    const angle = d3.scaleBand().domain(categories).range([0, Math.PI * 2]).padding(.16);
    const radius = d3.scaleLinear().domain([0, d3.max(data, d => d.A + d.B + d.C)]).range([58, 170]);
    const arc = d3.arc()
      .innerRadius(d => radius(d[0]))
      .outerRadius(d => radius(d[1]))
      .startAngle(d => angle(d.data.name))
      .endAngle(d => angle(d.data.name) + angle.bandwidth())
      .padAngle(.01)
      .padRadius(58);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 12})`);
    const arcs = center.append("g").selectAll("path").data(stack.flatMap((series, si) => series.map(d => ({ ...d, key: series.key, si })))).join("path")
      .attr("d", arc)
      .attr("fill", d => colors[d.si])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
    fadeIn(arcs, .03, .55);
    categories.forEach(name => {
      const a = angle(name) + angle.bandwidth() / 2 - Math.PI / 2;
      center.append("text").attr("class", "mark-label").attr("x", Math.cos(a) * 188).attr("y", Math.sin(a) * 188).attr("text-anchor", "middle").attr("dy", 4).text(name);
    });
    const legend = svg.append("g").attr("transform", "translate(56,36)").selectAll("g").data(keys).join("g")
      .attr("transform", (d, i) => `translate(${i * 54},0)`);
    legend.append("rect").attr("x", 0).attr("y", -9).attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", (d, i) => colors[i]);
    legend.append("text").attr("class", "mark-label").attr("x", 17).attr("y", 2).text(d => d);
  }

  function renderBivariateChoropleth() {
    const svg = prepareSvg("bivariate-choropleth", "Bivariate choropleth", "Two regional metrics combine into a compact color matrix.");
    svg.attr("data-map-context", "schematic-regions").attr("data-metric-a-domain", "0-2").attr("data-metric-b-domain", "0-2");
    const palette2 = ramps.bivariate;
    const regions = d3.range(18).map(i => ({
      x: 86 + (i % 6) * 56 + ((i % 2) * 8),
      y: 72 + Math.floor(i / 6) * 74,
      a: i % 3,
      b: Math.floor((i * 5) % 9 / 3),
      label: String.fromCharCode(65 + i)
    }));
    svg.append("path")
      .attr("d", "M68,70C128,48 222,52 286,68C360,86 430,70 470,112L454,286C382,326 292,314 224,328C154,340 92,308 72,248Z")
      .attr("fill", palette.gray50).attr("stroke", palette.gray300).attr("stroke-width", 1.4);
    const cells = svg.append("g").selectAll("path").data(regions).join("path")
      .attr("data-region", d => d.label)
      .attr("data-metric-a", d => d.a)
      .attr("data-metric-b", d => d.b)
      .attr("d", d => {
        const pts = [[d.x, d.y], [d.x + 44, d.y + 8], [d.x + 38, d.y + 48], [d.x - 8, d.y + 42]];
        return `${d3.line()(pts)}Z`;
      })
      .attr("fill", d => palette2[d.b][d.a])
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);
    fadeIn(cells, .04, .55);
    svg.append("g").selectAll("text").data(regions).join("text")
      .attr("class", "mark-label").attr("x", d => d.x + 18).attr("y", d => d.y + 28).attr("text-anchor", "middle").text(d => d.label);
    const key = svg.append("g").attr("transform", "translate(410,246)");
    d3.range(9).forEach(i => {
      const a = i % 3, b = Math.floor(i / 3);
      key.append("rect").attr("x", a * 24).attr("y", (2 - b) * 24).attr("width", 22).attr("height", 22).attr("fill", palette2[b][a]).attr("stroke", "#fff");
    });
    key.append("text").attr("class", "label").attr("x", 36).attr("y", 88).attr("text-anchor", "middle").text("A low -> high");
    key.append("text").attr("class", "caption").attr("x", 36).attr("y", -8).attr("text-anchor", "middle").text("B high");
  }

  function renderProjectionComparison() {
    const svg = prepareSvg("projection-comparison", "Projection comparison", "The same graticule and route expose projection distortion.");
    const sphere = { type: "Sphere" };
    const boundedWorld = { type: "Polygon", coordinates: [[[-180, -80], [180, -80], [180, 80], [-180, 80], [-180, -80]]] };
    const graticule = d3.geoGraticule().step([30, 30]).lines();
    const route = { type: "LineString", coordinates: [[-120, 35], [-60, 50], [0, 20], [72, 30], [135, -15]] };
    const projections = [
      { name: "Mercator", p: d3.geoMercator().fitExtent([[54, 76], [248, 292]], boundedWorld), x: 44, clipId: "projection-comparison-mercator", outline: boundedWorld },
      { name: "Natural Earth", p: d3.geoNaturalEarth1().fitExtent([[312, 76], [508, 292]], sphere), x: 302, clipId: "projection-comparison-natural", outline: sphere }
    ];
    projections.forEach((item, pi) => {
      const path = d3.geoPath(item.p);
      svg.append("clipPath").attr("id", item.clipId).append("rect").attr("x", item.x).attr("y", 66).attr("width", 216).attr("height", 236).attr("rx", 6);
      svg.append("rect").attr("x", item.x).attr("y", 66).attr("width", 216).attr("height", 236).attr("rx", 6).attr("fill", palette.gray50).attr("stroke", palette.gray200);
      const panel = svg.append("g").attr("clip-path", `url(#${item.clipId})`);
      panel.append("path").datum(item.outline).attr("d", path).attr("fill", palette.blueHighlight).attr("fill-opacity", .18).attr("stroke", palette.gray300);
      appendSchematicLand(panel, path, palette.surface);
      panel.append("g").selectAll("path").data(graticule).join("path").attr("d", path).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
      const routePath = panel.append("path").datum(route).attr("d", path).attr("fill", "none").attr("stroke", colors[pi]).attr("stroke-width", 3.2);
      drawPath(routePath, .12, .85);
      svg.append("text").attr("class", "mark-label").attr("x", item.x + 108).attr("y", 334).attr("text-anchor", "middle").text(item.name);
    });
  }

  function renderTissotIndicatrix() {
    const svg = prepareSvg("tissot-indicatrix", "Tissot indicatrix", "Equal angular circles reveal projection distortion across the map.");
    const projection = d3.geoNaturalEarth1().fitExtent([[44, 48], [516, 340]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.gray50).attr("stroke", palette.gray200);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path").attr("d", path).attr("fill", "none").attr("stroke", palette.gray100).attr("stroke-width", .8);
    const circles = [];
    [-120, -60, 0, 60, 120].forEach(lon => [-50, 0, 50].forEach(lat => circles.push(d3.geoCircle().center([lon, lat]).radius(8)())));
    const marks = svg.append("g").selectAll("path").data(circles).join("path")
      .attr("d", path).attr("fill", palette.orangeHighlight).attr("fill-opacity", .45).attr("stroke", palette.orange).attr("stroke-width", 2);
    fadeIn(marks, .06, .55);
  }

  function renderVectorField() {
    const svg = prepareSvg("vector-field", "Vector field", "Direction and magnitude are encoded with small arrows on a grid.");
    const x = d3.scaleLinear().domain([0, 6]).range([78, width - 70]);
    const y = d3.scaleLinear().domain([0, 4]).range([320, 78]);
    const data = d3.range(7).flatMap(i => d3.range(5).map(j => {
      const angle = Math.sin(i * .8) + Math.cos(j * .9);
      const mag = .55 + Math.abs(Math.sin(i + j * .7)) * .45;
      return { i, j, angle, mag };
    }));
    const color = quantizedRamp([.55, 1], [palette.gold, palette.orange, palette.red]);
    d3.range(7).forEach(i => svg.append("line").attr("x1", x(i)).attr("x2", x(i)).attr("y1", y(0)).attr("y2", y(4)).attr("stroke", palette.gray100));
    d3.range(5).forEach(j => svg.append("line").attr("x1", x(0)).attr("x2", x(6)).attr("y1", y(j)).attr("y2", y(j)).attr("stroke", palette.gray100));
    const arrows = svg.append("g").selectAll("g").data(data).join("g").attr("transform", d => `translate(${x(d.i)},${y(d.j)}) rotate(${d.angle * 48})`);
    arrows.append("line").attr("x1", -11).attr("x2", d => 18 * d.mag).attr("y1", 0).attr("y2", 0).attr("stroke", d => color(d.mag)).attr("stroke-width", 2.6).attr("stroke-linecap", "round");
    arrows.append("path").attr("d", d3.symbol().type(d3.symbolTriangle).size(42)).attr("transform", d => `translate(${18 * d.mag},0) rotate(90)`).attr("fill", d => color(d.mag));
    fadeIn(arrows, .025, .55);
  }

  function renderSolarTerminator() {
    const timestamp = new Date("2026-06-21T12:00:00Z");
    const year = timestamp.getUTCFullYear();
    const dayOfYear = Math.floor((Date.UTC(year, timestamp.getUTCMonth(), timestamp.getUTCDate()) - Date.UTC(year, 0, 0)) / 86400000);
    const daysInYear = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365;
    const utcHour = timestamp.getUTCHours() + timestamp.getUTCMinutes() / 60 + timestamp.getUTCSeconds() / 3600;
    const gamma = 2 * Math.PI / daysInYear * (dayOfYear - 1 + (utcHour - 12) / 24);
    const equationOfTime = 229.18 * (
      .000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma)
      - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma)
    );
    const declination = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma)
      - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma)
      - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
    const normalizeLongitude = value => ((value + 540) % 360) - 180;
    const subsolar = {
      lon: normalizeLongitude((720 - utcHour * 60 - equationOfTime) / 4),
      lat: declination * 180 / Math.PI
    };
    const svg = prepareSvg("solar-terminator", "Solar terminator", "An astronomical day-night boundary is derived consistently from a fixed UTC timestamp using the NOAA fractional-year approximation.");
    const projection = d3.geoEquirectangular().fitExtent([[48, 58], [512, 324]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg
      .attr("data-timestamp", timestamp.toISOString())
      .attr("data-astronomy-model", "noaa-fractional-year")
      .attr("data-equation-of-time-minutes", equationOfTime.toFixed(3))
      .attr("data-subsolar-longitude", subsolar.lon.toFixed(3))
      .attr("data-subsolar-declination", subsolar.lat.toFixed(3));
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("stroke", palette.gray300);
    appendSchematicLand(svg, path, palette.surface);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .7);
    const boundary = d3.range(-180, 181, 2).map(lon => {
      const hourAngle = (lon - subsolar.lon) * Math.PI / 180;
      const declination = subsolar.lat * Math.PI / 180;
      const lat = Math.atan(-Math.cos(hourAngle) / Math.tan(declination)) * 180 / Math.PI;
      return [lon, lat];
    });
    const night = { type: "Polygon", coordinates: [[[-180, -90], [180, -90], ...boundary.slice().reverse(), [-180, -90]]] };
    const nightPath = svg.append("path").datum(night).attr("d", path).attr("fill", palette.ink).attr("fill-opacity", .38);
    fadeIn(nightPath, .12, .55);
    const line = svg.append("path").datum({ type: "LineString", coordinates: boundary }).attr("d", path).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 3.5);
    drawPath(line, .15, 1);
    const sun = projection([subsolar.lon, subsolar.lat]);
    svg.append("circle").attr("cx", sun[0]).attr("cy", sun[1]).attr("r", 10).attr("fill", palette.gold).attr("stroke", palette.yellowHover).attr("stroke-width", 2);
    svg.append("text").attr("class", "mark-label").attr("x", sun[0] + 14).attr("y", sun[1] - 12).text("subsolar point");
    const longitudeLabel = `${Math.abs(subsolar.lon).toFixed(2)}°${subsolar.lon >= 0 ? "E" : "W"}`;
    svg.append("text")
      .attr("class", "caption")
      .attr("x", 48)
      .attr("y", 354)
      .attr("font-size", 10.5)
      .attr("font-weight", 760)
      .text(`2026-06-21 12:00 UTC · subsolar ${longitudeLabel} · declination ${subsolar.lat.toFixed(2)}°N`);
  }

  function renderStarMap() {
    const svg = prepareSvg("star-map", "Star map", "Spherical sky coordinates become a radial chart of visible stars.");
    const center = [width / 2, height / 2 + 10];
    const radius = 158;
    svg.append("circle").attr("cx", center[0]).attr("cy", center[1]).attr("r", radius).attr("fill", palette.gray900).attr("stroke", palette.gray700).attr("stroke-width", 2);
    d3.range(1, 4).forEach(i => svg.append("circle").attr("cx", center[0]).attr("cy", center[1]).attr("r", radius * i / 4).attr("fill", "none").attr("stroke", palette.gray700).attr("stroke-opacity", .8));
    const stars = d3.range(58).map(i => {
      const angle = i * 2.399;
      const r = 18 + ((i * 37) % 134);
      return { x: center[0] + Math.cos(angle) * r, y: center[1] + Math.sin(angle) * r, mag: .35 + ((i * 17) % 65) / 100 };
    });
    const dots = svg.append("g").selectAll("circle").data(stars).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.mag > .8 ? palette.yellowHighlight : palette.surface);
    grow(dots, "r", .7, d => 1.4 + d.mag * 3.6, .03, .55);
    const constellation = [stars[4], stars[11], stars[18], stars[31], stars[44]];
    const path = svg.append("path").datum(constellation).attr("d", d3.line().x(d => d.x).y(d => d.y)).attr("fill", "none").attr("stroke", palette.gold).attr("stroke-width", 2.4).attr("stroke-opacity", .9);
    drawPath(path, .35, .8);
  }

  function renderPolarClock() {
    const svg = prepareSvg("polar-clock", "Polar clock", "Nested arcs encode cyclic units as radial progress.");
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const units = [
      { label: "month", value: .83, color: palette.blue },
      { label: "week", value: .64, color: palette.green },
      { label: "day", value: .42, color: palette.orange },
      { label: "hour", value: .76, color: palette.purple }
    ];
    const arc = d3.arc().startAngle(0).cornerRadius(8);
    units.forEach((unit, i) => {
      const outer = 160 - i * 30;
      const inner = outer - 18;
      center.append("path").attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: Math.PI * 2 })).attr("fill", palette.gray100);
      const mark = center.append("path").attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: Math.PI * 2 * unit.value })).attr("fill", unit.color);
      fadeIn(mark, .12 + i * .08, .55);
      center.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -outer + 13).attr("text-anchor", "middle").text(unit.label);
    });
  }

  function renderMoonPhases() {
    const svg = prepareSvg("moon-phases", "Moon phases", "Projected terminators show a simplified waxing lunar illumination cycle.");
    const phases = d3.range(8).map(i => ({ i, phase: i / 7 }));
    const moonRadius = 34;
    const illuminatedPath = phase => {
      if (phase <= 0) return null;
      const terminatorRadius = moonRadius * Math.abs(1 - 2 * phase);
      const terminator = terminatorRadius < .001
        ? `L0,${-moonRadius}`
        : `A${terminatorRadius},${moonRadius} 0 0 ${phase < .5 ? 0 : 1} 0,${-moonRadius}`;
      return `M0,${-moonRadius}A${moonRadius},${moonRadius} 0 0 1 0,${moonRadius}${terminator}Z`;
    };
    const groups = svg.append("g").selectAll("g").data(phases).join("g")
      .attr("data-phase-index", d => d.i)
      .attr("data-illumination-fraction", d => d3.format(".3f")(d.phase))
      .attr("data-phase-direction", "waxing")
      .attr("transform", d => `translate(${74 + (d.i % 4) * 136},${128 + Math.floor(d.i / 4) * 128})`);
    groups.append("circle").attr("r", moonRadius).attr("fill", palette.gray900);
    groups.append("path")
      .attr("data-lit-hemisphere", "right")
      .attr("data-terminator-radius", d => d3.format(".3f")(moonRadius * Math.abs(1 - 2 * d.phase)))
      .attr("d", d => illuminatedPath(d.phase))
      .attr("fill", palette.yellowHighlight);
    groups.append("circle").attr("r", moonRadius).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", 2);
    fadeIn(groups, .08, .65);
    groups.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 56).text(d => `${Math.round(d.phase * 100)}%`);
  }

  function renderParabolicArcs() {
    const svg = prepareSvg("parabolic-arcs", "Parabolic arcs", "Curved trajectories connect endpoints with arc height encoding.");
    const baseline = 326;
    const x = d3.scalePoint().domain(d3.range(8)).range([70, width - 70]);
    const arcs = [
      { a: 0, b: 5, v: 92, c: palette.blue },
      { a: 1, b: 7, v: 126, c: palette.red },
      { a: 2, b: 4, v: 66, c: palette.green },
      { a: 3, b: 6, v: 104, c: palette.orange },
      { a: 0, b: 2, v: 48, c: palette.purple },
      { a: 5, b: 7, v: 58, c: palette.gold }
    ];
    svg.append("line").attr("x1", 52).attr("x2", width - 52).attr("y1", baseline).attr("y2", baseline).attr("stroke", palette.gray300).attr("stroke-width", 2);
    const paths = svg.append("g").attr("fill", "none").selectAll("path").data(arcs).join("path")
      .attr("d", d => {
        const x0 = x(d.a), x1 = x(d.b), xm = (x0 + x1) / 2;
        return `M${x0},${baseline}Q${xm},${baseline - d.v} ${x1},${baseline}`;
      })
      .attr("stroke", d => d.c).attr("stroke-width", d => 1.8 + d.v / 45).attr("stroke-linecap", "round").attr("opacity", .9);
    drawPath(paths, .08, 1.05);
    const endpoints = d3.range(8).map(i => ({ i, x: x(i) }));
    const dots = svg.append("g").selectAll("circle").data(endpoints).join("circle")
      .attr("cx", d => d.x).attr("cy", baseline).attr("fill", palette.ink).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots, "r", 2, 7, .1, .55);
  }

  function renderBurtinAntibiotics() {
    const svg = prepareSvg("burtin-antibiotics", "Burtin antibiotics", "A radial matrix compares organisms and treatments.");
    const organisms = ["Staph", "Strep", "E.coli", "Kleb", "Sal"];
    const drugs = ["Pen", "Strep", "Neo", "Chlor"];
    const values = [
      [4, 2, 1, 3],
      [3, 4, 1, 2],
      [1, 2, 4, 3],
      [1, 3, 2, 4],
      [2, 1, 3, 4]
    ];
    const cx = width / 2, cy = height / 2 + 14;
    const angle = d3.scaleBand().domain(organisms).range([-.82 * Math.PI, .82 * Math.PI]).padding(.04);
    const ring = d3.scaleBand().domain(drugs).range([42, 154]).padding(.08);
    const color = d3.scaleThreshold().domain([1.5, 2.5, 3.5]).range(["#e7e7e7", "#cdf3ff", "#f1c319", "#9e1b32"]);
    const arc = d3.arc();
    const cells = organisms.flatMap((org, i) => drugs.map((drug, j) => ({ org, drug, value: values[i][j] })));
    const marks = svg.append("g").attr("transform", `translate(${cx},${cy})`).selectAll("path").data(cells).join("path")
      .attr("d", d => arc({
        startAngle: angle(d.org),
        endAngle: angle(d.org) + angle.bandwidth(),
        innerRadius: ring(d.drug),
        outerRadius: ring(d.drug) + ring.bandwidth()
      }))
      .attr("fill", d => color(d.value)).attr("stroke", "#fff").attr("stroke-width", 1.3);
    fadeIn(marks, .06, .65);
    svg.append("g").attr("transform", `translate(${cx},${cy})`).selectAll("text").data(organisms).join("text")
      .attr("class", "mark-label")
      .attr("transform", d => {
        const a = angle(d) + angle.bandwidth() / 2 - Math.PI / 2;
        return `translate(${Math.cos(a) * 176},${Math.sin(a) * 176})`;
      })
      .attr("text-anchor", "middle").text(d => d);
  }

  function renderSizedDonutMultiples() {
    const svg = prepareSvg("sized-donut-multiples", "Sized donut multiples", "Small radial pies compare share and total size together.");
    const data = [
      { name: "North", total: 72, parts: [34, 21, 17] },
      { name: "East", total: 54, parts: [18, 24, 12] },
      { name: "South", total: 82, parts: [31, 16, 35] },
      { name: "West", total: 47, parts: [13, 20, 14] },
      { name: "Core", total: 96, parts: [42, 26, 28] },
      { name: "Lab", total: 62, parts: [24, 12, 26] }
    ];
    const radius = d3.scaleSqrt().domain([40, 100]).range([38, 64]);
    const pie = d3.pie().sort(null).value(d => d.value);
    const arc = d3.arc().innerRadius(d => radius(d.data.parent.total) * .55).outerRadius(d => radius(d.data.parent.total));
    const group = svg.append("g").selectAll("g").data(data).join("g")
      .attr("class", "donut-multiple")
      .attr("data-region", d => d.name)
      .attr("data-total", d => d.total)
      .attr("transform", (d, i) => `translate(${110 + (i % 3) * 170},${128 + Math.floor(i / 3) * 160})`);
    group.each(function (d) {
      const slices = pie(d.parts.map((value, i) => ({ value, i, parent: d })));
      const paths = d3.select(this).selectAll("path").data(slices).join("path")
        .attr("d", arc).attr("fill", s => colors[s.data.i]).attr("stroke", "#fff").attr("stroke-width", 2);
      fadeIn(paths, .06, .55);
    });
    group.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", d => radius(d.total) + 20).text(d => d.name);
    group.append("text").attr("class", "label").attr("text-anchor", "middle").attr("dy", 4).text(d => d.total);
    const legend = svg.append("g").attr("transform", "translate(154,28)");
    const legendItems = legend.selectAll("g").data(["Acquire", "Retain", "Expand"]).join("g").attr("transform", (_, i) => `translate(${i * 100},0)`);
    legendItems.append("rect").attr("width", 12).attr("height", 12).attr("rx", 2).attr("fill", (_, i) => colors[i]);
    legendItems.append("text").attr("class", "caption").attr("x", 18).attr("y", 10).text(d => d);
  }

  function renderColorbrewerSplines() {
    const svg = prepareSvg("colorbrewer-splines", "ColorBrewer splines", "Interpolated spline ribbons show sequential palette movement.");
    const stops = [
      ["#cdf3ff", "#007298", "#004d66"],
      ["#dbffcc", "#45842a", "#294d19"],
      ["#ffe5cc", "#e77204", "#994a00"],
      ["#ffccd5", "#9e1b32", "#6d1222"],
      ["#f9ccff", "#652f6c", "#431f47"]
    ];
    const x = d3.scalePoint().domain(d3.range(7)).range([58, width - 58]);
    const line = d3.line().curve(d3.curveBasis);
    const paths = stops.map((paletteRow, i) => ({
      color: paletteRow[1],
      points: d3.range(7).map(j => [x(j), 74 + i * 58 + Math.sin(j * .9 + i) * 28])
    }));
    const splines = svg.append("g").selectAll("path").data(paths).join("path")
      .attr("d", d => line(d.points)).attr("fill", "none").attr("stroke", d => d.color).attr("stroke-width", 11).attr("stroke-linecap", "round").attr("opacity", .9);
    drawPath(splines, .08, 1);
    paths.forEach((path, i) => {
      svg.append("g").selectAll("circle").data(path.points).join("circle")
        .attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 4.5).attr("fill", stops[i][0]).attr("stroke", path.color).attr("stroke-width", 1.4);
    });
  }

  function renderApolloniusCircles() {
    const svg = prepareSvg("apollonius-circles", "Apollonius circles", "Circle solutions reveal tangent constraints between anchors.");
    const anchors = [
      { x: 188, y: 166, r: 42, c: palette.blue },
      { x: 322, y: 164, r: 34, c: palette.orange },
      { x: 260, y: 276, r: 38, c: palette.green }
    ];
    const solutions = [
      { x: 260, y: 198, r: 98, c: palette.purple },
      { x: 242, y: 211, r: 63, c: palette.red },
      { x: 300, y: 226, r: 54, c: palette.cyan }
    ];
    svg.append("g").selectAll("circle").data(anchors).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => d.r)
      .attr("fill", d => d.c).attr("fill-opacity", .14).attr("stroke", d => d.c).attr("stroke-width", 2.2);
    const solution = svg.append("g").selectAll("circle").data(solutions).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", "none").attr("stroke", d => d.c).attr("stroke-width", 2.4).attr("stroke-dasharray", "7 5");
    grow(solution, "r", 5, d => d.r, .1, .9);
    const points = svg.append("g").selectAll("circle.point").data(anchors).join("circle")
      .attr("class", "point").attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.c).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(points, "r", 2, 7, .14, .45);
  }

  function renderSpikeMap() {
    const svg = prepareSvg("spike-map", "Spike map", "Local intensity rises as vertical spikes over a projected grid.");
    const projection = d3.geoMercator().fitExtent([[34, 44], [526, 344]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#f7f7f7").attr("stroke", palette.line);
    appendSchematicLand(svg, path);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", "#e7e7e7").attr("stroke-width", .8);
    const points = [
      [-122, 38, 54], [-74, 41, 78], [-46, -23, 42], [2, 49, 66], [31, 30, 48],
      [77, 28, 58], [103, 1, 72], [139, 36, 62], [151, -34, 36], [18, -34, 44]
    ].map(d => ({ coord: [d[0], d[1]], value: d[2], xy: projection([d[0], d[1]]) }));
    const spikes = svg.append("g").selectAll("line").data(points).join("line")
      .attr("x1", d => d.xy[0]).attr("x2", d => d.xy[0]).attr("y1", d => d.xy[1]).attr("y2", d => d.xy[1] - d.value)
      .attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
    spikes.each(function (d, i) {
      d3.select(this).append("animate")
        .attr("attributeName", "y2").attr("from", d.xy[1]).attr("to", d.xy[1] - d.value)
        .attr("dur", ".75s").attr("begin", `${.05 + i * .035}s`).attr("fill", "freeze");
    });
    const dots = svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("fill", palette.ink);
    grow(dots, "r", 2, 4, .12, .45);
    svg.append("line").attr("x1", 472).attr("x2", 472).attr("y1", 318).attr("y2", 264).attr("stroke", palette.red).attr("stroke-width", 3);
    svg.append("text").attr("class", "caption").attr("x", 482).attr("y", 272).text("54 units");
  }

  function renderBubbleMap() {
    const svg = prepareSvg("bubble-map", "Bubble map", "Projected point symbols encode regional magnitude.");
    const projection = d3.geoNaturalEarth1().fitExtent([[44, 58], [516, 330]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#f7f7f7").attr("stroke", palette.line);
    appendSchematicLand(svg, path);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([40, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", "#e7e7e7").attr("stroke-width", .8);
    const data = [
      [-100, 40, 34], [-58, -15, 22], [8, 48, 41], [34, -2, 26], [77, 21, 32], [116, 35, 46], [144, -25, 19]
    ].map(d => ({ xy: projection([d[0], d[1]]), value: d[2] }));
    const r = d3.scaleSqrt().domain([15, 50]).range([8, 30]);
    const bubbles = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => d.xy[0]).attr("cy", d => d.xy[1]).attr("fill", palette.blue).attr("fill-opacity", .42).attr("stroke", palette.blue).attr("stroke-width", 2);
    grow(bubbles, "r", 2, d => r(d.value), .08, .65);
    const sizeLegend = svg.append("g").attr("transform", "translate(404,360)");
    [15, 50].forEach((value, index) => {
      const x = index * 72;
      sizeLegend.append("circle").attr("cx", x).attr("cy", 0).attr("r", r(value)).attr("fill", palette.blueHighlight).attr("stroke", palette.blue);
      sizeLegend.append("text").attr("class", "caption").attr("x", x).attr("y", 4).attr("text-anchor", "middle").text(value);
    });
  }

  function renderNormalizedStackedArea() {
    const svg = prepareSvg("normalized-stacked-area", "Normalized stacked area", "Category shares sum to 100 percent across time.");
    const keys = ["Search", "Assist", "Build", "Review"];
    const data = d3.range(10).map(i => ({
      t: i,
      Search: 28 + Math.sin(i / 1.4) * 8,
      Assist: 22 + i * 2.2,
      Build: 30 + Math.cos(i / 1.7) * 9,
      Review: 16 + Math.sin(i / 2 + 1) * 6
    }));
    const margin = { top: 42, right: 34, bottom: 54, left: 58 };
    const series = d3.stack().keys(keys).offset(d3.stackOffsetExpand)(data);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.t)).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 1]).range([height - margin.bottom, margin.top]);
    const area = d3.area().x(d => x(d.data.t)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis);
    const layers = svg.append("g").selectAll("path").data(series).join("path")
      .attr("d", area).attr("fill", (d, i) => colors[i]).attr("opacity", .88);
    fadeIn(layers, .08, .75);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y.tickFormat ? y : y, margin.left, 4);
    svg.append("text").attr("class", "label").attr("x", margin.left).attr("y", 30).text("share of total");
  }

  function renderDirectedChord() {
    const svg = prepareSvg("directed-chord", "Directed chord", "Asymmetric ribbons expose sender and receiver imbalance.");
    const names = ["API", "Data", "Ops", "UX", "ML"];
    const matrix = [
      [0, 18, 7, 10, 14],
      [8, 0, 16, 5, 18],
      [14, 6, 0, 15, 4],
      [9, 12, 5, 0, 13],
      [5, 14, 10, 7, 0]
    ];
    const outer = 154, inner = 142;
    const chord = d3.chord().padAngle(.045).sortSubgroups(d3.descending)(matrix);
    const arc = d3.arc().innerRadius(inner).outerRadius(outer);
    const ribbon = d3.ribbon().radius(inner - 2);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const groups = center.append("g").selectAll("path").data(chord.groups).join("path")
      .attr("d", arc).attr("fill", d => colors[d.index]).attr("stroke", "#fff").attr("stroke-width", 1.4);
    fadeIn(groups, .08, .55);
    const ribbons = center.append("g").attr("fill-opacity", .55).selectAll("path").data(chord).join("path")
      .attr("d", ribbon).attr("fill", d => colors[d.source.index]).attr("stroke", d => colors[d.source.index]).attr("stroke-width", .7);
    fadeIn(ribbons, .16, .75);
    center.selectAll("text").data(chord.groups).join("text")
      .attr("class", "mark-label")
      .attr("transform", d => {
        const a = (d.startAngle + d.endAngle) / 2 - Math.PI / 2;
        return `translate(${Math.cos(a) * 181},${Math.sin(a) * 181})`;
      })
      .attr("text-anchor", "middle").text(d => names[d.index]);
  }

  function renderVolcanoContours() {
    const svg = prepareSvg("volcano-contours", "Volcano contours", "A synthetic height field becomes nested contour bands.");
    const nx = 46, ny = 32;
    const values = [];
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const dx = (x - 21) / 11, dy = (y - 15) / 8;
        const peak = Math.exp(-(dx * dx + dy * dy)) * 98;
        const ridge = Math.exp(-(((x - 31) / 8) ** 2 + ((y - 9) / 5) ** 2)) * 48;
        values.push(18 + peak + ridge + Math.sin(x / 3) * 4);
      }
    }
    const contours = d3.contours().size([nx, ny]).thresholds(d3.range(25, 126, 14))(values);
    const projection = d3.geoIdentity().scale(10.2).translate([46, 50]);
    const path = d3.geoPath(projection);
    const fill = d3.scaleQuantize().domain([25, 125]).range(["#cdf3ff", "#dbffcc", "#fff4cc", "#ffe5cc", "#ffccd5", "#f9ccff"]);
    const bands = svg.append("g").selectAll("path").data(contours).join("path")
      .attr("d", path).attr("fill", d => fill(d.value)).attr("stroke", "#fff").attr("stroke-width", 1.1);
    fadeIn(bands, .08, .65);
  }

  function renderRadialArea() {
    const svg = prepareSvg("radial-area", "Radial area", "A cyclic time series wraps into a filled polar profile.");
    const data = d3.range(36).map(i => ({ angle: i / 36 * Math.PI * 2, value: 58 + Math.sin(i / 3) * 20 + Math.cos(i / 5) * 12 }));
    const r = d3.scaleLinear().domain([20, 92]).range([48, 158]);
    const area = d3.radialArea().angle(d => d.angle).innerRadius(42).outerRadius(d => r(d.value)).curve(d3.curveCatmullRomClosed);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 10})`);
    d3.range(1, 4).forEach(i => center.append("circle").attr("r", 42 + i * 36).attr("fill", "none").attr("stroke", "#e7e7e7"));
    const mark = center.append("path").datum(data).attr("d", area).attr("fill", palette.blueHighlight).attr("fill-opacity", .58).attr("stroke", palette.blue).attr("stroke-width", 2.8);
    fadeIn(mark, .08, .7);
    drawPath(center.append("path").datum(data).attr("d", d3.lineRadial().angle(d => d.angle).radius(d => r(d.value)).curve(d3.curveCatmullRomClosed)).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 2.1), .1, 1);
  }

  function renderMirroredBeeswarm() {
    const svg = prepareSvg("mirrored-beeswarm", "Mirrored beeswarm", "Two groups mirror around a central quantitative axis.");
    const data = d3.range(54).map(i => ({ id: i, side: i % 2 ? "Current" : "Prior", value: 22 + ((i * 17) % 66) }));
    const x = d3.scaleLinear().domain([18, 90]).range([74, width - 64]);
    const y0 = height / 2 + 8;
    const nodes = data.map(d => ({ ...d, x: x(d.value), y: y0 + (d.side === "Current" ? -34 : 34) }));
    const simulation = d3.forceSimulation(nodes).randomSource(d3.randomLcg(.77))
      .force("x", d3.forceX(d => x(d.value)).strength(.9))
      .force("y", d3.forceY(d => y0 + (d.side === "Current" ? -44 : 44)).strength(.35))
      .force("collide", d3.forceCollide(7.5)).stop();
    for (let i = 0; i < 150; i += 1) simulation.tick();
    axisBottom(svg, x, y0, 6);
    svg.append("line").attr("x1", 64).attr("x2", width - 56).attr("y1", y0).attr("y2", y0).attr("stroke", palette.line).attr("stroke-width", 1.4);
    const dots = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", d => d.side === "Current" ? palette.red : palette.blue).attr("fill-opacity", .86);
    grow(dots, "r", 2, 6.5, .06, .55);
    svg.append("rect").attr("x", 62).attr("y", y0 - 78).attr("width", width - 124).attr("height", 48).attr("fill", palette.redHighlight).attr("fill-opacity", .18).lower();
    svg.append("rect").attr("x", 62).attr("y", y0 + 30).attr("width", width - 124).attr("height", 64).attr("fill", palette.blueHighlight).attr("fill-opacity", .18).lower();
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", 72).attr("y", y0 - 72).text("Current");
    svg.append("text").attr("class", "mark-label").attr("fill", palette.blue).attr("x", 72).attr("y", y0 + 88).text("Prior");
  }

  function renderIndexChart() {
    const svg = prepareSvg("index-chart", "Index chart", "Multiple series rebase to a common starting value.");
    const names = ["Alpha", "Beta", "Gamma"];
    const series = names.map((name, si) => ({
      name,
      values: d3.range(12).map(i => ({ t: i, value: 100 + Math.sin(i / (1.8 + si * .3) + si) * 8 + i * (si === 1 ? 4.2 : si === 2 ? 1.6 : 2.7) }))
    }));
    series.forEach(s => {
      const first = s.values[0].value;
      s.values.forEach(d => { d.index = d.value / first * 100; });
    });
    const margin = { top: 46, right: 78, bottom: 52, left: 58 };
    const x = d3.scaleLinear().domain([0, 11]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([88, 152]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.index)).curve(d3.curveMonotoneX);
    const paths = svg.append("g").selectAll("path").data(series).join("path")
      .attr("d", d => line(d.values)).attr("fill", "none").attr("stroke", (d, i) => colors[i]).attr("stroke-width", 2.8);
    drawPath(paths, .08, .95);
    svg.append("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(100)).attr("y2", y(100)).attr("stroke", palette.gray400).attr("stroke-dasharray", "5 5");
    svg.selectAll(".index-label").data(series).join("text").attr("class", "mark-label")
      .attr("x", width - margin.right + 8).attr("y", d => y(d.values.at(-1).index)).text(d => d.name);
    svg.append("text").attr("class", "label").attr("x", margin.left).attr("y", 32).text("rebased to 100");
  }

  function renderAnimatedQuadtree() {
    const svg = prepareSvg("quadtree-partition", "Animated quadtree", "Recursive spatial partitions reveal point index depth.");
    const plot = { x: 54, y: 48, w: 452, h: 308 };
    const points = d3.range(34).map(i => ({
      x: plot.x + 24 + ((i * 71) % (plot.w - 48)),
      y: plot.y + 20 + ((i * 43 + i * i * 5) % (plot.h - 40))
    }));
    const tree = d3.quadtree().x(d => d.x).y(d => d.y).extent([[plot.x, plot.y], [plot.x + plot.w, plot.y + plot.h]]).addAll(points);
    const cells = [];
    tree.visit((node, x0, y0, x1, y1) => {
      cells.push({ x0, y0, x1, y1, depth: Math.round(Math.log2(plot.w / Math.max(1, x1 - x0))) });
      return false;
    });
    const visibleCells = cells.map(cell => ({
      ...cell,
      x0: Math.max(plot.x, cell.x0),
      y0: Math.max(plot.y, cell.y0),
      x1: Math.min(plot.x + plot.w, cell.x1),
      y1: Math.min(plot.y + plot.h, cell.y1)
    })).filter(cell => cell.x1 > cell.x0 && cell.y1 > cell.y0);
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", "#ffffff").attr("stroke", palette.line);
    const rects = svg.append("g").selectAll("rect").data(visibleCells).join("rect")
      .attr("x", d => d.x0).attr("y", d => d.y0).attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0)
      .attr("fill", "none").attr("stroke", d => d.depth > 2 ? palette.blue : palette.gray300).attr("stroke-opacity", d => .25 + Math.min(d.depth, 5) * .08).attr("stroke-width", 1);
    rects.each(function (_, i) {
      d3.select(this).append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".45s").attr("begin", `${.02 + i * .012}s`).attr("fill", "freeze");
    });
    const dots = svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 1.5, 4, .15, .45);
  }

  function renderDragCollisions() {
    const svg = prepareSvg("drag-collisions", "Drag collisions", "Collision resolution spreads overlapping nodes from a dragged focus.");
    const center = [width / 2, height / 2 + 14];
    const nodes = d3.range(30).map(i => ({
      id: i,
      startX: center[0] + Math.cos(i) * (18 + i % 5),
      startY: center[1] + Math.sin(i * 1.7) * (18 + i % 6),
      r: 7 + (i % 5)
    }));
    const simNodes = nodes.map(d => ({ ...d, x: d.startX, y: d.startY }));
    d3.forceSimulation(simNodes).randomSource(d3.randomLcg(.28))
      .force("x", d3.forceX(center[0]).strength(.035))
      .force("y", d3.forceY(center[1]).strength(.035))
      .force("collide", d3.forceCollide(d => d.r + 1.5).strength(1)).stop()
      .tick(180);
    const byId = new Map(simNodes.map(d => [d.id, d]));
    const circles = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("cx", d => byId.get(d.id).x).attr("cy", d => byId.get(d.id).y).attr("r", d => d.r)
      .attr("fill", (d, i) => colors[i % 4]).attr("fill-opacity", .82).attr("stroke", d => d.r > 10 ? palette.gray700 : "#fff").attr("stroke-width", 1.4);
    circles.each(function (d, i) {
      const end = byId.get(d.id);
      const node = d3.select(this);
      node.append("animate").attr("attributeName", "cx").attr("from", d.startX).attr("to", end.x).attr("dur", ".9s").attr("begin", `${.04 + i * .006}s`).attr("fill", "freeze");
      node.append("animate").attr("attributeName", "cy").attr("from", d.startY).attr("to", end.y).attr("dur", ".9s").attr("begin", `${.04 + i * .006}s`).attr("fill", "freeze");
    });
    svg.append("circle").attr("cx", center[0]).attr("cy", center[1]).attr("r", 10).attr("fill", palette.ink).attr("stroke", "#fff").attr("stroke-width", 2);
  }

  function renderDotPlot() {
    const svg = prepareSvg("dot-plot", "Dot plot", "Compact ranked points compare paired measures.");
    const data = [
      ["Model", 68, 82], ["Data", 54, 71], ["UX", 46, 63], ["Ops", 73, 78], ["Infra", 38, 56], ["QA", 62, 69]
    ].map(d => ({ name: d[0], a: d[1], b: d[2] }));
    const margin = { top: 44, right: 48, bottom: 48, left: 100 };
    const x = d3.scaleLinear().domain([30, 90]).range([margin.left, width - margin.right]);
    const y = d3.scalePoint().domain(data.map(d => d.name)).range([76, 316]).padding(.5);
    axisBottom(svg, x, 340, 6);
    svg.selectAll(".dot-label").data(data).join("text").attr("class", "mark-label").attr("x", margin.left - 14).attr("y", d => y(d.name)).attr("text-anchor", "end").attr("dy", ".35em").text(d => d.name);
    const links = svg.append("g").selectAll("line").data(data).join("line")
      .attr("x1", d => x(d.a)).attr("x2", d => x(d.b)).attr("y1", d => y(d.name)).attr("y2", d => y(d.name)).attr("stroke", palette.line).attr("stroke-width", 3);
    fadeIn(links, .08, .55);
    const points = svg.append("g").selectAll("circle").data(data.flatMap(d => [{ ...d, value: d.a, color: palette.blue }, { ...d, value: d.b, color: palette.red }])).join("circle")
      .attr("cx", d => x(d.value)).attr("cy", d => y(d.name)).attr("fill", d => d.color).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(points, "r", 2, 7, .12, .55);
  }

  function renderLineMissingData() {
    const svg = prepareSvg("line-missing-data", "Line with missing data", "Gaps preserve absent observations instead of implying continuity.");
    const data = d3.range(16).map(i => ({ t: i, value: [5, 6, 8, 11, null, null, 16, 18, 17, 22, 24, null, 27, 29, 31, 30][i] }));
    const margin = { top: 44, right: 38, bottom: 50, left: 58 };
    const x = d3.scaleLinear().domain([0, 15]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 34]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().defined(d => d.value != null).x(d => x(d.t)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    const path = svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3);
    drawPath(path, .08, 1);
    const dots = svg.append("g").selectAll("circle").data(data.filter(d => d.value != null)).join("circle").attr("cx", d => x(d.t)).attr("cy", d => y(d.value)).attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.4);
    grow(dots, "r", 2, 5, .12, .45);
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", x(4.8)).attr("y", y(12)).text("gap");
    svg.append("text").attr("class", "mark-label").attr("fill", palette.red).attr("x", x(11.2)).attr("y", y(26)).text("gap");
  }

  function renderAreaMissingData() {
    const svg = prepareSvg("area-missing-data", "Area with missing data", "Filled segments stop and restart around missing periods.");
    const data = d3.range(18).map(i => ({ t: i, value: [12, 14, 19, 22, 21, null, null, 24, 28, 26, 30, 32, null, 29, 25, 27, 31, 34][i] }));
    const margin = { top: 44, right: 38, bottom: 50, left: 58 };
    const x = d3.scaleLinear().domain([0, 17]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 38]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const area = d3.area().defined(d => d.value != null).x(d => x(d.t)).y0(y(0)).y1(d => y(d.value)).curve(d3.curveMonotoneX);
    const fill = svg.append("path").datum(data).attr("d", area).attr("fill", palette.greenHighlight).attr("fill-opacity", .78).attr("stroke", palette.green).attr("stroke-width", 3);
    fadeIn(fill, .08, .65);
    const line = d3.line().defined(d => d.value != null).x(d => x(d.t)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    drawPath(svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.green).attr("stroke-width", 2.6), .12, .9);
    svg.append("text").attr("class", "mark-label").attr("x", x(6.2)).attr("y", y(20)).text("gap");
    svg.append("text").attr("class", "mark-label").attr("x", x(12.2)).attr("y", y(26)).text("gap");
  }

  function renderOrthographicShading() {
    const svg = prepareSvg("orthographic-shading", "Orthographic shading", "A globe projection uses radial light to suggest curvature.");
    const defs = svg.append("defs");
    const grad = defs.append("radialGradient").attr("id", "orthographic-shading-light").attr("cx", "36%").attr("cy", "28%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff");
    grad.append("stop").attr("offset", "52%").attr("stop-color", "#cdf3ff");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#007298");
    const projection = d3.geoOrthographic().rotate([-28, -18]).fitExtent([[98, 48], [462, 356]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "url(#orthographic-shading-light)").attr("stroke", palette.ink).attr("stroke-width", 2);
    const graticule = svg.append("g").selectAll("path").data(d3.geoGraticule().step([20, 20]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-opacity", .22).attr("stroke-width", .8);
    drawPath(graticule, .08, .9);
    const points = [[-74, 41], [2, 49], [31, 30], [77, 28]].map(d => projection(d)).filter(Boolean);
    const dots = svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.orange).attr("stroke", palette.ink).attr("stroke-width", 1.2);
    grow(dots, "r", 2, 5, .25, .45);
  }

  function renderParallelSets() {
    const svg = prepareSvg("parallel-sets", "Parallel sets", "Categorical ribbons connect counts across multiple dimensions.");
    const stages = [
      { name: "Source", values: ["Organic", "Paid", "Partner"] },
      { name: "Intent", values: ["Learn", "Build", "Buy"] },
      { name: "Outcome", values: ["Retain", "Expand", "Churn"] }
    ];
    const flows = [
      ["Organic", "Learn", "Retain", 22], ["Organic", "Build", "Expand", 18], ["Organic", "Buy", "Churn", 8],
      ["Paid", "Learn", "Churn", 10], ["Paid", "Build", "Retain", 14], ["Paid", "Buy", "Expand", 24],
      ["Partner", "Learn", "Retain", 12], ["Partner", "Build", "Expand", 16], ["Partner", "Buy", "Retain", 20]
    ].map(d => ({ a: d[0], b: d[1], c: d[2], value: d[3] }));
    const xs = [90, width / 2, width - 90];
    const scales = stages.map((stage, i) => d3.scalePoint().domain(stage.values).range([94, 316]).padding(.42));
    stages.forEach((stage, i) => {
      svg.append("line").attr("x1", xs[i]).attr("x2", xs[i]).attr("y1", 76).attr("y2", 334).attr("stroke", palette.line).attr("stroke-width", 2);
      svg.append("text").attr("class", "mark-label").attr("x", xs[i]).attr("y", 52).attr("text-anchor", "middle").text(stage.name);
      svg.selectAll(`.parallel-set-label-${i}`).data(stage.values).join("text").attr("class", "mark-label")
        .attr("x", xs[i]).attr("y", d => scales[i](d)).attr("text-anchor", "middle").attr("dy", -10).text(d => d);
    });
    const link = (x0, y0, x1, y1) => `M${x0},${y0}C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
    const left = svg.append("g").selectAll("path").data(flows).join("path")
      .attr("d", d => link(xs[0], scales[0](d.a), xs[1], scales[1](d.b)))
      .attr("fill", "none").attr("stroke", d => d.a === "Organic" ? palette.blue : d.a === "Paid" ? palette.orange : palette.green)
      .attr("stroke-width", d => Math.max(3, d.value / 2.4)).attr("stroke-opacity", .5).attr("stroke-linecap", "round");
    const right = svg.append("g").selectAll("path").data(flows).join("path")
      .attr("d", d => link(xs[1], scales[1](d.b), xs[2], scales[2](d.c)))
      .attr("fill", "none").attr("stroke", d => d.c === "Retain" ? palette.blue : d.c === "Expand" ? palette.green : palette.red)
      .attr("stroke-width", d => Math.max(3, d.value / 2.4)).attr("stroke-opacity", .5).attr("stroke-linecap", "round");
    drawPath(left, .08, .85);
    drawPath(right, .16, .85);
  }

  function renderShapeTween() {
    const svg = prepareSvg("shape-tween", "Shape tween", "A polygon morphs between two compatible point sets.");
    const cx = width / 2, cy = height / 2 + 10;
    const start = d3.range(10).map(i => {
      const a = i / 10 * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 66 : 124;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
    const end = d3.range(10).map(i => {
      const a = i / 10 * Math.PI * 2 - Math.PI / 2;
      const r = 78 + Math.sin(i * 1.7) * 26;
      return [cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * .78];
    });
    const line = d3.line().curve(d3.curveLinearClosed);
    const path = svg.append("path").attr("d", line(end)).attr("fill", palette.blue).attr("fill-opacity", .26).attr("stroke", palette.blue).attr("stroke-width", 3);
    path.append("animate").attr("attributeName", "d").attr("from", line(start)).attr("to", line(end)).attr("dur", "1.35s").attr("begin", ".08s").attr("fill", "freeze");
    const dots = svg.append("g").selectAll("circle").data(end).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.red);
    grow(dots, "r", 2, 5.5, .25, .5);
  }

  function renderArcTween() {
    const svg = prepareSvg("arc-tween", "Arc tween", "Radial segments interpolate from one angle state to another.");
    const cx = width / 2, cy = height / 2 + 8;
    const data = [
      { label: "Now", a0: .18, a1: .74, c: palette.red },
      { label: "Plan", a0: .1, a1: .52, c: palette.blue },
      { label: "Risk", a0: .06, a1: .34, c: palette.orange },
      { label: "Reach", a0: .24, a1: .88, c: palette.green }
    ];
    const arc = d3.arc().startAngle(-Math.PI * .75).cornerRadius(9);
    const group = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    data.forEach((d, i) => {
      const outer = 156 - i * 30, inner = outer - 18;
      group.append("path").attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: Math.PI * .75 })).attr("fill", "#e7e7e7");
      const mark = group.append("path")
        .attr("d", arc({ innerRadius: inner, outerRadius: outer, endAngle: -Math.PI * .75 + Math.PI * 1.5 * d.a1 }))
        .attr("fill", d.c);
      mark.append("animate").attr("attributeName", "d")
        .attr("from", arc({ innerRadius: inner, outerRadius: outer, endAngle: -Math.PI * .75 + Math.PI * 1.5 * d.a0 }))
        .attr("to", arc({ innerRadius: inner, outerRadius: outer, endAngle: -Math.PI * .75 + Math.PI * 1.5 * d.a1 }))
        .attr("dur", ".95s").attr("begin", `${.08 + i * .08}s`).attr("fill", "freeze");
      group.append("text").attr("class", "mark-label").attr("x", 0).attr("y", -outer + 13).attr("text-anchor", "middle").text(d.label);
    });
  }

  function renderPathTween() {
    const svg = prepareSvg("path-tween", "Path tween", "A path interpolates between two line geometries.");
    const x = d3.scaleLinear().domain([0, 11]).range([60, width - 56]);
    const y = d3.scaleLinear().domain([10, 90]).range([330, 58]);
    const a = d3.range(12).map(i => [x(i), y(36 + Math.sin(i / 1.4) * 18 + i * 1.6)]);
    const b = d3.range(12).map(i => [x(i), y(72 - Math.cos(i / 1.7) * 16 - i * 1.2)]);
    const line = d3.line().curve(d3.curveCatmullRom);
    axisBottom(svg, x, 340, 6);
    const before = svg.append("path").attr("d", line(a)).attr("fill", "none").attr("stroke", palette.line).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    fadeIn(before, .05, .4);
    const path = svg.append("path").attr("d", line(b)).attr("fill", "none").attr("stroke", palette.purple).attr("stroke-width", 4).attr("stroke-linecap", "round");
    path.append("animate").attr("attributeName", "d").attr("from", line(a)).attr("to", line(b)).attr("dur", "1.25s").attr("begin", ".1s").attr("fill", "freeze");
    drawPath(path, .1, 1.25);
  }

  function renderTextTween() {
    const svg = prepareSvg("text-tween", "Text tween", "Counters and labels animate value changes directly.");
    const metrics = [
      { label: "Reach", from: 42, to: 86, c: palette.blue, fill: palette.blueHighlight },
      { label: "Quality", from: 38, to: 74, c: palette.green, fill: palette.greenHighlight },
      { label: "Risk", from: 61, to: 29, c: palette.red, fill: palette.redHighlight }
    ];
    const group = svg.append("g").selectAll("g").data(metrics).join("g").attr("transform", (d, i) => `translate(${122 + i * 158},${height / 2})`);
    group.append("circle").attr("r", 56).attr("fill", d => d.fill).attr("fill-opacity", .78).attr("stroke", d => d.c).attr("stroke-width", 2.8);
    const text = group.append("text").attr("text-anchor", "middle").attr("dy", ".18em").attr("font-size", 32).attr("font-weight", 800).attr("fill", palette.ink).text(d => d.to);
    text.each(function (d, i) {
      const node = d3.select(this);
      node.append("animate").attr("attributeName", "opacity").attr("from", 0).attr("to", 1).attr("dur", ".25s").attr("begin", `${.08 + i * .08}s`).attr("fill", "freeze");
      node.append("animate").attr("attributeName", "data-value").attr("from", d.from).attr("to", d.to).attr("dur", ".9s").attr("begin", `${.08 + i * .08}s`).attr("fill", "freeze");
    });
    group.append("text").attr("class", "mark-label").attr("fill", d => d.c).attr("text-anchor", "middle").attr("dy", 82).text(d => d.label);
    group.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("dy", 101).text(d => `${d.from} -> ${d.to}`);
  }

  function renderBrushHandles() {
    const svg = prepareSvg("brush-handles", "Brush handles", "Custom brush handles make a selected interval legible.");
    const x = d3.scaleLinear().domain([0, 100]).range([62, width - 56]);
    const y = d3.scaleLinear().domain([0, 80]).range([296, 76]);
    const data = d3.range(32).map(i => ({ x: i * 3.1, y: 28 + Math.sin(i / 3) * 18 + (i % 7) * 2 }));
    const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveMonotoneX);
    drawPath(svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.gray700).attr("stroke-width", 2.6), .08, .8);
    axisBottom(svg, x, 316, 6);
    const brush = { x0: x(24), x1: x(64), y0: 82, y1: 296 };
    const rect = svg.append("rect").attr("x", brush.x0).attr("y", brush.y0).attr("width", brush.x1 - brush.x0).attr("height", brush.y1 - brush.y0)
      .attr("fill", "#cdf3ff").attr("fill-opacity", .42).attr("stroke", palette.blue).attr("stroke-width", 1.8);
    rect.append("animate").attr("attributeName", "x").attr("from", x(16)).attr("to", brush.x0).attr("dur", ".75s").attr("begin", ".12s").attr("fill", "freeze");
    const handles = svg.append("g").selectAll("rect").data([brush.x0, brush.x1]).join("rect")
      .attr("x", d => d - 5).attr("y", brush.y0 - 6).attr("width", 10).attr("height", brush.y1 - brush.y0 + 12).attr("rx", 5)
      .attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.4);
    fadeIn(handles, .16, .45);
  }

  function renderBrushSnapping() {
    const svg = prepareSvg("brush-snapping", "Brush snapping", "A loose brush snaps to calendar-like interval boundaries.");
    const x = d3.scaleBand().domain(d3.range(12).map(String)).range([62, width - 54]).padding(.16);
    const y = d3.scaleLinear().domain([0, 100]).range([302, 72]);
    const data = d3.range(12).map(i => ({ i, value: 28 + ((i * 19) % 62) }));
    svg.append("g").selectAll("rect.bar").data(data).join("rect")
      .attr("class", "bar").attr("x", d => x(String(d.i))).attr("y", d => y(d.value)).attr("width", x.bandwidth()).attr("height", d => y(0) - y(d.value)).attr("fill", palette.green).attr("fill-opacity", .68);
    axisBottom(svg, d3.scaleLinear().domain([0, 11]).range([62, width - 54]), 322, 6);
    const loose = { x: x("2") - 13, w: x("7") - x("2") + x.bandwidth() + 26 };
    const snapped = { x: x("2"), w: x("7") - x("2") + x.bandwidth() };
    const selection = svg.append("rect").attr("x", snapped.x).attr("y", 62).attr("width", snapped.w).attr("height", 242).attr("fill", palette.yellowHighlight).attr("fill-opacity", .65).attr("stroke", palette.yellowHover).attr("stroke-width", 2);
    selection.append("animate").attr("attributeName", "x").attr("from", loose.x).attr("to", snapped.x).attr("dur", ".8s").attr("begin", ".12s").attr("fill", "freeze");
    selection.append("animate").attr("attributeName", "width").attr("from", loose.w).attr("to", snapped.w).attr("dur", ".8s").attr("begin", ".12s").attr("fill", "freeze");
    svg.append("text").attr("class", "mark-label").attr("x", snapped.x + snapped.w / 2).attr("y", 52).attr("text-anchor", "middle").text("snaps to bins 2-7");
  }

  function renderOrdinalBrushing() {
    const svg = prepareSvg("ordinal-brushing", "Ordinal brushing", "Categorical bins are selected with an ordinal brush range.");
    const groups = ["A", "B", "C", "D", "E", "F", "G"];
    const x = d3.scalePoint().domain(groups).range([74, width - 74]);
    const y = d3.scaleLinear().domain([0, 100]).range([304, 72]);
    const data = groups.flatMap((g, gi) => d3.range(8).map(i => ({ group: g, value: 18 + ((gi * 23 + i * 11) % 72), selected: gi >= 2 && gi <= 4 })));
    svg.append("g").selectAll("line").data(groups).join("line").attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 72).attr("y2", 304).attr("stroke", "#e7e7e7");
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.group) + (((d.value * 7) % 17) - 8)).attr("cy", d => y(d.value))
      .attr("fill", d => d.selected ? palette.red : palette.blue).attr("fill-opacity", d => d.selected ? .9 : .42);
    grow(dots, "r", 2, 4.6, .05, .45);
    const x0 = x("C") - 32, x1 = x("E") + 32;
    const brush = svg.append("rect").attr("x", x0).attr("y", 62).attr("width", x1 - x0).attr("height", 254).attr("fill", "#ffccd5").attr("fill-opacity", .28).attr("stroke", palette.red).attr("stroke-width", 2);
    fadeIn(brush, .14, .45);
    svg.selectAll(".ordinal-label").data(groups).join("text").attr("class", "mark-label").attr("x", d => x(d)).attr("y", 336).attr("text-anchor", "middle").text(d => d);
  }

  function renderZoomableBar() {
    const svg = prepareSvg("zoomable-bar", "Zoomable bar", "A local categorical range expands while context remains visible.");
    const data = d3.range(18).map(i => ({ name: `C${i + 1}`, value: 18 + ((i * 29) % 76), focus: i >= 6 && i <= 11 }));
    const overview = { x: 54, y: 292, w: 452, h: 42 };
    const detail = { x: 74, y: 64, w: 412, h: 182 };
    const xO = d3.scaleBand().domain(data.map(d => d.name)).range([overview.x, overview.x + overview.w]).padding(.18);
    const yO = d3.scaleLinear().domain([0, 100]).range([overview.y + overview.h, overview.y]);
    svg.append("g").selectAll("rect.overview").data(data).join("rect")
      .attr("class", "overview").attr("x", d => xO(d.name)).attr("y", d => yO(d.value)).attr("width", xO.bandwidth()).attr("height", d => yO(0) - yO(d.value))
      .attr("fill", d => d.focus ? palette.red : palette.gray300);
    const selected = data.filter(d => d.focus);
    const x = d3.scaleBand().domain(selected.map(d => d.name)).range([detail.x, detail.x + detail.w]).padding(.22);
    const y = d3.scaleLinear().domain([0, 100]).range([detail.y + detail.h, detail.y]);
    const bars = svg.append("g").selectAll("rect.detail").data(selected).join("rect")
      .attr("class", "detail").attr("x", d => x(d.name)).attr("width", x.bandwidth()).attr("y", d => y(d.value)).attr("height", d => y(0) - y(d.value)).attr("fill", palette.red);
    grow(bars, "height", 1, d => y(0) - y(d.value), .08, .65);
    bars.attr("y", d => y(d.value));
    svg.append("rect").attr("x", xO("C7") - 4).attr("y", overview.y - 7).attr("width", xO("C12") - xO("C7") + xO.bandwidth() + 8).attr("height", overview.h + 14).attr("fill", "none").attr("stroke", palette.redHover).attr("stroke-width", 2);
  }

  function renderXyZoom() {
    const svg = prepareSvg("xy-zoom", "X/Y zoom", "Independent axis windows crop a two-dimensional scatter field.");
    const data = d3.range(90).map(i => ({ x: ((i * 37) % 100), y: ((i * 61 + i * 3) % 100) }));
    const left = { x: 46, y: 68, w: 214, h: 238 };
    const right = { x: 314, y: 68, w: 200, h: 238 };
    const x0 = d3.scaleLinear().domain([0, 100]).range([left.x, left.x + left.w]);
    const y0 = d3.scaleLinear().domain([0, 100]).range([left.y + left.h, left.y]);
    const focus = { x0: 32, x1: 68, y0: 38, y1: 76 };
    const x1 = d3.scaleLinear().domain([focus.x0, focus.x1]).range([right.x, right.x + right.w]);
    const y1 = d3.scaleLinear().domain([focus.y0, focus.y1]).range([right.y + right.h, right.y]);
    svg.append("rect").attr("x", left.x).attr("y", left.y).attr("width", left.w).attr("height", left.h).attr("fill", "#ffffff").attr("stroke", palette.line);
    svg.append("rect").attr("x", right.x).attr("y", right.y).attr("width", right.w).attr("height", right.h).attr("fill", "#ffffff").attr("stroke", palette.line);
    svg.append("g").selectAll("circle.context").data(data).join("circle").attr("class", "context").attr("cx", d => x0(d.x)).attr("cy", d => y0(d.y)).attr("r", 3).attr("fill", palette.blue).attr("fill-opacity", .42);
    svg.append("rect").attr("x", x0(focus.x0)).attr("y", y0(focus.y1)).attr("width", x0(focus.x1) - x0(focus.x0)).attr("height", y0(focus.y0) - y0(focus.y1)).attr("fill", "#cdf3ff").attr("fill-opacity", .28).attr("stroke", palette.blue).attr("stroke-width", 2);
    const detail = data.filter(d => d.x >= focus.x0 && d.x <= focus.x1 && d.y >= focus.y0 && d.y <= focus.y1);
    const dots = svg.append("g").selectAll("circle.detail").data(detail).join("circle").attr("class", "detail").attr("cx", d => x1(d.x)).attr("cy", d => y1(d.y)).attr("fill", palette.red).attr("fill-opacity", .82);
    grow(dots, "r", 2, 5, .12, .45);
    svg.append("text").attr("class", "mark-label").attr("x", left.x).attr("y", 48).text("context");
  }

  function renderVersorDragging() {
    const svg = prepareSvg("versor-dragging", "Versor dragging", "A globe rotates along a drag arc using spherical interpolation.");
    const projection = d3.geoOrthographic().rotate([-22, -16]).fitExtent([[94, 48], [466, 356]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    const globe = svg.append("g");
    globe.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", "#cdf3ff").attr("stroke", palette.ink).attr("stroke-width", 2);
    globe.append("g").selectAll("path").data(d3.geoGraticule().step([20, 20]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-opacity", .18).attr("stroke-width", .8);
    globe.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate").attr("from", `0 ${width / 2} ${height / 2}`).attr("to", `18 ${width / 2} ${height / 2}`).attr("dur", "1.3s").attr("begin", ".08s").attr("fill", "freeze");
    const dragArc = [[154, 300], [224, 182], [338, 112], [420, 144]];
    const line = svg.append("path").datum(dragArc).attr("d", d3.line().curve(d3.curveBasis)).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(line, .12, .95);
    svg.append("circle").attr("cx", 420).attr("cy", 144).attr("r", 8).attr("fill", palette.red).attr("stroke", palette.redHighlight).attr("stroke-width", 4);
  }

  function renderYouDrawIt() {
    const svg = prepareSvg("you-draw-it", "You draw it", "A guessed trajectory reveals against the observed series.");
    const margin = { top: 46, right: 42, bottom: 52, left: 58 };
    const x = d3.scaleLinear().domain([0, 10]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([height - margin.bottom, margin.top]);
    const observed = d3.range(11).map(i => ({ t: i, v: 26 + i * 5.8 + Math.sin(i / 1.2) * 11 }));
    const guess = d3.range(11).map(i => ({ t: i, v: 30 + i * 3.4 + Math.cos(i / 1.9) * 8 }));
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    const guessPath = svg.append("path").datum(guess).attr("d", line).attr("fill", "none").attr("stroke", palette.gray700).attr("stroke-width", 3).attr("stroke-dasharray", "7 5");
    drawPath(guessPath, .05, .85);
    const obsPath = svg.append("path").datum(observed).attr("d", line).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 3.4);
    drawPath(obsPath, .55, .95);
    svg.append("text").attr("class", "mark-label").attr("x", x(2)).attr("y", y(42)).text("drawn guess");
    svg.append("text").attr("class", "mark-label").attr("x", x(7.8)).attr("y", y(76)).text("revealed actual");
  }

  function renderMonaHistogram() {
    const svg = prepareSvg("image-histogram", "Image histogram", "A brushed image region links to a pixel-value distribution.");
    const image = { x: 64, y: 64, size: 188, cells: 12 };
    const values = d3.range(image.cells * image.cells).map(i => {
      const x = i % image.cells, y = Math.floor(i / image.cells);
      return Math.round(34 + x * 12 + y * 7 + Math.sin((x + y) / 2) * 22);
    });
    const color = quantizedRamp([20, 250], ramps.gray.slice().reverse());
    svg.append("g").selectAll("rect.pixel").data(values).join("rect")
      .attr("class", "pixel").attr("x", (d, i) => image.x + (i % image.cells) * image.size / image.cells)
      .attr("y", (d, i) => image.y + Math.floor(i / image.cells) * image.size / image.cells)
      .attr("width", image.size / image.cells + .5).attr("height", image.size / image.cells + .5).attr("fill", d => color(d));
    const brush = svg.append("rect").attr("x", image.x + 48).attr("y", image.y + 42).attr("width", 78).attr("height", 82).attr("fill", "none").attr("stroke", palette.red).attr("stroke-width", 3);
    fadeIn(brush, .12, .45);
    const bins = d3.bin().domain([0, 240]).thresholds(10)(values.filter((_, i) => (i % image.cells) >= 3 && (i % image.cells) <= 8 && Math.floor(i / image.cells) >= 3 && Math.floor(i / image.cells) <= 8));
    const x = d3.scaleLinear().domain([0, 240]).range([306, 506]);
    const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).range([306, 86]);
    const bars = svg.append("g").selectAll("rect.hist").data(bins).join("rect")
      .attr("class", "hist").attr("x", d => x(d.x0) + 1).attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 2))
      .attr("y", d => y(d.length)).attr("height", d => y(0) - y(d.length)).attr("fill", palette.blue);
    grow(bars, "height", 1, d => y(0) - y(d.length), .16, .65);
  }

  function renderPopulationPyramid() {
    const svg = prepareSvg("population-pyramid", "Population pyramid", "Mirrored age bins compare two demographic groups.");
    const ages = ["80+", "70", "60", "50", "40", "30", "20", "10", "0"];
    const data = ages.map((age, i) => ({ age, left: 18 + i * 4 + (i % 3) * 3, right: 22 + (8 - i) * 3 + (i % 2) * 4 }));
    const x = d3.scaleLinear().domain([-60, 60]).range([72, width - 72]);
    const y = d3.scaleBand().domain(ages).range([58, 334]).padding(.18);
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 48).attr("y2", 346).attr("stroke", palette.ink).attr("stroke-width", 1.4);
    const leftBars = svg.append("g").selectAll("rect.left").data(data).join("rect")
      .attr("class", "left").attr("x", d => x(-d.left)).attr("y", d => y(d.age)).attr("width", d => x(0) - x(-d.left)).attr("height", y.bandwidth()).attr("fill", palette.blue);
    const rightBars = svg.append("g").selectAll("rect.right").data(data).join("rect")
      .attr("class", "right").attr("x", x(0)).attr("y", d => y(d.age)).attr("width", d => x(d.right) - x(0)).attr("height", y.bandwidth()).attr("fill", palette.red);
    fadeIn(leftBars, .06, .55);
    fadeIn(rightBars, .1, .55);
    svg.append("text").attr("class", "mark-label").attr("x", x(-34)).attr("y", 38).attr("text-anchor", "middle").text("Group A");
    svg.append("text").attr("class", "mark-label").attr("x", x(34)).attr("y", 38).attr("text-anchor", "middle").text("Group B");
    svg.selectAll(".age-label").data(data).join("text").attr("class", "mark-label").attr("x", x(0)).attr("y", d => y(d.age) + y.bandwidth() / 2).attr("text-anchor", "middle").attr("dy", ".35em").text(d => d.age);
  }

  function renderHrDiagram() {
    const svg = prepareSvg("hr-diagram", "Hertzsprung-Russell diagram", "Stars map temperature and luminosity into a scientific scatter.");
    const data = d3.range(140).map(i => {
      const hot = (i * 37) % 100;
      const temp = 3300 + hot * 72;
      const lum = Math.pow(10, -1.2 + ((i * 53) % 100) / 24 + Math.sin(i / 11) * .5);
      return { temp, lum, type: hot > 70 ? "hot" : hot < 26 ? "cool" : "main" };
    });
    const margin = { top: 46, right: 38, bottom: 58, left: 70 };
    const x = d3.scaleLinear().domain([10500, 3000]).range([margin.left, width - margin.right]);
    const y = d3.scaleLog().domain([.04, 1000]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 5);
    axisLeft(svg, y, margin.left, 4);
    const dots = svg.append("g").selectAll("circle").data(data).join("circle")
      .attr("cx", d => x(d.temp)).attr("cy", d => y(d.lum)).attr("fill", d => d.type === "hot" ? "#cdf3ff" : d.type === "cool" ? "#ffe5cc" : "#fff4cc")
      .attr("stroke", d => d.type === "hot" ? palette.blue : d.type === "cool" ? palette.orange : palette.gold).attr("stroke-width", .8).attr("fill-opacity", .78);
    grow(dots, "r", 1, d => d.type === "main" ? 3.5 : 5.5, .02, .5);
  }

  function renderSolarPath() {
    const svg = prepareSvg("solar-path", "Solar path", "Seasonal sun arcs cross a local horizon diagram.");
    const cx = width / 2, horizon = 326;
    svg.append("line").attr("x1", 54).attr("x2", width - 54).attr("y1", horizon).attr("y2", horizon).attr("stroke", palette.ink).attr("stroke-width", 2);
    const seasons = [
      { name: "winter", h: 82, c: palette.blue },
      { name: "equinox", h: 142, c: palette.green },
      { name: "summer", h: 206, c: palette.orange }
    ];
    const paths = svg.append("g").selectAll("path").data(seasons).join("path")
      .attr("d", d => `M78,${horizon}Q${cx},${horizon - d.h} ${width - 78},${horizon}`)
      .attr("fill", "none").attr("stroke", d => d.c).attr("stroke-width", 3).attr("stroke-linecap", "round");
    drawPath(paths, .08, .95);
    seasons.forEach((s, i) => svg.append("text").attr("class", "mark-label").attr("fill", s.c).attr("x", width - 66).attr("y", horizon - s.h * .48 + i * 2).attr("text-anchor", "end").text(s.name));
    const sun = svg.append("circle").attr("r", 9).attr("fill", palette.gold).attr("stroke", palette.yellowHover).attr("stroke-width", 2);
    sun.append("animateMotion").attr("dur", "3s").attr("repeatCount", "indefinite")
      .append("mpath").attr("href", "#solar-path-motion");
    svg.append("path").attr("id", "solar-path-motion").attr("d", `M78,${horizon}Q${cx},${horizon - 206} ${width - 78},${horizon}`).attr("fill", "none").attr("stroke", "none");
  }

  function renderNonContiguousCartogram() {
    const svg = prepareSvg("non-contiguous-cartogram", "Non-contiguous cartogram", "Region shapes scale around fixed centroids by value.");
    const regions = [
      { id: "A", points: [[80, 90], [190, 76], [204, 166], [98, 184]], v: 1.18, c: palette.blue },
      { id: "B", points: [[218, 82], [344, 96], [330, 198], [214, 176]], v: .84, c: palette.green },
      { id: "C", points: [[362, 104], [486, 122], [464, 222], [346, 204]], v: 1.34, c: palette.orange },
      { id: "D", points: [[112, 206], [236, 190], [254, 318], [134, 330]], v: .72, c: palette.purple },
      { id: "E", points: [[266, 214], [442, 232], [418, 342], [278, 326]], v: 1.08, c: palette.red }
    ];
    const line = d3.line().curve(d3.curveLinearClosed);
    regions.forEach(region => {
      const cx = d3.mean(region.points, d => d[0]), cy = d3.mean(region.points, d => d[1]);
      const path = svg.append("path").attr("d", line(region.points)).attr("fill", region.c).attr("fill-opacity", .32 + region.v * .18).attr("stroke", region.c).attr("stroke-width", 2)
        .attr("transform-origin", `${cx}px ${cy}px`).attr("transform", `scale(${region.v})`);
      path.append("animateTransform").attr("attributeName", "transform").attr("type", "scale").attr("from", "1").attr("to", region.v).attr("dur", ".9s").attr("begin", ".08s").attr("fill", "freeze");
      svg.append("text").attr("class", "mark-label").attr("x", cx).attr("y", cy).attr("text-anchor", "middle").text(region.id);
    });
  }

  function renderHexbinMap() {
    const svg = prepareSvg("hexbin-map", "Hexbin map", "Projected points aggregate into geographic hexagonal bins.");
    const projection = d3.geoNaturalEarth1().fitExtent([[54, 54], [506, 336]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.gray100).attr("stroke", palette.gray200);
    appendSchematicLand(svg, path, palette.surface);
    const points = d3.range(90).map(i => projection([-125 + ((i * 29) % 255), -52 + ((i * 43 + i * 2) % 104)])).filter(Boolean);
    const size = 26;
    const bins = d3.rollups(points, v => v.length, p => `${Math.round(p[0] / (size * .86))},${Math.round(p[1] / (size * .75))}`)
      .map(([key, count]) => {
        const [qx, qy] = key.split(",").map(Number);
        return { x: qx * size * .86, y: qy * size * .75, count };
      })
      .filter(d => d.x > 70 && d.x < width - 70 && d.y > 70 && d.y < height - 70);
    const color = quantizedRamp([1, d3.max(bins, d => d.count)], ramps.heat);
    const hex = d => d3.range(6).map(i => {
      const a = Math.PI / 3 * i + Math.PI / 6;
      return [d.x + Math.cos(a) * 13, d.y + Math.sin(a) * 13];
    });
    const cells = svg.append("g").selectAll("path").data(bins).join("path")
      .attr("d", d => `${d3.line()(hex(d))}Z`).attr("fill", d => color(d.count)).attr("fill-opacity", .78).attr("stroke", "#fff").attr("stroke-width", 1.2);
    fadeIn(cells, .08, .6);
    const legend = svg.append("g").attr("transform", "translate(64,370)");
    ramps.heat.forEach((colorValue, index) => legend.append("rect").attr("x", index * 38).attr("width", 38).attr("height", 12).attr("fill", colorValue));
    legend.append("text").attr("class", "caption").attr("x", 0).attr("y", -6).text("low density");
    legend.append("text").attr("class", "caption").attr("x", ramps.heat.length * 38).attr("y", -6).attr("text-anchor", "end").text("high density");
  }

  function renderAirportsVoronoi() {
    const svg = prepareSvg("airport-voronoi", "Airports Voronoi", "Nearest-airport service areas partition a projected region.");
    const airports = [
      [92, 112, "SEA"], [158, 230, "SFO"], [250, 174, "DEN"], [348, 128, "ORD"], [414, 232, "ATL"], [478, 172, "JFK"], [302, 286, "DFW"]
    ];
    const delaunay = d3.Delaunay.from(airports, d => d[0], d => d[1]);
    const voronoi = delaunay.voronoi([48, 58, width - 48, 336]);
    const cells = svg.append("g").selectAll("path").data(airports).join("path")
      .attr("d", (d, i) => voronoi.renderCell(i)).attr("fill", (d, i) => ["#cdf3ff", "#dbffcc", "#ffe5cc", "#fff4cc", "#ffccd5", "#f9ccff", "#e7e7e7"][i])
      .attr("stroke", "#fff").attr("stroke-width", 2);
    fadeIn(cells, .08, .6);
    svg.append("path").attr("d", "M64,96 C140,54 218,72 280,86 C364,100 456,82 506,142 L480,312 C386,348 248,338 108,318 L64,96Z")
      .attr("fill", "none").attr("stroke", palette.ink).attr("stroke-opacity", .62).attr("stroke-width", 1.6).attr("stroke-linejoin", "round");
    const dots = svg.append("g").selectAll("g").data(airports).join("g").attr("transform", d => `translate(${d[0]},${d[1]})`);
    dots.append("circle").attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(dots.selectAll("circle"), "r", 2, 6, .16, .45);
    dots.append("text").attr("class", "mark-label").attr("dy", -10).attr("text-anchor", "middle").text(d => d[2]);
  }

  function renderPolygonClipping() {
    const svg = prepareSvg("polygon-clipping", "Polygon clipping", "An input polygon is intersected with a clipping window.");
    const subject = [[92, 118], [236, 70], [468, 126], [418, 300], [246, 342], [132, 258]];
    const clip = { x0: 156, y0: 108, x1: 420, y1: 294 };
    function clipPolygon(points) {
      const edges = [
        p => p[0] >= clip.x0, p => p[0] <= clip.x1, p => p[1] >= clip.y0, p => p[1] <= clip.y1
      ];
      const intersections = [
        (a, b) => [clip.x0, a[1] + (b[1] - a[1]) * (clip.x0 - a[0]) / (b[0] - a[0])],
        (a, b) => [clip.x1, a[1] + (b[1] - a[1]) * (clip.x1 - a[0]) / (b[0] - a[0])],
        (a, b) => [a[0] + (b[0] - a[0]) * (clip.y0 - a[1]) / (b[1] - a[1]), clip.y0],
        (a, b) => [a[0] + (b[0] - a[0]) * (clip.y1 - a[1]) / (b[1] - a[1]), clip.y1]
      ];
      return edges.reduce((poly, inside, ei) => {
        const out = [];
        poly.forEach((point, i) => {
          const prev = poly[(i + poly.length - 1) % poly.length];
          if (inside(point)) {
            if (!inside(prev)) out.push(intersections[ei](prev, point));
            out.push(point);
          } else if (inside(prev)) {
            out.push(intersections[ei](prev, point));
          }
        });
        return out;
      }, points);
    }
    const line = d3.line().curve(d3.curveLinearClosed);
    svg.append("path").attr("d", line(subject)).attr("fill", palette.blueHighlight).attr("fill-opacity", .64).attr("stroke", palette.blue).attr("stroke-width", 2).attr("stroke-dasharray", "6 5");
    svg.append("rect").attr("x", clip.x0).attr("y", clip.y0).attr("width", clip.x1 - clip.x0).attr("height", clip.y1 - clip.y0).attr("fill", "none").attr("stroke", palette.ink).attr("stroke-width", 2);
    const clipped = svg.append("path").attr("d", line(clipPolygon(subject))).attr("fill", palette.redHighlight).attr("fill-opacity", .84).attr("stroke", palette.red).attr("stroke-width", 3);
    fadeIn(clipped, .18, .65);
    const subjectDots = svg.append("g").selectAll("circle.subject-point").data(subject).join("circle")
      .attr("class", "subject-point").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.blue).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(subjectDots, "r", 2, 5, .08, .45);
    const clippedDots = svg.append("g").selectAll("circle.clipped-point").data(clipPolygon(subject)).join("circle")
      .attr("class", "clipped-point").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(clippedDots, "r", 2, 5, .22, .45);
    svg.append("text").attr("class", "mark-label").attr("x", 92).attr("y", 84).text("source polygon");
    svg.append("text").attr("class", "mark-label").attr("x", clip.x1 - 8).attr("y", clip.y1 + 24).attr("text-anchor", "end").text("clipped output");
  }

  function renderOcclusionLabels() {
    const svg = prepareSvg("occlusion-labels", "Occlusion labels", "Dense labels resolve into a readable non-overlapping subset.");
    const raw = d3.range(34).map(i => ({
      x: 82 + ((i * 61) % 402),
      y: 74 + ((i * 47 + i * i * 3) % 260),
      label: `P${i + 1}`,
      priority: ((i * 17) % 100)
    })).sort((a, b) => d3.descending(a.priority, b.priority));
    const kept = [];
    raw.forEach(d => {
      const box = { x0: d.x + 7, y0: d.y - 15, x1: d.x + 42, y1: d.y + 4 };
      const overlaps = kept.some(k => !(box.x1 < k.box.x0 || box.x0 > k.box.x1 || box.y1 < k.box.y0 || box.y0 > k.box.y1));
      if (!overlaps) kept.push({ ...d, box });
    });
    const dots = svg.append("g").selectAll("circle").data(raw).join("circle").attr("cx", d => d.x).attr("cy", d => d.y).attr("fill", palette.blue).attr("fill-opacity", .65);
    grow(dots, "r", 1.5, 3.5, .04, .45);
    const labels = svg.append("g").selectAll("g").data(kept).join("g").attr("transform", d => `translate(${d.x},${d.y})`);
    labels.append("line").attr("x1", 4).attr("x2", 10).attr("y1", -3).attr("y2", -10).attr("stroke", palette.gray400);
    labels.append("text").attr("class", "mark-label").attr("x", 12).attr("y", -12).text(d => d.label);
    fadeIn(labels, .18, .55);
    svg.append("text").attr("class", "mark-label").attr("x", 60).attr("y", 358).text(`${kept.length} labels kept from ${raw.length} candidates`);
  }

  function renderCorrelogramHistogram() {
    const svg = prepareSvg("correlogram", "Correlogram with histograms", "Pairwise panels combine correlations, scatters, and diagonal distributions.");
    const vars = ["A", "B", "C", "D"];
    const data = d3.range(42).map(i => ({
      A: 18 + ((i * 17) % 76),
      B: 22 + ((i * 23 + i * 2) % 72),
      C: 20 + Math.sin(i / 5) * 26 + ((i * 11) % 34),
      D: 84 - ((i * 19) % 68)
    }));
    const size = 74, gap = 8, origin = { x: 88, y: 58 };
    const extent = v => d3.extent(data, d => d[v]);
    const pearson = (a, b) => {
      const meanA = d3.mean(data, d => d[a]);
      const meanB = d3.mean(data, d => d[b]);
      const numerator = d3.sum(data, d => (d[a] - meanA) * (d[b] - meanB));
      const sumSquaresA = d3.sum(data, d => (d[a] - meanA) ** 2);
      const sumSquaresB = d3.sum(data, d => (d[b] - meanB) ** 2);
      const denominator = Math.sqrt(sumSquaresA * sumSquaresB);
      return denominator > 0 ? numerator / denominator : 0;
    };
    const scales = new Map(vars.map(v => [v, d3.scaleLinear().domain(extent(v)).range([8, size - 8])]));
    vars.forEach((row, r) => vars.forEach((col, c) => {
      const x0 = origin.x + c * (size + gap), y0 = origin.y + r * (size + gap);
      svg.append("rect").attr("x", x0).attr("y", y0).attr("width", size).attr("height", size).attr("fill", "#ffffff").attr("stroke", "#e7e7e7");
      if (r === c) {
        const bins = d3.bin().domain(extent(col)).thresholds(6)(data.map(d => d[col]));
        const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).range([size - 10, 12]);
        const x = d3.scaleLinear().domain(extent(col)).range([10, size - 10]);
        const bars = svg.append("g").selectAll("rect").data(bins).join("rect")
          .attr("x", d => x0 + x(d.x0)).attr("width", d => Math.max(1, x(d.x1) - x(d.x0) - 1))
          .attr("y", d => y0 + y(d.length)).attr("height", d => size - 10 - y(d.length)).attr("fill", palette.blue).attr("fill-opacity", .58);
        fadeIn(bars, .05, .35);
      } else if (r > c) {
        const xs = scales.get(col), ys = scales.get(row);
        const dots = svg.append("g").selectAll("circle").data(data.filter((_, i) => i % 3 === 0)).join("circle")
          .attr("cx", d => x0 + xs(d[col])).attr("cy", d => y0 + size - ys(d[row]))
          .attr("fill", palette.purple).attr("fill-opacity", .75);
        grow(dots, "r", 1.2, 2.5, .03, .35);
      } else {
        const corr = pearson(col, row);
        svg.append("rect")
          .attr("data-correlation", corr.toFixed(4))
          .attr("data-x-variable", col)
          .attr("data-y-variable", row)
          .attr("x", x0 + 10).attr("y", y0 + 10).attr("width", size - 20).attr("height", size - 20)
          .attr("fill", corr >= 0 ? palette.blueHighlight : palette.redHighlight)
          .attr("fill-opacity", .35 + Math.abs(corr) * .55)
          .attr("stroke", corr >= 0 ? palette.blue : palette.red);
        svg.append("text").attr("class", "mark-label").attr("x", x0 + size / 2).attr("y", y0 + size / 2 + 4).attr("text-anchor", "middle")
          .text(`r=${d3.format("+.2f")(corr)}`);
      }
    }));
    vars.forEach((v, i) => svg.append("text").attr("class", "mark-label").attr("x", origin.x + i * (size + gap) + size / 2).attr("y", 44).attr("text-anchor", "middle").text(v));
  }

  function renderRectbinDensity() {
    const svg = prepareSvg("rectbin", "2D rectangular histogram", "Rectangular bins aggregate point density without hex geometry.");
    const plot = { x: 64, y: 58, w: 430, h: 286 };
    const points = d3.range(180).map(i => ({
      x: 20 + ((i * 37 + i * i) % 80),
      y: 18 + ((i * 53 + Math.floor(i / 4) * 11) % 78)
    }));
    const x = d3.scaleLinear().domain([0, 100]).range([plot.x, plot.x + plot.w]);
    const y = d3.scaleLinear().domain([0, 100]).range([plot.y + plot.h, plot.y]);
    const nx = 12, ny = 8;
    const bins = d3.rollups(points, v => v.length, d => Math.floor(d.x / (100 / nx)), d => Math.floor(d.y / (100 / ny)))
      .flatMap(([bx, rows]) => rows.map(([by, count]) => ({ bx, by, count })));
    const color = quantizedRamp([0, d3.max(bins, d => d.count)], ramps.blue);
    const cells = svg.append("g").selectAll("rect").data(bins).join("rect")
      .attr("x", d => x(d.bx * 100 / nx)).attr("y", d => y((d.by + 1) * 100 / ny))
      .attr("width", plot.w / nx - 1).attr("height", plot.h / ny - 1).attr("fill", d => color(d.count)).attr("stroke", "#fff");
    fadeIn(cells, .06, .5);
    svg.append("rect").attr("x", plot.x).attr("y", plot.y).attr("width", plot.w).attr("height", plot.h).attr("fill", "none").attr("stroke", palette.line);
    svg.append("text").attr("class", "mark-label").attr("x", plot.x).attr("y", plot.y - 16).text("low density");
    svg.append("text").attr("class", "mark-label").attr("x", plot.x + plot.w).attr("y", plot.y - 16).attr("text-anchor", "end").text("high density");
  }

  function renderPieDataSwitch() {
    const svg = prepareSvg("pie-data-switch", "Pie data switch", "Arc slices tween between two part-to-whole states.");
    const names = ["Search", "Assist", "Build", "Review", "Other"];
    const before = [18, 26, 14, 20, 22];
    const after = [30, 12, 24, 10, 24];
    const pie = d3.pie().sort(null);
    const arc = d3.arc().innerRadius(58).outerRadius(142).cornerRadius(4);
    const center = svg.append("g").attr("transform", `translate(${width / 2},${height / 2 + 8})`);
    const a = pie(before), b = pie(after);
    const slices = center.selectAll("path").data(b).join("path")
      .attr("data-category", (_, i) => names[i])
      .attr("data-value", d => d.value)
      .attr("d", d => arc(d)).attr("fill", (_, i) => colors[i]).attr("stroke", "#fff").attr("stroke-width", 2);
    slices.each(function (d, i) {
      d3.select(this).append("animate").attr("attributeName", "d")
        .attr("from", arc(a[i])).attr("to", arc(d)).attr("dur", "1s").attr("begin", `${.08 + i * .04}s`).attr("fill", "freeze");
    });
    const labelArc = d3.arc().innerRadius(108).outerRadius(108);
    center.selectAll("text.slice-label").data(b).join("text")
      .attr("class", "reverse-label slice-label")
      .attr("transform", d => `translate(${labelArc.centroid(d)})`)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 800)
      .text(d => `${d.value}%`);
    center.append("text").attr("class", "mark-label").attr("text-anchor", "middle").attr("y", -3).text("after");
    center.append("text").attr("class", "caption").attr("text-anchor", "middle").attr("y", 15).text("100% total");
    const legend = svg.append("g").attr("transform", "translate(54,30)");
    const legendItem = legend.selectAll("g").data(names).join("g").attr("transform", (_, i) => `translate(${i * 98},0)`);
    legendItem.append("rect").attr("width", 11).attr("height", 11).attr("rx", 2).attr("fill", (_, i) => colors[i]);
    legendItem.append("text").attr("class", "caption").attr("x", 16).attr("y", 9).text(d => d);
  }

  function renderLineCursor() {
    const svg = prepareSvg("line-cursor", "Line cursor", "A nearest-point cursor links a vertical guide and value label.");
    const margin = { top: 44, right: 48, bottom: 52, left: 58 };
    const data = d3.range(14).map(i => ({ t: i, v: 32 + i * 3.5 + Math.sin(i / 1.5) * 13 }));
    const x = d3.scaleLinear().domain([0, 13]).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([20, 90]).range([height - margin.bottom, margin.top]);
    axisBottom(svg, x, height - margin.bottom, 6);
    axisLeft(svg, y, margin.left, 5);
    const line = d3.line().x(d => x(d.t)).y(d => y(d.v)).curve(d3.curveMonotoneX);
    drawPath(svg.append("path").datum(data).attr("d", line).attr("fill", "none").attr("stroke", palette.blue).attr("stroke-width", 3), .06, .85);
    const target = data[9];
    const guide = svg.append("line").attr("x1", x(target.t)).attr("x2", x(target.t)).attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", palette.red).attr("stroke-width", 2).attr("stroke-dasharray", "5 5");
    fadeIn(guide, .35, .4);
    const dot = svg.append("circle").attr("cx", x(target.t)).attr("cy", y(target.v)).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 2);
    grow(dot, "r", 2, 7, .42, .45);
    svg.append("text").attr("class", "mark-label").attr("x", x(target.t) + 12).attr("y", y(target.v) - 14).text(`t${target.t}: ${Math.round(target.v)}`);
  }

  function renderClusterDendrogram() {
    const svg = prepareSvg("cluster-dendrogram", "Cluster dendrogram", "Equal-depth leaves reveal the structure of a clustered tree.");
    const root = d3.hierarchy({
      name: "Root",
      children: [
        { name: "Alpha", children: [{ name: "A1" }, { name: "A2" }, { name: "A3" }] },
        { name: "Beta", children: [{ name: "B1" }, { name: "B2" }] },
        { name: "Gamma", children: [{ name: "G1" }, { name: "G2" }, { name: "G3" }] }
      ]
    });
    d3.cluster().size([300, 410])(root);
    const g = svg.append("g").attr("transform", "translate(68,56)");
    const link = d3.linkHorizontal().x(d => d.y).y(d => d.x);
    const links = g.append("g").attr("fill", "none").attr("stroke", palette.line).attr("stroke-width", 2)
      .selectAll("path").data(root.links()).join("path").attr("d", link);
    drawPath(links, .06, .85);
    const nodes = g.append("g").selectAll("g").data(root.descendants()).join("g").attr("transform", d => `translate(${d.y},${d.x})`);
    nodes.append("circle").attr("fill", d => d.children ? palette.blue : palette.green).attr("stroke", "#fff").attr("stroke-width", 1.5);
    grow(nodes.selectAll("circle"), "r", 2, d => d.children ? 6 : 4.5, .18, .45);
    nodes.filter(d => !d.children).append("text").attr("class", "mark-label").attr("x", 10).attr("dy", ".35em").text(d => d.data.name);
  }

  function renderAntimeridianCutting() {
    const svg = prepareSvg("antimeridian-cutting", "Antimeridian cutting", "A route splits cleanly at the dateline instead of crossing the map.");
    const projection = d3.geoEquirectangular().fitExtent([[52, 58], [508, 334]], { type: "Sphere" });
    const path = d3.geoPath(projection);
    svg.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", palette.blueHighlight).attr("fill-opacity", .18).attr("stroke", palette.line);
    appendSchematicLand(svg, path);
    svg.append("g").selectAll("path").data(d3.geoGraticule().step([30, 30]).lines()).join("path")
      .attr("d", path).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", .8);
    const seamXs = [projection([-180, 0])[0], projection([180, 0])[0]];
    svg.append("g").selectAll("line").data(seamXs).join("line")
      .attr("x1", d => d).attr("x2", d => d).attr("y1", 58).attr("y2", 334)
      .attr("stroke", palette.red).attr("stroke-width", 2).attr("stroke-opacity", .72).attr("stroke-dasharray", "6 4");
    const segments = [
      { type: "LineString", coordinates: [[132, 36], [160, 42], [179, 38]] },
      { type: "LineString", coordinates: [[-179, 38], [-150, 34], [-124, 40]] }
    ];
    const routes = svg.append("g").selectAll("path").data(segments).join("path").attr("d", path).attr("fill", "none").attr("stroke", palette.blueHover).attr("stroke-width", 3.4).attr("stroke-linecap", "round");
    drawPath(routes, .1, .85);
    const seamEndpoints = [[179, 38], [-179, 38]].map(coord => projection(coord));
    const endpoints = svg.append("g").selectAll("circle").data(seamEndpoints).join("circle")
      .attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.orange).attr("stroke", palette.surface).attr("stroke-width", 1.5);
    grow(endpoints, "r", 1, 5, .25, .4);
    svg.append("text").attr("class", "mark-label").attr("x", width / 2).attr("y", 46).attr("text-anchor", "middle").text("route splits cleanly at +/-180 deg");
  }

  function renderAdaptiveSampling() {
    const svg = prepareSvg("adaptive-sampling", "Adaptive sampling", "More sample points appear where a curve bends sharply.");
    const f = x => 210 + Math.sin(x / 34) * 74 + Math.sin(x / 12) * 18;
    const coarse = d3.range(62, 500, 44).map(x => [x, f(x)]);
    const dense = d3.range(62, 500, 14).map(x => [x, f(x)]);
    const line = d3.line().curve(d3.curveCatmullRom);
    svg.append("path").datum(coarse).attr("d", line).attr("fill", "none").attr("stroke", palette.gray600).attr("stroke-width", 2).attr("stroke-dasharray", "6 5");
    const sampled = svg.append("path").datum(dense).attr("d", line).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 3);
    drawPath(sampled, .08, .9);
    const points = svg.append("g").selectAll("circle").data(dense).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("fill", palette.red).attr("fill-opacity", .82).attr("stroke", "#fff").attr("stroke-width", 1);
    grow(points, "r", 1.5, 3.5, .12, .45);
  }

  function renderContextToCurve() {
    const svg = prepareSvg("curve-contexts", "Context to curve", "The same control points render through multiple D3 curve contexts.");
    const points = [[62, 304], [132, 112], [208, 216], [288, 82], [372, 244], [488, 126]];
    const curves = [
      { name: "linear", curve: d3.curveLinear, y: 0, c: palette.gray600 },
      { name: "basis", curve: d3.curveBasis, y: 16, c: palette.blue },
      { name: "step", curve: d3.curveStep, y: 32, c: palette.red }
    ];
    curves.forEach((item, i) => {
      const shifted = points.map(p => [p[0], p[1] + item.y]);
      const path = svg.append("path").datum(shifted).attr("d", d3.line().curve(item.curve)).attr("fill", "none").attr("stroke", item.c).attr("stroke-width", i === 0 ? 2 : 3).attr("stroke-opacity", i === 0 ? .55 : .9);
      drawPath(path, .08 + i * .08, .85);
    });
    const legend = svg.append("g").attr("transform", "translate(88,32)");
    const legendItem = legend.selectAll("g").data(curves).join("g").attr("transform", (_, i) => `translate(${i * 126},0)`);
    legendItem.append("line").attr("x1", 0).attr("x2", 26).attr("y1", 0).attr("y2", 0).attr("stroke", d => d.c).attr("stroke-width", 3);
    legendItem.append("text").attr("class", "caption").attr("x", 34).attr("y", 4).text(d => d.name);
    svg.append("g").selectAll("circle").data(points).join("circle").attr("cx", d => d[0]).attr("cy", d => d[1]).attr("r", 4).attr("fill", palette.ink);
  }

  function renderSatelliteProjection() {
    const svg = prepareSvg("satellite-projection", "Satellite projection", "Perspective footprint and horizon rings explain a satellite view.");
    const cx = width / 2, cy = height / 2 + 8;
    const rings = [
      { r: 154, c: palette.blueHighlight, stroke: palette.blue, label: "horizon" },
      { r: 108, c: palette.orangeHighlight, stroke: palette.orange, label: "scan" },
      { r: 58, c: palette.greenHighlight, stroke: palette.green, label: "nadir" }
    ];
    rings.forEach((ring, i) => {
      const circle = svg.append("circle").attr("cx", cx).attr("cy", cy).attr("fill", ring.c).attr("fill-opacity", .34).attr("stroke", ring.stroke).attr("stroke-width", 2);
      grow(circle, "r", 4, ring.r, .08 + i * .08, .55);
      svg.append("text").attr("class", "mark-label").attr("x", cx + ring.r * .7).attr("y", cy - ring.r * .58).text(ring.label);
    });
    const beam = svg.append("path").attr("d", `M${cx},${cy - 186}L${cx - 58},${cy - 58}L${cx + 58},${cy - 58}Z`).attr("fill", palette.redHighlight).attr("fill-opacity", .36).attr("stroke", palette.red).attr("stroke-width", 2);
    fadeIn(beam, .2, .55);
    svg.append("circle").attr("cx", cx).attr("cy", cy - 186).attr("r", 8).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 2);
  }

  function renderExoplanetOrbits() {
    const svg = prepareSvg("exoplanet-orbits", "Exoplanet orbits", "Orbital radius and planet size encode a compact science catalog.");
    const systems = [
      { name: "Kepler-1", x: 120, planets: [22, 46, 76] },
      { name: "TRAPPIST", x: 280, planets: [18, 30, 42, 58, 74, 94] },
      { name: "HD 403", x: 436, planets: [28, 54, 104] }
    ];
    systems.forEach((system, si) => {
      const cy = height / 2 + 10;
      svg.append("circle").attr("cx", system.x).attr("cy", cy).attr("r", 8).attr("fill", palette.gold).attr("stroke", "#fff").attr("stroke-width", 2);
      const systemColor = [palette.blue, palette.purple, palette.green][si];
      const orbits = svg.append("g").selectAll("circle.orbit").data(system.planets).join("circle")
        .attr("class", "orbit").attr("cx", system.x).attr("cy", cy).attr("fill", "none").attr("stroke", palette.gray300).attr("stroke-opacity", .72).attr("stroke-width", 1.2);
      grow(orbits, "r", 4, d => d, .06 + si * .04, .5);
      const planets = svg.append("g").selectAll("circle.planet").data(system.planets).join("circle")
        .attr("class", "planet").attr("cx", d => system.x + d).attr("cy", (d, i) => cy + Math.sin(i * 1.7) * 8)
        .attr("fill", systemColor).attr("fill-opacity", .88).attr("stroke", "#fff").attr("stroke-width", 1.3);
      grow(planets, "r", 2, (d, i) => 4 + (i % 3) * 1.8, .12 + si * .04, .45);
      svg.append("text").attr("class", "mark-label").attr("x", system.x).attr("y", 348).attr("text-anchor", "middle").text(system.name);
    });
  }

  function renderEpicyclicGearing() {
    const svg = prepareSvg("epicyclic-gearing", "Epicyclic gearing", "Nested circular motion traces a gear-like parametric path.");
    const cx = width / 2, cy = height / 2 + 4;
    const R = 100, r = 34, d = 58;
    svg.attr("data-curve-family", "epitrochoid").attr("data-safe-frame", "true");
    const points = d3.range(0, Math.PI * 2.01, .045).map(t => [
      cx + (R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t),
      cy + (R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t)
    ]);
    svg.append("circle").attr("cx", cx).attr("cy", cy).attr("r", R).attr("fill", "none").attr("stroke", palette.gray200).attr("stroke-width", 2);
    svg.append("circle").attr("cx", cx + R + r).attr("cy", cy).attr("r", r).attr("fill", palette.gray50).attr("stroke", palette.blue).attr("stroke-width", 2);
    const line = d3.line().curve(d3.curveCatmullRomClosed);
    const path = svg.append("path").attr("id", "epicyclic-gearing-path").attr("d", line(points)).attr("fill", "none").attr("stroke", palette.orange).attr("stroke-width", 2.6).attr("stroke-opacity", .86);
    drawPath(path, .1, 1.2);
    const dot = svg.append("circle").attr("r", 6).attr("fill", palette.red).attr("stroke", "#fff").attr("stroke-width", 2.2);
    dot.append("animateMotion").attr("dur", "3.4s").attr("repeatCount", "indefinite").append("mpath").attr("href", "#epicyclic-gearing-path");
    svg.append("text").attr("class", "mark-label").attr("x", cx).attr("y", 30).attr("text-anchor", "middle").text("epitrochoid path");
  }

  function restartSvgTimeline(id) {
    const svgNode = document.getElementById(id);
    if (!svgNode) return;

    if (
      typeof svgNode.pauseAnimations === "function" &&
      typeof svgNode.setCurrentTime === "function" &&
      typeof svgNode.unpauseAnimations === "function"
    ) {
      svgNode.pauseAnimations();
      svgNode.setCurrentTime(0);
      svgNode.getBoundingClientRect();
      requestAnimationFrame(() => {
        svgNode.setCurrentTime(0);
        window.setTimeout(() => {
          svgNode.setCurrentTime(0);
          svgNode.unpauseAnimations();
        }, 70);
      });
      return;
    }

    svgNode.querySelectorAll("animate, animateMotion, animateTransform").forEach(animation => {
      if (typeof animation.beginElement === "function") {
        try {
          animation.beginElement();
        } catch (_) {
          // Some SVG animation elements cannot be manually started in every browser.
        }
      }
    });
  }

  function renderExample(example, pass, markReplay = false) {
    const card = document.querySelector(`[data-example="${example.id}"]`);
    const button = card?.querySelector("[data-replay]");
    if (card) {
      card.setAttribute("data-render-pass", String(pass));
      if (markReplay) {
        card.setAttribute("data-replay-state", "running");
        button?.setAttribute("aria-pressed", "true");
        if (card.replayStateTimer) window.clearTimeout(card.replayStateTimer);
        card.replayStateTimer = window.setTimeout(() => {
          if (card.getAttribute("data-render-pass") === String(pass)) {
            card.removeAttribute("data-replay-state");
            button?.setAttribute("aria-pressed", "false");
          }
        }, 900);
      }
    }
    example.render();
    polishSvg(example.id);
    restartSvgTimeline(example.id);
  }

  function renderAll() {
    renderPass += 1;
    document.documentElement.dataset.renderPass = String(renderPass);
    examples.forEach(example => renderExample(example, renderPass));
  }

  function replayExample(id) {
    const example = examples.find(item => item.id === id);
    if (!example) return;
    renderPass += 1;
    document.documentElement.dataset.renderPass = String(renderPass);
    renderExample(example, renderPass, true);
  }

  assignPatternIds();
  exposeExampleMetadata();
  const galleryElement = document.getElementById("gallery");
  if (galleryElement) {
    createCards();
    redirectLegacyPatternHash();
    window.addEventListener("hashchange", redirectLegacyPatternHash);
    galleryElement.addEventListener("click", event => {
      const button = event.target.closest("[data-replay]");
      if (!button) return;
      replayExample(button.dataset.replay);
    });
    renderAll();
  }
})();
