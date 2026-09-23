const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'ui');

function recolor(hex) {
  const raw = hex.slice(1);
  const rgb = [0, 2, 4].map(index => parseInt(raw.slice(index, index + 2), 16) / 255);
  const maximum = Math.max(...rgb), minimum = Math.min(...rgb), delta = maximum - minimum;
  if (delta === 0) return hex;
  let hue = maximum === rgb[0] ? ((rgb[1] - rgb[2]) / delta) % 6 : maximum === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const lightness = (maximum + minimum) / 2;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  if (hue < 295 || hue > 355 || saturation < .23 || lightness < .09) return hex;
  const target = 266 + (hue - 295) * .15;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((target / 60) % 2 - 1));
  const offset = lightness - chroma / 2;
  const [r, g, b] = target < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const output = [r, g, b].map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('');
  return '#' + output + raw.slice(6);
}

for (const file of fs.readdirSync(root).filter(name => name.endsWith('.css') || name === 'uniplay.svg')) {
  const location = path.join(root, file);
  const before = fs.readFileSync(location, 'utf8');
  const after = before.replace(/#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g, recolor).replaceAll('--pink', '--accent');
  if (after !== before) fs.writeFileSync(location, after);
}
