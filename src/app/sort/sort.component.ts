import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem, DragDropModule, copyArrayItem } from '@angular/cdk/drag-drop';
import { ItemService } from '../services/item.service';
import { SortService } from '../services/sort.service';
import { Item } from '../interfaces/item';
import { AsyncPipe } from '@angular/common';
import { ImageUrlPipe } from '../pipes/image-url.pipe'
import { SafeHtmlPipe } from '../pipes/safe-html.pipe'
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { Subscription } from 'rxjs/internal/Subscription';
import { withLatestFrom } from 'rxjs';
import { SaveState, SaveStateService } from '../services/save.state.service';

@Component({
  selector: 'app-sort',
  standalone: true,
  imports: [
    DragDropModule,
    AsyncPipe,
    ImageUrlPipe,
    SafeHtmlPipe,
    SafeUrlPipe,
    NzIconModule,
  ],
  templateUrl: './sort.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./sort.component.scss']
})
export class SortComponent implements OnInit {

  public itemService = inject(ItemService);
  public selectedItem = this.itemService.selectedItem$; // für Async-Pipe

  subscriptions: Subscription[] = [];
  sortedItems: Item[] = [];

  constructor(
    public sortService: SortService,
    private save: SaveStateService,
  ) { }

  ngOnInit() {
    // 1. Wir verknüpfen den HTTP-Call mit dem aktuellen Zustand des selektierten Items
    this.subscriptions.push(
      this.sortService.getSortedItems().pipe(
        withLatestFrom(this.itemService.selectedItem$)
      ).subscribe(([items, currentSelected]) => {
        // Zuerst die sortierten Items lokal zuweisen
        this.sortedItems = items;

        // 2. PRÜFUNG DER SELEKTIERUNG:
        if (currentSelected) {
          // Prüfen, ob das aktuell selektierte Item in den neu geladenen Items existiert
          const exists = this.sortedItems.some(item => item.id === currentSelected.id);

          if (!exists) {
            // Nur wenn es nachweislich FEHLT, löschen wir die Selektion
            this.itemService.setSelectedItem(null);
          } else {
            // Falls es existiert, stellen wir sicher, dass die Referenz im Service 
            // mit dem frisch geladenen Objekt übereinstimmt (wichtig für Updates)
            const matchedItem = this.sortedItems.find(item => item.id === currentSelected.id);
            if (matchedItem) {
              this.itemService.setSelectedItem(matchedItem);
            }
          }
        }
      })
    );
    this.subscriptions.push(
      this.sortService.sortedItems$.subscribe(items => {
        // Verhindert das Überschreiben, falls der HTTP-Call noch läuft
        if (items && items.length > 0) {
          this.sortedItems = items;
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(e => e.unsubscribe());
  }

  onDrop(event: CdkDragDrop<Item[]>) {
    if (event.previousContainer === event.container) {
      // INTERNE SORTIERUNG
      if (!event.isPointerOverContainer) {
        // Item beim Herausziehen aus dem Container entfernen
        this.sortedItems.splice(event.previousIndex, 1);
      } else {
        moveItemInArray(
          this.sortedItems,
          event.previousIndex,
          event.currentIndex
        );
      }
    } else {
      // TRANSFER VOM SIDER
      const draggedItem = event.previousContainer.data[event.previousIndex];

      // 1. Dubletten-Check: Ist die ID schon in der Zielliste?
      const alreadyExists = this.sortedItems.some(item => item.id === draggedItem.id);
      if (alreadyExists) {
        return; // Abbrechen, falls das Item bereits enthalten ist
      }

      // 2. Ziel-Index bestimmen
      let targetIndex = event.currentIndex;
      if (targetIndex >= this.sortedItems.length && this.sortedItems.length > 0) {
        targetIndex = this.sortedItems.length;
      }

      // 3. Item einfügen (copyArrayItem belässt das Original im Sider; 
      // falls es im Sider verschwinden soll, nutzen Sie wieder transferArrayItem)
      // transferArrayItem(
      copyArrayItem(
        event.previousContainer.data,
        this.sortedItems,
        event.previousIndex,
        targetIndex
      );
    }

    this.updateSortOrder();
  }


  updateSortOrder() {
    this.sortedItems.forEach((item, index) => {
      item.sort = index + 1;
    });
    if (this.sortedItems.length === 1) {
      this.selectItem(this.sortedItems[0])
    }
    this.save.addState(SaveState.SORT);
  }

  onDragStarted(): void {
    // Setzt den Cursor auf das gesamte Dokument-Root (höchste Instanz)
    document.documentElement.style.setProperty('cursor', 'move', 'important');
  }

  onDragEnded(): void {
    // Entfernt den Cursor-Zwang sofort nach dem Drop
    document.documentElement.style.removeProperty('cursor');
  }

  selectItem(item: Item) {
    this.itemService.setSelectedItem(item);
  }

}

