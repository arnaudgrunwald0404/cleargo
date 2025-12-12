# Activity Feed Feature Implementation

## Overview
Added a real-time activity feed to the home page that displays recent activities such as:
- Criteria status changes
- New epics created
- Epics/launches assigned to releases

## Files Created

### 1. Migration File
- **`supabase/migrations/0035_add_activity_feed_setting.sql`**
  - Adds `enable_activity_feed` boolean column to `app_settings` table
  - Defaults to `true` (enabled)
  - Allows admins to toggle the feature on/off

### 2. API Endpoint
- **`src/app/api/activity-feed/route.ts`**
  - GET endpoint that fetches recent activity from the `audit_log` table
  - Transforms audit log entries into user-friendly activity items
  - Supports pagination via `?limit=` query parameter
  - Returns activities with actor information (name, avatar, etc.)

### 3. Activity Feed Component
- **`src/components/ActivityFeed.tsx`**
  - React component that displays the activity feed
  - Features:
    - Auto-refreshes on mount
    - Shows loading state
    - Displays activity icons based on type
    - Shows relative timestamps (e.g., "2h ago")
    - Displays actor information with avatars
    - Scrollable list with proper overflow handling
    - Sticky positioning for better UX
  - Uses Mantine components for consistent styling

## Files Modified

### 1. Settings Database Interface
- **`src/lib/settings-db.ts`**
  - Added `enable_activity_feed?: boolean` to `AppSettings` interface
  - Defaults to `true` in the `getSettings()` function

### 2. Home Dashboard
- **`src/components/HomeDashboard.tsx`**
  - Added `enableActivityFeed` prop to control feed visibility
  - Restructured layout using Mantine's `Grid` component
  - Main content takes 8 columns (on large screens)
  - Activity feed takes 4 columns (on large screens)
  - Responsive: Feed moves below content on mobile/tablet
  - Feed has sticky positioning to stay visible while scrolling

### 3. Home Page
- **`src/app/page.tsx`**
  - Fetches settings to determine if activity feed should be shown
  - Passes `enableActivityFeed` prop to `HomeDashboard`

### 4. Settings Page - General Section
- **`src/components/admin/settings/GeneralSection.tsx`**
  - Added "User Interface Settings" section
  - Includes toggle switch for "Enable Activity Feed"
  - Descriptive text explains what the feed shows
  - Auto-saves when toggled (via existing auto-save mechanism)

## How It Works

### Data Flow
1. The `audit_log` table already captures all system changes (criteria updates, epic creation, etc.)
2. The activity feed API queries this table and transforms entries into user-friendly messages
3. The ActivityFeed component fetches and displays these activities
4. The setting in `app_settings` controls whether the feed appears on the home page

### Activity Types
The feed recognizes and displays three types of activities:
1. **Criterion Changes** - When a criterion status is updated
2. **Epic Added** - When a new epic or launch is created
3. **Release Updated** - When an epic/launch is assigned to a release

### Responsive Design
- **Mobile (< 576px)**: Feed appears below main content
- **Tablet (576px - 1024px)**: Feed appears below main content
- **Desktop (≥ 1024px)**: Feed appears on the right side

### Accessibility
- Uses semantic HTML
- Proper ARIA labels
- Keyboard navigation support
- High contrast for readability
- Atkinson Hyperlegible font for headings

## Configuration

Administrators can enable/disable the activity feed:
1. Navigate to Settings → Other Settings
2. Scroll to "User Interface Settings"
3. Toggle "Enable Activity Feed"
4. Changes auto-save and apply immediately on next page load

## Testing the Feature

1. **Run the migration:**
   ```bash
   # Apply the migration to add the new setting column
   npm run db:migrate
   ```

2. **View the activity feed:**
   - Navigate to the home page
   - The feed should appear on the right side (desktop) or below (mobile)
   - It will show recent activities from the audit log

3. **Toggle the feed:**
   - Go to Settings → Other Settings
   - Toggle "Enable Activity Feed" off
   - Refresh the home page - feed should be hidden
   - Toggle it back on and refresh - feed reappears

4. **Test activity tracking:**
   - Update a criterion status
   - Create a new epic
   - Assign an epic to a release
   - Check the activity feed - these actions should appear

## Future Enhancements

Potential improvements for the future:
- Real-time updates using websockets/polling
- Filter activities by type or date range
- Mark activities as "read"
- Click activities to navigate to relevant pages
- User-specific filtering (only show activities relevant to the user)
- Notifications integration
- Export activity history

