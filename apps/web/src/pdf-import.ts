export interface PdfTextItem {
  str?: string;
  transform?: ArrayLike<number>;
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PositionedItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

export async function extractPdfText(file: File): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(formatPdfTextItems(content.items as PdfTextItem[], page.getViewport({ scale: 1 }).width));
  }
  return pages.join("\n\n");
}

export function formatPdfTextItems(items: PdfTextItem[], suppliedPageWidth?: number): string {
  const positioned = items.flatMap<PositionedItem>((item, index) => {
    if (typeof item.str !== "string" || !item.str.trim()) return [];
    const x = Number(item.transform?.[4]);
    const y = Number(item.transform?.[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [{
      text: item.str.trim(),
      x,
      y,
      width: Math.max(0, Number(item.width) || 0),
      height: Math.abs(Number(item.height) || Number(item.transform?.[3]) || 0),
      index,
    }];
  });

  if (positioned.length < items.length * 0.8) return formatSequentialItems(items);
  const split = findMainColumnSplit(positioned, suppliedPageWidth);
  const regions = split
    ? [positioned.filter((item) => item.x + item.width / 2 < split), positioned.filter((item) => item.x + item.width / 2 >= split)]
    : [positioned];
  return regions.map(formatPositionedItems).filter(Boolean).join("\n\n");
}

function findMainColumnSplit(items: PositionedItem[], suppliedPageWidth?: number): number | null {
  const pageWidth = Number.isFinite(suppliedPageWidth)
    ? suppliedPageWidth!
    : Math.max(...items.map((item) => item.x + item.width));
  const totalWeight = items.reduce((sum, item) => sum + item.text.length, 0);
  let best: { split: number; score: number } | undefined;
  for (let split = pageWidth * 0.2; split <= pageWidth * 0.48; split += 4) {
    let left = 0;
    let right = 0;
    let crossing = 0;
    for (const item of items) {
      const weight = item.text.length;
      if (item.x < split - 2 && item.x + item.width > split + 2) crossing += weight;
      if (item.x + item.width / 2 < split) left += weight;
      else right += weight;
    }
    if (left < totalWeight * 0.12 || right < totalWeight * 0.12) continue;
    const score = crossing / totalWeight;
    if (!best || score < best.score) best = { split, score };
  }
  return best && best.score <= 0.03 ? best.split : null;
}

function formatPositionedItems(items: PositionedItem[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x || a.index - b.index);
  const rows: Array<{ y: number; height: number; items: PositionedItem[] }> = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    const tolerance = Math.max(1.5, Math.min(item.height || row?.height || 0, row?.height || item.height || 0) * 0.35);
    if (!row || Math.abs(row.y - item.y) > tolerance) rows.push({ y: item.y, height: item.height, items: [item] });
    else {
      row.items.push(item);
      row.height = Math.max(row.height, item.height);
    }
  }

  const lines: string[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const fragments: string[][] = [];
    let fragment: string[] = [];
    let previous: PositionedItem | undefined;
    for (const item of row.items.sort((a, b) => a.x - b.x || a.index - b.index)) {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (fragment.length && previous && gap > Math.max(18, Math.max(item.height, previous.height) * 2.2)) {
        fragments.push(fragment);
        fragment = [];
      }
      fragment.push(item.text);
      previous = item;
    }
    if (fragment.length) fragments.push(fragment);
    lines.push(...fragments.map(cleanLine));
    const nextRow = rows[rowIndex + 1];
    if (nextRow && row.y - nextRow.y > Math.max(8, Math.max(row.height, nextRow.height) * 2.5)) lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatSequentialItems(items: PdfTextItem[]): string {
  const lines: string[] = [];
  let line: string[] = [];
  let lastY: number | undefined;
  let lastHeight = 0;
  const finishLine = (blankAfter = false) => {
    const text = line.join(" ").replace(/\s+([,.;:!?])/g, "$1").trim();
    if (text) lines.push(text);
    if (blankAfter && lines.at(-1) !== "") lines.push("");
    line = [];
  };

  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const y = Number(item.transform?.[5]);
    const height = Math.abs(Number(item.height) || Number(item.transform?.[3]) || 0);
    const yDifference = Number.isFinite(y) && Number.isFinite(lastY) ? Math.abs(y - lastY!) : 0;
    const lineThreshold = Math.max(1.5, Math.min(height || lastHeight, lastHeight || height) * 0.35);
    const isBlockGap = yDifference > Math.max(8, Math.max(height, lastHeight) * 2.5);
    if (line.length && yDifference > lineThreshold) finishLine(isBlockGap);
    else if (!line.length && isBlockGap && lines.length && lines.at(-1) !== "") lines.push("");
    const text = item.str.trim();
    if (text) line.push(text);
    if (item.hasEOL) finishLine();
    if (Number.isFinite(y)) lastY = y;
    if (height) lastHeight = height;
  }
  finishLine();
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanLine(parts: string[]): string {
  return parts.join(" ").replace(/\s+([,.;:!?])/g, "$1").trim();
}
