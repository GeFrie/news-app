import { ImageBoxItem } from "../../interfaces/item";

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

export function parseImageBoxes(rawImageBox: any, fallbackSrc?: string): ImageBoxItem[] {
  const cleanFallback = fallbackSrc && fallbackSrc !== 'null' ? fallbackSrc.trim() : '';

  if (!rawImageBox || rawImageBox === 'null' || rawImageBox === 'undefined') {
    return cleanFallback
      ? [{ id: 'img_0', src: cleanFallback, left: 0, top: 0, width: 100, height: 100, opacity: 1, zIndex: 1 }]
      : [];
  }

  let parsed = rawImageBox;
  if (typeof rawImageBox === 'string') {
    try {
      parsed = JSON.parse(rawImageBox);
    } catch {
      return cleanFallback
        ? [{ id: 'img_0', src: cleanFallback, left: 0, top: 0, width: 100, height: 100, opacity: 1, zIndex: 1 }]
        : [];
    }
  }

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === 'object') {
    return [{
      id: 'img_0',
      src: parsed.src || cleanFallback,
      left: parsed.left ?? 0,
      top: parsed.top ?? 0,
      width: parsed.width ?? 100,
      height: parsed.height ?? 100,
      opacity: parsed.opacity ?? 1,
      zIndex: parsed.zIndex ?? 1
    }];
  }

  return [];
}
