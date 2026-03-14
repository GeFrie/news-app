import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'isImage',
  standalone: true
})
export class IsImagePipe implements PipeTransform {

  transform(value: any): boolean {
  
    if (!value || typeof value !== 'string') return false;
  
    const val = value.toLowerCase();
  
    // Erkennt normale Dateien UND Browser-Vorschau-Blobs
  return val.endsWith('.jpg') || val.endsWith('.jpeg') || 
         val.endsWith('.png') || val.endsWith('.webp') || 
         val.startsWith('data:image') || // Falls Base64
         val.startsWith('blob:'); 
  }
}