"""Install a built wheel without build tools and execute independent public cases."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import venv
from pathlib import Path

root = Path(__file__).resolve().parents[1]
output = root / "dist/python"
wheels = list(output.glob("clearings-*.whl"))
if len(wheels) != 1:
    raise SystemExit("Expected one wheel in dist/python; remove stale wheels before building.")
for source, target in [("tests/python/fixtures.py", "fixtures.py"), ("tests/python/installed.py", "check.py"), ("contracts/execution-cases.json", "cases.json")]:
    shutil.copyfile(root / source, output / target)
with tempfile.TemporaryDirectory(prefix="clearings-installed-python-") as temporary:
    project = Path(temporary)
    venv.create(project / "venv", with_pip=True)
    binary = project / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    env = dict(os.environ)
    env.pop("PYTHONPATH", None)
    path = [str(binary.parent), str(Path(sys.executable).parent)]
    for entry in os.get_exec_path():
        if not any(term in entry.lower() for term in ("cargo", "rustup", "node")):
            path.append(entry)
    for key in list(env):
        if key.lower() == "path":
            del env[key]
    env["PATH"] = os.pathsep.join(path)
    subprocess.run([str(binary), "-m", "pip", "install", "--no-index", "--no-deps", str(wheels[0])], check=True, env=env, stdout=subprocess.PIPE)
    for name in ("fixtures.py", "check.py", "cases.json"):
        shutil.copyfile(output / name, project / name)
    subprocess.run([str(binary), "-c", "import shutil; assert shutil.which('rustc') is None; assert shutil.which('cargo') is None"], check=True, env=env)
    result = subprocess.run([str(binary), "check.py"], cwd=project, env=env, check=True, capture_output=True, text=True)
    records = json.loads(result.stdout)
    (output / "results.json").write_text(json.dumps(records, indent=2) + "\n")
    print(json.dumps({"installed_cases": len(records), "native": True}))
