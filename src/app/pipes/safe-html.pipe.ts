import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'safeHtml',
  standalone: true // Empfohlen für moderne Angular-Apps
})
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string): SafeHtml {
    // Markiert den HTML-String explizit als vertrauenswürdig
    return this.sanitizer.bypassSecurityTrustHtml(value);
  }
}