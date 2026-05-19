const path = require('path');
const {
  ensureDir,
  resetDir,
  sanitizeSegment,
  writeFile,
  e2eArtifactsRoot,
  e2eSummaryFile,
  e2eCaseDetailsDir,
} = require('./test-artifacts');

class DocsReporter {
  constructor() {
    this.failures = [];
  }

  onBegin() {
    resetDir(e2eArtifactsRoot);
  }

  onTestEnd(test, result) {
    if (result.status === 'passed' || result.status === 'skipped') {
      return;
    }

    const titlePath = test.titlePath().slice(1);
    const slug = sanitizeSegment(titlePath.join('-'));
    const detailFileName = `${String(this.failures.length + 1).padStart(2, '0')}-${slug}.md`;

    this.failures.push({
      titlePath,
      location: test.location,
      status: result.status,
      duration: result.duration,
      detailFileName,
      errors: result.errors || [],
      attachments: (result.attachments || []).filter((attachment) => attachment.path),
    });
  }

  onEnd(result) {
    if (this.failures.length === 0 && result.status === 'passed') {
      resetDir(e2eArtifactsRoot);
      return;
    }

    ensureDir(e2eCaseDetailsDir);

    const summaryLines = [
      '# E2E Test Summary',
      '',
      `- Generated: ${new Date().toISOString()}`,
      `- Run status: ${result.status}`,
      `- Issues: ${this.failures.length}`,
      '',
      '## Failures',
    ];

    if (this.failures.length === 0) {
      summaryLines.push(
        '',
        'No individual test failures were captured, but the run did not complete cleanly.',
      );
    }

    this.failures.forEach((failure, index) => {
      const detailPath = path.posix.join('details', 'cases', failure.detailFileName);
      summaryLines.push(
        '',
        `${index + 1}. [${failure.titlePath.join(' > ')}](${detailPath})`,
        `   - Status: ${failure.status}`,
        `   - Location: ${failure.location.file}:${failure.location.line}:${failure.location.column}`,
      );

      writeCaseDetail(failure);
    });

    writeFile(e2eSummaryFile, `${summaryLines.join('\n')}\n`);
  }
}

function writeCaseDetail(failure) {
  const lines = [
    `# ${failure.titlePath.join(' > ')}`,
    '',
    `- Status: ${failure.status}`,
    `- Duration: ${failure.duration}ms`,
    `- Location: ${failure.location.file}:${failure.location.line}:${failure.location.column}`,
    '',
  ];

  if (failure.errors.length > 0) {
    lines.push('## Errors', '');
    failure.errors.forEach((error, index) => {
      lines.push(
        `### Error ${index + 1}`,
        '',
        '```text',
        error.message || 'Unknown error',
        '```',
        '',
      );
    });
  }

  if (failure.attachments.length > 0) {
    lines.push('## Attachments', '');
    failure.attachments.forEach((attachment) => {
      const relativePath = path
        .relative(e2eArtifactsRoot, attachment.path)
        .split(path.sep)
        .join('/');
      lines.push(`- [${attachment.name || path.basename(attachment.path)}](${relativePath})`);
    });
    lines.push('');
  }

  writeFile(path.join(e2eCaseDetailsDir, failure.detailFileName), `${lines.join('\n')}\n`);
}

module.exports = DocsReporter;
