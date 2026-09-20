# Internship Transcript V2 — Verdana Health UI/UX Design System

> Version 2.0.0  
> Status: Owner-supplied visual direction, implemented 2026-08-26  
> Platform: Responsive web application  
> UI foundation: Nuxt 4, Vue 3, Nuxt UI, Tailwind CSS  
> Accessibility target: WCAG 2.2 Level AA

## 1. Purpose and source

This document is the canonical UI/UX contract for Internship Transcript System V2. It replaces the previous red-and-gold visual direction with the owner-supplied **Verdana Health Design System** from `verdana-health-design-system-DESIGN.md`.

Verdana Health contributes the visual language only: deep navy, soft sage, generous whitespace, calm typography, clear controls, and gentle elevation. Product terminology, authorization, academic workflow, and data rules remain governed by the project acceptance criteria, OpenAPI contract, permissions, and database specification.

Related implementation sources:

- [tokens.json](tokens.json): machine-readable Primitive, Semantic, and Component tokens;
- [tokens.css](tokens.css): documentation bridge to the runtime token package;
- [app.config.example.ts](app.config.example.ts): Nuxt UI runtime theme reference;
- [MASTER.md](../../design-system/internship-transcript-v2/MASTER.md): compact retrieval entry for AI agents;
- [desgin.md](../../desgin.md): routes and screen intent.

## 2. Source-of-truth order

When sources conflict, use this order:

1. Approved acceptance criteria and explicit owner decisions.
2. Backend permissions and resource scope.
3. This Design System for visual foundations, components, states, and interaction.
4. `desgin.md` for information architecture and route intent.
5. Nuxt UI behavior and accessibility primitives.
6. Legacy UI as evidence only.

Never weaken authorization, data integrity, secret handling, immutable-state rules, or accessibility to match a visual mockup.

## 3. Experience direction

### 3.1 Character

The product should feel calm, trustworthy, precise, and approachable. It is an academic operations system, so the interface must communicate control and reassurance without looking sterile or decorative.

### 3.2 Design principles

- **Navy establishes trust:** use navy for identity, strong headings, and the primary action.
- **Sage guides interaction:** use sage for links, active navigation, highlights, and positive emphasis.
- **White space reduces pressure:** separate workflows clearly and avoid cramped dashboards.
- **Borders before shadows:** normal cards use a visible border and no shadow.
- **Progressive disclosure:** keep the next decision visible; place advanced or rare controls behind a secondary action.
- **One primary action:** each screen or form region has one visually dominant CTA.
- **Status is explicit:** every status uses text and, where useful, an icon; color is never the only signal.
- **Scope stays visible:** show role, School, Program, Term, or environment whenever it affects results.
- **Recovery is designed:** errors state what happened, what remains safe, and how to recover.
- **Thai and English are peers:** neither language may clip, overlap, or depend on forced uppercase.

### 3.3 Design dials

| Dial              | Target | Meaning                                   |
| ----------------- | -----: | ----------------------------------------- |
| Visual variance   |   3/10 | Consistent grid and restrained accents    |
| Motion            |   2/10 | State feedback only; no decorative motion |
| Staff density     |   6/10 | Efficient but not cramped                 |
| Evaluator density |   4/10 | Comfortable mobile form flow              |
| Brand intensity   |   5/10 | Navy/white rhythm with selective sage     |

## 4. Token architecture

All styling follows one direction:

```text
Primitive
  raw colors, font families, spacing, radius, shadow, motion
    Semantic
      background, text, border, action, focus, status
        Component
          button, input, card, badge, table, shell, overlay
```

Rules:

1. Raw hex values exist only in Primitive definitions.
2. Semantic names describe purpose, not appearance.
3. Component tokens reference Primitive or Semantic tokens.
4. Vue files use Nuxt UI semantic utilities or component variables; no raw colors.
5. Light and dark themes remap Semantic values without changing component contracts.
6. Documentation and `packages/design-tokens/src/theme.css` must change together.

## 5. Color

### 5.1 Core palette

| Token            | Value     | Use                                                 |
| ---------------- | --------- | --------------------------------------------------- |
| Primary Navy     | `#0F172A` | Primary actions, strong headings, trusted identity  |
| Navy Hover       | `#020617` | Primary hover and deepest surface                   |
| Secondary Slate  | `#64748B` | Secondary text and neutral detail                   |
| Muted Slate      | `#475569` | Accessible muted body text                          |
| Tertiary Sage    | `#059669` | Brand accent and large/graphic highlight            |
| Sage Interactive | `#047857` | Normal-size links and secondary CTA with white text |
| Background       | `#F8FAFC` | Page canvas                                         |
| Muted Surface    | `#F1F5F9` | Table headers and grouped controls                  |
| Surface Default  | `#FFFFFF` | Cards, inputs, navigation                           |
| Border           | `#E2E8F0` | Cards, dividers, inactive controls                  |
| Success          | `#22C55E` | Confirmed and completed                             |
| Warning          | `#EAB308` | Pending and caution                                 |
| Error            | `#EF4444` | Invalid, failed, destructive                        |
| Info             | `#0EA5E9` | Neutral system information                          |

`#059669` is retained as the owner-supplied Sage primitive. Normal white text on that exact color is below 4.5:1, so interactive controls use Sage 700 `#047857`, or Navy text is used on the Sage 600 surface.

### 5.2 Semantic assignments

| Role                  | Light mode | Dark mode    |
| --------------------- | ---------- | ------------ |
| Canvas                | Slate 50   | Navy 950     |
| Surface               | White      | Navy 900     |
| Muted surface         | Slate 100  | Slate 800    |
| Primary action        | Navy 900   | Slate 50     |
| Secondary action/link | Sage 700   | Sage 300–400 |
| Main text             | Navy 900   | Slate 100    |
| Muted text            | Slate 600  | Slate 300    |
| Border                | Slate 200  | Slate 700    |
| Focus                 | Navy 900   | Sage 300     |

### 5.3 Contrast evidence

| Pair                |   Ratio | Approved use                      |
| ------------------- | ------: | --------------------------------- |
| White / Navy 900    | 17.85:1 | Primary button and inverted panel |
| White / Navy 950    | 20.17:1 | Primary hover                     |
| White / Sage 700    |  5.48:1 | Secondary CTA and link treatment  |
| Navy 900 / Sage 600 |  4.74:1 | Dark text on owner Sage accent    |
| Slate 600 / White   |  7.58:1 | Muted body text                   |
| Slate 500 / White   |  4.76:1 | Minimum non-critical metadata     |
| Sage 300 / Navy 950 | 13.23:1 | Dark-mode links and focus         |

Minimum requirements:

- normal text: 4.5:1;
- large text: 3:1;
- focus, essential icon, and control boundary: 3:1;
- charts and statuses: color plus text, symbol, pattern, or position.

## 6. Typography

### 6.1 Families

- **Headline:** Plus Jakarta Sans Variable.
- **Body:** DM Sans Variable.
- **Thai fallback:** Noto Sans Thai Variable.
- **Mono:** Fira Code Variable.
- Fonts are self-hosted through Fontsource packages; no runtime Google Fonts request.
- PDF font embedding remains a separate approval and visual-regression gate.

### 6.2 Roles

| Role       | Font              |  Size | Line height | Weight |
| ---------- | ----------------- | ----: | ----------: | -----: |
| Display    | Plus Jakarta Sans | 40 px |        1.15 |    700 |
| H1         | Plus Jakarta Sans | 32 px |         1.2 |    700 |
| H2         | Plus Jakarta Sans | 24 px |        1.25 |    600 |
| H3         | Plus Jakarta Sans | 20 px |         1.3 |    600 |
| H4         | Plus Jakarta Sans | 16 px |        1.35 |    500 |
| Body Large | DM Sans           | 18 px |         1.6 |    400 |
| Body       | DM Sans           | 16 px |         1.6 |    400 |
| Body Small | DM Sans           | 14 px |         1.5 |    400 |
| Caption    | DM Sans           | 12 px |         1.4 |    500 |
| Code/Data  | Fira Code         | 14 px |         1.6 |    400 |

Typography rules:

- Keep mobile form text at 16 px to avoid browser zoom.
- Use Fira Code only for IDs, hashes, versions, technical diagnostics, and tabular values.
- Do not use condensed or decorative type.
- Do not force Thai strings to uppercase; uppercase chip styling applies only where the script supports it.
- Instructions, errors, and question text wrap fully and are never truncated.
- Keep long-form text near 65–75 characters per line on desktop.

## 7. Spacing and geometry

Base rhythm is 8 px with a 4 px half-step.

| Token | Value | Typical use         |
| ----- | ----: | ------------------- |
| XS    |  4 px | Inline icon gap     |
| SM    |  8 px | Tight component gap |
| MD    | 16 px | Default padding     |
| LG    | 24 px | Card padding        |
| XL    | 32 px | Section gap         |
| 2XL   | 48 px | Layout section      |
| 3XL   | 64 px | Page-level spacing  |

Responsive gutters:

- 16 px at 320–767 px;
- 24 px at 768–1023 px;
- 32 px at 1024 px and above;
- content maximum 1440 px;
- focused forms maximum 960 px.

### 7.1 Radius

| Token   |   Value | Use                                    |
| ------- | ------: | -------------------------------------- |
| Small   |    4 px | Badges, chips, compact tags            |
| Default |    8 px | Buttons, cards, inputs                 |
| Medium  |   12 px | Modals and dropdown panels             |
| Large   |   16 px | Rare large containers or hero areas    |
| Full    | 9999 px | Avatars and circular status indicators |

Do not mix more than two visible radius levels in one region.

### 7.2 Elevation

| Token   | Definition                           | Use                     |
| ------- | ------------------------------------ | ----------------------- |
| Small   | 1 px offset, 3 px blur, Navy at 3%   | Button/chip lift        |
| Default | 2 px offset, 6 px blur, Navy at 5%   | Dropdown                |
| Medium  | 4 px offset, 16 px blur, Navy at 7%  | Elevated or sticky card |
| Large   | 8 px offset, 32 px blur, Navy at 10% | Modal/panel             |

Normal cards use a 1 px Slate 200 border and no shadow. Avoid heavy shadows, glassmorphism, gradients, neon accents, and decorative blur.

## 8. Components

### 8.1 Buttons

| Variant     | Default                      | Hover      | Text      |
| ----------- | ---------------------------- | ---------- | --------- |
| Primary     | Navy 900                     | Navy 950   | White     |
| Secondary   | Transparent with Navy border | Navy at 4% | Navy 900  |
| Sage        | Sage 700                     | Sage 800   | White     |
| Ghost       | Transparent                  | Slate 100  | Slate 600 |
| Destructive | Error 500                    | Error 600  | White     |

- Small: 32 px visual height for low-risk compact UI only; hit area must remain at least 44 px.
- Medium: minimum 44 px high, 22 px horizontal padding.
- Large: 48 px high, 28 px horizontal padding.
- Disabled: semantic `disabled`, 40% opacity, no hover state.
- Async action: disable while pending, show progress, then announce success or error.
- Icon-only buttons require an accessible name and tooltip.

### 8.2 Cards

- Default: White, 1 px Slate 200 border, 8 px radius, no shadow, 24 px desktop padding.
- Mobile card padding: 16 px.
- Elevated: no border, Medium shadow, 8 px radius; reserved for overlays or sticky task surfaces.
- Optional category strip: Navy 900 with White text.
- Avoid nested cards when a divider or section heading is sufficient.

### 8.3 Inputs

- Default: White, 1 px Slate 200 border, 8 px radius, minimum 44 px high.
- Hover: Navy 900 border.
- Focus: 2 px Navy border with a low-opacity 3 px ring.
- Error: 2 px Error border with a low-opacity ring.
- Disabled: Slate 100 fill and 40% emphasis.
- Label: visible, 14 px/500, Navy 900, 6 px before the input.
- Helper/error: persistent where useful, 12–14 px, linked with `aria-describedby`.
- Validate on blur or submit, not on every keystroke.
- Failed multi-field forms focus an error summary or the first invalid field.

### 8.4 Chips and status badges

- 4 px radius, 4 × 12 px padding, 12 px/500.
- Latin labels may use uppercase and 0.5 px tracking.
- Active filter: Navy fill with White text.
- Success, Warning, Error, and Info use tinted backgrounds plus visible text/icon.
- Status terms are stable across pages and API-derived states.

### 8.5 Lists and tables

- Row height: 48 px standard; 56 px comfortable evaluator/student view.
- Row padding: 8 × 16 px.
- Divider: Slate 100.
- Hover: Background canvas.
- Table header: Slate 100, 12 px/500, uppercase only for Latin labels.
- Horizontal scrolling is allowed inside the table region only; page-level horizontal scroll is forbidden.
- Preserve visible headers and provide loading, empty, filtered-empty, error, and retry states.

### 8.6 Checkboxes and radio buttons

- Control size: 18 × 18 px; interactive label creates at least a 44 px target.
- Unchecked: White with Slate 300 border.
- Checked/selected: Navy 900 with White indicator.
- Disabled: 40% opacity and disabled semantics.
- Label gap: 8 px.

### 8.7 Tooltips

- Navy 900 background, Slate 50 text, 8 px radius, 6 × 12 px padding.
- Maximum width: 240 px.
- Show after 150 ms; hide immediately.
- Tooltips supplement labels and never contain essential information unavailable elsewhere.

## 9. App shell and navigation

### 9.1 Staff desktop

- 256 px sidebar, collapsible to a 72 px icon rail.
- White sidebar and navbar with Slate borders.
- Navy identity block, Sage active navigation, and visible text labels.
- Page canvas uses Slate 50; content uses White cards.
- Environment badge remains visible outside Production.
- User identity and sign-out remain separated from normal navigation.

### 9.2 Mobile/tablet

- Sidebar becomes a Nuxt UI slideover.
- Navigation remains icon plus text; no icon-only primary navigation.
- Core content appears before secondary status panels.
- Sticky actions reserve space and never cover keyboard focus.
- No content requires a viewport wider than 320 px except a contained data table.

### 9.3 Public pages

- Use a Sage top rule, white header, Navy identity block, and restrained two-column composition.
- Landing content explains trust and workflow before feature detail.
- Login separates identity assurance from the single primary sign-in action.

## 10. Domain patterns

### 10.1 Operational dashboard

- Start with page eyebrow, H1, and refresh/action.
- KPI cards show label, tabular value, icon, and status text where applicable.
- Exceptions and failed work appear before decorative analytics.
- Scope and generated time are visible when they affect interpretation.

### 10.2 Evaluator flow

- Mobile first, one decision group at a time.
- Save state is persistent and text-based: Saving, Saved, Offline, Conflict, Error.
- Required questions are visible before submission.
- Final submission shows review, consequences, confirmation, and durable receipt.
- Submitted evaluations are read-only unless an approved reopen workflow creates a new state/version.

### 10.3 Data management

- Filters use labeled inputs and persist in the URL where practical.
- Bulk actions appear only after selection and state the selected count.
- Imports use Preview, Validate, Confirm, Execute, and Reconciliation stages.
- Destructive or high-impact actions require a clear confirmation and outcome receipt.

### 10.4 Correspondence and jobs

- Show queue state, attempt count, timestamps, safe failure code, and available recovery action.
- Never display SMTP passwords, tokens, provider responses containing secrets, or full recipient lists unnecessarily.
- Test delivery is visually separate from saving configuration.

### 10.5 Audit and documents

- Use Fira Code for request IDs, hashes, versions, and checksums.
- Audit detail shows safe before/after values only.
- Document status includes text plus icon; failed state includes retry guidance.
- Signed download expiry is visible to the user.

## 11. Async and permission states

Every async screen or major region supports:

1. initial loading with layout-preserving skeleton;
2. refreshing without removing usable stale data;
3. empty result with next action;
4. filtered-empty result with Clear filters;
5. recoverable error with Retry;
6. permission denied with safe wording;
7. success feedback without moving focus unnecessarily.

Backend permissions are authoritative. Hiding a control is UX only and never replaces API authorization.

## 12. Accessibility

- Target WCAG 2.2 Level AA.
- Keyboard order matches visual order.
- Focus rings are visible, at least 2 px, and not obscured by sticky UI.
- Web controls meet at least 24 × 24 CSS px; primary and critical controls target 44 × 44 px.
- Decorative icons beside visible text use `aria-hidden="true"`.
- Standalone icon controls have accessible names and applicable expanded/pressed state.
- Form labels are visible; placeholder-only labels are forbidden.
- Error messages identify the issue and recovery action.
- Color never carries status alone.
- Motion respects `prefers-reduced-motion` and never blocks input.
- Authentication allows password managers and paste where credentials are entered.
- Thai/English text reflows at 200% zoom and 320 px without loss of content or function.
- Charts provide a text summary or accessible table alternative.

## 13. Content style

- Calm, direct, specific, and non-blaming.
- Button labels start with a clear verb: บันทึก, ส่ง, ทดสอบ, ดาวน์โหลด, ลองใหม่.
- Errors explain cause when safe and always explain recovery.
- Destructive confirmation names the record and irreversible consequence.
- Do not expose internal stack traces, secret values, or unnecessary PII.
- Use locale-aware dates and numbers; display operational timestamps in `Asia/Bangkok` where required.

## 14. Implementation contract

- Nuxt UI is the base component system.
- Lucide is the single icon family.
- Runtime tokens live in `packages/design-tokens/src/theme.css`.
- Web entry CSS imports `@internship/design-tokens/theme.css`.
- Nuxt UI aliases and global component slots live in `apps/web/app/app.config.ts`.
- Fontsource packages self-host Plus Jakarta Sans, DM Sans, Fira Code, and Noto Sans Thai.
- Raw colors are forbidden in Vue components.
- Page-specific overrides may change layout, not security, status meaning, or token direction.

## 15. Quality gate

Before completion:

- verify 375, 768, 1024, and 1440 px layouts;
- verify 320 px reflow and 200% zoom;
- verify Thai and English strings;
- verify light and dark themes independently;
- verify keyboard-only navigation and visible focus;
- verify reduced motion;
- verify no raw colors in Vue components;
- verify token references resolve;
- run Format, Lint, Typecheck, tests, and Production Build;
- keep protected PII and secrets out of fixtures, logs, and screenshots.

## 16. Do and do not

Do:

- use Navy and White as the main visual rhythm;
- reserve Sage for interaction and positive emphasis;
- use generous whitespace and 8 px rhythm;
- use 8 px radius consistently;
- pair icons with visible labels;
- use progressive disclosure for advanced workflows;
- use Fira Code for technical/tabular identifiers.

Do not:

- reintroduce the previous red/gold palette;
- introduce neon, saturated decoration, gradients, or glassmorphism;
- use heavy shadows in normal content flow;
- use decorative or condensed fonts;
- overload dashboards with low-priority data;
- use emoji as application icons;
- infer authorization from UI visibility;
- show secret or protected values.
