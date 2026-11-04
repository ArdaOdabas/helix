# Roadmap: scientific figure intelligence

## Where the composer is today

`compose_figure` and `apply_figure_plan` accept a **visual plan**: panels, entities (one `iconId`, `count` ≤ 8), untyped relationships (`from → to`, free-text label) and a single vertical or horizontal topological layout (`src/core/plan.ts`). The feedback loop (`render_figure` → `analyze_figure_layout` → `refine_figure_layout`) fixes **geometry**: overlaps, overflow, arrow clearance and whitespace.

The migrated *CRISPR-Cas9 knock-in reporter workflow* figure shows the limit:

* The donor template and the edited locus are drawn with the same generic double-helix icon in different colours. Homology arms, the cut site, the PAM and the integrated cassette appear only as a bar and a caption.
* Every relation is the same arrow. "Cas9 cleaves locus", "donor templates repair" and "cells express reporter" are not distinguished.
* All steps share one scale. A molecular event (DSB at the PAM) and a cellular outcome (fluorescent colony) get identical visual weight, with no inset.

The plan describes **what to draw**, not **what is happening**. The composer can't reason about a mechanism it was never told about.

## What BioRender's MCP server actually does

Its MCP interface has four tools and **none of them place anything**:

| Tool | Role |
|---|---|
| `custom-figure-create-session(prompt)` | Sends one free-text prompt, returns `jobId` + `sessionId` |
| `custom-figure-get-preview-job(jobId)` | Polls status/progress |
| `custom-figure-get-session(sessionId)` | Returns the finished preview image and an editor link |
| `search-biorender(query)` | Finds existing templates and figures |

So the assistant never composes: it forwards a prompt and polls. All composition — asset choice, layout, styling — happens in their server-side engine, against a curated, stylistically unified illustration library.

Helix did the opposite: ~34 fine-grained tools that make the **agent** supply every coordinate. That is why early output looked hand-assembled — it was. The lesson is architectural, not cosmetic, and it does not require any BioRender code, schema or asset: **the engine must own geometry; the caller should only state structure.**

`compose_layout` (v0.6.1) is that engine. The caller describes panels and the blocks inside them — `track`, `icon`, `note`, `chips`, `inset`, `spacer` — and the engine measures each block with real Arial metrics, wraps text, stacks blocks, sizes panels to content, equalises panel heights, aligns inter-panel connectors to the first DNA track, and lays out the legend, footnotes and artboard. Track brackets bind to segment index ranges and marks to segment boundaries, so homology arms and cut sites stay correct when spans change. `examples/aavs1-knockin-spec.json` is a complete figure with no coordinates anywhere; `examples/aavs1-knockin-compose_layout.png` is its render.

### Style unity (v0.6.2)

The remaining gap after layout was that assets from different providers carry unrelated palettes, so a figure looks assembled rather than designed. `src/core/style.ts` harmonises them: it reads an asset's own paint values, sorts them by lightness, and remaps them onto a ramp in a target hue, **preserving the internal lightness order** so structure stays readable. Near-white highlights and near-black outlines stay at the extremes; `none`, gradients and `currentColor` are left alone. The output is an ordinary `colorMap`, so the user can still edit or clear it.

It is exposed two ways: `harmonize_asset(objectId, hue)` for a placed illustration, and `hue` on a compose_layout `icon` block (with `iconHue` / `iconSaturation` as figure-wide defaults).

The design lesson from testing it: unifying every illustration to **one** hue destroys meaning — the enzyme and the reporter stop being distinguishable. Unity has to be of *discipline*, not of hue. Each illustration takes the hue of its own role, echoing the legend (Cas9 in the cut-site colour, EGFP⁺ cells in the reporter colour), while all of them share one saturation and lightness range. `examples/aavs1-knockin-spec.json` does exactly this.

What still separates Helix from BioRender output is **asset richness**: their illustrations are purpose-drawn for a single visual system, while Helix recolours assets drawn by eight different projects. Recolouring unifies palette and value, not line weight or drawing style. Closing that fully means either commissioning a house set or extending the parametric primitives (phase B) to cover more of what is currently an imported icon.

## Target architecture: separate science from depiction

```
user intent ─▶ Mechanism model  ─▶ Depiction planner ─▶ Visual plan (v2) ─▶ editable document
               (typed biology)     (visual grammar)      (panels, primitives,   ▲      │
                     ▲                                    assets, constraints)  │  render + critique
                     └──── clarification questions ◀── validators ◀────────────┴──────┘
```

### 1. Mechanism model (new, `src/science/`)
A typed, source-agnostic description of the biology, validated with Zod like the plan:

* **Entities** with a biological kind: `genomic_locus`, `gene`, `transcript`, `protein`, `complex`, `nucleic_acid` (sgRNA, donor, plasmid), `small_molecule`, `organelle`, `cell`, `cell_population`, `tissue`, `organism`, `instrument_step`. Each carries a **scale** (molecular, organelle, cell, population, organism) and **features**. For example, a locus has `exons`, `cut_site`, `PAM`, `homology_arm_5/3`, `insert`.
* **Typed relations** with fixed semantics: `binds`, `cleaves`, `templates_repair`, `integrates_into`, `transcribes`, `translates`, `activates`, `inhibits`, `phosphorylates`, `translocates_to`, `differentiates_into`, `reprograms_to`, `treated_with`, `measured_by`, `precedes` (workflow time).
* **States**: before/after snapshots of the same entity (unedited locus → cleaved locus → knock-in allele). A mechanism is a sequence of state transitions, not a list of icons.
* **Evidence flags** per relation (`user_stated`, `canonical`, `hypothesis`), so the figure never presents a hypothesis as established.

### 2. Validators and clarification
Rule packs per domain check completeness and consistency **before** anything is drawn:

* HDR knock-in needs a donor with homology arms that match the targeted locus. Cas9 cleavage needs an sgRNA and a PAM. Reporter expression needs the insert in the right locus and frame.
* Signalling: inhibitors must point at an existing node, and phosphorylation needs a kinase.
* Differentiation and reprogramming: states must differ, and factors must be named or explicitly unspecified.

If a critical slot is empty (which locus? N- or C-terminal tag? which cell type?), the composer returns **questions**, not a guess. It never adds mechanisms the user did not state or that are not canonical. Canonical additions are flagged in the caption.

### 3. Visual grammar and parametric primitives
Icons alone can't show features. Add editable, parametric primitives that compile to ordinary grouped SVG, so they stay fully editable:

* **Genomic track**: a linear locus with exons and introns, arrows for cut sites, PAM marks, labelled homology arms, an insert cassette, and before/after alignment.
* **Plasmid / donor map**, **mRNA with UTRs/CDS**, **protein domain bar**.
* **Membrane & compartments**: a bilayer band and nuclear envelope with correct inside/outside placement.
* **Signalling cascade** with typed edges: → activation, ⊣ inhibition, phosphorylation P-circles, dashed translocation.
* **Workflow timeline** with day markers and assay icons.
* **Zoom inset / callout**: a cellular overview with a magnified molecular detail and connector lines. This is the standard way to show scale differences.

Each relation type maps to a depiction rule: arrow style, glyph, label placement. Each entity kind maps to a primitive or an asset query.

### 4. Asset selection and style harmonization
* Query the catalog by **role** (kind + scale + organism), not by name alone. Use existing quality/scientificCategory fields and add embedding search over names, tags and descriptions.
* Prefer one provider and style family per figure. Normalise palettes via the existing `colorMap`/element-style system to a figure palette: one hue per entity identity, consistent across panels.
* Show licence implications (BY-NC/BY-SA) when assets are chosen.

### 5. Layout engine
Replace the single topological strip with constraint layout per panel: rows and columns, alignment, a state-transition axis, inset placement, label anchoring. Add multi-panel figure grids (A, B, C labels) with shared margins and typographic scale (title / panel / label / annotation sizes). Keep the current planner as the fallback.

### 6. Critique loop (geometry + semantics)
* Extend `analyze_figure_layout` with **semantic checks** against the mechanism model: every entity is visible, every relation has a connector of the right type, each state change reads left to right or top to bottom, and labels sit next to their objects.
* Expose a `critique_figure` tool that returns the render **and** a structured rubric, so the MCP client's vision model can judge clarity. Edits still go through bounded, revision-checked operations.

## Phased plan

| Phase | Deliverable | Done when |
|---|---|---|
| A | Mechanism schema v1, CRISPR/HDR and transcription rule packs, `validate_mechanism` + clarification output | Missing locus/donor details produce questions; tests cover each rule |
| B | Genomic track, cascade, membrane and inset primitives (grouped, editable SVG) | Each renders in editor/export, survives undo/redo, element-editable |
| C | Depiction planner: mechanism → visual plan v2; `compose_mechanism` MCP tool | CRISPR knock-in, HDR, transcriptional activation and a 3-step signalling pathway compose without hand-placed coordinates |
| D | Role-based asset retrieval + palette harmonization | One style family and palette per figure by default |
| E | Constraint layout, multi-panel grids, typographic scale | No geometric issues on the benchmark set; consistent hierarchy |
| F | Semantic analyzer + `critique_figure` | Analyzer catches a missing cut site, wrong edge type and a misplaced label in seeded test figures |
| G | In-app assistant panel (desktop) that drives the same MCP tools | Prompt → questions → figure → targeted edits, all undoable |

**Benchmark set**, used for every phase and kept as regression fixtures: CRISPR-Cas9 NHEJ knockout; HDR knock-in reporter; transcriptional activation at an enhancer; a receptor tyrosine kinase → MAPK cascade with an inhibitor; iPSC differentiation to cardiomyocytes; OSKM reprogramming; RNA-seq workflow; co-IP protein–protein interaction; a 2C/8-cell-like state transition. Each fixture stores the mechanism, expected panels and depictions, and a rubric. These are reusable test cases, not demo figures to polish.

**Principle:** scientific accuracy over polish. A figure with fewer, correct elements beats a richer one that implies an unsupported mechanism.
