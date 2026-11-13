export type IntervalType = 'none' | 'daily' | 'weekly' | 'monthly_date' | 'monthly_weekday' | 'defined_date' | 'defined_input';

export interface dbItem {
    id: number;
    text: string;
    hintergrund: string;
    sort: number | null;
    sichtbar: string;
}

export interface Item {
    id: number;
    text: string;
    hintergrund: string;
    mediaType?: string;
    sort: number | null;
    sichtbar: boolean;
}

export interface dbPlan {
    id: number;
    sort: number;
    start_date: Date | null;
    end_date: Date | null;
    start_time: string | null;
    end_time: string | null;
    period?: IntervalType;
    days?: string;
}

export interface Plan {
    id: number;
    sort: number;
    dates: (Date | null)[];
    times: (Date | null)[];
    period: IntervalType;
    days: Record<IntervalType, number[]>;
    remove: boolean;
}

export const intervalArray: Record<IntervalType, number[]> = {
    'none': [],
    'daily': [],
    'weekly': [],
    'monthly_date': [],
    'monthly_weekday': [],
    'defined_date': [],
    'defined_input': []
};

export interface CalcDate {
  id: number;
  sort: number;
  start: string;
  end: string;
}
