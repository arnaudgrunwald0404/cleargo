# Design System Documentation

Patterns, spacing, and layout conventions for launch-readiness work. **Canonical brand colors and CSS variables** live in [`docs/COLOR_PALETTE.md`](../COLOR_PALETTE.md) and [`src/app/globals.css`](../../src/app/globals.css); when those sources differ from this file, treat the code as authoritative.

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

**Related documentation:** [`docs/COLOR_PALETTE.md`](../COLOR_PALETTE.md) (brand hex and variable names).

---

## Colors

Values below match [`docs/COLOR_PALETTE.md`](../COLOR_PALETTE.md) and the brand section of [`src/app/globals.css`](../../src/app/globals.css).

### Primary

| Name | HEX | Usage |
|------|-----|-------|
| **White** | `#FFFFFF` | Surfaces, text on dark |
| **Platinum** | `#FAF8F5` | Default page background |
| **Cast Iron** | `#37352A` | Primary text, nav surfaces, strong contrast |

### Signature accents

| Name | HEX | Usage |
|------|-----|-------|
| **Alloy** | `#FFA680` | Highlights, conditional “go” moments |
| **Copper** | `#FF7A52` | Primary accent, CTAs, logo moments |
| **Copper hover** | `#E66E4A` | Hover state (see `--color-copper-hover`) |

### Secondary

| Name | HEX |
|------|-----|
| **Bronze** | `#6C3A2A` |
| **Verdigris** | `#9EB4AB` |
| **Steel** | `#697771` |
| **Pewter** | `#A1B4BA` |
| **White Gold** | `#F4EBD7` |
| **Brass** | `#C3B497` |

### Semantic (UI feedback)

Defined in `globals.css` as base/light/dark ramps, for example:

| Role | Typical variable | Notes |
|------|------------------|-------|
| **Success** | `--color-success-base` (e.g. `#10B981`) | On-track, confirmations |
| **Warning** | `--color-warning-base` (e.g. `#FAB005`) | Caution |
| **Error** | `--color-error-base` (e.g. `#EF4444`) | Errors, destructive emphasis |
| **Info** | `--color-info-base` (e.g. `#228BE6`) | Neutral informational |

### CSS variables (brand)

```css
--color-white
--color-platinum
--color-cast-iron
--color-alloy
--color-copper
--color-copper-hover
--color-bronze
--color-verdigris
--color-steel
--color-pewter
--color-white-gold
--color-brass
/* Semantic */
--color-success-base
--color-warning-base
--color-error-base
--color-info-base
/* …plus `-light` / `-dark` variants in globals.css */
```

### Usage in code

Brand colors are **hex in `:root`**, not HSL components—use `var(--token)` directly.

```css
.button {
  background-color: var(--color-copper);
}

.button:hover {
  background-color: var(--color-copper-hover);
}
```

```tsx
// Tailwind arbitrary values
<div className="bg-[var(--color-copper)] text-white">
  Primary accent surface
</div>
```

---

## Typography

### Font families

Defined in [`src/app/globals.css`](../../src/app/globals.css) as CSS variables (Google fonts are wired through the Next.js app as needed).

| Role | Font stack | Usage |
|------|------------|-------|
| **Heading** | `"Atkinson Hyperlegible", system-ui, …` (`--font-heading`) | Headings (h1–h6), titles |
| **Body** | `"Public Sans", Inter, system-ui, …` (`--font-body`) | Body copy, most UI text |
| **Mono** | `"Fira Code", "Courier New", monospace` (`--font-mono`) | Code, IDs, technical strings |
| **Marcellus** | `var(--font-marcellus)` | Header / nav treatment where specified in product |

Mantine’s theme (`src/lib/mantine-theme.ts`) may still list Inter as a default family; prefer `var(--font-heading)` / `var(--font-body)` on product surfaces for brand consistency.

### Font sizes

The app’s **semantic type scale** (`--font-size-page-title`, `--font-size-body`, `--font-size-caption`, etc.) is defined in `globals.css` and differs slightly from a generic Tailwind rem ladder (for example, default UI body is **14px** via `--font-size-base`). Use those variables for new screens. The table below remains a useful rem reference for prose and marketing-style layouts.

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

### Typography scale

```tsx
// Prefer CSS variables from globals.css
<h1 style={{ fontFamily: "var(--font-heading)" }}>Main heading</h1>
<p style={{ fontFamily: "var(--font-body)" }}>Body text</p>

// Semantic sizes (examples — see --font-size-* in globals.css)
<span style={{ fontSize: "var(--font-size-caption)" }}>Caption</span>
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

ClearGO ships with **Mantine** for interactive UI and **Tailwind** for layout and one-off styling. Prefer `@mantine/core` primitives (`Button`, `TextInput`, `Card`, `Badge`, …) and align colors with the CSS variables above.

### Button (conceptual)

- **Primary:** copper (`var(--color-copper)`), sufficient contrast on white/platinum.
- **Secondary / subtle:** steel, ghost, or outline as appropriate to hierarchy.
- **Destructive:** semantic error ramp (`--color-error-*`), not bronze alone.

Use Mantine `Button` sizes (`xs`–`xl`) rather than hard-coded pixel heights unless matching a legacy spec.

### Forms

Use Mantine inputs (`TextInput`, `Select`, …) for focus rings, a11y, and density consistency with the rest of the app.

### Cards and badges

Use Mantine `Card` / `Paper` and `Badge` with theme or `style` / `className` tied to brand tokens. Default radius in tokens is typically `12px` (`--radius-lg`); adjust per surface.

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

### Styling tokens

```css
/* Header container */
.header {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--color-cast-iron-border, #e5e5e5);
  background: var(--color-white);
  flex-shrink: 0;
}

/* Inner row: mirror with Tailwind, e.g. container mx-auto px-4 py-3 sm:py-4 flex … */
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
- Border: Right border (e.g. `var(--color-cast-iron-border)` or a subtle brass/pewter line)
- Background: Platinum (`var(--color-platinum)`)

**Navigation Items:**
- Full-width buttons
- Active state: Cast Iron background with white text
- Inactive state: Ghost variant with Steel or Cast Iron text
- Hover: Subtle Platinum background

**Styling:**
```css
.left-sidebar {
  width: 16rem;
  border-right: 1px solid var(--color-cast-iron-border);
  background: var(--color-platinum);
  min-height: calc(100vh - 73px);
}

.nav-item-active {
  background: var(--color-cast-iron);
  color: var(--color-white);
  font-weight: 500;
}

.nav-item-inactive {
  color: var(--color-steel);
}
/* Hover: light neutral e.g. var(--color-cast-iron-bg) or platinum */
```

**Implementation example:**
```tsx
<nav className="w-64 border-r border-[var(--color-cast-iron-border)] bg-[var(--color-platinum)] min-h-[calc(100vh-73px)]">
  <div className="p-4 space-y-1">
    {sections.map((section) => (
      <Button
        key={section.id}
        variant={activeSection === section.id ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onSectionChange(section.id)}
        className={cn(
          "w-full justify-start",
          activeSection === section.id
            ? "bg-[var(--color-cast-iron)] text-white hover:bg-[var(--color-steel)] font-medium"
            : "text-[var(--color-steel)] hover:bg-[var(--color-platinum)] hover:text-[var(--color-cast-iron)]"
        )}
        style={{ fontFamily: "var(--font-body)" }}
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
    background: '#FAF8F5', // --color-platinum
    border: 'var(--color-cast-iron-border)',
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

### Mobile bottom navigation

**Height:** `3.5rem` (56px)  
**Background:** White with top border  
**Active state:** Copper (`var(--color-copper)`)

---

## Usage Guidelines

### Color usage

1. **Primary actions:** Copper (`var(--color-copper)`)
2. **Secondary actions / UI chrome:** Steel, Brass, or neutral grays as appropriate
3. **Success:** Semantic success tokens (`--color-success-base`, etc.)
4. **Warning:** Semantic warning tokens (`--color-warning-base`, etc.)
5. **Error / destructive emphasis:** Semantic error tokens (`--color-error-base`, etc.)
6. **Body text:** Cast Iron (`var(--color-cast-iron)`); reserve strongest contrast for primary reading
7. **Backgrounds:** White, Platinum, White Gold, or semantic light tints from `globals.css`

### Typography guidelines

1. **Headings:** Atkinson Hyperlegible via `var(--font-heading)`
2. **Body:** Public Sans via `var(--font-body)` (Inter remains in the stack as a fallback)
3. **Code:** `var(--font-mono)`
4. **Nav / display accents:** Marcellus where the product uses `var(--font-marcellus)`
5. **Line height:** `var(--line-height-normal)` for body, `var(--line-height-tight)` for headings

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
4. **Font sizes:** Default UI body size comes from `--font-size-body` in `globals.css`; use larger tokens for long-form reading and respect user zoom

---

## Using tokens in application code

There is no separate `@/design-system` token package in this repository. Use:

- **CSS:** `var(--color-*)`, `var(--font-heading)`, `var(--spacing-4)`, etc., from [`src/app/globals.css`](../../src/app/globals.css).
- **React:** Inline `style={{ color: "var(--color-cast-iron)" }}` or Tailwind arbitrary values such as `text-[var(--color-steel)]`.
- **Mantine:** Extend the theme in `src/lib/mantine-theme.ts` when you need defaults to match brand fonts or colors globally.

---

**Last updated:** April 2026  
**Version:** 1.1.0

