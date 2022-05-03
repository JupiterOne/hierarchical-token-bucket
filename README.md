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