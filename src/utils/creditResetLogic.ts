/**
 * Credit Reset Logic
 * Handles automatic credit resets based on subscription plan and purchase date
 */

export interface SubscriptionProfile {
  subscription_plan: 'weekly' | 'monthly' | 'yearly' | null;
  subscription_start_date: string | null;
  last_credit_reset: string | null;
  is_pro_version: boolean;
}

/**
 * Determines if credits should be reset based on subscription plan and dates
 * @param profile User's subscription profile
 * @returns true if credits should be reset, false otherwise
 */
export const shouldResetCredits = (profile: SubscriptionProfile): boolean => {
  // No reset needed if user doesn't have an active subscription
  if (!profile.is_pro_version || !profile.subscription_plan || !profile.subscription_start_date) {
    return false;
  }

  const now = new Date();
  const startDate = new Date(profile.subscription_start_date);

  // Use last_credit_reset if available, otherwise use subscription_start_date
  const lastResetDate = profile.last_credit_reset
    ? new Date(profile.last_credit_reset)
    : startDate;

  // Calculate time elapsed since last reset
  const millisecondsElapsed = now.getTime() - lastResetDate.getTime();
  const daysElapsed = millisecondsElapsed / (1000 * 60 * 60 * 24);

  switch (profile.subscription_plan) {
    case 'weekly':
      // Reset every 7 days
      return daysElapsed >= 7;

    case 'monthly':
    case 'yearly':
      // Both monthly and yearly plans reset every 30 days
      // Check if at least 30 days have passed OR if it's a new calendar month
      const monthsSinceReset = (now.getFullYear() - lastResetDate.getFullYear()) * 12 +
                               (now.getMonth() - lastResetDate.getMonth());
      return monthsSinceReset >= 1 || daysElapsed >= 30;

    default:
      return false;
  }
};

/**
 * Calculates the next reset date based on subscription plan and start date
 * @param profile User's subscription profile
 * @returns ISO string of next reset date, or null if not applicable
 */
export const getNextResetDate = (profile: SubscriptionProfile): string | null => {
  if (!profile.is_pro_version || !profile.subscription_plan || !profile.subscription_start_date) {
    return null;
  }

  const lastResetDate = profile.last_credit_reset
    ? new Date(profile.last_credit_reset)
    : new Date(profile.subscription_start_date);

  const nextReset = new Date(lastResetDate);

  switch (profile.subscription_plan) {
    case 'weekly':
      nextReset.setDate(nextReset.getDate() + 7);
      break;

    case 'monthly':
    case 'yearly':
      // Both monthly and yearly plans reset monthly
      nextReset.setMonth(nextReset.getMonth() + 1);
      break;

    default:
      return null;
  }

  return nextReset.toISOString();
};

/**
 * Gets the appropriate credit limit for a subscription plan
 * @param plan Subscription plan type
 * @returns Credit limit for the plan
 */
export const getCreditsForPlan = (plan: string | null): number => {
  switch (plan) {
    case 'yearly':
      return 90;
    case 'monthly':
      return 75;
    case 'weekly':
      return 10;
    default:
      return 0;
  }
};
