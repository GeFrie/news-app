import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { ImageUrlPipe } from '../pipes/image-url.pipe';


import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';

import { filter, forkJoin, map, Observable, of, Subscription, switchMap, tap } from 'rxjs';

import { ItemService, LivePreviewData } from '../services/item.service';
import { Item, Plan } from '../interfaces/item';


import { ModalManagerService } from '../services/modal.manager.service';
import { NotificationService } from '../services/notification.service';

import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';

import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { EditorConfigService } from '../services/editor.config.service';
import { SaveState, SaveStateService } from '../services/save.state.service';
import { PlanService } from '../services/plan.service';
import { SortService } from '../services/sort.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    RouterOutlet, RouterLink, RouterLinkActive,
    NzLayoutModule,
    NzModalModule,
    NzButtonModule,
    NzGridModule,
    NzSpaceModule,
    NzSwitchModule,
    NzTooltipModule,
    NzMenuModule,
    NzIconModule,
    NzRadioModule,
    NzDatePickerModule,
    NzInputNumberModule,
    AsyncPipe,
    ImageUrlPipe,
    SafeHtmlPipe,
    SafeUrlPipe,
    DatePipe,
    DragDropModule,
  ],
  templateUrl: './dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './dashboard.component.scss',
})

export class DashboardComponent implements OnInit, OnDestroy {

  public itemService = inject(ItemService);

  readonly SaveState = SaveState;

  subscriptions: Subscription[] = [];

  showText: boolean = true;
  showFile: boolean = true;
  showColor: boolean = true;
  showBoxes: boolean = true;

  isNew: boolean = false;
  removable: boolean = false;

  isDeleting = false;
  isSaving = false;

  items: Item[] = [];

  rightSiderWidth = 250;

  selectedItem$ = this.itemService.selectedItem$; // für Async-Pipe

  currentRoute: any;

  plans: Plan[] = [];

  liveItem: LivePreviewData | null = null;

  activeMode: 'all' | 'changes' | 'specific' = 'all';

  customPreviewDate: Date = new Date(); // Für den ng-zorro DatePicker

  kioskDuration: number = 6;

  private cdr = inject(ChangeDetectorRef);
  public activeSelectedId: number | null = null;
  previewDuration: number = 2;

  constructor(
    public modalManager: ModalManagerService,
    private modalService: NzModalService,
    private configService: EditorConfigService,
    private router: Router,
    private notify: NotificationService,
    public stateService: SaveStateService,
    public planService: PlanService,
    private sortService: SortService,
  ) {
    // this.imgPath = `${environment.apiUrl}uploads/`;

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentRoute = event.urlAfterRedirects.split('/').pop() || '';
    });
  }

  ngOnInit() {
    // Das Dashboard sagt dem Service: "Wenn jemand executeDashboardSave ruft, führe MEINE save() aus!"
    this.itemService.registerSaveCallback(() => this.save());

    // Permanentes Abo, das die ID absolut synchron hält, egal wer sie ändert
    this.subscriptions.push(
      this.itemService.selectedItem$.subscribe(item => {
        this.activeSelectedId = item ? item.id : null;
        this.isNew = !!item && item.id === 0; // <-- Automatisch true bei Neu (id=0), sonst immer false!
        this.cdr.detectChanges(); // Jetzt macht der Change-Detector Sinn!
      })
    );

    // NEU: Auf das Live-Item aus der Preview-Zeitschleife hören
    this.subscriptions.push(
      this.itemService.liveItem$.subscribe(item => {
        this.liveItem = item;
        this.cdr.detectChanges(); // Erzwingt das UI-Update im Dashboard
      })
    );

    this.subscriptions.push(
      this.itemService.requestInitialSelection$.subscribe(() => {
        if (this.items && this.items.length > 0) {
          // Wenn die Items bereits geladen sind, einfach das erste direkt selektieren
          this.selectItem(this.items[0], undefined, true);
        } else {
          // Falls sie noch nicht geladen sind, den HTTP-Call starten
          this.loadItems();
        }
      })
    );

    // this.subscriptions.push(
    //   this.itemService.discardChanges$.subscribe(() => {
    //     const currentId = this.itemService.selectedItem?.id;
    //     const originalItem = this.items.find(i => i.id === currentId);

    //     if (originalItem) {
    //       // Kopie des unveränderten Originals (inkl. tiefer Kopie von imageBoxes) wiederherstellen
    //       this.itemService.setSelectedItem({
    //         ...originalItem,
    //         textBox: originalItem.textBox ? { ...originalItem.textBox } : undefined,
    //         imageBoxes: originalItem.imageBoxes
    //           ? originalItem.imageBoxes.map(box => ({ ...box }))
    //           : []
    //       });
    //     } else if (currentId === 0 || currentId) {
    //       this.loadItems();
    //     }
    //     this.stateService.setState(SaveState.SAVED);
    //     this.isNew = false;
    //     this.selectItem(this.items[0]);
    //   })
    // );
    this.subscriptions.push(
      this.itemService.discardChanges$.subscribe(() => {
        const currentId = this.itemService.selectedItem?.id;
        const originalItem = this.items.find(i => Number(i.id) === Number(currentId));

        if (originalItem) {
          // Kopie des unveränderten Originals wieder als aktives Item setzen & ausgewählt lassen
          const restored = {
            ...originalItem,
            textBox: originalItem.textBox ? { ...originalItem.textBox } : undefined,
            imageBoxes: originalItem.imageBoxes
              ? originalItem.imageBoxes.map(box => ({ ...box }))
              : []
          };
          this.itemService.setSelectedItem(restored);
          this.selectItem(restored);
        } else {
          // Fallback: Wenn ein ungespeichertes neues Item (id === 0) verworfen wurde
          this.loadItems();
          if (this.items.length > 0) {
            this.selectItem(this.items[0]);
          }
        }

        this.stateService.setState(SaveState.SAVED);
        this.isNew = false;
      })
    );

    this.subscriptions.push(
      this.configService.getConfig().subscribe({
        next: (config) => {
          if (config['displayDurationSeconds']) {
            this.kioskDuration = config['displayDurationSeconds'];
          }
        }
      })
    );

    this.subscriptions.push(
      this.itemService.reloadFrontend$.subscribe(() => {
        this.configService.getConfig().subscribe(config => {
          if (config['displayDurationSeconds'] && config['displayDurationSeconds'] !== this.kioskDuration) {
            this.kioskDuration = config['displayDurationSeconds'];
            this.cdr.detectChanges();
          }
        });
      })
    );

    if (!this.items || this.items.length === 0) {
      this.loadItems();
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(e => e.unsubscribe());
  }

  onDurationChange(seconds: number): void {
    if (seconds) {
      this.planService.setPreviewDuration(seconds);
    }
  }

  formatterSeconds = (value: number): string => `${value} Sek`;

  parserSeconds = (value: string): number => Number(value.replace(' Sek', '').trim()) || 1;

  // Methode zum Speichern in config.json + Reload-Signal ans Kiosk-Frontend:
  onKioskDurationChange(seconds: number): void {
    if (seconds && seconds > 0) {
      this.configService.saveDisplayDuration(seconds).subscribe({
        next: () => {
          this.itemService.triggerFrontendReload();
        },
        error: (err) => console.error('Fehler beim Speichern der Kiosk-Dauer:', err)
      });
    }
  }

  showModal(type: 'text' | 'file' | 'color' | 'plan') {
    const item = this.itemService.selectedItem;
    if (!item) return;

    // Erstellt eine tiefe Kopie. Das Dashboard-Array bleibt geschützt!
    const plansCopy = this.plans ? structuredClone(this.plans) : [];

    // 1. Modal öffnen und Referenz speichern
    const modalRef = this.modalManager.openEditorModal(type, item, plansCopy);

    // 2. Auf das Schließen im Dashboard warten
    modalRef.afterClose.subscribe(result => {
      if (result) {
        if (type === 'plan') {
          this.plans = result;
        }
        // this.itemChanged = true;
      }
    });
  }

  loadItems(id?: number) {
    this.subscriptions.push(
      this.itemService.listItems().subscribe(data => {
        if (data.length) {
          this.items = data;
          if (id) {
            const item = this.items.find(item => item.id === id);
            if (item) this.selectItem(item, undefined, true);
          } else {
            this.selectItem(data[0], undefined, true);
          }
        } else {
          this.createItem();
        }
        this.removable = this.items.length > 0;
      })
    );
  }

  selectItem(item: Item, event?: MouseEvent, isSystemEvent: boolean = false) {
    // 1. Verhindert, dass der Klick nach einem Drag-Vorgang feuert
    if (event) {
      event.stopPropagation(); // Stoppt das Weiterleiten des Events im DOM
    }

    if (this.itemService.selectedItem?.id === item.id) {
      return;
    }

    if (isSystemEvent) {
      this.itemService.setSelectedItem(item);
      // // ZWINGT ANGULAR, das HTML-Template und [class.selected] sofort neu aufzubauen!
      // this.cdr.detectChanges();
      return;
    }

    if (!this.stateService.hasState(SaveState.SAVED)) {
      this.modalService.warning({
        nzTitle: 'Ungespeicherte Änderungen',
        nzContent: `Am Eintrag <strong>News #${this.itemService.selectedItem?.id}</strong> wurden Änderungen vorgenommen. Möchten Sie diese verwerfen?`,
        nzOkText: 'Verwerfen',
        nzCancelText: 'Zurück',
        nzOkDanger: true,
        nzOnOk: () => {
          // Falls eine ungespeicherte "Neu"-News (id === 0) verworfen wurde, aus dem Array entfernen
          this.items = this.items.filter(i => i.id !== 0);
          this.isNew = false;
          this.stateService.setState(SaveState.SAVED);
          this.itemService.setSelectedItem(item);
        },
        nzOnCancel: () => {
          // Hier explizit nichts tun - das alte Item bleibt selektiert!
        }
      });
    } else {
      this.items = this.items.filter(i => i.id !== 0);
      this.isNew = false;
      this.stateService.setState(SaveState.SAVED);
      this.itemService.setSelectedItem(item);
    }
  }

  createItem() {
    const ix = this.items.push({
      id: 0,
      hintergrund: '',
      text: '',
      sort: null,
      sichtbar: true,
    });
    this.selectItem(this.items[ix - 1]);
    this.isNew = true;
    this.stateService.setState(SaveState.ITEM);
  }

  deleteItem() {
    this.modalService.confirm({
      nzTitle: 'Eintrag löschen',
      nzContent: `News #${this.itemService.selectedItem?.id} wird unwiderruflich gelöscht.`,
      nzOkText: 'Löschen',
      nzOkDanger: true,
      nzOnOk: () => {
        const item = this.itemService.selectedItem;
        if (item && item.id !== undefined) {
          this.isDeleting = true;
          this.itemService.deleteItem(item.id).subscribe({
            next: (success) => {
              if (success) {
                this.notify.createNotification(
                  'success',
                  'Server-Meldung',
                  `News #${this.itemService.selectedItem?.id} wurde in der Datenbank gelöscht.`
                );
                // neue Referenz (Immutability), damit der Sider reagiert
                this.items = this.items.filter(item => item.id !== this.itemService.selectedItem?.id);
                // Auswahl auf das erste Item setzen || neues Item
                if (this.items.length > 0) {
                  this.selectItem(this.items[0]);
                } else {
                  this.createItem();
                }
                // Image-File löschen, falls vorhanden und gewünscht
              } else {
                this.notify.createNotification(
                  'error',
                  'Server-Fehler',
                  `News #${this.itemService.selectedItem?.id} konnte nicht gelöscht werden.`,
                  0
                );
              }
            },
            error: () => {
              this.notify.createNotification(
                'error',
                'Server-Fehler',
                `News #${this.itemService.selectedItem?.id} konnte nicht gelöscht werden.`,
                0
              );
            },
            complete: () => {
              this.isDeleting = false;
              this.stateService.setState(SaveState.SAVED);
              this.isNew = false;
            }
          });
        }
      }
    });
  }

  save(): Observable<any> {
    const messages: string[] = [];
    this.isSaving = true;

    // 1. SCHRITT: Item-Task vorbereiten
    const itemTask$ = this.stateService.hasState(SaveState.ITEM)
      ? this.itemService.saveItem()
      : of({ success: true, isSkipped: true });

    return itemTask$.pipe(
      switchMap(itemRes => {
        if (!itemRes?.success) {
          throw new Error('News konnte nicht gespeichert werden.');
        }

        const idToSelect = itemRes.newId || this.itemService.selectedItem?.id;

        if (!itemRes.isSkipped) {
          messages.push(`News #${idToSelect} wurde in der Datenbank gespeichert.`);
          this.loadItems(idToSelect);

          setTimeout(() => {
            const element = document.getElementById('thumb-' + idToSelect);
            element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 50);
        }

        // 2. SCHRITT: Bedingungen für Folge-Tasks prüfen
        const hasPlan = this.stateService.hasState(SaveState.PLAN) && idToSelect;
        const hasSort = this.stateService.hasState(SaveState.SORT);

        // FALL A: Sowohl Plan als auch Sortierung wurden geändert -> Parallel feuern
        if (hasPlan && hasSort) {
          // ID-Injektion ergänzt, falls savePlan(id, plans) die ID verlangt
          return forkJoin({
            plan: this.planService.savePlan(this.plans),
            sort: this.sortService.saveSort(this.items)
          });
        }
        // FALL B: NUR der Plan wurde geändert 
        if (hasPlan) {
          return this.planService.savePlan(this.plans).pipe(
            map(planRes => ({ plan: planRes }))
          );
        }
        // FALL C: NUR die Sortierung wurde geändert
        if (hasSort) {
          return this.sortService.saveSort(this.items).pipe(
            map(sortRes => ({ sort: sortRes }))
          );
        }
        // FALL D: Nichts von beidem wurde geändert
        return of({});
      }),
      // NEU: tap fängt Ergebnisse, Fehler und den Abschluss für die UI ab
      tap({
        next: (results: any) => {
          // Verarbeitung greift sauber
          if (results.plan && results.plan.success) {
            messages.push(`Zeitpläne wurden aktualisiert.`);
          }

          if (results.sort && results.sort.success) {
            messages.push(`Sortierung wurde aktualisiert.`);
          }

          // Erst NACH dem erfolgreichen Speichern in der DB das Frontend benachrichtigen!
          this.itemService.triggerFrontendReload();
          this.isNew = false;

          // 3. SCHRITT: Benachrichtigung anzeigen
          if (messages.length > 0) {
            this.notify.createNotification(
              'success',
              'Server-Meldung',
              messages.join('\n'),
              4500,
            );
          }
        },
        error: (err: any) => {
          console.error('Fehler beim Speichern:', err);
          this.notify.createNotification(
            'error',
            'Server-Meldung',
            `Fehler beim Speichern:\n${err.message || err}`,
            4500,
            'topRight'
          );
        },
        finalize: () => {
          // Wird ausgeführt, sobald die Kette fertig ist (egal ob Erfolg oder Error)
          this.isSaving = false;
        }
      })
    );
  }

  discardChanges(): void {
    this.itemService.executeDashboardDiscard();
    // this.items.pop();
    // this.selectItem(this.items[0]);
    // this.stateService.setState(SaveState.SAVED);
    // this.isNew = false;
  }

  // hideView(type: 'text' | 'file' | 'color') {
  //   const configKey = type === 'text' ? 'showText' : (type === 'file' ? 'showFile' : 'showColor');
  //   this.configService.updateView(configKey, this[configKey]);
  //   this.stateService.addState(SaveState.ITEM);
  // }
  hideView(type: 'text' | 'file' | 'color' | 'boxes') {
    const map = {
      text: 'showText',
      file: 'showFile',
      color: 'showColor',
      boxes: 'showBoxes',
    } as const;
    const configKey = map[type];
    this.configService.updateView(configKey, this[configKey]);

    if (type !== 'boxes') {
      this.stateService.addState(SaveState.ITEM);
    }
  }

  changeVisibility(event: any) {
    this.itemService.updateVisibility(event);
    // this.itemChanged = true;
  }

  get validItems() {
    return this.items.filter(item => item.id > 0);
  }

  onDrop(event: CdkDragDrop<Item[]>) {
    if (event.previousContainer === event.container) {
      // Interne Sortierung
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      // Transfer vom Sider in die Sort-Fläche
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
    // Danach die neue 'sort'-Eigenschaft für alle Items im Ziel-Array berechnen
    this.recalculateSortOrder();
  }

  recalculateSortOrder() {
    this.validItems.forEach((item, index) => {
      item.sort = index + 1;
    });
    // this.itemChanged = true;
    this.stateService.addState(SaveState.SORT);
  }

  onDragStarted(): void {
    // Setzt den Cursor auf das gesamte Dokument-Root (höchste Instanz)
    document.documentElement.style.setProperty('cursor', 'move', 'important');
  }

  onDragEnded(): void {
    // Entfernt den Cursor-Zwang sofort nach dem Drop
    document.documentElement.style.removeProperty('cursor');
  }

  // onSkipToNextClick(): void {
  //   // Ruft die Skip-Methode im planService auf, die das Signal an die Preview funkt
  //   this.planService.triggerSkipToNext();
  // }

  onModeChange(mode: 'all' | 'changes' | 'specific'): void {
    this.activeMode = mode;

    if (mode === 'specific') {
      this.onTimeChange(this.customPreviewDate);
    } else {
      this.planService.setPreviewMode(mode);
    }
  }

  onTimeChange(date: Date): void {
    if (!date) return;
    this.customPreviewDate = date;

    // Formatiert das gewählte Date-Objekt in Ihren PHP-kompatiblen ISO-String
    const isoStr = this.formatToLocalIso(date);
    this.planService.jumpToSpecificTime(isoStr);
  }

  private formatToLocalIso(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }

}
