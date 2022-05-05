# @jupiterone/hierarchical-token-bucket

This project exports a `HierarchicalTokenBucket` class that can support nested 
rate limits. This should be used in client-side rate limiting strategies in 
order to honor rate limits that are composed in a nested structure. One such 
example is AWS API rate limits, which can be limited by an account-level, 
service-level, region-level, or API-level bucket.

The token bucket returns a numeric `timeToWaitInMs` from its primary interface, 
`.take()`. This allows the token bucket to remain synchronous, so it does not 
block other requests. Each caller is expected to honor the `timeToWaitInMs` 
returned from `.take()`.

Returning a `timeToWaitInMs` when the bucket is already exhausted, rather than 
simply preventing the caller from `take()`ing a token and forcing it to re-call, 
essentially creates a lightweight FIFO queue where each caller invokes the 
interface just one time.

Usage:

```ts
import { HierarchicalTokenBucket } from '@jupiterone/hierarchical-token-bucket';

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

const parentBucket = new HierarchicalTokenBucket({
  maximumCapacity: 100,
  refillRate: 10
});

const childBucket = parentBucket.child({
  maximumCapacity: 10,
  refillRate: 1,
});

const timeToWaitInMs = childBucket.take();

await sleep(timeToWaitInMs);
await fetch('https://my.rate-limited.resource');
```

## Class: `HierarchicalTokenBucket`

### `new HierarchicalTokenBucket(params)`

- `params.maximumCapacity` {number} The total number of requests allowed when 
  the bucket is full.
- `params.refillRate` {number} The number of requests to add to the bucket per 
  second. The bucket will never exceed `maximumCapacity` requests.

### `tokenBucket.take()`

Takes a token from this and all parent token buckets. Returns the number of
milliseconds that must elapse before attempting to redeem the token.
Returns 0 if the token can be redeemed immediately.

Consumers need only call this function once, but may need to wait before
redeeming their token.

```ts
const timeToWaitInMs = hierarchicalTokenBucket.take();

if (timeToWaitInMs > 0) {
  await new Promise(r => setTimeout(r, timeToWaitInMs));
}

await fetch('https://my.target.host/that/supports/throttling')
```

### `tokenBucket.metadata`

Returns the token bucket metadata, including
  - options.maximumCapacity
  - options.refillRate
  - metrics.firstTakeTimestamp
  - metrics.takeCount

This metadata can be used to adjust the token bucket `options` in the event
that a rate-limited request is encountered. For example:

```ts
try {
  const timeToWaitInMs = tokenBucket.take();
  await sleep(timeToWaitInMs);
  await client.request();
} catch (err) {
  if (isRateLimitError(err)) {
    const { options, metrics } = tokenBucket.metadata;
    logger.warn({
      maximumCapacity: options.maximumCapacity,
      refillRate: options.refillRate,
      firstTakeTimestamp: options.firstTakeTimestamp,
      takeCount: metrics.takeCount,
    }, 'Encountered rate limited request. Operator should adjust token bucket maximumCapacity or refillRate.');
  }
}
```
