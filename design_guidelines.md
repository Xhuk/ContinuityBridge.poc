# ContinuityBridge Design Guidelines

## Design Approach

**Selected System**: Modern Enterprise Dashboard Pattern
Drawing inspiration from Linear, Vercel, and modern B2B SaaS tools - prioritizing data clarity, efficient workflows, and professional presentation for technical users.

**Core Principle**: Information density with breathing room. Every element serves a functional purpose while maintaining visual hierarchy and scannability.

---

## Typography

**Font System**:
- Primary: Inter (Google Fonts) - body text, UI elements, data
- Monospace: JetBrains Mono - code snippets, XML input, trace IDs, JSON output

**Hierarchy**:
- Page Titles: text-3xl font-bold
- Section Headers: text-xl font-semibold
- Card Titles: text-lg font-medium
- Body/Labels: text-sm font-normal
- Data/Metrics: text-base font-medium (slightly larger for readability)
- Small Details: text-xs (timestamps, metadata)

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, 8, 12, 16** for consistent rhythm
- Component padding: p-4 to p-6
- Section gaps: gap-6 to gap-8
- Page margins: px-6 py-8 (mobile), px-12 py-12 (desktop)
- Card spacing: p-6 internally, gap-4 between elements

**Grid Structure**:
- Main layout: Sidebar navigation (w-64 fixed) + Main content area (flex-1)
- Dashboard metrics: 2x2 grid on desktop (grid-cols-2), stack on mobile
- Events table: Full-width responsive table with horizontal scroll on mobile
- Queue controls: Horizontal layout on desktop, vertical stack on mobile

**Container Widths**:
- Content max-width: max-w-7xl mx-auto
- Form max-width: max-w-2xl
- Cards: Full width within grid cells

---

## Component Library

### Navigation
**Sidebar** (fixed left, full height):
- Logo/title at top (h-16, px-6)
- Navigation items as vertical list (gap-1, px-4)
- Active state: distinct background treatment
- Icons from Heroicons (outline style, size-5)
- Footer section: backend indicator badge (fixed bottom)

### Dashboard Page
**Metrics Grid** (4 KPI cards in 2x2 grid):
- Card structure: border, rounded-lg, p-6
- Layout per card: Label (text-sm) + Large number (text-4xl font-bold) + Delta indicator
- Trend visualization: Small sparkline or indicator below number
- Grid: grid-cols-1 md:grid-cols-2 gap-6

**Charts Section**:
- Recharts line/area charts for time-series metrics
- Chart container: h-80, border, rounded-lg, p-6
- Legend below chart, grid-cols-2 for multiple metrics
- Responsive: Full width with maintained aspect ratio

**Backend Indicator**:
- Pill badge showing active queue backend (InMemory/RabbitMQ/Kafka)
- Position: Top-right of dashboard or in sidebar footer
- Style: Rounded-full, px-3 py-1, text-xs font-medium

### Events Page
**Events Table**:
- Full-width responsive table with sticky header
- Columns: Trace ID (monospace), SKU, Warehouse, Reason, Timestamp, Actions
- Row height: py-3
- Alternating row treatment for scannability
- Action buttons: icon-only (replay, view details) using Heroicons
- Pagination: Bottom, showing "X-Y of Z events"
- Empty state: Centered message with icon when no events

**Replay Controls**:
- Top-right action button (primary style)
- Modal/drawer for bulk replay options

### Queue/Worker Page
**Control Panel** (horizontal cards layout):
- Toggle card: Switch component + current state label
- Concurrency card: Number input with +/- buttons, current value display
- Queue depth card: Real-time counters (inDepth/outDepth) with progress bars

**Worker Status**:
- Status indicator (running/stopped) with pulse animation when active
- Metrics: Messages processed, current throughput (TPS)

### Ingest Page
**XML Input Form**:
- Large textarea: min-h-96, font-mono, text-sm
- Textarea styling: border-2, rounded-lg, p-4, resize-y
- Submit button: Full-width on mobile, auto on desktop, right-aligned
- Response display: Below form, collapsible JSON viewer with syntax highlighting
- Validation errors: Inline below textarea, text-red with error icon

**Sample XML Loader**:
- Dropdown or button to load example XML from examples/item.sample.xml
- Position: Above textarea, text-sm link style

### Common Components

**Cards**:
- Base: border rounded-lg p-6
- Header pattern: flex justify-between items-center mb-4
- Body: Natural content flow with consistent gap-4

**Buttons**:
- Primary: px-6 py-2.5 rounded-lg font-medium
- Secondary: Similar sizing with different treatment
- Icon buttons: p-2 rounded-md (for table actions)
- Disabled state: Reduced opacity, cursor-not-allowed

**Badges/Pills**:
- Rounded-full px-3 py-1 text-xs font-medium
- Status variants: success, warning, error, neutral

**Forms**:
- Label: text-sm font-medium mb-2 block
- Input: px-4 py-2.5 border rounded-lg
- Focus state: Distinct border treatment
- Error state: Border treatment + error message below

**Tables**:
- Header: font-semibold text-xs uppercase tracking-wide py-3 px-4
- Cell: py-3 px-4 text-sm
- Sticky header on scroll (position-sticky top-0)

---

## Page-Specific Layouts

**Dashboard**: 
- Top section: Page title + time range selector (if applicable)
- Metrics grid: 2x2 cards
- Charts section: 1-2 full-width charts below metrics
- Recent activity: Compact events list at bottom

**Events**:
- Header: Title + filters + replay button
- Table: Full-width with pagination
- Sidebar filter panel (optional, toggleable on mobile)

**Queue/Worker**:
- Two-column layout on desktop: Controls (left) + Metrics visualization (right)
- Stack vertically on mobile
- Real-time updates with subtle transitions

**Ingest**:
- Single-column centered layout (max-w-4xl)
- Textarea dominant (60% of viewport height)
- Response section collapsible/expandable

---

## Data Visualization

**KPI Numbers**: 
- Large, bold typography (text-4xl to text-5xl)
- Delta indicators: Small arrow icon + percentage (text-sm)
- Contextual hints: Light text below showing "Last 5m" or "vs. previous"

**Charts** (Recharts):
- Line charts for time-series metrics (latency, TPS)
- Area charts for cumulative data
- Bar charts for categorical comparisons (warehouse performance)
- Consistent axis labeling, grid lines subtle
- Tooltips on hover with precise values

**Queue Depth Visualization**:
- Horizontal progress bars showing capacity utilization
- Numerical values alongside bars
- Warning thresholds visually indicated

---

## Responsive Strategy

**Breakpoints**:
- Mobile: < 768px (md)
- Tablet: 768px - 1024px
- Desktop: > 1024px

**Mobile Adaptations**:
- Sidebar collapses to hamburger menu
- Metrics grid: Single column stack
- Tables: Horizontal scroll or card-based layout
- Forms: Full-width inputs
- Charts: Maintain aspect ratio, adjust height

---

## Accessibility

- Semantic HTML throughout (nav, main, section, article)
- ARIA labels for icon-only buttons
- Keyboard navigation support (focus visible states)
- Form labels properly associated with inputs
- Sufficient contrast ratios for all text
- Loading states with ARIA live regions for real-time updates

---

## Animations

**Minimal, Purposeful Motion**:
- Page transitions: None (instant navigation)
- Data updates: Smooth number transitions (150ms) for metrics
- Worker status: Subtle pulse animation when active
- Loading states: Simple spinner, no elaborate animations
- Chart updates: Smooth data point transitions (300ms)
- No hover effects on data displays - keep focus on information

---

## Images

No hero images or decorative imagery needed. This is a data-focused application where all visual weight should be on metrics, charts, and functional elements.

**Icon Usage**: Heroicons throughout for navigation, actions, and status indicators (outline style, size-5 for nav, size-4 for inline icons).