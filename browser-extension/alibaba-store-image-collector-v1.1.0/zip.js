function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1)); }
  return (value ^ 0xffffffff) >>> 0;
}
function u16(value) { return [value & 255, (value >>> 8) & 255]; }
function u32(value) { return [...u16(value), ...u16(value >>> 16)]; }
function dateParts(date) { return { time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2), date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate() }; }

async function createZip(entries) {
  const encoder = new TextEncoder(); const chunks = []; const directory = []; let offset = 0; const now = dateParts(new Date());
  for (const entry of entries) {
    const name = encoder.encode(entry.name); const data = new Uint8Array(await entry.blob.arrayBuffer()); const crc = crc32(data);
    const local = new Uint8Array([0x50,0x4b,0x03,0x04,20,0,0,0,0,0,...u16(now.time),...u16(now.date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,...name]);
    chunks.push(local, data); directory.push({ name, crc, size: data.length, offset }); offset += local.length + data.length;
  }
  const directoryOffset = offset;
  for (const entry of directory) {
    const record = new Uint8Array([0x50,0x4b,0x01,0x02,20,0,20,0,0,0,0,0,...u16(now.time),...u16(now.date),...u32(entry.crc),...u32(entry.size),...u32(entry.size),...u16(entry.name.length),0,0,0,0,0,0,0,0,0,0,...u32(entry.offset),...entry.name]);
    chunks.push(record); offset += record.length;
  }
  chunks.push(new Uint8Array([0x50,0x4b,0x05,0x06,0,0,0,0,...u16(directory.length),...u16(directory.length),...u32(offset - directoryOffset),...u32(directoryOffset),0,0]));
  return new Blob(chunks, { type: 'application/zip' });
}