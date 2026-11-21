import { Component, inject, OnInit, OnDestroy, ViewChild, signal, ChangeDetectorRef, AfterViewInit, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { Editor, schema, Toolbar, NgxEditorMenuComponent, NgxEditorComponent } from 'ngx-editor';

import { Schema, Mark, MarkType, Fragment, Slice } from 'prosemirror-model';
import { setBlockType } from 'prosemirror-commands';
import { inputRules, InputRule } from 'prosemirror-inputrules';
import { TextSelection } from 'prosemirror-state';
import { tableNodes, tableEditing, addRowBefore, addRowAfter, deleteRow, addColumnBefore, addColumnAfter, deleteColumn, deleteTable, isInTable, columnResizing, goToNextCell, CellSelection, setCellAttr } from 'prosemirror-tables';
import { keymap } from 'prosemirror-keymap';
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
import { NzContextMenuService, NzDropdownMenuComponent, NzDropdownModule } from 'ng-zorro-antd/dropdown';
import { NzRadioModule } from 'ng-zorro-antd/radio';

import { Subscription } from 'rxjs';
import { PlanService } from '../services/plan.service';
import { DatePipe } from '@angular/common';
import { createTageRecord } from '../shared/utils/plan.utils';
import { EditorConfigService } from '../services/editor.config.service';
import { ResizableTableView } from './resize.table.view';

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
    NzDropdownModule,
    NzRadioModule,
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

  @ViewChild('borderPickerTrigger', { read: ColorPickerDirective })
  borderPickerTrigger!: ColorPickerDirective;

  readonly nzData = inject(NZ_MODAL_DATA);
  readonly modalRef = inject(NzModalRef);
  readonly MAX_FILE_SIZE_MB = 5;

  cellColors: string[] = [
    '#e6f7ff', '#f6ffed', '#fffbe6', '#fff1f0',
    '#f9f0ff', '#f5f5f5', '#d9d9d9', '#001529'
  ];

  isBorderPickerOpen = false;
  pickerPos = { x: 0, y: 0 };

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.isBorderPickerOpen) {
      // 1. Stufe: Nur den offenen Farbwähler schließen
      event.preventDefault();
      event.stopPropagation();

      this.borderPickerTrigger?.closeDialog();
      this.isBorderPickerOpen = false;
      this.editor.view.focus();
    } else if (this.isContextMenuOpen || this.tableMenuVisible) {
      // 2. Stufe: Nur das offene Kontextmenü / Dropdown schließen
      event.preventDefault();
      event.stopPropagation();

      this.nzContextMenuService.close();
      this.isContextMenuOpen = false;
      this.tableMenuVisible = false;
      this.editor.view.focus();
    } else {
      // 3. Stufe (kein Picker & kein Menü mehr offen): Modal schließen
      this.modalRef.close();
    }
  }

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

  gridSize = [1, 2, 3, 4, 5, 6, 7, 8];
  hoverRows = 0;
  hoverCols = 0;

  tableMenuVisible = false;

  fontSizes: string[] = [
    '12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px',
    '40px', '48px', '56px', '64px', '72px', '80px', '96px', '100px'
  ];

  fontWeights = [
    { label: 'Normal', value: '400' },
    { label: 'Medium', value: '500' },
    { label: 'Semi-Bold', value: '600' },
    { label: 'Bold', value: '700' }
  ];

  blockTypes = [
    { label: 'Absatz', value: 'paragraph' },
    { label: 'Überschrift 1', value: 'h1' },
    { label: 'Überschrift 2', value: 'h2' },
    { label: 'Überschrift 3', value: 'h3' },
    { label: 'Überschrift 4', value: 'h4' }
  ];

  fontFamilyGroups = [
    {
      group: 'System-Standards',
      fonts: [
        { label: 'Arial', value: "Arial, 'Liberation Sans', sans-serif" },
        { label: 'Times New Roman', value: "'Times New Roman', 'Liberation Serif', serif" },
        { label: 'Courier New', value: "'Courier New', 'Liberation Mono', monospace" },
        { label: 'Verdana', value: "Verdana, 'DejaVu Sans', sans-serif" },
        { label: 'Georgia', value: "Georgia, 'DejaVu Serif', serif" }
        // { label: 'Arial / Liberation Sans', value: "Arial, 'Liberation Sans', sans-serif" },
        // { label: 'Times New Roman / Liberation Serif', value: "'Times New Roman', 'Liberation Serif', serif" },
        // { label: 'Courier New / Liberation Mono', value: "'Courier New', 'Liberation Mono', monospace" },
        // { label: 'Verdana / DejaVu Sans', value: "Verdana, 'DejaVu Sans', sans-serif" },
        // { label: 'Georgia / DejaVu Serif', value: "Georgia, 'DejaVu Serif', serif" }
      ]
    },
    {
      group: 'Kiosk Modern',
      fonts: [
        { label: 'Inter', value: "'Inter', 'Segoe UI', 'Liberation Sans', sans-serif" },
        { label: 'Roboto', value: "'Roboto', Arial, 'Liberation Sans', sans-serif" },
        { label: 'Open Sans', value: "'Open Sans', 'Segoe UI', 'DejaVu Sans', sans-serif" },
        { label: 'Montserrat', value: "'Montserrat', Arial, 'Liberation Sans', sans-serif" },
        { label: 'Lato', value: "'Lato', Calibri, 'Liberation Sans', sans-serif" },
        { label: 'Poppins', value: "'Poppins', 'Segoe UI', 'Liberation Sans', sans-serif" }
      ]
    },
    {
      group: 'Schlagzeilen & Ticker',
      fonts: [
        { label: 'Oswald (Small)', value: "'Oswald', Impact, 'Liberation Sans Narrow', sans-serif" },
        { label: 'Bebas Neue (Caps)', value: "'Bebas Neue', Impact, sans-serif" },
        { label: 'Impact', value: "Impact, 'Anton', 'Arial Black', sans-serif" }
      ]
    },
    {
      group: 'Klassisch & Editorial',
      fonts: [
        { label: 'Merriweather', value: "'Merriweather', Georgia, 'DejaVu Serif', serif" },
        { label: 'Playfair Display', value: "'Playfair Display', 'Times New Roman', 'Liberation Serif', serif" }
      ]
    },
    {
      group: 'Monospace',
      fonts: [
        { label: 'Consolas', value: "Consolas, 'DejaVu Sans Mono', monospace" },
        { label: 'JetBrains Mono', value: "'JetBrains Mono', Consolas, 'DejaVu Sans Mono', monospace" }
      ]
    }
  ];

  get allFontFamilies() {
    return this.fontFamilyGroups.flatMap(g => g.fonts);
  }

  editor!: Editor;

  toolbar: Toolbar = [
    ['undo', 'redo'],
    // ['bold', 'italic', 'underline', 'strike'],
    ['italic', 'underline', 'strike'],
    ['superscript', 'subscript'],
    ['text_color', 'background_color'],
    // ['format_clear'],
    // ['code', 'blockquote'],
    //[{ link: { showOpenInNewTab: false } }, 'image'],
    ['align_left', 'align_center', 'align_right', 'align_justify', 'indent', 'outdent'],
    ['horizontal_rule'],
    ['ordered_list', 'bullet_list'],
    // ['link', 'image'],
    // [{ heading: ['h1', 'h2', 'h3', 'h4'] }],
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

  get isInTable(): boolean {
    return !!this.editor?.view && isInTable(this.editor.view.state);
  }

  initText: boolean = true;

  defaultFontSize = '32px'; // steht auch in der config.json
  currentFontSize = this.defaultFontSize;

  defaultFontWeight = '400';
  currentFontWeight = this.defaultFontWeight;

  currentBlockType = 'paragraph';

  defaultFontFamily = '';
  currentFontFamily = this.defaultFontFamily;

  warnStr?: string;

  isContextMenuOpen = false;

  currentTableBorderColor = '#000000';

  rawSelectedFile: File | null = null;
  resizeMode: 'max' | 'original' = 'max';
  imageDimensionsInfo = '';
  finalImageSize: { width: number; height: number } | null = null;
  isOversizedImage = false;

  constructor(
    // private msg: NzMessageService,
    private planService: PlanService,
    private notify: NotificationService,
    private configService: EditorConfigService,
    private cdr: ChangeDetectorRef,
    private nzContextMenuService: NzContextMenuService,
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
            // this.defaultFontSize = config['defaultFontSize'];
            // Sicherstellen, dass 'px' dransteht, falls in config.json nur die Zahl 36 steht!
            const rawSize = String(config['defaultFontSize']);
            this.defaultFontSize = rawSize.endsWith('px') ? rawSize : `${rawSize}px`;
            this.currentFontSize = this.defaultFontSize;
          }
          document.documentElement.style.setProperty('--default-font-size', this.defaultFontSize);
          if (this.editor?.view) {
            this.updateCurrentFontSize();
          }
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

    // <-- HIER: Äußere Breite, Höhe und Ausrichtung für die Tabelle ergänzen
    myTableNodes.table = {
      ...myTableNodes.table,
      attrs: {
        width: { default: '100%' },
        height: { default: null },
        marginLeft: { default: '0%' },
        borderMode: { default: 'all' },        // 'all' | 'outer' | 'horizontal' | 'none'
        borderStyle: { default: 'solid' },     // 'solid' | 'dashed' | 'dotted'
        borderWidth: { default: '1px' },       // '1px' | '2px' | '4px'
        borderColor: { default: 'currentColor' }
      },
      parseDOM: [{
        tag: 'table',
        getAttrs: (dom: HTMLElement) => ({
          width: dom.style.width || dom.getAttribute('width') || '100%',
          height: dom.style.height || null,
          marginLeft: dom.style.marginLeft || '0%',
          borderMode: dom.dataset['borderMode'] || 'all',
          borderStyle: dom.style.getPropertyValue('--tbl-border-style').trim() || 'solid',
          borderWidth: dom.style.getPropertyValue('--tbl-border-width').trim() || '1px',
          borderColor: dom.style.getPropertyValue('--tbl-border-color').trim() || 'currentColor'
        })
      }],
      toDOM: (node: any) => {
        const styles: string[] = [];
        if (node.attrs.width) styles.push(`width: ${node.attrs.width}`);
        if (node.attrs.height) styles.push(`height: ${node.attrs.height}`);
        if (node.attrs.marginLeft && node.attrs.marginLeft !== '0%') {
          styles.push(`margin-left: ${node.attrs.marginLeft}`);
        }
        if (node.attrs.borderStyle && node.attrs.borderStyle !== 'solid') {
          styles.push(`--tbl-border-style: ${node.attrs.borderStyle}`);
        }
        if (node.attrs.borderWidth && node.attrs.borderWidth !== '1px') {
          styles.push(`--tbl-border-width: ${node.attrs.borderWidth}`);
        }
        if (node.attrs.borderColor && node.attrs.borderColor !== 'currentColor') {
          styles.push(`--tbl-border-color: ${node.attrs.borderColor}`);
        }

        return ['table', {
          'data-border-mode': node.attrs.borderMode || 'all',
          style: styles.join('; ')
        }, 0];
      }
    };

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
        },
        fontWeight: {
          attrs: { weight: { default: this.defaultFontWeight } },
          parseDOM: [
            {
              tag: 'span[style*="font-weight"]',
              getAttrs: (node: any) => {
                const weight = node.style.fontWeight;
                return weight ? { weight } : null;
              }
            },
            // Optional: Falls alter Text noch <b> oder <strong> hat, als '700' erkennen
            { tag: 'strong', getAttrs: () => ({ weight: '700' }) },
            { tag: 'b', getAttrs: () => ({ weight: '700' }) }
          ],
          toDOM: (mark: any) => ['span', { style: `font-weight: ${mark.attrs.weight};` }, 0]
        },
        fontFamily: {
          attrs: { family: { default: null } },
          parseDOM: [{
            tag: '[style*="font-family"]',
            getAttrs: (node: any) => {
              // Entfernt ggf. vom Browser hinzugefügte Anführungszeichen für sauberen Abgleich
              const family = node.style.fontFamily;
              return family ? { family } : null;
            }
          }],
          toDOM: (mark: any) => ['span', { style: `font-family: ${mark.attrs.family};` }, 0]
        }
      })
    });

    const doubleSpaceRule = new InputRule(/  $/, (state, match, start, end) => {
      return state.tr.insertText('\u00a0\u00a0', start, end); // \u00a0 ist das Unicode-Zeichen für &nbsp;
    });
    const leadingSpaceRule = new InputRule(/^ $/, (state, match, start, end) => {
      return state.tr.insertText('\u00a0', start, end);
    });

    // Hilfs-Plugin: Überträgt Farb-Marks & Text-Ausrichtung automatisch auf ALLE markierten Zellen
    const multiCellFormatPlugin = new Plugin({
      appendTransaction(transactions, oldState, newState) {
        if (!(oldState.selection instanceof CellSelection)) return null;

        const docChanged = transactions.some(tr => tr.docChanged);
        if (!docChanged) return null;

        let targetAlign: string | null | undefined = undefined;
        const addedColorMarks: any[] = [];

        transactions.forEach(tr => {
          tr.steps.forEach((step: any) => {
            // 1. AttrStep (wenn ngx-editor nur das align/textAlign-Attribut am Absatz ändert)
            if (step.jsonID === 'attr' && (step.attr === 'align' || step.attr === 'textAlign')) {
              targetAlign = step.value;
            }
            // 2. ReplaceStep / ReplaceAroundStep (falls Block ersetzt wurde)
            if ((step.jsonID === 'replace' || step.jsonID === 'replaceAround') && step.slice?.content?.firstChild?.attrs) {
              const attrs = step.slice.content.firstChild.attrs;
              if (attrs.align !== undefined) targetAlign = attrs.align;
              if (attrs.textAlign !== undefined) targetAlign = attrs.textAlign;
            }
            // 3. Farb-Marks (text_color / background_color)
            if (step.jsonID === 'addMark' && step.mark) {
              addedColorMarks.push(step.mark);
            }
          });
        });

        if (targetAlign === undefined && addedColorMarks.length === 0) return null;

        const tr = newState.tr;
        let modified = false;

        oldState.selection.forEachCell((cell, pos) => {
          // A) Textausrichtung auf alle Absätze in allen markierten Zellen übertragen
          if (targetAlign !== undefined) {
            cell.nodesBetween(0, cell.content.size, (node, innerPos) => {
              if (node.isTextblock) {
                const alignKey = 'textAlign' in node.attrs ? 'textAlign' : 'align';
                if (node.attrs[alignKey] !== targetAlign) {
                  tr.setNodeMarkup(pos + 1 + innerPos, undefined, {
                    ...node.attrs,
                    [alignKey]: targetAlign
                  });
                  modified = true;
                }
              }
            });
          }

          // B) Farb-Marks auf alle markierten Zellen anwenden
          if (addedColorMarks.length > 0) {
            const from = pos + 1;
            const to = pos + cell.nodeSize - 1;
            if (from < to) {
              addedColorMarks.forEach(mark => {
                tr.addMark(from, to, mark);
                modified = true;
              });
            }
          }
        });

        return modified ? tr : null;
      }
    });

    const preserveSelectionOnRightClick = new Plugin({
      props: {
        handleDOMEvents: {
          mousedown: (view, event: MouseEvent) => {
            // Nur Rechtsklick (button === 2) prüfen
            if (event.button !== 2) return false;

            const target = event.target as HTMLElement | null;
            const cell = target?.closest('td, th');

            // Wenn bereits eine Mehrfachauswahl aktiv ist UND der Rechtsklick in einer markierten Zelle erfolgt:
            if (cell?.classList.contains('selectedCell') && view.state.selection instanceof CellSelection) {
              event.preventDefault();
              return true; // <-- Zwingt ProseMirror, das Event zu ignorieren und die Auswahl zu behalten!
            }

            return false;
          }
        }
      }
    });

    this.editor = new Editor({
      schema: mySchema,
      nodeViews: {
        table: (node, view, getPos) => new ResizableTableView(node, view, getPos, () => this.disableOkBtn(false))
      },
      plugins: [
        columnResizing({
          handleWidth: 6,          // Breite des Greifbereichs auf der Spaltenlinie (in px)
          cellMinWidth: 40,        // Mindestbreite einer Spalte (in px)
          lastColumnResizable: true
        }),
        tableEditing(),
        preserveSelectionOnRightClick,
        multiCellFormatPlugin,
        keymap({
          Tab: goToNextCell(1),
          'Shift-Tab': goToNextCell(-1),
        }),
        inputRules({
          rules: [
            leadingSpaceRule,
            doubleSpaceRule
          ]
        }),
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
      // 1. Werte sofort nach dem Rendern synchronisieren
      setTimeout(() => {
        this.updateCurrentFontFamily();
        this.updateCurrentFontSize();
        this.updateCurrentFontWeight();
        this.updateCurrentBlockType();
        this.updateEditorContrast();
        this.cdr.detectChanges();
      }, 150);

      // 2. Fokus erst NACH Ende der Modal-Animation erzwingen, damit NzModal ihn nicht wieder klaut
      this.subscriptions.push(
        this.modalRef.afterOpen.subscribe(() => {
          setTimeout(() => {
            this.editor?.view?.focus();
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

    let actualFile: File | null = null;
    if (file instanceof File) {
      actualFile = file;
    } else if (file.originFileObj) {
      actualFile = file.originFileObj;
    }

    if (!actualFile) return false;

    this.rawSelectedFile = actualFile;

    if (!actualFile.type.startsWith('image/')) {
      this.isOversizedImage = false;
      this.imageDimensionsInfo = '';
      this.finalizeFileSelection(actualFile);
      return false;
    }

    // Beim Auswählen einer neuen Datei: Voreinstellung anhand der echten Bildmaße ermitteln
    this.initImageSelection(actualFile);
    return false;
  };

  private async initImageSelection(file: File): Promise<void> {
    const img = await this.loadImageFromFile(file);
    this.isOversizedImage = img.naturalWidth > 1920 || img.naturalHeight > 1080;

    // Nur wenn das Bild größer als 1920x1080 ist, wird 'max' vorausgewählt – sonst immer 'original'!
    this.resizeMode = this.isOversizedImage ? 'max' : 'original';

    await this.processSelectedImage();
  }

  async processSelectedImage(): Promise<void> {
    if (!this.rawSelectedFile) return;

    const file = this.rawSelectedFile;
    const img = await this.loadImageFromFile(file);
    const origW = img.naturalWidth;
    const origH = img.naturalHeight;

    const maxW = 1920;
    const maxH = 1080;

    // 1. Wenn "Originalgröße" gewählt oder Bild bereits kleiner/gleich 1920x1080 ist
    if (this.resizeMode === 'original' || (origW <= maxW && origH <= maxH)) {
      this.finalImageSize = { width: origW, height: origH }; // <-- Hier origW / origH setzen!
      this.imageDimensionsInfo = `Ausgabe: ${origW} × ${origH} px (Original)`;
      this.finalizeFileSelection(file);
      return;
    }

    // 2. Proportional auf max. 1920x1080 herunterrechnen
    const ratio = Math.min(maxW / origW, maxH / origH);
    const targetW = Math.round(origW * ratio);
    const targetH = Math.round(origH * ratio);
    this.finalImageSize = { width: targetW, height: targetH }; // <-- Hier die skalierten targetW / targetH setzen!

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.finalImageSize = { width: origW, height: origH };
      this.finalizeFileSelection(file);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Transparenz bei PNG/WebP erhalten, Fotos als hochwertiges JPEG speichern
    const outputType = (file.type === 'image/png' || file.type === 'image/webp')
      ? file.type
      : 'image/jpeg';

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, outputType, 0.9)
    );

    if (!blob) {
      this.finalizeFileSelection(file);
      return;
    }

    const resizedFile = new File([blob], file.name, {
      type: outputType,
      lastModified: Date.now()
    });

    this.imageDimensionsInfo = `Original: ${origW} × ${origH} px → Optimiert: ${targetW} × ${targetH} px`;
    this.finalizeFileSelection(resizedFile);
  }

  private finalizeFileSelection(file: File): void {
    const isLtLimit = (file.size / 1024 / 1024) < this.MAX_FILE_SIZE_MB;

    if (!isLtLimit) {
      this.notify.createNotification(
        'warning',
        'Server-Meldung',
        `Datei muss kleiner als ${this.MAX_FILE_SIZE_MB}MB sein!`
      );
      this.selectedFile = null;
      if (this.previewUrl) {
        URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = null;
      }
      this.disableOkBtn(true);
      this.cdr.detectChanges();
      return;
    }

    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.selectedFile = file;
    this.previewUrl = URL.createObjectURL(file);
    this.disableOkBtn(false);
    this.cdr.detectChanges();
  }

  private loadImageFromFile(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  handleRemove = (): boolean => {
    this.fileList = [];
    this.selectedFile = null;
    this.rawSelectedFile = null;
    this.imageDimensionsInfo = '';
    this.finalImageSize = null;

    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
    this.disableOkBtn(true);
    return true;
  };

  apply(): any {
    if (this.type === 'text') {  // && this.htmlContent
      return this.editorText;
    }
    if (this.type === 'file' && this.selectedFile) {
      return {
        file: this.selectedFile,
        previewUrl: this.previewUrl,
        dimensions: this.finalImageSize
      };
    }
    if (this.type === 'color') {
      return this.selectedColor;
    }
    if (this.type === 'plan') {
      return this.plans;
    }
    return false; // Verhindert Schließen, wenn nichts gewählt wurde
  }

  /**
  * Wendet ein Mark (z. B. bold, italic, text_color, font_size) auf alle markierten Zellen an
  */
  applyMarkToSelection(markType: MarkType, attrs: Record<string, any> | null = null): void {
    const { state, dispatch } = this.editor.view;
    const { selection, tr } = state;

    if (selection instanceof CellSelection) {
      selection.forEachCell((cell, pos) => {
        const from = pos + 1;
        const to = pos + cell.nodeSize - 1;
        if (attrs) {
          tr.addMark(from, to, markType.create(attrs));
        } else {
          tr.removeMark(from, to, markType);
        }
      });
      dispatch(tr);
      this.editor.view.focus();
    }
  }

  /**
  * Wendet Block-Attribute (z. B. textAlign: 'center') auf alle Absätze in allen markierten Zellen an
  */
  applyAlignmentToCells(align: 'left' | 'center' | 'right' | 'justify'): void {
    const { state, dispatch } = this.editor.view;
    const { selection, tr } = state;

    if (selection instanceof CellSelection) {
      selection.forEachCell((cell, pos) => {
        cell.nodesBetween(0, cell.content.size, (node, innerPos) => {
          if (node.isTextblock) {
            tr.setNodeMarkup(pos + 1 + innerPos, undefined, {
              ...node.attrs,
              align
            });
          }
        });
      });
      dispatch(tr);
      this.editor.view.focus();
    }
  }

  setExactFontFamily(newFamily: string): void {
    if (!this.editor?.view) return;

    const { state, dispatch } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontFamily'];
    if (!markType) return;

    const { from, to, empty } = state.selection;
    this.currentFontFamily = newFamily || '';
    const tr = state.tr;

    if (!newFamily) {
      if (empty) {
        tr.removeStoredMark(markType);
      } else {
        tr.removeMark(from, to, markType);
      }
    } else {
      if (empty) {
        tr.addStoredMark(markType.create({ family: newFamily }));
      } else {
        tr.removeMark(from, to, markType);
        tr.addMark(from, to, markType.create({ family: newFamily }));
      }
    }
    dispatch(tr);
    this.editor.view.focus();

    if (!empty) {
      this.disableOkBtn(false); // <-- NEU
    }
  }

  updateCurrentFontFamily(): void {
    if (!this.editor?.view) return;

    const { state } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontFamily'];
    const { from, to, empty, $from } = state.selection;

    let foundFamily = '';

    if (!empty) {
      state.doc.nodesBetween(from, to, (node) => {
        const familyMark = node.marks.find(m => m.type === markType);
        if (familyMark) {
          foundFamily = familyMark.attrs['family'];
        }
      });
    } else {
      // 1. Wenn explizit ein Mark für das nächste Zeichen vorgemerkt wurde (z.B. gerade im Dropdown gewählt)
      if (state.storedMarks) {
        const stored = state.storedMarks.find(m => m.type === markType);
        foundFamily = stored ? stored.attrs['family'] : '';
      } else if ($from.nodeAfter) {
        // 2. Entscheidend: Was steht RECHTS vom Cursor (z.B. "YOGA")?
        // Wenn "YOGA" kein fontFamily-Mark hat, bleibt foundFamily leer ('') = Standard!
        const rightMark = $from.nodeAfter.marks.find(m => m.type === markType);
        foundFamily = rightMark ? rightMark.attrs['family'] : '';
      } else {
        // 3. Cursor steht ganz am Ende der Zeile -> Marks von links übernehmen
        const leftMark = $from.marks().find(m => m.type === markType);
        foundFamily = leftMark ? leftMark.attrs['family'] : '';
      }

      // 4. Nur wenn der Cursor ganz am Anfang eines Absatzes steht und rechts noch ein Leerzeichen liegt
      if (!foundFamily && $from.parentOffset === 0 && $from.parent) {
        $from.parent.forEach((child) => {
          if (!foundFamily && child.isText) {
            const found = child.marks.find(m => m.type === markType);
            if (found) foundFamily = found.attrs['family'];
          }
        });
      }
    }

    const normalizeFont = (str: string) =>
      str.replace(/["']/g, '').replace(/\s*,\s*/g, ',').trim().toLowerCase();

    const match = this.allFontFamilies.find(
      f => normalizeFont(f.value) === normalizeFont(foundFamily)
    );
    this.currentFontFamily = match ? match.value : '';
  }

  setBlockTypeOption(value: string): void {
    const view = this.editor?.view;
    if (!view) return;

    const { state, dispatch } = view;
    this.currentBlockType = value;

    if (value === 'paragraph') {
      const paragraphType = state.schema.nodes['paragraph'];
      if (paragraphType) {
        setBlockType(paragraphType)(state, dispatch);
      }
    } else if (value.startsWith('h')) {
      const level = Number(value.replace('h', ''));
      const headingType = state.schema.nodes['heading'];
      if (headingType) {
        setBlockType(headingType, { level })(state, dispatch);
      }
    }
    this.updateCurrentFontSize();
    view.focus();
  }

  updateCurrentBlockType(): void {
    if (!this.editor?.view) return;

    const { $from } = this.editor.view.state.selection;
    const parent = $from.parent;

    if (parent?.type.name === 'heading') {
      this.currentBlockType = `h${parent.attrs['level']}`;
    } else {
      this.currentBlockType = 'paragraph';
    }
  }

  /**
  * Setzt das im Dropdown gewählte font-weight auf die Auswahl
  */
  setExactFontWeight(newWeight: string): void {
    if (!this.editor?.view) return;

    const { state, dispatch } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontWeight'];
    if (!markType) return;

    const { from, to, empty } = state.selection;
    this.currentFontWeight = newWeight || this.defaultFontWeight;
    const tr = state.tr;

    if (!newWeight || newWeight === this.defaultFontWeight) {
      // Standard gewählt -> Mark entfernen
      if (empty) {
        tr.removeStoredMark(markType);
      } else {
        tr.removeMark(from, to, markType);
      }
    } else {
      // Gewünschtes font-weight setzen
      if (empty) {
        tr.addStoredMark(markType.create({ weight: newWeight }));
      } else {
        tr.removeMark(from, to, markType);
        tr.addMark(from, to, markType.create({ weight: newWeight }));
      }
    }
    dispatch(tr);
    this.editor.view.focus();

    if (!empty) {
      this.disableOkBtn(false); // <-- NEU
    }
  }

  /**
   * Liest das aktuelle font-weight an der Cursor-Position aus (für das Dropdown)
   */
  updateCurrentFontWeight(): void {
    if (!this.editor?.view) return;

    const { state } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontWeight'];
    if (!markType) return;

    const { from, to, empty, $from } = state.selection;
    let foundWeight = '';

    if (!empty) {
      // Fall 1: Text ist markiert
      state.doc.nodesBetween(from, to, (node) => {
        const weightMark = node.marks.find(m => m.type === markType);
        if (weightMark) {
          foundWeight = weightMark.attrs['weight'];
        }
      });
    } else {
      // Fall 2: Cursor blinkt ohne Markierung
      if (state.storedMarks) {
        // 1. Explizit im Dropdown gewähltes Mark für das nächste Zeichen
        const stored = state.storedMarks.find(m => m.type === markType);
        foundWeight = stored ? stored.attrs['weight'] : '';
      } else if ($from.nodeAfter) {
        // 2. Zeichen rechts vom Cursor prüfen (verhindert Hängenbleiben am vorherigen Wort)
        const rightMark = $from.nodeAfter.marks.find(m => m.type === markType);
        foundWeight = rightMark ? rightMark.attrs['weight'] : '';
      } else {
        // 3. Ganz am Zeilenende -> Marks von links übernehmen
        const leftMark = $from.marks().find(m => m.type === markType);
        foundWeight = leftMark ? leftMark.attrs['weight'] : '';
      }

      // 4. Nur am absoluten Zeilenanfang im gesamten Absatz nach dem ersten Mark suchen
      if (!foundWeight && $from.parentOffset === 0 && $from.parent) {
        $from.parent.forEach((child) => {
          if (!foundWeight && child.isText) {
            const found = child.marks.find(m => m.type === markType);
            if (found) {
              foundWeight = found.attrs['weight'];
            }
          }
        });
      }
    }

    // Falls ein Wert wie 'bold' oder 'normal' aus altem HTML kommt, auf Zahlenwert mappen
    if (foundWeight === 'bold') foundWeight = '700';
    if (foundWeight === 'normal') foundWeight = '400';

    const match = this.fontWeights.find(fw => fw.value === foundWeight);
    this.currentFontWeight = match ? match.value : this.defaultFontWeight;
  }

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

  // onTextChange(htmlOutput: string) {
  //   this.editorText = htmlOutput;
  //   if (this.initText) {
  //     this.disableOkBtn(true);
  //     this.initText = false;
  //   } else {
  //     this.disableOkBtn(false);
  //     this.editorText = htmlOutput;
  //   }
  //   this.updateEditorContrast(); // <-- Prüft bei jeder Änderung den Kontrast
  // }

  onTextChange(htmlOutput: string) {
    this.editorText = htmlOutput;
    if (this.initText) {
      this.disableOkBtn(true);
      this.initText = false;
      // NEU: Sobald der initiale HTML-Text geladen ist, Toolbar-Anzeigen synchronisieren
      setTimeout(() => {
        this.updateCurrentFontFamily();
        this.updateCurrentFontSize();
        this.updateCurrentFontWeight();
        this.updateCurrentBlockType();
      });
    } else {
      this.disableOkBtn(false);
    }
    this.updateEditorContrast();
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

    if (!empty) {
      this.disableOkBtn(false); // <-- NEU
    }
  }

  private ensureFontSizeInList(sizeStr: string): void {
    if (sizeStr && !this.fontSizes.includes(sizeStr)) {
      this.fontSizes = [...this.fontSizes, sizeStr].sort(
        (a, b) => parseFloat(a) - parseFloat(b)
      );
    }
  }

  updateCurrentFontSize(): void {
    if (!this.editor?.view) return;

    const { state } = this.editor.view;
    const markType: MarkType = state.schema.marks['fontSize'];
    const { from, to, empty, $from } = state.selection;

    let currentSizeStr = '';
    let parentTagName = 'p';

    // Umschließenden Block-Typ ermitteln (gilt für Markierung & Cursor)
    if ($from.parent && $from.parent.type.name === 'heading') {
      parentTagName = `h${$from.parent.attrs['level']}`;
    }

    if (!empty) {
      // Fall 1: Text ist markiert
      state.doc.nodesBetween(from, to, (node) => {
        const fontSizeMark = node.marks.find(m => m.type === markType);
        if (fontSizeMark) {
          currentSizeStr = fontSizeMark.attrs['size'];
        }
        if (node.type.name === 'heading') {
          parentTagName = `h${node.attrs['level']}`;
        }
      });
    } else {
      // Fall 2: Cursor blinkt ohne Markierung
      let fontSizeMark: Mark | undefined;

      if (state.storedMarks) {
        // 1. Gerade im Dropdown gewählte Größe für das nächste Zeichen
        fontSizeMark = state.storedMarks.find(m => m.type === markType);
      } else if ($from.nodeAfter) {
        // 2. Entscheidend: Zeichen RECHTS vom Cursor zuerst prüfen!
        fontSizeMark = $from.nodeAfter.marks.find(m => m.type === markType);
      } else {
        // 3. Ganz am Zeilenende -> Größe von links übernehmen
        fontSizeMark = $from.marks().find(m => m.type === markType);
      }

      // 4. Nur am absoluten Zeilenanfang im gesamten Absatz nach dem ersten fontSize-Mark suchen
      if (!fontSizeMark && $from.parentOffset === 0 && $from.parent) {
        $from.parent.forEach((child) => {
          if (!fontSizeMark && child.isText) {
            const found = child.marks.find(m => m.type === markType);
            if (found) {
              fontSizeMark = found;
            }
          }
        });
      }

      if (fontSizeMark) {
        currentSizeStr = fontSizeMark.attrs['size'];
      }
    }

    const sizeNum = this.getCurrentSizeNum(currentSizeStr, parentTagName);
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
    // this.checkForInterval();
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
    // this.checkForInterval();
  }

  disableOkBtn(value: boolean) {
    // Aktualisiert die Konfiguration des Modals von innen
    this.modalRef.updateConfig({
      nzOkDisabled: value
    });
  }

  onEditorContextMenu(event: MouseEvent, menu: NzDropdownMenuComponent): void {
    if (this.isInTable) {
      event.preventDefault();
      this.isContextMenuOpen = true;
      const ref = this.nzContextMenuService.create(event, menu);
      ref.onDestroy(() => {
        this.isContextMenuOpen = false;
      });
    }
  }

  insertTable(rows: number, cols: number): void {
    const { state, dispatch } = this.editor.view;
    const { table, table_row, table_cell, paragraph } = state.schema.nodes;
    if (!table) return;

    const rowNodes = [];
    for (let r = 0; r < rows; r++) {
      const cellNodes = [];
      for (let c = 0; c < cols; c++) {
        cellNodes.push(table_cell.createAndFill()!);
      }
      rowNodes.push(table_row.create(null, cellNodes));
    }

    const newTable = table.create(null, rowNodes);
    const nodes = paragraph ? [newTable, paragraph.create()] : [newTable];
    const fragment = Fragment.from(nodes);

    const insertPos = state.selection.from;
    const tr = state.tr.replaceSelection(new Slice(fragment, 0, 0));

    // Cursor direkt in die allererste Zelle oben links setzen
    const firstCellPos = Math.min(insertPos + 3, tr.doc.content.size);
    tr.setSelection(TextSelection.near(tr.doc.resolve(firstCellPos)));

    dispatch(tr.scrollIntoView());

    this.disableOkBtn(false);
    this.tableMenuVisible = false;
    this.hoverRows = 0;
    this.hoverCols = 0;
    this.editor.view.focus();
  }

  execTableCmd(cmd: 'rowBefore' | 'rowAfter' | 'delRow' | 'colBefore' | 'colAfter' | 'delCol' | 'delTable'): void {
    const { state, dispatch } = this.editor.view;
    const commands = {
      rowBefore: addRowBefore,
      rowAfter: addRowAfter,
      delRow: deleteRow,
      colBefore: addColumnBefore,
      colAfter: addColumnAfter,
      delCol: deleteColumn,
      delTable: deleteTable,
    };

    commands[cmd](state, dispatch);
    this.tableMenuVisible = false;
    this.disableOkBtn(false);
    this.editor.view.focus();
  }

  setTableBorder(patch: {
    borderMode?: string;
    borderStyle?: string;
    borderWidth?: string;
    borderColor?: string;
  }, keepMenuOpen = false): void {
    const { state, dispatch } = this.editor.view;
    const { $head } = state.selection;

    for (let d = $head.depth; d > 0; d--) {
      const node = $head.node(d);
      if (node.type.name === 'table') {
        const nextAttrs = { ...node.attrs, ...patch };
        if ((patch.borderStyle || patch.borderWidth || patch.borderColor) && nextAttrs.borderMode === 'none') {
          nextAttrs.borderMode = 'all';
        }
        dispatch(state.tr.setNodeMarkup($head.before(d), undefined, nextAttrs));
        this.disableOkBtn(false);
        break;
      }
    }

    if (!keepMenuOpen) {
      this.nzContextMenuService.close();
      this.isContextMenuOpen = false;
      this.tableMenuVisible = false;
      this.editor.view.focus();
    }
  }

  setCellBackgroundColor(color: string | null): void {
    const { state, dispatch } = this.editor.view;
    setCellAttr('background', color)(state, dispatch);
    this.editor.view.focus();
    this.disableOkBtn(false);
  }



  /////////////////// Cell-BackgroundColor
  pickerTarget: 'border' | 'cell' = 'border';
  currentPickerColor = '#000000';
  private savedCellSelection: CellSelection | null = null;
  currentCellBgColor = '#e6f7ff';

  openColorPicker(target: 'border' | 'cell', event?: MouseEvent): void {
    this.pickerTarget = target;

    if (target === 'cell') {
      const sel = this.editor?.view?.state.selection;
      this.savedCellSelection = sel instanceof CellSelection ? sel : null;
      this.currentPickerColor = this.currentCellBgColor;
    } else {
      this.savedCellSelection = null;
      this.currentPickerColor = this.currentTableBorderColor;
    }

    if (event) {
      this.pickerPos = {
        x: Math.min(window.innerWidth - 260, Math.max(16, event.clientX - 100)),
        y: Math.min(window.innerHeight - 360, Math.max(16, event.clientY + 8))
      };
    }

    this.nzContextMenuService.close();
    this.isContextMenuOpen = false;

    setTimeout(() => {
      this.borderPickerTrigger?.openDialog();
    }, 50);
  }

  onPickerColorUpdate(color: string, closeAfter: boolean): void {
    this.currentPickerColor = color;

    if (this.pickerTarget === 'border') {
      this.currentTableBorderColor = color;
      this.setTableBorder({ borderColor: color }, !closeAfter);
    } else {
      // Zell-Hintergrundfarbe auf aktive oder gemerkte Mehrfachauswahl anwenden
      const { state, dispatch } = this.editor.view;
      if (!(state.selection instanceof CellSelection) && this.savedCellSelection) {
        dispatch(state.tr.setSelection(this.savedCellSelection));
      }
      setCellAttr('background', color)(this.editor.view.state, this.editor.view.dispatch);
      this.disableOkBtn(false);
    }

    if (closeAfter) {
      this.currentCellBgColor = color;
      this.borderPickerTrigger?.closeDialog();
      this.isBorderPickerOpen = false;
      this.editor.view.focus();
    }
  }

  resetPickerColor(): void {
    if (this.pickerTarget === 'border') {
      this.currentTableBorderColor = '#000000';
      this.setTableBorder({ borderColor: 'currentColor' }, false);
    } else {
      const { state, dispatch } = this.editor.view;
      if (!(state.selection instanceof CellSelection) && this.savedCellSelection) {
        dispatch(state.tr.setSelection(this.savedCellSelection));
      }
      setCellAttr('background', null)(this.editor.view.state, this.editor.view.dispatch);
      this.disableOkBtn(false);
    }
    this.borderPickerTrigger?.closeDialog();
    this.isBorderPickerOpen = false;
    this.editor.view.focus();
  }


  ////////////////////// war vorher da
  // openBorderColorPicker(event?: MouseEvent): void {
  //   if (event) {
  //     // Position des Klicks (leicht nach links/unten versetzt, damit der Picker nicht am rechten Rand klebt)
  //     this.pickerPos = {
  //       x: Math.min(window.innerWidth - 260, Math.max(16, event.clientX - 100)),
  //       y: Math.min(window.innerHeight - 360, Math.max(16, event.clientY + 8))
  //     };
  //   }

  //   this.nzContextMenuService.close();
  //   this.isContextMenuOpen = false;

  //   setTimeout(() => {
  //     this.borderPickerTrigger?.openDialog();
  //   }, 50);
  // }

}
