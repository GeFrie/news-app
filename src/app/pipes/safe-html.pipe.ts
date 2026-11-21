import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'safeHtml',
  standalone: true
})
export class SafeHtmlPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(html: string | null | undefined): SafeHtml {
    if (!html) return '';

    // Falls Tabellen mit data-colwidth enthalten sind: <colgroup> für Browser-Anzeige ergänzen
    if (html.includes('data-colwidth')) {
      html = this.applyTableColWidths(html);
    }

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private applyTableColWidths(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    doc.querySelectorAll('table').forEach(table => {
      // Nur ergänzen, falls noch kein <colgroup> vorhanden ist
      if (table.querySelector('colgroup')) return;

      const firstRow = table.querySelector('tr');
      if (!firstRow) return;

      const cells = Array.from(firstRow.children) as HTMLElement[];
      const widths: number[] = [];

      for (const cell of cells) {
        const colAttr = cell.getAttribute('data-colwidth');
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
        if (colAttr) {
          const parts = colAttr.split(',').map(n => parseFloat(n.trim()));
          for (let i = 0; i < colspan; i++) {
            widths.push(parts[i] || parts[0] || 0);
          }
        } else {
          for (let i = 0; i < colspan; i++) {
            widths.push(0);
          }
        }
      }

      const total = widths.reduce((sum, w) => sum + w, 0);
      if (total > 0) {
        const colgroup = doc.createElement('colgroup');
        widths.forEach(w => {
          const col = doc.createElement('col');
          if (w > 0) {
            // Prozentual zur Tabellenbreite umrechnen -> skaliert perfekt im Sider (klein) & Frontend (1920px)!
            const pct = ((w / total) * 100).toFixed(2);
            col.style.width = `${pct}%`;
          }
          colgroup.appendChild(col);
        });
        table.insertBefore(colgroup, table.firstChild);
      }
    });

    return doc.body.innerHTML;
  }
}
