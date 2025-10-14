# Manage Credits Edge Function

This Supabase Edge Function handles real-time credit tracking for the Thumbnail Generator app.

## Features

- **Get Credits**: Retrieve current and max credits for a user
- **Deduct Credits**: Deduct a specified amount of credits (default: 1)
- **Reset Credits**: Reset credits to max (useful for monthly resets or testing)
- **Real-time Sync**: Credits are stored in Supabase and sync across devices

## Deployment

1. Make sure you have the Supabase CLI installed:
   ```bash
   npm install -g supabase
   ```

2. Link your project (if not already linked):
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Deploy the function:
   ```bash
   supabase functions deploy manage-credits
   ```

4. Run the migration to add credits columns:
   ```bash
   supabase db push
   ```

## Usage

### Get Credits
```typescript
const { data } = await supabase.functions.invoke('manage-credits', {
  body: { action: 'get' }
});
// Returns: { current: 90, max: 90 }
```

### Deduct Credits
```typescript
const { data } = await supabase.functions.invoke('manage-credits', {
  body: { action: 'deduct', amount: 1 }
});
// Returns: { success: true, current: 89, max: 90 }
```

### Reset Credits
```typescript
const { data } = await supabase.functions.invoke('manage-credits', {
  body: { action: 'reset' }
});
// Returns: { success: true, current: 90, max: 90 }
```

## Credits by Plan

- **No Subscription**: 0 images (subscription required)
- **Weekly Plan**: 30 images/month
- **Monthly Plan**: 75 images/month
- **Yearly Plan**: 90 images/month

## Notes

- The function automatically initializes credits for new users based on their subscription plan
- Credits are stored in the `profiles` table with columns: `credits_current`, `credits_max`
- The app falls back to local storage if Supabase is unreachable
