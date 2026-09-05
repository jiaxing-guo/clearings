# Two reading views

Start with an overview. Use the engineer guide when you need to understand the mechanism or check the source.

| Capability | Overview | Engineer guide |
| --- | --- | --- |
| Request dispatch | [HTML](request-dispatch.overview.html) · [Markdown](request-dispatch.overview.md) | [HTML](request-dispatch.engineer.html) · [Markdown](request-dispatch.engineer.md) |
| Middleware composition | [HTML](middleware-composition.overview.html) · [Markdown](middleware-composition.overview.md) | [HTML](middleware-composition.engineer.html) · [Markdown](middleware-composition.engineer.md) |

The overview explains purpose, three main actions, a simple case, possible outcomes, and limits. It has about 200 visible words before you open reference details.

The engineer guide starts with a concrete case. It explains the mechanism in order, with exact source excerpts. The single-handler example now includes its full branch. Partial ranges are labeled and have expandable surrounding source. Long code lines can be scrolled with the keyboard. Function summaries connect source units to the behavior they support. A function can support several parts of the behavior.

Both views retain the original claims and source evidence. Open the source section to inspect them. The pages are recorded Hono examples with authored explanations. Function summaries are review data; automatic function analysis is not implemented. The user accepted the reports as sufficient for this prototype on 5 September 2026. Independent claim-support review remains pending.

Open HTML files in a browser. Keep the files in one directory to use the audience tabs. No server, installation, or network connection is needed. Source excerpts retain the Hono MIT notice inside each page and in `LICENSE-HONO`.

For review, ask:

1. Can you explain the purpose without opening details?
2. Where did you first need to stop and reread?
3. Does the engineer guide explain enough to let you predict one result?
4. Can you find the source when you want to check a statement?

The [verification record](review.json) describes the current automated and static checks. The [browser checks](browser-review.json) are historical; browser policy blocked the latest local-file preview. They do not measure comprehension. The [replay summary](summary.json) records unchanged semantic output and source files. The [reproduction guide](REPRODUCE.md) gives the commands to regenerate the reports from the full repository. The [file hashes](SHA256SUMS) identify the packaged contents.
