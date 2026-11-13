import { Component, inject, OnInit, OnDestroy, ViewChild, signal, ChangeDetectorRef, AfterViewInit, ViewChildren, QueryList, ElementRef, ChangeDetectionStrategy } from '@angular/core';

import { Editor, schema, Toolbar, NgxEditorMenuComponent, NgxEditorComponent } from 'ngx-editor';
import { Schema, Mark, MarkType } from 'prosemirror-model';
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { tableNodes, tableEditing } from 'prosemirror-tables';
import { inputRules, InputRule } from 'prosemirror-inputrules';
import { Plugin } from 'prosemirror-state';

import { NZ_MODAL_DATA, NzModalRef } from "ng-zorro-antd/modal";
import { FormsModule } from "@angular/forms";
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzUploadFile } from 'ng-zorro-antd/upload';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzDatePickerComponent, NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { environment } from '../../environments/environment';
import { ColorPickerDirective } from 'ngx-color-picker';
import { NotificationService } from '../services/notification.service';
import { Item, IntervalType, Plan } from '../interfaces/item';
import { NzTimePickerModule } from 'ng-zorro-antd/time-picker';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzInputModule } from 'ng-zorro-antd/input';

import { Observable, Subscription } from 'rxjs';
import { PlanService } from '../services/plan.service';
import { DatePipe } from '@angular/common';
import { createTageRecord } from '../shared/utils/plan.utils';
import { HttpClient } from '@angular/common/http';
import { ViewService } from '../services/view.service';
import { EditorConfigService } from '../services/editor.config.service';

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
    NzTimePickerModule,
    NzButtonModule,
    NzTableModule,
    NzInputModule,
    ColorPickerDirective,
    DatePipe,
  ],
  templateUrl: './editor.modal.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './editor.modal.component.scss',
})

export class EditorModalComponent implements OnInit, AfterViewInit, OnDestroy {

  readonly startValue = signal<Date | null>(null);
  readonly endValue = signal<Date | null>(null);

  @ViewChild('endDatePicker') endDatePicker!: NzDatePickerComponent;
  @ViewChild('startDatePicker') startDatePicker!: NzDatePickerComponent;

  readonly nzData = inject(NZ_MODAL_DATA);
  readonly modalRef = inject(NzModalRef);
  readonly MAX_FILE_SIZE_MB = 5;

  weekDays = [
    { label: 'Mo', value: 1 },
    { label: 'Di', value: 2 },
    { label: 'Mi', value: 3 },
    { label: 'Do', value: 4 },
    { label: 'Fr', value: 5 },
    { label: 'Sa', value: 6 },
    { label: 'So', value: 0 }
  ]

  monthDates: number[] = Array.from({ length: 31 }, (_, i) => i + 1);

  validIntervals = environment.VALID_INTERVALS;

  type: string = '';
  item = {} as Item;
  schedule: Plan[] = [];
  previewUrl: string | null = null;
  selectedFile: any = null;
  fileList: NzUploadFile[] = [];
  editorText: string = '';
  customColorPalette: string[] = [];

  colorGroups = environment.colorGroups;

  fontSizes: string[] = [
    '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px',
    '40px', '48px', '56px', '64px', '72px', '80px', '96px', '100px'
  ];

  editor!: Editor;

  // toolbar: Toolbar = environment.editorToolbar;
  toolbar: Toolbar = [
    ['undo', 'redo'],
    ['bold', 'italic', 'underline', 'strike'],
    ['superscript', 'subscript'],
    ['text_color', 'background_color'],
    ['format_clear'],
    // ['code', 'blockquote'],
    //[{ link: { showOpenInNewTab: false } }, 'image'],
    ['align_left', 'align_center', 'align_right', 'align_justify', 'indent', 'outdent'],
    ['horizontal_rule'],
    ['ordered_list', 'bullet_list'],
    // ['link', 'image'],
    // ['table']
    [{ heading: ['h1', 'h2', 'h3', 'h4'] }],
  ]

  isEsc: boolean = false;

  isActive: boolean = false;  // Status 
  period: IntervalType = 'none';
  disableType: IntervalType[] = ['defined_date', 'defined_input'];

  dates: (Date | null)[] = [new Date(), null];
  times: (Date | null)[] = [new Date(), null];

  selectedColor: string = '#008000';

  selectedMonthDays: number[] = [];

  selectedDays = createTageRecord();

  intervalOptions: { value: IntervalType; label: string }[] = [
    { value: 'none', label: 'Einmalig' },
    { value: 'daily', label: 'Täglich' },
    { value: 'weekly', label: 'Wöchentlich' },
    { value: 'monthly_date', label: 'Monatlich (gleiches Datum)' },
    { value: 'monthly_weekday', label: 'Monatlich (gleicher Tag)' },
    { value: 'defined_date', label: 'Datum festlegen' },
    { value: 'defined_input', label: 'Definieren' }
  ];

  get intervalLookup(): Record<string, string> {
    return this.intervalOptions.reduce((acc, opt) => {
      acc[opt.value] = opt.label;
      return acc;
    }, {} as Record<string, string>);
  }

  subscriptions: Subscription[] = [];

  plans: Plan[] = [];
  planIndex: number = -1;

  get activePlans(): Plan[] {
    return this.plans.filter(plan => !plan.remove);
  }

  initText: boolean = true;

  defaultFontSize = '16px';
  currentFontSize = this.defaultFontSize;

  constructor(
    // private msg: NzMessageService,
    private planService: PlanService,
    private notify: NotificationService,
    private configService: EditorConfigService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit() {
    if (!this.nzData) return;
    // Editor mit dem kombinierten Schema und deinen Plugins initialisieren
    this.subscriptions.push(
      this.configService.getConfig().subscribe({
        next: (config) => {
          if (config['showColorNameInToolbar']) {
            this.customColorPalette = this.colorGroups.
              flatMap(g => g.colors)
              .map(color => color.name.toLowerCase().replace(/\s+/g, ''));
          } else {
            this.customColorPalette = this.colorGroups.
              flatMap(g => g.colors)
              .map(color => color.hex);
          }
          if (config['defaultFontSize']) {
            this.defaultFontSize = config['defaultFontSize'];
            this.currentFontSize = this.defaultFontSize;
          }
          document.documentElement.style.setProperty('--default-font-size', this.defaultFontSize);
        },
        error: (err) => {
          this.customColorPalette = this.colorGroups.
            flatMap(g => g.colors)
            .map(color => color.name.toLowerCase().replace(/\s+/g, ''));
        }
      })
    );

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
      marks: schema.spec.marks.append({
        fontSize: {
          attrs: { size: { default: this.defaultFontSize } }, // Standardwert, falls nichts gesetzt ist
          parseDOM: [{
            tag: 'span[style*="font-size"]',
            getAttrs: (node: any) => {
              const size = node.style.fontSize;
              return size ? { size } : null;
            }
          }],
          toDOM: (mark: any) => ['span', { style: `font-size: ${mark.attrs.size};` }, 0]
        }
      })
    });

    const doubleSpaceRule = new InputRule(/  $/, (state, match, start, end) => {
      return state.tr.insertText('\u00a0\u00a0', start, end); // \u00a0 ist das Unicode-Zeichen für &nbsp;
    });

    this.editor = new Editor({
      schema: mySchema,
      plugins: [
        tableEditing(), // Dein bestehendes Tabellen-Plugin
        inputRules({ rules: [doubleSpaceRule] }),
      ]
    });

    this.type = this.nzData.type;
    this.item = this.nzData.currentItem;
    this.plans = this.nzData.plans;

    if (this.type === 'text') {
      this.editorText = this.item?.text || '';
    }
    else if (this.type === 'color') {
      this.selectedColor = this.item?.hintergrund?.startsWith('#') || this.item?.hintergrund?.startsWith('rgb')
        ? this.item.hintergrund
        : this.selectedColor;
    }
    else if (this.type === 'plan') {
      if (this.plans && this.plans.length > 0 && this.plans[0].id === this.item.id) {
        this.selectRow(this.activePlans[0]);
      } else {
        this.subscriptions.push(
          this.planService.getPlans([this.item.id]).subscribe(data => {
            if (data.length) {
              this.plans = data;
              this.selectRow(this.activePlans[0]);
            } else {
              this.createPlan();
            }
          })
        );
      }
      this.subscriptions.push(
        this.planService.selectedPlan$.subscribe(plan => {
          if (plan) {
            if (this.activePlans.some(p => p.sort === plan.sort)) {
              this.planIndex = this.activePlans.findIndex(v => v.sort === plan.sort);
              this.period = plan.period;
              this.selectedDays = plan.days;
              this.dates = plan.dates;
              this.times = plan.times;
            }
          }
        })
      );
    }
  }

  ngAfterViewInit(): void {
    if (this.type === 'text') {
      // Wartet, bis die Öffnungs-Animation des ng-zorro Modals komplett beendet ist
      this.subscriptions.push(
        this.modalRef.afterOpen.subscribe(() => {
          setTimeout(() => {
            this.editor?.view?.focus();
            this.updateCurrentFontSize();
            this.updateEditorContrast(); // <-- Prüft bei jeder Änderung den Kontrast
          }, 50);
        })
      );
    }
  }

  ngOnDestroy(): void {
    this.editor.destroy();
    this.subscriptions.forEach(e => e.unsubscribe());
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
    if (this.type === 'color') {
      return this.selectedColor;
    }
    if (this.type === 'plan') {
      return this.plans;
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

  resetToParagraph(event: MouseEvent): void {
    // 1. Wichtig: Verhindert, dass der Editor den Fokus verliert
    event.preventDefault();

    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    const paragraphType = state.schema.nodes['paragraph'];

    if (paragraphType) {
      // 2. Formatierung anwenden
      setBlockType(paragraphType)(state, dispatch);

      // 3. Fokus zur Sicherheit wieder direkt ins Textfeld zwingen
      view.focus();
    }
  }

  isParagraphActive(): boolean {
    if (!this.editor?.view) return false;

    const { state } = this.editor.view;
    const { $from } = state.selection;

    // Prüft, ob der aktuelle Node-Typ der Elternzeile ein Paragraph ist
    return $from.parent.type.name === 'paragraph';
  }

  onTextChange(htmlOutput: string) {
    this.editorText = htmlOutput;
    if (this.initText) {
      this.disableOkBtn(true);
      this.initText = false;
    } else {
      this.disableOkBtn(false);
      this.editorText = htmlOutput;
    }
    this.updateEditorContrast(); // <-- Prüft bei jeder Änderung den Kontrast
  }

  /**
  * Setzt die im Dropdown gewählte Schriftgröße direkt auf die Auswahl
  */
  setExactFontSize(newSize: string): void {
    if (!newSize || !this.editor?.view) return;

    const { state, dispatch } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontSize'];
    const { from, to, empty } = state.selection;

    this.currentFontSize = newSize;
    const tr = state.tr;

    if (empty) {
      // Wenn kein Text markiert ist: Style für das nächste getippte Wort vormerken
      tr.addStoredMark(markType.create({ size: newSize }));
    } else {
      // Wenn Text markiert ist: Alte Größe entfernen und neue setzen
      tr.removeMark(from, to, markType);
      tr.addMark(from, to, markType.create({ size: newSize }));
    }

    dispatch(tr);
    this.editor.view.focus();
  }

  private ensureFontSizeInList(sizeStr: string): void {
    if (sizeStr && !this.fontSizes.includes(sizeStr)) {
      this.fontSizes = [...this.fontSizes, sizeStr].sort(
        (a, b) => parseFloat(a) - parseFloat(b)
      );
    }
  }

  updateCurrentFontSize(): void {
    const { state } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontSize'];
    const { from, to, empty, $from } = state.selection;

    let currentSizeStr = '';
    let parentTagName = 'p';

    // 1. Fall: Text ist markiert (Auswahl ist nicht leer)
    if (!empty) {
      state.doc.nodesBetween(from, to, (node) => {
        const marks = node.marks;
        const fontSizeMark = marks.find(m => m.type === markType);
        if (fontSizeMark) {
          currentSizeStr = fontSizeMark.attrs['size'];
        }
        if (node.type.name === 'heading') {
          parentTagName = `h${node.attrs['level']}`;
        }
      });
    } else {
      // 2. Fall: Keine Auswahl, der Cursor blinkt nur
      // Wir prüfen die Marks direkt an der aktuellen Cursor-Position
      const storedMarks = state.storedMarks || $from.marks();
      let fontSizeMark = storedMarks.find(m => m.type === markType);

      // NEU: Wenn am Zeilenanfang links noch kein Mark ist, schauen wir rechts auf den ersten Buchstaben
      if (!fontSizeMark && $from.nodeAfter) {
        fontSizeMark = $from.nodeAfter.marks.find(m => m.type === markType);
      }
      if (fontSizeMark) {
        currentSizeStr = fontSizeMark.attrs['size'];
      }

      // Umschließenden Block-Typ ermitteln
      if ($from.parent && $from.parent.type.name === 'heading') {
        parentTagName = `h${$from.parent.attrs['level']}`;
      }
    }

    // Deine funktionierende Hilfsmethode nutzen, um die Zahl zu berechnen
    const sizeNum = this.getCurrentSizeNum(currentSizeStr, parentTagName);

    // Wert an die Toolbar übergeben
    this.currentFontSize = `${sizeNum}px`;
    this.ensureFontSizeInList(this.currentFontSize);
  }

  changeFontSize(action: 'increase' | 'decrease' | 'reset'): void {

    const { state, dispatch } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontSize'];
    const { from, to, empty } = state.selection;

    let currentSizeStr = this.currentFontSize;
    let parentTagName = 'p'; // Standardmäßig Textabsatz

    // 1. Wenn nichts ausgewählt ist, brechen wir ab
    if (empty) return;

    // Bei "reset" entfernen wir den Style komplett
    if (action === 'reset') {
      dispatch(state.tr.removeMark(from, to, markType));
      this.currentFontSize = this.defaultFontSize;
      this.editor.view.focus();
      return;
    }

    state.doc.nodesBetween(from, to, (node) => {
      const marks = node.marks;
      const fontSizeMark = marks.find(m => m.type === markType);
      if (fontSizeMark) {
        currentSizeStr = fontSizeMark.attrs['size'];
      }
      // den Typ des umschließenden Blocks merken (z.B. heading)
      if (node.type.name === 'heading') {
        parentTagName = `h${node.attrs['level']}`; // Ergibt 'h1', 'h2', etc.
      }
    });

    let newSizeNum = this.getCurrentSizeNum(currentSizeStr, parentTagName);

    // 4. Berechnung basierend auf dem Faktor aus der config.json
    if (action === 'increase') {
      newSizeNum += 1; //  Math.round(currentSizeNum + 1);
    } else if (action === 'decrease') {
      newSizeNum -= 1; // Math.round(currentSizeNum - 1);
    }

    this.currentFontSize = `${newSizeNum}px`;
    this.ensureFontSizeInList(this.currentFontSize);

    const tr = state.tr;
    tr.removeMark(from, to, markType); // Alten Wert entfernen
    tr.addMark(from, to, markType.create({ size: this.currentFontSize }));
    // tr.addMark(from, to, markType.create({ style: `font-size: ${this.currentFontSize};` }));

    dispatch(tr); // Transaktion absenden

    this.editor.view.focus();
  }

  getCurrentSizeNum(currentSizeStr: string, parentTagName: string): number {
    let currentSizeNum = parseFloat(this.defaultFontSize); // Standard für <p> oder <span>

    if (currentSizeStr) {
      currentSizeNum = parseFloat(currentSizeStr);
    } else {
      // Browser-Standardwerte für Überschriften als Ausgangsbasis nutzen
      switch (parentTagName) {
        case 'h1': currentSizeNum = 32 * currentSizeNum / 16; break;
        case 'h2': currentSizeNum = 24 * currentSizeNum / 16; break;
        case 'h3': currentSizeNum = 19 * currentSizeNum / 16; break;
        case 'h4': currentSizeNum = 16 * currentSizeNum / 16; break;
        default: currentSizeNum;
      }
    }
    return Math.round(currentSizeNum);
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
      let found;
      for (const group of this.colorGroups) {
        found = group.colors.find(color => color.name.toLowerCase() === value.toLowerCase());
        if (found) break;
      }
      if (found) {
        this.selectedColor = found.hex;
        this.disableOkBtn(false);
      }
    }
  }

  editorBgColor: string = '#ffffff'; // Standard: Weißer Hintergrund
  editorDefaultTextColor: string = '#000000';

  /**
   * Berechnet die durchschnittliche Helligkeit aller Textfarben im Dokument
   * und passt den Editor-Hintergrund automatisch für optimalen Kontrast an.
   */
  updateEditorContrast(): void {
    if (!this.editor?.view) return;

    // 1. Unsichtbaren Mess-Container kurz ins echte DOM hängen, damit getComputedStyle funktioniert
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    tempDiv.innerHTML = this.editorText || '';
    document.body.appendChild(tempDiv);

    let totalBrightness = 0;
    let coloredCharCount = 0;

    // Alle Elemente mit Inline-Style oder Color-Attribut prüfen
    const coloredElements = tempDiv.querySelectorAll<HTMLElement>('[style*="color"], [color]');

    coloredElements.forEach(el => {
      // Nur wenn wirklich 'color' (nicht nur 'background-color') gesetzt ist
      if (!el.style.color && !el.getAttribute('color')) return;

      const textLen = (el.textContent || '').trim().length;
      if (textLen === 0) return;

      // getComputedStyle wandelt 'lightyellow', 'white', Hex und RGBA IMMER in 'rgb(r, g, b)' um!
      const computedColor = window.getComputedStyle(el).color;
      const rgb = this.parseColorToRgb(computedColor);

      if (rgb) {
        const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        totalBrightness += brightness * textLen;
        coloredCharCount += textLen;
      }
    });

    // Mess-Container sofort wieder sauber aus dem DOM entfernen
    document.body.removeChild(tempDiv);

    // 2. Hintergrund berechnen (Bei lightyellow ~250 und white 255 liegt avgBrightness bei ~254 -> > 160!)
    const isLightText = coloredCharCount > 0 && (totalBrightness / coloredCharCount) > 160;
    this.editorBgColor = isLightText ? '#2b2b2b' : '#ffffff';
    this.editorDefaultTextColor = isLightText ? '#f0f0f0' : '#000000';

    // 3. Direkt mit !important auf das Editierfeld und den Wrapper setzen
    const contentDom = this.editor.view.dom as HTMLElement;
    if (contentDom) {
      contentDom.style.setProperty('background-color', this.editorBgColor, 'important');
      contentDom.style.setProperty('color', this.editorDefaultTextColor, 'important');

      const wrapperDom = contentDom.closest('.NgxEditor') as HTMLElement;
      if (wrapperDom) {
        wrapperDom.style.setProperty('background-color', this.editorBgColor, 'important');
      }
    }
  }

  /**
   * Wandelt Hex (#fff, #ffffff, #ffffffff), RGB und RGBA zuverlässig in RGB-Zahlen um
   */
  private parseColorToRgb(colorStr: string): { r: number; g: number; b: number } | null {
    const str = colorStr.trim();

    // 1. Hex-Format (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
    if (str.startsWith('#')) {
      let hex = str.slice(1);

      // Kurzform (#fff oder #ffff) auf 6 bzw. 8 Stellen erweitern
      if (hex.length === 3 || hex.length === 4) {
        hex = hex.split('').map(c => c + c).join('');
      }

      if (hex.length === 6 || hex.length === 8) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Falls 8-stelliges Hex mit Alpha-Kanal: Transparenz gegen Weiß einrechnen
        if (hex.length === 8) {
          const a = parseInt(hex.substring(6, 8), 16) / 255;
          return {
            r: Math.round(r * a + 255 * (1 - a)),
            g: Math.round(g * a + 255 * (1 - a)),
            b: Math.round(b * a + 255 * (1 - a))
          };
        }
        return { r, g, b };
      }
    }

    // 2. RGB- und RGBA-Format (z. B. "rgb(255, 255, 255)" oder "rgba(255, 255, 255, 0.5)")
    const rgbMatch = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);
      const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;

      // Falls Alpha < 1: Transparenz gegen weißen Hintergrund einrechnen
      if (a < 1) {
        return {
          r: Math.round(r * a + 255 * (1 - a)),
          g: Math.round(g * a + 255 * (1 - a)),
          b: Math.round(b * a + 255 * (1 - a))
        };
      }
      return { r, g, b };
    }

    return null;
  }

  // get scheduleState(): '' | 'warning' | 'error' {
  //   if (!this.dates || !this.dates[1]) {
  //     return ''; // Alles okay (unbefristet)
  //   }

  //   const now = new Date().getTime();
  //   const end = new Date(this.dates[1]).getTime();

  //   // Falls abgelaufen -> Warnung (gelber Rahmen)
  //   return end < now ? 'warning' : '';
  // }

  /**
 * Reagiert auf Pfeil-Hoch und Pfeil-Runter auf der Tastatur
 */
  readonly disabledStartDate = (startValue: Date): boolean => {
    const endValue = this.endValue();
    if (!startValue || !endValue) {
      return false;
    }
    return startValue.getTime() > endValue.getTime();
  };

  readonly disabledEndDate = (endValue: Date): boolean => {
    const startValue = this.startValue();
    if (!endValue || !startValue) {
      return false;
    }
    return endValue.getTime() <= startValue.getTime();
  };

  deleteDates() {
    this.dates = [null, null];
    const targetPlan = this.activePlans[this.planIndex];
    if (targetPlan) {
      targetPlan.dates = [null, null];
      this.plans = [...this.plans];  // Zwingt Angular, das Template neu zu rendern
    }
    this.disableOkBtn(false)
  }

  onDateChange(): void {
    if (this.dates[0] && this.dates[1]) {
      const start = new Date(this.dates[0]);
      const end = new Date(this.dates[1]);
      // Wenn das Startdatum größer ist als das Enddatum -> Werte tauschen
      if (start.getTime() > end.getTime()) {
        this.dates = [this.dates[1], this.dates[0]];
      }
    }
    const targetPlan = this.activePlans[this.planIndex];
    if (targetPlan) {
      targetPlan.dates = this.dates;
      this.plans = [...this.plans]; // Zwingt Angular, das Template neu zu rendern
    } this.disableOkBtn(false);
  }

  handleDateEnter(index: number, event: KeyboardEvent) {
    const inputElement = event.target as HTMLInputElement;
    const rawValue = inputElement?.value?.trim(); // liefert das geänderte Datum

    if (!rawValue) return;

    const parseGermanDate = (dateStr: string): Date | null => {
      const match = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]) - 1; // 0-basiert
        const year = Number(match[3]);
        const date = new Date(year, month, day);
        return isNaN(date.getTime()) ? null : date;
      }
      return null;
    };

    this.dates = index === 0 ? [parseGermanDate(rawValue), this.dates[1]] : [this.dates[0], parseGermanDate(rawValue)];
    // Änderungen in die Pläne zurückschreiben & UI triggern
    this.onDateChange();

    // Picker schließen und Eingabefeld verlassen
    event.preventDefault();
    inputElement.blur();
    // }
  }

  // forceConfirm(): void {
  //   this.datePicker.close();
  //   this.disableOkBtn(false);
  // }

  handleTimeEnter(index: number, event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement;
    const rawValue = inputElement?.value?.trim(); // z.B. "14:30"

    // Prüfen, ob die getippte Zeit dem Format HH:mm entspricht
    if (rawValue && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(rawValue)) {
      const [hours, minutes] = rawValue.split(':').map(Number);

      // Bestehendes Datum nehmen oder ein neues erstellen
      const baseDate = this.times[index] instanceof Date ? new Date(this.times[index]) : new Date();
      baseDate.setHours(hours, minutes, 0, 0);

      // Explizit das neue Datum zuweisen, um NG-ZORRO zu zwingen, es zu übernehmen
      this.times[index] = baseDate;

      this.setTime(index)
      // // Trigger das ngModelChange manuell, falls nötig
      // this.disableOkBtn(false);

      // Verhindert das Standard-Event von Ant Design, welches das Feld leert
      event.preventDefault();
      inputElement.blur(); // Schließt den Picker und nimmt den Fokus raus
    }
  }

  setTime(index: number) {
    const targetPlan = this.activePlans[this.planIndex];
    if (targetPlan) {
      const updatedTimes = [...targetPlan.times];
      updatedTimes[index] = this.times[index];
      targetPlan.times = updatedTimes;
      this.plans = [...this.plans];
    }
    this.disableOkBtn(false)
  }

  deleteTimes() {
    this.times = [null, null];
    const targetPlan = this.activePlans[this.planIndex];
    if (targetPlan) {
      targetPlan.times = [null, null];
      this.plans = [...this.plans];  // Zwingt Angular, das Template neu zu rendern
    }
    this.disableOkBtn(false)
  }

  setInterval(event: IntervalType) {
    const targetPlan = this.activePlans[this.planIndex];
    if (targetPlan) {
      targetPlan.period = event;
      this.plans = [...this.plans];  // Zwingt Angular, das Template neu zu rendern
    }
    this.disableOkBtn(false)
  }

  getRepeatIndexes(): number[] {
    if (this.period === 'monthly_weekday') {
      return [1, 2, 3, 4, 5]; // Repräsentiert die 5 Zeilen im Bild
    }
    return [1]; // 1 Zeile für wöchentlich
  }

  private createDayKey(dayValue: number, weekIndex: number): number {
    if (this.period === 'monthly_weekday') {
      // weekIndex geht von 1 bis 5. 
      // (weekIndex - 1) sorgt für die korrekte Zehnerstelle (0, 10, 20, 30, 40)
      return (weekIndex - 1) * 10 + dayValue;
    }
    return dayValue; // Für wöchentlich bleibt es einfach 0 bis 6
  }

  // Fügt die berechnete Zahl hinzu oder entfernt sie
  toggleDay(dayValue: number, weekIndex: number): void {
    const key = this.createDayKey(dayValue, weekIndex);
    const index = this.selectedDays[this.period].indexOf(key);

    if (index > -1) {
      this.selectedDays[this.period].splice(index, 1); // Entfernen, wenn bereits aktiv
    } else {
      this.selectedDays[this.period].push(key); // Hinzufügen, wenn inaktiv
      this.selectedDays[this.period].sort((a, b) => a - b);
    }

    this.selectedDays[this.period] = [...this.selectedDays[this.period]]; // Referenz-Update für die lokale Variable

    const targetPlan = this.activePlans[this.planIndex];

    if (targetPlan && targetPlan.days) {
      targetPlan.days[this.period] = [...this.selectedDays[this.period]];
      this.plans = [...this.plans];
    }
    this.disableOkBtn(false);
  }

  // Prüft, ob die Zahl im Array existiert (für den primären Button-Style)
  isDaySelected(dayValue: number, weekIndex: number): boolean {
    const key = this.createDayKey(dayValue, weekIndex);
    return this.selectedDays[this.period].includes(key);
  }

  selectRow(plan: Plan) {
    this.planService.setSelectedPlan(plan);
  }

  createPlan() {
    const newPlan = this.planService.createPlan(this.item.id, this.plans.length);
    this.plans.push(newPlan);
    this.plans = [...this.plans];
    this.selectRow(newPlan);
  }

  removePlan(sort: number) {
    // bearbeite plans-Array
    const planIndex = this.plans.findIndex(v => v.sort === sort);
    if (planIndex === -1) return;

    this.plans[planIndex].remove = true;
    this.plans = [...this.plans];

    // activePlans ist aktualisiert, dadurch hat sich planIndex geändert
    if (this.activePlans.length) {
      if (!this.activePlans.some(v => v.sort === sort)) { // selektierter Plan entfernt
        // Vorwärts-Suche
        let fallbackPlan = this.activePlans.find(p => p.sort > sort);
        // Rückwärts-Suche
        if (!fallbackPlan) {
          const smallerPlans = [...this.activePlans].filter(p => Number(p.sort) < sort);
          if (smallerPlans.length > 0) {
            smallerPlans.sort((a, b) => Number(b.sort) - Number(a.sort));
            fallbackPlan = smallerPlans[0];
          }
        }
        if (fallbackPlan) {
          this.selectRow(fallbackPlan);
        } else {
          this.createPlan();
        }
      } else { // anderer Plan entfernt
        this.selectRow(this.activePlans[this.planIndex]);
      }
    } else {
      this.createPlan();
    }
    this.disableOkBtn(false);
  }

  disableOkBtn(value: boolean) {
    // Aktualisiert die Konfiguration des Modals von innen
    this.modalRef.updateConfig({
      nzOkDisabled: value
    });
  }

}
