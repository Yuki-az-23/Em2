/**
 * Haptics Service
 *
 * Native haptic feedback using Capacitor Haptics plugin.
 * Provides tactile feedback for user interactions.
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

/**
 * Check if haptics is available on this platform
 */
export const isHapticsAvailable = () => {
  return Capacitor.isNativePlatform();
};

/**
 * Trigger a light impact haptic
 * Use for: button taps, selections
 */
export const impactLight = async () => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (error) {
    console.error('Error triggering light haptic:', error);
  }
};

/**
 * Trigger a medium impact haptic
 * Use for: toggle switches, important actions
 */
export const impactMedium = async () => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (error) {
    console.error('Error triggering medium haptic:', error);
  }
};

/**
 * Trigger a heavy impact haptic
 * Use for: destructive actions, errors
 */
export const impactHeavy = async () => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch (error) {
    console.error('Error triggering heavy haptic:', error);
  }
};

/**
 * Trigger a success notification haptic
 * Use for: successful operations, confirmations
 */
export const notifySuccess = async () => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch (error) {
    console.error('Error triggering success haptic:', error);
  }
};

/**
 * Trigger a warning notification haptic
 * Use for: warnings, caution messages
 */
export const notifyWarning = async () => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch (error) {
    console.error('Error triggering warning haptic:', error);
  }
};

/**
 * Trigger an error notification haptic
 * Use for: errors, failures
 */
export const notifyError = async () => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch (error) {
    console.error('Error triggering error haptic:', error);
  }
};

/**
 * Trigger a selection haptic
 * Use for: scrolling through lists, pickers
 */
export const selectionChanged = async () => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.selectionChanged();
  } catch (error) {
    console.error('Error triggering selection haptic:', error);
  }
};

/**
 * Vibrate device for a duration
 * Use for: custom patterns, alerts
 *
 * @param {number} duration - Duration in milliseconds (default: 300)
 */
export const vibrate = async (duration = 300) => {
  if (!isHapticsAvailable()) return;

  try {
    await Haptics.vibrate({ duration });
  } catch (error) {
    console.error('Error vibrating:', error);
  }
};
