import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { BehaviorSubject, catchError, map, Observable, of, Subject, tap } from 'rxjs';
import { dbItem, Item } from '../interfaces/item';
import { SaveState, SaveStateService } from './save.state.service';
import { HttpClient } from '@angular/common/http';
import { detectMediaType } from '../shared/utils/media-type.utils';

@Injectable({ providedIn: 'root' })

export class SortService {

  private _sortedItems = new BehaviorSubject<Item[]>([]);
  sortedItems$ = this._sortedItems.asObservable();

  constructor(
    private http: HttpClient,
    private save: SaveStateService,
  ) { }


  get sortedItems(): Item[] {
    return this._sortedItems.value;
  }

  set sortedItems(value: Item[]) {
    this._sortedItems.next(value);
  }

  getSortedItems(): Observable<Item[] | []> {
    return this.http.get<dbItem[]>(`${environment.httpPath}get_sorted.php`).pipe(
      map(items => items.map(item => ({
        ...item,
        sichtbar: item.sichtbar === '1',
        mediaType: detectMediaType(item.hintergrund)
      })))
    );
  }

  saveSort(items: Item[]): Observable<any> {
    // 1. Alle Items aktualisieren: Match -> Wert übernehmen, kein Match -> null setzen
    items = items.map(item => {
      const sortedMatch = this.sortedItems.find(s => s.id === item.id);
      return {
        ...item,
        sort: sortedMatch ? sortedMatch.sort : null // Hier explizit null setzen
      };
    });

    // 2. Den gesamten Payload für das Backend vorbereiten
    const payload = items.map(item => ({
      id: item.id,
      sort: item.sort
    }));

    const formData = new FormData();
    formData.append('sortData', JSON.stringify(payload));

    return this.http.post(`${environment.httpPath}save_sort.php`, formData).pipe(
      tap((res: any) => {
        if (res?.success) {
          this.save.removeState(SaveState.SORT);
        }
      }),
      catchError(err => {
        console.error('Fehler beim Speichern der Sortierung:', err);
        return of({ success: false });
      })
    );
  }

}

