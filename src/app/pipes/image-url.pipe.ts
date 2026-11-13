import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../environments/environment';

@Pipe({
  name: 'imageUrl',
  standalone: true
})

export class ImageUrlPipe implements PipeTransform {

  private readonly baseUrl = environment.httpPath;
  private readonly imageDir = environment.imageDir;
  private readonly fallback = 'assets/images/placeholder.png';

  transform(value: string | null | undefined): string {
    // 1. Wenn gar kein Wert da ist -> Fallback
    if (!value || value.trim() === '') {
      return this.fallback;
    }

    // 2. Wenn es bereits eine vollständige URL (http) oder Base64 (data:) ist -> direkt zurückgeben
    if (
      !value ||
      value.startsWith('http') ||
      value.startsWith('data:') ||
      value.startsWith('blob:') ||
      value.startsWith('assets') ||
      value.startsWith('/')
    ) {
      return value || '';
    }

    // Pfad sauber zusammenfügen (Slash-Check)
    const sepUrl = this.baseUrl.endsWith('/') ? '' : '/';
    const sepDir = this.imageDir.endsWith('/') ? '' : '/';
    return `${this.baseUrl}${sepUrl}${this.imageDir}${sepDir}${value}`;
  }
}
