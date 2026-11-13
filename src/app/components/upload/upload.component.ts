import { Component } from '@angular/core';

import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzUploadChangeParam, NzUploadModule } from 'ng-zorro-antd/upload';

@Component({
  selector: 'upload-component',
  imports: [NzButtonModule, NzIconModule, NzUploadModule, ],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.scss',
})

export class UploadComponent {

  constructor(private messageService: NzMessageService) { }

  handleChange({ file, fileList }: NzUploadChangeParam): void {
    const status = file.status;
    if (status !== 'uploading') {
      // console.log(file, fileList);
    }
    if (status === 'done') {
      this.messageService.success(`${file.name} wurde hochgeladen.`);
    } else if (status === 'error') {
      this.messageService.error(`Hochladen von ${file.name} fehlgeschlagen.`);
    }
  }

}
