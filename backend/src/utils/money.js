// Exact money arithmetic for new money code. Amounts are integers of the smallest unit (BigInt, scale 2 by
// default), never JS floats: 0.1 + 0.2 is 30n here. PostgreSQL returns NUMERIC as a string, which parses exactly.
// Inputs with more decimals than the scale are rejected, not silently rounded; use percentOf for computed parts.
const DEFAULT_SCALE = 2;
const pow10 = (n) => 10n ** BigInt(n);

function toMinor(value, scale = DEFAULT_SCALE) {
  if (typeof value === 'bigint') return value * pow10(scale);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Not a decimal amount: ${value}`);
  const text = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`Not a decimal amount: ${JSON.stringify(text)}`);
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  if (fraction.length > scale) throw new Error(`Amount ${text} has more than ${scale} decimal places`);
  const minor = BigInt(whole) * pow10(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
  return negative ? -minor : minor;
}

function format(minor, scale = DEFAULT_SCALE) {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / pow10(scale);
  const fraction = (abs % pow10(scale)).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${whole}${scale ? `.${fraction}` : ''}`;
}

// percent is a decimal string or number with up to 3 decimals ('14', '14.5', 0.125); result rounds half away from zero.
function percentOf(minor, percent) {
  const p = toMinor(percent, 3); // percent in thousandths
  const product = minor * p;
  const divisor = 100n * 1000n;
  const half = divisor / 2n;
  return product >= 0n ? (product + half) / divisor : -((-product + half) / divisor);
}

const sum = (values) => values.reduce((s, v) => s + v, 0n);

module.exports = { toMinor, format, percentOf, sum, DEFAULT_SCALE };
