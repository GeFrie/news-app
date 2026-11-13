import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export enum SaveState {
  SAVED = 0,
  ITEM = 1,
  PLAN = 2,
  SORT = 4,
}

@Injectable({
  providedIn: 'root',
})

export class SaveStateService {

  private saveState$ = new BehaviorSubject<SaveState>(SaveState.SAVED);

  // Stream für Komponenten/Services, die den Zustand beobachten wollen
  readonly state$: Observable<SaveState> = this.saveState$.asObservable();

  // Den aktuellen Wert direkt auslesen
  get currentState(): SaveState {
    return this.saveState$.value;
  }

  // Zustand komplett überschreiben
  setState(state: SaveState): void {
    this.saveState$.next(state);
  }

  // Einen Zustand per Bitweise-ODER hinzufügen (z.B. ITEM zu SORTIERUNG hinzufügen)
  addState(state: SaveState): void {
    const newState = this.currentState | state;
    this.saveState$.next(newState);
  }

  // Einen Zustand per Bitweise-UND-NICHT entfernen
  removeState(state: SaveState): void {
    const newState = this.currentState & ~state;
    this.saveState$.next(newState);
  }

  // Prüfen, ob ein bestimmter Zustand gerade aktiv ist
  hasState(state: SaveState): boolean {
    if (state === SaveState.SAVED) {
      return this.currentState === SaveState.SAVED;
    }
    return (this.currentState & state) === state;
  }
}
