import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
python_results = json.loads((root / "dist/python/results.json").read_text())
node_results = json.loads((root / "dist/node/results.json").read_text())
assert node_results == python_results, "The SDK results or execution records differ."
print(json.dumps({"matching_cases": len(node_results), "compared": "results, errors, call accounting and execution versions"}))
