# Skeleton Loading Guidelines

This document outlines best practices for implementing skeleton loading states in ClearGO, based on lessons learned from fixing skeleton loading issues across the application.

## Table of Contents
1. [Core Principles](#core-principles)
2. [Common Mistakes](#common-mistakes)
3. [Best Practices](#best-practices)
4. [Implementation Checklist](#implementation-checklist)
5. [Examples from ClearGO](#examples-from-cleargo)

## Core Principles

### 1. Match Actual Content Structure
Skeleton views must **exactly match** the structure, layout, and proportions of the actual content that will be displayed. This includes:
- Column widths in tables
- Font sizes and styles
- Spacing and padding
- Component hierarchy
- Responsive behavior (mobile/desktop)
- **Top navigation bar**: The header/navigation bar must always be included in skeleton states. When pages are loading, the header should display in skeleton form rather than being hidden or showing the actual header.

### 2. Show Skeletons Only When Loading
Skeletons should only appear when data is actively being fetched. Never show skeletons when:
- Data has already loaded
- An error has occurred
- The user has explicitly filtered out all results

### 3. Prevent Premature "Empty State" Messages
Never show "no results found" or "empty state" messages while data is still loading. Always check loading state before showing empty states.

### 4. Smooth Transitions
Avoid jarring transitions where skeletons flash, disappear, and reappear. Ensure consistent loading states throughout the data fetching process.

## Common Mistakes

### Mistake 1: Missing Column Width Definitions
**Problem**: Skeleton tables without `colgroup` or proper width classes result in disproportionate column widths.

**Example (WRONG)**:
```tsx
<table className="min-w-full table-fixed">
  <thead>
    <tr>
      <th>Name</th>
      <th>Risk</th>
    </tr>
  </thead>
  <tbody>
    {/* Skeleton rows without colgroup */}
  </tbody>
</table>
```

**Solution**: Always include `colgroup` matching the actual table structure:
```tsx
<table className="min-w-full table-fixed">
  <colgroup>
    <col className="w-100" />  {/* Name - flexible width */}
    <col className="w-24" />   {/* Risk - fixed width */}
  </colgroup>
  {/* ... */}
</table>
```

### Mistake 2: Incorrect Font Styles in Skeletons
**Problem**: Skeleton elements using wrong font families or sizes, causing visual inconsistency.

**Example (WRONG)**:
```tsx
<div className="h-8 bg-gray-200 rounded animate-pulse" />
```

**Solution**: Match actual component styling:
```tsx
<div 
  className="bg-gray-200 rounded animate-pulse" 
  style={{ 
    height: 'var(--font-size-4xl)',
    fontFamily: 'var(--font-marcellus), serif'
  }} 
/>
```

### Mistake 3: Showing "No Results" During Loading
**Problem**: Empty state messages appear before data finishes loading.

**Example (WRONG)**:
```tsx
{filteredItems.length === 0 ? (
  <div>No items found</div>
) : (
  <ItemsList items={filteredItems} />
)}
```

**Solution**: Check loading state first:
```tsx
{filteredItems.length === 0 ? (
  stillLoading ? (
    <SkeletonTable />
  ) : (
    <div>No items found</div>
  )
) : (
  <ItemsList items={filteredItems} />
)}
```

### Mistake 4: Inconsistent Loading State Checks
**Problem**: Only checking one loading flag when multiple data sources are loading.

**Example (WRONG)**:
```tsx
{loading ? <Skeleton /> : <Content />}
```

**Solution**: Check all relevant loading states:
```tsx
const stillLoadingData = loading || 
  isDeterminingOrder || 
  (initialData.length === 0 && data.length === 0) ||
  (data.length > 0 && supportingData.length === 0);

{stillLoadingData ? <Skeleton /> : <Content />}
```

### Mistake 5: Missing Components in Skeleton View
**Problem**: Skeleton view doesn't include all components that appear in the actual view.

**Example (WRONG)**:
```tsx
{loading ? (
  <SkeletonTable />
) : (
  <>
    <ReleaseCards />
    <Table />
  </>
)}
```

**Solution**: Include all components in skeleton:
```tsx
{loading ? (
  <>
    <SkeletonReleaseCards />
    <SkeletonTable />
  </>
) : (
  <>
    <ReleaseCards />
    <Table />
  </>
)}
```

**Important**: The top navigation bar (header) must also be part of the skeleton state. When pages are loading, the header should show a skeleton version rather than being hidden or showing the actual header.

### Mistake 6: Wrong Component Order in Skeleton View
**Problem**: Components in skeleton view appear in different order than actual view, causing visual inconsistency and confusion.

**Example (WRONG)**:
```tsx
// Actual view order: Release Cards → Filters → Table
// But skeleton shows: Filters → Release Cards → Table
{loading ? (
  <>
    <Filters />  {/* WRONG: Filters before cards */}
    <SkeletonReleaseCards />
    <SkeletonTable />
  </>
) : (
  <>
    <ReleaseCards />
    <Filters />
    <Table />
  </>
)}
```

**Solution**: Match exact component order from actual view:
```tsx
// Skeleton matches actual order: Release Cards → Filters → Table
{loading ? (
  <>
    <SkeletonReleaseCards />  {/* Correct: Cards first */}
    <SkeletonTable />
  </>
) : (
  <>
    <ReleaseCards />
    <Filters />
    <Table />
  </>
)}
```

**Key Principle**: Always verify the skeleton component order matches the actual rendered order by checking the actual component structure in the code.

### Mistake 7: Filters Showing During Loading
**Problem**: Filter controls render while data is still loading, creating visual inconsistency and confusion. Filters should only appear when data is ready.

**Example (WRONG)**:
```tsx
// Filters show even when stillLoadingData is true
{!loading && (initialData.length > 0 || data.length > 0) && (
  <Filters />
)}
{stillLoadingData ? <Skeleton /> : <Content />}
```

**Solution**: Use the same loading check for filters as for skeleton:
```tsx
// Filters only show when NOT loading (using same check as skeleton)
{!stillLoadingData && (initialData.length > 0 || data.length > 0) && (
  <Filters />
)}
{stillLoadingData ? <Skeleton /> : <Content />}
```

**Key Point**: Always use the same loading state variable (`stillLoadingData`) for both hiding filters and showing skeletons to ensure consistency.

### Mistake 8: Wrong Initial Loading State
**Problem**: Loading state initialized incorrectly when initial data is provided.

**Example (WRONG)**:
```tsx
const [isDeterminingOrder, setIsDeterminingOrder] = useState(true);
```

**Solution**: Initialize based on whether we have initial data:
```tsx
const [isDeterminingOrder, setIsDeterminingOrder] = useState(initialData.length === 0);
```

### Mistake 9: Showing Spinner After Skeleton Loading
**Problem**: After skeleton loading completes and data appears, showing a full-page spinner while additional data loads creates a jarring UX. The skeleton already served its purpose - users shouldn't see a spinner after seeing the skeleton.

**Example (WRONG)**:
```tsx
// Show skeleton initially
if (loading && items.length === 0) {
  return <SkeletonTable />;
}

// Then show spinner while additional data loads
if (isLoadingReleaseNames && items.length > 0) {
  return (
    <div className="flex items-center justify-center p-8">
      <PurpleLoader />
    </div>
  );
}

// Finally show real data
return <Table items={items} />;
```

**Why this is bad**: Users see skeleton → spinner → data, which is confusing. The skeleton's purpose is to show structure while loading, so once data appears, it should stay visible even if some parts are still loading.

**Solution**: Show data immediately once it loads, even if additional data is still loading:
```tsx
// Show skeleton only when no data exists
if (loading && items.length === 0) {
  return <SkeletonTable />;
}

// Show data immediately, even if release names are still loading
// Release names will populate asynchronously and update the view
return <Table items={items} releaseNames={releaseNames} />;
```

**Key Principle**: Once skeleton disappears and data appears, never replace it with a spinner. Additional data should load in the background and update the view progressively.

**Acceptable Patterns**:
- ✅ Small inline spinners next to specific loading data (e.g., `<span>Loading... <PurpleLoader size="sm" /></span>`)
- ✅ Refresh indicators that don't replace content (e.g., banner saying "Refreshing..." at top)
- ✅ Spinners for initial permission/access checks before any content loads

**Unacceptable Patterns**:
- ❌ Full-page spinner after skeleton has shown
- ❌ Replacing content with spinner when data exists but additional data is loading
- ❌ Hiding data to show spinner for supplementary information

## Best Practices

### 1. Match Component Order Exactly
**CRITICAL**: Always verify that skeleton components appear in the exact same order as the actual components. Check the actual component structure in the code to ensure order matches.

**Checklist**:
- [ ] List all components in the actual view in order
- [ ] List all components in the skeleton view in order
- [ ] Verify they match exactly
- [ ] Test visually to ensure no layout shifts

**Example**: If actual view shows: Title → Release Cards → Filters → Table, skeleton must show: Title Skeleton → Release Cards Skeleton → Filters (or skeleton) → Table Skeleton

### 2. Use Consistent Skeleton Styling
- Use `bg-gray-200` or `bg-gray-300` for skeleton elements
- Use `animate-pulse` for animation
- Match actual element heights and widths
- Use proper border radius matching actual components

### 3. Create Reusable Skeleton Components
For frequently used skeleton patterns, create reusable components:

```tsx
function SkeletonTableRow({ columns }: { columns: number }) {
  return (
    <tr>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}>
          <div className="h-4 bg-gray-200 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}
```

### 4. Match Actual Component Structure
When creating skeletons, copy the exact structure of the actual component:
- Same number of columns
- Same responsive classes (`hidden md:table-cell`)
- Same padding and spacing
- Same container structure

### 4. Handle Multiple Loading States
When multiple data sources load independently, track all loading states:

```tsx
const stillLoadingData = 
  loading ||                    // Main data loading
  isDeterminingOrder ||         // Order/sorting being determined
  (initialData.length === 0 && data.length === 0) ||  // No data yet
  (data.length > 0 && supportingData.length === 0);   // Supporting data loading
```

### 6. Progressive Loading
Show partial content when possible:
- If main data loads but supporting data is still loading, show main content with skeleton for supporting parts
- Don't hide everything just because one piece is loading
- **Never show a spinner after skeleton has been displayed** - once data appears, keep it visible

### 7. No Spinner After Skeleton
**CRITICAL**: Once skeleton loading completes and data appears, never replace it with a spinner. The skeleton's purpose is to show structure while loading - once real data appears, it should remain visible even if additional data is still loading.

**Flow should be**:
1. Skeleton (when no data)
2. Real data (appears immediately when available)
3. Additional data loads in background and updates view progressively

**NOT**:
1. Skeleton
2. Spinner (replacing skeleton)
3. Real data

This ensures smooth, progressive loading without jarring transitions.

## Implementation Checklist

When implementing skeleton loading, ensure:

- [ ] **Component order matches actual view exactly** (check actual code structure)
- [ ] Skeleton matches actual content structure exactly
- [ ] Column widths defined with `colgroup` for tables
- [ ] Font styles match actual components
- [ ] All components included (cards, tables, filters, etc.)
- [ ] **Top navigation bar included in skeleton state** (header should show skeleton when loading)
- [ ] Loading state checks all relevant data sources
- [ ] Empty states only show when loading is complete
- [ ] Filters only show when data is ready
- [ ] Responsive behavior matches (mobile/desktop)
- [ ] Smooth transitions (no flashing)
- [ ] Proper initialization based on initial data
- [ ] **No spinner after skeleton** - once data appears, it stays visible even if additional data is loading

## Examples from ClearGO

### Example 1: Epics Page Skeleton
**Fixed Issues**:
1. Added `colgroup` to match actual table column widths
2. Increased Risk column skeleton width from 60px to 70px
3. Added skeleton release cards (4 cards) - **placed BEFORE filters to match actual component order**
4. Fixed loading state to check for release schedule loading
5. Prevented "no epics found" from showing during loading
6. **Fixed component order**: Release cards skeleton now appears before filters, matching actual view structure

**Key Code**:
```tsx
// Proper loading state check
const stillLoadingData = loading || isDeterminingOrder || 
  (initialEpics.length === 0 && epics.length === 0) ||
  (epics.length > 0 && displayedReleaseGroups.length === 0 && releaseScheduleWithIds.length === 0);

// Proper skeleton structure - IMPORTANT: Order matches actual view
// Actual order: Release Cards → Filters → Table
// Skeleton order: Release Cards Skeleton → Table Skeleton (filters hidden during loading)

{/* Release Cards Skeleton - shown when loading, BEFORE filters to match actual order */}
{stillLoadingData && (
  <div className="hidden md:block mb-6">
    {Array.from({ length: 4 }).map((_, index) => (
      <SkeletonCard key={index} />
    ))}
  </div>
)}

{filteredReleaseGroups.length === 0 ? (
  stillLoadingData ? (
    // Table Skeleton with colgroup
    <table>
      <colgroup>
        <col className="w-100" />
        <col className="w-24" />
        {/* ... */}
      </colgroup>
      {/* ... */}
    </table>
  ) : (
    // "No epics found" message
  )
) : (
  // Actual content with release cards, filters, and table
)}
```

### Example 2: Home Dashboard Skeleton
**Fixed Issues**:
1. Title skeleton now uses Marcellus font and correct size (`var(--font-size-4xl)`)
2. Subtitle skeleton uses correct height (`var(--font-size-lg)`)
3. Group header skeleton matches h2 styling (20px)
4. Added missing Pod column to skeleton table
5. Fixed table cell proportions
6. **Removed spinner after skeleton** - items now show immediately when loaded, even if release names are still loading

**Key Code**:
```tsx
// Title skeleton with proper font
<div 
  className="bg-gray-200 rounded animate-pulse" 
  style={{ 
    height: 'var(--font-size-4xl)',
    fontFamily: 'var(--font-marcellus), serif'
  }} 
/>

// Subtitle skeleton with proper height
<div 
  className="bg-gray-200 rounded animate-pulse" 
  style={{ 
    height: 'var(--font-size-lg)',
    marginTop: '8px'
  }} 
/>

// CORRECT: Show skeleton only when no data
if (loading && items.length === 0) {
  return <SkeletonTable />;
}

// CORRECT: Show data immediately, release names load in background
return <Table items={items} />;

// WRONG (removed): Don't show spinner after skeleton
// if (isLoadingReleaseNames && items.length > 0) {
//   return <PurpleLoader />;  // ❌ Bad UX
// }
```

## Lessons Learned

1. **Always match the actual structure**: Don't approximate - copy the exact structure
2. **Match component order exactly**: Verify skeleton components appear in the same order as actual components by checking the actual code structure
3. **Check all loading states**: Multiple data sources may load independently
4. **Initialize correctly**: Consider initial data when setting initial loading state
5. **Include everything**: If it appears in the real view, it should appear in skeleton
6. **Test loading scenarios**: Test with initial data, without initial data, slow networks
7. **Prevent premature empty states**: Always verify loading is complete before showing empty states
8. **Pay attention to visual hierarchy**: Components that appear above others in the actual view must appear above them in the skeleton view
9. **Never show spinner after skeleton**: Once skeleton disappears and data appears, keep the data visible. Additional data should load progressively in the background without replacing the view with a spinner

## Related Documentation

- [Page Styling Guidelines](./PAGE_STYLING_GUIDELINES.md) - For consistent styling patterns
- [PRD Retroactive](./PRD-Retroactive.md) - For feature documentation
