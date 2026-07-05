import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createReceiverServer } from "../../dev-receiver/src/server.js";
import { PLUGIN_ID, TELEMETRY_VERSION } from "../constants.js";
import type { MissionControlTelemetryBatch } from "../types.js";

describe("dev receiver", () => {
  const servers: Array<{ close: (callback?: (err?: Error) => void) => void }> = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
    servers.length = 0;
  });

  it("accepts valid batches and writes JSONL rows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-receiver-"));
    const eventsPath = join(dir, "events.jsonl");
    const server = createReceiverServer({ eventsPath });
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(makeBatch()),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toEqual({ accepted: 1, written: 1 });

    const jsonl = await readFile(eventsPath, "utf8");
    const row = JSON.parse(jsonl.trim());
    expect(row.event.id).toBe("receiver-test-event");
    expect(row.event.kind).toBe("session_started");
  });

  it("accepts a custom token header when configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mc-receiver-"));
    const server = createReceiverServer({
      eventsPath: join(dir, "events.jsonl"),
      token: "receiver-secret",
      tokenHeader: "x-openclaw-telemetry-token",
    });
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const response = await fetch(`http://127.0.0.1:${port}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-openclaw-telemetry-token": "receiver-secret",
      },
      body: JSON.stringify(makeBatch()),
    });

    expect(response.status).toBe(202);
  });
});

function makeBatch(): MissionControlTelemetryBatch {
  return {
    source: "openclaw",
    pluginId: PLUGIN_ID,
    version: TELEMETRY_VERSION,
    events: [
      {
        id: "receiver-test-event",
        kind: "session_started",
        occurredAt: "2026-06-29T08:00:00.000Z",
        title: "Session started",
      },
    ],
  };
}
