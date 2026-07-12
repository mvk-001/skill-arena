# Critical Bowtie Barrier

- **Pattern ID:** `d3-bowtie-barriers`
- **Gallery source ID:** `bowtie-barriers`
- **Use when:** A safety, process, reliability, or operational-risk artifact needs to show how threats are prevented from reaching a top event and how consequences are mitigated after the top event.
- **Standalone builder:** `scripts/build_critical_bowtie_barrier.py`

## Source Basis

Bowtie analysis places the top event at the center, threats on the left, consequences on the right, preventive barriers between threats and the top event, and mitigative barriers between the top event and consequences. Barrier-management practice also tracks degradation factors and degradation controls so weak or bypassed barriers are visible instead of hidden behind a nominal control label.

Useful source links:

- https://www.cgerisk.com/knowledgebase/The_bowtie_method
- https://www.aiche.org/ccps/resources/publications/books/guidelines-bow-ties-risk-management
- https://www.hse.gov.uk/comah/sragtech/techmeascontrol.htm

## Geometry Contract

1. Keep the hazard and top event centered so the diagram reads as a bowtie, not a generic flowchart.
2. Place threats in a left column and consequences in a right column.
3. Put preventive barriers between each threat and the top event.
4. Put mitigative barriers between the top event and each consequence.
5. Make degraded or failed barriers visually stronger than healthy barriers, but do not let degradation labels cover the barrier label.
6. Place critical-gap badges outside tight scenario rows. Route badge leaders with orthogonal elbows around other barrier cards, headers, and labels; never draw a straight leader through readable text.
7. Add degradation controls as a separate bottom row so the main bowtie remains readable.
8. Draw scenario paths behind cards and barriers; keep motion tokens on hidden paths that do not cross text.

## Semantic Color Roles

- Red: top event, critical barrier gaps, failed or weak barriers.
- Orange: threat-side energy and preventive-side risk movement.
- Purple: consequence-side movement and mitigative controls.
- Green: healthy barrier status.
- Blue or neutral gray: assurance controls and background structure.

## Animation Contract

- Draw threat-to-top-event and top-event-to-consequence paths first.
- Reveal top event, endpoints, and barriers in a staged sequence.
- Animate risk pulses along scenario paths; weak barriers should make the pulse color red.
- Keep the final frame complete and inspectable if animation is paused.

## Validation Hooks

- Root SVG exposes `data-pattern-id="d3-bowtie-barriers"` and `data-pattern-family="bowtie-barriers"`.
- Root counts match rendered marks: `data-threat-count`, `data-preventive-barrier-count`, `data-mitigative-barrier-count`, `data-consequence-count`, `data-barrier-count`, `data-critical-gap-count`, and `data-degradation-control-count`.
- Render threats as `.bowtie-threat`, consequences as `.bowtie-consequence`, the center as `.bowtie-top-event`, preventive barriers as `.preventive-barrier`, mitigative barriers as `.mitigative-barrier`, degraded controls as `.degraded-barrier`, scenario links as `.bowtie-link`, risk tokens as `.bowtie-threat-pulse` or `.bowtie-consequence-pulse`, gaps as `.critical-barrier-gap`, and assurance controls as `.degradation-control`.
- Every barrier exposes `data-barrier-id`, `data-barrier-code`, `data-barrier-side`, `data-status`, and `data-critical-gap`.

## Builder Command

```powershell
uv run --script skills/d3-animated-svg/scripts/build_critical_bowtie_barrier.py bowtie.html
```

For standalone output matching this exact pattern ID, run the builder first and keep its layout unless the user asks for different data or styling. The builder already includes non-overlapping gap badges, routed leaders, animation, counts, and self-contained HTML.
