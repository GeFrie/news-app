export type IntervalType = 'none' | 'daily' | 'weekly' | 'monthly_date' | 'monthly_weekday' | 'defined_date' | 'defined_input';

/**
 * Definitionen für die DB-Abfrage
 */
export interface dbItem {
    id: number;
    text: string;
    hintergrund: string;
    bgColor?: string;
    sort: number | null;
    sichtbar: string;
    textBox?: BoxRect,
    imageBoxes?: ImageBoxItem[];
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

/**
 * Definitionen für die Verarbeitung
 */
export interface Item {
    id: number;
    text: string;
    hintergrund: string;
    bgColor?: string;
    mediaType?: string;
    sort: number | null;
    sichtbar: boolean;
    textBox?: BoxRect;
    imageBoxes?: ImageBoxItem[];
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

export interface CalcDate {
    id: number;
    sort: number;
    start: string;
    end: string;
}

export interface BoxRect {
    left: number;   // in % (z.B. 5)
    top: number;    // in % (z.B. 10)
    width: number;  // in % (z.B. 90)
    height: number; // in % (z.B. 80)
}

export interface ImageBoxItem extends BoxRect {
    id: string;
    src: string;        // Dateiname auf dem Server (oder 'blob:...' vor dem 
    opacity?: number; // 0.1 bis 1 (Standard: 1)
    zIndex?: number;    // z.B. 1..9 (unter Text) oder 11..19 (über Text)
}
