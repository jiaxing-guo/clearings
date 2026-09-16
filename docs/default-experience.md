# Daily use

Install Clearings once, complete the coding client's normal trust steps, and start a session in a project. The plugin handles project identity, private storage, and the project read grant. You do not need to select a model, configure a source list, or create a service file.

## Make work reusable

Say **“Make this workflow reusable.”** The agent identifies the parts that can be expressed as code, defines inputs and examples, and saves a routine after it passes evaluation.

Say **“Review recent work in this project.”** The agent reads relevant local conversations and looks for useful repeated steps. One long conversation can contain many workflow episodes. An explicit request can also generalize one demonstrated mechanical step when future inputs and behavior are clear; it must not invent evidence of repetition.

For files and larger artifacts, the routine should accept a file reference and read the contents itself. You should not have to paste a document into a tool call.

## Reuse it

Continue asking for normal work. The prompt hook supplies up to three relevant accepted routines. The agent checks whether one fits and uses it on fresh input. A complete hint needs no preparatory selection or inspection call.

The agent continues ordinary work when nothing fits, when information is missing, or when a routine returns a handoff. It should not repeatedly ask to save the same workflow or announce empty searches.

## Explore the library

Ask **“What did you learn?”** to see saved routines, examples, controls, and usage. Ask **“Open the Clearings workbench”** for a local visual view.

The workbench lets you try inputs, inspect results, add examples, and describe an extension. It tests a proposal before you choose **Use update**. A test is labelled separately from real reuse. The previous definition remains available for undo.

## Control learning

| Say                              | Result                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| “Pause learning”                 | Stop automatic learning; saved routines still work                   |
| “Learn weekly”                   | Change the learning interval                                         |
| “Stop suggesting routines”       | Stop prompt suggestions without disabling learning                   |
| “Exclude this project”           | Remove it from learning scope                                        |
| “Undo the last automatic change” | Restore the preceding accepted version or deactivate the new routine |
| “Pause this routine”             | Stop its use without deleting its evidence                           |

The defaults are daily review, seven days of initial history, three candidates per cycle, and six authoring requests per UTC day. The local schedule checks hourly and coalesces missed intervals. The machine and user-session service must be available for checks to run.

If sign-in, history access, or a connection fails, ask **“Show Clearings status.”** Clearings reports the failure and does not silently switch providers. Your client keeps its own trust, sandbox, and approval controls.
