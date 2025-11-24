# Design System Documentation

**Single Source of Truth** for all design tokens, components, and patterns used across the application.

## Table of Contents

1. [Colors](#colors)
2. [Typography](#typography)
3. [Spacing](#spacing)
4. [Shadows](#shadows)
5. [Border Radius](#border-radius)
6. [Transitions](#transitions)
7. [Components](#components)
8. [Layout](#layout)
9. [Navigation](#navigation)
10. [Usage Guidelines](#usage-guidelines)

**Additional Documentation:**
- [Layout Patterns](./src/design-system/LAYOUT_PATTERNS.md) - Detailed documentation for headers and sidebars

---

## Colors

### Primary Colors

| Color | HEX | RGB | HSL | Usage |
|-------|-----|-----|-----|-------|
| **White** | `#FFFFFF` | `255, 255, 255` | `0, 0%, 100%` | Pure base color for backgrounds and negative space |
| **Platinum** | `#F5F3F0` | `245, 243, 240` | `30, 20%, 95%` | Subtle neutral for secondary backgrounds |
| **Copper** | `#C97D60` | `201, 125, 96` | `15, 48%, 58%` | Warm accent for highlights and CTAs |
| **Titanium** | `#4A5D5F` | `74, 93, 95` | `185, 12%, 33%` | Deep tone for primary text and emphasis |

### Secondary Colors

| Color | HEX | RGB | HSL | Usage |
|-------|-----|-----|-----|-------|
| **Rose Gold** | `#E8B4A0` | `232, 180, 160` | `15, 60%, 77%` | Light warm accent |
| **Bronze** | `#8B6F47` | `139, 111, 71` | `35, 32%, 41%` | Medium-dark accent |
| **Verdigris** | `#6B9A8F` | `107, 154, 143` | `165, 18%, 51%` | Calm, balanced accent |
| **Steel** | `#5B6E7A` | `91, 110, 122` | `205, 15%, 42%` | Cool, professional accent |
| **Pewter** | `#9FA8B3` | `159, 168, 179` | `215, 12%, 66%` | Light neutral accent |
| **White Gold** | `#F8F6F2` | `248, 246, 242` | `40, 25%, 96%` | Very light background |
| **Brass** | `#B89A6B` | `184, 154, 107` | `35, 35%, 57%` | Warm medium accent |
| **Cast Iron** | `#2C2C2C` | `44, 44, 44` | `0, 0%, 17%` | **Reserved for text and logo only** |

### Semantic Colors

| Purpose | Color | HEX | RGB | HSL | Usage |
|---------|-------|-----|-----|-----|-------|
| **Success** | Bright Sage Green | `#6FA87F` | `111, 168, 127` | `145, 30%, 55%` | Success states, positive feedback, on-track indicators |
| **Warning** | Brass | `#B89A6B` | `184, 154, 107` | `35, 35%, 57%` | Warning states, caution |
| **Error** | Terracotta Red | `#A85D5D` | `168, 93, 93` | `0, 28%, 51%` | Error states, destructive actions, off-track indicators |
| **Info** | Steel | `#5B6E7A` | `91, 110, 122` | `205, 15%, 42%` | Informational messages |

### CSS Variables

All colors are available as CSS variables:

```css
/* Primary */
--color-white
--color-platinum
--color-copper
--color-copper-hover
--color-titanium
--color-titanium-hover

/* Secondary */
--color-rose-gold
--color-bronze
--color-verdigris
--color-verdigris-hover
--color-steel
--color-pewter
--color-white-gold
--color-brass
--color-cast-iron

/* Semantic */
--color-success
--color-warning
--color-error
--color-info
```

### Usage in Code

```typescript
// TypeScript/JavaScript
import { colors } from '@/design-system/tokens';

const primaryColor = colors.primary.copper.hex; // '#C97D60'
const hoverColor = colors.primary.copper.hover; // '#B86A4F'
```

```css
/* CSS */
.button {
  background-color: hsl(var(--color-copper));
}

.button:hover {
  background-color: hsl(var(--color-copper-hover));
}
```

```tsx
// React/Tailwind
<div className="bg-[#C97D60] text-white">
  Copper background
</div>
```

---

## Typography

### Font Families

| Family | Font Stack | Usage |
|--------|------------|-------|
| **Heading** | `'Inter', ui-sans-serif, system-ui, sans-serif` | All headings (h1-h6) |
| **Body** | `'Inter', ui-sans-serif, system-ui, sans-serif` | Body text, paragraphs, UI elements |
| **Mono** | `'Fira Code', 'Courier New', monospace` | Code blocks, technical content |

### Font Sizes

| Size | Rem | Pixels | Usage |
|------|-----|--------|-------|
| `xs` | `0.75rem` | 12px | Small labels, captions |
| `sm` | `0.875rem` | 14px | Secondary text, helper text |
| `base` | `1rem` | 16px | Body text (default) |
| `lg` | `1.125rem` | 18px | Large body text |
| `xl` | `1.25rem` | 20px | Small headings |
| `2xl` | `1.5rem` | 24px | Section headings |
| `3xl` | `1.875rem` | 30px | Page headings |
| `4xl` | `2.25rem` | 36px | Hero headings |
| `5xl` | `3rem` | 48px | Large hero headings |
| `6xl` | `3.75rem` | 60px | Extra large hero headings |

### Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| `light` | `300` | Light emphasis |
| `normal` | `400` | Body text (default) |
| `medium` | `500` | Medium emphasis |
| `semibold` | `600` | Strong emphasis |
| `bold` | `700` | Headings, strong emphasis |
| `extrabold` | `800` | Extra strong emphasis |

### Line Heights

| Height | Value | Usage |
|--------|-------|-------|
| `none` | `1` | Tight, single line |
| `tight` | `1.25` | Headings |
| `snug` | `1.375` | Compact text |
| `normal` | `1.5` | Body text (default) |
| `relaxed` | `1.625` | Comfortable reading |
| `loose` | `2` | Spacious text |

### Typography Scale

```tsx
// Headings
<h1 className="font-heading text-4xl font-bold">Main Heading</h1>
<h2 className="font-heading text-3xl font-bold">Section Heading</h2>
<h3 className="font-heading text-2xl font-semibold">Subsection</h3>

// Body text
<p className="font-body text-base">Regular paragraph text</p>
<p className="font-body text-sm text-muted-foreground">Secondary text</p>
```

---

## Spacing

### Spacing Scale

Base unit: **4px (0.25rem)**

| Token | Rem | Pixels | Usage |
|-------|-----|--------|-------|
| `0` | `0` | 0px | No spacing |
| `1` | `0.25rem` | 4px | Tight spacing |
| `2` | `0.5rem` | 8px | Small spacing |
| `3` | `0.75rem` | 12px | Compact spacing |
| `4` | `1rem` | 16px | Base spacing |
| `5` | `1.25rem` | 20px | Medium spacing |
| `6` | `1.5rem` | 24px | Large spacing |
| `8` | `2rem` | 32px | Extra large spacing |
| `10` | `2.5rem` | 40px | Section spacing |
| `12` | `3rem` | 48px | Major section spacing |
| `16` | `4rem` | 64px | Page section spacing |
| `20` | `5rem` | 80px | Large page spacing |
| `24` | `6rem` | 96px | Hero spacing |
| `32` | `8rem` | 128px | Extra large spacing |

### Usage

```tsx
// Padding
<div className="p-4">Base padding</div>
<div className="px-6 py-4">Custom padding</div>

// Margin
<div className="mb-8">Bottom margin</div>
<div className="mt-12">Top margin</div>

// Gap (for flex/grid)
<div className="flex gap-4">Items with gap</div>
<div className="grid gap-6">Grid with gap</div>
```

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `none` | `none` | No shadow |
| `sm` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Subtle elevation |
| `base` | `0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)` | Default elevation |
| `md` | `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)` | Medium elevation |
| `lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)` | Large elevation |
| `xl` | `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)` | Extra large elevation |
| `2xl` | `0 25px 50px -12px rgba(0, 0, 0, 0.25)` | Maximum elevation |
| `inner` | `inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)` | Inset shadow |

### Usage

```tsx
<div className="shadow-sm">Subtle shadow</div>
<div className="shadow-md">Medium shadow</div>
<div className="shadow-lg hover:shadow-xl">Hover elevation</div>
```

---

## Border Radius

| Token | Rem | Pixels | Usage |
|-------|-----|--------|-------|
| `none` | `0` | 0px | Sharp corners |
| `sm` | `0.125rem` | 2px | Slight rounding |
| `base` | `0.25rem` | 4px | Small rounding |
| `md` | `0.375rem` | 6px | Medium rounding |
| `lg` | `0.5rem` | 8px | Large rounding |
| `xl` | `0.75rem` | 12px | Extra large rounding (default) |
| `2xl` | `1rem` | 16px | Very large rounding |
| `3xl` | `1.5rem` | 24px | Maximum rounding |
| `full` | `9999px` | - | Fully rounded (circles) |

### Usage

```tsx
<button className="rounded-lg">Rounded button</button>
<div className="rounded-xl">Rounded card</div>
<div className="rounded-full">Circular element</div>
```

---

## Transitions

### Duration

| Token | Value | Usage |
|-------|-------|-------|
| `fast` | `150ms` | Quick interactions |
| `base` | `200ms` | Default transitions |
| `slow` | `300ms` | Smooth transitions |
| `slower` | `500ms` | Deliberate transitions |

### Easing

| Token | Value | Usage |
|-------|-------|-------|
| `linear` | `linear` | Constant speed |
| `easeIn` | `cubic-bezier(0.4, 0, 1, 1)` | Slow start |
| `easeOut` | `cubic-bezier(0, 0, 0.2, 1)` | Slow end |
| `easeInOut` | `cubic-bezier(0.4, 0, 0.2, 1)` | Smooth (default) |

### Usage

```tsx
<div className="transition-all duration-200 ease-in-out">
  Smooth transition
</div>
```

---

## Components

### Button

**Sizes:**
- `sm`: `2.25rem` (36px) height
- `md`: `2.5rem` (40px) height (default)
- `lg`: `2.75rem` (44px) height

**Variants:**
- `default`: Primary action (Copper)
- `secondary`: Secondary action (Titanium)
- `outline`: Outlined button
- `ghost`: Transparent background
- `destructive`: Destructive action
- `link`: Link-style button

**Example:**
```tsx
<Button variant="default" size="md">
  Primary Action
</Button>
```

### Input

**Sizes:**
- `sm`: `2.25rem` (36px) height
- `md`: `2.5rem` (40px) height (default)
- `lg`: `2.75rem` (44px) height

**Example:**
```tsx
<Input placeholder="Enter text" />
```

### Card

**Padding:**
- `sm`: `1rem` (16px)
- `md`: `1.5rem` (24px)
- `lg`: `2rem` (32px)

**Border Radius:** `0.75rem` (12px)

**Example:**
```tsx
<Card className="p-6">
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
  </CardHeader>
  <CardContent>Card content</CardContent>
</Card>
```

### Badge

**Sizes:**
- `sm`: `0.125rem 0.5rem` padding
- `md`: `0.25rem 0.75rem` padding

**Border Radius:** `9999px` (fully rounded)

**Example:**
```tsx
<Badge variant="default">Status</Badge>
```

---

## Layout

### Container

**Max Widths:**
- `sm`: `640px`
- `md`: `768px`
- `lg`: `1024px`
- `xl`: `1280px`
- `2xl`: `1400px` (default)

**Padding:**
- Mobile: `1rem` (16px)
- Tablet: `1.5rem` (24px)
- Desktop: `2rem` (32px)

---

## Header (Top Bar)

The header is a persistent navigation bar that appears at the top of all application pages. It provides consistent navigation, branding, and user controls.

### Structure

The header follows a **three-section layout pattern**:

```
┌─────────────────────────────────────────────────────────┐
│ [Left]              [Center]              [Right]       │
│ Back + Logo         Tabs (Desktop)       User Profile   │
└─────────────────────────────────────────────────────────┘
```

### Layout Sections

#### Left Section
- **Back Button** (conditional): Appears when not on the main/default view
  - Icon: ArrowLeft
  - Text: "Back"
  - Hidden on mobile when tabs are hidden
- **Logo**: Application branding
  - Variant: `minimal`
  - Size: `lg`
  - Responsive scaling: `scale-75 sm:scale-100`

#### Center Section
- **Tabs**: Primary navigation between main sections
  - Hidden on mobile (replaced by bottom navigation)
  - Centered using absolute positioning
  - Position: `absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2`
  - Common tabs: "RCDO", "Meetings", "My Workspace"

#### Right Section
- **User Profile Header**: User avatar, name, and account menu
  - Positioned absolutely to avoid clipping
  - Includes dropdown menu for account actions

### Styling Tokens

```css
/* Header Container */
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid hsl(var(--border));
  background: white;
  flex-shrink: 0;
}

/* Header Content Container */
.header-container {
  container: mx-auto;
  padding: 1rem; /* px-4 */
  padding-top: 0.75rem; /* py-3 */
  padding-bottom: 0.75rem; /* py-3 */
  /* sm: */
  padding-top: 1rem; /* py-4 */
  padding-bottom: 1rem; /* py-4 */
  
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding-right: 5rem; /* pr-20 - space for user profile */
}
```

### Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| **Mobile** (`< 640px`) | Tabs hidden, Back button conditional, Logo scaled down |
| **Tablet** (`≥ 640px`) | Tabs visible, Full logo size, All sections visible |
| **Desktop** (`≥ 1024px`) | Full layout with all features |

### Implementation Example

```tsx
<header className="sticky top-0 z-50 border-b bg-white">
  <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
    {/* Left: Back button and Logo */}
    <div className="flex items-center gap-4">
      {activeTab !== 'main' && !isMobile && (
        <button
          onClick={() => navigate('/dashboard/main')}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      )}
      <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
    </div>
    
    {/* Center: Tabs - Hidden on mobile */}
    {!isMobile && (
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-10">
            <TabsTrigger value="rcdo" className="px-6">RCDO</TabsTrigger>
            <TabsTrigger value="main" className="px-6">Meetings</TabsTrigger>
            <TabsTrigger value="checkins" className="px-6">My Workspace</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    )}
    
    {/* Right: User Profile */}
    <UserProfileHeader />
  </div>
</header>
```

### Design Principles

1. **Sticky Positioning**: Always visible at top of viewport
2. **Z-Index**: `z-50` ensures header stays above content
3. **Consistent Height**: Responsive padding maintains consistent visual weight
4. **Clear Hierarchy**: Left (navigation), Center (primary nav), Right (user)
5. **Mobile-First**: Gracefully degrades on smaller screens

---

## Sidebars

Sidebars provide contextual navigation and information. The design system supports **left sidebars** (navigation) and **right sidebars** (contextual feeds).

### Left Sidebar (Navigation)

Left sidebars are used for primary navigation, settings, and hierarchical content navigation.

#### Settings Navigation Pattern

**Structure:**
- Fixed width: `16rem` (256px / `w-64`)
- Full height: `min-h-[calc(100vh-73px)]` (accounts for header)
- Border: Right border with Rose Gold accent
- Background: Platinum (`#F5F3F0`)

**Navigation Items:**
- Full-width buttons
- Active state: Titanium background with white text
- Inactive state: Ghost variant with Titanium text
- Hover: Subtle Platinum background

**Styling:**
```css
.left-sidebar {
  width: 16rem; /* w-64 */
  border-right: 1px solid hsl(15, 60%, 77%, 0.3); /* border-[#E8B4A0]/30 */
  background: #F5F3F0; /* bg-[#F5F3F0] */
  min-height: calc(100vh - 73px);
}

.nav-item-active {
  background: #4A5D5F; /* bg-[#4A5D5F] */
  color: white;
  font-weight: 500;
}

.nav-item-inactive {
  color: #4A5D5F; /* text-[#4A5D5F] */
  hover: {
    background: #F5F3F0; /* hover:bg-[#F5F3F0] */
    color: #2C2C2C; /* hover:text-[#2C2C2C] */
  }
}
```

**Implementation Example:**
```tsx
<nav className="w-64 border-r border-[#E8B4A0]/30 bg-[#F5F3F0] min-h-[calc(100vh-73px)]">
  <div className="p-4 space-y-1">
    {sections.map((section) => (
      <Button
        key={section.id}
        variant={activeSection === section.id ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onSectionChange(section.id)}
        className={cn(
          "font-body w-full justify-start",
          activeSection === section.id 
            ? "bg-[#4A5D5F] text-white hover:bg-[#5B6E7A] font-medium" 
            : "text-[#4A5D5F] hover:bg-[#F5F3F0] hover:text-[#2C2C2C]"
        )}
      >
        {section.label}
      </Button>
    ))}
  </div>
</nav>
```

#### Hierarchical Navigation Sidebar

**Structure:**
- Collapsible/expandable sections
- Drag handle for resizing (desktop)
- Tree-like navigation structure
- Active item highlighting

**Features:**
- **Resizable**: Desktop users can drag to resize width
- **Collapsible Sections**: Groups can be expanded/collapsed
- **Active State**: Current page/item highlighted
- **Mobile**: Hidden by default, shown via Sheet/Drawer

**Styling:**
```css
.nav-sidebar {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--sidebar-border));
  border-radius: 0.5rem; /* rounded-lg */
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 
              0 2px 4px -2px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
  padding: 0.75rem; /* p-3 */
}

.nav-item {
  min-height: 44px; /* Touch-friendly */
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  hover: {
    background: hsl(var(--sidebar-accent));
  }
}

.nav-item-active {
  background: hsl(var(--sidebar-accent));
  color: hsl(var(--sidebar-accent-foreground));
}
```

**Responsive Behavior:**
- **Desktop**: Always visible, resizable
- **Tablet**: Visible, fixed width
- **Mobile**: Hidden, accessible via menu button in header

### Right Sidebar (Contextual Feeds)

Right sidebars display contextual information, feeds, or supplementary content.

#### Check-in Feed Sidebar

**Structure:**
- Fixed position: `fixed right-0 top-[73px] bottom-0`
- Fixed width: `360px` (`w-[360px]`)
- Border: Left border
- Background: White with shadow
- Scrollable: `overflow-y-auto`

**Styling:**
```css
.right-sidebar {
  position: fixed;
  right: 0;
  top: 73px; /* Below header */
  bottom: 0;
  width: 360px; /* w-[360px] */
  border-left: 1px solid hsl(var(--sidebar-border));
  background: hsl(var(--background));
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 
              0 2px 4px -2px rgba(0, 0, 0, 0.1);
  overflow-y: auto;
  padding: 0.75rem; /* p-3 */
  z-index: 10;
}
```

**Implementation Example:**
```tsx
<aside className="hidden lg:block fixed right-0 top-[73px] bottom-0 w-[360px] border-l border-sidebar-border bg-background shadow-[0_4px_6px_-1px_rgb(0_0_0_/_0.1),_0_2px_4px_-2px_rgb(0_0_0_/_0.1)] overflow-y-auto p-3 z-10">
  <CheckinFeedSidebar viewAsUserId={viewAsUserId} filteredNodeIds={visibleParentIds} />
</aside>
```

#### Floating Sidebar Pattern (Design System Example)

**Structure:**
- Fixed position with margins: `fixed right-4 top-[calc(73px+1rem)] bottom-4`
- Fixed width: `360px` (`w-[360px]`)
- Rounded corners: `rounded-lg`
- Border: Full border
- Background: Opaque white with backdrop blur
- Enhanced shadow: `shadow-lg`
- Scrollable: `overflow-y-auto`

**Styling:**
```css
.floating-sidebar {
  position: fixed;
  right: 1rem; /* 16px margin from right */
  top: calc(73px + 1rem); /* Below header + 16px margin */
  bottom: 1rem; /* 16px margin from bottom */
  width: 360px;
  border-radius: 0.5rem; /* rounded-lg */
  border: 1px solid hsl(var(--sidebar-border));
  background: rgba(255, 255, 255, 0.95); /* bg-white/95 */
  backdrop-filter: blur(8px); /* backdrop-blur-sm */
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 
              0 4px 6px -4px rgba(0, 0, 0, 0.1); /* shadow-lg */
  overflow-y: auto;
  padding: 0.75rem; /* p-3 */
  z-index: 10;
}
```

**Implementation Example (Workspace Sidebar):**
```tsx
<aside className="hidden lg:block fixed right-4 top-[calc(73px+1rem)] bottom-4 w-[360px] rounded-lg border border-sidebar-border bg-white/95 backdrop-blur-sm shadow-lg overflow-y-auto p-3 z-10">
  <MyCheckinFeedSidebar />
</aside>
```

**Design Principles:**
- **Floating Effect**: Margins on all sides (top, bottom, right) create visual separation from page edges
- **Elevation**: Enhanced shadow (`shadow-lg`) provides depth perception
- **Opacity**: Semi-transparent white background (`bg-white/95`) with backdrop blur creates a frosted glass effect
- **Rounded Corners**: Softens the appearance and enhances the floating aesthetic

**Content Patterns:**
- **Feed Items**: Chronological list of updates/activities
- **Grouping**: Items grouped by date or category
- **Actions**: Quick actions on items (if applicable)
- **Empty States**: Helpful messages when no content

### Sidebar Layout Patterns

#### Pattern 1: Left Navigation + Main Content

```
┌──────────┬────────────────────────────┐
│          │                            │
│  Left    │      Main Content          │
│ Sidebar  │      (Scrollable)          │
│          │                            │
└──────────┴────────────────────────────┘
```

**Use Case**: Settings pages, detail pages with navigation

#### Pattern 2: Main Content + Right Feed

```
┌────────────────────────────┬──────────┐
│                            │          │
│      Main Content          │  Right   │
│      (Scrollable)          │ Sidebar  │
│                            │          │
└────────────────────────────┴──────────┘
```

**Use Case**: Dashboard with activity feed, detail pages with check-ins

#### Pattern 3: Left Nav + Main + Right Feed

```
┌──────────┬──────────────────┬──────────┐
│          │                  │          │
│  Left    │   Main Content   │  Right   │
│ Sidebar  │   (Scrollable)   │ Sidebar  │
│          │                  │          │
└──────────┴──────────────────┴──────────┘
```

**Use Case**: Complex detail pages with navigation and contextual info

### Responsive Behavior

| Breakpoint | Left Sidebar | Right Sidebar |
|------------|--------------|---------------|
| **Mobile** (`< 640px`) | Hidden, accessible via Sheet | Hidden |
| **Tablet** (`640px - 1023px`) | Visible, fixed width | Hidden |
| **Desktop** (`≥ 1024px`) | Visible, resizable | Visible, fixed width |

### Mobile Sidebar Pattern

On mobile, sidebars are replaced by **Sheet/Drawer components**:

```tsx
{/* Mobile Navigation Sidebar */}
<div className="md:hidden">
  <Sheet open={mobileNavOpen} onOpenChange={onMobileNavOpenChange}>
    <SheetContent side="left" className="w-80">
      <DetailPageNavigation {...props} />
    </SheetContent>
  </Sheet>
</div>
```

**Mobile Sheet Styling:**
- Width: `20rem` (320px / `w-80`)
- Side: `left` for navigation, `right` for feeds
- Overlay: Semi-transparent backdrop
- Animation: Slide-in from side

### Design Tokens

```typescript
export const sidebars = {
  left: {
    width: {
      default: '16rem', // 256px
      collapsed: '4rem', // 64px
      expanded: '20rem', // 320px
    },
    background: '#F5F3F0', // Platinum
    border: 'rgba(232, 180, 160, 0.3)', // Rose Gold / 30%
  },
  right: {
    width: {
      default: '360px',
      narrow: '280px',
      wide: '440px',
    },
    background: 'white',
    border: 'hsl(var(--sidebar-border))',
  },
  mobile: {
    sheetWidth: '20rem', // 320px
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
} as const;
```

### Accessibility

1. **Keyboard Navigation**: All sidebar items must be keyboard accessible
2. **Focus Indicators**: Clear focus states for navigation items
3. **ARIA Labels**: Proper labeling for screen readers
4. **Skip Links**: Option to skip sidebar navigation
5. **Touch Targets**: Minimum 44x44px for mobile interactions

### Usage Guidelines

1. **Left Sidebar**: Use for primary navigation, settings, or hierarchical content
2. **Right Sidebar**: Use for contextual information, feeds, or supplementary content
3. **Mobile**: Always provide alternative access (Sheet/Drawer)
4. **Consistency**: Maintain consistent widths and styling across similar sidebars
5. **Performance**: Lazy load sidebar content when possible

---

## Navigation

### Tabs

**Height:** `2.5rem` (40px)
**Padding:** `0.5rem 1rem`
**Border Radius:** `0.75rem` (12px)
**Active Indicator:** `2px` bottom border

**Example:**
```tsx
<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content 1</TabsContent>
  <TabsContent value="tab2">Content 2</TabsContent>
</Tabs>
```

### Mobile Bottom Navigation

**Height:** `3.5rem` (56px)
**Background:** White with border top
**Active State:** Copper color

---

## Usage Guidelines

### Color Usage

1. **Primary Actions:** Use Copper (`#C97D60`)
2. **Secondary Actions:** Use Titanium (`#4A5D5F`)
3. **Success States:** Use Verdigris (`#6B9A8F`)
4. **Warning States:** Use Brass (`#B89A6B`)
5. **Error States:** Use Bronze (`#8B6F47`)
6. **Text:** Use Cast Iron (`#2C2C2C`) - **only for text and logos**
7. **Backgrounds:** Use White, Platinum, or White Gold

### Typography Guidelines

1. **Headings:** Always use Atkinson Hyperlegible
2. **Body Text:** Always use Public Sans
3. **Code:** Use monospace font
4. **Line Height:** Use `1.5` for body text, `1.25` for headings

### Spacing Guidelines

1. **Consistent Spacing:** Always use the spacing scale (multiples of 4px)
2. **Vertical Rhythm:** Use consistent vertical spacing between sections
3. **Component Padding:** Use `p-4`, `p-6`, or `p-8` for cards
4. **Gap in Layouts:** Use `gap-4` or `gap-6` for flex/grid layouts

### Component Guidelines

1. **Buttons:** Use appropriate variant for action importance
2. **Cards:** Use consistent padding (`p-6` default)
3. **Forms:** Use consistent input heights and spacing
4. **Badges:** Use for status indicators only

### Accessibility

1. **Color Contrast:** Ensure WCAG AA compliance (4.5:1 for text)
2. **Focus States:** Always provide visible focus indicators
3. **Touch Targets:** Minimum 44x44px for mobile
4. **Font Sizes:** Minimum 16px for body text

---

## Importing Tokens

```typescript
// Import all tokens
import { designTokens } from '@/design-system';

// Import specific tokens
import { colors, spacing, typography } from '@/design-system/tokens';

// Use in components
const primaryColor = colors.primary.copper.hex;
const baseSpacing = spacing[4];
const headingFont = typography.fonts.heading;
```

---

## CSS Variables

All design tokens are available as CSS variables in `src/index.css`:

```css
/* Colors */
--color-copper
--color-titanium
/* ... */

/* Typography */
--font-heading
--font-body

/* Spacing, shadows, etc. */
--radius
--shadow-md
/* ... */
```

---

**Last Updated:** 2024
**Version:** 1.0.0

