/**
 * The `join__Graph` enum value composition makes of a subgraph name: upper-cased, with anything
 * outside `[A-Z0-9_]` replaced — `my-graph` becomes `MY_GRAPH`, so a `toLowerCase()` would not
 * round-trip it.
 *
 * It matters because `httpExecutorOpts` identifies a subgraph by this value, not by its name. Headers
 * filed under the name and looked up by the value miss silently: the subgraph is called anonymously,
 * answers `Unauthorized`, and `{ __typename }` — which reaches no subgraph — keeps passing.
 */
export function joinGraphEnumName(subgraph: string): string {
  return subgraph.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}
