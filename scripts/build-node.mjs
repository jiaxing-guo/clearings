import { execFileSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { platform, arch } from 'node:process';
execFileSync('cargo', ['build', '--locked', '--release', '-p', 'clearings-node'], {
  stdio: 'inherit',
});
const library =
  platform === 'win32'
    ? 'clearings_node.dll'
    : platform === 'darwin'
      ? 'libclearings_node.dylib'
      : 'libclearings_node.so';
copyFileSync(`target/release/${library}`, 'bindings/node/clearings.node');
writeFileSync('bindings/node/platform.json', `${JSON.stringify({ platform, arch })}\n`);
