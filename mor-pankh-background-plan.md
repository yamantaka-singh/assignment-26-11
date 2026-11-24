# Implementation Plan: Mor Pankh (Radha Krishna) Background

**Goal:** Elevate the Sharad Utsav 2026 booking application with an elegant, culturally authentic Mor Pankh (peacock feather) and Radha Krishna motif as an atmospheric background, preserving maximum legibility, zero layout shifts, and WCAG AA/AAA accessibility.

**Tech Stack:** Void (Vite + Hono on Cloudflare Workers), React 19, Vanilla CSS Custom Properties (`theme.css`), Scalable Vector Graphics (SVG).

---

## 1. Skill Scout Evaluation & Skill Selection

Following the `skill-scout` methodology, we analyzed candidate skills across local and marketplace sources to select the optimal combination for each task:

| Subagent Task | Evaluated Skills | Source | Strengths & Gaps | Selected Special Skill | Base Skill |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Task 1: Asset Design** (Mor Pankh & Radha Krishna Motif) | 1. `frontend-design`<br>2. `canvas-design`<br>3. `algorithmic-art`<br>4. `imagegen` | Local / ECC | `frontend-design` creates distinctive, production-grade visual assets and avoids generic aesthetics. `canvas-design` is limited to static PNG/PDFs; `algorithmic-art` requires heavy p5.js runtime; `imagegen` generates heavy raster bitmaps. | **`frontend-design`** | **`ponytail`** |
| **Task 2: UI & CSS Integration** (Theming, Responsive Backdrop) | 1. `ui-ux-pro-max`<br>2. `ui-styling`<br>3. `modern-web-guidance` | Local / ECC | `ui-ux-pro-max` offers deep design intelligence with Priority 1 WCAG contrast compliance, touch target protection, and responsive viewport rules. `ui-styling` focuses heavily on Tailwind/shadcn not native CSS. | **`ui-ux-pro-max`** | **`ponytail`** |
| **Task 3: Verification & QA** (Visual, Responsiveness, Tests) | 1. `browser-qa`<br>2. `verification-loop`<br>3. `webapp-testing` | Local / ECC | `browser-qa` specializes in automated visual checks, viewport smoke tests (mobile 375px to desktop 1280px), console error checks, and interactive validation without bloat. | **`browser-qa`** | **`ponytail`** |

### Ponytail Enforcement Across All Subagents
All subagents will run under **`ponytail` (full mode)**:
- **Ladder Rung 4 (Native platform feature covers it):** Pure CSS background / SVG watermark over canvas or JavaScript-driven animation.
- **Ladder Rung 6 (Shortest code that works):** Zero extra npm dependencies, zero bundle weight explosion.
- **Pattern:** Code first; minimal diff; no unrequested abstractions.

---

## 2. Visual Architecture & Design Specifications

1. **Motif Elements:**
   - **Mor Pankh (Peacock Feather):** Sacred symbol worn by Lord Krishna in His crown, representing beauty, purity, and protection. Features the central deep iridescent *eye* (Krishna navy `#1a2040`, royal blue `#005b8e`, peacock turquoise `#00a896`, emerald ring `#1b7a43`, and radiant golden/saffron aura `#e59b2b`).
   - **Radha Krishna Resonance:** Delicate silhouette curves of Krishna's Bansuri (flute) and gentle celestial radiance, complementing the temple context (*Radha Krishna Temple, Allen, Texas*).
2. **Backdrop Integration:**
   - Fixed, non-scrollable overlay container with `pointer-events: none` and `z-index: -1`.
   - Tuned low opacity (`0.06` to `0.09`) on the main body backdrop, plus a soft ambient radial blend with `--utsav-bg` (`#f9f8f5`) so form inputs and cards maintain complete contrast and clarity.
   - Non-obstructive positioning: anchors gracefully from the upper-right corner flowing down diagonally behind the main card stack.

---

## 3. Subagent Task Breakdown & Execution Plan

### Subagent 1: Asset Design Specialist
- **Name:** `subagent-asset-design`
- **Skills:** `ponytail` + `frontend-design`
- **Files:**
  - Create: `public/mor-pankh.svg` (or `src/ui/assets/mor-pankh.svg`)
- **Action Items:**
  1. Craft a clean, scalable SVG vector graphic of the Mor Pankh (peacock feather) with Radha Krishna flute curves and subtle aura rays.
  2. Use clean vector paths with optimized precision (`viewBox="0 0 600 600"`), layered gradients (`<linearGradient>`, `<radialGradient>`), and soft feathered curves.
  3. Keep the file compact (< 6 KB), standalone, and zero runtime dependencies.
- **Verification:** SVG renders cleanly in browser, scales smoothly from 200px to 1400px without clipping or pixelation.

---

### Subagent 2: UI Theming & CSS Integration Specialist
- **Name:** `subagent-ui-theming`
- **Skills:** `ponytail` + `ui-ux-pro-max`
- **Files:**
  - Modify: `src/ui/theme.css`
  - Modify: `src/App.tsx` (add ambient background container if needed, or via `body::before` pseudo-element)
- **Action Items:**
  1. Add CSS variables for the backdrop: `--mor-pankh-opacity`, `--mor-pankh-position`.
  2. Implement the backdrop using pure CSS (e.g. `body::before` or `.app-backdrop` with `position: fixed; inset: 0; pointer-events: none; z-index: -1;`).
  3. Ensure responsive positioning:
     - Desktop (> 768px): Floats top-right into center with subtle diagonal angle.
     - Mobile (<= 768px): Scaled appropriately so it doesn't clutter small touchscreens.
  4. Preserve full WCAG 2.2 AA / AAA contrast for text, form fields, stepper, and buttons.
- **Verification:** Form controls, cards, and text retain clear contrast ratios; no interaction interference (`pointer-events: none` confirmed).

---

### Subagent 3: QA & Verification Specialist
- **Name:** `subagent-qa-verifier`
- **Skills:** `ponytail` + `browser-qa`
- **Files:**
  - Test / Audit: `src/ui/theme.css`, `tests/`
- **Action Items:**
  1. Run `npm run typecheck` to confirm zero TypeScript compilation errors.
  2. Run `npm test` (`vp test run`) to confirm all 308 existing unit and regression tests pass without breakage.
  3. Verify responsive layout across 375px (mobile), 768px (tablet), and 1280px (desktop) viewports.
  4. Perform contrast verification against WCAG standards on all 5 booking steps (`Group`, `Tickets`, `Extras`, `Pay`, `Done`).
- **Verification:** 100% test pass rate, 0 typecheck errors, clean responsive rendering with no horizontal scrolling or clipped content.

---

## 4. Execution Readiness

Each subagent prompt is pre-configured with:
- The full instructions of `ponytail` (enforcing minimal diff, native CSS/platform first, YAGNI).
- The full specialized instructions of its assigned skill (`frontend-design`, `ui-ux-pro-max`, `browser-qa`).
- Explicit acceptance criteria and bounded file paths.
