# Recreate the coding workspace from exact frozen source and instructions.
from pathlib import Path
import tarfile,shutil,sys
root=Path(__file__).resolve().parent;out=Path(sys.argv[1]).resolve()
if out.exists():raise SystemExit('Use a new coding directory.')
out.mkdir(parents=True)
with tarfile.open(root/'source-baseline.tar.gz') as archive:archive.extractall(out,filter='data')
for name in ['API.md','TASK.md','PROTOCOL.md','context.json','specification.json','record.mjs']:
 shutil.copy2(root/name,out/name)
(out/'tests').mkdir()
if len(sys.argv)>2:(out/'node_modules').symlink_to(Path(sys.argv[2]).resolve(),target_is_directory=True)
print(out)
