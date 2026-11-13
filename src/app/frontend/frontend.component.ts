import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { ArrayConversion } from '../shared/utils/array-conversion.utils';
import { map, mergeAll, of, Subscription, tap } from 'rxjs';
import { Item, CalcDate } from '../interfaces/item';
import { ViewService } from '../services/view.service';
import { PlanService } from '../services/plan.service';

import { IsColorPipe } from '../pipes/is-color.pipe';
import { ImageUrlPipe } from '../pipes/image-url.pipe';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { EditorConfigService } from '../services/editor.config.service';
import { ItemService } from '../services/item.service';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-frontend',
  imports: [
    NzGridModule,
    IsColorPipe,
    ImageUrlPipe,
    SafeUrlPipe,
    SafeHtmlPipe,
  ],
  templateUrl: './frontend.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './frontend.component.scss',
})
export class FrontendComponent implements OnInit, OnDestroy {

  private isLeftPressed = false;
  private isRightPressed = false;
  private comboTriggered = false; // Verhindert ungewolltes Blättern beim Loslassen der Tasten
  private resumeTimeout: any;

  // Optional: Kurzes Overlay im Frontend für visuelles Feedback (z. B. "Anzeigedauer: 6 Sek.")
  osdMessage: string | null = null;
  private osdTimeout: any;

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();

    // Automatisches Tasten-Wiederholen (Key-Repeat) beim Gedrückthalten ignorieren
    if (event.repeat) return;

    if (event.key === 'ArrowLeft') {
      this.isLeftPressed = true;

      // Prüfen: Ist RECHTS bereits gedrückt? -> Duration um 1s VERRINGERN
      if (this.isRightPressed) {
        this.comboTriggered = true;
        this.changeAndSaveDuration(-1);
        return;
      }
    }

    if (event.key === 'ArrowRight') {
      this.isRightPressed = true;

      // Prüfen: Ist LINKS bereits gedrückt? -> Duration um 1s ERHÖHEN
      if (this.isLeftPressed) {
        this.comboTriggered = true;
        this.changeAndSaveDuration(1);
        return;
      }
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    // Normales Blättern erst beim Loslassen ausführen, wenn KEINE Kombination gedrückt wurde!
    if (!this.comboTriggered) {
      if (event.key === 'ArrowLeft') {
        this.manualStep(-1); // Zurückblättern
      } else if (event.key === 'ArrowRight') {
        this.manualStep(1);  // Vorblättern
      }
    }

    // Tastenzustand zurücksetzen
    if (event.key === 'ArrowLeft') this.isLeftPressed = false;
    if (event.key === 'ArrowRight') this.isRightPressed = false;

    // Wenn beide Tasten wieder losgelassen wurden, Kombi-Sperre aufheben
    if (!this.isLeftPressed && !this.isRightPressed) {
      this.comboTriggered = false;
    }
  }

  convertArray = ArrayConversion;
  itemCountH = 1;
  itemCountV = 1;
  subscriptions: Subscription[] = [];

  loading: boolean = true;

  items: Item[] = [];
  calcDates: CalcDate[] = []; // Nimmt das flache Array aus der PHP-API auf

  validItems: Item[] = [];
  currentItem: Item | null = null;

  private rotationTimer: any;
  private minuteCheckTimeout: any;
  private currentRotationIndex = 0;
  private displayDuration = 5000;

  // Cache, um zu wissen, welche Bilder bereits geladen sind
  private preloadedImages = new Set<string>();
  defaultFontSize = '16px';

  constructor(
    private viewService: ViewService,
    private planService: PlanService,
    private itemService: ItemService,
    private configService: EditorConfigService,
    private http: HttpClient,
  ) { }

  ngOnInit(): void {
    // 1. Konfiguration laden
    this.subscriptions.push(
      this.configService.getConfig().subscribe({
        next: (config) => {
          if (config['displayDurationSeconds']) {
            this.displayDuration = config['displayDurationSeconds'] * 1000;
            if (this.items.length > 0) {
              this.startRotation();
            }
          }
          if (config['defaultFontSize']) {
            this.defaultFontSize = config['defaultFontSize'];
          }
          document.documentElement.style.setProperty('--default-font-size', this.defaultFontSize);
        },
        error: (err) => {
          console.error('Fehler beim Laden der Konfigurations-JSON, nutze Fallback (5s):', err);
          this.displayDuration = 5000;
        }
      })
    );

    // Auf das Speicher-Event aus dem Dashboard hören
    this.subscriptions.push(
      this.itemService.reloadFrontend$.subscribe(() => {
        this.loadDataAndStart();
      })
    );

    // Datenstrom für Items und den flachen PHP-Planer
    this.loadDataAndStart();
  }

  private stopAllTimers(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }
  }

  /**
  * 1. Stoppt die Rotation, blättert manuell vor/zurück und startet nach displayDuration neu
  */
  private manualStep(direction: 1 | -1): void {
    if (this.validItems.length === 0) return;

    this.stopAllTimers();

    const currentPos = (this.currentRotationIndex - 1 + this.validItems.length) % this.validItems.length;
    const targetPos = (currentPos + direction + this.validItems.length) % this.validItems.length;

    this.currentRotationIndex = targetPos;
    this.showNextItem();

    // Nach Ablauf der neuen Anzeigedauer die automatische Rotation wieder starten
    this.resumeTimeout = setTimeout(() => {
      this.startRotation();
    }, this.displayDuration);
  }

  /**
  * 2. Ändert die Anzeigedauer um +1s / -1s und speichert sie über PHP in config.json
  */
  private changeAndSaveDuration(deltaSeconds: number): void {
    const currentSeconds = Math.round(this.displayDuration / 1000);
    const newSeconds = Math.max(1, Math.min(300, currentSeconds + deltaSeconds));

    if (newSeconds === currentSeconds) return;

    this.displayDuration = newSeconds * 1000;
    this.showOsd(`Anzeigedauer: ${newSeconds} Sek.`);

    // WICHTIG: Beide Timer sauber stoppen und mit der neuen Dauer frisch takten
    this.stopAllTimers();
    this.rotationTimer = setInterval(() => {
      this.showNextItem();
    }, this.displayDuration);

    // Speichern über Ihren EditorConfigService (mit der echten Server-URL aus environment)
    this.configService.saveDisplayDuration(newSeconds).subscribe({
      next: () => console.log('Anzeigedauer gespeichert:', newSeconds),
      error: (err) => console.error('Fehler beim Speichern:', err)
    });
  }

  /**
 * Zeigt für 2 Sekunden eine kleine Einblendung auf dem Bildschirm (optional)
 */
  private showOsd(text: string): void {
    this.osdMessage = text;
    if (this.osdTimeout) clearTimeout(this.osdTimeout);
    this.osdTimeout = setTimeout(() => {
      this.osdMessage = null;
    }, 2000);
  }

  loadDataAndStart(): void {
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
          // Ruft Ihre aktualisierte PHP-API auf, die das fertige Array liefert
          // const todayStr = this.getLocalDateIsoString(new Date()).split('T')[0];
          const todayStr = new Date().toDateString();
          return this.planService.getPreviewPlans(itemIds, todayStr);
        }),
        mergeAll()
      ).subscribe({
        next: (dates) => {
          // Zuweisung des direkt vom PHP generierten, flachen Arrays
          this.calcDates = dates;

          this.updateValidItems();
          this.startMinuteSync();

          // VORAB-LADEN STARTEN: Erst Bilder laden, dann die Anzeige sichtbar machen
          this.preloadAllImages().then(() => {
            this.loading = false;
            this.startRotation();
          });
        },
        error: (err) => {
          console.error('Fehler im Datenstrom:', err);
        }
      })
    );
  }

  /**
   * Filtert minutengenau die Items heraus, die JETZT aktiv sein müssen
   */
  private updateValidItems(): void {
    // const now = new Date();

    // // Erzeugt das lokale Format "2026-11-10T21:44:00" passend zur PHP-Ausgabe
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

  private startRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.showNextItem();

    this.rotationTimer = setInterval(() => {
      this.showNextItem();
    }, this.displayDuration);
  }

  private showNextItem(): void {
    if (this.validItems.length === 0) {
      this.currentItem = null;
      return;
    }

    if (this.currentRotationIndex >= this.validItems.length) {
      this.currentRotationIndex = 0;
    }

    this.currentItem = this.validItems[this.currentRotationIndex];
    this.currentRotationIndex = (this.currentRotationIndex + 1) % this.validItems.length;

    this.preloadNextImage();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(e => e.unsubscribe());
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    if (this.minuteCheckTimeout) clearTimeout(this.minuteCheckTimeout);
    if (this.resumeTimeout) clearTimeout(this.resumeTimeout);
  }
}
