import { Injectable } from '@angular/core';
import { NzModalService } from 'ng-zorro-antd/modal';
import { EditorModalComponent } from '../editor.modal/editor.modal.component';
import { ItemService } from './item.service';
import { PlanService } from './plan.service';
import { Item, Plan } from '../interfaces/item';
import { formatTimeToSql } from '../shared/utils/time-format.utils';



@Injectable({ providedIn: 'root' })

export class ModalManagerService {

  constructor(
    private modal: NzModalService,
    private itemService: ItemService,
    private planService: PlanService,
  ) { }

  openEditorModal(
    type: 'text' | 'file' | 'color' | 'plan',
    currentItem: Item,
    plans: Plan[],
  ) {
    const title = type === 'text' ? 'Text bearbeiten' :
      type === 'file' ? 'Datei auswählen' : type === 'color' ? 'Farbe wählen' : 'Zeit-Planung';

    const modalRef = this.modal.create({
      nzTitle: `${title} für ${currentItem.id === 0 ? 'neue' : ''} News ${currentItem.id === 0 ? '' : '#'}${currentItem.id === 0 ? '' : currentItem.id} `,
      nzContent: EditorModalComponent,
      nzKeyboard: false,
      nzData: { type, currentItem, plans },
      nzOkText: 'Übernehmen',
      nzWidth: type === 'text' ? 1400 : type === 'color' ? 570 : 700,
      // nzBodyStyle: {
      //   'min-height': type === 'text' ? '680px' : 'auto',
      //   'overflow-y': 'auto'
      // },
      nzOkDisabled: true,
      nzOnOk: (instance: EditorModalComponent) => {
        /**
         * Hier kommen die Werte aus editor.modal.components.ts.apply() an. 
        */
        const result = instance.apply();

        if (result !== false && result !== undefined) {
          modalRef.close(result);
          return true;
        }
        return false;
      }
    });

    modalRef.afterClose.subscribe(result => {
      if (result) {
        if (type === 'text') {
          this.itemService.updateText(result);
        }
        // if (type === 'file') {
        //   const file = result.file;
        //   const previewUrl = result.previewUrl || URL.createObjectURL(file);
        //   const mediaType = file.type === 'application/pdf' ? 'pdf' : 'image';
        //   this.itemService.updateBackground(previewUrl, mediaType, file);
        // }
        if (type === 'file') {
          const file = result.file;
          const previewUrl = result.previewUrl || URL.createObjectURL(file);
          const mediaType = file.type === 'application/pdf' ? 'pdf' : 'image';

          if (mediaType === 'pdf') {
            this.itemService.updateBackground(previewUrl, mediaType, file);
          } else {
            // Fügt das Bild proportional an imageBoxes an, ohne bestehende Bilder zu überschreiben!
            this.itemService.addImageBox(file, previewUrl, result.dimensions);
          }
        }
        if (type === 'color') {
          this.itemService.updateColor(result);
        }
        if (type === 'plan') {
          this.planService.updatePlan({
            ...result,
          });
        }
      }
    });
    return modalRef;
  }

}