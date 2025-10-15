import { describe, it, expect } from 'vitest';
import {
  COLORS,
  COLOR_HARMONY,
  getColorHarmony,
  isValidColor,
  getAllColors,
  getColorTemperatureDifference
} from '../colorRules';

describe('colorRules', () => {
  describe('COLORS constant', () => {
    it('should have 8 colors', () => {
      const colors = Object.values(COLORS);
      expect(colors).toHaveLength(8);
    });

    it('should include all expected colors', () => {
      const expectedColors = ['yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange'];
      expectedColors.forEach(color => {
        expect(Object.values(COLORS)).toContain(color);
      });
    });
  });

  describe('COLOR_HARMONY', () => {
    it('should have harmony rules for all 8 colors', () => {
      expect(Object.keys(COLOR_HARMONY)).toHaveLength(8);
    });

    it('should have complementary color for each color', () => {
      Object.values(COLOR_HARMONY).forEach(harmony => {
        expect(harmony).toHaveProperty('complementary');
        expect(typeof harmony.complementary).toBe('string');
      });
    });

    it('should have 2 analogous colors for each color', () => {
      Object.values(COLOR_HARMONY).forEach(harmony => {
        expect(harmony.analogous).toHaveLength(2);
      });
    });

    it('should have 2 or 3 triadic colors for each color', () => {
      Object.values(COLOR_HARMONY).forEach(harmony => {
        expect(harmony.triadic.length).toBeGreaterThanOrEqual(2);
        expect(harmony.triadic.length).toBeLessThanOrEqual(3);
      });
    });

    it('should have warmth value between 0 and 1', () => {
      Object.values(COLOR_HARMONY).forEach(harmony => {
        expect(harmony.warmth).toBeGreaterThanOrEqual(0);
        expect(harmony.warmth).toBeLessThanOrEqual(1);
      });
    });

    it('should have intensity value between 0 and 1', () => {
      Object.values(COLOR_HARMONY).forEach(harmony => {
        expect(harmony.intensity).toBeGreaterThanOrEqual(0);
        expect(harmony.intensity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Color Theory Validation', () => {
    it('yellow and blue should be complementary', () => {
      expect(COLOR_HARMONY.yellow.complementary).toBe('blue');
      expect(COLOR_HARMONY.blue.complementary).toBe('yellow');
    });

    it('red and green should be complementary', () => {
      expect(COLOR_HARMONY.red.complementary).toBe('green');
      expect(COLOR_HARMONY.green.complementary).toBe('red');
    });

    it('orange and aqua should be complementary', () => {
      expect(COLOR_HARMONY.orange.complementary).toBe('aqua');
      expect(COLOR_HARMONY.aqua.complementary).toBe('orange');
    });

    it('warm colors should have high warmth values', () => {
      const warmColors = ['red', 'orange', 'yellow'];
      warmColors.forEach(color => {
        expect(COLOR_HARMONY[color].warmth).toBeGreaterThan(0.7);
      });
    });

    it('cool colors should have low warmth values', () => {
      const coolColors = ['blue', 'aqua', 'green'];
      coolColors.forEach(color => {
        expect(COLOR_HARMONY[color].warmth).toBeLessThan(0.6);
      });
    });

    it('analogous colors should be adjacent on color wheel', () => {
      // Yellow's analogous should be lime and orange (neighbors)
      expect(COLOR_HARMONY.yellow.analogous).toContain('lime');
      expect(COLOR_HARMONY.yellow.analogous).toContain('orange');
    });
  });

  describe('getColorHarmony', () => {
    it('should return "same" for identical colors', () => {
      expect(getColorHarmony('yellow', 'yellow')).toBe('same');
      expect(getColorHarmony('blue', 'blue')).toBe('same');
    });

    it('should return "complementary" for complementary colors', () => {
      expect(getColorHarmony('yellow', 'blue')).toBe('complementary');
      expect(getColorHarmony('blue', 'yellow')).toBe('complementary');
      expect(getColorHarmony('red', 'green')).toBe('complementary');
    });

    it('should return "analogous" for analogous colors', () => {
      const yellowAnalogous = COLOR_HARMONY.yellow.analogous;
      yellowAnalogous.forEach(color => {
        expect(getColorHarmony('yellow', color)).toBe('analogous');
      });
    });

    it('should return "triadic" or "complementary" for triadic colors', () => {
      const yellowTriadic = COLOR_HARMONY.yellow.triadic;
      yellowTriadic.forEach(color => {
        const harmony = getColorHarmony('yellow', color);
        // Triadic might also be complementary
        expect(['triadic', 'complementary']).toContain(harmony);
      });
    });

    it('should return "neutral" for invalid colors', () => {
      expect(getColorHarmony('invalid', 'yellow')).toBe('neutral');
      expect(getColorHarmony('yellow', 'invalid')).toBe('neutral');
    });

    it('should be symmetric for complementary relationships', () => {
      const colors = Object.keys(COLOR_HARMONY);
      colors.forEach(color1 => {
        colors.forEach(color2 => {
          const harmony1 = getColorHarmony(color1, color2);
          const harmony2 = getColorHarmony(color2, color1);

          if (harmony1 === 'complementary') {
            expect(harmony2).toBe('complementary');
          }
          if (harmony1 === 'same') {
            expect(harmony2).toBe('same');
          }
        });
      });
    });

    it('should return valid harmony for all color pairs', () => {
      const colors = Object.keys(COLOR_HARMONY);
      const validHarmonies = ['same', 'complementary', 'analogous', 'triadic', 'neutral'];

      colors.forEach(color1 => {
        colors.forEach(color2 => {
          const harmony = getColorHarmony(color1, color2);
          expect(validHarmonies).toContain(harmony);
        });
      });
    });
  });

  describe('isValidColor', () => {
    it('should return true for valid colors', () => {
      const validColors = ['yellow', 'lime', 'green', 'aqua', 'blue', 'pink', 'red', 'orange'];
      validColors.forEach(color => {
        expect(isValidColor(color)).toBe(true);
      });
    });

    it('should return false for invalid colors', () => {
      const invalidColors = ['black', 'white', 'purple', '', null, undefined, 123];
      invalidColors.forEach(color => {
        expect(isValidColor(color)).toBe(false);
      });
    });

    it('should be case-sensitive', () => {
      expect(isValidColor('Yellow')).toBe(false);
      expect(isValidColor('YELLOW')).toBe(false);
      expect(isValidColor('yellow')).toBe(true);
    });
  });

  describe('getAllColors', () => {
    it('should return an array of 8 colors', () => {
      const colors = getAllColors();
      expect(colors).toHaveLength(8);
      expect(Array.isArray(colors)).toBe(true);
    });

    it('should return all valid colors', () => {
      const colors = getAllColors();
      colors.forEach(color => {
        expect(isValidColor(color)).toBe(true);
      });
    });
  });

  describe('getColorTemperatureDifference', () => {
    it('should return 0 for the same color', () => {
      expect(getColorTemperatureDifference('yellow', 'yellow')).toBe(0);
    });

    it('should return high difference for warm vs cool colors', () => {
      const diff = getColorTemperatureDifference('red', 'blue');
      expect(diff).toBeGreaterThan(0.5);
    });

    it('should return low difference for similar temperature colors', () => {
      const diff = getColorTemperatureDifference('red', 'orange');
      expect(diff).toBeLessThan(0.3);
    });

    it('should be symmetric', () => {
      const colors = Object.keys(COLOR_HARMONY);
      colors.forEach(color1 => {
        colors.forEach(color2 => {
          const diff1 = getColorTemperatureDifference(color1, color2);
          const diff2 = getColorTemperatureDifference(color2, color1);
          expect(diff1).toBe(diff2);
        });
      });
    });

    it('should return a value between 0 and 1', () => {
      const colors = Object.keys(COLOR_HARMONY);
      colors.forEach(color1 => {
        colors.forEach(color2 => {
          const diff = getColorTemperatureDifference(color1, color2);
          expect(diff).toBeGreaterThanOrEqual(0);
          expect(diff).toBeLessThanOrEqual(1);
        });
      });
    });
  });
});
