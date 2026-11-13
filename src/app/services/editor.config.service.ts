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
    return this.http.get<Record<string, any>>(`assets/config.json?t=${Date.now()}`);
  }

  saveDisplayDuration(seconds: number): Observable<any> {
    // Nutzt dieselbe Basis-URL wie Ihre anderen PHP-Skripte!
    return this.http.post(`${environment.httpPath}/save_config.php`, {
      displayDurationSeconds: seconds
    });
  }

}
