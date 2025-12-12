# Feedback System Implementation

## Overview
Implemented a feedback system for launches/epics with proper attribution, timestamps, and source tracking. Feedback appears in the activity feed and is used to identify releases that need stakeholder input.

## Database Schema

### Feedback Table
Created `feedback` table with the following structure:

```sql
CREATE TABLE feedback (
  id uuid PRIMARY KEY,
  launch_id uuid REFERENCES launch(id) NOT NULL,
  feedback_text text NOT NULL,
  source text NOT NULL,  -- e.g., 'slack', 'email', 'meeting', 'manual', 'aha'
  attributed_to_id uuid REFERENCES app_user(id),
  attributed_to_name text,  -- Fallback if user not in system
  attributed_to_email text,
  created_by_id uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
```

### Key Features:
- **Attribution**: Tracks who provided the feedback (`attributed_to_id`)
- **Source Tracking**: Records where feedback came from (slack, email, meeting, manual, aha)
- **Creator Tracking**: Tracks who created the feedback record (`created_by_id`)
- **Timestamps**: Automatic timestamping of when feedback was created/updated
- **RLS Policies**: Row-level security for authenticated users

## Files Created

### 1. Migration
- **`supabase/migrations/0036_create_feedback_table.sql`**
  - Creates feedback table
  - Adds indexes for performance
  - Enables RLS with appropriate policies
  - Includes comments for documentation

### 2. API Endpoint - Releases Needing Feedback
- **`src/app/api/dashboard/releases-needing-feedback/route.ts`**
  - GET endpoint that identifies launches needing feedback
  - Filters launches launching within 90 days
  - Excludes completed/cancelled launches
  - Returns count and list of launches with no feedback

## Files Modified

### 1. Activity Feed API
- **`src/app/api/activity-feed/route.ts`**
  - Added `feedback_added` to activity types
  - Fetches recent feedback from database
  - Combines feedback with audit log activities
  - Sorts all activities by timestamp
  - Truncates long feedback text for display

### 2. Activity Feed Component
- **`src/components/ActivityFeed.tsx`**
  - Added IconMessage for feedback activities
  - Added yellow color scheme for feedback
  - Displays feedback with attributed user info

### 3. Home Dashboard
- **`src/components/HomeDashboard.tsx`**
  - Replaced "My Pending Items" with "Releases Needing Feedback"
  - Updated metrics interface
  - Fetches feedback count from new API endpoint
  - Displays count with yellow icon
  - Shows "Launching within 90 days" subtitle

## How Feedback Works

### Creating Feedback
Feedback can be captured from multiple sources:

1. **Manual Entry** - Users can manually add feedback
2. **Slack Integration** - Feedback from Slack messages
3. **Email** - Feedback extracted from emails
4. **Meetings** - Notes/feedback from meetings
5. **Aha!** - Feedback synced from Aha!

### Feedback Properties
Each feedback item includes:
- **Text**: The actual feedback content
- **Attribution**: Who provided it (user ID, name, email)
- **Source**: Where it came from
- **Timestamp**: When it was recorded
- **Launch**: Which launch/epic it's about

### Activity Feed Display
Feedback appears in the activity feed with:
- Yellow message icon
- Launch name
- Truncated feedback text (first 100 chars)
- Name/avatar of person who provided feedback
- Relative timestamp

### Dashboard Metric
The "Releases Needing Feedback" card shows:
- Count of launches launching within 90 days that have NO feedback
- Yellow folder icon
- Subtitle: "Launching within 90 days"
- Only counts active launches (not completed/cancelled)

## API Endpoints

### Get Releases Needing Feedback
```
GET /api/dashboard/releases-needing-feedback
```

**Response:**
```json
{
  "count": 5,
  "total": 12,
  "launches": [
    {
      "id": "uuid",
      "name": "Launch Name",
      "target_launch_date": "2025-02-15"
    }
  ]
}
```

### Get Activity Feed (includes feedback)
```
GET /api/activity-feed?limit=20
```

**Response includes feedback activities:**
```json
{
  "activities": [
    {
      "id": "uuid",
      "type": "feedback_added",
      "title": "Feedback Added",
      "description": "Launch Name: \"This looks great...\"",
      "timestamp": "2025-01-15T10:30:00Z",
      "actor": {
        "name": "John Doe",
        "email": "john@example.com",
        "avatar_url": "..."
      }
    }
  ]
}
```

## Future Implementation

### Creating Feedback via UI
You'll want to add UI for creating feedback:

1. **Feedback Modal/Form** - On epic/launch detail pages
2. **Quick Feedback Button** - Add feedback from lists
3. **Slack Integration** - Capture feedback from Slack threads
4. **Meeting Notes** - Import feedback from meeting notes

### Example API Endpoint for Creating Feedback
```typescript
// src/app/api/feedback/route.ts
export async function POST(req: NextRequest) {
  const { 
    launch_id, 
    feedback_text, 
    source,
    attributed_to_id 
  } = await req.json();
  
  // Create feedback record...
}
```

### Feedback Display on Launch Pages
Add a feedback section to epic/launch detail pages showing:
- All feedback chronologically
- Source badges (Slack, Email, etc.)
- Attribution with avatars
- Ability to add new feedback

## Testing

1. **Run the migration:**
   ```bash
   npm run db:migrate
   ```

2. **Create test feedback (via SQL):**
   ```sql
   INSERT INTO feedback (launch_id, feedback_text, source, attributed_to_name)
   VALUES (
     '<launch_uuid>',
     'This feature looks promising but needs more clarity on the pricing model.',
     'slack',
     'Jane Smith'
   );
   ```

3. **View on dashboard:**
   - Navigate to home page
   - Check "Releases Needing Feedback" count
   - View activity feed for feedback items

4. **API Testing:**
   ```bash
   # Test releases needing feedback
   curl http://localhost:3000/api/dashboard/releases-needing-feedback
   
   # Test activity feed (includes feedback)
   curl http://localhost:3000/api/activity-feed?limit=20
   ```

## Benefits

1. **Visibility**: Stakeholder feedback is centralized and visible
2. **Attribution**: Know who provided feedback and when
3. **Source Tracking**: Understand feedback channels
4. **Proactive**: Identify launches that need stakeholder input
5. **Historical**: Complete feedback history per launch
6. **Integrated**: Feedback appears in activity feed alongside other updates

## Color Scheme

The feedback feature uses a **yellow/amber** color scheme:
- Background: `#FEF3C7` (light yellow)
- Icon: `#F59E0B` (amber)
- Accent: `#DC2626` (red for urgent)

This distinguishes feedback from other activity types:
- Blue: Epics/Launches
- Violet: Criteria
- Green: Releases
- Yellow: Feedback

