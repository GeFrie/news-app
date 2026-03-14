export interface Item {
    id: number;
    text: string;
    hintergrund: string;
    startDatum?: Date | null;
    endDatum?: Date | null;
    intervall?: string;
    sichtbar?: boolean;
    mediaType?: string;
    sort?: number;
}

