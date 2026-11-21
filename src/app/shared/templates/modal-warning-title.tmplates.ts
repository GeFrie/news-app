import { Component, TemplateRef, ViewChild } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

@Component({
  standalone: true,
  imports: [NzIconModule],
  template: `
    <ng-template #customTitle>
      <span style="display: inline-flex; align-items: center; gap: 16px;">
      <nz-icon nzType="exclamation-circle" nzTheme="outline" style="color: orange; font-size: 22px;" />  
        <span>An der aktuellen News gibt es ungespeicherte Änderungen.<br/>Zum Fortfahren bitte eine Aktion wählen.</span>
      </span>
    </ng-template>
  `
})
export class ModalTitleTemplateComponent {
  @ViewChild('customTitle', { static: true }) titleTpl!: TemplateRef<{}>;
}
