# Compatibility policy

Perspective: a client written against the old description sends previously permitted inputs and expects previously described outputs. “Breaking” is shorthand in the report data for **potentially breaking**, never observed runtime failure. Informational does not mean all client implementations are safe. Unresolved means the supported rules cannot determine compatibility.

| Rule | Existing-client interpretation |
| --- | --- |
| operation-removed / operation-added | Removed is potentially breaking; added is informational. |
| parameter-required / body-required | Newly required input is potentially breaking; relaxed requirement is informational. Omitted `required` has the same requiredness as false. |
| parameter-added / parameter-removed | Required addition is potentially breaking; optional addition informational. Removal is unresolved because handling of an old supplied parameter is unspecified. |
| body-added / body-removed | Required new body is potentially breaking; optional new body informational. Removal is unresolved. |
| schema-type | Conservatively potentially breaking for type changes; removing request constraints or adding response constraints can be informational. No subtype/coercion assumptions. |
| schema-enum | Request narrowing/restriction is potentially breaking, widening/removal informational. Response widening/removal is potentially breaking, narrowing/restriction informational. Values compared by JSON value, order ignored for this rule. |
| schema-required | Request added required properties: potentially breaking. Response removed guarantees: potentially breaking. Opposite directions informational. |
| properties-added / properties-removed | Response property removal potentially breaking. Request removal unresolved (additional-properties policy unsupported). Additions informational; any required-property change is separately evaluated. |
| responses-added / responses-removed | Removed status potentially breaking; new status unresolved because existing clients may not handle it. No status wildcard/default equivalence assumed. |
| content-added / content-removed | Removed media type potentially breaking. New request media type informational; new response media type unresolved because negotiation is not modeled. |
| schema-presence | Schema addition/removal unresolved; containing parameter/body/media rules still apply. |
| metadata-changed | Documentation changes informational. |
| unsupported-change / unclassified-source-change | Unresolved. Raw source leaf changes not covered by a semantic finding are retained, including refactoring/reordering and unused definitions. |
| unresolved-reference / unresolved-shape | Comparison cannot be completed for this location. Coverage explains why. |

Pointers start at `#` and identify the original old/new JSON documents, not dereferenced synthetic copies. Resolved schemas point to their original component definitions; the operation identifies use context. Absent entries have `present:false` and a null placeholder. For a newly added or removed parameter its absent-side pointer identifies the containing array (there is no nonexistent index to invent). Values in unsupported reference findings may describe an unresolved location; coverage supplies the reference site. Reports carry full descriptions for inspection.

Local references are followed without HTTP. A repeated reference along the same traversal branch is a cycle, not expanded indefinitely. Reference siblings are ignored according to 3.0 semantics and explicitly flagged. Path Item references are outside this initial subset and yield coverage entries rather than a claimed expanded operation inventory. The direct operation inventory is exhaustive for the bundled real pair, which has no Path Item references.

Unsupported fields are coverage questions even if identical on both sides. Unresolved coverage is separate from changed findings and is never hidden by a finding filter. An unsupported constraint may change the significance of an otherwise supported field; read findings together with coverage, not as a complete contract verdict.
