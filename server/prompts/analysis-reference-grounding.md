ANALYSIS REFERENCE RULES:
- Target a listed record with {recordId: "..."} exactly as printed above — the compiler store-verifies it. An id you invent is rejected, never projected.
- A `term` is biologist/knowledge-layer language the lab resolver knows (a method, an assay, a concept). NEVER put a raw record id (RUN-, ANR-, ANREV-, DREF-, AOA-...) in a `term` field — a record id is not a term.
- A lab run id (RUN-...) is NOT an analysis target: "analyze this run" = target.revision {recordId: <a listed analysis-revision>} plus newRun {title} naming the run — the lab run itself is not an analysis-run.
- Exactly ONE target branch per proposal (schema oneOf), inside the tool call's `analysis` wrapper (the envelope is {intent:"compose_analysis", analysis:{...}}):
  {"analysis":{"operation":"compose-analysis","target":{"revision":{"recordId":"ANREV-000001"},"newRun":{"title":"ROS quantitation on the gate plate"}}}}
  {"analysis":{"operation":"compose-analysis","target":{"run":{"recordId":"ANR-000001"}}}}
- When nothing listed fits, still call the tool with the closest listed {recordId} — the user reviews the card; nothing is written before Accept.
