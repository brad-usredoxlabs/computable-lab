# The run is the provenance record; instruments attach to it (BRAD RULING 2026-11-14)

Status: BINDING. Supersedes any assumption that an instrument-specific "run sheet" is the
entry point for instrument data.

## Brad's words (verbatim, 2026-11-14)

> I don't want a GC run sheet. If we did that, we'd have to have a qPCR run sheet and a LC-MS run
> sheet and ..... When I'm setting up an experiment in the run editor, I am recording the provenance
> of what was done. This is biological truth. Each well got 10,000 HepG2 cells. Wells A1-B2 were
> treated with clofibrate. Then I could execute the plate run, split the material from each well, run
> an acquisition on the GC-FID with some of the material and do qPCR gene expression with the other
> part of the material. OR I could run two plate replicates - one for GC-FID and one for qPCR.

## The rule

1. **RUN is the center.** A run records biological truth: the context, the materials and their
   provenance, and what was done to which wells. It is not an instrument record.
2. **An acquisition attaches to the run.** An acquisition names, at minimum:
   which MATERIAL went in (plate + wells, or an aliquot / derived material), which INSTRUMENT
   (a declared equipment record), which METHOD (declared), which DATA (device + directory key, or a
   file, with sha), which MEASUREMENT record results, and which ANALYSIS run consumes it.
3. **No instrument may define its own primary "sheet".** A per-instrument sheet may exist as the
   instrument-side record (what the instrument itself produced: sequence, injection rows, operator),
   but it is DERIVED from a run and never a prerequisite for attaching data. If a person must create
   an instrument sheet before attaching a file, the door is wrong.
4. **One run, many instruments.** The same run may yield a GC-FID acquisition and a qPCR acquisition.
   Splitting material for two readouts is a material-derivation fact recorded on the run, not a second
   experiment.
5. **Capability, not surface.** "Attach instrument data" is ONE capability. GC, qPCR, LC-MS panels are
   presentations of the same capability; a new instrument must not require a new surface nor a new
   record kind, only new declared configuration (parser, readout definition, equipment).
6. **Declared, not hardcoded.** The instrument list, methods, parsers and readouts are records/config.
   The door reads them; it never enumerates instruments in TypeScript.

## What this ordering changes (evidence)

- `schema/lab/instrument-sequence.schema.yaml` already describes a sheet as *linking a study and its
  RUN record* + equipment + operator + entries — i.e. the sheet is already subordinate to the run in
  the data model. The UI made it the doorway; that is the defect.
- `measurement.schema.yaml` already carries `eventGraphRef` (the run's graph), plus the material and
  measurement-context refs — so the measurement can bind to the run's material with no sheet.
- The generic attach surface that would carry this ("Attach Results To A Readout", editor results
  mode) is unreachable: nothing in the app sets `editorMode = 'results'`
  (`app/src/types/editorMode.ts`, `LabwareEventEditor.tsx:3815`). Reported by Brad 2026-11-14 while
  trying to attach GC-FID data to a run.

## Acceptance consequences

- Attaching GC-FID data to a run must be possible with NO instrument-sequence record in existence.
- The resulting measurement names the material it came from (plate + wells or derived aliquot) and
  the run, and its analysis run names the revision and units.
- Two acquisitions (GC-FID + qPCR) can hang off one run from split material, each citing its own
  material line.
