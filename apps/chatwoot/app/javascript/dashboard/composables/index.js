import { toast } from 'vue-sonner';
import analyticsHelper from 'dashboard/helper/AnalyticsHelper/index';

/**
 * Custom hook to track events
 */
export const useTrack = (...args) => {
  try {
    return analyticsHelper.track(...args);
  } catch (error) {
    // Ignore this, tracking is not mission critical
  }

  return null;
};

const TOAST_TYPES = ['success', 'error', 'info', 'warning'];

/**
 * Shows a toast notification using Sonner (vue-sonner).
 *
 * Standardized toast entry point for the whole app — every toast goes through
 * here and is rendered by the single `<Toaster />` mounted at the app root.
 *
 * @param {string} message - The message to display.
 * @param {Object|null} [action] - Optional toast options:
 *   @param {('success'|'error'|'info'|'warning')} [action.type] - Toast variant.
 *     `type: 'link'` renders an action button that navigates to `action.to`.
 *   @param {number} [action.duration] - Visible duration in ms.
 *   @param {string} [action.to] - Path to navigate to (with `type: 'link'`).
 *   @param {string} [action.message] - Label for the link action button.
 */
export const useAlert = (message, action = null) => {
  const options = {};

  if (action?.duration) options.duration = action.duration;

  if (action?.type === 'link' && action?.to) {
    options.action = {
      label: action.message,
      onClick: () => {
        window.location.href = action.to;
      },
    };
  }

  const type = TOAST_TYPES.includes(action?.type) ? action.type : null;

  return type ? toast[type](message, options) : toast(message, options);
};
