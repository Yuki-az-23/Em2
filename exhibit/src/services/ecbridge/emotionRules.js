/**
 * Emotion Relationship Rules
 * Based on Plutchik's Wheel of Emotions
 *
 * Each emotion has:
 * - opposite: The contrasting emotion
 * - adjacent: Neighboring emotions on the wheel
 * - complementary: The emotion that balances it
 */

export const EMOTIONS = {
  Joy: 'Joy',
  Trust: 'Trust',
  Feared: 'Feared',
  Surprised: 'Surprised',
  Sad: 'Sad',
  Disgust: 'Disgust',
  Angry: 'Angry',
  Anticipated: 'Anticipated'
};

export const EMOTION_RELATIONSHIPS = {
  [EMOTIONS.Joy]: {
    opposite: EMOTIONS.Sad,
    adjacent: [EMOTIONS.Trust, EMOTIONS.Anticipated],
    complementary: EMOTIONS.Trust,
    intensity: 1.0
  },
  [EMOTIONS.Trust]: {
    opposite: EMOTIONS.Disgust,
    adjacent: [EMOTIONS.Joy, EMOTIONS.Feared],
    complementary: EMOTIONS.Joy,
    intensity: 0.9
  },
  [EMOTIONS.Feared]: {
    opposite: EMOTIONS.Angry,
    adjacent: [EMOTIONS.Trust, EMOTIONS.Surprised],
    complementary: EMOTIONS.Surprised,
    intensity: 0.8
  },
  [EMOTIONS.Surprised]: {
    opposite: EMOTIONS.Anticipated,
    adjacent: [EMOTIONS.Feared, EMOTIONS.Sad],
    complementary: EMOTIONS.Feared,
    intensity: 0.7
  },
  [EMOTIONS.Sad]: {
    opposite: EMOTIONS.Joy,
    adjacent: [EMOTIONS.Surprised, EMOTIONS.Disgust],
    complementary: EMOTIONS.Disgust,
    intensity: 0.6
  },
  [EMOTIONS.Disgust]: {
    opposite: EMOTIONS.Trust,
    adjacent: [EMOTIONS.Sad, EMOTIONS.Angry],
    complementary: EMOTIONS.Sad,
    intensity: 0.7
  },
  [EMOTIONS.Angry]: {
    opposite: EMOTIONS.Feared,
    adjacent: [EMOTIONS.Disgust, EMOTIONS.Anticipated],
    complementary: EMOTIONS.Anticipated,
    intensity: 0.9
  },
  [EMOTIONS.Anticipated]: {
    opposite: EMOTIONS.Surprised,
    adjacent: [EMOTIONS.Angry, EMOTIONS.Joy],
    complementary: EMOTIONS.Angry,
    intensity: 0.8
  }
};

/**
 * Get the relationship type between two emotions
 */
export function getEmotionRelationship(emotion1, emotion2) {
  if (!EMOTION_RELATIONSHIPS[emotion1]) {
    return 'neutral';
  }

  const rules = EMOTION_RELATIONSHIPS[emotion1];

  if (emotion1 === emotion2) {
    return 'same';
  } else if (rules.opposite === emotion2) {
    return 'opposite';
  } else if (rules.adjacent.includes(emotion2)) {
    return 'adjacent';
  } else if (rules.complementary === emotion2) {
    return 'complementary';
  }

  return 'neutral';
}

/**
 * Validate if a string is a valid emotion
 */
export function isValidEmotion(emotion) {
  return Object.values(EMOTIONS).includes(emotion);
}

/**
 * Get all emotions as an array
 */
export function getAllEmotions() {
  return Object.values(EMOTIONS);
}
