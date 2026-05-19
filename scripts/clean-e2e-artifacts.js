const { resetDir, e2eArtifactsRoot, legacyRootTestResultsDir } = require('./test-artifacts');

resetDir(legacyRootTestResultsDir);
resetDir(e2eArtifactsRoot);
