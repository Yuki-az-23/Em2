/**
 * ECBridge Engine - The Heart of EM2
 *
 * This engine calculates how emotions and colors interact when users
 * engage with posts. It replaces the old 13,046 lines of if statements
 * with a rule-based system that's testable, maintainable, and extensible.
 *
 * @module ECBridgeEngine
 */

import {
  EMOTION_RELATIONSHIPS,
  getEmotionRelationship,
  getAllEmotions
} from './emotionRules';

import {
  COLOR_HARMONY,
  getColorHarmony,
  getAllColors,
  getColorTemperatureDifference
} from './colorRules';

/**
 * Main ECBridge calculation engine
 */
export class ECBridgeEngine {
  constructor() {
    this.emotions = getAllEmotions();
    this.colors = getAllColors();
  }

  /**
   * Calculate the emotional response when a user interacts with a post
   *
   * @param {string} userEmotion - User's current emotion
   * @param {string} userColor - User's current color
   * @param {string} postEmotion - Post's current emotion
   * @param {string} postColor - Post's current color
   * @returns {{emotion: string, color: string, intensity: number, confidence: number}}
   */
  calculateInteraction(userEmotion, userColor, postEmotion, postColor) {
    // Validate inputs
    if (!this.emotions.includes(userEmotion) || !this.emotions.includes(postEmotion)) {
      console.warn('Invalid emotion provided, using default');
      return this.getDefaultResult();
    }

    if (!this.colors.includes(userColor) || !this.colors.includes(postColor)) {
      console.warn('Invalid color provided, using default');
      return this.getDefaultResult();
    }

    // 1. Determine emotion relationship
    const emotionRelation = getEmotionRelationship(userEmotion, postEmotion);

    // 2. Determine color harmony
    const colorHarmony = getColorHarmony(userColor, postColor);

    // 3. Calculate result based on both factors
    const result = this.applyRules(
      userEmotion,
      userColor,
      postEmotion,
      postColor,
      emotionRelation,
      colorHarmony
    );

    return result;
  }

  /**
   * Apply interaction rules based on emotion relationship and color harmony
   */
  applyRules(userEmotion, userColor, postEmotion, postColor, emotionRelation, colorHarmony) {
    let resultEmotion = postEmotion;
    let resultColor = postColor;
    let intensity = 1.0;
    let confidence = 1.0;

    // === EMOTION RULES ===

    switch (emotionRelation) {
      case 'opposite':
        // Opposite emotions create transformation to complementary emotion
        resultEmotion = EMOTION_RELATIONSHIPS[userEmotion].complementary;
        intensity = 0.8;
        confidence = 0.9;
        break;

      case 'adjacent':
        // Adjacent emotions amplify the post emotion
        resultEmotion = postEmotion;
        intensity = 1.3;
        confidence = 1.0;
        break;

      case 'complementary':
        // Complementary emotions create balance - blend toward user emotion
        resultEmotion = this.blendEmotions(userEmotion, postEmotion);
        intensity = 1.0;
        confidence = 0.85;
        break;

      case 'same':
        // Same emotion reinforces and intensifies
        resultEmotion = postEmotion;
        intensity = 1.5;
        confidence = 1.0;
        break;

      case 'neutral':
        // Neutral relationship - slight shift toward user emotion
        resultEmotion = postEmotion;
        intensity = 0.9;
        confidence = 0.7;
        break;
    }

    // === COLOR RULES ===

    switch (colorHarmony) {
      case 'complementary':
        // High contrast - shift to triadic color for balance
        const triadic = COLOR_HARMONY[userColor].triadic;
        resultColor = this.getCloserTriadicColor(triadic, postColor);
        intensity *= 1.1;
        break;

      case 'analogous':
        // Harmonious - keep post color or slightly adjust
        resultColor = postColor;
        intensity *= 1.0;
        break;

      case 'triadic':
        // Balanced - blend colors
        resultColor = this.blendColors(userColor, postColor);
        intensity *= 0.95;
        break;

      case 'same':
        // Reinforce with user color
        resultColor = userColor;
        intensity *= 1.2;
        break;

      case 'neutral':
        // Slight shift toward user color
        resultColor = this.blendColors(userColor, postColor);
        intensity *= 0.9;
        break;
    }

    // Apply intensity modifiers based on base emotion intensity
    const baseIntensity = EMOTION_RELATIONSHIPS[resultEmotion]?.intensity || 1.0;
    intensity = Math.min(intensity * baseIntensity, 2.0); // Cap at 2x

    return {
      emotion: resultEmotion,
      color: resultColor,
      intensity: parseFloat(intensity.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(2)),
      metadata: {
        emotionRelation,
        colorHarmony,
        original: {
          emotion: postEmotion,
          color: postColor
        }
      }
    };
  }

  /**
   * Blend two emotions to find a middle ground
   * Uses the emotion wheel position to calculate
   */
  blendEmotions(emotion1, emotion2) {
    const idx1 = this.emotions.indexOf(emotion1);
    const idx2 = this.emotions.indexOf(emotion2);

    if (idx1 === -1 || idx2 === -1) {
      return emotion2; // fallback
    }

    // Calculate midpoint on circular wheel
    let midIdx = Math.floor((idx1 + idx2) / 2);

    // Handle wrap-around
    if (Math.abs(idx1 - idx2) > this.emotions.length / 2) {
      midIdx = (midIdx + this.emotions.length / 2) % this.emotions.length;
    }

    return this.emotions[midIdx];
  }

  /**
   * Blend two colors to find a middle ground
   * Uses color temperature and position on wheel
   */
  blendColors(color1, color2) {
    const idx1 = this.colors.indexOf(color1);
    const idx2 = this.colors.indexOf(color2);

    if (idx1 === -1 || idx2 === -1) {
      return color2; // fallback
    }

    // Calculate midpoint on circular wheel
    let midIdx = Math.floor((idx1 + idx2) / 2);

    // Handle wrap-around
    if (Math.abs(idx1 - idx2) > this.colors.length / 2) {
      midIdx = (midIdx + this.colors.length / 2) % this.colors.length;
    }

    return this.colors[midIdx];
  }

  /**
   * Get the triadic color closer to the post color
   */
  getCloserTriadicColor(triadicColors, postColor) {
    const postIdx = this.colors.indexOf(postColor);

    if (postIdx === -1 || !triadicColors || triadicColors.length === 0) {
      return triadicColors[0];
    }

    // Find which triadic color is closer on the wheel
    let closestColor = triadicColors[0];
    let minDistance = Infinity;

    triadicColors.forEach(color => {
      const colorIdx = this.colors.indexOf(color);
      if (colorIdx !== -1) {
        const distance = Math.min(
          Math.abs(colorIdx - postIdx),
          this.colors.length - Math.abs(colorIdx - postIdx)
        );
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = color;
        }
      }
    });

    return closestColor;
  }

  /**
   * Get default result for error cases
   */
  getDefaultResult() {
    return {
      emotion: 'Disgust',
      color: 'orange',
      intensity: 1.0,
      confidence: 0.5,
      metadata: {
        emotionRelation: 'neutral',
        colorHarmony: 'neutral',
        original: {
          emotion: 'Unknown',
          color: 'unknown'
        }
      }
    };
  }

  /**
   * Calculate personalized feed filtering based on user's ECBridge state
   * This determines what posts a user should see in their feed
   *
   * @param {string} userEmotion - User's current emotion
   * @param {string} userColor - User's current color
   * @returns {{preferredEmotions: string[], preferredColors: string[], weights: object}}
   */
  calculateFeedPreferences(userEmotion, userColor) {
    if (!this.emotions.includes(userEmotion) || !this.colors.includes(userColor)) {
      // Return balanced feed if invalid input
      return {
        preferredEmotions: this.emotions,
        preferredColors: this.colors,
        weights: {}
      };
    }

    const emotionRules = EMOTION_RELATIONSHIPS[userEmotion];
    const colorRules = COLOR_HARMONY[userColor];

    // Build preference list with weights
    const emotionWeights = {};
    const colorWeights = {};

    // Same emotion gets highest weight
    emotionWeights[userEmotion] = 1.5;

    // Adjacent emotions get high weight (amplification effect)
    emotionRules.adjacent.forEach(emotion => {
      emotionWeights[emotion] = 1.3;
    });

    // Complementary emotion gets medium-high weight
    emotionWeights[emotionRules.complementary] = 1.2;

    // Opposite emotion gets low weight (transformation is interesting)
    emotionWeights[emotionRules.opposite] = 0.8;

    // Other emotions get baseline weight
    this.emotions.forEach(emotion => {
      if (!emotionWeights[emotion]) {
        emotionWeights[emotion] = 1.0;
      }
    });

    // Similar logic for colors
    colorWeights[userColor] = 1.5;
    colorRules.analogous.forEach(color => {
      colorWeights[color] = 1.3;
    });
    colorWeights[colorRules.complementary] = 1.1;
    colorRules.triadic.forEach(color => {
      colorWeights[color] = 1.0;
    });

    // Fill in remaining colors
    this.colors.forEach(color => {
      if (!colorWeights[color]) {
        colorWeights[color] = 0.9;
      }
    });

    // Sort by weight and return preferred lists
    const preferredEmotions = Object.entries(emotionWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([emotion]) => emotion);

    const preferredColors = Object.entries(colorWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color);

    return {
      preferredEmotions,
      preferredColors,
      weights: {
        emotions: emotionWeights,
        colors: colorWeights
      }
    };
  }
}

// Singleton instance
export const ecBridgeEngine = new ECBridgeEngine();

// Export for testing
export default ECBridgeEngine;
