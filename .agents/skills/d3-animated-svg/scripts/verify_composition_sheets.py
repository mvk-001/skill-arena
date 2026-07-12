#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright"]
# ///

"""Verify the D3 composition-variants page."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright


SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = SKILL_ROOT / "assets" / "examples" / "d3-animated-svg" / "composition-sheets.html"

VERIFY_JS = r"""
async ({ expectedSheets, minVariants, expectedVariants, requiredVariant, expectedReviewedPatterns }) => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sheets = window.D3_COMPOSITION_SHEETS || [];
  const variants = window.D3_COMPOSITION_VARIANTS || [];
  const curatedIds = window.D3_COMPOSITION_CURATED_IDS || [];
  const reviews = window.D3_COMPOSITION_REVIEW || [];
  const metadata = window.D3_ANIMATED_SVG_EXAMPLES || [];
  const sheetIds = sheets.map(sheet => sheet.id);
  const metadataIds = new Set(metadata.map(item => item.id));
  const findings = [];
  if (sheets.length !== expectedSheets) {
    findings.push(`Expected ${expectedSheets} sheets, found ${sheets.length}.`);
  }
  if (variants.length < minVariants) {
    findings.push(`Expected at least ${minVariants} variants, found ${variants.length}.`);
  }
  if (expectedVariants && variants.length !== expectedVariants) {
    findings.push(`Expected exactly ${expectedVariants} variants, found ${variants.length}.`);
  }
  if (expectedReviewedPatterns && reviews.length !== expectedReviewedPatterns) {
    findings.push(`Expected ${expectedReviewedPatterns} reviewed patterns, found ${reviews.length}.`);
  }
  if (metadata.length && reviews.length !== metadata.length) {
    findings.push(`Review count ${reviews.length} does not match metadata count ${metadata.length}.`);
  }
  const reviewedIds = new Set(reviews.map(review => review.sourceId));
  const missingReviews = metadata.filter(item => !reviewedIds.has(item.id)).map(item => item.id);
  if (missingReviews.length) {
    findings.push(`Patterns without composition review: ${missingReviews.slice(0, 8).join(", ")}.`);
  }
  const weakReviews = reviews.filter(review => !review.reviewed || !Array.isArray(review.targets) || (review.targets.length < 1 && !review.rejectedReason));
  if (weakReviews.length) {
    findings.push(`Reviews without useful targets or explicit rejection: ${weakReviews.slice(0, 8).map(review => review.sourceId).join(", ")}.`);
  }
  if (document.body.dataset.compositionSheetCount !== String(expectedSheets)) {
    findings.push(`Body composition sheet count is ${document.body.dataset.compositionSheetCount}.`);
  }
  if (Number(document.body.dataset.compositionVariantCount || 0) !== variants.length) {
    findings.push(`Body composition variant count is ${document.body.dataset.compositionVariantCount}; script has ${variants.length}.`);
  }
  if (Number(document.body.dataset.compositionReviewedPatternCount || 0) !== reviews.length) {
    findings.push(`Body reviewed pattern count is ${document.body.dataset.compositionReviewedPatternCount}; script has ${reviews.length}.`);
  }
  const ids = variants.map(variant => variant.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    findings.push("Composition variants contain duplicate IDs.");
  }
  const invalidIds = ids.filter(id => !/^d3-composition-[a-z0-9][a-z0-9-]*-[a-z0-9][a-z0-9-]*$/.test(id || ""));
  if (invalidIds.length) {
    findings.push(`Invalid composition IDs: ${invalidIds.slice(0, 5).join(", ")}.`);
  }
  const curatedSet = new Set(curatedIds);
  const missingCuratedIds = curatedIds.filter(id => !uniqueIds.has(id));
  const unexpectedIds = ids.filter(id => !curatedSet.has(id));
  if (curatedSet.size !== curatedIds.length) {
    findings.push("Curated composition manifest contains duplicate IDs.");
  }
  if (missingCuratedIds.length) {
    findings.push(`Curated composition IDs missing at runtime: ${missingCuratedIds.slice(0, 8).join(", ")}.`);
  }
  if (unexpectedIds.length) {
    findings.push(`Runtime composition IDs missing from curated manifest: ${unexpectedIds.slice(0, 8).join(", ")}.`);
  }
  const missingSources = variants.filter(variant => !metadataIds.has(variant.sourceId)).map(variant => variant.sourceId);
  if (missingSources.length) {
    findings.push(`Variants reference missing source patterns: ${Array.from(new Set(missingSources)).slice(0, 8).join(", ")}.`);
  }
  const weakVariantRecords = variants.filter(variant => !variant.reviewed || !variant.renderer || !variant.armatureLines || !variant.quadrants || !variant.sourceFamily);
  if (weakVariantRecords.length) {
    findings.push(`Variant records missing review metadata: ${weakVariantRecords.slice(0, 8).map(variant => variant.id).join(", ")}.`);
  }
  if (requiredVariant && !uniqueIds.has(requiredVariant)) {
    findings.push(`Missing required variant ${requiredVariant}.`);
  }
  const tabIds = Array.from(document.querySelectorAll("[data-sheet-tab]")).map(tab => tab.dataset.sheetTab);
  if (tabIds.length !== expectedSheets) {
    findings.push(`Expected ${expectedSheets} sheet tabs, found ${tabIds.length}.`);
  }
  const sheetReports = [];
  for (const sheetId of sheetIds) {
    const expectedRows = variants.filter(variant => variant.compositionId === sheetId).length;
    const tab = document.querySelector(`[data-sheet-tab="${sheetId}"]`);
    if (!tab) {
      findings.push(`Missing tab for ${sheetId}.`);
      continue;
    }
    tab.click();
    await sleep(120);
    const active = document.body.dataset.activeCompositionSheet;
    if (active !== sheetId) {
      findings.push(`Active sheet after clicking ${sheetId} is ${active}.`);
    }
    const rows = Array.from(document.querySelectorAll(`.composition-card[data-composition-id="${sheetId}"]`));
    const visibleRows = rows.filter(row => !row.hidden);
    if (expectedRows < 5) {
      findings.push(`${sheetId} has only ${expectedRows} curated variants.`);
    }
    if (rows.length !== expectedRows) {
      findings.push(`${sheetId} has ${rows.length} rows, expected ${expectedRows}.`);
    }
    if (visibleRows.length !== expectedRows) {
      findings.push(`${sheetId} has ${visibleRows.length} visible rows, expected ${expectedRows}.`);
    }
    const rowIds = rows.map(row => row.dataset.compositionPatternId);
    if (new Set(rowIds).size !== rowIds.length) {
      findings.push(`${sheetId} has duplicated composition pattern IDs.`);
    }
    const strayFit = rows.filter(row => row.hasAttribute("data-fit") || row.querySelector(".fit-badge")).length;
    if (strayFit) {
      findings.push(`${sheetId} still exposes fit badges or data-fit on ${strayFit} rows.`);
    }
    const missingReviewAttrs = rows.filter(row => row.dataset.reviewed !== "true" || !row.dataset.armatureLines || !row.dataset.quadrants || !row.dataset.sourceFamily).length;
    if (missingReviewAttrs) {
      findings.push(`${sheetId} has ${missingReviewAttrs} rows without review, armature, quadrant, or family attributes.`);
    }
    const missingLinks = rows.filter(row => !row.querySelector(`a[href*="${row.dataset.patternId}"]`)).length;
    if (missingLinks) {
      findings.push(`${sheetId} has ${missingLinks} rows without a base pattern link.`);
    }
    const svgReports = rows.map(row => {
      const svg = row.querySelector("svg[data-composition-pattern-id]");
      const replayButtons = row.querySelectorAll("[data-replay-composition]").length;
      const matchingReplayButton = row.querySelector(`button[data-replay-composition="${row.dataset.compositionPatternId}"]`);
      const elements = svg ? svg.querySelectorAll("*").length : 0;
      const marks = svg ? svg.querySelectorAll("circle,rect,path,line,polygon,polyline,text").length : 0;
      const title = svg ? svg.querySelector("title")?.textContent || "" : "";
      const compositionLines = svg ? svg.querySelectorAll(".composition-line").length : 0;
      const quadrantFields = svg ? svg.querySelectorAll(".quadrant-field").length : 0;
      const hasSignature = Boolean(svg?.querySelector(".base-signature"));
      const sourceRecomposition = svg?.querySelector(".source-pattern-recomposition");
      const hasSourceRecomposition = Boolean(sourceRecomposition);
      const recompositionMode = sourceRecomposition?.dataset.recompositionMode || "";
      const hasSemanticRecomposition = recompositionMode.startsWith("semantic-");
      const adaptationCues = svg ? svg.querySelectorAll(".source-adaptation-cues").length : 0;
      const hasSourceTitle = Boolean(svg?.dataset.basePatternTitle);
      const visibleSourceFields = Array.from(svg?.querySelectorAll(".source-pattern-field") || []).filter(field => {
        const stroke = field.getAttribute("stroke") || "";
        const strokeOpacity = Number(field.getAttribute("stroke-opacity") ?? "1");
        const fill = field.getAttribute("fill") || "";
        const fillOpacity = Number(field.getAttribute("fill-opacity") ?? "1");
        return (stroke && stroke !== "none" && strokeOpacity > 0.02) || (fill && fill !== "none" && fillOpacity > 0.02);
      }).length;
      const visibleSignatureMarks = Array.from(svg?.querySelectorAll(".base-signature *") || []).filter(mark => {
        const opacity = Number(mark.getAttribute("opacity") ?? "1");
        const tag = mark.tagName.toLowerCase();
        const fontSize = Number(mark.getAttribute("font-size") || 0);
        return opacity > 0.02 && !(tag === "text" && fontSize <= 1.5);
      }).length;
      const replayTargetCount = svg ? svg.querySelectorAll('[data-replay-target="true"]').length : 0;
      const pathAnimationTargets = svg ? svg.querySelectorAll('[data-replay-path="true"]').length : 0;
      const animationTargetCount = Number(svg?.dataset.animationTargetCount || 0);
      const animationReady = svg?.dataset.animationReady === "true";
      const renderPass = Number(svg?.dataset.renderPass || 0);
      return { id: row.dataset.compositionPatternId, elements, marks, title, compositionLines, quadrantFields, visibleSourceFields, visibleSignatureMarks, hasSignature, hasSourceRecomposition, hasSemanticRecomposition, adaptationCues, hasSourceTitle, replayButtons, matchingReplayButton: Boolean(matchingReplayButton), replayTargetCount, pathAnimationTargets, animationTargetCount, animationReady, renderPass };
    });
    const blankSvgs = svgReports.filter(report => report.marks < 8 || !report.title || !report.hasSignature || !report.hasSourceRecomposition || !report.hasSemanticRecomposition || report.adaptationCues || !report.hasSourceTitle);
    if (blankSvgs.length) {
      findings.push(`${sheetId} has blank, cloned, cue-overlaid, or weak SVG previews: ${blankSvgs.slice(0, 5).map(report => report.id).join(", ")}.`);
    }
    const artificialGuides = svgReports.filter(report => report.compositionLines || report.quadrantFields || report.visibleSourceFields || report.visibleSignatureMarks);
    if (artificialGuides.length) {
      findings.push(`${sheetId} has artificial guide overlays, visible source-field borders, or visible signature boxes inside card previews: ${artificialGuides.slice(0, 5).map(report => report.id).join(", ")}.`);
    }
    const replayContractFailures = svgReports.filter(report => report.replayButtons !== 1 || !report.matchingReplayButton || !report.animationReady || report.replayTargetCount < 6 || report.replayTargetCount !== report.animationTargetCount || report.renderPass < 1);
    if (replayContractFailures.length) {
      findings.push(`${sheetId} has missing replay controls or weak animation targets: ${replayContractFailures.slice(0, 5).map(report => report.id).join(", ")}.`);
    }
    await sleep(1880);
    const replaySample = rows.find(row => row.querySelector("button[data-replay-composition]") && row.querySelector("svg[data-composition-pattern-id]"));
    let sampleReplayState = "not-tested";
    if (replaySample) {
      const sampleSvg = replaySample.querySelector("svg[data-composition-pattern-id]");
      const samplePass = sampleSvg?.dataset.renderPass || "";
      const otherRows = rows.filter(row => row !== replaySample);
      const otherPasses = otherRows.map(row => row.querySelector("svg[data-composition-pattern-id]")?.dataset.renderPass || "");
      replaySample.querySelector("button[data-replay-composition]").click();
      await sleep(90);
      const targetRunning = sampleSvg?.dataset.animationState === "running" && sampleSvg?.classList.contains("is-replaying");
      const targetRebuilt = sampleSvg?.dataset.renderPass !== samplePass;
      const otherRebuilt = otherRows.some((row, index) => (row.querySelector("svg[data-composition-pattern-id]")?.dataset.renderPass || "") !== otherPasses[index]);
      sampleReplayState = targetRunning && !targetRebuilt && !otherRebuilt ? "running-target-only" : "failed";
      if (sampleReplayState === "failed") {
        findings.push(`${sheetId} replay button did not restart only the target SVG animation.`);
      }
    } else {
      findings.push(`${sheetId} has no replay sample to click.`);
    }
    const armature = document.querySelector("#sheet-overview svg");
    if (!armature) {
      findings.push(`${sheetId} has no armature SVG.`);
    }
    sheetReports.push({
      id: sheetId,
      expectedRows,
      rows: rows.length,
      visibleRows: visibleRows.length,
      uniqueCompositionIds: new Set(rowIds).size,
      previewMarksMin: Math.min(...svgReports.map(report => report.marks)),
      previewMarksMax: Math.max(...svgReports.map(report => report.marks)),
      compositionGuideOverlaysMax: Math.max(...svgReports.map(report => report.compositionLines + report.quadrantFields)),
      visibleSourceFieldsMax: Math.max(...svgReports.map(report => report.visibleSourceFields)),
      visibleSignatureMarksMax: Math.max(...svgReports.map(report => report.visibleSignatureMarks)),
      replayButtons: svgReports.reduce((sum, report) => sum + report.replayButtons, 0),
      animationTargetsMin: Math.min(...svgReports.map(report => report.replayTargetCount)),
      animationTargetsMax: Math.max(...svgReports.map(report => report.replayTargetCount)),
      pathAnimationTargetsMax: Math.max(...svgReports.map(report => report.pathAnimationTargets)),
      sampleReplayState,
      armatureElements: armature ? armature.querySelectorAll("*").length : 0
    });
  }
  const requiredRecord = variants.find(variant => variant.id === requiredVariant);
  if (requiredRecord && document.body.dataset.activeCompositionSheet !== requiredRecord.compositionId) {
    document.querySelector(`[data-sheet-tab="${requiredRecord.compositionId}"]`)?.click();
    await sleep(120);
  }
  const search = document.querySelector("#pattern-search");
  search.value = requiredVariant || "force-network";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(80);
  const filteredVisible = Array.from(document.querySelectorAll(".composition-card")).filter(row => !row.hidden);
  if (requiredVariant && !filteredVisible.some(row => row.dataset.compositionPatternId === requiredVariant)) {
    findings.push(`Search filter did not expose ${requiredVariant}.`);
  }
  return {
    clean: findings.length === 0,
    findings,
    sheetCount: sheets.length,
    variantCount: variants.length,
    reviewedPatternCount: reviews.length,
    metadataPatternCount: metadata.length,
    sheetReports,
    filteredVisibleCount: filteredVisible.length,
    viewport: { width: window.innerWidth, height: window.innerHeight }
  };
}
"""


def source_to_url(source: str) -> str:
    if re.match(r"^https?://", source) or source.startswith("file://"):
        return source
    return Path(source).expanduser().resolve().as_uri()


def parse_viewport(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"(\d+)x(\d+)", value)
    if not match:
        raise argparse.ArgumentTypeError("Viewport must use WIDTHxHEIGHT, for example 1366x900.")
    return int(match.group(1)), int(match.group(2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?", default=str(DEFAULT_SOURCE), help="Composition sheets HTML file, file URL, or HTTP URL.")
    parser.add_argument("--expected-sheets", type=int, default=7)
    parser.add_argument("--min-variants", type=int, default=70)
    parser.add_argument("--expected-variants", type=int, default=78)
    parser.add_argument("--expected-reviewed-patterns", type=int, default=224)
    parser.add_argument("--required-variant", default="d3-composition-radial-force-network")
    parser.add_argument("--viewport", type=parse_viewport, default=(1366, 900))
    parser.add_argument("--wait-ms", type=int, default=600)
    parser.add_argument("--screenshot", type=Path)
    parser.add_argument("--expect-clean", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    width, height = args.viewport
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto(source_to_url(args.source), wait_until="load", timeout=90_000)
        page.wait_for_timeout(max(args.wait_ms, 0))
        result: dict[str, Any] = page.evaluate(
            VERIFY_JS,
            {
                "expectedSheets": args.expected_sheets,
                "minVariants": args.min_variants,
                "expectedVariants": args.expected_variants,
                "requiredVariant": args.required_variant,
                "expectedReviewedPatterns": args.expected_reviewed_patterns,
            },
        )
        if args.screenshot:
            args.screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=args.screenshot, full_page=True)
        browser.close()
    print(json.dumps(result, indent=2))
    if args.expect_clean and not result.get("clean"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
