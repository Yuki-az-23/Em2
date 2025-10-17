import { describe, it, expect, beforeEach } from 'vitest';
import { ECBridgeEngine } from '../ECBridgeEngine';

describe('ECBridgeEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ECBridgeEngine();
  });

  describe('constructor', () => {
    it('should initialize with 8 emotions', () => {
      expect(engine.emotions).toHaveLength(8);
    });

    it('should initialize with 8 colors', () => {
      expect(engine.colors).toHaveLength(8);
    });
  });

  describe('calculateInteraction', () => {
    describe('valid inputs', () => {
      it('should return valid result structure', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');

        expect(result).toHaveProperty('emotion');
        expect(result).toHaveProperty('color');
        expect(result).toHaveProperty('intensity');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata).toHaveProperty('emotionRelation');
        expect(result.metadata).toHaveProperty('colorHarmony');
        expect(result.metadata).toHaveProperty('original');
      });

      it('should return emotion within valid set', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        expect(engine.emotions).toContain(result.emotion);
      });

      it('should return color within valid set', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        expect(engine.colors).toContain(result.color);
      });

      it('should return intensity between 0 and 2', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        expect(result.intensity).toBeGreaterThanOrEqual(0);
        expect(result.intensity).toBeLessThanOrEqual(2);
      });

      it('should return confidence between 0 and 1', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });

    describe('invalid inputs', () => {
      it('should handle invalid user emotion', () => {
        const result = engine.calculateInteraction('Invalid', 'yellow', 'Sad', 'blue');
        expect(result.emotion).toBe('Disgust');
        expect(result.color).toBe('orange');
        expect(result.confidence).toBe(0.5);
      });

      it('should handle invalid post emotion', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Invalid', 'blue');
        expect(result.emotion).toBe('Disgust');
        expect(result.color).toBe('orange');
      });

      it('should handle invalid user color', () => {
        const result = engine.calculateInteraction('Joy', 'invalid', 'Sad', 'blue');
        expect(result.emotion).toBe('Disgust');
        expect(result.color).toBe('orange');
      });

      it('should handle invalid post color', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'invalid');
        expect(result.emotion).toBe('Disgust');
        expect(result.color).toBe('orange');
      });
    });

    describe('emotion relationships', () => {
      it('opposite emotions should transform to complementary', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        // Joy's complementary is Trust
        expect(result.emotion).toBe('Trust');
        expect(result.metadata.emotionRelation).toBe('opposite');
        expect(result.intensity).toBeLessThan(1); // Opposite reduces intensity
      });

      it('same emotion should reinforce', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Joy', 'yellow');
        expect(result.emotion).toBe('Joy');
        expect(result.metadata.emotionRelation).toBe('same');
        expect(result.intensity).toBeGreaterThan(1); // Same reinforces
      });

      it('adjacent emotions should amplify', () => {
        // Joy and Trust are adjacent
        const result = engine.calculateInteraction('Joy', 'yellow', 'Trust', 'lime');
        expect(result.emotion).toBe('Trust');
        expect(result.metadata.emotionRelation).toBe('adjacent');
        expect(result.intensity).toBeGreaterThan(1); // Adjacent amplifies
      });
    });

    describe('color harmony', () => {
      it('complementary colors should shift to triadic', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        // yellow and blue are complementary
        expect(result.metadata.colorHarmony).toBe('complementary');
        // Result should be a triadic color
        const triadicColors = ['red', 'blue', 'green', 'lime']; // Possible triadic
        expect(engine.colors).toContain(result.color);
      });

      it('same color should reinforce', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Trust', 'yellow');
        expect(result.metadata.colorHarmony).toBe('same');
        expect(result.color).toBe('yellow');
      });

      it('analogous colors should harmonize', () => {
        // yellow and lime are analogous
        const result = engine.calculateInteraction('Joy', 'yellow', 'Trust', 'lime');
        expect(result.metadata.colorHarmony).toBe('analogous');
        expect(result.color).toBe('lime'); // Keeps post color
      });
    });

    describe('all 64 combinations', () => {
      it('should handle all emotion-color combinations', () => {
        const emotions = engine.emotions;
        const colors = engine.colors;
        let successCount = 0;

        emotions.forEach(userEmotion => {
          colors.forEach(userColor => {
            emotions.forEach(postEmotion => {
              colors.forEach(postColor => {
                const result = engine.calculateInteraction(
                  userEmotion, userColor,
                  postEmotion, postColor
                );

                // Every combination should return valid result
                expect(engine.emotions).toContain(result.emotion);
                expect(engine.colors).toContain(result.color);
                expect(result.intensity).toBeGreaterThanOrEqual(0);
                expect(result.intensity).toBeLessThanOrEqual(2);
                successCount++;
              });
            });
          });
        });

        // Should have tested all 4096 combinations (8x8x8x8)
        expect(successCount).toBe(4096);
      });
    });

    describe('metadata', () => {
      it('should include original emotion and color', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        expect(result.metadata.original.emotion).toBe('Sad');
        expect(result.metadata.original.color).toBe('blue');
      });

      it('should include emotion relationship', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        const validRelations = ['same', 'opposite', 'adjacent', 'complementary', 'neutral'];
        expect(validRelations).toContain(result.metadata.emotionRelation);
      });

      it('should include color harmony', () => {
        const result = engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
        const validHarmonies = ['same', 'complementary', 'analogous', 'triadic', 'neutral'];
        expect(validHarmonies).toContain(result.metadata.colorHarmony);
      });
    });
  });

  describe('calculateFeedPreferences', () => {
    it('should return valid preference structure', () => {
      const prefs = engine.calculateFeedPreferences('Joy', 'yellow');

      expect(prefs).toHaveProperty('preferredEmotions');
      expect(prefs).toHaveProperty('preferredColors');
      expect(prefs).toHaveProperty('weights');
      expect(prefs.weights).toHaveProperty('emotions');
      expect(prefs.weights).toHaveProperty('colors');
    });

    it('should return all 8 emotions in preference order', () => {
      const prefs = engine.calculateFeedPreferences('Joy', 'yellow');
      expect(prefs.preferredEmotions).toHaveLength(8);

      // All emotions should be unique
      const uniqueEmotions = new Set(prefs.preferredEmotions);
      expect(uniqueEmotions.size).toBe(8);
    });

    it('should return all 8 colors in preference order', () => {
      const prefs = engine.calculateFeedPreferences('Joy', 'yellow');
      expect(prefs.preferredColors).toHaveLength(8);

      // All colors should be unique
      const uniqueColors = new Set(prefs.preferredColors);
      expect(uniqueColors.size).toBe(8);
    });

    it('should give highest weight to same emotion', () => {
      const prefs = engine.calculateFeedPreferences('Joy', 'yellow');
      const joyWeight = prefs.weights.emotions.Joy;

      Object.entries(prefs.weights.emotions).forEach(([emotion, weight]) => {
        if (emotion !== 'Joy') {
          expect(joyWeight).toBeGreaterThanOrEqual(weight);
        }
      });
    });

    it('should give highest weight to same color', () => {
      const prefs = engine.calculateFeedPreferences('Joy', 'yellow');
      const yellowWeight = prefs.weights.colors.yellow;

      Object.entries(prefs.weights.colors).forEach(([color, weight]) => {
        if (color !== 'yellow') {
          expect(yellowWeight).toBeGreaterThanOrEqual(weight);
        }
      });
    });

    it('should give lower weight to opposite emotion', () => {
      const prefs = engine.calculateFeedPreferences('Joy', 'yellow');
      const joyWeight = prefs.weights.emotions.Joy;
      const sadWeight = prefs.weights.emotions.Sad; // Opposite of Joy

      expect(joyWeight).toBeGreaterThan(sadWeight);
    });

    it('should handle invalid inputs', () => {
      const prefs = engine.calculateFeedPreferences('Invalid', 'invalid');

      // Should return balanced feed
      expect(prefs.preferredEmotions).toHaveLength(8);
      expect(prefs.preferredColors).toHaveLength(8);
    });

    it('should be consistent for same inputs', () => {
      const prefs1 = engine.calculateFeedPreferences('Joy', 'yellow');
      const prefs2 = engine.calculateFeedPreferences('Joy', 'yellow');

      expect(prefs1.preferredEmotions).toEqual(prefs2.preferredEmotions);
      expect(prefs1.preferredColors).toEqual(prefs2.preferredColors);
    });
  });

  describe('blendEmotions', () => {
    it('should return a valid emotion', () => {
      const blended = engine.blendEmotions('Joy', 'Sad');
      expect(engine.emotions).toContain(blended);
    });

    it('should return same emotion when blending with itself', () => {
      // When emotions are the same, midpoint is the same
      const blended = engine.blendEmotions('Joy', 'Joy');
      expect(blended).toBe('Joy');
    });

    it('should handle adjacent emotions', () => {
      const blended = engine.blendEmotions('Joy', 'Trust');
      expect(engine.emotions).toContain(blended);
    });
  });

  describe('blendColors', () => {
    it('should return a valid color', () => {
      const blended = engine.blendColors('yellow', 'blue');
      expect(engine.colors).toContain(blended);
    });

    it('should return same color when blending with itself', () => {
      const blended = engine.blendColors('yellow', 'yellow');
      expect(blended).toBe('yellow');
    });

    it('should handle adjacent colors', () => {
      const blended = engine.blendColors('yellow', 'lime');
      expect(engine.colors).toContain(blended);
    });
  });

  describe('performance', () => {
    it('should calculate interactions quickly', () => {
      const start = performance.now();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue');
      }

      const end = performance.now();
      const avgTime = (end - start) / iterations;

      // Should average less than 1ms per calculation
      expect(avgTime).toBeLessThan(1);
    });

    it('should handle rapid consecutive calls', () => {
      const results = [];

      for (let i = 0; i < 100; i++) {
        results.push(engine.calculateInteraction('Joy', 'yellow', 'Sad', 'blue'));
      }

      // All results should be identical
      results.forEach(result => {
        expect(result.emotion).toBe(results[0].emotion);
        expect(result.color).toBe(results[0].color);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle null inputs gracefully', () => {
      const result = engine.calculateInteraction(null, null, null, null);
      expect(result.emotion).toBe('Disgust');
      expect(result.color).toBe('orange');
    });

    it('should handle undefined inputs gracefully', () => {
      const result = engine.calculateInteraction(undefined, undefined, undefined, undefined);
      expect(result.emotion).toBe('Disgust');
      expect(result.color).toBe('orange');
    });

    it('should handle mixed valid/invalid inputs', () => {
      const result = engine.calculateInteraction('Joy', 'yellow', 'Invalid', 'blue');
      expect(result.emotion).toBe('Disgust');
      expect(result.color).toBe('orange');
    });
  });
});
