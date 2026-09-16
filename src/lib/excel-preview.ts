export type ExcelPreviewSheet = {
  name: string;
  startRow: number;
  startColumn: number;
  rowCount: number;
  columnCount: number;
  cells: Record<string, string>;
};

type ExcelCell = { v?: unknown; w?: unknown; f?: unknown };
type ExcelRange = { s?: { r?: number; c?: number }; e?: { r?: number; c?: number } };
type ExcelSheetSource = Record<string, ExcelCell | ExcelRange[] | unknown>;
type ExcelWorkbookSource = { SheetNames: string[]; Sheets: Record<string, ExcelSheetSource | undefined> };
type ExcelUtils = { decode_cell(address: string): { r: number; c: number } };

function cellValue(cell: ExcelCell): string {
  if (typeof cell.w === 'string') return cell.w;
  if (cell.v === null || cell.v === undefined) return typeof cell.f === 'string' ? `=${cell.f}` : '';
  return String(cell.v);
}

function expandRange(bounds: { minRow: number; minColumn: number; maxRow: number; maxColumn: number }, merge: ExcelRange) {
  const startRow = merge.s?.r;
  const startColumn = merge.s?.c;
  const endRow = merge.e?.r;
  const endColumn = merge.e?.c;
  if ([startRow, startColumn, endRow, endColumn].some((value) => typeof value !== 'number')) return;
  if (endRow! < bounds.minRow || startRow! > bounds.maxRow || endColumn! < bounds.minColumn || startColumn! > bounds.maxColumn) return;
  bounds.minRow = Math.min(bounds.minRow, startRow!);
  bounds.minColumn = Math.min(bounds.minColumn, startColumn!);
  bounds.maxRow = Math.max(bounds.maxRow, endRow!);
  bounds.maxColumn = Math.max(bounds.maxColumn, endColumn!);
}

export function workbookToPreviewSheets(workbook: ExcelWorkbookSource, utils: ExcelUtils): ExcelPreviewSheet[] {
  return workbook.SheetNames.map((name) => {
    const source = workbook.Sheets[name] || {};
    const cells: Record<string, string> = {};
    const bounds = { minRow: Infinity, minColumn: Infinity, maxRow: -1, maxColumn: -1 };

    Object.entries(source).forEach(([address, item]) => {
      if (address.startsWith('!') || !item || Array.isArray(item) || typeof item !== 'object') return;
      const cell = item as ExcelCell;
      const value = cellValue(cell);
      if (!value) return;
      const { r, c } = utils.decode_cell(address);
      cells[`${r}:${c}`] = value;
      bounds.minRow = Math.min(bounds.minRow, r);
      bounds.minColumn = Math.min(bounds.minColumn, c);
      bounds.maxRow = Math.max(bounds.maxRow, r);
      bounds.maxColumn = Math.max(bounds.maxColumn, c);
    });

    if (bounds.maxRow < 0) {
      return { name, startRow: 0, startColumn: 0, rowCount: 0, columnCount: 0, cells };
    }

    const merges = source['!merges'];
    if (Array.isArray(merges)) merges.forEach((merge) => expandRange(bounds, merge as ExcelRange));
    return {
      name,
      startRow: bounds.minRow,
      startColumn: bounds.minColumn,
      rowCount: bounds.maxRow - bounds.minRow + 1,
      columnCount: bounds.maxColumn - bounds.minColumn + 1,
      cells,
    };
  });
}
