/**
 * ECBridge Engine Performance Benchmarks
 *
 * Run with: npm run test -- ECBridgeEngine.benchmark
 */

import { describe, it, expect, bench } from 'vitest';
import { ECBridgeEngine } from '../ECBridgeEngine';

describe('ECBridge Performance Benchmarks', () => {
  const engine = new ECBridgeEngine();

  // Benchmark: Single calculation
  bench('calculateInteraction - single call', () => {
    engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
  });

  // Benchmark: Different emotion relationships
  bench('calculateInteraction - same emotion', () => {
    engine.calculateInteraction('Joy', 'yellow', 'Joy', 'yellow');
  });

  bench('calculateInteraction - opposite emotions', () => {
    engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
  });

  bench('calculateInteraction - adjacent emotions', () => {
    engine.calculateInteraction('Joy', 'yellow', 'Trust', 'lime');
  });

  // Benchmark: Feed preferences
  bench('calculateFeedPreferences', () => {
    engine.calculateFeedPreferences('Joy', 'yellow');
  });

  // Benchmark: All 64 combinations
  bench('calculateInteraction - all 64 combinations', () => {
    const emotions = engine.emotions;
    const colors = engine.colors;

    emotions.forEach(userEmotion => {
      colors.forEach(userColor => {
        emotions.forEach(postEmotion => {
          colors.forEach(postColor => {
            engine.calculateInteraction(
              userEmotion, userColor,
              postEmotion, postColor
            );
          });
        });
      });
    });
  }, {
    iterations: 10,
    time: 10000
  });

  // Real-world simulation benchmark
  bench('realistic usage - 100 interactions', () => {
    const scenarios = [
      ['Joy', 'yellow', 'Sad', 'blue'],
      ['Angry', 'red', 'Trust', 'lime'],
      ['Feared', 'green', 'Surprised', 'aqua'],
      ['Disgust', 'pink', 'Anticipated', 'orange'],
      ['Trust', 'lime', 'Joy', 'yellow'],
      ['Sad', 'blue', 'Angry', 'red'],
      ['Surprised', 'aqua', 'Feared', 'green'],
      ['Anticipated', 'orange', 'Disgust', 'pink']
    ];

    for (let i = 0; i < 100; i++) {
      const scenario = scenarios[i % scenarios.length];
      engine.calculateInteraction(...scenario);
    }
  });
});

// Additional performance tests
describe('ECBridge Performance Tests', () => {
  const engine = new ECBridgeEngine();

  it('should handle 1000 calculations in under 10ms', () => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(10);
  });

  it('should handle 10000 calculations in under 50ms', () => {
    const start = performance.now();

    for (let i = 0; i < 10000; i++) {
      engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(50);
  });

  it('should handle all 4096 combinations in under 500ms', () => {
    const start = performance.now();
    const emotions = engine.emotions;
    const colors = engine.colors;

    emotions.forEach(userEmotion => {
      colors.forEach(userColor => {
        emotions.forEach(postEmotion => {
          colors.forEach(postColor => {
            engine.calculateInteraction(
              userEmotion, userColor,
              postEmotion, postColor
            );
          });
        });
      });
    });

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('should have consistent calculation time', () => {
    const times = [];

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
      times.push(performance.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);

    // Maximum time should not be more than 10x average (consistency check)
    expect(maxTime).toBeLessThan(avgTime * 10);
    // Average should be very fast
    expect(avgTime).toBeLessThan(0.1);
  });

  it('should not leak memory', () => {
    const initial = performance.memory ? performance.memory.usedJSHeapSize : 0;

    // Run 10000 calculations
    for (let i = 0; i < 10000; i++) {
      engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
    }

    const final = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const increase = final - initial;

    // Memory increase should be minimal (less than 1MB)
    // Note: this test might be flaky depending on GC
    if (performance.memory) {
      expect(increase).toBeLessThan(1024 * 1024);
    }
  });

  it('should handle concurrent calls', async () => {
    const promises = [];

    for (let i = 0; i < 100; i++) {
      promises.push(
        Promise.resolve(engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue'))
      );
    }

    const results = await Promise.all(promises);

    // All results should be identical
    expect(results).toHaveLength(100);
    results.forEach(result => {
      expect(result.emotion).toBe(results[0].emotion);
      expect(result.color).toBe(results[0].color);
    });
  });
});

// Memory and scalability tests
describe('ECBridge Scalability', () => {
  it('should handle multiple engine instances', () => {
    const engines = [];

    // Create 100 engine instances
    for (let i = 0; i < 100; i++) {
      engines.push(new ECBridgeEngine());
    }

    // Each should work independently
    engines.forEach(engine => {
      const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
      expect(result.emotion).toBe('Trust');
    });
  });

  it('should handle rapid instantiation', () => {
    const start = performance.now();

    for (let i = 0; i < 1000; i++) {
      new ECBridgeEngine();
    }

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(100); // Should be very fast
  });
});
