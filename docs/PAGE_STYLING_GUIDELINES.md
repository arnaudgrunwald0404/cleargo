# Page Styling Guidelines

This document defines the standard styling patterns used across all dashboard pages in ClearGO. These patterns ensure visual consistency and proper information hierarchy.

## Page Container Structure

All dashboard pages follow this structure:

```tsx
<div
  className="min-h-screen pb-8"
  style={{
    fontFamily: 'var(--font-body)',
    backgroundColor: 'var(--color-platinum)',
  }}
>
  <div
    style={{
      maxWidth: 'var(--page-container-max-width)', // 1280px
      margin: '0 auto',
      paddingLeft: 'var(--page-container-padding-x)', // 16px mobile
      paddingRight: 'var(--page-container-padding-x)',
      paddingTop: 'var(--page-container-padding-top)', // 32px
    }}
    className="sm:px-6 lg:px-8" // Responsive padding: 24px sm, 32px lg
  >
    {/* Page content */}
  </div>
</div>
```

### Container Variables
- `--page-container-max-width`: 1280px (max-w-7xl)
- `--page-container-padding-x`: 16px (mobile), 24px (sm), 32px (lg)
- `--page-container-padding-top`: 32px (space between nav and content)

## Typography Hierarchy

### Page Title (H1)

**Usage**: Main page heading at the top of every page

**Implementation**:
```tsx
<div className="mb-8">
  <Title
    order={1}
    className="text-4xl font-bold mb-2"
    style={{
      fontFamily: 'var(--font-marcellus), serif',
      color: 'var(--color-gray-900)',
      fontSize: 'var(--font-size-4xl)', // 32px
      fontWeight: 'var(--font-weight-bold)', // 700
    }}
  >
    Page Title
  </Title>
  <Text
    size="lg"
    style={{
      fontFamily: 'var(--font-body)',
      color: 'var(--color-gray-500)',
      fontSize: 'var(--font-size-lg)', // 18px
    }}
  >
    Page description or subtitle
  </Text>
</div>
```

**Specifications**:
- Font: `var(--font-marcellus), serif` (Marcellus)
- Size: `var(--font-size-4xl)` (32px)
- Weight: `var(--font-weight-bold)` (700)
- Color: `var(--color-gray-900)` (#111827)
- Margin bottom: `mb-2` (8px)
- Container margin bottom: `mb-8` (32px)

### Page Subtitle/Description

**Usage**: Appears directly below the page title

**Implementation**:
```tsx
<Text
  size="lg"
  style={{
    fontFamily: 'var(--font-body)',
    color: 'var(--color-gray-500)',
    fontSize: 'var(--font-size-lg)', // 18px
  }}
>
  Description text
</Text>
```

**Specifications**:
- Font: `var(--font-body)` (Public Sans)
- Size: `var(--font-size-lg)` (18px)
- Color: `var(--color-gray-500)` (#6B7280)
- Margin: `mt-0.5rem` or inline style `marginTop: '0.5rem'`

### Section/Card Titles (H3)

**Usage**: Titles for cards and major sections

**Implementation**:
```tsx
<Title order={3} size="h4">
  Section Title
</Title>
```

**Specifications**:
- Font: `var(--font-heading)` (Atkinson Hyperlegible) - inherited from Mantine
- Size: `var(--font-size-card-title)` (24px) via Mantine `size="h4"`
- Weight: Bold (inherited from Mantine Title)
- Color: Inherited from Mantine theme

### Subsection Titles (H4)

**Usage**: Subsections within cards

**Implementation**:
```tsx
<Title order={4} size="h5">
  Subsection Title
</Title>
```

**Specifications**:
- Font: `var(--font-heading)` (Atkinson Hyperlegible)
- Size: `var(--font-size-subsection)` (20px) via Mantine `size="h5"`
- Weight: Semibold (600)

## Spacing Patterns

### Page-Level Spacing

- **Title section**: `mb-8` (32px) - margin below title/description container
- **Between major sections**: `gap="md"` (16px) when using Mantine Stack
- **Page bottom padding**: `pb-8` (32px) on outer container

### Component-Level Spacing

- **Stack gap**: `gap="md"` (16px) for vertical spacing between cards
- **Card padding**: Mantine Card default (`p="md"` = 16px) or `p-6` (24px) for larger cards
- **Card header margin**: `mb-4` (16px) for card title sections
- **Form field spacing**: `space-y-4` (16px) between form fields

### Group/Row Spacing

- **Horizontal groups**: `gap="md"` (16px) for Mantine Group
- **Filter groups**: `gap="md"` (16px) for filter controls

## Filter Row Pattern

Filter rows provide a consistent horizontal layout for filtering content across pages. This pattern is used on the Epics page and Analytics page.

### Structure

```tsx
<Group mb="lg" align="center" gap="sm">
  <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>Filters:</Text>
  <Box
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '16px',
      padding: '8px 0'
    }}
  >
    {/* Filter inputs */}
  </Box>
</Group>
```

### Specifications

**Group Container:**
- Margin bottom: `mb="lg"` (24px)
- Alignment: `align="center"` - vertically centers "Filters:" label with dropdown inputs
- Gap: `gap="sm"` (8px) - spacing between label and filter container

**"Filters:" Label:**
- Size: `size="sm"` (13px)
- Color: `c="dimmed"` (gray-500)
- Font: `var(--font-body)` (Public Sans)
- Vertically centered with dropdown inputs (not with date input labels)

**Filter Container Box:**
- Display: `flex` with `flexWrap: 'wrap'` for responsive wrapping
- Alignment: `alignItems: 'center'` - centers all filter inputs vertically
- Gap: `16px` between filter inputs
- Padding: `8px 0` (vertical padding)

### Filter Input Types

#### Select Dropdowns

**Usage**: For filtering by predefined options (Tier, Pod, Status, etc.)

**Implementation**:
```tsx
<Select
  placeholder="All Tiers"
  data={[
    { value: '', label: 'All Tiers' },
    { value: 'TIER_1', label: 'Tier 1' },
    // ... more options
  ]}
  value={filters.tier}
  onChange={(value) => setFilters({ ...filters, tier: value || '' })}
  clearable
  style={{ minWidth: 120 }}
  styles={{
    input: {
      borderRadius: 8,
      border: '1px solid var(--color-gray-300)',
      backgroundColor: 'var(--color-gray-50)',
      fontFamily: 'var(--font-body)'
    }
  }}
/>
```

**Specifications**:
- Placeholder: Descriptive text like "All Tiers", "All Pods"
- First option: `{ value: '', label: 'All [Type]' }` for "show all" option
- Clearable: `clearable` prop enabled
- Min width: `120px` to `150px` depending on content
- Border radius: `8px`
- Border: `1px solid var(--color-gray-300)`
- Background: `var(--color-gray-50)` for selects (lighter than text inputs)
- Font: `var(--font-body)`

#### Date Inputs with Labels

**Usage**: For date range filtering (From/To dates)

**Implementation**:
```tsx
<Box style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end' }}>
  <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)', lineHeight: 1, height: '16px' }}>
    From
  </Text>
  <TextInput
    type="date"
    value={filters.dateRangeStart}
    onChange={(e) => setFilters({ ...filters, dateRangeStart: e.target.value })}
    style={{ minWidth: 160 }}
    styles={{
      input: {
        borderRadius: 8,
        border: '1px solid var(--color-gray-300)',
        fontFamily: 'var(--font-body)'
      }
    }}
  />
</Box>
```

**Specifications**:
- Wrapper: `Box` with `flexDirection: 'column'` and `justifyContent: 'flex-end'`
- Label: `size="xs"` (12px), `c="dimmed"`, fixed `height: '16px'` for consistent spacing
- Gap: `4px` between label and input
- Input min width: `160px`
- Border radius: `8px`
- Border: `1px solid var(--color-gray-300)`
- Background: White (default, no backgroundColor specified)
- Font: `var(--font-body)`
- Label text: Short labels like "From", "To" (not "From date" or "To date")

**Alignment Note**: Date inputs use `justifyContent: 'flex-end'` so the input field aligns with dropdowns, while labels sit above. The "Filters:" label aligns with the center of dropdown inputs, not the date input labels.

#### Text Inputs (Search)

**Usage**: For text search filters

**Implementation**:
```tsx
<TextInput
  placeholder="Search epics..."
  value={filters.search}
  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
  leftSection={<IconSearch size={18} />}
  rightSection={
    filters.search ? (
      <ActionIcon size="sm" variant="transparent" onClick={() => setFilters({ ...filters, search: "" })}>
        <IconX size={14} />
      </ActionIcon>
    ) : null
  }
  style={{ minWidth: 220, maxWidth: 320 }}
  styles={{
    input: {
      borderRadius: 8,
      border: '1px solid var(--color-gray-300)',
      fontFamily: 'var(--font-body)'
    }
  }}
/>
```

**Specifications**:
- Placeholder: Descriptive text like "Search epics..."
- Left section: Search icon (`IconSearch size={18}`)
- Right section: Clear button (X icon) when value exists
- Min width: `220px`, Max width: `320px`
- Border radius: `8px`
- Border: `1px solid var(--color-gray-300)`
- Background: White (default)
- Font: `var(--font-body)`

### Complete Filter Row Example

```tsx
<Group mb="lg" align="center" gap="sm">
  <Text size="sm" c="dimmed" style={{ fontFamily: 'var(--font-body)' }}>Filters:</Text>
  <Box
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '16px',
      padding: '8px 0'
    }}
  >
    {/* Select dropdown */}
    <Select
      placeholder="All Tiers"
      data={[
        { value: '', label: 'All Tiers' },
        { value: 'TIER_1', label: 'Tier 1' },
        { value: 'TIER_2', label: 'Tier 2' },
      ]}
      value={filters.tier}
      onChange={(value) => setFilters({ ...filters, tier: value || '' })}
      clearable
      style={{ minWidth: 120 }}
      styles={{
        input: {
          borderRadius: 8,
          border: '1px solid var(--color-gray-300)',
          backgroundColor: 'var(--color-gray-50)',
          fontFamily: 'var(--font-body)'
        }
      }}
    />

    {/* Date input with label */}
    <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'flex-end' }}>
      <Text size="xs" c="dimmed" style={{ fontFamily: 'var(--font-body)', lineHeight: 1, height: '16px' }}>
        From
      </Text>
      <TextInput
        type="date"
        value={filters.dateRangeStart}
        onChange={(e) => setFilters({ ...filters, dateRangeStart: e.target.value })}
        style={{ minWidth: 160 }}
        styles={{
          input: {
            borderRadius: 8,
            border: '1px solid var(--color-gray-300)',
            fontFamily: 'var(--font-body)'
          }
        }}
      />
    </Box>
  </Box>
</Group>
```

### Key Principles

1. **No wrapper background/border**: Filter rows have no card wrapper - they sit directly on the page background
2. **Consistent input styling**: All inputs use the same border radius (8px), border color (gray-300), and font
3. **Visual distinction**: Select dropdowns use gray-50 background; text/date inputs use white background
4. **Vertical alignment**: "Filters:" label centers with dropdown inputs; date inputs align their input fields with dropdowns
5. **Responsive wrapping**: Filter container uses `flexWrap: 'wrap'` so filters wrap on smaller screens
6. **Consistent spacing**: 16px gap between all filter inputs

## Color Usage

### Text Colors

- **Primary text**: `var(--color-gray-900)` (#111827) - main headings
- **Secondary text**: `var(--color-gray-700)` (#374151) - body text
- **Muted text**: `var(--color-gray-500)` (#6B7280) - descriptions, captions
- **Dimmed text**: Mantine `c="dimmed"` - helper text

### Background Colors

- **Page background**: `var(--color-platinum)` (#FAF8F5)
- **Card background**: `var(--color-white)` (#FFFFFF)
- **Tab panel background**: `var(--color-tab-panel-bg)` (#E8E6E1)

## Font Families

- **Headings**: `var(--font-heading)` (Atkinson Hyperlegible) - for accessibility
- **Page titles**: `var(--font-marcellus), serif` (Marcellus) - decorative
- **Body text**: `var(--font-body)` (Public Sans) - readable sans-serif

## Font Sizes

All sizes are defined in CSS variables (`src/app/globals.css`):

- `--font-size-page-title`: 32px (H1)
- `--font-size-section-title`: 28px (H2)
- `--font-size-card-title`: 24px (H3)
- `--font-size-subsection`: 20px (H4)
- `--font-size-body-large`: 18px (large body)
- `--font-size-body`: 14px (standard body)
- `--font-size-body-small`: 13px (small body)
- `--font-size-caption`: 12px (captions)

## Examples

### Complete Page Structure

```tsx
export default function ExamplePage() {
  return (
    <div
      className="min-h-screen pb-8"
      style={{
        fontFamily: 'var(--font-body)',
        backgroundColor: 'var(--color-platinum)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--page-container-max-width)',
          margin: '0 auto',
          paddingLeft: 'var(--page-container-padding-x)',
          paddingRight: 'var(--page-container-padding-x)',
          paddingTop: 'var(--page-container-padding-top)',
        }}
        className="sm:px-6 lg:px-8"
      >
        {/* Title Section */}
        <div className="mb-8">
          <Title
            order={1}
            className="text-4xl font-bold mb-2"
            style={{
              fontFamily: 'var(--font-marcellus), serif',
              color: 'var(--color-gray-900)',
              fontSize: 'var(--font-size-4xl)',
              fontWeight: 'var(--font-weight-bold)',
            }}
          >
            Page Title
          </Title>
          <Text
            size="lg"
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--color-gray-500)',
              fontSize: 'var(--font-size-lg)',
            }}
          >
            Page description
          </Text>
        </div>

        {/* Content */}
        <Stack gap="md">
          <Card withBorder>
            <Title order={3} size="h4">
              Card Title
            </Title>
            {/* Card content */}
          </Card>
        </Stack>
      </div>
    </div>
  );
}
```

## Mantine Component Patterns

### Stack
- Use `gap="md"` (16px) for standard spacing
- Use `gap="lg"` (24px) for larger spacing between major sections

### Group
- Use `gap="md"` (16px) for horizontal spacing
- Use `justify="space-between"` for header groups with title and action button

### Card
- Use `withBorder` for standard cards
- Default padding is `p="md"` (16px)
- Use `p-6` (24px) for cards with more content

### Title
- Use `order={1}` for page titles
- Use `order={3} size="h4"` for card titles
- Use `order={4} size="h5"` for subsections

## Responsive Design

- Mobile: Base padding (16px)
- Small screens (`sm:`): 24px padding
- Large screens (`lg:`): 32px padding
- Max width: 1280px (centered)

## Notes

- All spacing should use CSS variables or Mantine spacing tokens when possible
- Font families are defined in `globals.css` and should be referenced via CSS variables
- Colors follow the brand palette defined in `globals.css`
- Mantine components inherit theme defaults but can be overridden with inline styles when needed for brand consistency
