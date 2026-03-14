import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet, RouterLink, RouterLinkActive, ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { IsColorPipe } from '../pipes/is-color.pipe';
import { ImageUrlPipe } from '../pipes/image-url.pipe';


import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzGridModule } from 'ng-zorro-antd/grid';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { NzSpaceModule } from 'ng-zorro-antd/space';
import { NzMenuModule } from 'ng-zorro-antd/menu';

import { filter, Subscription } from 'rxjs';

import { ItemService } from '../services/item.service';
import { Item } from '../interfaces/item';


import { ModalManagerService } from '../services/modal.manager.service';
import { NotificationService } from '../services/notification.service';

import { environment } from '../../environments/environment';
import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { IsPdfPipe } from '../pipes/is-pdf.pipe';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';

@Component({
  selector: 'app-dashboard',
  imports: [
    FormsModule,
    RouterOutlet, RouterLink, RouterLinkActive,
    AsyncPipe,
    NzLayoutModule,
    NzModalModule,
    NzButtonModule,
    NzGridModule,
    NzSpaceModule,
    NzSwitchModule,
    NzTooltipModule,
    NzMenuModule,
    IsColorPipe,
    ImageUrlPipe,
    SafeHtmlPipe,
    // IsPdfPipe,
    SafeUrlPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})

export class DashboardComponent implements OnInit, OnDestroy {

  public itemService = inject(ItemService);

  subscriptions: Subscription[] = [];

  showText: boolean = true;
  showFile: boolean = true;
  showColor: boolean = true;

  isNew: boolean = false;
  itemChanged: boolean = false;
  removable: boolean = false;

  isDeleting = false;
  isSaving = false;

  items: Item[] = [];

  rightSiderWidth = 250;

  selectedItem = this.itemService.selectedItem$; // für Async-Pipe

  currentRoute: any;

  imgPath: string = '';

  constructor(
    public modalManager: ModalManagerService,
    private modalService: NzModalService,
    private router: Router,
    private notify: NotificationService,
  ) {
    this.imgPath = `${environment.httpPath}uploads/`;

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentRoute = event.urlAfterRedirects.split('/').pop() || '';
      // console.log('Aktive Route:', this.currentRoute);
    });
  }

  ngOnInit() {
    this.subscriptions.push(
      this.itemService.listContents().subscribe(data => {
        if (data.length) {
          this.items = data;
          // console.log(this.items)
          // if (data.length && this.selectedId === 0) {
          if (data.length) {
            this.selectItem(data[0]);
          }
        } else {
          this.createItem();
        }
        this.removable = this.items.length > 0;
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(e => e.unsubscribe);
  }

  showModal(type: 'text' | 'file' | 'color'|'schedule') {
    const item = this.itemService.selectedItem;
    if (!item) return;

    // 1. Modal öffnen und Referenz speichern
    const modalRef = this.modalManager.openEditorModal(type, item);

    // 2. Auf das Schließen im Dashboard warten
    modalRef.afterClose.subscribe(result => {
      if (result) {
        this.itemChanged = true;
      }
    });
  }

  loadItems(id?: number) {
    this.subscriptions.push(
      this.itemService.listContents().subscribe(data => {
        if (data.length) {
          this.items = data;
          if (this.items.length) {
            if (id) {
              const item = this.items.find(item => item.id === id);
              if (item) this.selectItem(item);
            } else {
              this.selectItem(data[0]);
            }
          }
        } else {
          this.createItem();
        }
        this.removable = this.items.length > 0;
      })
    );
  }

  selectItem(item: Item) {
    this.itemService.setSelectedItem(item);
    this.itemChanged = this.isNew;
  }

  createItem() {
    this.items.push({
      id: 0,
      hintergrund: '',
      text: ''
    });
    this.isNew = true;
    this.selectItem(this.items[this.items.length - 1]);
  }

  deleteItem() {
    this.modalService.confirm({
      nzTitle: 'Eintrag löschen?',
      // nzContent: `Möchtest du News #${this.selectedId} wirklich unwiderruflich löschen?`,
      nzContent: `Möchtest du News #${this.itemService.selectedItem?.id} wirklich unwiderruflich löschen?`,
      nzOkText: 'Löschen',
      nzOkDanger: true,
      nzOnOk: () => {
        const item = this.itemService.selectedItem;
        if (item && item.id !== undefined) {
          this.isDeleting = true;
          this.itemService.deleteItem(item.id).subscribe({
            next: (success) => {
              if (success) {
                this.notify.createNotification(
                  'success',
                  'Server-Meldung',
                  `News #${this.itemService.selectedItem?.id} wurde in der Datenbank gelöscht.`
                );
                // neue Referenz (Immutability), damit der Sider reagiert
                this.items = this.items.filter(item => item.id !== this.itemService.selectedItem?.id);
                // Auswahl auf das erste Item setzen || neues Item
                if (this.items.length > 0) {
                  this.selectItem(this.items[0]);
                } else {
                  this.createItem();
                }
                // Image-File löschen, falls vorhanden und gewünscht

              } else {
                this.notify.createNotification(
                  'error',
                  'Server-Fehler',
                  `News #${this.itemService.selectedItem?.id} konnte nicht gelöscht werden.`,
                  0
                );
              }
            },
            error: () => {
              this.notify.createNotification(
                'error',
                'Server-Fehler',
                `News #${this.itemService.selectedItem?.id} konnte nicht gelöscht werden.`,
                0
              );
            },
            complete: () => {
              this.isDeleting = false;
            }
          });
        }
      }
    });
  }

  saveItem() {
    this.isSaving = true;
    this.itemService.saveItem().subscribe(res => {
      this.isSaving = false;
      if (res?.success) {
        this.itemChanged = false;
        const idToSelect = res.newId || this.itemService.selectedItem?.id;
        this.notify.createNotification(
          'success',
          'Server-Meldung',
          `News #${this.itemService.selectedItem?.id} wurde in der Datenbank gespeichert.`
        );
        this.loadItems(idToSelect);
        // WARTEN, bis Angular das HTML gerendert hat
        setTimeout(() => {
          const element = document.getElementById('thumb-' + idToSelect);
          if (element) {
            element.scrollIntoView({
              behavior: 'smooth', // Sanftes Scrollen
              block: 'nearest'    // Scrollt nur so weit wie nötig
            });
          }
        }, 50);
      }
    });
  }

  hideView(type: 'text' | 'file' | 'color') {
    const configKey = type === 'text' ? 'showText' : (type === 'file' ? 'showFile' : 'showColor');
    this.itemService.updateView(configKey, this[configKey]);
  }

  get validItems() {
    return this.items.filter(item => item.id > 0);
  }


}
