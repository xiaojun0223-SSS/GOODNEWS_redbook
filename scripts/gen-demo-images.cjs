/**
 * Generate demo placeholder images for the xiaohongshu tool.
 * Creates minimal valid JPEG files so the UI has something to display.
 *
 * Usage: node scripts/gen-demo-images.cjs
 */

const fs = require('fs');
const path = require('path');

function makeJpeg(width, height, r, g, b) {
  const y  = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const cb = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
  const cr = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);

  const qTableY = new Uint8Array([
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
  ]);
  const qTableC = new Uint8Array([
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  ]);

  const dcHuff = {
    codes: [0x00, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0E, 0x1E, 0x3E, 0x7E, 0xFE, 0x1FE],
    sizes: [2, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9],
    vals:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };

  function buildDHT(tableClass, tableId, huff) {
    const counts = new Array(17).fill(0);
    for (const s of huff.sizes) counts[s]++;
    const bits = counts.slice(1);
    const header = Buffer.from([0xFF, 0xC4]);
    const payload = Buffer.concat([Buffer.from([(tableClass << 4) | tableId]), Buffer.from(bits), Buffer.from(huff.vals)]);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([header, len, payload]);
  }

  function buildDQT(id, table) {
    const header = Buffer.from([0xFF, 0xDB]);
    const payload = Buffer.concat([Buffer.from([id]), Buffer.from(table)]);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([header, len, payload]);
  }

  function buildSOF0(w, h) {
    const header = Buffer.from([0xFF, 0xC0]);
    const payload = Buffer.alloc(8 + 3 * 3);
    payload[0] = 8;
    payload.writeUInt16BE(h, 1);
    payload.writeUInt16BE(w, 3);
    payload[5] = 3;
    payload[6] = 1; payload[7] = 0x22; payload[8] = 0;
    payload[9] = 2; payload[10] = 0x11; payload[11] = 1;
    payload[12] = 3; payload[13] = 0x11; payload[14] = 1;
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([header, len, payload]);
  }

  function encodeDC(value, huff) {
    let ssss = 0, absVal = Math.abs(value);
    while (absVal > 0) { ssss++; absVal >>= 1; }
    if (value === 0) ssss = 0;
    const idx = huff.vals.indexOf(ssss);
    const code = huff.codes[idx], size = huff.sizes[idx];
    const bits = [];
    for (let i = size - 1; i >= 0; i--) bits.push((code >> i) & 1);
    if (ssss > 0) {
      let v = value < 0 ? value - 1 : value;
      for (let i = ssss - 1; i >= 0; i--) bits.push((v >> i) & 1);
    }
    return bits;
  }

  let bits = [];
  bits = bits.concat(encodeDC(Math.round(y / qTableY[0]), dcHuff));
  bits = bits.concat(encodeDC(Math.round(cb / qTableC[0]), dcHuff));
  bits = bits.concat(encodeDC(Math.round(cr / qTableC[0]), dcHuff));

  const bytes = [];
  let byte = 0, bitPos = 7;
  for (const b of bits) {
    if (b) byte |= (1 << bitPos);
    bitPos--;
    if (bitPos < 0) {
      if (byte === 0xFF) bytes.push(0xFF, 0x00);
      else bytes.push(byte);
      byte = 0; bitPos = 7;
    }
  }
  if (bitPos < 7) {
    byte |= ((1 << (bitPos + 1)) - 1);
    if (byte === 0xFF) bytes.push(0xFF, 0x00);
    else bytes.push(byte);
  }

  function buildSOS(entropyData) {
    const header = Buffer.from([0xFF, 0xDA]);
    const scanHeader = Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
    const payload = Buffer.concat([scanHeader, Buffer.from(entropyData)]);
    const len = Buffer.alloc(2);
    len.writeUInt16BE(scanHeader.length + 2);
    return Buffer.concat([header, len, payload]);
  }

  const soi = Buffer.from([0xFF, 0xD8]);
  const app0Payload = Buffer.from([
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const app0Len = Buffer.alloc(2);
  app0Len.writeUInt16BE(app0Payload.length + 2);
  const app0 = Buffer.concat([Buffer.from([0xFF, 0xE0]), app0Len, app0Payload]);
  const eoi = Buffer.from([0xFF, 0xD9]);

  const parts = [
    soi, app0,
    buildDQT(0, qTableY), buildDQT(1, qTableC),
    buildSOF0(width, height),
    buildDHT(0, 0, dcHuff), buildDHT(1, 1, dcHuff),
    buildSOS(bytes), eoi,
  ];
  return Buffer.concat(parts);
}

// ---- Generate images ----
const baseDir = path.join(__dirname, '..', 'public', 'images');
fs.mkdirSync(baseDir, { recursive: true });

// Generate 6 demo images with different muted tones (simulating store photos)
const demos = [
  [210, 190, 175], // warm beige
  [180, 195, 190], // sage
  [200, 185, 195], // dusty rose
  [190, 200, 210], // light blue-gray
  [215, 200, 185], // cream
  [195, 190, 180], // warm gray
];

demos.forEach(([r, g, b], i) => {
  fs.writeFileSync(
    path.join(baseDir, `demo${i + 1}.jpg`),
    makeJpeg(800, 800, r, g, b)
  );
  console.log(`✓ demo${i + 1}.jpg`);
});

console.log('\nDemo images created! Replace them with your actual store photos.');
console.log('Drag & drop your photos into: public/images/');
