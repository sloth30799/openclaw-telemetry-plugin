import type {
  MissionControlTelemetryEvent,
  TelemetryQueueItem,
  TelemetrySender,
} from "./types.js";

export type TelemetryQueueOptions = {
  sender: TelemetrySender;
  batchSize: number;
  maxRetries: number;
  maxQueueSize: number;
};

export type FlushResult = {
  sent: number;
  pending: number;
  dropped: number;
  error?: unknown;
};

export class TelemetryQueue {
  private readonly sender: TelemetrySender;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly maxQueueSize: number;
  private items: TelemetryQueueItem[] = [];
  private activeFlush?: Promise<FlushResult>;

  constructor(options: TelemetryQueueOptions) {
    this.sender = options.sender;
    this.batchSize = options.batchSize;
    this.maxRetries = options.maxRetries;
    this.maxQueueSize = options.maxQueueSize;
  }

  enqueue(event: MissionControlTelemetryEvent): void {
    this.items.push({ event, attempts: 0 });

    if (this.items.length > this.maxQueueSize) {
      this.items.splice(0, this.items.length - this.maxQueueSize);
    }
  }

  async flush(): Promise<FlushResult> {
    if (this.activeFlush) {
      return this.activeFlush;
    }

    this.activeFlush = this.flushOnce().finally(() => {
      this.activeFlush = undefined;
    });

    return this.activeFlush;
  }

  pendingCount(): number {
    return this.items.length;
  }

  snapshot(): TelemetryQueueItem[] {
    return this.items.map((item) => ({ ...item }));
  }

  private async flushOnce(): Promise<FlushResult> {
    if (this.items.length === 0) {
      return { sent: 0, pending: 0, dropped: 0 };
    }

    const batch = this.items.slice(0, this.batchSize);

    try {
      await this.sender(batch.map((item) => item.event));
      this.items.splice(0, batch.length);
      return {
        sent: batch.length,
        pending: this.items.length,
        dropped: 0,
      };
    } catch (error) {
      for (const item of batch) {
        item.attempts += 1;
      }

      const before = this.items.length;
      this.items = this.items.filter((item) => item.attempts <= this.maxRetries);
      return {
        sent: 0,
        pending: this.items.length,
        dropped: before - this.items.length,
        error,
      };
    }
  }
}
