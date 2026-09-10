const { platform, arch } = require('node:process');
const target = require('./platform.json');
if (target.platform !== platform || target.arch !== arch) {
  throw new Error(
    `Clearings native artifact targets ${target.platform}/${target.arch}; install the artifact for ${platform}/${arch}.`,
  );
}
exports.NativeEngine = require('./clearings.node').NativeEngine;
