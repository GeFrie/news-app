import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Item, dbItem } from '../interfaces/item';
import { detectMediaType } from '../shared/utils/media-type.utils';

@Injectable({
  providedIn: 'root',
})

export class ViewService {

  constructor(
    private http: HttpClient,
  ) { }

  getItems(): Observable<Item[] | []> {
    return this.http.get<dbItem[]>(`${environment.apiUrl}get_valid_items.php`).pipe(
      map(items => items.map(item => ({
        ...item,
        id: Number(item.id),
        sichtbar: item.sichtbar === '1',
        mediaType: detectMediaType(item.hintergrund)
      }))),
    );
  }

}
