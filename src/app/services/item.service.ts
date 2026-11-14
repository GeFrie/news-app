import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, catchError, map, Observable, of, Subject, take, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Item, dbItem } from '../interfaces/item';
import { detectMediaType } from '../shared/utils/media-type.utils';
import { EditorConfigService } from './editor.config.service';
import { SaveState, SaveStateService } from './save.state.service';

export interface LivePreviewData extends Item {
  mode?: 'all' | 'changes' | 'specific';
  itemIndex?: number;
  itemCount?: number;
  currentTime?: string | null;
  activeIds?: number[];
  isPlaying?: boolean; // <-- Diese Zeile ergänzen
  statusAction?: string; // <-- NEU: z. B. "News #5 wird eingeschaltet"}
}

@Injectable({ providedIn: 'root' })

export class ItemService {

  readonly config$;

  private _selectedItem = new BehaviorSubject<Item | null>(null);
  selectedItem$ = this._selectedItem.asObservable();

  public currentUploadFile: File | null = null;

  public requestInitialSelection$ = new Subject<void>();

  private saveCallback?: () => Observable<any>;

  private liveItemSource = new BehaviorSubject<LivePreviewData | null>(null);
  liveItem$ = this.liveItemSource.asObservable();


  // Kanal für das Neuladen im Kiosk-Frontend
  private reloadFrontendSource = new Subject<void>();
  reloadFrontend$ = this.reloadFrontendSource.asObservable();

  private syncChannel = new BroadcastChannel('tsg_news_sync');

  constructor(
    private http: HttpClient,
    private save: SaveStateService,
    private configService: EditorConfigService,
    private ngZone: NgZone
  ) {
    this.config$ = this.configService.viewConfig$;
    
    // Lauscht auf Nachrichten aus ANDEREN Browser-Tabs und holt sie direkt in die Angular-Zone!
    this.syncChannel.onmessage = (event) => {
      if (event.data === 'RELOAD') {
        this.ngZone.run(() => {
          this.reloadFrontendSource.next();
        });
      }
    };
  }

  // Methode, die das Dashboard nach dem Speichern aufruft
  triggerFrontendReload(): void {
    this.reloadFrontendSource.next();
    this.syncChannel.postMessage('RELOAD'); // <-- Schickt das Signal jetzt sofort an den zweiten Tab!
  }

  // Das Dashboard nutzt das, um sich anzumelden
  registerSaveCallback(callback: () => Observable<any>) {
    this.saveCallback = callback;
  }

  // Der Guard nutzt das, um das Dashboard-Save auszuführen
  executeDashboardSave(): Observable<any> {
    return this.saveCallback ? this.saveCallback() : of({ success: true });
  }

  // Methode, um das Item aus der Vorschau zu setzen
  updateLiveItem(item: LivePreviewData | null): void {
    if (!item) {
      this.liveItemSource.next(null);
      return;
    }
    this.liveItemSource.next({ ...item });
  }

  triggerInitialSelectionRequest() {
    this.requestInitialSelection$.next();
  }

  setSelectedItem(item: Item | null) {
    this._selectedItem.next(item);
  }

  get selectedItem(): Item | null {
    return this._selectedItem.value;
  }

  listItems(): Observable<Item[] | []> {
    return this.http.get<dbItem[]>(`${environment.apiUrl}list_items.php`).pipe(
      map(items => items.map(item => ({
        ...item,
        sichtbar: item.sichtbar === '1',
        mediaType: detectMediaType(item.hintergrund)
      }))),
      tap(items => {
        if (items && items.length > 0) {
          this.setSelectedItem(items[0]);
        }
      })
    );
  }

  updateVisibility(sichtbar: boolean) {
    const currentItem = this._selectedItem.value;

    if (currentItem) {
      this._selectedItem.next({
        ...currentItem,
        sichtbar,
      });
      this.save.addState(SaveState.ITEM);
    }
  }

  updateBackground(url: string, type: 'pdf' | 'image' | 'color', file?: File) {
    const currentItem = this.selectedItem;

    if (currentItem) {
      if (file) {
        this.currentUploadFile = file;
      }
      this._selectedItem.next({
        ...currentItem,
        hintergrund: url,
        mediaType: type
      });
      this.save.addState(SaveState.ITEM);
    }
  }

  updateText(text: string) {
    const currentItem = this.selectedItem;

    if (currentItem) {
      this._selectedItem.next({
        ...currentItem,
        text,
      });
      this.save.addState(SaveState.ITEM);
    }
  }

  updateColor(color: string) {
    const currentItem = this.selectedItem;

    if (currentItem) {
      this._selectedItem.next({
        ...currentItem,
        hintergrund: color,
      });
      this.save.addState(SaveState.ITEM);
    }
  }

  saveItem(): Observable<any> {
    const item = this.selectedItem;
    if (!item) return of(null);
    if (!this.save.hasState(SaveState.ITEM)) return of(null);

    const formData = new FormData();
    formData.append('id', item.id.toString());  // Wenn ID 0 ist, schicken wir sie als 0 (PHP erkennt das als Neu)

    this.config$.subscribe(config => {

      formData.append('text', config.showText ? (item.text || '') : '');

      // 2. Datei- und Farb-Logik kombiniert
      if (this.currentUploadFile && config.showFile) {
        // Datei wird nur angehängt, wenn vorhanden UND erlaubt
        formData.append('hintergrund_file', this.currentUploadFile, this.currentUploadFile.name);
        formData.append('hintergrund_raw', ''); // Für PHP initialisieren
      } else {
        // Wenn keine Datei da ist (oder showFile aus ist), greift die Farblogik
        formData.append('hintergrund_file', ''); // Für PHP initialisieren
        formData.append('hintergrund_raw', config.showColor ? (item.hintergrund || '') : '');
      }
    });

    formData.append('sichtbar', `${item.sichtbar ? 1 : 0}`);
    formData.append('sortierung', `${item.sort ? item.sort : null}`);

    return this.http.post(`${environment.apiUrl}save_item.php`, formData).pipe(
      tap((res: any) => {
        if (res?.success) {
          // Nach Erfolg: Datei-Zwischenspeicher leeren
          this.currentUploadFile = null;
          // Wenn es ein neues Item war, hat der Server nun eine echte ID vergeben!
          if (item.id === 0 && res.newId) {
            this._selectedItem.next({ ...item, id: res.newId, hintergrund: res.newPath || item.hintergrund });
          }
          this.save.removeState(SaveState.ITEM);
        }
      }),
      catchError(err => {
        console.error('Speicherfehler bei Items:', err);
        return of({ success: false });
      })
    );
  }

  deleteItem(id: number) {
    const body = { id: id };

    return this.http.post(`${environment.apiUrl}delete_item.php`, body).pipe(
      map(() => true), // Wenn der Server 200 OK sendet, interpretieren wir es als Erfolg
      catchError(error => {
        console.error('Fehler bei deleteItem: ', error);
        return of(false); // Bei Fehlern (404, 500) geben wir false zurück
      })
    );
  }

}


