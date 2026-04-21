/**
 * Module-level singleton request queue for Claude API calls.
 *
 * Ensures at most 1 concurrent Anthropic request is in-flight at a time,
 * with a 10-second gap between requests to stay inside rate limits.
 * Notifies callers of their queue position via an optional callback.
 */

interface QueueEntry {
  fn:        () => Promise<unknown>;
  resolve:   (value: unknown) => void;
  reject:    (reason: unknown) => void;
  onStatus?: (msg: string | null) => void;
}

const queue: QueueEntry[] = [];
let running = false;

const GAP_MS = 10_000; // 10-second gap between requests

function notifyPositions() {
  queue.forEach((entry, idx) => {
    if (idx > 0) {
      entry.onStatus?.(
        `Request queued — ${idx} request${idx !== 1 ? 's' : ''} ahead of yours`,
      );
    }
  });
}

async function drainQueue(): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    // Update all waiting entries with their current position
    notifyPositions();

    const entry = queue.shift()!;
    entry.onStatus?.(null); // Clear position message when request starts

    try {
      const result = await entry.fn();
      entry.resolve(result);
    } catch (err) {
      entry.reject(err);
    }

    if (queue.length > 0) {
      // Notify remaining entries during the inter-request gap
      queue.forEach((e, idx) => {
        e.onStatus?.(
          `Rate limit gap${idx > 0 ? ` — ${idx} request${idx !== 1 ? 's' : ''} ahead` : ''}…`,
        );
      });
      await new Promise(r => setTimeout(r, GAP_MS));
    }
  }

  running = false;
}

/**
 * Enqueue a Claude API call. Returns a promise that resolves when the call
 * completes (after waiting its turn in the queue).
 *
 * @param fn         The async function to execute when it's this entry's turn.
 * @param onStatus   Optional callback receiving a status string (queue position
 *                   or gap notice) or null when the request actually starts.
 */
export function enqueueClaudeCall<T>(
  fn: () => Promise<T>,
  onStatus?: (msg: string | null) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      fn:       fn as () => Promise<unknown>,
      resolve:  resolve as (value: unknown) => void,
      reject,
      onStatus,
    });

    // Immediately notify the new entry of its current position
    const position = queue.length - 1;
    if (position > 0) {
      onStatus?.(
        `Request queued — ${position} request${position !== 1 ? 's' : ''} ahead of yours`,
      );
    }

    drainQueue();
  });
}
