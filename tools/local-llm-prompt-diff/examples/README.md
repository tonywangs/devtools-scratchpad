# Public-source prompt review example

`mrkl-before.json` adapts the PREFIX, FORMAT_INSTRUCTIONS and SUFFIX constants from
[LangChain 0.3.27 MRKL prompt](https://github.com/langchain-ai/langchain/blob/langchain%3D%3D0.3.27/libs/langchain/langchain/agents/mrkl/prompt.py), under the [MIT license](LANGCHAIN-LICENSE.txt).

The source was retrieved on 2026-10-19. SHA-256 of the original Python file:
`176512840a4b87f13b24e5e1bc75c44b860663f4afe1d1b57cd0d86cad1a1e33`.

Adaptation splits the three constants into stable message IDs, declares their variables,
converts Python `{name}` placeholders to this tool's `{{name}}` syntax, and supplies
illustrative tool defaults. These wrappers are local adaptations, not upstream message roles.
`mrkl-after.json` is an intentionally authored review scenario, **not an upstream revision**:
it changes the policy role and text, introduces a locale variable, extends the tool default,
and increments revision metadata. No model was run and no answer-quality improvement is claimed.

Open `mrkl-report.html` in a browser for the self-contained example. Its five findings
cover a new variable, a changed default, a role change, a template change and metadata.
`mrkl-report.json` contains the same findings for programmatic inspection.
The small `before.json` and `after.json` files remain minimal format examples.
