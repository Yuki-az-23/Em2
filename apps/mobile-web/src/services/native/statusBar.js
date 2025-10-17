/**
 * Status Bar Service
 *
 * Native status bar control using Capacitor Status Bar plugin.
 * Customizes the status bar appearance on mobile devices.
 */

import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

/**
 * Check if status bar is available on this platform
 */
export const isStatusBarAvailable = () => {
  return Capacitor.isNativePlatform();
};

/**
 * Set status bar style to light (dark text)
 * Use for: light backgrounds
 */
export const setLight = async () => {
  if (!isStatusBarAvailable()) return;

  try {
    await StatusBar.setStyle({ style: Style.Light });
  } catch (error) {
    console.error('Error setting light status bar:', error);
  }
};

/**
 * Set status bar style to dark (light text)
 * Use for: dark backgrounds
 */
export const setDark = async () => {
  if (!isStatusBarAvailable()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
  } catch (error) {
    console.error('Error setting dark status bar:', error);
  }
};

/**
 * Set status bar background color
 *
 * @param {string} color - Hex color (e.g., '#FFFFFF')
 */
export const setBackgroundColor = async (color) => {
  if (!isStatusBarAvailable()) return;

  try {
    await StatusBar.setBackgroundColor({ color });
  } catch (error) {
    console.error('Error setting status bar color:', error);
  }
};

/**
 * Show status bar
 */
export const show = async () => {
  if (!isStatusBarAvailable()) return;

  try {
    await StatusBar.show();
  } catch (error) {
    console.error('Error showing status bar:', error);
  }
};

/**
 * Hide status bar
 */
export const hide = async () => {
  if (!isStatusBarAvailable()) return;

  try {
    await StatusBar.hide();
  } catch (error) {
    console.error('Error hiding status bar:', error);
  }
};

/**
 * Get status bar info
 *
 * @returns {Promise<Object>} - { visible, style, color, overlays }
 */
export const getInfo = async () => {
  if (!isStatusBarAvailable()) {
    return {
      visible: true,
      style: 'default',
      color: '#FFFFFF',
      overlays: false,
    };
  }

  try {
    const info = await StatusBar.getInfo();
    return info;
  } catch (error) {
    console.error('Error getting status bar info:', error);
    return {
      visible: true,
      style: 'default',
      color: '#FFFFFF',
      overlays: false,
    };
  }
};

/**
 * Initialize status bar with app theme
 */
export const initStatusBar = async () => {
  if (!isStatusBarAvailable()) return;

  try {
    // Set to light style (dark text on light background)
    await setLight();

    // Set white background
    await setBackgroundColor('#FFFFFF');

    // Show status bar
    await show();
  } catch (error) {
    console.error('Error initializing status bar:', error);
  }
};
