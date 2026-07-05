import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_TOKEN_HEADER,
  PLUGIN_ID,
  TELEMETRY_VERSION,
} from "../../src/constants.js";
import type {
  MissionControlTelemetryBatch,
  MissionControlTelemetryEvent,
} from "../../src/types.js";
import { isRecord } from "../../src/sanitize.js";

export type ReceiverOptions = {
  eventsPath?: string;
  token?: string;
  tokenHeader?: string;
};

export function createReceiverServer(options: ReceiverOptions = {}) {
  const eventsPath =
    options.eventsPath ??
    resolve(process.cwd(), "dev-receiver/events.jsonl");

  return createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        writeJson(res, 200, { ok: true });
        return;
      }

      if (req.method !== "POST" || req.url !== "/events") {
        writeJson(res, 404, { error: "not_found" });
        return;
      }

      if (options.token) {
        const receivedToken =
          req.headers[(options.tokenHeader ?? DEFAULT_TOKEN_HEADER).toLowerCase()];
        if (receivedToken !== options.token) {
          writeJson(res, 401, { error: "invalid_token" });
          return;
        }
      }

      const payload = await readJson(req);
      const batch = validateBatch(payload);
      if (!batch.ok) {
        writeJson(res, 400, { error: batch.error });
        return;
      }

      await mkdir(dirname(eventsPath), { recursive: true });
      const receivedAt = new Date().toISOString();
      const lines = batch.value.events
        .map((event) =>
          JSON.stringify({
            receivedAt,
            source: batch.value.source,
            pluginId: batch.value.pluginId,
            version: batch.value.version,
            event,
          }),
        )
        .join("\n");
      await appendFile(eventsPath, `${lines}\n`, "utf8");

      const kindCounts = countKinds(batch.value.events);
      console.log(
        `accepted ${batch.value.events.length} event(s): ${JSON.stringify(kindCounts)}`,
      );

      writeJson(res, 202, {
        accepted: batch.value.events.length,
        written: batch.value.events.length,
      });
    } catch (error) {
      writeJson(res, 500, {
        error: error instanceof Error ? error.message : "receiver_error",
      });
    }
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > 1024 * 1024) {
      throw new Error("payload_too_large");
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function validateBatch(
  payload: unknown,
): { ok: true; value: MissionControlTelemetryBatch } | { ok: false; error: string } {
  if (!isRecord(payload)) {
    return { ok: false, error: "payload_must_be_object" };
  }

  if (payload.source !== "openclaw") {
    return { ok: false, error: "invalid_source" };
  }

  if (payload.pluginId !== PLUGIN_ID) {
    return { ok: false, error: "invalid_plugin_id" };
  }

  if (payload.version !== TELEMETRY_VERSION) {
    return { ok: false, error: "invalid_version" };
  }

  if (!Array.isArray(payload.events)) {
    return { ok: false, error: "events_must_be_array" };
  }

  for (const event of payload.events) {
    if (!isRecord(event)) {
      return { ok: false, error: "event_must_be_object" };
    }

    if (
      typeof event.id !== "string" ||
      typeof event.kind !== "string" ||
      typeof event.occurredAt !== "string" ||
      typeof event.title !== "string"
    ) {
      return { ok: false, error: "event_missing_required_fields" };
    }
  }

  return { ok: true, value: payload as MissionControlTelemetryBatch };
}

function countKinds(events: MissionControlTelemetryEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  }
  return counts;
}

function writeJson(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, {
    "content-type": "application/json",
  });
  res.end(JSON.stringify(body));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.MISSION_CONTROL_RECEIVER_PORT ?? "4319");
  const token = process.env.MISSION_CONTROL_PLUGIN_TOKEN;
  const tokenHeader = process.env.MISSION_CONTROL_TOKEN_HEADER;
  const server = createReceiverServer({ token, tokenHeader });

  server.listen(port, () => {
    console.log(`Telemetry receiver listening on ${port}`);
  });
}
