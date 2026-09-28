'use strict';
// Cheap, local safety check for large new subjects. It does not call another AI model.
function detectLargeNewSubject(original, generated, width, height) {
  if (width < 64 || height < 64) return false;
  const n = width * height;
  function edgeMask(data) {
    const gray = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) gray[i] = (77 * data[p] + 150 * data[p + 1] + 29 * data[p + 2]) >> 8;
    const tmp = new Uint16Array(n), smooth = new Uint8Array(n);
    for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      tmp[i] = (gray[i - 2] + 4 * gray[i - 1] + 6 * gray[i] + 4 * gray[i + 1] + gray[i + 2]) >> 4;
    }
    for (let y = 4; y < height - 4; y++) for (let x = 4; x < width - 4; x++) {
      const i = y * width + x;
      smooth[i] = (tmp[i - 2 * width] + 4 * tmp[i - width] + 6 * tmp[i] + 4 * tmp[i + width] + tmp[i + 2 * width]) >> 4;
    }
    const edges = new Uint8Array(n);
    for (let y = 5; y < height - 5; y++) for (let x = 5; x < width - 5; x++) {
      const i = y * width + x;
      edges[i] = Math.abs(smooth[i + 1] - smooth[i - 1]) + Math.abs(smooth[i + width] - smooth[i - width]) > 34 ? 1 : 0;
    }
    return edges;
  }
  const oldEdges = edgeMask(original), newEdges = edgeMask(generated);
  const added = new Uint8Array(n);
  for (let y = 8; y < height - 8; y++) for (let x = 8; x < width - 8; x++) {
    const i = y * width + x;
    if (!newEdges[i]) continue;
    let nearby = false;
    for (let dy = -3; dy <= 3 && !nearby; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (oldEdges[i + dy * width + dx]) { nearby = true; break; }
    }
    if (!nearby) added[i] = 1;
  }
  // A 64 px region with many new edges and few original edges suggests a new object.
  for (let y = 0; y + 64 <= height; y += 32) for (let x = 0; x + 64 <= width; x += 32) {
    let newCount = 0, oldCount = 0;
    for (let yy = y; yy < y + 64; yy++) for (let xx = x; xx < x + 64; xx++) {
      const i = yy * width + xx;
      newCount += added[i]; oldCount += oldEdges[i];
    }
    if (newCount >= 500 && newCount > oldCount * 1.8) return true;
  }
  return false;
}
if (typeof module !== 'undefined') module.exports = { detectLargeNewSubject };

