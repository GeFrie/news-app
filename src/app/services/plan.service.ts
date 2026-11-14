import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { NotificationService } from './notification.service';
import { BehaviorSubject, catchError, map, Observable, of, Subject, take, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Plan, IntervalType, dbPlan, CalcDate } from '../interfaces/item';
import { SaveState, SaveStateService } from './save.state.service';
import { formatTimeToSql, getTime } from '../shared/utils/time-format.utils';
import { createTageRecord } from '../shared/utils/plan.utils';

// Definiert alle Befehle, die das Dashboard an die Preview senden kann
export interface PreviewCommand {
  action: 'NEXT_TIMEPOINT' | 'TOGGLE_PLAYBACK' | 'CHANGE_MODE' | 'JUMP_TO_TIME' | 'RESET';
  mode?: 'all' | 'changes' | 'specific';
  targetTime?: string;
}
@Injectable({ providedIn: 'root' })

export class PlanService {

  private previewDurationSource = new BehaviorSubject<number>(2);
  previewDuration$ = this.previewDurationSource.asObservable();

  // Setter-Methode für das Dashboard
  setPreviewDuration(seconds: number): void {
    if (seconds && seconds > 0) {
      this.previewDurationSource.next(seconds);
    }
  }

  private _selectedPlan = new BehaviorSubject<Plan | null>(null);
  selectedPlan$ = this._selectedPlan.asObservable();

  // Kanal: Dashboard -> Preview
  // 1. Zentraler Event-Kanal für alle Vorschau-Befehle
  private previewCommandSource = new Subject<PreviewCommand>();
  // 2. Das Observable, worauf die PreviewComponent hört
  previewCommand$ = this.previewCommandSource.asObservable();

  constructor(
    private http: HttpClient,
    private save: SaveStateService,
    private notify: NotificationService,
  ) { }

  // 3. Methoden für das Dashboard
  // Button 1: Startet/Stoppt die Bild-Rotation
  triggerTogglePlayback(): void {
    this.previewCommandSource.next({ action: 'TOGGLE_PLAYBACK' });
  }

  // Button 2: Springt zum nächsten Zeitpunkt/Umschaltpunkt
  triggerNextTimepoint(): void {
    this.previewCommandSource.next({ action: 'NEXT_TIMEPOINT' });
  }

  // Button 3: Setzt die Vorschau wieder auf den ersten Eintrag zurück
  triggerReset(): void {
    this.previewCommandSource.next({ action: 'RESET' });
  }

  setPreviewMode(mode: 'all' | 'changes' | 'specific', targetTime?: string): void {
    this.previewCommandSource.next({ action: 'CHANGE_MODE', mode, targetTime });
  }

  jumpToSpecificTime(targetTime: string): void {
    this.previewCommandSource.next({ action: 'JUMP_TO_TIME', mode: 'specific', targetTime });
  }

  setSelectedPlan(plan: Plan) {
    this._selectedPlan.next(plan);
  }

  get selectedPlan(): Plan | null {
    return this._selectedPlan.value;
  }

  getPlans(ids: number[]): Observable<Plan[] | []> {
    return this.http.post<dbPlan[]>(`${environment.apiUrl}get_plans.php`, { ids }).pipe(
      map(values => values.map(value => {
        const validInterval = value.period && environment.VALID_INTERVALS.has(value.period)
          ? (value.period as IntervalType)
          : 'none';
        const daysArray = typeof value.days === 'string' && value.days.trim() !== ''
          ? value.days.split(',').map(tag => Number(tag.trim()))
          : Array.isArray(value.days)
            ? value.days.map(tag => Number(tag)) // Falls es mal als echtes Array kommt
            : [];
        const intervalArray = createTageRecord();
        intervalArray[validInterval] = daysArray;

        return {
          id: value.id,
          sort: value.sort ? Number(value.sort) : 0,
          period: validInterval,
          days: intervalArray,
          dates: [
            // value.start_date ? new Date(value.start_date) : new Date(),
            // value.end_date ? new Date(value.end_date) : value.start_date ? new Date(value.start_date) : new Date()
            value.start_date ? new Date(value.start_date) : null,
            value.end_date ? new Date(value.end_date) : null
          ],
          times: [
            getTime(value.start_time),
            getTime(value.end_time)
          ],
          remove: false,
        }
      })),
      tap(values => {
        if (values && values.length > 0) {
          this.setSelectedPlan(values[0]);
        }
      })
    );
  }

  getPreviewPlans(ids: number[], today?: string): Observable<CalcDate[] | []> {
    const payload: any = { ids };
    if (today) {
      payload.start_date = today;
      payload.end_date = today;
    }

    return this.http.post<CalcDate[]>(`${environment.apiUrl}get_plans_calc.php`, payload).pipe(
      // map(values => values.map(value => ({
      //   ...value
      // })))
    );
  }

  createPlan(id: number, itemCount: number): Plan {
    return {
      id: id,
      sort: itemCount + 1,
      period: 'none',
      days: createTageRecord(),
      dates: [new Date(), null],
      times: [null, null],
      remove: false,
    };
  }

  updatePlan(plans: Plan[]) {
    this.save.addState(SaveState.PLAN);
  }

  savePlan(plans: Plan[]): Observable<any> {
    const formData = new FormData();

    const formatedPlans = plans.map(plan => {
      const period = plan.period || 'none';
      const daysArray = plan.days && plan.days[period]
        ? plan.days[period]
        : [];
      return {
        id: plan.id,
        sort: plan.sort || 0,
        period: period,
        days: daysArray.join(','),
        start_date: plan.dates?.[0] instanceof Date ? plan.dates[0].toISOString().split('T')[0] : null,
        end_date: plan.dates?.[1] instanceof Date ? plan.dates[1].toISOString().split('T')[0] : null,
        start_time: plan.times?.[0] instanceof Date ? formatTimeToSql(plan.times[0]) : null,
        end_time: plan.times?.[1] instanceof Date ? formatTimeToSql(plan.times[1]) : null,
        remove: plan.remove ? 1 : 0
      };
    });

    formData.append('plans', JSON.stringify(formatedPlans));

    return this.http.post(`${environment.apiUrl}save_plans.php`, formData).pipe(
      tap((res: any) => {
        if (res?.success) {
          this.save.removeState(SaveState.PLAN);
        }
      }),
      catchError(err => {
        console.error('Speicherfehler bei Plans:', err);
        return of({ success: false });
      })
    );
  }

}


