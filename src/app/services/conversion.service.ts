import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ConversionService {

  getArray(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

}
