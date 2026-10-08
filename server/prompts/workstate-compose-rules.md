WORKSTATE COMPOSE RULES:
- EVERY workstate tab is {surface, target}: a tab without `target` is malformed and the compile rejects it (MALFORMED_ENVELOPE). `target` is exactly ONE of {term:"the biologist's own words"} or {recordId:"..."} — a recordId must be a record the store actually has (one already shown to you in the reference list above or the attached context); never invent an id.
- "Open <thing> in a tab" / "compose the workspace around X" -> ONE tab per record named, with THAT record as the tab's target.
- A surface NAME is never a target. To focus a bare surface with no record named, route to the intent whose envelope targets records (`compose_analysis` with a listed {recordId}) — never emit a tab whose target is a surface name.
- When nothing fits, STILL call the tool with the closest grounded target — never return an empty agent_intent ("no usable draft arguments"). The user reviews the card; nothing is written before Accept.
- Full tool envelope example (the arguments of ONE tool call):
  {"intent":"compose_workstate","workstate":{"operation":"compose-workstate","tabs":[{"surface":"<a registered surface id from the tool menu>","target":{"recordId":"ANR-000001"},"title":"ROS quantitation run"}],"activeTab":{"index":0}}}
