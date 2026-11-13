---
version: 1
slug: "src-pages-journey-tsx"
primary_target: "src/pages/journey.tsx"
related_targets: ["src/journey/stage.ts"]
---

# /sobre — A apresentação: a jornada de uma notícia

Scope: public route `/sobre` in apps/web, the product's presentation page (it first shipped at `/jornada`, which now redirects here). Mode: Experience. Inside the established Optsolv world (DESIGN.md); no new identity.

Audience and job: someone at Optsolv (or invited) who has not used Opt News yet, or wants to show it. They should leave understanding that a story is collected, filtered, scored twice, written by AI and marked as such, decided by people, and then turned into pauta, meetup and insight. Action: Entrar. Content: only properties of the system (README, PRD); never results or metrics.

Constraints: Public Sans / Roboto Mono; laranja = action, roxo = machine text only (on this page purple appears only while the model writes and on the story's AI mark); official symbol only sampled, never redrawn; WCAG 2.2 AA; no new dependencies (three.js + its postprocessing addons, GSAP, Lenis, motion already in the app).

## Direction contract

THESIS: One continuous shot. A single body of points is the day's news and never leaves the screen; scrolling moves the camera while that body becomes each stage of the pipeline. Refuses the split hero and the row of step cards: no cards, no section backgrounds.

OWN-WORLD: Warm graphite void (#141010). Points in claro quente for raw news, laranja vivo for what was selected or decided, roxo only for the model. The only solids are official chevrons (a track under the route) and the model's core. Captions are film subtitles in Public Sans Bold over a graphite veil. Wayfinding is the chain itself: seven chevrons on the bottom edge.

STORY: ruído → coleta → duas notas → redação por IA → curadoria → cadeia → símbolo. The visitor believes the path is traceable end to end, then enters.

FIRST VIEWPORT: Full-bleed spiral of points across the whole frame, lit orange from the lower left. h1 "A jornada de uma notícia" (44–84px) bottom-left with one sentence and a scroll cue. Top bar: mark + Opt News left; pause and Entrar right. Bottom centre: act rail, 1 / 7.

FORM: Scroll-driven camera on rails through one morphing body (structure 1 of 7 considered, fused with the morphing-matter and chevron-flight candidates). seed: none (unavailable)

Signature interaction: in Curadoria the visitor decides. Publicar (P) sends a ring through the story; Retirar (R) pulls it apart and lets it re-form. Motion grammar: expo-out; captions arrive line by line once a figure has settled and leave before the body travels; the machine's heading is typed in.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
