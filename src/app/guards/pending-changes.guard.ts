import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { SaveStateService, SaveState } from '../services/save.state.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Observable, Subject } from 'rxjs';
import { ItemService } from '../services/item.service';

// Wir definieren ein Interface, um sicherzustellen, dass die Komponente die save-Methode hat
interface CanComponentDeactivate {
  save: () => Observable<any>;
}

export const pendingChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component): Observable<boolean> | boolean => {
  const stateService = inject(SaveStateService);
  const modalService = inject(NzModalService);
  const itemService = inject(ItemService);

  // Wenn alles gespeichert ist, direkt weiterleiten
  if (stateService.hasState(SaveState.SAVED)) {
    return true;
  }

  const deactivationSubject = new Subject<boolean>();

  modalService.warning({
    nzTitle: 'Ungespeicherte Änderungen',
    nzContent: 'Um die Änderungen in der Vorschau anzuzeigen, müssen diese gespeichert werden.',
    nzOkText: 'Speichern',
    nzCancelText: 'Ignorieren',

    // FALL A: "Speichern & Weiter" -> Ruft die echte dashboard.save() auf
    nzOnOk: () => {
      itemService.executeDashboardSave().subscribe({
        next: () => {
          // Wenn der Server-Call aus dashboard.save() erfolgreich durch ist: weiterleiten!
          deactivationSubject.next(true);
          deactivationSubject.complete();
        },
        error: (err) => {
          console.error('Speichern fehlgeschlagen vor Route-Wechsel:', err);
          deactivationSubject.next(false); // Bei Fehlern auf der Seite halten (Datenschutz)
          deactivationSubject.complete();
        }
      });
    },

    // FALL B: Nutzer klickt auf "Ignorieren & Verlassen"
    nzOnCancel: () => {
      deactivationSubject.next(true); // Weiterleitung ohne Speichern erlauben
      deactivationSubject.complete();
    }
  });

  return deactivationSubject.asObservable();
};
