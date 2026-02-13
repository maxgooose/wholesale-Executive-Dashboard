<!-- 9a9d8143-af0c-49bf-a77c-458b762ade16 e71ee0e1-7467-4afe-8cc3-9513453859e9 -->
# Enhanced Inventory Management System

## Design Philosophy

**Maintain and extend the existing clean design** using the current gradient-bg, stat-card, and card patterns with the established blue color scheme (#2563eb to #1e40af).

## Architecture Overview

Build upon the existing dashboard to create a cohesive multi-page system with consistent styling, room-based inventory workflow, and Excel integration.

## Key Components

### 1. Enhanced Navigation in Dashboard (`dashboard_standalone.html`)

Extend the existing dashboard header with navigation tabs:

- Keep current gradient-bg header style
- Add navigation tabs using existing button styles
- Include room status badges (Ready/Pro Details counts)
- Maintain the current clean card-based layout

### 2. Data Management Tab (`data-manager-tab.html`)

New page matching current design:

- Use existing stat-card component for room statistics
- Apply current card styling for data forms
- Reuse filter-chip styles for room filtering
- Keep the same table styling from dashboard
- Add floating action buttons using gradient-bg style

### 3. Room Workflow Interface

Extend within the dashboard using existing patterns:

- **Ready Room View**: Green accented stat-cards
- **Pro Details Room View**: Amber accented stat-cards  
- Drag-drop cards matching current card styling
- Status badges using existing pill styles

### 4. Update History Panel

Side panel matching ai-chat.html design:

- Use similar message bubble styling for updates
- Timeline view with existing card components
- Notification badges using current alert styles

### 5. Excel Export Module

Modal overlay using current design system:

- Modal with card styling
- Filter interface using filter-chip components
- Export buttons matching existing button patterns
- Progress indicators using gradient colors

## UI Components (Using Existing Styles)

### Reused Components:

```css
.gradient-bg { background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); }
.stat-card { /* existing stat-card styling */ }
.card { /* existing card styling */ }
.filter-chip { /* existing filter styling */ }
```

### New Components (Matching Style):

```css
.room-badge-ready { background: #10b981; /* green */ }
.room-badge-pro { background: #f59e0b; /* amber */ }
.update-item { /* similar to ai-message styling */ }
```

## Navigation Flow

1. **Dashboard** (existing) → Add navigation tabs in header
2. **Data Manager** → New tab with same header/container structure
3. **Excel Export** → Modal overlay on any page
4. **Update History** → Slide-out panel (like AI chat)

## Data Structure Enhancements

Minimal changes to maintain compatibility:

```json
{
  "source": "READY|PRO_DETAILS",  // Room designation
  "lastUpdated": "timestamp",
  "updateHistory": [],
  "qcNotes": "string"
}
```

## Key Files Structure

### Modified Files:

1. `dashboard_standalone.html` - Add navigation tabs to header
2. `combined_details.json` - Add room source field

### New Files (Following Existing Patterns):

1. `data-manager.html` - Matches dashboard design
2. `excel-export-modal.js` - Reusable modal component
3. `room-workflow.js` - Room management logic
4. `update-history-panel.js` - Update tracking panel

## Excel Features (Integrated Design)

- Filter selection using existing filter-chip style
- Column picker with checkbox styling from send_to_blueberry.html
- Export button using btn-primary gradient style
- Loading spinner matching existing animation

## Implementation Approach

1. **Extend, don't replace** - Build on existing dashboard
2. **Reuse all current styles** - gradient-bg, stat-card, card, filter-chip
3. **Consistent spacing** - container mx-auto px-6 throughout
4. **Matching interactions** - hover effects, transitions
5. **Same color palette** - Blues (#2563eb, #1e40af), grays, status colors

## Demo Features

- Show seamless navigation between enhanced dashboard tabs
- Demonstrate room transfers with visual feedback
- Display update notifications in familiar message style
- Export filtered Excel with current table formatting
- All using the clean, established design language

### To-dos

- [x] Add navigation tabs to existing dashboard header while maintaining gradient-bg style
- [x] Build data-manager.html using existing card and stat-card components
- [x] Create room workflow views with Ready (green) and Pro Details (amber) styling
- [x] Build update history panel using ai-message bubble styling
- [x] Design Excel export modal using current card styling and filter-chips
- [x] Add JavaScript for room transfers and data updates
- [x] Build Excel generation with multi-filter selection