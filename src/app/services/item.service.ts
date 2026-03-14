import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { NotificationService } from './notification.service';
import { BehaviorSubject, catchError, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Item } from '../interfaces/item';
import { detectMediaType, MediaType } from '../shared/utils/media-type.utils';

export interface ViewConfig {
  showText: boolean;
  showFile: boolean;
  showColor: boolean;
}

@Injectable({ providedIn: 'root' })

export class ItemService {

  public detectType(hintergrund: string): MediaType {
    return detectMediaType(hintergrund);
  }

  private viewConfig = new BehaviorSubject<ViewConfig>({
    showText: true,
    showFile: true,
    showColor: true
  });

  viewConfig$ = this.viewConfig.asObservable();

  private _selectedItem = new BehaviorSubject<Item | null>(null);
  selectedItem$ = this._selectedItem.asObservable();



  public currentUploadFile: File | null = null;

  constructor(
    private http: HttpClient,
    private notify: NotificationService,
  ) { }

  updateView(key: keyof ViewConfig, visible: boolean) {
    const currentItem = this.viewConfig.value;
    this.viewConfig.next({ ...currentItem, [key]: visible });
  }

  setSelectedItem(item: Item) {
    this._selectedItem.next(item);
  }

  // Der direkte Zugriff (für Methoden im Dashboard/Modal)
  get selectedItem(): Item | null {
    return this._selectedItem.value;
  }

  listContents(current: boolean = false): Observable<Item[] | []> {
    return this.http.get<Item[]>(`${environment.httpPath}list_items.php?current=${current}`).pipe(
      map(items => items.map(item => ({
        ...item,
        sichtbar: Number(item.sichtbar) === 1,
        startDatum: item.startDatum ? new Date(item.startDatum) : null,
        endDatum: item.endDatum ? new Date(item.endDatum) : null,
        mediaType: this.detectType(item.hintergrund)
      }))),
      tap(items => {
        if (items && items.length > 0) {
          // Sobald die Daten da sind, nimm das erste
          this.setSelectedItem(items[0]);
        }
      })
    );
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
    }
  }

  updateText(text: string) {
    const currentItem = this.selectedItem;

    if (currentItem) {
      this._selectedItem.next({
        ...currentItem,
        text: text,
      });
    }
  }

  updateColor(color: string) {
    const currentItem = this.selectedItem;

    if (currentItem) {
      this._selectedItem.next({
        ...currentItem,
        hintergrund: color,
      });
    }
  }

  updateSchedule(data: { sichtbar: boolean, intervall: string, startDatum: Date | null, endDatum: Date | null }) {
    const currentItem = this.selectedItem;

    if (currentItem) {
      this._selectedItem.next({
        ...currentItem,
        sichtbar: data.sichtbar,
        intervall: data.intervall,
        startDatum: data.startDatum,
        endDatum: data.endDatum
      });
    }
  }

  saveItem(): Observable<any> {
    const item = this.selectedItem;
    if (!item) return of(null);

    const formData = new FormData();
    formData.append('Id', item.id.toString());  // Wenn ID 0 ist, schicken wir sie als 0 (PHP erkennt das als Neu)
    formData.append('Text', item.text || '');

    if (item.startDatum instanceof Date) {
      // formData.append('startDatum', item.startDatum.toISOString().split('T')[0]);
      formData.append('Start', item.startDatum.toISOString());
    }
    if (item.endDatum instanceof Date) {
      formData.append('Ende', item.endDatum.toISOString());
    }

    formData.append('Intervall', item.intervall || 'none');
    formData.append('Sichtbar', item.sichtbar ? '1' : '0');
    formData.append('Sortierung', `${item.sort}`);

    // Die echte Datei hinzufügen (falls vorhanden)
    if (this.currentUploadFile) {
      formData.append('hintergrund_file', this.currentUploadFile, this.currentUploadFile.name);
    } else {
      formData.append('hintergrund_raw', item.hintergrund || '');
    }

    return this.http.post(`${environment.httpPath}save_item.php`, formData).pipe(
      tap((res: any) => {
        if (res?.success) {
          // Nach Erfolg: Datei-Zwischenspeicher leeren
          this.currentUploadFile = null;
          // Wenn es ein neues Item war, hat der Server nun eine echte ID vergeben!
          if (item.id === 0 && res.newId) {
            this._selectedItem.next({ ...item, id: res.newId, hintergrund: res.newPath || item.hintergrund });
          }
        }
      }),
      catchError(err => {
        console.error('Speicherfehler:', err);
        return of({ success: false });
      })
    );
  }

  deleteItem(id: number) {
    const body = { id: id };

    return this.http.post(`${environment.httpPath}delete_item.php`, body).pipe(
      map(() => true), // Wenn der Server 200 OK sendet, interpretieren wir es als Erfolg
      catchError(error => {
        console.error('Fehler beim Löschen:', error);
        return of(false); // Bei Fehlern (404, 500) geben wir false zurück
      })
    );
  }

}


