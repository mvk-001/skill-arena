# Calendar Year

- **Pattern ID:** `d3-calendar-year`
- **Gallery source ID:** `calendar-year`
- **Family:** Calendar
- **Use when:** Daily values wrap into month grids and weekly rows.
- **Renderer:** `renderCalendarYear`

## Reuse Contract

- Use this file as the pattern source in isolated skill-only workspaces; read the gallery fixture only when maintaining that fixture.
- Keep data deterministic and inline small datasets.
- Preserve the pattern's core geometry and semantic color roles before changing labels or domain data.
- Use SVG-native animation for standalone output; do not leave runtime D3 or CDN dependencies in a self-contained deliverable.
- Include an SVG `<title>`, `<desc>`, stable `viewBox`, and final-state geometry.

## Source Excerpt

The excerpt below is the compact renderer source for this pattern. If it references helpers such as `prepareSvg`, `fadeIn`, `grow`, `drawPath`, `palette`, `ramps`, `axisBottom`, or `axisLeft`, read `references/shared-renderer-helpers.md` and recreate only the needed helper behavior in the final artifact.

```js
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
```
