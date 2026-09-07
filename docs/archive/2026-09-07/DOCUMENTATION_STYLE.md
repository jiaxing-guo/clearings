> Historical document. See the [current documentation](../../README.md). Navigation links were rebased when this file was archived; dated results and implementation instructions describe their original context.

# Documentation writing approach

The documentation separates the first successful task, task guides, concepts, and exact references. The README introduces the purpose and one short example, then links to detail. The contribution guide explains actionable project practices without inventing public services or review deadlines.

The requested examples informed this structure:

| Source | Pattern used in Clearings |
| --- | --- |
| [uv documentation](https://docs.astral.sh/uv/) | Separate getting started, guides, concepts, and reference. Keep runnable commands close to tasks. |
| [FastAPI](https://fastapi.tiangolo.com/) | Introduce a concrete example, explain its result, then add variations. |
| [Railway documentation](https://docs.railway.com/) | Group navigation by the task a reader wants to complete. |
| [Deno runtime](https://docs.deno.com/runtime/) | Follow setup with a runnable project and a clear next step. |
| [Nadia Eghbal's contribution template](https://github.com/nayafia/contributing-template/blob/master/CONTRIBUTING-template.md) | Explain useful contributions, bug details, setup, conventions, and review expectations. Use only practices that this project actually has. |
| [LiteLLM README](https://github.com/BerriAI/litellm/blob/litellm_internal_staging/README.md) | State the product purpose and distinguish its consumption modes. |
| [Autoevals README](https://github.com/braintrustdata/autoevals/blob/main/README.md) | Move quickly from purpose to installation and a small API example. |
| [uv README](https://github.com/astral-sh/uv/blob/main/README.md) | Keep the first commands short and link to task-specific documentation. |

The text is original. Source product claims, badges, styling, and infrastructure promises are not copied.

Use the technical prose rule in AGENTS.md. A writing prompt or sentence-length check does not certify complete ASD-STE100 compliance. Review terminology and meaning as well as readability.

Implementation follows the official [Fumadocs Next.js installation](https://www.fumadocs.dev/docs/manual-installation/next) and [static build guidance](https://www.fumadocs.dev/docs/deploying/static). The site pins Fumadocs UI/core 16.15.7, MDX 15.4.0, and Next.js 16.3.4. Search uses a locally exported index. GitHub Pages serving, CI, and public access remain subsequent work.
