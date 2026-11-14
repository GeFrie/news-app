import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { ArrayConversion } from '../shared/utils/array-conversion.utils';
import { map, mergeAll, of, Subscription, tap } from 'rxjs';
import { CalcDate, Item, Plan } from '../interfaces/item';
import { ViewService } from '../services/view.service';
import { PlanService, PreviewCommand } from '../services/plan.service';

import { IsColorPipe } from '../pipes/is-color.pipe';
import { ImageUrlPipe } from '../pipes/image-url.pipe';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { ItemService, LivePreviewData } from '../services/item.service';
import { EditorConfigService } from '../services/editor.config.service';

interface StateChangeEvent {
  changeTime: string;
  action: string;
  currentlyShowing: number[];
}

@Component({
  selector: 'app-preview',
  imports: [
    NzGridModule,
    IsColorPipe,
    ImageUrlPipe,
    SafeUrlPipe,
    SafeHtmlPipe,
  ],
  templateUrl: './preview.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './preview.component.scss',
})

export class PreviewComponent implements OnInit, OnDestroy {
  convertArray = ArrayConversion;
  itemCountH = 1;
  itemCountV = 1;
  subscriptions: Subscription[] = [];

  loading: boolean = true;

  items: Item[] = [];
  plans: Plan[] = [];

  calcDates: CalcDate[] = []; // Nimmt das flache Array aus der PHP-API auf

  validItems: Item[] = [];
  // currentItem: Item | null = null;
  currentItem: LivePreviewData | null = null;

  private rotationTimer: any;
  private minuteCheckTimeout: any;
  private currentRotationIndex = 0;
  private previewDuration = 2;

  // Cache, um zu wissen, welche Bilder bereits geladen sind
  private preloadedImages = new Set<string>();

  defaultFontSize = '16px';

  viewMode: 'all' | 'changes' | 'specific' = 'all';
  currentIndex: number = 0;
  renderedPreviewData: any[] = [];                  // Das, was schlussendlich im HTML landet
  selectedTime: string = new Date().toISOString();  // Dynamisch über ein Input-Feld belegt
  activePreviewTime: string | null = null;          // Speichert die aktuell ausgewählte Vorschau-Zeit zentral in der Klasse
  isPlaying: boolean = false;                       // Steuert, ob die automatische Bild-Rotation läuft

  constructor(
    private viewService: ViewService,
    private planService: PlanService,
    private itemService: ItemService,
    private configService: EditorConfigService,
  ) { }

  ngOnInit(): void {
    // 1. Konfiguration laden
    this.subscriptions.push(
      this.configService.getConfig().subscribe({
        next: (config) => {
          if (config['defaultFontSize']) {
            this.defaultFontSize = config['defaultFontSize'];
          }
          document.documentElement.style.setProperty('--default-font-size', this.defaultFontSize);
        }, error: (err) => {
          console.error('Fehler beim Laden der Konfigurations-JSON, nutze Fallback (5s):', err);
        }
      })
    );

    this.subscriptions.push(
      this.planService.previewDuration$.subscribe((seconds: number) => {
        this.previewDuration = seconds;
        // Wenn die Rotation gerade läuft, Timer sofort mit der neuen Dauer neu starten!
        if (this.isPlaying) {
          this.startRotationTimer();
        }
      })
    );

    // 2. Datenstrom für Items und Pläne
    this.subscriptions.push(
      this.viewService.getItems().pipe(
        tap((items) => {
          this.items = items;
        }),
        map((items) => {
          const itemIds: number[] = items.map(item => item.id);
          if (itemIds.length === 0) {
            return of([]);
          }
          return this.planService.getPreviewPlans(itemIds);
        }),
        mergeAll()
      ).subscribe({
        next: (dates) => {
          this.calcDates = dates;

          this.updateValidItems();
          this.startMinuteSync();
          this.applyFilter();

          // VORAB-LADEN STARTEN: Erst Bilder laden, dann die Anzeige sichtbar machen
          this.preloadAllImages().then(() => {
            this.loading = false;
            this.showNextItem(); // Zeigt nur das 1. Bild an, startet aber NICHT den Timer!
          });
        },
        error: (err) => {
          console.error('Fehler im Datenstrom:', err);
        }
      })
    );
    this.subscriptions.push(
      this.planService.previewCommand$.subscribe((cmd: PreviewCommand) => {
        this.handleDashboardCommand(cmd);
      })
    );
  }

  /**
  * 1. Wird aufgerufen, wenn ein Filter geändert oder auf "Play" (SKIP_NEXT) geklickt wird
  */
  private handleDashboardCommand(cmd: PreviewCommand): void {
    switch (cmd.action) {
      case 'TOGGLE_PLAYBACK':
        this.isPlaying = !this.isPlaying;
        if (this.isPlaying) {
          this.startRotationTimer();
        } else {
          this.stopRotationTimer();
        }
        // Icon im Dashboard SOFORT aktualisieren, während das Bild seine normale Dauer stehen bleibt
        this.syncCurrentDisplayWithoutAdvancing();
        break;

      case 'RESET':
        this.isPlaying = false;
        this.stopRotationTimer();
        this.currentIndex = 0;
        this.currentRotationIndex = 0;
        this.updateTimeAndItemsForCurrentIndex();
        break;

      case 'NEXT_TIMEPOINT':
        if (this.renderedPreviewData.length > 0 && this.viewMode !== 'specific') {
          this.isPlaying = false;
          this.stopRotationTimer();
          this.advanceToNextTimepoint();
        }
        break;

      case 'CHANGE_MODE':
        if (cmd.mode) {
          this.isPlaying = false;
          this.stopRotationTimer();
          this.viewMode = cmd.mode;
          if (cmd.targetTime) this.selectedTime = cmd.targetTime;
          this.applyFilter();
        }
        break;

      case 'JUMP_TO_TIME':
        if (cmd.targetTime) {
          this.isPlaying = false;
          this.stopRotationTimer();
          this.viewMode = 'specific';
          this.selectedTime = cmd.targetTime;
          this.applyFilter();
        }
        break;
    }
  }

  private advanceToNextTimepoint(): void {
    if (this.renderedPreviewData.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % this.renderedPreviewData.length;
      this.updateTimeAndItemsForCurrentIndex();
    }
  }

  private startRotationTimer(): void {
    this.stopRotationTimer();

    const performStep = () => {
      if (this.viewMode === 'specific') {
        this.showNextItem();
      } else {
        this.advanceToNextTimepoint();
      }
    };

    // Wartet genau einmal previewDuration ab und schaltet dann im festen Takt weiter
    this.rotationTimer = setInterval(() => {
      if (this.isPlaying) {
        performStep();
      }
    }, this.previewDuration * 1000);
  }

  private stopRotationTimer(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /**
  * Aktualisiert nur den Play/Pause-Status im Dashboard, ohne zum nächsten Bild zu springen
  */
  private syncCurrentDisplayWithoutAdvancing(): void {
    const statusFields = this.buildStatusFields(); // <-- Nutzt die zentrale Methode!

    if (this.currentItem) {
      // Fall 1: Es wird bereits ein Item (oder Leerlauf-Item) angezeigt -> nur die Status-Felder aktualisieren
      this.currentItem = {
        ...this.currentItem,
        ...statusFields
      };
    } else {
      // Fall 2: Falls currentItem noch null ist -> sauberes Leerlauf-Objekt anlegen
      this.currentItem = {
        id: 0,
        text: '',
        hintergrund: '',
        sort: 0,
        sichtbar: false,
        ...statusFields
      };
    }

    // Aktualisiertes Objekt mit nur einem Parameter an den Service senden
    this.itemService.updateLiveItem(this.currentItem);
  }

  private buildStatusFields() {
    let actionText: string | undefined = undefined;
    const currentEntry = this.renderedPreviewData[this.currentIndex];

    if (this.viewMode === 'changes' && currentEntry?.action) {
      // Modus 1: Nur Umschaltpunkte
      actionText = currentEntry.action;
    } else if (this.viewMode === 'all' && currentEntry?.id) {
      // Modus 2: Alle Termine
      actionText = `Termin für News #${currentEntry.id}`;
    } else if (this.viewMode === 'specific') {
      // Modus 3: Zeitpunkt wählen
      const activeIds = this.validItems.map(i => i.id);
      if (activeIds.length > 0) {
        actionText = `Aktive News: #${activeIds.join(', #')}`;
      } else {
        actionText = 'Keine News aktiv';
      }
    }

    return {
      mode: this.viewMode,
      itemIndex: this.renderedPreviewData.length > 0 ? this.currentIndex + 1 : 0,
      itemCount: this.renderedPreviewData.length,
      currentTime: this.activePreviewTime,
      activeIds: this.validItems.map(i => i.id),
      isPlaying: this.isPlaying,
      statusAction: actionText
    };
  }

  /**
   * 2. Ermittelt die neue Zeit am aktuellen Index und lädt die dafür gültigen Items
   */
  private updateTimeAndItemsForCurrentIndex(): void {
    const total = this.renderedPreviewData.length;
    const currentEntry = total > 0 ? this.renderedPreviewData[this.currentIndex] : null;

    if (this.viewMode === 'changes' && currentEntry) {
      this.activePreviewTime = currentEntry.changeTime;
      // WICHTIG: Direkt die vorberechneten IDs dieses Umschaltpunkts nutzen!
      const activeIds: number[] = currentEntry.currentlyShowing || [];
      this.validItems = this.items.filter(item => activeIds.includes(item.id));

    } else if (this.viewMode === 'all' && currentEntry) {
      this.activePreviewTime = currentEntry.start;
      this.validItems = this.items.filter(item => item.id === currentEntry.id);

    } else if (this.viewMode === 'specific') {
      this.activePreviewTime = this.selectedTime;
      const activeIds = this.getItemsAtSpecificTime(this.calcDates, this.activePreviewTime);
      this.validItems = this.items.filter(item => activeIds.includes(item.id));

    } else {
      this.activePreviewTime = null;
      this.validItems = [];
    }

    // Rotation zurücksetzen und direkt das erste Bild der neuen Zeit anzeigen
    this.currentRotationIndex = 0;
    this.showNextItem();
  }

  /**
     * Wendet die zuvor erstellten Filter-Methoden an
     */
  private applyFilter(): void {
    this.currentIndex = 0; // Bei Filterwechsel wieder vorne starten

    if (this.viewMode === 'all') {
      // this.renderedPreviewData = this.calcDates;
      this.renderedPreviewData = [...this.calcDates].sort((a, b) =>
        a.start.localeCompare(b.start)
      );
    } else if (this.viewMode === 'changes') {
      this.renderedPreviewData = this.getOnlyStateChanges(this.calcDates);
    } else if (this.viewMode === 'specific') {
      this.renderedPreviewData = this.getItemsAtSpecificTime(this.calcDates, this.selectedTime);
    }

    this.updateTimeAndItemsForCurrentIndex();
  }

  getOnlyStateChanges(rawDates: CalcDate[]): StateChangeEvent[] {
    if (!rawDates || rawDates.length === 0) return [];

    // 1. Nahtlose Übergänge (23:59:59 -> 00:00:00 am Folgetag) pro Item verschmelzen
    const mergedDates = this.mergeContinuousBlocks(rawDates);

    // 2. Alle echten Start- und Endzeitpunkte als Events sammeln
    const timeline: { time: string; id: number; type: 'START' | 'END' }[] = [];

    mergedDates.forEach(date => {
      const startTime = date.start.includes('T') ? date.start : `${date.start}T00:00:00`;
      timeline.push({ time: startTime, id: date.id, type: 'START' });

      const endTime = date.end.includes('T') ? date.end : `${date.end}T23:59:59`;
      timeline.push({ time: endTime, id: date.id, type: 'END' });
    });

    // Chronologisch sortieren (bei exakt gleicher Uhrzeit zuerst START, dann END verarbeiten)
    timeline.sort((a, b) => a.time.localeCompare(b.time));

    const filteredChanges: StateChangeEvent[] = [];
    const currentActiveIds = new Set<number>();
    let lastVisibleState = '';

    timeline.forEach(event => {
      if (event.type === 'START') {
        currentActiveIds.add(event.id);
      } else {
        currentActiveIds.delete(event.id);
      }

      const activeIdsArray = Array.from(currentActiveIds).sort((a, b) => a - b);
      const stateString = activeIdsArray.join(',');

      if (stateString !== lastVisibleState) {
        filteredChanges.push({
          changeTime: event.time,
          // Klarer Status-Text für das Dashboard!
          action: event.type === 'START'
            ? `News #${event.id} wird eingeschaltet`
            : `News #${event.id} wird ausgeschaltet`,
          currentlyShowing: activeIdsArray
        });

        lastVisibleState = stateString;
      }
    });

    return filteredChanges;
  }

  /**
   * Verschmilzt Blöcke desselben Items, wenn Block A um 23:59:59 endet 
   * und Block B am nächsten Tag um 00:00:00 startet.
   */
  private mergeContinuousBlocks(rawDates: CalcDate[]): CalcDate[] {
    // Nach ID und Startzeit sortieren
    const sorted = [...rawDates].sort((a, b) =>
      a.id !== b.id ? a.id - b.id : a.start.localeCompare(b.start)
    );

    const merged: CalcDate[] = [];

    for (const current of sorted) {
      const curStart = current.start.includes('T') ? current.start : `${current.start}T00:00:00`;
      const curEnd = current.end.includes('T') ? current.end : `${current.end}T23:59:59`;

      if (merged.length > 0) {
        const prev = merged[merged.length - 1];
        // Prüfen: Gleiche Item-ID, vorheriger Block endet auf 23:59:59 und neuer startet auf 00:00:00?
        if (prev.id === current.id && prev.end.endsWith('23:59:59') && curStart.endsWith('00:00:00')) {
          const prevDate = new Date(prev.end);
          const nextDate = new Date(curStart);
          // Differenz in Millisekunden (zwischen 23:59:59 und 00:00:00 liegt genau 1 Sekunde = 1000ms)
          if (Math.abs(nextDate.getTime() - prevDate.getTime()) <= 1000) {
            prev.end = curEnd; // Block einfach verlängern!
            continue;
          }
        }
      }

      merged.push({ ...current, start: curStart, end: curEnd });
    }

    return merged;
  }

  /**
   * Filtert die Rohdaten für ein ganz bestimmtes, vom Benutzer gewähltes Datum + Uhrzeit
   * (z.B. "2026-11-25T17:00:00")
   */
  getItemsAtSpecificTime(rawDates: CalcDate[], targetIsoString: string): number[] {
    const activeIds = rawDates
      .filter(dateBlock => {
        const startTime = dateBlock.start.includes('T') ? dateBlock.start : `${dateBlock.start}T00:00:00`;
        const endTime = dateBlock.end.includes('T') ? dateBlock.end : `${dateBlock.end}T23:59:59`;
        return targetIsoString >= startTime && targetIsoString <= endTime;
      })
      .map(dateBlock => dateBlock.id);

    // Dubletten entfernen
    return Array.from(new Set(activeIds));
  }

  /**
   * Filtert minutengenau die Items heraus, die JETZT aktiv sein müssen
   */
  private updateValidItems(): void {
    const now = new Date();

    // Erzeugt das lokale Format "2026-11-10T21:44:00" passend zur PHP-Ausgabe
    const currentIsoString = new Date().toISOString();

    this.validItems = this.items.filter(item => {
      // Prüfen, ob für dieses Item ein Eintrag existiert, der im aktuellen Moment gültig ist
      return this.calcDates.some(dateBlock => {
        if (dateBlock.id !== item.id) return false;

        // Fallbacks für reine Datumsangaben ohne "T"-Zeittrenner (z.B. "2026-11-10")
        const startTime = dateBlock.start.includes('T') ? dateBlock.start : `${dateBlock.start}T00:00:00`;
        const endTime = dateBlock.end.includes('T') ? dateBlock.end : `${dateBlock.end}T23:59:59`;

        // Textbasierter ISO-Vergleich: Liegt "jetzt" im Zeitfenster?
        return currentIsoString >= startTime && currentIsoString <= endTime;
      });
    });

    if (this.currentItem && !this.validItems.some(i => i.id === this.currentItem?.id)) {
      this.currentRotationIndex = 0;
      this.showNextItem();
    }
  }

  /**
   * Lädt die Bilder aller validen Items vorab in den Browser-Cache
   */
  private preloadAllImages(): Promise<void[]> {
    const imageUrls = this.validItems
      .map(item => (item as any).hintergrund)
      .filter((url): url is string => typeof url === 'string' && url.trim() !== '' && url.includes('.'));

    const promises = imageUrls.map(url => this.preloadSingleImage(url));

    return Promise.race([
      Promise.all(promises),
      new Promise<void[]>((resolve) => setTimeout(() => resolve([]), 1500))
    ]);
  }

  /**
   * Lädt ein einzelnes Bild im Hintergrund vor und fängt Farb-Strings ab
   */
  private preloadSingleImage(url: string | null | undefined): Promise<void> {
    if (!url || url.trim() === '') return Promise.resolve();

    const isColorString = url.startsWith('#') ||
      url.startsWith('rgb') ||
      url.startsWith('hsl');

    if (isColorString) {
      return Promise.resolve();
    }

    const pipeInstance = new ImageUrlPipe();
    const absoluteUrl = pipeInstance.transform(url);

    if (this.preloadedImages.has(absoluteUrl)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const img = new Image();
      img.src = absoluteUrl;

      img.onload = () => {
        this.preloadedImages.add(absoluteUrl);
        resolve();
      };
      img.onerror = () => {
        resolve();
      };
    });
  }

  /**
   * Lädt das Bild des nächsten anstehenden Items im Hintergrund vor
   */
  private preloadNextImage(): void {
    if (this.validItems.length <= 1) return;

    const nextItem = this.validItems[this.currentRotationIndex];

    if (!nextItem) return;

    if (nextItem.mediaType === 'image' && nextItem.hintergrund) {
      this.preloadSingleImage(nextItem.hintergrund);
    }
  }

  private startMinuteSync(): void {
    if (this.minuteCheckTimeout) {
      clearTimeout(this.minuteCheckTimeout);
    }

    const calculateTimeToNextMinute = () => {
      const now = new Date();
      return (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    };

    const runCheck = () => {
      this.updateValidItems();
      this.minuteCheckTimeout = setTimeout(runCheck, calculateTimeToNextMinute());
    };

    this.minuteCheckTimeout = setTimeout(runCheck, calculateTimeToNextMinute());
  }

  private showNextItem(): void {
    const statusFields = this.buildStatusFields(); // <-- Nutzt die zentrale Methode!

    // Fall 1: Leerlauf (kein Item aktiv, aber Status-Infos trotzdem ans Dashboard schicken!)
    if (this.validItems.length === 0) {
      this.currentItem = {
        id: 0,
        text: '',
        hintergrund: '',
        sort: 0,
        sichtbar: false,
        ...statusFields
      };
      this.itemService.updateLiveItem(this.currentItem);
      return;
    }

    // Fall 2: Normales Item aktiv -> Kopie mit Status-Feldern bauen
    if (this.currentRotationIndex >= this.validItems.length) {
      this.currentRotationIndex = 0;
    }

    this.currentItem = {
      ...this.validItems[this.currentRotationIndex],
      ...statusFields
    };

    this.currentRotationIndex = (this.currentRotationIndex + 1) % this.validItems.length;
    this.itemService.updateLiveItem(this.currentItem);
    this.preloadNextImage();
  }


  ngOnDestroy(): void {
    this.subscriptions.forEach(e => e.unsubscribe());
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    if (this.minuteCheckTimeout) clearTimeout(this.minuteCheckTimeout);
  }

}
