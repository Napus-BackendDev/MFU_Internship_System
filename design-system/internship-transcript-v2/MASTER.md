# Internship Transcript V2 — Verdana Health Design Master

> Version 2.0.0  
> Purpose: hierarchical AI retrieval entry  
> Canonical specification: [DESIGN_SYSTEM.md](../../docs/design/DESIGN_SYSTEM.md)

## Retrieval order

When building or changing UI:

1. Read this file.
2. Read [DESIGN_SYSTEM.md](../../docs/design/DESIGN_SYSTEM.md) completely.
3. Read [tokens.json](../../docs/design/tokens.json), [tokens.css](../../docs/design/tokens.css), and [app.config.example.ts](../../docs/design/app.config.example.ts).
4. Check `pages/[page-name].md`; a page file may override layout only.
5. Read [desgin.md](../../desgin.md) for route and screen intent.
6. Read relevant acceptance criteria and permissions before coding.

A page override cannot change security, authorization, token direction, status meaning, accessibility, or immutable workflow rules.

## Direction

- Owner-supplied Verdana Health visual language adapted to a university operations product.
- Calm, trustworthy, precise, approachable, bilingual, and audit-friendly.
- Navy/White form the primary rhythm; Sage marks interaction and positive emphasis.
- Generous whitespace; 8 px spacing system with 4 px half-step.
- Plus Jakarta Sans headings, DM Sans body, Fira Code technical data, Noto Sans Thai fallback.
- Nuxt 4, Vue 3, Nuxt UI, Tailwind CSS, Lucide icons.
- WCAG 2.2 Level AA target.

Design dials:

| Dial              | Target |
| ----------------- | -----: |
| Visual variance   |   3/10 |
| Motion            |   2/10 |
| Staff density     |   6/10 |
| Evaluator density |   4/10 |
| Brand intensity   |   5/10 |

## Core tokens

| Role                        | Value     |
| --------------------------- | --------- |
| Primary Navy                | `#0F172A` |
| Navy Hover                  | `#020617` |
| Secondary Slate             | `#64748B` |
| Tertiary Sage               | `#059669` |
| Accessible Sage interaction | `#047857` |
| Canvas                      | `#F8FAFC` |
| Surface                     | `#FFFFFF` |
| Border                      | `#E2E8F0` |
| Muted surface               | `#F1F5F9` |
| Success                     | `#22C55E` |
| Warning                     | `#EAB308` |
| Error                       | `#EF4444` |
| Info                        | `#0EA5E9` |

Raw values stay in Primitive tokens. Vue components consume Semantic utilities or Component tokens only.

## Non-negotiable visual rules

- Default buttons, cards, and inputs use 8 px radius.
- Default cards: White, Slate 200 border, no shadow, 24 px desktop padding.
- Inputs and primary controls are at least 44 px high.
- Use borders before shadow; reserve Medium/Large shadows for sticky or overlay surfaces.
- No gradients, glassmorphism, neon, heavy shadows, decorative fonts, emoji icons, parallax, or scroll reveal.
- One primary CTA per screen or form region.
- Every status includes text; color alone never communicates meaning.
- Thai and English wrap without clipping; do not force uppercase on Thai.
- Technical IDs, hashes, versions, and tabular data use Fira Code.

## Shell

- Desktop: 256 px white sidebar, 72 px collapsed rail, white navbar, Slate borders.
- Navy identity block; Sage active navigation.
- Mobile/tablet: Nuxt UI slideover with icon and text labels.
- Public pages: Sage top rule, white header, Navy trust panel, focused primary action.
- Environment and scope remain visible when they affect behavior.

## Required state handling

Every async screen or major region includes loading, refreshing, empty, filtered-empty, recoverable error, permission denied, and success feedback.

High-impact flows use Preview, Validate, Confirm, Execute, and durable Receipt. Backend authorization remains authoritative.

## Accessibility

- Visible keyboard focus; sticky UI never obscures it.
- Critical targets at least 44 × 44 px.
- Visible form labels and field-specific recovery messages.
- Decorative icons use `aria-hidden="true"`; icon-only controls have accessible names.
- 320 px and 200% zoom reflow without loss.
- Reduced motion is respected.
- Light and dark contrast are verified independently.

## Verification

- 375, 768, 1024, and 1440 px layouts.
- Thai and English.
- Light and dark themes.
- Keyboard-only core journeys.
- 200% zoom and 320 px reflow.
- Reduced motion.
- Token reference validation.
- Format, Lint, Typecheck, tests, and Production Build.

Do not implement from this summary alone. Read the canonical Design System and task-specific product/security documents.
