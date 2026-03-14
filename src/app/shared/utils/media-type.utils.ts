export type MediaType = 'pdf' | 'image' | 'color';

export function detectMediaType(hintergrund: string | null | undefined): MediaType {
  if (!hintergrund) return 'image';
  const val = hintergrund.toLowerCase();
  
  if (val.startsWith('#') || val.startsWith('rgb') || val.startsWith('hsl')) {
    return 'color';
  }
  if (val.endsWith('.pdf') || (val.startsWith('blob:') && val.includes('pdf'))) {
    return 'pdf';
  }
  return 'image';
}