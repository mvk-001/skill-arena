import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const HOOK_DIRECTORY = path.join(".skill-arena", "hooks", "execution-events");

export async function writeExecutionEventHook({
  workingDirectory,
  adapter,
  providerId,
  backend,
  command = null,
  args = [],
  exitCode = null,
  stdout = "",
  stderr = "",
  rawEvents = [],
  extra = {},
}) {
  if (!workingDirectory) {
    return null;
  }

  const normalizedEvents = normalizeEvents(rawEvents);
  const toolEvents = extractToolEvents(normalizedEvents);
  const hookDirectory = path.join(workingDirectory, HOOK_DIRECTORY);
  await fs.mkdir(hookDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const fileName = `${timestamp}-${adapter}-${crypto.randomUUID()}.json`;
  const hookPath = path.join(hookDirectory, fileName);

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    adapter,
    providerId,
    backend,
    command,
    args,
    exitCode,
    stdout,
    stderr,
    eventCount: normalizedEvents.length,
    toolEventCount: toolEvents.length,
    events: normalizedEvents,
    toolEvents,
    extra,
  };

  await fs.writeFile(hookPath, JSON.stringify(payload, null, 2), "utf8");

  return {
    path: hookPath,
    relativePath: path.relative(workingDirectory, hookPath).split(path.sep).join("/"),
    eventCount: normalizedEvents.length,
    toolEventCount: toolEvents.length,
  };
}

export function parseJsonLines(stdout) {
  return String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function normalizeEvents(events) {
  return events.map((event, index) => ({
    index,
    type: describeEventType(event),
    data: event,
  }));
}

function describeEventType(event) {
  if (typeof event?.type === "string" && event.type.length > 0) {
    return event.type;
  }

  if (typeof event?.item?.type === "string" && event.item.type.length > 0) {
    return `item:${event.item.type}`;
  }

  if (typeof event?.kind === "string" && event.kind.length > 0) {
    return event.kind;
  }

  return "unknown";
}

function extractToolEvents(events) {
  return events.filter((event) => isToolLikeEvent(event.data)).map((event) => ({
    index: event.index,
    type: event.type,
    data: event.data,
  }));
}

function isToolLikeEvent(event) {
  const typeCandidates = [
    event?.type,
    event?.item?.type,
    event?.kind,
    event?.event,
  ].filter((value) => typeof value === "string");

  if (typeCandidates.some((value) => /tool|function|command|exec|mcp|search/i.test(value))) {
    return true;
  }

  const keyCandidates = [
    event?.tool,
    event?.toolName,
    event?.tool_name,
    event?.command,
    event?.arguments,
    event?.input,
    event?.call_id,
    event?.item?.tool_name,
    event?.item?.toolName,
    event?.item?.arguments,
    event?.data?.toolName,
    event?.data?.tool_name,
    event?.data?.command,
  ];

  return keyCandidates.some((value) => value !== undefined && value !== null);
}
