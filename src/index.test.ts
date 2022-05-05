import { HierarchicalTokenBucket } from '.';

jest.useFakeTimers('modern');

function depleteBucketByCapacity(
  bucket: HierarchicalTokenBucket,
  capacity: number
) {
  let i = 0;
  while (i < capacity) {
    bucket.take();
    i++;
  }
}

describe('HierarchicalTokenBucket', () => {
  describe('constructor', () => {
    test('should throw if maximumCapacity !>= 1', () => {
      expect(
        () =>
          new HierarchicalTokenBucket({
            maximumCapacity: 0.9,
            refillRate: 1
          })
      ).toThrow('HierarchicalTokenBucket.maximumCapacity must be >= 1');
    });

    test('should throw if refillRate !> 0', () => {
      expect(
        () =>
          new HierarchicalTokenBucket({
            maximumCapacity: 1,
            refillRate: -0.1
          })
      ).toThrow('HierarchicalTokenBucket.refillRate must be > 0');
    });
  });

  describe('child', () => {
    test('should create a child whose parent is the original token bucket', () => {
      const parentBucket = new HierarchicalTokenBucket({
        maximumCapacity: 100,
        refillRate: 100
      });

      const childBucket = parentBucket.child({
        maximumCapacity: 50,
        refillRate: 50
      });

      expect((childBucket as any).options.parent).toBe(parentBucket);
    });
  });

  describe('refreshCapacity', () => {
    test('should return refillRate * elapsedTime if capacity was previously zero', () => {
      const bucket = new HierarchicalTokenBucket({
        maximumCapacity: 100,
        refillRate: 10
      });

      depleteBucketByCapacity(bucket, 100);
      jest.advanceTimersByTime(1000);

      let i = 0;
      while (i < 10) {
        expect(bucket.take()).toBe(0);
        i++;
      }

      expect(bucket.take()).toBe(0.1);
    });

    test('should return maxCapacity if refilled beyond maxCapacity', () => {
      const bucket = new HierarchicalTokenBucket({
        maximumCapacity: 100,
        refillRate: 10
      });

      (bucket as any).capacity = 99;
      depleteBucketByCapacity(bucket, 1);
      jest.advanceTimersByTime(1000);

      let i = 0;
      while (i < 100) {
        expect(bucket.take()).toBe(0);
        i++;
      }

      expect(bucket.take()).toBe(0.1);
    });
  });

  describe('take', () => {
    test('should take one token from every parent', () => {
      const grandParentBucket = new HierarchicalTokenBucket({
        maximumCapacity: 10,
        refillRate: 1
      });

      const parentBucket = grandParentBucket.child({
        maximumCapacity: 100,
        refillRate: 10
      });

      const bucket = parentBucket.child({
        maximumCapacity: 1000,
        refillRate: 100
      });

      depleteBucketByCapacity(bucket, 10);
      expect(bucket.take()).toBe(1);
    });

    test('should not take from other leaves off the same parent', () => {
      const parentBucket = new HierarchicalTokenBucket({
        maximumCapacity: 100,
        refillRate: 10
      });

      const bucket = parentBucket.child({
        maximumCapacity: 10,
        refillRate: 1
      });

      const leafBucket = parentBucket.child({
        maximumCapacity: 10,
        refillRate: 1
      });

      depleteBucketByCapacity(bucket, 10);
      expect(bucket.take()).toBe(1);

      expect(leafBucket.take()).toBe(0);
    });

    test('should return 0 if all buckets have capacity', () => {
      const parentBucket = new HierarchicalTokenBucket({
        maximumCapacity: 100,
        refillRate: 10
      });

      const bucket = parentBucket.child({
        maximumCapacity: 10,
        refillRate: 1
      });

      expect(bucket.take()).toEqual(0);
    });

    test('should return > 0 if this bucket lacks capacity', () => {
      const bucket = new HierarchicalTokenBucket({
        maximumCapacity: 10,
        refillRate: 1
      });
      depleteBucketByCapacity(bucket, 10);

      expect(bucket.take()).toEqual(1);
    });

    test('should return > 0 if parent bucket lacks capacity', () => {
      const parentBucket = new HierarchicalTokenBucket({
        maximumCapacity: 100,
        refillRate: 10
      });
      depleteBucketByCapacity(parentBucket, 100);

      const bucket = parentBucket.child({
        maximumCapacity: 10,
        refillRate: 1
      });

      expect(bucket.take()).toEqual(0.1);
    });

    test('should return greater of parent or child if both lack capacity', () => {
      const parentBucket = new HierarchicalTokenBucket({
        maximumCapacity: 10,
        refillRate: 10
      });

      const bucket = parentBucket.child({
        maximumCapacity: 10,
        refillRate: 1
      });

      depleteBucketByCapacity(bucket, 10);

      expect(bucket.take()).toEqual(1);
    });
  });

  describe('metadata', () => {
    describe('options', () => {
      test('should return options', () => {
        const bucket = new HierarchicalTokenBucket({
          maximumCapacity: 10,
          refillRate: 1
        });

        expect(bucket.metadata.options).toEqual({
          maximumCapacity: 10,
          refillRate: 1
        });
      });
    });

    describe('metrics', () => {
      test('should return default if .take() was never called', () => {
        const bucket = new HierarchicalTokenBucket({
          maximumCapacity: 10,
          refillRate: 1
        });

        expect(bucket.metadata.metrics).toEqual({
          firstTimestamp: undefined,
          lastTimestamp: expect.any(Number),
          count: 0,
          capacity: 10
        });
      });

      test('should return populated values if ,take() was called', () => {
        const bucket = new HierarchicalTokenBucket({
          maximumCapacity: 10,
          refillRate: 1
        });

        bucket.take();
        bucket.take();

        expect(bucket.metadata.metrics).toEqual({
          firstTimestamp: expect.any(Number),
          lastTimestamp: expect.any(Number),
          count: 2,
          capacity: 8
        });
      });
    });

    describe('parent', () => {
      test('should return undefined if bucket has no parent', () => {
        const bucket = new HierarchicalTokenBucket({
          maximumCapacity: 10,
          refillRate: 1
        });

        expect(bucket.metadata.parent).toBeUndefined();
      });

      test('should return parents', () => {
        const grandParentBucket = new HierarchicalTokenBucket({
          maximumCapacity: 1000,
          refillRate: 100
        });

        const parentBucket = grandParentBucket.child({
          maximumCapacity: 100,
          refillRate: 10
        });

        const bucket = parentBucket.child({
          maximumCapacity: 10,
          refillRate: 1
        });

        bucket.take();

        expect(bucket.metadata.parent).toEqual({
          options: {
            maximumCapacity: 100,
            refillRate: 10
          },
          metrics: {
            firstTimestamp: expect.any(Number),
            lastTimestamp: expect.any(Number),
            count: 1,
            capacity: 99
          },
          parent: {
            options: {
              maximumCapacity: 1000,
              refillRate: 100
            },
            metrics: {
              firstTimestamp: expect.any(Number),
              lastTimestamp: expect.any(Number),
              count: 1,
              capacity: 999
            }
          }
        });
      });
    });
  });
});
