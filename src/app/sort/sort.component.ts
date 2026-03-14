import { Component } from '@angular/core';
import { DragDropModule, moveItemInArray, CdkDragDrop } from '@angular/cdk/drag-drop';
import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { Item } from '../interfaces/item';

@Component({
  selector: 'app-sort',
  imports: [
    DragDropModule,
    SafeHtmlPipe,
  ],
  templateUrl: './sort.component.html',
  styleUrl: './sort.component.scss',
})

export class SortComponent {
  items: Item[] = []; // Hier die Liste aus dem Service laden

  drop(event: CdkDragDrop<Item[]>) {
    // 1. Position im Array tauschen
    moveItemInArray(this.items, event.previousIndex, event.currentIndex);

    // 2. Neue Sortier-Nummern vergeben (1-n)
    this.items.forEach((item, index) => {
      item.sort = index + 1;
    });

    // 3. Markiere, dass Änderungen vorliegen (Save-Button aktivieren)
    // this.itemChanged = true;
  }

}
