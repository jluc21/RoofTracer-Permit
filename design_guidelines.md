# RoofTracer Design Guidelines

## Design Approach

**Selected Approach:** Design System - Material Design 3 with GIS Platform Patterns

**Justification:** RoofTracer is a data-intensive mapping and analytics tool requiring clarity, efficiency, and professional credibility. Material Design provides robust patterns for data tables, filtering, and elevation while maintaining visual hierarchy. We'll enhance this with proven patterns from mapping platforms (Mapbox Studio, ArcGIS Online) for spatial data visualization.

**Core Principles:**
- Data clarity over decoration
- Spatial hierarchy with layered surfaces
- Efficient information density
- Professional, trustworthy aesthetic

---

## Layout System

### Map-Centric Architecture
**Primary viewport:** Fullscreen map canvas (100% viewport)

**Overlay Structure (z-index layers):**
1. Base map layer (z-0)
2. Permit markers/clusters (z-10)
3. Filter bar - top overlay (z-20)
4. Side drawer - right overlay (z-30)
5. Map popups - floating (z-40)
6. Modals/dialogs (z-50)

### Spacing Primitives
**Tailwind units:** Consistently use 2, 4, 6, 8, 12, and 16
- Micro spacing: p-2, gap-2 (buttons, chips)
- Standard spacing: p-4, gap-4 (cards, form fields)
- Section spacing: p-6, p-8 (panels, drawers)
- Large spacing: p-12, p-16 (drawer headers, modal padding)

**Container constraints:**
- Filter bar: max-w-full with px-4
- Side drawer: fixed w-96 (384px)
- Map popups: max-w-sm (384px)
- Admin panels: max-w-6xl centered

---

## Typography

**Font Stack:** Inter (via Google Fonts CDN) - excellent for data-heavy interfaces with strong numerals

**Hierarchy:**
- Page titles: text-2xl font-semibold tracking-tight
- Section headers: text-lg font-semibold
- Panel/drawer titles: text-base font-semibold
- Body text: text-sm font-normal
- Captions/metadata: text-xs font-medium
- Data values: text-sm font-mono (for permit IDs, dates, coordinates)

**Line heights:**
- Headings: leading-tight
- Body: leading-relaxed
- Dense data: leading-snug

---

## Component Library

### 1. Top Filter Bar
**Structure:** Full-width horizontal bar, fixed position, elevated surface
- Height: h-16
- Padding: px-4 py-3
- Layout: Flex row with gap-3 between controls
- Elements (left to right):
  - App logo/title (text-base font-bold)
  - City dropdown (w-40)
  - State dropdown (w-32)
  - Date range picker (w-64, two inputs side-by-side)
  - "Roofing Only" toggle switch
  - Reset filters button (ml-auto)
  - Status indicator showing data freshness (text-xs)

**Filter Controls:**
- Dropdowns: h-9, rounded-md, px-3, text-sm
- Date inputs: h-9, rounded-md, px-3
- Toggle: Standard Material switch component
- Reset button: h-9, rounded-md, px-4, text-sm font-medium

### 2. Map Canvas
**Full viewport background** with no padding
- Uses MapLibre GL JS
- OSM tile layer as base
- Pan/zoom controls: positioned bottom-right with m-4
- Attribution: bottom-left corner, text-xs, semi-transparent

**Clustering Markers:**
- Small clusters (2-10): w-10 h-10, rounded-full, text-sm font-bold
- Medium clusters (11-50): w-12 h-12, rounded-full, text-base font-bold
- Large clusters (51+): w-16 h-16, rounded-full, text-lg font-bold
- Single points: w-6 h-6, rounded-full, ring-2 ring-white

### 3. Side Drawer
**Fixed right panel:** w-96, h-screen, elevated surface
- Header section: h-14, px-6, py-3
  - Title: "Permits in View" (text-lg font-semibold)
  - Count badge: (text-xs font-medium, px-2 py-1, rounded-full)
  - Close button: top-right, w-8 h-8
  
- **Data Table:** Virtualized scrolling list
  - Row height: h-20
  - Row padding: px-6 py-3
  - Row structure (vertical stack with gap-1):
    - Address: text-sm font-medium, truncate
    - Permit type + status: text-xs, flex row with gap-2
    - Date + value: text-xs, flex row justify-between
  - Hover state: entire row interactive
  - Active state: selected row has subtle background
  - Dividers: border-b between rows

- Footer: h-12, px-6, flex items-center justify-between
  - Pagination: "1-25 of 347", text-xs
  - Page controls: icon buttons, w-8 h-8

### 4. Map Popups
**Floating card:** max-w-sm, rounded-lg, elevated
- Padding: p-4
- Close button: absolute top-2 right-2, w-6 h-6

**Content structure (vertical stack, gap-3):**
- Header section:
  - Permit type badge: text-xs font-semibold, px-2 py-1, rounded
  - Status badge: text-xs, px-2 py-1, rounded
  
- Details grid (2-column where appropriate):
  - Address: text-sm font-medium, col-span-2
  - Issue date: text-xs, label + value pairs
  - Parcel ID: text-xs font-mono
  - Owner: text-xs, truncate
  - Contractor: text-xs, truncate
  - Value: text-sm font-semibold (if present)
  
- Footer actions: pt-3, border-t
  - "View in source" link: text-xs font-medium, external link icon
  - Source attribution: text-xs, opacity-75

### 5. Admin/Source Management Panels
**Centered container:** max-w-6xl, px-4, py-8

**Source cards grid:** grid-cols-1 md:grid-cols-2 lg:grid-cols-3, gap-4
- Card: rounded-lg, p-6, elevated surface
- Card header: flex justify-between items-start, mb-4
  - Source name: text-base font-semibold
  - Platform badge: text-xs, px-2 py-1, rounded
- Metrics: grid grid-cols-2 gap-4, mb-4
  - Each metric: label (text-xs) + value (text-lg font-semibold)
- Actions: flex gap-2
  - Buttons: h-9, px-4, rounded-md, text-sm

**Add Source Form:**
- Form container: max-w-2xl, p-6, rounded-lg
- Form fields: space-y-4
- Labels: text-sm font-medium, mb-1
- Inputs: h-10, w-full, rounded-md, px-3, text-sm
- Select dropdowns: h-10
- Textarea: min-h-24, p-3
- Submit button: h-10, px-6, rounded-md, text-sm font-medium

### 6. Status/Health Dashboard
**Grid layout:** grid-cols-1 md:grid-cols-3 gap-6
- Stat cards: p-6, rounded-lg, elevated
  - Label: text-xs font-medium uppercase tracking-wide, mb-2
  - Value: text-3xl font-bold, mb-1
  - Change indicator: text-sm, flex items-center gap-1

**Activity timeline:** max-w-3xl
- Timeline items: flex gap-4, pb-6, border-l pl-4
  - Timestamp: text-xs font-medium, w-20
  - Event icon: w-8 h-8, rounded-full, flex items-center justify-center
  - Description: text-sm

---

## Navigation & Interaction Patterns

**Primary Navigation:**
- Top-left: App logo/title always visible
- Tab bar (if multi-page): h-12, border-b, text-sm font-medium
  - Tabs: px-4, h-full, inline-flex items-center

**Secondary Actions:**
- Floating action button (add source): fixed bottom-6 right-6, w-14 h-14, rounded-full, elevated
- Icon size in buttons: w-5 h-5

**Form Validation:**
- Error states: text-xs, mt-1, below input
- Required indicators: text-red-500 inline with label

---

## Images

**No hero images required** - This is a utility application where the map is the hero element. The fullscreen map provides all necessary visual impact.

**Icons:**
- Use Heroicons (outline for navigation, solid for filled states)
- Icon sizes: w-4 h-4 (small), w-5 h-5 (standard), w-6 h-6 (large)
- Via CDN: https://cdn.jsdelivr.net/npm/heroicons

---

## Elevation & Surfaces

Material Design elevation system:
- Base map: elevation-0
- Filter bar: elevation-2 (subtle shadow)
- Side drawer: elevation-3 (medium shadow)
- Popups: elevation-4 (pronounced shadow)
- Modals: elevation-5 (strong shadow)

---

## Responsive Behavior

**Mobile (<768px):**
- Filter bar: vertical stack, full-width dropdowns
- Drawer: full-screen overlay (w-full h-full)
- Map popups: bottom sheet style (rounded-t-lg, max-h-[70vh])

**Tablet (768px-1024px):**
- Drawer: w-80 instead of w-96
- Filter bar: wrap controls into two rows if needed

**Desktop (>1024px):**
- Full layout as specified above
- Drawer can be resizable (advanced feature)