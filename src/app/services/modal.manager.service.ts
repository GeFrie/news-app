import { inject, Injectable } from '@angular/core';
import { NZ_MODAL_DATA } from 'ng-zorro-antd/modal';
import { NzModalService } from 'ng-zorro-antd/modal';
import { EditorModalComponent } from '../editor.modal/editor.modal.component';
import { ItemService } from './item.service';
import { Item } from '../interfaces/item';


@Injectable({ providedIn: 'root' })

export class ModalManagerService {

  constructor(
    private modal: NzModalService,
    private itemService: ItemService,
  ) { }

  openEditorModal(type: 'text' | 'file' | 'color' | 'schedule', currentData: Item) {
    const title = type === 'text' ? 'Text bearbeiten' :
      type === 'file' ? 'Datei auswählen' : type === 'color' ? 'Farbe wählen' : 'Planung & Status festlegen';

    const modalRef = this.modal.create({
      nzTitle: title,
      nzContent: EditorModalComponent,
      nzData: { type, currentData },
      nzOkText: 'Übernehmen',
      nzWidth: 700,
      nzOkDisabled: true,
      nzOnOk: (instance: EditorModalComponent) => {
        const result = instance.apply();
        if (result !== false && result !== undefined) {
          // console.log('modal.result: ', result)
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
        if (type === 'file') {
          const file = result.file;
          const previewUrl = result.previewUrl || URL.createObjectURL(file);
          const mediaType = file.type === 'application/pdf' ? 'pdf' : 'image';
          this.itemService.updateBackground(previewUrl, mediaType, file);
        }
        if (type === 'color') {
          this.itemService.updateColor(result);
        }
        if (type === 'schedule') {
          this.itemService.updateSchedule(result);
        }
      }
    });

    return modalRef;
  }

}