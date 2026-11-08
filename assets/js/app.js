/* =====================================================================
   ENTRY-SHEET SCANNING — rewrite
   Reads: Member ID, Ring Number, Barcode Number (other columns ignored)

   HOW TO INSTALL IN script.js
   ---------------------------------------------------------------------
   1. DELETE these three functions:
        documentGridRules
        entrySheetRowsFromOCR
        scanSheetBarcodes
   2. PASTE everything below in their place.
   3. KEEP these existing functions (this file relies on them):
        documentFileToCanvas, rotateDocumentCanvas, barcodeGraphicPresent,
        handwritingOCRBatch, refineHandwrittenEntryFields,
        loadDocumentOCR, loadDocumentBarcodeReader
   4. In mountEntrySheetImport → validateRows, replace the member lookup:
        row.member=members.find(...)||members.find(...)||null;
      with:
        row.member=findMemberByCode(members,memberCode);
   5. In mountEntrySheetImport → readButton.onclick, replace everything
      from `const rotated=...` down to (and including) the second
      `redrawRows();status.textContent=...await validateRows();...` with:

        const rotated=rotateDocumentCanvas(sourceCanvas,rotation);
        rows=await scanEntrySheet(worker,rotated,members,text=>{status.textContent=text;});
        if(!rows.length){status.textContent='No rows were detected. Rotate the document or use a clearer scan, then try again.';review.hidden=true;return;}
        redrawRows();
        status.textContent=`Scanned ${rows.length} item${rows.length===1?'':'s'}. Red rows show the errors to fix; review the OCR values before saving.`;
        await validateRows();review.scrollIntoView({behavior:'smooth',block:'start'});
   ===================================================================== */

/* ---------- Layout constants ---------- */

// Expected column boundaries as a fraction of table width:
// No. | Member ID | Ring Number | Skip/notes | Barcode Number
const SHEET_COLUMN_RATIOS = [0, 0.10, 0.355, 0.54, 0.726, 1];
const COL = { number: 0, member: 1, ring: 2, notes: 3, barcode: 4 };

/* ---------- Image helpers ---------- */

// Picks a dark/light cut-off for this particular photo (Otsu), so shadows
// and dim lighting don't ruin line detection.
function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, weightB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightB += histogram[t];
    if (!weightB) continue;
    const weightF = total - weightB;
    if (!weightF) break;
    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

function canvasToDarkMap(canvas) {
  const { width, height } = canvas;
  const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const g = Math.round(rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114);
    gray[i] = g;
    histogram[g]++;
  }
  const cutoff = Math.min(170, Math.max(90, otsuThreshold(histogram, gray.length)));
  const dark = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) dark[i] = gray[i] < cutoff ? 1 : 0;
  return dark;
}

// Stretches contrast so faint/grey stickers decode more reliably.
function enhanceContrast(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    data[i] = g;
    histogram[g]++;
  }
  const total = canvas.width * canvas.height;
  let low = 0, high = 255, running = 0;
  for (let v = 0; v < 256; v++) { running += histogram[v]; if (running >= total * 0.02) { low = v; break; } }
  running = 0;
  for (let v = 255; v >= 0; v--) { running += histogram[v]; if (running >= total * 0.02) { high = v; break; } }
  const range = Math.max(1, high - low);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((data[i] - low) * 255) / range));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

/* ---------- Table grid detection ---------- */

// Measures the longest unbroken dark run in every pixel column and row.
// Real table borders run almost the full height/width; barcode bars only
// span one cell, so they never qualify as table lines.
function measureRuns(dark, width, height, gapTolerance = 3) {
  const vBest = new Uint16Array(width), vRun = new Uint16Array(width), vGap = new Uint16Array(width);
  const hBest = new Uint16Array(height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let hRun = 0, hGap = 0;
    for (let x = 0; x < width; x++) {
      if (dark[rowStart + x]) {
        vRun[x]++; vGap[x] = 0;
        if (vRun[x] > vBest[x]) vBest[x] = vRun[x];
        hRun++; hGap = 0;
        if (hRun > hBest[y]) hBest[y] = hRun;
      } else {
        if (++vGap[x] > gapTolerance) vRun[x] = 0;
        if (++hGap > gapTolerance) hRun = 0;
      }
    }
  }
  return { vBest, hBest };
}

// Groups neighbouring pixels above `threshold` into single lines.
function clusterLines(best, threshold, maxThickness) {
  const lines = [];
  let start = -1;
  for (let i = 0; i <= best.length; i++) {
    const hit = i < best.length && best[i] >= threshold;
    if (hit && start < 0) start = i;
    if (!hit && start >= 0) {
      const thickness = i - start;
      if (thickness <= maxThickness) {
        lines.push({ position: Math.round((start + i - 1) / 2), thickness });
      }
      start = -1;
    }
  }
  return lines;
}

function documentGridRules(canvas, { minCoverage = 0.35 } = {}) {
  const { width, height } = canvas;
  const dark = canvasToDarkMap(canvas);
  const { vBest, hBest } = measureRuns(dark, width, height);
  let vMax = 0, hMax = 0;
  for (const v of vBest) if (v > vMax) vMax = v;
  for (const v of hBest) if (v > hMax) hMax = v;
  // A line must cover a good part of the page AND be close to the longest line found.
  const vThreshold = Math.max(height * minCoverage, vMax * 0.6);
  const hThreshold = Math.max(width * minCoverage, hMax * 0.6);
  return {
    vertical: clusterLines(vBest, vThreshold, Math.max(8, width * 0.02)),
    horizontal: clusterLines(hBest, hThreshold, Math.max(8, height * 0.02))
  };
}

// Paints detected grid lines white on a copy, so OCR isn't confused by borders.
function eraseGridLines(canvas, grid) {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d', { willReadFrequently: true });
  context.drawImage(canvas, 0, 0);
  context.fillStyle = '#fff';
  for (const line of grid.vertical) {
    const pad = Math.ceil(line.thickness / 2) + 2;
    context.fillRect(line.position - pad, 0, pad * 2 + 1, copy.height);
  }
  for (const line of grid.horizontal) {
    const pad = Math.ceil(line.thickness / 2) + 2;
    context.fillRect(0, line.position - pad, copy.width, pad * 2 + 1);
  }
  return copy;
}

// Turns detected vertical lines into exactly 6 column boundaries
// (5 columns), falling back to the expected layout when detection is off.
function fitSheetColumns(positions, width) {
  const fallback = SHEET_COLUMN_RATIOS.map(ratio => Math.round(width * ratio));
  let lines = [...positions].sort((a, b) => a - b);
  const expected = SHEET_COLUMN_RATIOS.length;

  if (lines.length > expected) {
    // Extra candidates: keep the one nearest each expected boundary.
    const picked = SHEET_COLUMN_RATIOS.map(ratio => {
      const target = ratio * width;
      return lines.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    });
    const unique = new Set(picked).size === expected;
    const close = picked.every((p, i) => Math.abs(p - SHEET_COLUMN_RATIOS[i] * width) < width * 0.08);
    lines = unique && close ? picked : [];
  } else if (lines.length === expected - 2) {
    lines = [0, ...lines, width];          // only inner lines found
  } else if (lines.length === expected - 1) {
    lines = lines[0] > width * 0.05 ? [0, ...lines] : [...lines, width]; // one edge missing
  }

  if (lines.length !== expected) return fallback;
  const sane = lines.every((p, i) => i === 0 || p - lines[i - 1] >= width * 0.02);
  return sane ? lines : fallback;
}

/* ---------- OCR → rows ---------- */

// Splits the page into horizontal bands, one per table row.
function buildRowBands(ocrData, allWords, grid, columns, canvas) {
  const centerY = word => (word.bbox.y0 + word.bbox.y1) / 2;

  if (grid.horizontal.length >= 2) {
    const edges = [0, ...grid.horizontal.map(line => line.position), canvas.height];
    const bands = [];
    for (let i = 1; i < edges.length; i++) {
      const top = edges[i - 1], bottom = edges[i];
      if (bottom - top < 12) continue;
      const words = allWords.filter(word => centerY(word) >= top && centerY(word) < bottom);
      const barcodeGraphic = barcodeGraphicPresent(canvas, columns[COL.barcode], columns[COL.barcode + 1], top, bottom);
      if (words.length || barcodeGraphic) bands.push({ words, top, bottom, barcodeGraphic });
    }
    if (bands.length) return bands;
  }

  // No usable horizontal lines: one band per OCR text line.
  const lines = (ocrData.lines || [])
    .filter(line => line.words?.length)
    .map(line => ({ words: line.words, center: (line.bbox.y0 + line.bbox.y1) / 2 }))
    .sort((a, b) => a.center - b.center);
  return lines.map((line, i) => {
    const previous = lines[i - 1], next = lines[i + 1];
    const top = previous ? (previous.center + line.center) / 2 : Math.max(0, line.center - (next ? (next.center - line.center) / 2 : 40));
    const bottom = next ? (line.center + next.center) / 2 : Math.min(canvas.height, line.center + (previous ? (line.center - previous.center) / 2 : 40));
    return { words: line.words, top, bottom, barcodeGraphic: false };
  });
}

function entrySheetRowsFromOCR(ocrData, canvas, grid = documentGridRules(canvas)) {
  const columns = fitSheetColumns(grid.vertical.map(line => line.position), canvas.width);
  const allWords = ocrData.words?.length ? ocrData.words : (ocrData.lines || []).flatMap(line => line.words || []);
  const bands = buildRowBands(ocrData, allWords, grid, columns, canvas);

  const wordsInColumn = (words, index) => words
    .filter(word => {
      const x = (word.bbox.x0 + word.bbox.x1) / 2;
      return x >= columns[index] && x < columns[index + 1];
    })
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const textOf = words => words.map(word => String(word.text || '').trim()).filter(Boolean);
  const confidenceOf = words => words.length
    ? words.reduce((sum, word) => sum + (Number(word.confidence) || 0), 0) / words.length
    : 0;

  const rows = [];
  for (const band of bands) {
    const cells = Array.from({ length: 5 }, (_, i) => wordsInColumn(band.words, i));
    const text = cells.map(textOf);
    if (!text.some(cell => cell.length) && !band.barcodeGraphic) continue;

    // Skip the heading row ("Member ID / Ring Number / Barcode Number").
    const joined = text.flat().join(' ').toLowerCase();
    const headingHits = ['member', 'ring', 'barcode'].filter(word => joined.includes(word)).length;
    if (headingHits >= 2 && !/\d/.test(text[COL.number].join(' '))) continue;

    const barcodeDigits = (text[COL.barcode].join(' ').match(/\d+/g) || []).sort((a, b) => b.length - a.length)[0] || '';
    const printedNumber = barcodeDigits.length >= 6 ? barcodeDigits : '';
    const region = column => ({ left: columns[column], right: columns[column + 1], top: band.top, bottom: band.bottom });

    rows.push({
      id: `sheet-${Date.now()}-${rows.length}-${Math.random().toString(36).slice(2, 7)}`,
      sheetRow: text[COL.number].join(' ').match(/\d{1,4}/)?.[0] || String(rows.length + 1),
      member_no: text[COL.member].join(' ').trim(),
      memberConfidence: confidenceOf(cells[COL.member]),
      pigeon_ring: text[COL.ring].join('').replace(/\s+/g, '').trim(),
      ringConfidence: confidenceOf(cells[COL.ring]),
      barcode: printedNumber,          // fallback: the number printed under the bars
      barcodeOcr: printedNumber,
      barcodeDetected: false,
      barcodeScanError: '',
      memberRegion: region(COL.member),
      ringRegion: region(COL.ring),
      barcodeRegion: region(COL.barcode),
      errors: [],
      member: null,
      saved: false
    });
  }
  return rows;
}

/* ---------- Member ID helpers ---------- */

// "001" should match "1" when the match is unambiguous.
function findMemberByCode(members, code) {
  const text = String(code || '').trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  const exact = members.find(member => String(member.member_no).trim().toUpperCase() === upper);
  if (exact) return exact;
  if (/^\d+$/.test(text)) {
    const strip = value => String(value).trim().replace(/^0+/, '') || '0';
    const loose = members.filter(member => /^\d+$/.test(String(member.member_no).trim()) && strip(member.member_no) === strip(text));
    if (loose.length === 1) return loose[0];
  }
  return members.find(member => String(member.id) === text) || null;
}

// If every member number in the club is digits-only, fix common OCR
// look-alikes in handwritten IDs (O→0, I→1, S→5, B→8 ...).
function repairMemberIds(rows, members) {
  if (!members.length || !members.every(member => /^\d+$/.test(String(member.member_no).trim()))) return;
  const lookalikes = { O: '0', o: '0', Q: '0', D: '0', I: '1', l: '1', '|': '1', S: '5', s: '5', B: '8', Z: '2', z: '2' };
  for (const row of rows) {
    const cleaned = String(row.member_no || '').trim().replace(/[OoQDIl|SsBZz]/g, char => lookalikes[char]);
    if (/^\d+$/.test(cleaned)) row.member_no = cleaned;
  }
}

/* ---------- Barcode decoding ---------- */

function cropBarcodeRegion(source, region, inset = 4) {
  if (!region) return null;
  const left = Math.max(0, Math.floor(region.left) + inset);
  const top = Math.max(0, Math.floor(region.top) + inset);
  const right = Math.min(source.width, Math.ceil(region.right) - inset);
  const bottom = Math.min(source.height, Math.ceil(region.bottom) - inset);
  const width = right - left, height = bottom - top;
  if (width < 8 || height < 8) return null;
  const scale = Math.min(3, Math.max(1, 900 / width));
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(width * scale));
  crop.height = Math.max(1, Math.round(height * scale));
  crop.getContext('2d').drawImage(source, left, top, width, height, 0, 0, crop.width, crop.height);
  return crop;
}

// Tries the raw crop first, then a contrast-enhanced copy, at 4 rotations.
function decodeBarcodeCanvas(reader, canvas) {
  for (const variant of [canvas, enhanceContrast(canvas)]) {
    for (const angle of [0, 180, 90, 270]) {
      try {
        const result = reader.decodeFromCanvas(angle ? rotateDocumentCanvas(variant, angle) : variant);
        const value = result?.getText?.().trim().replace(/\s+/g, '');
        if (value) return value;
      } catch { /* try the next variant */ }
      finally { reader.reset?.(); }
    }
  }
  return '';
}

async function scanSheetBarcodes(source, rows, reader, onProgress = () => {}) {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const crop = cropBarcodeRegion(source, row.barcodeRegion);
    const value = crop ? decodeBarcodeCanvas(reader, crop) : '';

    if (value) {
      // Decoded bars beat the OCR'd printed number.
      row.barcode = value;
      row.barcodeDetected = true;
      row.barcodeScanError = '';
    } else if (/^\d{6,}$/.test(String(row.barcode || '').trim())) {
      // Bars failed but the printed number was read: keep it.
      // The sticker-registry check still catches a misread.
      row.barcodeDetected = false;
      row.barcodeScanError = '';
    } else {
      row.barcodeDetected = false;
      row.barcodeScanError = crop
        ? 'Barcode image was not detected. Type or correct the barcode.'
        : 'Barcode area could not be located. Enter or correct the barcode manually.';
    }
    onProgress(index + 1, rows.length);
    await new Promise(resolve => setTimeout(resolve)); // keep the page responsive
  }
  return rows;
}

/* ---------- Full pipeline ---------- */

async function scanEntrySheet(worker, source, members, onStatus = () => {}) {
  onStatus('Finding the table lines…');
  const grid = documentGridRules(source);
  const cleaned = eraseGridLines(source, grid);

  onStatus('Reading text…');
  const { data } = await worker.recognize(cleaned);
  const rows = entrySheetRowsFromOCR(data, source, grid);
  if (!rows.length) return rows;

  onStatus(`Detected ${rows.length} item${rows.length === 1 ? '' : 's'}. Checking handwritten IDs and ring numbers…`);
  try {
    await refineHandwrittenEntryFields(worker, cleaned, rows, members, (field, current, total) => {
      onStatus(`Reading ${field.toLowerCase()}… ${current} of ${total}`);
    });
  } catch (error) {
    console.warn('Handwriting OCR refinement failed:', error);
  }
  repairMemberIds(rows, members);

  onStatus('Scanning each barcode…');
  try {
    const reader = await loadDocumentBarcodeReader();
    await scanSheetBarcodes(source, rows, reader, (current, total) => {
      onStatus(`Scanning barcode images… ${current} of ${total}`);
    });
  } catch (error) {
    console.warn('Race-sheet barcode decoding is unavailable:', error);
    for (const row of rows) {
      row.barcodeDetected = false;
      row.barcodeScanError = /^\d{6,}$/.test(String(row.barcode || '').trim())
        ? ''
        : 'Barcode scanner could not load. Type or confirm this barcode manually.';
    }
  }
  return rows;
}
