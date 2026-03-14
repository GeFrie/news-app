import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'isPdf',
  standalone: true // Wichtig für moderne Angular-Apps
})
export class IsPdfPipe implements PipeTransform {

  transform(value: string | null | undefined): boolean {
    if (!value || typeof value !== 'string') return false;

    const val = value.toLowerCase();

    // Prüft auf .pdf Endung oder den Blob-Typ
    return val.endsWith('.pdf') || val.startsWith('blob:') && val.includes('pdf');
  }
}