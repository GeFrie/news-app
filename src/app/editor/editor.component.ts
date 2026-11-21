import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { FormsModule } from "@angular/forms";
import { Subscription } from 'rxjs';

import { ItemService } from '../services/item.service';
import { Item, BoxRect, ImageBoxItem } from '../interfaces/item';

import { SafeHtmlPipe } from '../pipes/safe-html.pipe';
import { SafeUrlPipe } from '../pipes/safe-url.pipe';
import { AsyncPipe, DecimalPipe } from '@angular/common';
import { ImageUrlPipe } from '../pipes/image-url.pipe';
import { EditorConfigService } from '../services/editor.config.service';
import { SaveState, SaveStateService } from '../services/save.state.service';

@Component({
  selector: 'app-editor',
  imports: [
    FormsModule,
    AsyncPipe,
    ImageUrlPipe,
    SafeHtmlPipe,
    SafeUrlPipe,
    DecimalPipe
  ],
  templateUrl: './editor.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './editor.component.scss',
})
export class EditorComponent implements OnInit, OnDestroy {

  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLElement>;
  @ViewChild('messageBox') messageBox!: ElementRef<HTMLElement>;

  subscriptions: Subscription[] = [];
  activeItem: Item | null = null;

  private dragMode: 'move' | 'resize' | null = null;
  private resizeDir: string = '';
  private startX = 0;
  private startY = 0;
  private startRect!: BoxRect;

  // Status für die roten Bühnen-Mittellinien (50% X / 50% Y)
  snapCenterX = false;
  snapCenterY = false;

  // Status für die bis zu 4 cyanblauen Objekt-Hilfslinien beim Andocken an Nachbar-Boxen
  snapLinesX: number[] = [];
  snapLinesY: number[] = [];

  selectedImageId: string | null = null;
  selectedLayer: 'text' | 'image' | null = null;
  activeTarget: 'text' | 'image' | null = null;

  private previousTextRect: BoxRect | null = null;
  private previousImageRects = new Map<string, BoxRect>();

  get isMaximized(): boolean {
    const tb = this.activeItem?.textBox;
    return !!tb && tb.left === 0 && tb.top === 0 && tb.width === 100 && tb.height === 100;
  }

  get hasTextContent(): boolean {
    const html = this.activeItem?.text || '';
    if (!html) return false;

    const plainText = html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();

    if (plainText.length > 0) return true;

    return /<(table|hr|img)\b/i.test(html);
  }

  constructor(
    public configService: EditorConfigService,
    private itemService: ItemService,
    private stateService: SaveStateService,
  ) { }

  ngOnInit() {
    this.subscriptions.push(
      this.itemService.selectedItem$.subscribe(item => {
        if (item) {
          // In editor.component.ts (innerhalb von ngOnInit -> selectedItem$.subscribe):
          const isSameItem = this.activeItem?.id === item.id;
          const textChanged = isSameItem && this.activeItem?.text !== item.text;

          const prevImageCount = this.activeItem?.imageBoxes?.length ?? 0;
          const nextImages = item.imageBoxes ? item.imageBoxes.map(b => ({ ...b })) : [];

          this.activeItem = {
            ...item,
            textBox: item.textBox ? { ...item.textBox } : undefined,
            imageBoxes: nextImages
          };

          // Wenn bei derselben News ein neues Bild hinzugefügt wurde -> sofort auswählen & nach vorne holen!
          if (isSameItem && nextImages.length > prevImageCount && nextImages.length > 0) {
            const newestImage = nextImages[nextImages.length - 1];
            this.selectedLayer = 'image';
            this.selectedImageId = newestImage.id;
          }

          if (textChanged) {
            setTimeout(() => this.fitBoxToText(), 0);
          }
        } else {
          this.itemService.triggerInitialSelectionRequest();
        }
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.forEach(e => e.unsubscribe());
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.dragMode || !this.canvasContainer?.nativeElement || !this.activeItem || !this.activeTarget) return;

    const container = this.canvasContainer.nativeElement.getBoundingClientRect();
    const deltaX = ((event.clientX - this.startX) / container.width) * 100;
    const deltaY = ((event.clientY - this.startY) / container.height) * 100;

    const next: BoxRect = { ...this.startRect };
    const minSize = 5;

    if (this.dragMode === 'move') {
      let rawLeft = Math.max(0, Math.min(100 - next.width, this.startRect.left + deltaX));
      let rawTop = Math.max(0, Math.min(100 - next.height, this.startRect.top + deltaY));
      const snapThreshold = 1.5;

      const boxCenterX = rawLeft + next.width / 2;
      const boxCenterY = rawTop + next.height / 2;

      // 1. Bühnen-Mitte prüfen (rote Linien)
      if (Math.abs(boxCenterX - 50) <= snapThreshold) {
        rawLeft = (100 - next.width) / 2;
        this.snapCenterX = true;
      } else {
        this.snapCenterX = false;
      }

      if (Math.abs(boxCenterY - 50) <= snapThreshold) {
        rawTop = (100 - next.height) / 2;
        this.snapCenterY = true;
      } else {
        this.snapCenterY = false;
      }

      // 2. Nachbar-Boxen prüfen (bis zu 4 cyanblaue Hilfslinien)
      const excludeKey = this.activeTarget === 'text' ? 'text' : (this.selectedImageId || '');
      const snapped = this.applyObjectSnapping(
        { left: rawLeft, top: rawTop, width: next.width, height: next.height },
        excludeKey
      );

      if (!this.snapCenterX) rawLeft = snapped.left;
      if (!this.snapCenterY) rawTop = snapped.top;

      next.left = rawLeft;
      next.top = rawTop;

    } else if (this.dragMode === 'resize') {
      this.snapLinesX = [];
      this.snapLinesY = [];
      const isCorner = this.resizeDir.length === 2;

      if (isCorner && this.startRect.height > 0) {
        const ratio = this.startRect.width / this.startRect.height;
        const minHeight = minSize / ratio;
        const rawDeltaW = this.resizeDir.includes('e') ? deltaX : -deltaX;

        const maxWByHorizontalEdge = this.resizeDir.includes('e')
          ? 100 - this.startRect.left
          : this.startRect.left + this.startRect.width;

        const maxHByVerticalEdge = this.resizeDir.includes('s')
          ? 100 - this.startRect.top
          : this.startRect.top + this.startRect.height;

        const maxAllowedW = Math.min(maxWByHorizontalEdge, maxHByVerticalEdge * ratio);
        const minAllowedW = Math.max(minSize, minHeight * ratio);

        const newW = Math.max(minAllowedW, Math.min(maxAllowedW, this.startRect.width + rawDeltaW));
        const newH = newW / ratio;

        next.width = newW;
        next.height = newH;

        if (this.resizeDir.includes('w')) {
          next.left = this.startRect.left + (this.startRect.width - newW);
        }
        if (this.resizeDir.includes('n')) {
          next.top = this.startRect.top + (this.startRect.height - newH);
        }
      } else {
        if (this.resizeDir.includes('e')) {
          next.width = Math.max(minSize, Math.min(100 - next.left, this.startRect.width + deltaX));
        }
        if (this.resizeDir.includes('s')) {
          next.height = Math.max(minSize, Math.min(100 - next.top, this.startRect.height + deltaY));
        }
        if (this.resizeDir.includes('w')) {
          const maxDelta = this.startRect.width - minSize;
          const clampedDelta = Math.max(-this.startRect.left, Math.min(maxDelta, deltaX));
          next.left = this.startRect.left + clampedDelta;
          next.width = this.startRect.width - clampedDelta;
        }
        if (this.resizeDir.includes('n')) {
          const maxDelta = this.startRect.height - minSize;
          const clampedDelta = Math.max(-this.startRect.top, Math.min(maxDelta, deltaY));
          next.top = this.startRect.top + clampedDelta;
          next.height = this.startRect.height - clampedDelta;
        }
      }
    }

    const rounded: BoxRect = {
      left: Math.round(next.left * 100) / 100,
      top: Math.round(next.top * 100) / 100,
      width: Math.round(next.width * 100) / 100,
      height: Math.round(next.height * 100) / 100
    };

    if (this.activeTarget === 'text') {
      this.activeItem.textBox = rounded;
    } else if (this.activeTarget === 'image' && this.selectedImageId && this.activeItem.imageBoxes) {
      this.activeItem.imageBoxes = this.activeItem.imageBoxes.map(img =>
        img.id === this.selectedImageId ? { ...img, ...rounded } : img
      );
    }
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    if (!this.dragMode || !this.activeItem || !this.activeTarget) return;

    const currentRect = this.getTargetRect(this.activeTarget, this.selectedImageId ?? undefined);

    const hasChanged = currentRect && (
      Math.abs(currentRect.left - this.startRect.left) > 0.05 ||
      Math.abs(currentRect.top - this.startRect.top) > 0.05 ||
      Math.abs(currentRect.width - this.startRect.width) > 0.05 ||
      Math.abs(currentRect.height - this.startRect.height) > 0.05
    );

    this.dragMode = null;
    this.snapCenterX = false;
    this.snapCenterY = false;
    this.snapLinesX = [];
    this.snapLinesY = [];

    if (hasChanged && currentRect) {
      this.saveBoxPositions();
    }
  }

  startDrag(event: PointerEvent, target: 'text' | 'image', imageId?: string): void {
    if (!this.activeItem) return;
    if ((event.target as HTMLElement).classList.contains('resize-handle')) return;

    event.preventDefault();
    event.stopPropagation();

    this.activeTarget = target;
    this.selectedLayer = target;
    this.selectedImageId = target === 'image' ? (imageId ?? null) : null;
    this.dragMode = 'move';
    this.startX = event.clientX;
    this.startY = event.clientY;

    const rect = this.getTargetRect(target, imageId);
    if (rect) {
      this.startRect = { ...rect };
    }
  }

  startResize(event: PointerEvent, direction: string, target: 'text' | 'image', imageId?: string): void {
    if (!this.activeItem) return;

    event.stopPropagation();
    event.preventDefault();

    this.activeTarget = target;
    this.selectedLayer = target;
    this.selectedImageId = target === 'image' ? (imageId ?? null) : null;
    this.dragMode = 'resize';
    this.resizeDir = direction;
    this.startX = event.clientX;
    this.startY = event.clientY;
    const rect = this.getTargetRect(target, imageId);
    if (rect) {
      this.startRect = { ...rect };
    }
  }
  private getTargetRect(target: 'text' | 'image', imageId?: string): BoxRect | null {
    if (!this.activeItem) return null;
    if (target === 'text') {
      if (this.activeItem.textBox) {
        return { ...this.activeItem.textBox };
      }
      const containerEl = this.getContainerElement();
      const boxEl = this.messageBox?.nativeElement;
      if (containerEl && boxEl) {
        const container = containerEl.getBoundingClientRect();
        const box = boxEl.getBoundingClientRect();
        return {
          left: Math.round(((box.left - container.left) / container.width) * 10000) / 100,
          top: Math.round(((box.top - container.top) / container.height) * 10000) / 100,
          width: Math.round((box.width / container.width) * 10000) / 100,
          height: Math.round((box.height / container.height) * 10000) / 100
        };
      }
      return { left: 12.5, top: 40, width: 75, height: 20 };
    }
    const img = this.activeItem.imageBoxes?.find(i => i.id === (imageId ?? this.selectedImageId));
    return img ? { left: img.left, top: img.top, width: img.width, height: img.height } : null;
  }
  private getContainerElement(): HTMLElement | null {
    return this.canvasContainer?.nativeElement
      ?? this.messageBox?.nativeElement?.closest('.main') as HTMLElement | null;
  }
  private saveBoxPositions(): void {
    if (!this.activeItem) return;
    this.activeItem = {
      ...this.activeItem,
      textBox: this.activeItem.textBox ? { ...this.activeItem.textBox } : undefined,
      imageBoxes: this.activeItem.imageBoxes ? this.activeItem.imageBoxes.map(b => ({ ...b })) : []
    };
    this.itemService.setSelectedItem(this.activeItem);
    this.stateService.setState(SaveState.ITEM);
  }
  centerHorizontally(target: 'text' | 'image', imageId?: string): void {
    if (!this.activeItem) return;
    const rect = this.getTargetRect(target, imageId);
    if (!rect) return;
    rect.left = Math.round(((100 - rect.width) / 2) * 100) / 100;
    if (target === 'text') {
      this.activeItem.textBox = rect;
      this.saveBoxPositions();
    } else if (imageId) {
      this.itemService.updateImageBox(imageId, { left: rect.left });
    }
  }
  centerVertically(target: 'text' | 'image', imageId?: string): void {
    if (!this.activeItem) return;
    const rect = this.getTargetRect(target, imageId);
    if (!rect) return;
    rect.top = Math.round(((100 - rect.height) / 2) * 100) / 100;
    if (target === 'text') {
      this.activeItem.textBox = rect;
      this.saveBoxPositions();
    } else if (imageId) {
      this.itemService.updateImageBox(imageId, { top: rect.top });
    }
  }
  isBoxMaximized(target: 'text' | 'image', imageId?: string): boolean {
    if (target === 'text') {
      const tb = this.activeItem?.textBox;
      return !!tb && tb.left === 0 && tb.top === 0 && tb.width === 100 && tb.height === 100;
    }
    const img = this.activeItem?.imageBoxes?.find(i => i.id === imageId);
    return !!img && img.left === 0 && img.top === 0 && img.width === 100 && img.height === 100;
  }
  toggleMaximizeBox(target: 'text' | 'image', imageId?: string): void {
    if (!this.activeItem) return;
    if (target === 'text') {
      if (this.isBoxMaximized('text')) {
        this.activeItem.textBox = this.previousTextRect ? { ...this.previousTextRect } : undefined;
        this.previousTextRect = null;
      } else {
        this.previousTextRect = this.getTargetRect('text');
        this.activeItem.textBox = { left: 0, top: 0, width: 100, height: 100 };
      }
      this.saveBoxPositions();
    } else if (imageId) {
      if (this.isBoxMaximized('image', imageId)) {
        const prev = this.previousImageRects.get(imageId) ?? { left: 25, top: 25, width: 50, height: 50 };
        this.previousImageRects.delete(imageId);
        this.itemService.updateImageBox(imageId, prev);
      } else {
        const current = this.getTargetRect('image', imageId);
        if (current) this.previousImageRects.set(imageId, current);
        this.itemService.updateImageBox(imageId, { left: 0, top: 0, width: 100, height: 100 });
      }
    }
  }
  resetBox(target: 'text' | 'image', imageId?: string): void {
    if (!this.activeItem) return;
    if (target === 'text') {
      this.activeItem.textBox = undefined;
      this.previousTextRect = null;
      this.saveBoxPositions();
    } else if (imageId) {
      this.previousImageRects.delete(imageId);
      this.itemService.updateImageBox(imageId, { opacity: 1 });
    }
  }
  changeImageZIndex(id: string, delta: 1 | -1): void {
    const img = this.activeItem?.imageBoxes?.find(i => i.id === id);
    if (!img) return;
    const currentZ = img.zIndex ?? 1;
    let nextZ = currentZ + delta;
    if (nextZ === 10) nextZ += delta; // z-index 10 bleibt für textBox reserviert
    nextZ = Math.max(1, Math.min(19, nextZ));
    this.itemService.updateImageBox(id, { zIndex: nextZ });
  }
  onImageOpacityChange(id: string, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.itemService.updateImageOpacity(id, val);
  }
  removeImage(id: string): void {
    this.previousImageRects.delete(id);
    if (this.selectedImageId === id) {
      this.selectedImageId = null;
    }
    this.itemService.removeImageBox(id);
  }
  bringToFront(target: 'text' | 'image'): void {
    this.selectedLayer = target;
    if (target === 'text' && this.activeItem?.imageBoxes) {
      this.activeItem.imageBoxes.forEach(img => {
        if ((img.zIndex ?? 1) >= 10) {
          this.itemService.updateImageBox(img.id, { zIndex: 9 });
        }
      });
    } else if (target === 'image' && this.activeItem?.imageBoxes?.length) {
      const targetId = this.selectedImageId || this.activeItem.imageBoxes[this.activeItem.imageBoxes.length - 1].id;
      this.itemService.updateImageBox(targetId, { zIndex: 11 });
    }
  }
  private applyObjectSnapping(movingRect: BoxRect, excludeKey: string): { left: number; top: number } {
    const threshold = 1.2;
    const targetX: number[] = [];
    const targetY: number[] = [];
    const otherBoxes: BoxRect[] = [];
    if (excludeKey !== 'text' && this.hasTextContent) {
      const textRect = this.getTargetRect('text');
      if (textRect) otherBoxes.push(textRect);
    }
    for (const img of this.activeItem?.imageBoxes ?? []) {
      if (img.id !== excludeKey) {
        otherBoxes.push(img);
      }
    }
    for (const box of otherBoxes) {
      targetX.push(box.left, box.left + box.width / 2, box.left + box.width);
      targetY.push(box.top, box.top + box.height / 2, box.top + box.height);
    }
    let { left, top } = movingRect;
    const activeX: number[] = [];
    const activeY: number[] = [];
    const myXPoints = [
      { val: left, offset: 0 },
      { val: left + movingRect.width / 2, offset: movingRect.width / 2 },
      { val: left + movingRect.width, offset: movingRect.width }
    ];
    let bestDx = threshold;
    let snappedX: { newLeft: number; lineX: number } | null = null;
    for (const pt of myXPoints) {
      for (const tx of targetX) {
        const dist = Math.abs(pt.val - tx);
        if (dist < bestDx) {
          bestDx = dist;
          snappedX = { newLeft: tx - pt.offset, lineX: tx };
        }
      }
    }
    if (snappedX) {
      left = snappedX.newLeft;
      activeX.push(snappedX.lineX);
      for (const tx of targetX) {
        if (tx !== snappedX.lineX && (Math.abs(left - tx) < 0.15 || Math.abs(left + movingRect.width - tx) < 0.15)) {
          activeX.push(tx);
        }
      }
    }
    const myYPoints = [
      { val: top, offset: 0 },
      { val: top + movingRect.height / 2, offset: movingRect.height / 2 },
      { val: top + movingRect.height, offset: movingRect.height }
    ];
    let bestDy = threshold;
    let snappedY: { newTop: number; lineY: number } | null = null;
    for (const pt of myYPoints) {
      for (const ty of targetY) {
        const dist = Math.abs(pt.val - ty);
        if (dist < bestDy) {
          bestDy = dist;
          snappedY = { newTop: ty - pt.offset, lineY: ty };
        }
      }
    }
    if (snappedY) {
      top = snappedY.newTop;
      activeY.push(snappedY.lineY);
      for (const ty of targetY) {
        if (ty !== snappedY.lineY && (Math.abs(top - ty) < 0.15 || Math.abs(top + movingRect.height - ty) < 0.15)) {
          activeY.push(ty);
        }
      }
    }
    this.snapLinesX = activeX.slice(0, 2);
    this.snapLinesY = activeY.slice(0, 2);
    return { left, top };
  }

  fitBoxToText(): void {
    const containerEl = this.getContainerElement();
    const boxEl = this.messageBox?.nativeElement;
    if (!this.activeItem || !containerEl || !boxEl || !this.activeItem.textBox) return;
    const contentEl = boxEl.querySelector('.text-content') as HTMLElement | null;
    if (!contentEl) return;
    const clone = contentEl.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.visibility = 'hidden';
    clone.style.pointerEvents = 'none';
    clone.style.width = 'max-content';
    clone.style.maxWidth = '100%';
    clone.style.whiteSpace = 'normal';
    boxEl.appendChild(clone);
    const range = document.createRange();
    range.selectNodeContents(clone);
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
    let minLeft = Infinity;
    let maxRight = -Infinity;
    let minTop = Infinity;
    let maxBottom = -Infinity;

    for (const r of rects) {
      minLeft = Math.min(minLeft, r.left);
      maxRight = Math.max(maxRight, r.right);
      minTop = Math.min(minTop, r.top);
      maxBottom = Math.max(maxBottom, r.bottom);
    }

    // NEU: Auch alle enthaltenen Tabellen vermessen, falls eine Tabelle breiter als der Text ist!
    clone.querySelectorAll('table').forEach(tbl => {
      const tr = tbl.getBoundingClientRect();
      if (tr.width > 0 && tr.height > 0) {
        minLeft = Math.min(minLeft, tr.left);
        maxRight = Math.max(maxRight, tr.right);
        minTop = Math.min(minTop, tr.top);
        maxBottom = Math.max(maxBottom, tr.bottom);
      }
    });

    const firstBlock = (clone.querySelector('p, h1, h2, h3, h4, div') as HTMLElement) || clone;
    const textAlign = window.getComputedStyle(firstBlock).textAlign;
    boxEl.removeChild(clone);
    if (!isFinite(minLeft) || !isFinite(maxRight)) return;
    const container = containerEl.getBoundingClientRect();
    const measuredWidthPx = (maxRight - minLeft) + 16;
    const measuredHeightPx = (maxBottom - minTop) + 8;
    const newWidth = Math.max(5, Math.min(100, Math.round((measuredWidthPx / container.width) * 10000) / 100));
    const newHeight = Math.max(5, Math.min(100, Math.round((measuredHeightPx / container.height) * 10000) / 100));
    const oldBox = this.activeItem.textBox;
    let newLeft = oldBox.left;
    if (textAlign === 'center') {
      const centerX = oldBox.left + (oldBox.width / 2);
      newLeft = centerX - (newWidth / 2);
    } else if (textAlign === 'right' || textAlign === 'end') {
      const rightEdge = oldBox.left + oldBox.width;
      newLeft = rightEdge - newWidth;
    }
    newLeft = Math.max(0, Math.min(100 - newWidth, newLeft));
    const wasVerticallyCentered = Math.abs((oldBox.top + oldBox.height / 2) - 50) < 0.2;
    let newTop = wasVerticallyCentered ? (100 - newHeight) / 2 : oldBox.top;
    newTop = Math.max(0, Math.min(100 - newHeight, newTop));
    this.activeItem.textBox = {
      left: Math.round(newLeft * 100) / 100,
      top: Math.round(newTop * 100) / 100,
      width: newWidth,
      height: newHeight
    };
    this.saveBoxPositions();
  }
  shouldShowFrame(config: { showColor: boolean; showFile: boolean }): boolean {
    if (!this.activeItem) return true;
    const bg = (this.activeItem.hintergrund || '').trim();
    const isColor = bg.startsWith('#') || bg.startsWith('rgb') || bg.startsWith('hsl');
    if (config.showColor && isColor) {
      return false;
    }
    // Beim Bild-Array: Rahmen ausblenden, sobald mindestens ein Bild die Bühne vollständig abdeckt (0,0,100,100)
    if (config.showFile && this.activeItem.mediaType === 'image' && this.activeItem.imageBoxes?.length) {
      const hasFullCoverImage = this.activeItem.imageBoxes.some(
        b => b.left === 0 && b.top === 0 && b.width === 100 && b.height === 100
      );
      return !hasFullCoverImage;
    }
    if (config.showFile && bg.length > 0 && !isColor) {
      return false;
    }
    return true;
  }
}

