import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'isColor',
  standalone: true,
})
export class IsColorPipe implements PipeTransform {

  transform(value: string|null|undefined): boolean {
    if (!value) return false;

    // Erkennt: #fff, #ffffff, rgb(0,0,0), rgba(0,0,0,0.5), hsl, gradients
    const colorRegex = /^(#([\da-f]{3}){1,2}|(rgb|hsl)a?\((\s*-?\d+%?\s*[, ]\s*){2,3}\s*-?\d*\.?\d+%?\s*\)|linear-gradient|radial-gradient)/i;

    // Zusätzlich auf bekannte CSS-Farbnamen prüfen
    const colorNames = ['red', 'green', 'blue', 'black', 'white', 'transparent', 'yellow', 'orange'];

    return colorRegex.test(value.trim()) || colorNames.includes(value.toLowerCase().trim());

    // return value.startsWith('#') || value.startsWith('rgb') || value.startsWith('hsl');
  }

}
