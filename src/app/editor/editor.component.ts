import { Component, ViewChild, ElementRef, inject, OnDestroy, AfterViewInit, OnInit } from '@angular/core';
import { FormsModule } from "@angular/forms";
import { fromEvent, Subscription } from 'rxjs';

import { ItemService } from '../services/item.service';
import { Item } from '../interfaces/item';

import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { AsyncPipe } from '@angular/common';
import { IsColorPipe } from '../pipes/is-color.pipe';
import { ImageUrlPipe } from '../pipes/image-url.pipe';

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
  styleUrl: './editor.component.scss',
})
export class EditorComponent implements AfterViewInit, OnInit, OnDestroy {
  // @ViewChild('mainDiv') mainDiv!: ElementRef;

  // mainDivHeight: number = 1;
  subscriptions: Subscription[] = [];

  activeItem: Item | null = null;

  // defText: string = '<p>Beispiel-Text</p>';

  constructor(
    public itemService: ItemService,
  ) {
    // this.subscriptions.push(
    //   fromEvent(window, 'resize').subscribe(() => {
    //     this.mainDivHeight = Math.round((this.mainDiv.nativeElement.clientWidth - 2 * 18) / 16 * 9);
    //   })
    // );
  }

  ngOnInit() {
    this.subscriptions.push(
      this.itemService.selectedItem$.subscribe(item => {
        if (item) {
          this.activeItem = item;
        }
      })
    );
  }

  ngAfterViewInit() {
    // setTimeout(() => {
    //   window.dispatchEvent(new Event('resize'));
    // });
  }

  ngOnDestroy() {
    this.subscriptions.forEach(e => e.unsubscribe);
  }

}


