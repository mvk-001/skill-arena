# Asymmetric Seven Circle Bridge

- **Pattern ID:** `d3-overlap-7-bridge`
- **Gallery source ID:** `overlap-7-bridge`
- **Family:** Asymmetric Overlap
- **Use when:** Two three-set blocks need one explicit bridging set.
- **Renderer:** `renderAsymmetricSevenCircleBridge`

Read `references/overlap-pattern-contracts.md`. Use seven radius-66 circles: Left A `(158,176)`, Left B `(214,144)`, Left C `(214,226)`, Bridge `(280,202)`, Right A `(346,144)`, Right B `(402,176)`, and Right C `(346,226)`. Keep semantic center `(280,206,r31)` with `bridge / circle` and `data-layout="asymmetric-7-bridge-3-1-3"`.

Validate exactly 3 left sets, 1 bridge, 3 right sets, 7 unique labels, and preserved left-to-right grouping.
