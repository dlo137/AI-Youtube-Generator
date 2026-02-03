import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRevenueCat } from '../hooks/useRevenueCat';

/**
 * Example component showing how to use RevenueCat
 *
 * This demonstrates:
 * - Checking Pro status
 * - Showing the paywall
 * - Opening customer center
 * - Restoring purchases
 * - Displaying available offerings
 *
 * You can copy parts of this into your actual screens
 */
export const RevenueCatExample: React.FC = () => {
  const {
    isProUser,
    loading,
    error,
    offerings,
    presentPaywall,
    presentCustomerCenter,
    restore,
  } = useRevenueCat();

  const handleRestorePurchases = async () => {
    const success = await restore();
    if (success) {
      Alert.alert(
        'Purchases Restored',
        isProUser ? 'Your Pro subscription has been restored!' : 'No purchases found to restore.'
      );
    } else {
      Alert.alert('Error', 'Failed to restore purchases. Please try again.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading subscription info...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Pro Status */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Subscription Status</Text>
        <View style={[styles.badge, isProUser ? styles.proBadge : styles.freeBadge]}>
          <Text style={styles.badgeText}>
            {isProUser ? '✓ PRO' : 'FREE'}
          </Text>
        </View>
      </View>

      {/* Available Offerings */}
      {offerings?.current && (
        <View style={styles.offeringsCard}>
          <Text style={styles.sectionTitle}>Available Plans</Text>
          {offerings.current.availablePackages.map((pkg) => (
            <View key={pkg.identifier} style={styles.packageItem}>
              <Text style={styles.packageIdentifier}>{pkg.identifier}</Text>
              <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonsContainer}>
        {!isProUser && (
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={presentPaywall}
          >
            <Text style={styles.primaryButtonText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        )}

        {isProUser && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={presentCustomerCenter}
          >
            <Text style={styles.secondaryButtonText}>Manage Subscription</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.outlineButton]}
          onPress={handleRestorePurchases}
        >
          <Text style={styles.outlineButtonText}>Restore Purchases</Text>
        </TouchableOpacity>
      </View>

      {/* Usage Instructions */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>How to use in your app:</Text>
        <Text style={styles.instructionText}>
          1. Import useRevenueCat hook{'\n'}
          2. Check isProUser to show/hide premium features{'\n'}
          3. Call presentPaywall() to show subscription options{'\n'}
          4. Call presentCustomerCenter() to let users manage subscriptions
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  proBadge: {
    backgroundColor: '#10b981',
  },
  freeBadge: {
    backgroundColor: '#94a3b8',
  },
  badgeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  offeringsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  packageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  packageIdentifier: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  packagePrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  buttonsContainer: {
    marginBottom: 20,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#10b981',
  },
  secondaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  outlineButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  instructionsCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#92400e',
  },
  instructionText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 20,
  },
});

export default RevenueCatExample;
