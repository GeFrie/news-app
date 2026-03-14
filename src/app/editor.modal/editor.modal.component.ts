import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Editor, schema, Toolbar, NgxEditorMenuComponent, NgxEditorComponent } from 'ngx-editor';
import { Schema } from 'prosemirror-model';
import { tableNodes, tableEditing } from 'prosemirror-tables';
import { NZ_MODAL_DATA, NzModalRef } from "ng-zorro-antd/modal";
import { FormsModule } from "@angular/forms";
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
// import { NzMessageService } from 'ng-zorro-antd/message';
import { CompatibleDate, NzDatePickerComponent, NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { environment } from '../../environments/environment';
import { ColorPickerDirective } from 'ngx-color-picker';
import { NotificationService } from '../services/notification.service';
import { Item } from '../interfaces/item';
import { NzStatus } from 'ng-zorro-antd/core/types';

@Component({
  selector: 'app-editor.modal',
  imports: [
    NgxEditorMenuComponent,
    NgxEditorComponent,
    FormsModule,
    NzUploadModule,
    NzIconModule,
    NzSpaceModule,
    NzSwitchModule,
    NzSelectModule,
    NzGridModule,
    NzDatePickerModule,
    ColorPickerDirective,
  ],
  templateUrl: './editor.modal.component.html',
  styleUrl: './editor.modal.component.scss',
})
export class EditorModalComponent implements OnInit, OnDestroy {

  @ViewChild('datePicker') datePicker!: NzDatePickerComponent;

  readonly nzData = inject(NZ_MODAL_DATA);
  readonly modalRef = inject(NzModalRef);
  readonly MAX_FILE_SIZE_MB = 5;

  type: any;
  item = {} as Item;
  previewUrl: string | null = null;
  selectedFile: any = null;
  fileList: NzUploadFile[] = [];
  editorText: string = '';

  editor: any;
  toolbar: Toolbar = environment.editorToolbar;
  webColors = environment.webColors;
  colorGroups = environment.colorGroups;

  selectedColor: string = '#ffffff';

  editAktiv: boolean = false;
  editIntervall: string = '';
  editDates: (Date | null)[] = [new Date(), null];

  constructor(
    // private msg: NzMessageService,
    private notify: NotificationService,
  ) {
  }

  ngOnInit() {
    if (!this.nzData) return;

    const myTableNodes = tableNodes({
      tableGroup: 'block',
      cellContent: 'block+',
      cellAttributes: {
        background: {
          default: null,
          // Liest das Attribut aus dem HTML (z.B. beim Einfügen von Inhalten)
          getFromDOM(dom: HTMLElement) {
            return dom.style.backgroundColor || null;
          },
          // Schreibt das Attribut zurück ins HTML/DOM
          setDOMAttr(value, attrs) {
            if (value) {
              attrs['style'] = (attrs['style'] || '') + `background-color: ${value};`;
            }
          }
        }
      }
    });
    const mySchema = new Schema({
      nodes: schema.spec.nodes.append(myTableNodes),
      marks: schema.spec.marks
    });
    this.editor = new Editor({
      schema: mySchema,
      plugins: [
        tableEditing(),
      ]
    });

    this.type = this.nzData.type;
    this.item = this.nzData.currentData;

    if (this.type === 'text') {
      this.editorText = this.item?.text || '';
      console.log('editorText ', this.editorText)
    }
    else if (this.type === 'color') {
      this.selectedColor = this.item?.hintergrund?.startsWith('#') ? this.item.hintergrund : this.selectedColor;
    }
    else if (this.type === 'schedule') {
      this.editAktiv = this.item.sichtbar ?? true;
      this.editIntervall = this.item.intervall ?? 'none';

      const start = this.item.startDatum ? new Date(this.item.startDatum) : new Date();
      const end = this.item.endDatum ? new Date(this.item.endDatum) : null;
      this.editDates = [start, end];
    }

    this.disableOkBtn(true);
  }

  ngOnDestroy(): void {
    this.editor.destroy();
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    this.fileList = [file];
    const isLtLimit = (file.size! / 1024 / 1024) < this.MAX_FILE_SIZE_MB;

    if (!isLtLimit) {
      // Fehler: Datei zu groß
      this.notify.createNotification(
        'warning',
        'Server-Meldung',
        `Bild muss kleiner als ${this.MAX_FILE_SIZE_MB}MB sein!`,
      );
      this.handleRemove(); // Alles zurücksetzen & Button sperren
      return false;
    }
    if (file instanceof File) {
      this.selectedFile = file;
    } else if (file.originFileObj) {
      this.selectedFile = file.originFileObj;
    }
    if (this.selectedFile) {
      // Vorschau-URL für das Modal erstellen
      this.previewUrl = URL.createObjectURL(this.selectedFile);
      this.disableOkBtn(false);
    }
    return false;
  };

  apply(): any {
    if (this.type === 'text') {  // && this.htmlContent
      return this.editorText;
    }
    if (this.type === 'file' && this.selectedFile) {
      if (this.selectedFile) {
        return {
          file: this.selectedFile,
          previewUrl: this.previewUrl
        };
      }
    }
    if (this.type === 'color' && this.selectedColor) {
      return this.selectedColor;
    }
    if (this.type === 'schedule') {
      return {
        sichtbar: this.editAktiv,
        intervall: this.editIntervall,
        startDatum: this.editDates ? this.editDates[0] : null,
        endDatum: this.editDates ? this.editDates[1] : null
      };
    }
    return false; // Verhindert Schließen, wenn nichts gewählt wurde
  }

  handleRemove = (): boolean => {
    this.fileList = [];
    this.selectedFile = null;
    // Wichtig: Die temporäre URL freigeben, um Speicherlecks zu vermeiden
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
    this.disableOkBtn(true);
    return true; // Erlaubt das Entfernen aus der UI-Liste
  };

  onTextChange(text: string) {
    this.disableOkBtn(false);
  }

  onPickerChange(color: string) {
    this.selectedColor = color;
    this.disableOkBtn(false);
  }

  onWebColorSelect(value: string) {
    if (!value) return;

    const isHex = /^#([0-9A-F]{3}){1,2}$/i.test(value);

    if (isHex) {
      this.selectedColor = value;
      this.disableOkBtn(false);
    } else {
      // Falls es kein Hex ist, schauen wir, ob es ein Name aus der Liste ist
      const found = this.webColors.find(c => c.name.toLowerCase() === value.toLowerCase());
      if (found) {
        this.selectedColor = found.hex;
        this.disableOkBtn(false);
      }
    }
  }

  disableOkBtn(value: boolean) {
    // Aktualisiert die Konfiguration des Modals von innen
    this.modalRef.updateConfig({
      nzOkDisabled: value
    });
  }

  get scheduleState(): '' | 'warning' | 'error' {
    if (!this.editDates || !this.editDates[1]) {
      return ''; // Alles okay (unbefristet)
    }

    const now = new Date().getTime();
    const end = new Date(this.editDates[1]).getTime();

    // Falls abgelaufen -> Warnung (gelber Rahmen)
    return end < now ? 'warning' : '';
  }

  private currentTempDates: (Date | null)[] = [];

  onCalendarChange(dates: (Date | null)[]): void {
    this.currentTempDates = dates;
  }

  forceConfirm(): void {
    const start = this.currentTempDates[0];
    let ende = this.currentTempDates[1];

    if (start && !ende) {
      const autoEnd = new Date(start);
      autoEnd.setHours(23, 59, 59);
      this.editDates = [start, autoEnd];
    } else if (start && ende) {
      this.editDates = [start, ende];
    }
    this.datePicker.close();
    this.disableOkBtn(false);
  }

}
