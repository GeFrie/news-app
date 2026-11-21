import { ApplicationRef, EnvironmentInjector, createComponent, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { SaveStateService, SaveState } from '../services/save.state.service';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Observable, Subject } from 'rxjs';
import { ItemService } from '../services/item.service';
import { ModalTitleTemplateComponent } from '../shared/templates/modal-warning-title.tmplates';

// Wir definieren ein Interface, um sicherzustellen, dass die Komponente die save-Methode hat
interface CanComponentDeactivate {
  save: () => Observable<any>;
}

export const pendingChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component): Observable<boolean> | boolean => {
  const stateService = inject(SaveStateService);
  const modalService = inject(NzModalService);
  const itemService = inject(ItemService);
  const injector = inject(EnvironmentInjector);
  const appRef = inject(ApplicationRef);

  // Wenn alles gespeichert ist, direkt weiterleiten
  if (stateService.hasState(SaveState.SAVED)) {
    return true;
  }

  const deactivationSubject = new Subject<boolean>();

  // Komponente erzeugen, um Zugriff auf die TemplateRef zu bekommen
  const compRef = createComponent(ModalTitleTemplateComponent, { environmentInjector: injector });
  appRef.attachView(compRef.hostView);

  const modalRef = modalService.create({
    // nzTitle: compRef.instance.titleTpl, // Ungespeicherte Änderungen
    nzContent: compRef.instance.titleTpl,
    nzIconType: 'exclamation-circle',
    nzClosable: false,      // Verhindert Schließen über "X" ohne Entscheidung
    nzMaskClosable: false,  // Verhindert Schließen durch Klick neben das Modal
    nzWidth: '460px',
    nzFooter: [
      // BUTTON 1: "Zurück" -> Bleibt auf der aktuellen Seite (Route-Wechsel abbrechen)
      {
        label: 'Zurück',
        onClick: () => {
          deactivationSubject.next(false);
          deactivationSubject.complete();
          modalRef.destroy();
        }
      },

      // BUTTON 2: "Verwerfen" -> Verwirft Änderungen und leitet weiter
      {
        label: 'Verwerfen',
        danger: true, // Optional: hebt "Verwerfen" optisch leicht als Warnung hervor
        onClick: () => {
          stateService.setState(SaveState.SAVED);
          itemService.executeDashboardDiscard();
          deactivationSubject.next(true);
          deactivationSubject.complete();
          modalRef.destroy();
        }
      },

      // BUTTON 3: "Speichern" -> Speichert zuerst und leitet dann weiter
      {
        label: 'Speichern',
        type: 'primary',
        onClick: () => {
          itemService.executeDashboardSave().subscribe({
            next: () => {
              deactivationSubject.next(true);
              deactivationSubject.complete();
              modalRef.destroy();
            },
            error: (err) => {
              console.error('Speichern fehlgeschlagen vor Route-Wechsel:', err);
              deactivationSubject.next(false);
              deactivationSubject.complete();
              modalRef.destroy();
            }
          });
        }
      }
    ]
  });
  //     nzOkText: 'Speichern',
  //     nzCancelText: 'Verwerfen',

  //     // FALL A: "Speichern & Weiter" -> Ruft die echte dashboard.save() auf
  //     nzOnOk: () => {
  //       itemService.executeDashboardSave().subscribe({
  //         next: () => {
  //           // Wenn der Server-Call aus dashboard.save() erfolgreich durch ist: weiterleiten!
  //           deactivationSubject.next(true);
  //           deactivationSubject.complete();
  //         },
  //         error: (err) => {
  //           console.error('Speichern fehlgeschlagen vor Route-Wechsel:', err);
  //           deactivationSubject.next(false); // Bei Fehlern auf der Seite halten (Datenschutz)
  //           deactivationSubject.complete();
  //         }
  //       });
  //     },

  //     // FALL B: Nutzer klickt auf "Ignorieren & Verlassen"
  //     nzOnCancel: () => {
  //       deactivationSubject.next(true); // Weiterleitung ohne Speichern erlauben
  //       deactivationSubject.complete();
  //     }
  // });

  return deactivationSubject.asObservable();
};
