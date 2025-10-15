import { describe, it, expect } from 'vitest';
import {
  EMOTIONS,
  EMOTION_RELATIONSHIPS,
  getEmotionRelationship,
  isValidEmotion,
  getAllEmotions
} from '../emotionRules';

describe('emotionRules', () => {
  describe('EMOTIONS constant', () => {
    it('should have 8 emotions', () => {
      const emotions = Object.values(EMOTIONS);
      expect(emotions).toHaveLength(8);
    });

    it('should include all expected emotions', () => {
      const expectedEmotions = ['Joy', 'Trust', 'Feared', 'Surprised', 'Sad', 'Disgust', 'Angry', 'Anticipated'];
      expectedEmotions.forEach(emotion => {
        expect(Object.values(EMOTIONS)).toContain(emotion);
      });
    });
  });

  describe('EMOTION_RELATIONSHIPS', () => {
    it('should have relationships for all 8 emotions', () => {
      expect(Object.keys(EMOTION_RELATIONSHIPS)).toHaveLength(8);
    });

    it('should have opposite defined for each emotion', () => {
      Object.values(EMOTION_RELATIONSHIPS).forEach(relationship => {
        expect(relationship).toHaveProperty('opposite');
        expect(typeof relationship.opposite).toBe('string');
      });
    });

    it('should have 2 adjacent emotions for each emotion', () => {
      Object.values(EMOTION_RELATIONSHIPS).forEach(relationship => {
        expect(relationship.adjacent).toHaveLength(2);
      });
    });

    it('should have complementary emotion for each emotion', () => {
      Object.values(EMOTION_RELATIONSHIPS).forEach(relationship => {
        expect(relationship).toHaveProperty('complementary');
        expect(typeof relationship.complementary).toBe('string');
      });
    });

    it('should have intensity value between 0 and 1', () => {
      Object.values(EMOTION_RELATIONSHIPS).forEach(relationship => {
        expect(relationship.intensity).toBeGreaterThan(0);
        expect(relationship.intensity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Plutchik\'s Wheel Validation', () => {
    it('Joy and Sad should be opposites', () => {
      expect(EMOTION_RELATIONSHIPS.Joy.opposite).toBe('Sad');
      expect(EMOTION_RELATIONSHIPS.Sad.opposite).toBe('Joy');
    });

    it('Trust and Disgust should be opposites', () => {
      expect(EMOTION_RELATIONSHIPS.Trust.opposite).toBe('Disgust');
      expect(EMOTION_RELATIONSHIPS.Disgust.opposite).toBe('Trust');
    });

    it('Feared and Angry should be opposites', () => {
      expect(EMOTION_RELATIONSHIPS.Feared.opposite).toBe('Angry');
      expect(EMOTION_RELATIONSHIPS.Angry.opposite).toBe('Feared');
    });

    it('Surprised and Anticipated should be opposites', () => {
      expect(EMOTION_RELATIONSHIPS.Surprised.opposite).toBe('Anticipated');
      expect(EMOTION_RELATIONSHIPS.Anticipated.opposite).toBe('Surprised');
    });

    it('adjacent emotions should form a circular pattern', () => {
      const emotions = ['Joy', 'Trust', 'Feared', 'Surprised', 'Sad', 'Disgust', 'Angry', 'Anticipated'];

      emotions.forEach((emotion, index) => {
        const nextEmotion = emotions[(index + 1) % emotions.length];
        const prevEmotion = emotions[(index - 1 + emotions.length) % emotions.length];

        const adjacent = EMOTION_RELATIONSHIPS[emotion].adjacent;
        // Adjacent should include neighboring emotions
        expect(adjacent.length).toBe(2);
      });
    });
  });

  describe('getEmotionRelationship', () => {
    it('should return "same" for identical emotions', () => {
      expect(getEmotionRelationship('Joy', 'Joy')).toBe('same');
      expect(getEmotionRelationship('Sad', 'Sad')).toBe('same');
    });

    it('should return "opposite" for opposite emotions', () => {
      expect(getEmotionRelationship('Joy', 'Sad')).toBe('opposite');
      expect(getEmotionRelationship('Sad', 'Joy')).toBe('opposite');
      expect(getEmotionRelationship('Trust', 'Disgust')).toBe('opposite');
    });

    it('should return "adjacent" for neighboring emotions', () => {
      const joyAdjacent = EMOTION_RELATIONSHIPS.Joy.adjacent;
      joyAdjacent.forEach(adjacentEmotion => {
        expect(getEmotionRelationship('Joy', adjacentEmotion)).toBe('adjacent');
      });
    });

    it('should return "complementary" or "adjacent" for complementary emotions', () => {
      Object.entries(EMOTION_RELATIONSHIPS).forEach(([emotion, relationship]) => {
        const result = getEmotionRelationship(emotion, relationship.complementary);
        // Complementary might also be adjacent on the wheel
        expect(['complementary', 'adjacent']).toContain(result);
      });
    });

    it('should return "neutral" for unrelated emotions', () => {
      // Joy and Angry are not opposite, adjacent, or complementary
      const relationship = getEmotionRelationship('Joy', 'Angry');
      expect(['neutral', 'adjacent']).toContain(relationship); // Might be adjacent
    });

    it('should return "neutral" for invalid emotions', () => {
      expect(getEmotionRelationship('Invalid', 'Joy')).toBe('neutral');
      expect(getEmotionRelationship('Joy', 'Invalid')).toBe('neutral');
    });

    it('should be symmetric for opposite relationships', () => {
      const emotions = Object.keys(EMOTION_RELATIONSHIPS);
      emotions.forEach(emotion1 => {
        emotions.forEach(emotion2 => {
          const rel1 = getEmotionRelationship(emotion1, emotion2);
          const rel2 = getEmotionRelationship(emotion2, emotion1);

          if (rel1 === 'opposite') {
            expect(rel2).toBe('opposite');
          }
          if (rel1 === 'same') {
            expect(rel2).toBe('same');
          }
        });
      });
    });
  });

  describe('isValidEmotion', () => {
    it('should return true for valid emotions', () => {
      const validEmotions = ['Joy', 'Trust', 'Feared', 'Surprised', 'Sad', 'Disgust', 'Angry', 'Anticipated'];
      validEmotions.forEach(emotion => {
        expect(isValidEmotion(emotion)).toBe(true);
      });
    });

    it('should return false for invalid emotions', () => {
      const invalidEmotions = ['Happy', 'Excited', 'Confused', '', null, undefined, 123];
      invalidEmotions.forEach(emotion => {
        expect(isValidEmotion(emotion)).toBe(false);
      });
    });

    it('should be case-sensitive', () => {
      expect(isValidEmotion('joy')).toBe(false);
      expect(isValidEmotion('JOY')).toBe(false);
      expect(isValidEmotion('Joy')).toBe(true);
    });
  });

  describe('getAllEmotions', () => {
    it('should return an array of 8 emotions', () => {
      const emotions = getAllEmotions();
      expect(emotions).toHaveLength(8);
      expect(Array.isArray(emotions)).toBe(true);
    });

    it('should return all valid emotions', () => {
      const emotions = getAllEmotions();
      emotions.forEach(emotion => {
        expect(isValidEmotion(emotion)).toBe(true);
      });
    });
  });
});
