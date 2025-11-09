export interface QueueProvider {
  enqueue(topic: string, payload: string): Promise<void>;
  consume(
    topic: string,
    handler: (payload: string) => Promise<void>,
    options?: { concurrency?: number }
  ): Promise<() => void>; // Returns disposer function
  getDepth(topic: string): Promise<number>;
  close(): Promise<void>;
}

export interface QueueMessage {
  payload: string;
  timestamp: number;
}
