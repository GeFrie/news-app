import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { EditorConfig } from '../interfaces/editor.config';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class EditorConfigService {

  private viewConfig = new BehaviorSubject<EditorConfig>({
    showText: true,
    showFile: true,
    showColor: true
  });
  viewConfig$ = this.viewConfig.asObservable();

  constructor(
    private http: HttpClient,
  ) { }

  updateView(key: keyof EditorConfig, visible: boolean) {
    const currentItem = this.viewConfig.value;
    this.viewConfig.next({ ...currentItem, [key]: visible });
  }

  getConfig(): Observable<Record<string, any>> {
    return this.http.get<Record<string, any>>(`${environment.configUrl}?t=${Date.now()}`);
  }

  saveDisplayDuration(seconds: number): Observable<any> {
    return this.http.post(`${environment.apiUrl}/save_config.php`, {
      displayDurationSeconds: seconds
    });
  }

}
