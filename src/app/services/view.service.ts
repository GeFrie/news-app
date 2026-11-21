import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Item, dbItem } from '../interfaces/item';
import { detectMediaType, parseImageBoxes } from '../shared/utils/media-type.utils';

@Injectable({
  providedIn: 'root',
})

export class ViewService {

  constructor(
    private http: HttpClient,
  ) { }

getItems(): Observable<Item[] | []> {
    return this.http.get<dbItem[]>(`${environment.apiUrl}get_valid_items.php`).pipe(
      map(items => items.map(item => {
        const rawImageBox = (item as any).imageBox ?? (item as any).Imagebox;
        const rawTextBox = (item as any).textBox ?? (item as any).Textbox;

        let parsedTextBox = undefined;
        if (typeof rawTextBox === 'string' && rawTextBox.trim() && rawTextBox !== 'null') {
          try {
            parsedTextBox = JSON.parse(rawTextBox);
          } catch {
            parsedTextBox = undefined;
          }
        } else if (rawTextBox && typeof rawTextBox === 'object') {
          parsedTextBox = rawTextBox;
        }

        return {
          ...item,
          id: Number(item.id),
          sichtbar: item.sichtbar === '1',
          mediaType: detectMediaType(item.hintergrund),
          textBox: parsedTextBox,
          imageBoxes: parseImageBoxes(rawImageBox, item.hintergrund)
        };
      }))
    );
  }}