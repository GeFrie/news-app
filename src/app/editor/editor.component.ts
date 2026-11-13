import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from "@angular/forms";
import { Subscription } from 'rxjs';

import { ItemService } from '../services/item.service';
import { Item } from '../interfaces/item';

import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { AsyncPipe } from '@angular/common';
import { IsColorPipe } from '../pipes/is-color.pipe';
import { ImageUrlPipe } from '../pipes/image-url.pipe';
import { EditorConfigService } from '../services/editor.config.service';

@Component({
  selector: 'app-editor',
  imports: [
    FormsModule,
    AsyncPipe,
    IsColorPipe,
    ImageUrlPipe,
    SafeHtmlPipe,
    SafeUrlPipe,
  ],
  templateUrl: './editor.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './editor.component.scss',
})
export class EditorComponent implements OnInit, OnDestroy {
  subscriptions: Subscription[] = [];
  activeItem: Item | null = null;

  constructor(
    public configService: EditorConfigService,
    private itemService: ItemService,
  ) { }

  ngOnInit() {
    this.subscriptions.push(
      this.itemService.selectedItem$.subscribe(item => {
        if (item) {
          this.activeItem = item;
        } else {
          this.itemService.triggerInitialSelectionRequest();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(e => e.unsubscribe());
  }

}


