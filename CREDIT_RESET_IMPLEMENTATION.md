# Automatic Credit Reset Implementation

## Overview..
Implemented automatic credit reset system that resets user credits based on their subscription plan and purchase date.

## How It Works

### 1. Database Changes
**File:** `supabase/migrations/20251030000000_add_subscription_start_date.sql`
- Added `subscription_start_date` column to track when user's subscription period began
- Initialized existing pro users with current timestamp.

### 2. Reset Logic
**File:** `src/utils/creditResetLogic.ts`
- **Weekly Plans**: Reset every 7 days (10 credits)
- **Monthly Plans**: Reset every 30 days (75 credits)
- **Yearly Plans**: Reset every 30 days (90 credits)

### 3. Automatic Reset Checking
**File:** `supabase/functions/manage-credits/index.ts`
- Added `shouldResetCredits()` function that checks if reset is due
- Added `getCreditsForPlan()` helper function
- **Automatic check on every credit operation**: Before returning credits or deducting, the system checks if a reset is due
- If reset is needed:
  - Credits are automatically reset to max for the plan
  - `last_credit_reset` is updated to current timestamp
  - User gets their full credit allocation

### 4. Purchase Integration
**File:** `services/IAPService.ts`
- When user purchases a subscription, `subscription_start_date` is set to the purchase time
- This marks the beginning of their billing cycle
- Credits are initialized based on their plan

### 5. Client-Side Usage
**File:** `src/utils/subscriptionStorage.ts`
- Updated with comments explaining the automatic reset
- No changes needed to client code - resets happen automatically server-side

## Reset Schedule Examples

### Weekly Plan (10 credits)
- Purchase: Jan 1, 2025
- First Reset: Jan 8, 2025
- Second Reset: Jan 15, 2025
- Continues every 7 days

### Monthly Plan (75 credits)
- Purchase: Jan 15, 2025
- First Reset: Feb 15, 2025 (30 days later)
- Second Reset: Mar 15, 2025
- Continues monthly (every 30 days)

### Yearly Plan (90 credits)
- Purchase: Jan 15, 2025
- First Reset: Feb 15, 2025 (30 days later)
- Second Reset: Mar 15, 2025
- Continues monthly (every 30 days)

## Testing the Implementation

### To Deploy:
1. Run the migration:
   ```bash
   supabase db push
   ```

2. Deploy the updated edge function:
   ```bash
   supabase functions deploy manage-credits
   ```

### To Test:
1. **Check current credits**: Any call to `getCredits()` will automatically check and reset if needed
2. **Manual reset**: Call the edge function with action `'reset'` to force a reset
3. **Test automatic reset**:
   - Set `subscription_start_date` to 8 days ago for a weekly plan
   - Call `getCredits()` - credits should automatically reset

## Key Features
- ✅ Automatic reset based on subscription cycle
- ✅ Works for weekly, monthly, and yearly plans
- ✅ No user action required
- ✅ Server-side logic prevents tampering
- ✅ Transparent to client code - happens automatically
- ✅ Tracks last reset date to prevent double resets
- ✅ Sets subscription start date on new purchases

## Files Modified
1. `supabase/migrations/20251030000000_add_subscription_start_date.sql` (NEW)
2. `src/utils/creditResetLogic.ts` (NEW)
3. `supabase/functions/manage-credits/index.ts` (MODIFIED)
4. `services/IAPService.ts` (MODIFIED)
5. `src/utils/subscriptionStorage.ts` (MODIFIED - comments only)
