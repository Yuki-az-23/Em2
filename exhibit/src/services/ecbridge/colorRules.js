/**
 * Color Harmony Rules
 * Based on color theory and the color wheel
 *
 * Each color has:
 * - complementary: Opposite color on the wheel (highest contrast)
 * - analogous: Adjacent colors (harmonious)
 * - triadic: Colors forming a triangle on the wheel (balanced)
 * - warmth: How warm (1.0) or cool (0.0) the color is
 * - intensity: Base intensity value
 */

export const COLORS = {
  yellow: 'yellow',
  lime: 'lime',
  green: 'green',
  aqua: 'aqua',
  blue: 'blue',
  pink: 'pink',
  red: 'red',
  orange: 'orange'
};

export const COLOR_HARMONY = {
  [COLORS.yellow]: {
    complementary: COLORS.blue,
    analogous: [COLORS.lime, COLORS.orange],
    triadic: [COLORS.red, COLORS.blue],
    warmth: 1.0,
    intensity: 0.9
  },
  [COLORS.lime]: {
    complementary: COLORS.pink,
    analogous: [COLORS.yellow, COLORS.green],
    triadic: [COLORS.pink, COLORS.blue],
    warmth: 0.7,
    intensity: 0.8
  },
  [COLORS.green]: {
    complementary: COLORS.red,
    analogous: [COLORS.lime, COLORS.aqua],
    triadic: [COLORS.orange, COLORS.pink],
    warmth: 0.5,
    intensity: 0.7
  },
  [COLORS.aqua]: {
    complementary: COLORS.orange,
    analogous: [COLORS.green, COLORS.blue],
    triadic: [COLORS.yellow, COLORS.red],
    warmth: 0.3,
    intensity: 0.8
  },
  [COLORS.blue]: {
    complementary: COLORS.yellow,
    analogous: [COLORS.aqua, COLORS.pink],
    triadic: [COLORS.red, COLORS.lime],
    warmth: 0.2,
    intensity: 0.9
  },
  [COLORS.pink]: {
    complementary: COLORS.lime,
    analogous: [COLORS.blue, COLORS.red],
    triadic: [COLORS.yellow, COLORS.green],
    warmth: 0.8,
    intensity: 0.7
  },
  [COLORS.red]: {
    complementary: COLORS.green,
    analogous: [COLORS.pink, COLORS.orange],
    triadic: [COLORS.blue, COLORS.yellow],
    warmth: 1.0,
    intensity: 1.0
  },
  [COLORS.orange]: {
    complementary: COLORS.aqua,
    analogous: [COLORS.red, COLORS.yellow],
    triadic: [COLORS.lime, COLORS.pink],
    warmth: 0.9,
    intensity: 0.9
  }
};

/**
 * Get the harmony type between two colors
 */
export function getColorHarmony(color1, color2) {
  if (!COLOR_HARMONY[color1]) {
    return 'neutral';
  }

  const harmony = COLOR_HARMONY[color1];

  if (color1 === color2) {
    return 'same';
  } else if (harmony.complementary === color2) {
    return 'complementary';
  } else if (harmony.analogous.includes(color2)) {
    return 'analogous';
  } else if (harmony.triadic.includes(color2)) {
    return 'triadic';
  }

  return 'neutral';
}

/**
 * Validate if a string is a valid color
 */
export function isValidColor(color) {
  return Object.values(COLORS).includes(color);
}

/**
 * Get all colors as an array
 */
export function getAllColors() {
  return Object.values(COLORS);
}

/**
 * Get color temperature difference (used for calculating blend results)
 */
export function getColorTemperatureDifference(color1, color2) {
  const warmth1 = COLOR_HARMONY[color1]?.warmth || 0.5;
  const warmth2 = COLOR_HARMONY[color2]?.warmth || 0.5;
  return Math.abs(warmth1 - warmth2);
}
