function runInternal(mode) {
  if (mode === '__internal_step1__') {
    require('./step1-gallery-upload-api-v1.js');
    return true;
  }
  if (mode === '__internal_step2__') {
    require('./step2-batch-design-api-v1.js');
    return true;
  }
  if (mode === '__internal_step3__') {
    require('./step3-temu-export-api-v1.js');
    return true;
  }
  return false;
}

function main() {
  const internalMode = process.env.LANDWU_INTERNAL_STEP || '';
  if (internalMode) {
    let internalArgs = [];
    try {
      internalArgs = JSON.parse(process.env.LANDWU_INTERNAL_ARGS || '[]');
    } catch {
      internalArgs = [];
    }
    process.argv = [process.execPath, internalMode, ...internalArgs];
    if (runInternal(internalMode)) return;
  }

  require('./uploader-server-v1.js').startServer();
}

main();
