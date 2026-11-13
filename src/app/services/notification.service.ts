import { Injectable } from '@angular/core';
import { NzNotificationPlacement, NzNotificationService } from 'ng-zorro-antd/notification';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  constructor(
    private _notify: NzNotificationService
  ) { }

  createNotification(
    type: string,
    title: string,
    text: string,
    duration: number = 4500,
    placement: NzNotificationPlacement = 'topRight'
  ): void {
    this._notify.create(
      type,
      title,
      text,
      {
        nzPlacement: placement,
        nzDuration: duration,
        nzPauseOnHover: duration > 0,
        nzStyle: { 'white-space': 'pre-line' }
      }
    );
  }

}
