# Settings Section Design Specification

This document outlines the design system for the Settings section, including information hierarchy, spacing (margins and padding), and color usage.

## Overview

The Settings section uses a two-column layout with a fixed sidebar navigation and a flexible main content area. The design emphasizes clarity, consistency, and visual hierarchy through careful use of spacing, typography, and color.

---

## Information Hierarchy

### Page Level

**Main Container**
- Background: Gradient from `slate-50` via `white` to `indigo-50`
- Max width: `var(--page-container-max-width)` (1280px)
- Centered with auto margins
- Padding:
  - Horizontal: `var(--page-container-padding-x)` (16px mobile) / `24px` (sm) / `32px` (lg)
  - Top: `var(--page-container-padding-top)` (32px)
  - Bottom: `var(--spacing-8)` (32px)

### Layout Structure

**Two-Column Layout**
- Gap between columns: `24px` (`gap-6`)
- Sidebar: Fixed width `256px` (`w-64`), sticky positioning (`sticky top-20`)
- Main content: Flexible width (`flex-1 min-w-0`)

### Typography Hierarchy

**Page Titles (H1)**
- Font family: `var(--font-heading)` (Atkinson Hyperlegible)
- Font size: `var(--font-size-page-title)` (32px)
- Font weight: `var(--font-weight-bold)` (700)
- Color: `var(--color-gray-900)` (#111827)
- Margin bottom: `0`
- Used for main page headings (e.g., "Scorecards", "Success Metrics")

**Section Titles (H2)**
- Font size: `text-lg` (18px)
- Font weight: `font-semibold` (600)
- Color: `text-gray-900` (#111827)
- Margin bottom: `mb-4` (16px)
- Used for card section headings (e.g., "Readiness Thresholds", "User Interface Settings")

**Section Descriptions**
- Font size: `text-sm` (14px)
- Color: `text-gray-500` (#6B7280)
- Appears below section titles

**Body Text**
- Font size: `text-sm` (14px) or `text-base` (16px)
- Color: `text-gray-700` (#374151) or `text-gray-600` (#4B5563)
- Line height: Normal (1.5)

**Labels**
- Font size: `text-sm` (14px)
- Font weight: `font-medium` (500)
- Color: `text-gray-700` (#374151)
- Margin bottom: `mb-1` (4px)

**Helper Text / Captions**
- Font size: `text-xs` (12px)
- Color: `text-gray-500` (#6B7280)
- Margin top: `mt-1` (4px)

### Content Cards

**Card Container**
- Background: `bg-white` (#FFFFFF)
- Border: `border border-gray-200` (#E5E7EB)
- Border radius: `rounded-xl` (12px)
- Shadow: `shadow-sm`
- Padding: `p-6` (24px)

**Card Header**
- Icon container: `w-10 h-10` (40px × 40px)
- Icon container border radius: `rounded-lg` (8px)
- Icon container background: Gradient (varies by section)
- Icon size: `w-6 h-6` (24px)
- Icon color: `text-white`
- Gap between icon and text: `gap-3` (12px)
- Margin bottom: `mb-4` (16px)

**Card Content**
- Spacing between form fields: `space-y-4` (16px vertical)
- Grid layouts: `grid grid-cols-1 md:grid-cols-2` or `md:grid-cols-3`
- Grid gap: `gap-4` (16px)

---

## Margins

### Page-Level Margins

**Main Container**
- Top margin: `0` (handled by padding-top)
- Bottom margin: `0` (handled by padding-bottom)
- Left/Right margin: `0 auto` (centered)

**Error Messages**
- Margin bottom: `mb-6` (24px)

### Component-Level Margins

**Card Sections**
- Margin between cards: `space-y-6` (24px vertical) when multiple cards are stacked

**Card Headers**
- Margin bottom: `mb-4` (16px) for header section
- Margin bottom: `mb-6` (24px) for headers with toolbars/descriptions

**Form Fields**
- Margin bottom: `mb-1` (4px) for labels
- Margin top: `mt-1` (4px) for helper text
- Margin top: `mt-4` (16px) for fields that need extra spacing

**Navigation Sidebar**
- Space between nav items: `space-y-1` (4px)
- Margin left for nested items: `ml-4` (16px)
- Margin top for nested lists: `mt-1` (4px)
- Margin bottom for back links: `mb-2` (8px)

---

## Padding

### Page Container Padding

**Main Container**
- Padding left: `var(--page-container-padding-x)` (16px) / `24px` (sm) / `32px` (lg)
- Padding right: `var(--page-container-padding-x)` (16px) / `24px` (sm) / `32px` (lg)
- Padding top: `var(--page-container-padding-top)` (32px)
- Padding bottom: `var(--spacing-8)` (32px)

### Component Padding

**Cards**
- Padding: `p-6` (24px on all sides)

**Navigation Links**
- Padding: `px-4 py-2` (16px horizontal, 8px vertical)

**Form Inputs**
- Padding: `px-3 py-2` (12px horizontal, 8px vertical)

**Error Messages**
- Padding: `px-4 py-3` (16px horizontal, 12px vertical)

**Toggle Switch Containers**
- Padding: `p-4` (16px on all sides)

**Table Cells**
- Padding: `px-4 py-3` (16px horizontal, 12px vertical)

---

## Colors

### Background Colors

**Page Background**
- Main: `bg-gradient-to-br from-slate-50 via-white to-indigo-50`
  - Start: `#F8FAFC` (slate-50)
  - Middle: `#FFFFFF` (white)
  - End: `#EEF2FF` (indigo-50)

**Card Backgrounds**
- Primary: `bg-white` (#FFFFFF)
- Secondary/Subtle: `bg-gray-50` (#F9FAFB) for nested sections
- Error: `bg-red-50` (#FEF2F2)

**Navigation States**
- Active: `bg-indigo-50` (#EEF2FF)
- Hover: `hover:bg-gray-50` (#F9FAFB)

### Text Colors

**Primary Text**
- Headings: `text-gray-900` (#111827)
- Body: `text-gray-700` (#374151)
- Secondary body: `text-gray-600` (#4B5563)

**Secondary Text**
- Descriptions: `text-gray-500` (#6B7280)
- Helper text: `text-gray-500` (#6B7280)
- Captions: `text-gray-500` (#6B7280)

**Interactive States**
- Active link: `text-indigo-700` (#4338CA)
- Default link: `text-gray-700` (#374151)
- Hover link: Inherits from parent

**Error Text**
- Error messages: `text-red-700` (#B91C1C)

### Border Colors

**Card Borders**
- Default: `border-gray-200` (#E5E7EB)

**Input Borders**
- Default: `border-gray-300` (#D1D5DB)
- Focus: `focus:ring-indigo-500` (#6366F1) with `focus:border-transparent`

**Error Borders**
- Error state: `border-red-200` (#FECACA)

### Accent Colors (Icon Containers)

Icon containers use gradient backgrounds to differentiate sections:

**Readiness Thresholds**
- `from-blue-500 to-cyan-500` (#3B82F6 → #06B6D4)

**General Configuration**
- `from-purple-500 to-pink-500` (#A855F7 → #EC4899)

**User Interface Settings**
- `from-indigo-500 to-blue-500` (#6366F1 → #3B82F6)

**Permissions**
- `from-emerald-500 to-teal-500` (#10B981 → #14B8A6)

### Interactive Element Colors

**Buttons**
- Primary background: `var(--color-blue-material)` (#2196F3)
- Primary hover: `var(--color-blue-material-dark)` (#1976D2)
- Primary text: `var(--color-white)` (#FFFFFF)

**Toggle Switches**
- Unchecked: `bg-gray-200` (#E5E7EB)
- Checked: `bg-indigo-600` (#4F46E5)
- Focus ring: `peer-focus:ring-indigo-300` (#A5B4FC)

**Focus States**
- Focus ring: `focus:ring-2 focus:ring-indigo-500` (#6366F1)
- Focus ring width: 2px

---

## Spacing Scale Reference

The settings section uses a consistent spacing scale:

- `spacing-1`: 4px
- `spacing-2`: 8px
- `spacing-3`: 12px
- `spacing-4`: 16px
- `spacing-6`: 24px
- `spacing-8`: 32px

Tailwind classes map to these values:
- `gap-1` = 4px
- `gap-3` = 12px
- `gap-4` = 16px
- `gap-6` = 24px
- `p-4` = 16px
- `p-6` = 24px
- `mb-1` = 4px
- `mb-4` = 16px
- `mb-6` = 24px

---

## Responsive Behavior

### Breakpoints

**Mobile (< 640px)**
- Sidebar: Full width, not sticky
- Grid columns: 1 column
- Padding: 16px horizontal

**Small (≥ 640px)**
- Padding: 24px horizontal
- Grid columns: Responsive (1-2 columns)

**Large (≥ 1024px)**
- Padding: 32px horizontal
- Grid columns: 2-3 columns where applicable

### Sidebar Behavior

- Width: Fixed at 256px (`w-64`)
- Position: Sticky at `top-20` (80px from top)
- Self-align: `self-start` to prevent stretching

---

## Visual Examples

### Card Structure

```
┌─────────────────────────────────────────┐
│ [Icon] Section Title                    │ ← mb-4, gap-3
│        Section Description              │
├─────────────────────────────────────────┤
│                                         │
│  Form Fields (space-y-4)                │ ← p-6
│                                         │
└─────────────────────────────────────────┘
```

### Navigation Structure

```
┌─────────────────┐
│ Nav Item 1      │ ← px-4 py-2, space-y-1
│ Nav Item 2      │
│   └─ Sub-item   │ ← ml-4, mt-1
│ Nav Item 3      │
└─────────────────┘
```

### Page Layout

```
┌──────────────────────────────────────────────┐
│  [Sidebar 256px]  │  [Main Content flex-1]  │ ← gap-6
│                   │                         │
│  Navigation       │  Card 1                 │
│  (sticky)         │  Card 2                 │
│                   │  Card 3                 │
└──────────────────────────────────────────────┘
```

---

## Design Principles

1. **Consistency**: All cards use the same padding (`p-6`), border radius (`rounded-xl`), and shadow (`shadow-sm`)

2. **Visual Hierarchy**: Clear distinction between page titles, section titles, and body text through size, weight, and color

3. **Spacing Rhythm**: Consistent use of spacing scale (4px, 8px, 16px, 24px, 32px) creates visual rhythm

4. **Color Semantics**: Colors are used semantically (gray for neutral, indigo for active/interactive, red for errors)

5. **Accessibility**: Sufficient color contrast ratios maintained throughout

6. **Responsiveness**: Layout adapts gracefully across screen sizes while maintaining design consistency

---

## Aha! Integration - Field Management

The Settings section includes comprehensive integration with Aha! for managing both standard and custom fields from Aha! epics. This section documents how fields are integrated, configured, and synchronized.

### Overview

The Aha! integration allows administrators to:
- Select which Aha! fields (both standard and custom) should be loaded with each epic
- Configure custom field mappings between Aha! field keys and ClearGO field aliases
- Synchronize field data from Aha! to ClearGO for existing epics
- Manage field selection through a drag-and-drop interface

### Field Types

#### Standard Fields

Standard fields are built-in Aha! epic properties that are always available from the Aha! API. These fields do not require custom field configuration.

**Available Standard Fields:**
- `id` - Epic ID
- `reference_num` - Reference Number
- `name` - Name
- `url` - URL
- `description` - Description
- `workflow_status` - Workflow Status
- `assigned_to_user` - Assigned To User
- `tags` - Tags
- `release` - Release
- `integrations` - Integrations

**Characteristics:**
- Always available from Aha! API
- No custom field key required
- Type: `standard`
- Stored in `aha_fields.standard_fields` JSON column

#### Custom Fields

Custom fields are user-defined fields in Aha! that require configuration mapping to be used in ClearGO.

**Configuration:**
- Defined in `config/aha-custom-fields.json`
- Each custom field has:
  - `alias`: ClearGO field identifier (e.g., `dev_backlog_pod`)
  - `label`: Human-readable label (e.g., "Dev Backlog/Pod")
  - `key`: Aha! custom field key (e.g., `dev_roadmap`)

**Example Configuration:**
```json
{
  "fields": {
    "dev_backlog_pod": {
      "label": "Dev Backlog/Pod",
      "key": "dev_roadmap"
    },
    "business_priority": {
      "label": "Business Priority",
      "key": "business_priority"
    }
  }
}
```

**Characteristics:**
- Require mapping in configuration file
- Type: `custom`
- Stored in `aha_fields.custom_fields` JSON column
- May have empty `key` if field is write-only (e.g., `launch_readiness_status`)

### Field Selection Interface

The Epic Fields section (`AhaFieldsSection`) provides a three-part interface:

#### 1. Selected Fields Table
- **Location**: Top section
- **Purpose**: Shows currently selected fields that will be loaded
- **Features**:
  - Drag-and-drop reordering
  - Checkbox to deselect fields
  - Displays field label, alias, and type badge
- **Styling**:
  - Background: `bg-gray-50` (#F9FAFB)
  - Border: `border-2 border-gray-200` (#E5E7EB)
  - Table header: `bg-gray-100` (#F3F4F6)
  - Row hover: `hover:bg-indigo-50` (#EEF2FF)
  - Drag indicator: `bg-blue-100` (#DBEAFE) when dragging

#### 2. Available Standard Fields Table
- **Location**: Middle section
- **Purpose**: Shows unselected standard fields available for selection
- **Features**:
  - Checkbox to select fields
  - Displays field label, alias, and "Standard" badge
- **Badge Styling**:
  - Background: `bg-blue-100` (#DBEAFE)
  - Text: `text-blue-700` (#1D4ED8)

#### 3. Available Custom Fields Table
- **Location**: Bottom section
- **Purpose**: Shows unselected custom fields available for selection
- **Features**:
  - Checkbox to select fields
  - Displays field label, alias, and "Custom" badge
- **Badge Styling**:
  - Background: `bg-purple-100` (#E9D5FF)
  - Text: `text-purple-700` (#7C3AED)

### Field Data Structure

When fields are loaded from Aha!, they are stored in the `aha_fields` JSONB column with the following structure:

```json
{
  "standard_fields": {
    "id": "EPIC-123",
    "reference_num": "EPIC-123",
    "name": "Epic Name",
    "url": "https://aha.io/epic/123",
    "description": "Epic description",
    "workflow_status": "In Progress",
    "assigned_to_user": {
      "id": "user-123",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "tags": ["tag1", "tag2"],
    "release": {
      "id": "release-123",
      "reference_num": "REL-123",
      "name": "Q1 2024"
    },
    "integrations": {...},
    "aha_release_name": "Q1 2024"
  },
  "custom_fields": {
    "dev_backlog_pod": "Pod A",
    "business_priority": "High",
    "csm_priority": "Top 20"
  }
}
```

### Field Loading Process

#### 1. Field Selection
- Administrators select fields via checkboxes in the Settings UI
- Selected field aliases are stored in `app_settings.aha_fields_to_load` (array of strings)
- Changes auto-save after 1 second debounce

#### 2. Field Mapping
When an epic is fetched from Aha!:

**Standard Fields:**
- Directly extracted from epic object properties
- No configuration lookup required

**Custom Fields:**
- For each selected field alias:
  1. Look up field configuration in `config/aha-custom-fields.json`
  2. Get the Aha! field key from configuration
  3. Extract value from `epic.custom_fields` array using the key
  4. Handle value transformation (e.g., select field option codes → labels)
  5. Store in `custom_fields` object

#### 3. Value Extraction Logic

**Custom Field Value Extraction** (`getCustomFieldValue`):
1. Get field key from configuration
2. Search `epic.custom_fields` array for matching key
3. Extract value from field object
4. Handle select field options:
   - If value is object with `name` property → return label
   - If value is string code → lookup in field definitions cache → return label
   - Otherwise → return value as-is
5. Return `null` if field not found

**Field Definitions Cache:**
- Caches Aha! custom field definitions (option codes → labels)
- TTL: 1 hour
- Used to map select field option codes to human-readable labels

### Synchronization

#### Manual Synchronization

The "Synchronize" button triggers a manual sync of all existing epics:

**Process:**
1. Fetches all epics with `aha_id` from database
2. For each epic:
   - Fetches latest data from Aha! API
   - Maps epic using current `aha_fields_to_load` settings
   - Updates `aha_fields` JSONB column
   - Updates other epic properties (tier, dates, etc.)
3. Returns summary:
   - Total epics processed
   - Successfully synced count
   - Failed count
   - Error details for failures

**API Endpoint:** `POST /api/settings/aha-fields/sync`

**Permissions:** Requires `settings.ahaFields.sync` capability

**UI Feedback:**
- Success: Green banner with sync summary
- Partial failure: Yellow banner with error count
- Shows expandable error details

#### Automatic Synchronization

Fields are automatically loaded during:
- **Webhook updates**: When Aha! sends webhook notifications
- **Manual epic sync**: When using "Sync Epics from Aha" button
- **Epic creation**: When new epics are created from Aha!

### Field Configuration Management

#### Adding New Custom Fields

1. **Add to Configuration File** (`config/aha-custom-fields.json`):
   ```json
   {
     "fields": {
       "new_field_alias": {
         "label": "New Field Label",
         "key": "aha_custom_field_key"
       }
     }
   }
   ```

2. **Discover Field Keys** (Optional):
   - Use discovery utility: `src/lib/aha/discover.ts`
   - Fetches custom field definitions from Aha! API
   - Automatically updates configuration with field keys
   - Matches fields by label

3. **Select in Settings UI**:
   - New field appears in "Available Custom Fields" table
   - Administrators can select via checkbox
   - Field is added to `aha_fields_to_load` array

#### Field Key Discovery

The discovery utility (`discoverCustomFields`) helps find Aha! field keys:
- Fetches all custom field definitions from Aha! API
- Matches configuration fields by label
- Updates configuration file with discovered keys
- Logs matches and warnings for unmatched fields

### Field Usage in Application

#### Accessing Field Values

Fields are accessed throughout the application via the `aha_fields` JSONB column:

**Standard Fields:**
```typescript
epic.aha_fields?.standard_fields?.name
epic.aha_fields?.standard_fields?.workflow_status
```

**Custom Fields:**
```typescript
epic.aha_fields?.custom_fields?.dev_backlog_pod
epic.aha_fields?.custom_fields?.business_priority
```

#### Field Display

Fields are displayed in:
- **Epic Fields Sidebar**: Shows all loaded fields with labels
- **Comments Modal**: Used as data sources for criteria
- **Matrix View**: Displayed in epic details
- **Export Functions**: Included in data exports

### Design Considerations

#### Field Selection UI

**Table Styling:**
- Consistent table structure across all three sections
- Fixed column widths for drag handle and type badge
- Hover states for better interactivity
- Visual distinction between selected and available fields

**Drag and Drop:**
- Visual feedback during drag (opacity change, background highlight)
- Drop zones clearly indicated
- Order preserved in `aha_fields_to_load` array

**Type Badges:**
- Color-coded: Blue for standard, Purple for custom
- Helps users distinguish field types at a glance

#### Performance

**Field Loading:**
- Only selected fields are fetched from Aha!
- Reduces API calls and data transfer
- Faster epic synchronization

**Caching:**
- Field definitions cached for 1 hour
- Reduces Aha! API calls for option lookups
- Improves response time for select field values

**Synchronization:**
- Processes epics sequentially to avoid rate limiting
- Error handling per epic (continues on failure)
- Detailed error reporting for troubleshooting

### Permissions

Field management requires specific permissions:

- **View Fields**: `settings.ahaFields.read`
- **Update Field Selection**: `settings.ahaFields.update`
- **Synchronize Fields**: `settings.ahaFields.sync`

These permissions control access to:
- Viewing available fields
- Selecting/deselecting fields
- Triggering manual synchronization
