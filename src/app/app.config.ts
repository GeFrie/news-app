import { ApplicationConfig, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { de_DE, provideNzI18n } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import de from '@angular/common/locales/de';
import { FormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { NgxEditorModule } from 'ngx-editor';
import { NzModalModule } from 'ng-zorro-antd/modal';

import localeDe from '@angular/common/locales/de';
import { LOCALE_ID } from '@angular/core';

import { NZ_DATE_CONFIG, NzDateConfig } from 'ng-zorro-antd/i18n';

registerLocaleData(de);
registerLocaleData(localeDe);

const dateConfig: NzDateConfig = {
  firstDayOfWeek: 1 // 0 = Sonntag, 1 = Montag, etc.
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideNzI18n(de_DE),
    { provide: LOCALE_ID, useValue: 'de-DE' },
    { provide: NZ_DATE_CONFIG, useValue: dateConfig },
    importProvidersFrom(FormsModule),
    provideHttpClient(),
    importProvidersFrom(
      NgxEditorModule.forRoot({
        locals: {
          bold: 'Fett',
          italic: 'Kursiv',
          underline: 'Unterstrichen',
          strike: 'Durchgestrichen',
          bullet_list: 'Aufzählung',
          ordered_list: 'Nummerierte Liste',
          heading: 'Überschrift...',
          h1: 'Überschrift 1',
          h2: 'Überschrift 2',
          h3: 'Überschrift 3',
          h4: 'Überschrift 4',
          url: 'URL',
          text: 'Text',
          openInNewTab: 'In neuem Tab öffnen',
          insertLink: 'Link einfügen',
          insertImage: 'Bild einfügen',
          altText: 'Alternativer Text',
          title: 'Titel',
          remove: 'Entfernen',
          enterValidUrl: 'Bitte eine gültige URL eingeben',
          code: 'Code',
          blockquote: 'Zitat',
          text_color: 'Textfarbe',
          background_color: 'Hintergrundfarbe',
          align_left: 'Links ausrichten',
          align_center: 'Zentrieren',
          align_right: 'Rechts ausrichten',
          align_justify: 'Blocksatz',
          horizontal_rule: 'Linie einfügen',
          format_clear: 'Format löschen',
          indent: 'Einzug vergrößern',
          outdent: 'Einzug verkleinern',
          superscript: 'Hochgestellt',
          subscript: 'Tiefgestellt',
          undo: 'Rückgängig',
          redo: 'Wiederholen',
          //     insertTable: 'Tabelle einfügen',
          //     addColumnBefore: 'Spalte davor',
          //     addColumnAfter: 'Spalte danach',
          //     deleteColumn: 'Spalte löschen',
          //     addRowBefore: 'Zeile davor',
          //     addRowAfter: 'Zeile danach',
          //     deleteRow: 'Zeile löschen',
          //     mergeCells: 'Zellen verbinden',
          //     splitCell: 'Zelle teilen',
          //     deleteTable: 'Tabelle löschen',

        },
      }),
    ),
    importProvidersFrom(NzModalModule)
  ]
};
