# RevenueCat Integration Guide

This app is integrated with RevenueCat for subscription management. This document explains how everything is set up and how to use it.

## What's Included

### 1. **Packages Installed**
- `react-native-purchases` - Core RevenueCat SDK
- `react-native-purchases-ui` - Pre-built paywall and customer center UI

### 2. **Files Created**

#### `lib/revenuecat.ts`
Complete RevenueCat service with all functionality:
- `initializeRevenueCat()` - Initialize the SDK
- `getCustomerInfo()` - Get current customer data
- `isPro()` - Check if user has Pro entitlement
- `getOfferings()` - Get available subscription packages
- `purchasePackage()` - Purchase a subscription
- `restorePurchases()` - Restore previous purchases
- `showPaywall()` - Present the RevenueCat paywall
- `showCustomerCenter()` - Present subscription management screen
- `identifyUser()` - Link RevenueCat user to your app's user ID
- `logoutUser()` - Clear user identity on logout
- `setUserAttributes()` - Set custom attributes for analytics

#### `hooks/useRevenueCat.ts`
Custom React hook for easy integration:
```typescript
const {
  isProUser,           // boolean - true if user has Pro
  loading,             // boolean - loading state
  error,               // string | null - error message
  offerings,           // PurchasesOfferings | null
  customerInfo,        // CustomerInfo | null
  presentPaywall,      // () => Promise<void>
  presentCustomerCenter, // () => Promise<void>
  restore,             // () => Promise<boolean>
  refresh,             // () => Promise<void>
} = useRevenueCat();
```

#### `components/RevenueCatExample.tsx`
Example component showing how to use all features.

## Configuration

### Current Setup
- **Entitlement ID**: `AI Thumbnail Generator Pro`
- **API Keys**: `test_XGgtiLlQgfeebRJFuytyZNWrXNS` (test keys - replace with production)
- **Products**:
  - Monthly (`monthly`)
  - Yearly (`yearly`)
  - Weekly (`weekly`)

### Initialization
RevenueCat is automatically initialized when the app starts in `app/_layout.tsx`.

## Usage Examples

### Basic Pro Check
```typescript
import { useRevenueCat } from '../hooks/useRevenueCat';

function MyComponent() {
  const { isProUser, loading, presentPaywall } = useRevenueCat();

  if (loading) return <Text>Loading...</Text>;

  if (!isProUser) {
    return (
      <Button
        title="Upgrade to Pro"
        onPress={presentPaywall}
      />
    );
  }

  return <Text>You have Pro!</Text>;
}
```

### Show Paywall
```typescript
import { useRevenueCat } from '../hooks/useRevenueCat';

function UpgradeScreen() {
  const { presentPaywall } = useRevenueCat();

  return (
    <Button
      title="See Subscription Options"
      onPress={presentPaywall}
    />
  );
}
```

### Manage Subscription (Customer Center)
```typescript
import { useRevenueCat } from '../hooks/useRevenueCat';

function SettingsScreen() {
  const { isProUser, presentCustomerCenter } = useRevenueCat();

  if (!isProUser) return null;

  return (
    <Button
      title="Manage Subscription"
      onPress={presentCustomerCenter}
    />
  );
}
```

### Restore Purchases
```typescript
import { useRevenueCat } from '../hooks/useRevenueCat';
import { Alert } from 'react-native';

function RestoreButton() {
  const { restore } = useRevenueCat();

  const handleRestore = async () => {
    const success = await restore();
    if (success) {
      Alert.alert('Success', 'Purchases restored!');
    } else {
      Alert.alert('Error', 'Failed to restore purchases');
    }
  };

  return <Button title="Restore Purchases" onPress={handleRestore} />;
}
```

### Link User ID (after login)
```typescript
import { identifyUser } from '../lib/revenuecat';

// After user logs in
async function onUserLogin(userId: string) {
  try {
    await identifyUser(userId);
    console.log('User linked to RevenueCat');
  } catch (error) {
    console.error('Failed to link user:', error);
  }
}
```

### Logout User
```typescript
import { logoutUser } from '../lib/revenuecat';

// When user logs out
async function onUserLogout() {
  try {
    await logoutUser();
    console.log('User logged out from RevenueCat');
  } catch (error) {
    console.error('Failed to logout:', error);
  }
}
```

### Manual Purchase (without paywall)
```typescript
import { getOfferings, purchasePackage } from '../lib/revenuecat';

async function purchaseMonthly() {
  try {
    const offerings = await getOfferings();
    const monthlyPackage = offerings?.current?.availablePackages.find(
      pkg => pkg.identifier === 'monthly'
    );

    if (monthlyPackage) {
      const { customerInfo, userCancelled } = await purchasePackage(monthlyPackage);

      if (!userCancelled) {
        console.log('Purchase successful!');
        // Check customerInfo.entitlements.active for Pro status
      }
    }
  } catch (error) {
    console.error('Purchase failed:', error);
  }
}
```

### Check Specific Entitlement
```typescript
import { getCustomerInfo } from '../lib/revenuecat';

async function checkProAccess() {
  const customerInfo = await getCustomerInfo();
  const hasPro = customerInfo.entitlements.active['AI Thumbnail Generator Pro'] !== undefined;

  if (hasPro) {
    console.log('User has Pro access!');
  }
}
```

## Important Notes

### 1. **Replace Test API Keys**
Before going to production, replace the test API keys in `lib/revenuecat.ts`:
```typescript
const IOS_API_KEY = 'your_ios_production_key';
const ANDROID_API_KEY = 'your_android_production_key';
```

### 2. **Configure Products in RevenueCat Dashboard**
1. Go to RevenueCat Dashboard
2. Create products: `monthly`, `yearly`, `weekly`
3. Create an entitlement: `AI Thumbnail Generator Pro`
4. Link products to the entitlement
5. Create offerings and add packages

### 3. **Configure App Store/Play Store**
- Set up subscriptions in App Store Connect (iOS)
- Set up subscriptions in Google Play Console (Android)
- Link them in RevenueCat dashboard

### 4. **Testing**
- Use test API keys during development
- RevenueCat provides sandbox testing automatically
- Test purchases won't charge real money in development

### 5. **User Identity**
- Call `identifyUser(userId)` after user logs in to link their account
- Call `logoutUser()` when user logs out
- This allows users to access purchases across devices

### 6. **Error Handling**
All functions include error handling and logging. Check console for:
- `[RevenueCat]` - Service logs
- `[useRevenueCat]` - Hook logs

## Next Steps

1. ✅ Install packages
2. ✅ Create service file
3. ✅ Create custom hook
4. ✅ Initialize in app
5. ⏳ Configure products in RevenueCat Dashboard
6. ⏳ Replace test API keys with production keys
7. ⏳ Set up App Store/Play Store subscriptions
8. ⏳ Integrate into your screens
9. ⏳ Test purchases
10. ⏳ Deploy to production

## Resources

- [RevenueCat Documentation](https://www.revenuecat.com/docs)
- [React Native SDK Reference](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
- [Paywall Documentation](https://www.revenuecat.com/docs/tools/paywalls)
- [Customer Center Documentation](https://www.revenuecat.com/docs/tools/customer-center)

## Troubleshooting

### Paywall not showing?
- Check that you've configured offerings in RevenueCat Dashboard
- Verify products are created and linked
- Check console for error messages

### "No offerings available"?
- Configure offerings in RevenueCat Dashboard
- Ensure products are properly linked to entitlements
- Wait a few minutes for changes to propagate

### Purchases not working?
- Verify App Store/Play Store subscriptions are set up
- Check that product IDs match between stores and RevenueCat
- Review sandbox testing documentation

### User not staying logged in?
- Call `identifyUser()` after successful login
- Store user session locally
- Call `logoutUser()` on logout
