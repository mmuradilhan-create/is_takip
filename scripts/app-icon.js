import { deflateSync } from "node:zlib";

// Render the existing teal/check favicon for Windows shortcuts.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, checksum]);
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function roundedBox(x, y, cx, cy, halfWidth, halfHeight, radius) {
  return Math.hypot(Math.max(0, Math.abs(x - cx) - halfWidth + radius), Math.max(0, Math.abs(y - cy) - halfHeight + radius)) <= radius;
}

export function createAppIconPng(size = 256, widget = false) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const samples = 4;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let covered = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((column + (sx + 0.5) / samples) * 40) / size;
          const y = ((row + (sy + 0.5) / samples) * 40) / size;
          const badge = widget && roundedBox(x, y, 31, 30.5, 7, 6.5, 3);
          if (!roundedBox(x, y, 20, 20, 20, 20, 12) && !badge) continue;
          const check = Math.min(segmentDistance(x, y, 11, 21, 17, 27), segmentDistance(x, y, 17, 27, 30, 13)) <= 1.5;
          let color = check ? [255, 255, 255] : [23, 77, 67];
          if (badge) {
            const inside = roundedBox(x, y, 31, 30.5, 6, 5.5, 2);
            const bar = segmentDistance(x, y, 27, 28, 35, 28) <= 0.75;
            color = inside && !bar ? [215, 231, 206] : [23, 77, 67];
          }
          covered++;
          red += color[0];
          green += color[1];
          blue += color[2];
        }
      }
      if (!covered) continue;
      const offset = row * (size * 4 + 1) + 1 + column * 4;
      rows[offset] = Math.round(red / covered);
      rows[offset + 1] = Math.round(green / covered);
      rows[offset + 2] = Math.round(blue / covered);
      rows[offset + 3] = Math.round((covered * 255) / (samples * samples));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function createWindowsIcon(widget = false) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => createAppIconPng(size, widget));
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    directory[entry] = size === 256 ? 0 : size;
    directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(images[index].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  return Buffer.concat([directory, ...images]);
}
