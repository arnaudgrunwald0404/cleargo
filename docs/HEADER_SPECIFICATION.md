# Header Navigation Specification

This document describes the complete header/navigation bar implementation, including structure, CSS variables, and styling, so it can be replicated in other tools.

## Overview

The header is a fixed navigation bar at the top of the page with:
- **Left side**: Logo with "ClearGO" text and primary navigation tabs
- **Right side**: Scope toggle, epic search, and user avatar

## CSS Variables

All styling uses CSS custom properties defined in `globals.css`. Here are the relevant variables:

```css
/* Navigation Variables */
--nav-bg: #1E3A5F;                    /* Dark blue background */
--nav-text: #FFFFFF;                   /* White text color */
--nav-height: 64px;                    /* Header height */
--nav-padding-x: 24px;                 /* Horizontal padding */
--nav-padding-y: 16px;                 /* Vertical padding (not used in header) */

/* Typography */
--font-heading: "Atkinson Hyperlegible", system-ui, -apple-system, sans-serif;
--font-body: "Public Sans", Inter, system-ui, -apple-system, sans-serif;
--font-size-base: 14px;
--font-size-xl: 20px;
--font-size-sm: 12px;
--font-weight-medium: 500;
--font-weight-bold: 700;

/* Colors */
--color-white: #FFFFFF;
--color-blue-100: #DBEAFE;
--color-blue-200: #BFDBFE;
--color-accent: #6B46C1;               /* Purple accent color */
--color-accent-bg: rgba(107, 70, 193, 0.15);  /* Accent with 15% opacity */

/* Spacing */
--spacing-2: 8px;
--spacing-3: 12px;
--spacing-4: 16px;
--spacing-5: 20px;
--spacing-6: 24px;
--spacing-8: 32px;

/* Border Radius */
--radius-base: 6px;
--radius-md: 8px;

/* Transitions */
--transition-base: 0.2s ease;

/* Z-index */
--z-index-ai-panel: 1000;
```

## Header Structure

### Main Container

```html
<header style="
  height: var(--nav-height, 64px);
  backgroundColor: var(--nav-bg, #1E3A5F);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  zIndex: var(--z-index-ai-panel, 1000);
  display: flex;
  alignItems: center;
  padding: 0 var(--nav-padding-x, 24px);
  minHeight: var(--nav-height, 64px);
  width: 100%;
  boxSizing: border-box;
">
```

### Inner Container

```html
<div style="
  maxWidth: 100%;
  width: 100%;
  display: flex;
  justifyContent: space-between;
  alignItems: center;
  height: 100%;
">
```

## Left Side: Logo and Navigation

### Logo Container

```html
<Link href="/" style="
  display: flex;
  alignItems: center;
  gap: 8px;
  textDecoration: none;
">
```

### Logo Icon (Purple Square with Lightning Bolt)

```html
<div style="
  width: 40px;
  height: 40px;
  borderRadius: var(--radius-md, 8px);
  backgroundColor: var(--color-accent, #6B46C1);
  display: flex;
  alignItems: center;
  justifyContent: center;
">
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
</div>
```

### Logo Text

```html
<span style="
  fontFamily: var(--font-heading, system-ui, sans-serif);
  fontSize: var(--font-size-xl, 20px);
  fontWeight: var(--font-weight-bold, 700);
  color: var(--nav-text, #FFFFFF);
">
  ClearGO
</span>
```

### Navigation Tabs Container

```html
<nav style="
  display: flex;
  alignItems: center;
  gap: 8px;
  height: 100%;
">
```

### Navigation Tab (Inactive)

```html
<Link
  href="/epics"
  style="
    color: var(--color-blue-200, #BFDBFE);
    fontSize: var(--font-size-base, 14px);
    fontWeight: var(--font-weight-medium, 500);
    textDecoration: none;
    fontFamily: var(--font-body, system-ui, sans-serif);
    padding: var(--spacing-2, 8px) var(--spacing-3, 12px);
    borderRadius: var(--radius-base, 6px);
    backgroundColor: transparent;
    borderBottom: 2px solid transparent;
    transition: var(--transition-base, 0.2s ease);
    height: fit-content;
    display: flex;
    alignItems: center;
  "
  onMouseEnter={(e) => {
    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    e.currentTarget.style.color = 'var(--color-blue-100)';
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    e.currentTarget.style.color = 'var(--color-blue-200)';
  }}
>
  Releases
</Link>
```

### Navigation Tab (Active)

```html
<Link
  href="/epics"
  style="
    color: var(--nav-text, #FFFFFF);
    fontSize: var(--font-size-base, 14px);
    fontWeight: var(--font-weight-bold, 700);
    textDecoration: none;
    fontFamily: var(--font-body, system-ui, sans-serif);
    padding: var(--spacing-2, 8px) var(--spacing-3, 12px);
    borderRadius: var(--radius-base, 6px);
    backgroundColor: var(--color-accent-bg, rgba(107, 70, 193, 0.15));
    borderBottom: 2px solid var(--color-accent, #6B46C1);
    transition: var(--transition-base, 0.2s ease);
    height: fit-content;
    display: flex;
    alignItems: center;
  "
>
  Releases
</Link>
```

**Primary Navigation Tabs:**
- Home (`/`)
- Releases (`/epics`)
- Feedback (`/feedback`)
- Meetings (`/meetings`) - conditional based on permissions
- Settings (`/admin/settings`) - conditional based on permissions

## Right Side: Controls

### Right Side Container

```html
<div style="
  display: flex;
  alignItems: center;
  gap: 20px;
">
```

### Scope Toggle (SegmentedControl)

Uses Mantine's `SegmentedControl` component with custom styling:

```tsx
<SegmentedControl
  value={scope}
  onChange={(value) => setScope(value as 'all' | 'my')}
  data={[
    { label: 'All scope', value: 'all' },
    { label: 'My scope', value: 'my' },
  ]}
  size="sm"
  styles={{
    root: {
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    indicator: {
      backgroundColor: 'var(--color-accent, #6B46C1)',
    },
    label: {
      color: 'var(--nav-text, #FFFFFF)',
      fontSize: 'var(--font-size-sm, 12px)',
      fontWeight: 'var(--font-weight-medium, 500)',
      padding: '4px 12px',
    },
  }}
/>
```

**Additional CSS for SegmentedControl selected state:**

```css
.mantine-SegmentedControl-input:checked + .mantine-SegmentedControl-label,
.mantine-SegmentedControl-label[data-active="true"] {
  color: #FFFFFF !important;
  font-weight: 600 !important;
}
```

### Epic Search

Search input with dropdown results:

```html
<div style="
  position: relative;
  width: 280px;
">
  <div style="position: relative, width: 100%">
    <input
      type="text"
      placeholder="Search for epic"
      style="
        width: 100%;
        height: 36px;
        padding: var(--spacing-2) var(--spacing-4) var(--spacing-2) 36px;
        borderRadius: var(--radius-md);
        border: none;
        backgroundColor: rgba(255, 255, 255, 0.1);
        color: var(--nav-text);
        fontSize: var(--font-size-base);
        fontFamily: var(--font-body);
      "
      className="placeholder-white placeholder-opacity-70"
    />
    <IconSearch
      size={16}
      style="
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--nav-text);
        pointerEvents: none;
      "
    />
  </div>
</div>
```

**Search Dropdown (when results appear):**

```html
<Paper
  shadow="md"
  p="xs"
  style="
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    zIndex: 10000;
    marginTop: 4px;
    maxHeight: 400px;
    overflowY: auto;
    backgroundColor: white;
    border: 1px solid var(--color-gray-200);
    borderRadius: var(--radius-md);
    boxShadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  "
>
  <!-- Search results list -->
</Paper>
```

### User Avatar

Uses Mantine's `Avatar` and `Menu` components:

```tsx
<Menu shadow="md" width={260} position="bottom-end">
  <Menu.Target>
    <UnstyledButton>
      <Group gap={7}>
        <Avatar
          src={imageUrl}
          alt={email}
          radius="xl"
          size={32}
          color={getColor(email)}  // Color based on email hash
        >
          {getInitials(email)}  // First 2 characters of email
        </Avatar>
      </Group>
    </UnstyledButton>
  </Menu.Target>
  <Menu.Dropdown>
    <!-- Menu items: Account Details, Settings (conditional), Sign out -->
  </Menu.Dropdown>
</Menu>
```

## Body Padding

The header is fixed, so the body needs padding to prevent content from being hidden:

```css
body {
  padding-top: 64px;  /* Matches --nav-height */
}
```

This is typically set via JavaScript:

```javascript
document.body.style.paddingTop = '64px';
```

## Complete CSS

Here's the complete CSS needed to replicate the header styling:

```css
/* Navigation Header */
.header {
  height: 64px;
  background-color: #1E3A5F;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  padding: 0 24px;
  min-height: 64px;
  width: 100%;
  box-sizing: border-box;
}

.header-container {
  max-width: 100%;
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

/* Logo */
.logo-link {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.logo-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background-color: #6B46C1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-text {
  font-family: "Atkinson Hyperlegible", system-ui, sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: #FFFFFF;
}

/* Navigation Tabs */
.nav-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
}

.nav-tab {
  color: #BFDBFE;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  font-family: "Public Sans", Inter, system-ui, sans-serif;
  padding: 8px 12px;
  border-radius: 6px;
  background-color: transparent;
  border-bottom: 2px solid transparent;
  transition: 0.2s ease;
  height: fit-content;
  display: flex;
  align-items: center;
}

.nav-tab:hover {
  background-color: rgba(255, 255, 255, 0.1);
  color: #DBEAFE;
}

.nav-tab.active {
  color: #FFFFFF;
  font-weight: 700;
  background-color: rgba(107, 70, 193, 0.15);
  border-bottom: 2px solid #6B46C1;
}

/* Right Side Controls */
.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

/* Search Input */
.search-container {
  position: relative;
  width: 280px;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 8px 16px 8px 36px;
  border-radius: 8px;
  border: none;
  background-color: rgba(255, 255, 255, 0.1);
  color: #FFFFFF;
  font-size: 14px;
  font-family: "Public Sans", Inter, system-ui, sans-serif;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #FFFFFF;
  pointer-events: none;
}

/* Search Dropdown */
.search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10000;
  margin-top: 4px;
  max-height: 400px;
  overflow-y: auto;
  background-color: white;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Scope Toggle */
.scope-toggle {
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.scope-toggle-label {
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 12px;
}

.scope-toggle-indicator {
  background-color: #6B46C1;
}

.scope-toggle-label.active {
  color: #FFFFFF !important;
  font-weight: 600 !important;
}

/* User Avatar */
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

/* Body Padding */
body {
  padding-top: 64px;
}
```

## Fonts

The header uses two custom fonts:

1. **Atkinson Hyperlegible** - For headings (logo text)
   - Designed for low vision readers with enhanced character recognition
   - Font weight: 700 (bold)
   - Size: 20px

2. **Public Sans** - For body text (navigation tabs, search)
   - Clean, modern sans-serif
   - Font weight: 500 (medium) for inactive tabs, 700 (bold) for active tabs
   - Size: 14px

## Color Palette

- **Background**: `#1E3A5F` (dark blue)
- **Text**: `#FFFFFF` (white)
- **Inactive Tab Text**: `#BFDBFE` (light blue)
- **Hover Tab Text**: `#DBEAFE` (lighter blue)
- **Accent Color**: `#6B46C1` (purple)
- **Accent Background**: `rgba(107, 70, 193, 0.15)` (purple with 15% opacity)
- **Search Background**: `rgba(255, 255, 255, 0.1)` (white with 10% opacity)
- **Hover Background**: `rgba(255, 255, 255, 0.1)` (white with 10% opacity)

## Responsive Considerations

The header is designed to be responsive:
- Fixed height of 64px
- Horizontal padding of 24px
- Flexbox layout that adapts to screen width
- Search input has fixed width of 280px but can be adjusted for smaller screens

## Accessibility

- All interactive elements have proper hover states
- Text has sufficient contrast (white on dark blue)
- Navigation uses semantic HTML (`<nav>`, `<header>`)
- Keyboard navigation supported through Next.js Link components
- ARIA labels should be added for screen readers

## Implementation Notes

1. The header is conditionally rendered based on user authentication and role
2. Some navigation items are conditionally shown based on user permissions
3. The scope toggle and search are hidden for users with only "OTHER" role
4. Active tab detection uses pathname matching
5. The header is fixed, so body content needs top padding
