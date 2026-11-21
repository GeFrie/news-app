import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, catchError, forkJoin, map, Observable, of, Subject, switchMap, take, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Item, dbItem, BoxRect, ImageBoxItem } from '../interfaces/item';
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

  private discardChangesSubject = new Subject<void>();
  discardChanges$ = this.discardChangesSubject.asObservable();

  private pendingImageFiles = new Map<string, File>();

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

  executeDashboardDiscard(): void {
    this.discardChangesSubject.next();
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
      map(items => items.map(item => {
        const rawImageBox = (item as any).imageBox;
        const rawTextBox = (item as any).textBox;

        return {
          ...item,
          sichtbar: item.sichtbar === '1',
          mediaType: detectMediaType(item.hintergrund),
          textBox: typeof rawTextBox === 'string' && rawTextBox.trim()
            ? JSON.parse(rawTextBox)
            : rawTextBox,
          imageBoxes: this.parseImageBoxes(rawImageBox, item.hintergrund)
        };
      })),
      // tap(items => {
      //   if (items && items.length > 0) {
      //     this.setSelectedItem(this.selectedItem ?? items[0]);
      //   }
      // })
      tap(items => {
        if (items && items.length > 0) {
          const currentId = this.selectedItem?.id;
          const keptItem = currentId ? items.find(i => Number(i.id) === Number(currentId)) : null;
          this.setSelectedItem(keptItem ?? items[0]);
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
        bgColor: color // Ändert NUR bgColor – hintergrund (Bild/PDF) bleibt erhalten!
      });
      this.save.addState(SaveState.ITEM);
    }
  }

  updateBackground(previewUrl: string, mediaType: 'image' | 'pdf', file?: File) {
    const currentItem = this.selectedItem;

    if (currentItem) {
      if (file) {
        this.currentUploadFile = file;
      }
      this._selectedItem.next({
        ...currentItem,
        hintergrund: previewUrl, // Ändert NUR das Bild/PDF – bgColor bleibt erhalten!
        mediaType
      });
      this.save.addState(SaveState.ITEM);
    }
  }

  removeBackground(): void {
    const currentItem = this.selectedItem;
    if (currentItem) {
      this.currentUploadFile = null;
      this.pendingImageFiles.clear();

      this._selectedItem.next({
        ...currentItem,
        hintergrund: '',
        mediaType: undefined,
        imageBoxes: []
      });
      this.save.addState(SaveState.ITEM);
    }
  }

  updateImageOpacity(id: string, opacity: number): void {
    this.updateImageBox(id, { opacity });
  }

  /**
 * Wandelt das DB-Feld imageBox (altes Objekt oder neues Array) immer in ImageBoxItem[] um.
 */
  parseImageBoxes(rawImageBox: any, fallbackSrc?: string): ImageBoxItem[] {
    if (!rawImageBox) {
      return fallbackSrc && fallbackSrc !== 'null'
        ? [{ id: 'img_0', src: fallbackSrc, left: 0, top: 0, width: 100, height: 100, opacity: 1, zIndex: 1 }]
        : [];
    }

    const parsed = typeof rawImageBox === 'string' ? JSON.parse(rawImageBox) : rawImageBox;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    // Rückwärtskompatibilität für bestehende Einzel-Objekte
    return [{
      id: 'img_0',
      src: parsed.src || fallbackSrc || '',
      left: parsed.left ?? 0,
      top: parsed.top ?? 0,
      width: parsed.width ?? 100,
      height: parsed.height ?? 100,
      opacity: parsed.opacity ?? 1,
      zIndex: parsed.zIndex ?? 1
    }];
  }

  /**
   * Neues Bild proportional zu seinen natürlichen Maßen (auf 1920x1080-Basis) einfügen
   */
  addImageBox(
    file: File,
    previewUrl: string,
    dimensions?: { width: number; height: number } | null
  ): void {
    const currentItem = this.selectedItem;
    if (!currentItem) return;

    const existing = currentItem.imageBoxes ?? [];
    const isFirst = existing.length === 0;
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;


    this.pendingImageFiles.set(id, file);

    // Bühnen-Basis: 1920 x 1080
    const stageW = 1920;
    const stageH = 1080;

    let widthPct = isFirst ? 50 : 35;
    let heightPct = isFirst ? 50 : 35;

    if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
      // Erstes Bild darf bis zu 100% der Bühne einnehmen (wenn es z.B. genau 1920x1080 hat),
      // kleinere oder nicht-16:9-Bilder behalten exakt ihre Original-Pixelgröße!
      // Weitere Bilder werden auf max. 50% der Bühne begrenzt, damit man sie gut platzieren kann.
      const maxScale = isFirst ? 1 : 0.5;
      const scale = Math.min(
        (stageW * maxScale) / dimensions.width,
        (stageH * maxScale) / dimensions.height,
        1 // Verhindert, dass kleinere Bilder (z.B. Logos) künstlich hochskaliert werden
      );

      widthPct = Number(((dimensions.width * scale) / stageW * 100).toFixed(2));
      heightPct = Number(((dimensions.height * scale) / stageH * 100).toFixed(2));
    }

    // Horizontal & vertikal zentriert auf der Bühne platzieren
    const leftPct = Number(((100 - widthPct) / 2).toFixed(2));
    const topPct = Number(((100 - heightPct) / 2).toFixed(2));

    const hasText = !!(currentItem.text && currentItem.text.replace(/<[^>]*>/g, '').trim().length > 0);
    const defaultZ = (isFirst && !hasText)
      ? 1
      : Math.min(19, 11 + existing.length);

    const newBox: ImageBoxItem = {
      id,
      src: previewUrl,
      left: leftPct,
      top: topPct,
      width: widthPct,
      height: heightPct,
      opacity: 1,
      zIndex: defaultZ
    };

    this._selectedItem.next({
      ...currentItem,
      mediaType: 'image',
      hintergrund: isFirst ? previewUrl : currentItem.hintergrund,
      imageBoxes: [...existing, newBox]
    });
    this.save.addState(SaveState.ITEM);
  }

  /**
 * Position, Größe, Deckkraft oder Ebene eines bestimmten Bildes aktualisieren
 */
  updateImageBox(id: string, patch: Partial<ImageBoxItem>): void {
    const currentItem = this.selectedItem;
    if (!currentItem?.imageBoxes) return;

    const updated = currentItem.imageBoxes.map(img =>
      img.id === id ? { ...img, ...patch } : img
    );

    this._selectedItem.next({
      ...currentItem,
      imageBoxes: updated
    });
    this.save.addState(SaveState.ITEM);
  }

  /**
   * Ein bestimmtes Bild entfernen
   */
  removeImageBox(id: string): void {
    const currentItem = this.selectedItem;
    if (!currentItem?.imageBoxes) return;

    this.pendingImageFiles.delete(id);
    const updated = currentItem.imageBoxes.filter(img => img.id !== id);

    this._selectedItem.next({
      ...currentItem,
      hintergrund: updated[0]?.src || '',
      imageBoxes: updated
    });
    this.save.addState(SaveState.ITEM);
  }

  // saveItem(): Observable<any> {
  //   const item = this.selectedItem;
  //   if (!item) return of(null);
  //   if (!this.save.hasState(SaveState.ITEM)) return of(null);

  //   return this.config$.pipe(
  //     take(1),
  //     switchMap(config => {
  //       // 1. Alle ausstehenden Bilder aus der Map holen
  //       const pendingEntries = config.showFile
  //         ? Array.from(this.pendingImageFiles.entries())
  //         : [];

  //       // Das erste neue Bild (oder ein PDF via currentUploadFile) läuft direkt über 'hintergrund_file'
  //       let mainFileEntry: [string, File] | null = null;
  //       let extraFileEntries: [string, File][] = [];

  //       if (this.currentUploadFile && config.showFile) {
  //         // Fall A: PDF-Upload über bestehenden Weg
  //         mainFileEntry = ['pdf', this.currentUploadFile];
  //       } else if (pendingEntries.length > 0) {
  //         // Fall B: Das erste neue Bild geht als hintergrund_file mit, alle weiteren vorab per forkJoin
  //         mainFileEntry = pendingEntries[0];
  //         extraFileEntries = pendingEntries.slice(1);
  //       }

  //       // 2. Zusätzliche neue Bilder (ab dem 2. Bild) vorab einzeln hochladen
  //       const extraUploads$: Observable<{ id: string; serverFileName: string }[]> =
  //         extraFileEntries.length > 0
  //           ? forkJoin(
  //             extraFileEntries.map(([imgId, file]) =>
  //               this.uploadSingleImage(file).pipe(
  //                 map(serverFileName => ({ id: imgId, serverFileName }))
  //               )
  //             )
  //           )
  //           : of([]);

  //       return extraUploads$.pipe(
  //         switchMap(uploadedExtras => {
  //           // Kopie des imageBoxes-Arrays anlegen und hochgeladene Zusatz-Dateinamen eintragen
  //           let updatedBoxes = (item.imageBoxes ?? []).map(box => {
  //             const match = uploadedExtras.find(u => u.id === box.id);
  //             return match && match.serverFileName
  //               ? { ...box, src: match.serverFileName }
  //               : { ...box };
  //           });

  //           const formData = new FormData();
  //           formData.append('id', item.id.toString());
  //           formData.append('text', config.showText ? (item.text || '') : '');
  //           formData.append('bg_color', config.showColor ? (item.bgColor || '') : '');
  //           formData.append('sichtbar', `${item.sichtbar ? 1 : 0}`);
  //           formData.append('sortierung', item.sort !== null ? item.sort.toString() : '');
  //           formData.append('textBox', item.textBox ? JSON.stringify(item.textBox) : '');

  //           if (mainFileEntry && config.showFile) {
  //             const [, mainFile] = mainFileEntry;
  //             formData.append('hintergrund_file', mainFile, mainFile.name);
  //             formData.append('hintergrund_raw', '');
  //           } else {
  //             formData.append('hintergrund_file', '');
  //             const fallbackRaw = updatedBoxes[0]?.src || item.hintergrund || '';
  //             formData.append('hintergrund_raw', config.showFile ? fallbackRaw : '');
  //           }

  //           // imageBoxes als JSON in das bestehende DB-Feld 'imageBox' schreiben
  //           formData.append(
  //             'imageBox',
  //             config.showFile && updatedBoxes.length > 0 ? JSON.stringify(updatedBoxes) : ''
  //           );

  //           return this.http.post(`${environment.apiUrl}save_item.php`, formData).pipe(
  //             tap((res: any) => {
  //               if (res?.success) {
  //                 // Falls mainFileEntry ein Bild aus pendingImageFiles war, dessen blob:-URL durch res.newPath ersetzen
  //                 if (mainFileEntry && mainFileEntry[0] !== 'pdf' && res.newPath) {
  //                   const mainImgId = mainFileEntry[0];
  //                   updatedBoxes = updatedBoxes.map(box =>
  //                     box.id === mainImgId ? { ...box, src: res.newPath } : box
  //                   );
  //                 }

  //                 // Zwischenspeicher leeren & aktualisiertes Item mit echten Server-Pfaden setzen
  //                 this.currentUploadFile = null;
  //                 this.pendingImageFiles.clear();

  //                 const nextId = item.id === 0 && res.newId ? res.newId : item.id;
  //                 const nextHintergrund = res.newPath || updatedBoxes[0]?.src || item.hintergrund || '';

  //                 this._selectedItem.next({
  //                   ...item,
  //                   id: nextId,
  //                   hintergrund: nextHintergrund,
  //                   imageBoxes: updatedBoxes
  //                 });

  //                 this.save.removeState(SaveState.ITEM);
  //               }
  //             })
  //           );
  //         })
  //       );
  //     }),
  //     catchError(err => {
  //       console.error('Speicherfehler bei Items:', err);
  //       return of({ success: false });
  //     })
  //   );
  // }
  saveItem(): Observable<any> {
    const item = this.selectedItem;
    if (!item) return of(null);
    if (!this.save.hasState(SaveState.ITEM)) return of(null);

    return this.config$.pipe(
      take(1),
      switchMap(config => {
        const formData = new FormData();
        formData.append('id', item.id.toString());
        formData.append('text', config.showText ? (item.text || '') : '');
        formData.append('bg_color', config.showColor ? (item.bgColor || '') : '');
        formData.append('sichtbar', `${item.sichtbar ? 1 : 0}`);
        formData.append('sortierung', item.sort !== null ? item.sort.toString() : '');
        formData.append('textBox', item.textBox ? JSON.stringify(item.textBox) : '');

        if (config.showFile) {
          if (this.currentUploadFile) {
            formData.append('pdf_file', this.currentUploadFile, this.currentUploadFile.name);
          }

          // Alle neuen Bilder aus pendingImageFiles unter ihrer jeweiligen Box-ID anhängen:
          this.pendingImageFiles.forEach((file, imgId) => {
            formData.append(`upload_files[${imgId}]`, file, file.name);
          });

          const boxes = item.imageBoxes ?? [];
          formData.append('imageBox', boxes.length > 0 ? JSON.stringify(boxes) : '');

          // Wichtig: Optional Chaining ?., falls boxes leer ist!
          const fallbackBg = this.currentUploadFile ? '' : (boxes[0]?.src || item.hintergrund || '');
          formData.append('hintergrund_raw', fallbackBg);
        } else {
          formData.append('imageBox', '');
          formData.append('hintergrund_raw', '');
        }

        return this.http.post<any>(`${environment.apiUrl}save_item.php`, formData).pipe(
          tap(res => {
            if (res?.success) {
              this.currentUploadFile = null;
              this.pendingImageFiles.clear();

              const nextId = item.id === 0 && res.newId ? Number(res.newId) : item.id;
              const finalBoxes: ImageBoxItem[] = Array.isArray(res.imageBoxes)
                ? res.imageBoxes
                : (item.imageBoxes ?? []);

              // Auch hier Optional Chaining ?. verwenden!
              const nextHintergrund = res.newPath || finalBoxes[0]?.src || '';

              this._selectedItem.next({
                ...item,
                id: nextId,
                hintergrund: nextHintergrund,
                imageBoxes: finalBoxes
              });

              this.save.removeState(SaveState.ITEM);
            }
          })
        );
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

  private uploadSingleImage(file: File): Observable<string> {
    const fd = new FormData();
    fd.append('id', '-1'); // Signalisiert PHP: Nur Datei speichern & newPath zurückgeben, keinen DB-Eintrag anlegen
    fd.append('hintergrund_file', file, file.name);

    return this.http.post<any>(`${environment.apiUrl}save_item.php`, fd).pipe(
      map(res => res?.newPath || '')
    );
  }

}


