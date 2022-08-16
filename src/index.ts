export interface HierarchicalTokenBucketOptions {
  /**
   * The total number of requests allowed when the bucket is full.
   * maximumCapacity should be >= 1.
   */
  maximumCapacity: number;

  /**
   * The number of requests to add to the bucket per second. The bucket
   * will never exceed `maximumCapacity` requests.
   * refillRate should be > 0.
   */
  refillRate: number;
  parent?: HierarchicalTokenBucket;
}

interface HierarchicalTokenBucketMetrics {
  firstTimestamp: number | undefined;
  lastTimestamp: number | undefined;
  count: number;
  capacity: number;
}

export interface HierarchicalTokenBucketMetadata {
  options: Pick<
    HierarchicalTokenBucketOptions,
    'maximumCapacity' | 'refillRate'
  >;
  metrics: HierarchicalTokenBucketMetrics;
  parent?: HierarchicalTokenBucketMetadata;
}

/**
 * A token bucket serves to limit the number of requests that can be made
 * over a period of time. This token bucket supports nested rate limits and
 * is designed to refill at per-second intervals.
 *
 * The token bucket is not intended to control concurrency nor is it intended
 * to prevent bursting up to the limits imposed by the bucket. Those functions
 * should be implemented by the clients that utilize the token bucket.
 */
export class HierarchicalTokenBucket {
  private lastTimestamp: number;
  private capacity: number;

  private firstTimestamp: number | undefined;
  private count: number = 0;

  constructor(private readonly options: HierarchicalTokenBucketOptions) {
    if (!(options.maximumCapacity >= 1)) {
      throw new Error('HierarchicalTokenBucket.maximumCapacity must be >= 1');
    }
    if (!(options.refillRate > 0)) {
      throw new Error('HierarchicalTokenBucket.refillRate must be > 0');
    }

    this.lastTimestamp = Date.now();
    this.capacity = options.maximumCapacity;
  }

  child(options?: Omit<HierarchicalTokenBucketOptions, 'parent'>) {
    return new HierarchicalTokenBucket({
      maximumCapacity: options ? options.maximumCapacity : this.options.maximumCapacity,
      refillRate: options ? options.refillRate : this.options.refillRate,
      parent: this
    });
  }

  /**
   * Returns the token bucket metadata, including
   *   - options.maximumCapacity
   *   - options.refillRate
   *   - metrics.firstTakeTimestamp
   *   - metrics.takeCount
   *
   * This metadata can be used to adjust the token bucket `options` in the event
   * that a rate-limited request is encountered. For example:
   *
   * ```ts
   * try {
   *   const timeToWaitInMs = tokenBucket.take();
   *   await sleep(timeToWaitInMs);
   *   await client.request();
   * } catch (err) {
   *   if (isRateLimitError(err)) {
   *     const { options, metrics } = tokenBucket.metadata;
   *     logger.warn({
   *       maximumCapacity: options.maximumCapacity,
   *       refillRate: options.refillRate,
   *       firstTakeTimestamp: options.firstTakeTimestamp,
   *       takeCount: metrics.takeCount,
   *     }, 'Encountered rate limited request. Operator should adjust token bucket maximumCapacity or refillRate.');
   *   }
   * }
   * ```
   */
  public get metadata(): HierarchicalTokenBucketMetadata {
    return {
      options: {
        maximumCapacity: this.options.maximumCapacity,
        refillRate: this.options.refillRate
      },
      metrics: {
        firstTimestamp: this.firstTimestamp,
        lastTimestamp: this.lastTimestamp,
        count: this.count,
        capacity: this.capacity
      },
      parent: this.options.parent ? this.options.parent.metadata : undefined
    };
  }

  private addOneToMetrics() {
    if (!this.firstTimestamp) {
      this.firstTimestamp = Date.now();
    }
    this.count++;
  }

  private refreshCapacity() {
    const currentTimestamp = Date.now();
    const elapsedTimeInSeconds = (currentTimestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = currentTimestamp;
    this.capacity = Math.min(
      this.capacity + this.options.refillRate * elapsedTimeInSeconds,
      this.options.maximumCapacity
    );
  }

  /**
   * Takes a token from this and all parent token buckets. Returns the number of
   * milliseconds that must elapse before attempting to redeem the token.
   * Returns 0 if the token can be redeemed immediately.
   *
   * Consumers need only call this function once, but may need to wait before
   * redeeming their token.
   *
   * ```typescript
   * const timeToWaitInMs = hierarchicalTokenBucket.take();
   *
   * if (timeToWaitInMs > 0) {
   *   await new Promise(r => setTimeout(r, timeToWaitInMs));
   * }
   *
   * await fetch('https://my.target.host/that/supports/throttling')
   * ```
   * See also withTokenBucket, which implements this functionality
   * for a callback.
   *
   * @returns time to wait in milliseconds
   */
  take(): number {
    this.addOneToMetrics();
    this.refreshCapacity();

    const minTimeToWait = 0;
    const timeForThisToWait = (1 - this.capacity) / this.options.refillRate;
    const timeForParentToWait = this.options.parent?.take() || 0;
    this.capacity -= 1;

    return Math.max(minTimeToWait, timeForThisToWait, timeForParentToWait);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Executes the callback function after a delay according to the 
 * wait time returned by the tokenBucket.
 * 
 * Executes immediately if the tokenBucket indicates a wait time of 0.
 *
 * @returns Promise<T> according to the callback
 */
 export async function withTokenBucket<T>(
  tokenBucket: HierarchicalTokenBucket,
  cb: () => Promise<T>,
): Promise<T> {
  const timeToWaitInMs = tokenBucket.take();
  await sleep(timeToWaitInMs);
  return await cb();
}