import { ECBridgeEngine } from './ECBridgeEngine.js';
import { supabase } from '../supabase/client.js';
import { updatePost } from '../post/postService.js';
import { createComment } from '../post/postService.js';

/**
 * ECBridge Integration Service
 * Connects the ECBridge algorithm with Supabase services
 */

// Create a singleton instance of the ECBridge engine
const engine = new ECBridgeEngine();

/**
 * Calculate emotion/color for a comment interaction
 * This determines what emotion/color the comment should have
 * based on the user's state and the post's state
 *
 * @param {Object} params - Interaction parameters
 * @param {string} params.userEmotion - User's current emotion
 * @param {string} params.userColor - User's current color
 * @param {string} params.postEmotion - Post's current emotion
 * @param {string} params.postColor - Post's current color
 * @returns {Object} Calculated emotion, color, and metadata
 *
 * @example
 * const result = calculateCommentEmotion({
 *   userEmotion: 'Joy',
 *   userColor: 'yellow',
 *   postEmotion: 'Sad',
 *   postColor: 'blue'
 * });
 * // Returns: { emotion: 'Trust', color: 'lime', intensity: 1.3, ... }
 */
export const calculateCommentEmotion = ({ userEmotion, userColor, postEmotion, postColor }) => {
  try {
    const result = engine.calculateInteraction(
      userEmotion,
      userColor,
      postEmotion,
      postColor
    );

    return {
      ...result,
      success: true,
      error: null
    };

  } catch (error) {
    console.error('Calculate comment emotion error:', error);
    return {
      emotion: 'Disgust', // Default fallback
      color: 'orange',
      intensity: 1.0,
      confidence: 0.5,
      success: false,
      error: {
        message: error.message || 'Failed to calculate emotion',
        code: 'ECBRIDGE_CALCULATION_ERROR'
      }
    };
  }
};

/**
 * Create a comment with ECBridge emotion/color calculation
 * Calculates the appropriate emotion/color and updates the post
 *
 * @param {Object} params - Comment parameters
 * @param {string} params.postId - Post ID
 * @param {string} params.userId - User ID (commenter)
 * @param {string} params.text - Comment text
 * @param {string} [params.parentCommentId] - Parent comment ID (for replies)
 * @param {string} params.userEmotion - User's current emotion
 * @param {string} params.userColor - User's current color
 * @param {string} params.postEmotion - Post's current emotion
 * @param {string} params.postColor - Post's current color
 * @returns {Promise<{comment: Object|null, postUpdate: Object|null, error: Error|null}>}
 *
 * @example
 * const result = await createCommentWithECBridge({
 *   postId: 'abc123',
 *   userId: 'user456',
 *   text: 'Great post!',
 *   userEmotion: 'Joy',
 *   userColor: 'yellow',
 *   postEmotion: 'Trust',
 *   postColor: 'lime'
 * });
 */
export const createCommentWithECBridge = async (params) => {
  try {
    const {
      postId,
      userId,
      text,
      parentCommentId,
      userEmotion,
      userColor,
      postEmotion,
      postColor
    } = params;

    // Calculate comment emotion/color using ECBridge
    const calculation = calculateCommentEmotion({
      userEmotion,
      userColor,
      postEmotion,
      postColor
    });

    if (!calculation.success) {
      throw new Error(calculation.error.message);
    }

    // Create the comment with calculated emotion/color
    const commentData = {
      post_id: postId,
      user_id: userId,
      text,
      parent_comment_id: parentCommentId,
      emotion: calculation.emotion,
      color: calculation.color
    };

    const { comment, error: commentError } = await createComment(commentData);

    if (commentError) {
      throw commentError;
    }

    // Log the ECBridge calculation
    await logECBridgeCalculation({
      userId,
      postId,
      commentId: comment.id,
      userEmotion,
      userColor,
      postEmotion,
      postColor,
      resultEmotion: calculation.emotion,
      resultColor: calculation.color,
      intensity: calculation.intensity,
      confidence: calculation.confidence,
      metadata: calculation.metadata
    });

    // Update post emotion/color based on the interaction
    // The post evolves emotionally with each interaction
    const postUpdateResult = await updatePost(postId, {
      emotion: calculation.emotion,
      color: calculation.color,
      intensity: calculation.intensity
    });

    return {
      comment,
      postUpdate: postUpdateResult.post,
      calculation,
      error: null
    };

  } catch (error) {
    console.error('Create comment with ECBridge error:', error);
    return {
      comment: null,
      postUpdate: null,
      calculation: null,
      error: {
        message: error.message || 'Failed to create comment with ECBridge',
        code: error.code || 'ECBRIDGE_COMMENT_ERROR'
      }
    };
  }
};

/**
 * Calculate user's feed preferences based on their ECBridge state
 * This determines what emotions/colors the user is most likely to engage with
 *
 * @param {Object} params - User parameters
 * @param {string} params.userEmotion - User's current emotion
 * @param {string} params.userColor - User's current color
 * @returns {Object} Feed preferences with scores
 *
 * @example
 * const prefs = calculateFeedPreferences({
 *   userEmotion: 'Joy',
 *   userColor: 'yellow'
 * });
 * // Returns array of { emotion, color, score } sorted by score
 */
export const calculateFeedPreferences = ({ userEmotion, userColor }) => {
  try {
    const preferences = engine.calculateFeedPreferences(userEmotion, userColor);

    return {
      preferences,
      success: true,
      error: null
    };

  } catch (error) {
    console.error('Calculate feed preferences error:', error);
    return {
      preferences: [],
      success: false,
      error: {
        message: error.message || 'Failed to calculate feed preferences',
        code: 'ECBRIDGE_FEED_ERROR'
      }
    };
  }
};

/**
 * Log an ECBridge calculation to the database
 * This helps with analytics and debugging
 *
 * @param {Object} logData - Log data
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const logECBridgeCalculation = async (logData) => {
  try {
    const { error } = await supabase
      .from('ecbridge_logs')
      .insert({
        user_id: logData.userId,
        post_id: logData.postId,
        comment_id: logData.commentId || null,
        user_emotion: logData.userEmotion,
        user_color: logData.userColor,
        post_emotion: logData.postEmotion,
        post_color: logData.postColor,
        result_emotion: logData.resultEmotion,
        result_color: logData.resultColor,
        intensity: logData.intensity,
        confidence: logData.confidence,
        metadata: logData.metadata || {}
      });

    if (error) throw error;

    return { success: true, error: null };

  } catch (error) {
    console.error('Log ECBridge calculation error:', error);
    return {
      success: false,
      error: {
        message: error.message || 'Failed to log calculation',
        code: error.code
      }
    };
  }
};

/**
 * Get ECBridge analytics for a user
 * Shows their interaction patterns and emotional journey
 *
 * @param {string} userId - User ID
 * @param {number} [limit=50] - Number of logs to fetch
 * @returns {Promise<{logs: Array, analytics: Object, error: Error|null}>}
 */
export const getECBridgeAnalytics = async (userId, limit = 50) => {
  try {
    const { data, error } = await supabase
      .from('ecbridge_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Calculate analytics
    const emotionCounts = {};
    const colorCounts = {};
    const avgIntensity = data.reduce((sum, log) => sum + (log.intensity || 0), 0) / data.length;
    const avgConfidence = data.reduce((sum, log) => sum + (log.confidence || 0), 0) / data.length;

    data.forEach(log => {
      emotionCounts[log.result_emotion] = (emotionCounts[log.result_emotion] || 0) + 1;
      colorCounts[log.result_color] = (colorCounts[log.result_color] || 0) + 1;
    });

    const analytics = {
      totalInteractions: data.length,
      avgIntensity: avgIntensity.toFixed(2),
      avgConfidence: avgConfidence.toFixed(2),
      mostFrequentEmotion: Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0],
      mostFrequentColor: Object.entries(colorCounts).sort((a, b) => b[1] - a[1])[0]?.[0],
      emotionDistribution: emotionCounts,
      colorDistribution: colorCounts
    };

    return {
      logs: data,
      analytics,
      error: null
    };

  } catch (error) {
    console.error('Get ECBridge analytics error:', error);
    return {
      logs: [],
      analytics: null,
      error: {
        message: error.message || 'Failed to get analytics',
        code: error.code
      }
    };
  }
};

/**
 * Get post's emotional evolution
 * Shows how the post's emotion/color has changed over time
 *
 * @param {string} postId - Post ID
 * @returns {Promise<{evolution: Array, error: Error|null}>}
 */
export const getPostEmotionalEvolution = async (postId) => {
  try {
    const { data, error } = await supabase
      .from('ecbridge_logs')
      .select('created_at, result_emotion, result_color, intensity')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return {
      evolution: data,
      error: null
    };

  } catch (error) {
    console.error('Get post emotional evolution error:', error);
    return {
      evolution: [],
      error: {
        message: error.message || 'Failed to get evolution',
        code: error.code
      }
    };
  }
};

/**
 * Batch calculate emotions for multiple interactions
 * Useful for analytics or simulations
 *
 * @param {Array} interactions - Array of interaction objects
 * @returns {Array} Array of calculation results
 *
 * @example
 * const results = batchCalculateEmotions([
 *   { userEmotion: 'Joy', userColor: 'yellow', postEmotion: 'Sad', postColor: 'blue' },
 *   { userEmotion: 'Angry', userColor: 'red', postEmotion: 'Trust', postColor: 'lime' }
 * ]);
 */
export const batchCalculateEmotions = (interactions) => {
  return interactions.map(interaction => {
    try {
      const result = engine.calculateInteraction(
        interaction.userEmotion,
        interaction.userColor,
        interaction.postEmotion,
        interaction.postColor
      );

      return {
        ...interaction,
        result,
        success: true,
        error: null
      };

    } catch (error) {
      return {
        ...interaction,
        result: null,
        success: false,
        error: {
          message: error.message,
          code: 'CALCULATION_ERROR'
        }
      };
    }
  });
};

// Export the engine instance for direct access if needed
export { engine as ecbridgeEngine };
