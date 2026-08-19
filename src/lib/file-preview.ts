export type PreviewKind = 'image' | 'pdf' | 'word' | 'excel' | 'unsupported';

function hasExtension(source: string, extensions: readonly string[]) {
  const cleanSource = source.toLowerCase().split(/[?#]/, 1)[0];
  return extensions.some((extension) => cleanSource.endsWith(extension));
}

export function previewKind(fileName: string | null | undefined, url: string): PreviewKind {
  const sources = [fileName || '', url];
  if (sources.some((source) => hasExtension(source, ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']))) {
    return 'image';
  }
  if (sources.some((source) => hasExtension(source, ['.pdf']))) return 'pdf';
  if (sources.some((source) => hasExtension(source, ['.docx']))) return 'word';
  if (sources.some((source) => hasExtension(source, ['.xlsx', '.xls']))) return 'excel';
  return 'unsupported';
}
