import { describe, expect, it } from "vitest";

import { TelemetryQueue } from "../queue.js";
import type { MissionControlTelemetryEvent } from "../types.js";

describe("TelemetryQueue", () => {
  it("reuses the same event id across retry flushes", async () => {
    const sentIds: string[][] = [];
    let attempt = 0;
    const queue = new TelemetryQueue({
      batchSize: 10,
      maxRetries: 3,
      maxQueueSize: 100,
      sender: async (events) => {
        sentIds.push(events.map((event) => event.id));
        attempt += 1;

        if (attempt === 1) {
          throw new Error("receiver unavailable");
        }
      },
    });

    queue.enqueue(makeEvent("stable-event-id"));

    const failed = await queue.flush();
    expect(failed.sent).toBe(0);
    expect(failed.pending).toBe(1);
    expect(queue.snapshot()[0]?.attempts).toBe(1);

    const succeeded = await queue.flush();
    expect(succeeded.sent).toBe(1);
    expect(succeeded.pending).toBe(0);
    expect(sentIds).toEqual([["stable-event-id"], ["stable-event-id"]]);
  });
});

function makeEvent(id: string): MissionControlTelemetryEvent {
  return {
    id,
    kind: "model_call_started",
    occurredAt: "2026-06-29T08:00:00.000Z",
    title: "Test event",
  };
}
