const fs = require('fs');
const path = require('path');

const sourceRoot = path.resolve(__dirname, '../src');
const baselinePath = path.join(sourceRoot, 'scripts/api-client-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function scanDirectCalls(root = sourceRoot) {
  const counts = {};
  for (const file of walk(root).filter(file => /\.jsx?$/.test(file) && !/\.(test|spec)\.jsx?$/.test(file))) {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    const contents = fs.readFileSync(file, 'utf8');
    const fetchCount = (contents.match(/\bfetch\s*\(/g) || []).length;
    const axiosCount = (contents.match(/\baxios\b/g) || []).length;
    const total = fetchCount + axiosCount;
    if (total) counts[relative] = total;
  }
  return counts;
}

const current = scanDirectCalls();
const violations = Object.entries(current).filter(([file, count]) => count > (baseline.files[file] || 0));
const removed = Object.keys(baseline.files).filter(file => !current[file]);
const currentTotal = Object.values(current).reduce((sum, count) => sum + count, 0);
const baselineTotal = Object.values(baseline.files).reduce((sum, count) => sum + count, 0);

if (violations.length) {
  process.stderr.write(`Direct API call budget exceeded (${baselineTotal} baseline; ${currentTotal} current):\n`);
  violations.forEach(([file, count]) => process.stderr.write(`  ${file}: ${count} > ${baseline.files[file] || 0}\n`));
  process.exit(1);
}

process.stdout.write(`Direct API calls: ${currentTotal}/${baselineTotal} across ${Object.keys(current).length} files (baseline ratcheted down by ${removed.length} files).\n`);

module.exports = { scanDirectCalls };
