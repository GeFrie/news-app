import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../environments/environment';

@Pipe({
  name: 'imageUrl',
  standalone: true
})

export class ImageUrlPipe implements PipeTransform {

  private readonly baseUrl = environment.httpPath;
  private readonly imageDir = environment.imgageDir;
  private readonly fallback = 'assets/images/placeholder.jpg';

  transform(value: string | null | undefined): string {
    // 1. Wenn gar kein Wert da ist -> Fallback
    if (!value || value.trim() === '') {
      return this.fallback;
    }

    // 2. Wenn es bereits eine vollständige URL (http) oder Base64 (data:) ist -> direkt zurückgeben
    if (!value || value.startsWith('http') || value.startsWith('data:') || value.startsWith('blob:')) {
      return value || '';
    }

    // Pfad sauber zusammenfügen (Slash-Check)
    const sepUrl = this.baseUrl.endsWith('/') ? '' : '/';
    const sepDir = this.imageDir.endsWith('/') ? '' : '/';
    return `${this.baseUrl}${sepUrl}${this.imageDir}${sepDir}${value}`;
  }
}
