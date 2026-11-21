import { Node as ProseMirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { NodeView, ViewMutationRecord } from 'prosemirror-view';
import { updateColumnsOnResize } from 'prosemirror-tables';

export class ResizableTableView implements NodeView {
    dom: HTMLElement;
    contentDOM: HTMLElement;
    table: HTMLTableElement;
    private colgroup: HTMLTableColElement; //HTMLElement; // <-- NEU
    private node: ProseMirrorNode;
    private view: any;
    private getPos: () => number | undefined;
    private isInteracting = false;

    constructor(
        node: ProseMirrorNode,
        view: any, getPos: () => number | undefined,
        private onChange?: () => void
    ) {
        this.node = node;
        this.view = view;
        this.getPos = getPos;

        this.dom = document.createElement('div');
        this.dom.className = 'editor-table-box';

        const toolbar = document.createElement('div');
        toolbar.className = 'table-box-actions';
        toolbar.contentEditable = 'false';
        toolbar.innerHTML = `
      <span class="table-drag-handle" title="Tabelle verschieben">✥</span>
      <button type="button" data-align="left" title="Links ausrichten">◧</button>
      <button type="button" data-align="center" title="Zentrieren">◫</button>
      <button type="button" data-align="right" title="Rechts ausrichten">◨</button>
      <button type="button" data-reset="1" title="Volle Breite">⛶</button>
    `;

        // 1. Stufenloses horizontales Ziehen + flüssiges vertikales Verschieben (ohne Cursor-Sprung)
        const dragHandle = toolbar.querySelector('.table-drag-handle') as HTMLElement;
        dragHandle.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            window.getSelection()?.removeAllRanges();
            this.isInteracting = true;

            // Mauszeiger während des gesamten Ziehens auf "Greifhand" halten
            document.body.style.cursor = 'move';
            document.body.style.userSelect = 'none';

            const parentEl = this.dom.parentElement!;
            const parentRect = parentEl.getBoundingClientRect();
            const boxRect = this.dom.getBoundingClientRect();
            // Exakten Zoom-Faktor ermitteln (z. B. 0.72 durch preview-scaled)
            const zoomScale = parentEl.offsetWidth > 0 ? parentRect.width / parentEl.offsetWidth : 1;

            const startX = e.clientX;
            const startY = e.clientY;
            const startOffsetVisual = boxRect.left - parentRect.left;
            const maxOffsetVisual = Math.max(0, parentRect.width - boxRect.width);
            const startPos = this.getPos();

            const onMove = (moveEvent: MouseEvent) => {
                // A) Horizontal stufenlos verschieben
                const dx = moveEvent.clientX - startX;
                const clampedVisual = Math.max(0, Math.min(maxOffsetVisual, startOffsetVisual + dx));
                const marginPct = parentRect.width > 0
                    ? Math.round((clampedVisual / parentRect.width) * 100)
                    : 0;
                this.dom.style.marginLeft = `${marginPct}%`;

                // B) Visuelles vertikales Mitführen während des Ziehens
                const dy = (moveEvent.clientY - startY) / zoomScale;
                this.dom.style.transform = `translateY(${dy}px)`;
                this.dom.style.zIndex = '50';
            };

            const onUp = (upEvent: MouseEvent) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                this.isInteracting = false;

                // Mauszeiger wieder freigeben
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                const finalMarginPct = this.dom.style.marginLeft || '0%';
                this.dom.style.transform = '';
                this.dom.style.zIndex = '';

                // startY mit übergeben, damit wir die genaue Zieh-Strecke nach unten kennen
                this.dropTableAtY(startPos, startY, upEvent.clientY, finalMarginPct);

                const posAfter = this.getPos();
                if (typeof posAfter === 'number') {
                    const tr = this.view.state.tr.setSelection(
                        TextSelection.near(this.view.state.doc.resolve(posAfter + 3))
                    );
                    this.view.dispatch(tr);
                }
                this.view.focus();
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        // 2. Schnell-Buttons für Links / Mitte / Rechts / 100%
        toolbar.addEventListener('mousedown', (e) => {
            const target = (e.target as HTMLElement).closest('button') as HTMLElement | null;
            if (!target) return;
            e.preventDefault();
            e.stopPropagation();

            const align = target.dataset['align'];
            const reset = target.dataset['reset'];
            const widthNum = parseFloat(this.node.attrs['width']) || 100;

            if (align === 'left') {
                this.updateAttrs({ marginLeft: '0%' });
            } else if (align === 'center') {
                const centerPct = Math.max(0, Math.round((100 - widthNum) / 2));
                this.updateAttrs({ marginLeft: `${centerPct}%` });
            } else if (align === 'right') {
                const rightPct = Math.max(0, Math.round(100 - widthNum));
                this.updateAttrs({ marginLeft: `${rightPct}%` });
            } else if (reset) {
                this.updateAttrs({ width: '100%', height: null, marginLeft: '0%' });
            }
        });

        this.table = document.createElement('table');
        this.colgroup = document.createElement('colgroup'); // <-- NEU
        this.table.appendChild(this.colgroup);               // <-- NEU
        const tbody = document.createElement('tbody');
        this.table.appendChild(tbody);
        this.contentDOM = tbody;

        const handleE = this.createHandle('e');
        const handleS = this.createHandle('s');
        const handleSE = this.createHandle('se');

        this.dom.append(toolbar, this.table, handleE, handleS, handleSE);
        updateColumnsOnResize(node, this.colgroup, this.table, 40); // <-- NEU
        this.applyStyles(node);
    }

    private dropTableAtY(pos: number | undefined, startY: number, clientY: number, marginLeft: string): void {
        if (typeof pos !== 'number') return;

        const { state, dispatch } = this.view;
        const paragraphType = state.schema.nodes['paragraph'];
        const updatedNode = this.node.type.create(
            { ...this.node.attrs, marginLeft },
            this.node.content,
            this.node.marks
        );

        const dy = clientY - startY;
        const parentRect = this.dom.parentElement?.getBoundingClientRect();
        const probeX = parentRect ? parentRect.left + 10 : 10;
        const coords = this.view.posAtCoords({ left: probeX, top: clientY });

        // 1. Fall: Es wurde nach unten über das Ende des Dokuments hinaus gezogen (kein Block unterhalb vorhanden)
        const isAtBottom = pos + this.node.nodeSize >= state.doc.content.size - 4;
        if (dy > 25 && (!coords || isAtBottom) && paragraphType) {
            // Ungefähre Zeilenhöhe im gezoomten Editor (ca. 38px) -> Anzahl Leerzeilen berechnen
            const linesToAdd = Math.max(1, Math.round(dy / 38));
            const emptyParagraphs = Array.from({ length: linesToAdd }, () => paragraphType.create());

            const tr = state.tr.updateAttrs
                ? state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, marginLeft })
                : state.tr.replaceWith(pos, pos + this.node.nodeSize, updatedNode);

            // Leere <p>-Absätze direkt VOR der Tabelle einfügen
            tr.insert(pos, emptyParagraphs);
            const newTablePos = pos + emptyParagraphs.reduce((sum, p) => sum + p.nodeSize, 0);
            tr.setSelection(TextSelection.near(tr.doc.resolve(newTablePos + 3)));
            dispatch(tr.scrollIntoView());
            return;
        }

        if (!coords) {
            this.updateAttrs({ marginLeft });
            return;
        }

        const $target = state.doc.resolve(coords.pos);
        const targetBlockPos = $target.depth >= 1 ? $target.before(1) : coords.pos;

        // 2. Fall: Tabelle bleibt vertikal an derselben Stelle -> nur marginLeft speichern
        if (targetBlockPos >= pos && targetBlockPos <= pos + this.node.nodeSize) {
            this.updateAttrs({ marginLeft });
            return;
        }

        // 3. Fall: Tabelle zwischen bestehende Absätze nach oben oder unten verschieben
        const tr = state.tr;
        if (targetBlockPos < pos) {
            tr.delete(pos, pos + this.node.nodeSize);
            tr.insert(targetBlockPos, updatedNode);
            tr.setSelection(TextSelection.near(tr.doc.resolve(targetBlockPos + 3)));
        } else {
            const targetNode = state.doc.nodeAt(targetBlockPos);
            const insertAfter = targetBlockPos + (targetNode ? targetNode.nodeSize : 0);
            tr.insert(insertAfter, updatedNode);
            tr.delete(pos, pos + this.node.nodeSize);
            const finalPos = insertAfter - this.node.nodeSize;
            tr.setSelection(TextSelection.near(tr.doc.resolve(finalPos + 3)));
        }

        dispatch(tr.scrollIntoView());
        this.onChange?.();
    }

    stopEvent(event: Event): boolean {
        if (this.isInteracting) return true;
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        return !!target.closest('.table-resize-handle, .table-box-actions');
    }

    ignoreMutation(mutation: ViewMutationRecord): boolean {
        if (this.isInteracting) return true;
        return !this.contentDOM.contains(mutation.target);
    }

    private createHandle(dir: 'e' | 's' | 'se'): HTMLElement {
        const handle = document.createElement('span');
        handle.className = `table-resize-handle ${dir}`;
        handle.contentEditable = 'false';

        handle.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            window.getSelection()?.removeAllRanges();
            this.isInteracting = true;

            // Passenden Resize-Cursor global auf dem Body sperren -> kein Wechsel zur Einfügemarke!
            const cursorMap = { e: 'ew-resize', s: 'ns-resize', se: 'nwse-resize' };
            document.body.style.cursor = cursorMap[dir];
            document.body.style.userSelect = 'none';

            const parentEl = this.dom.parentElement!;
            const parentRect = parentEl.getBoundingClientRect();
            const boxRect = this.dom.getBoundingClientRect();
            const tableRect = this.table.getBoundingClientRect();

            // Zoom-Faktor ermitteln (durch preview-scaled)
            const zoomScale = parentEl.offsetWidth > 0 ? parentRect.width / parentEl.offsetWidth : 1;

            const startX = e.clientX;
            const startY = e.clientY;
            const startW = boxRect.width;
            const startH = tableRect.height;
            const marginLeftVisual = boxRect.left - parentRect.left;
            const maxW = Math.max(80, parentRect.width - marginLeftVisual);
            const ratio = startW / Math.max(startH, 1);

            const onMove = (moveEvent: MouseEvent) => {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;

                if (dir === 'e') {
                    const newW = Math.max(80, Math.min(maxW, startW + dx));
                    this.dom.style.width = `${Math.round((newW / parentRect.width) * 100)}%`;
                } else if (dir === 's') {
                    // Durch zoomScale teilen, damit Höhe 1:1 an der Mausspitze klebt
                    const newH = Math.max(40, (startH + dy) / zoomScale);
                    this.table.style.height = `${Math.round(newH)}px`;
                } else if (dir === 'se') {
                    // Diagonales Ziehen mit festem Seitenverhältnis & zoomScale-Korrektur
                    const newW = Math.max(80, Math.min(maxW, startW + dx));
                    const newH = (newW / ratio) / zoomScale;
                    this.dom.style.width = `${Math.round((newW / parentRect.width) * 100)}%`;
                    this.table.style.height = `${Math.round(newH)}px`;
                }
            };

            const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                this.isInteracting = false;

                // Cursor & Auswahl auf dem Body wieder freigeben
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                this.updateAttrs({
                    width: this.dom.style.width || '100%',
                    height: this.table.style.height || null
                });
            };

            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });

        return handle;
    }

    private updateAttrs(patch: Record<string, any>): void {
        const pos = this.getPos();
        if (typeof pos !== 'number') return;
        const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
            ...this.node.attrs,
            ...patch
        });
        this.view.dispatch(tr);
        this.onChange?.();
    }

    private applyStyles(node: ProseMirrorNode): void {
        const { width, height, marginLeft, borderMode, borderStyle, borderWidth, borderColor } = node.attrs;

        this.dom.style.width = width || '100%';
        this.dom.style.marginLeft = marginLeft || '0%';
        this.dom.style.marginRight = '0';
        this.table.style.width = '100%';
        this.table.style.height = height || '';

        const mode = borderMode || 'all';
        this.table.setAttribute('data-border-mode', mode);
        this.table.style.setProperty('--tbl-border-style', borderStyle || 'solid');
        this.table.style.setProperty('--tbl-border-width', borderWidth || '2px');
        this.table.style.setProperty('--tbl-border-color', borderColor || 'currentColor');
    }

    update(node: ProseMirrorNode): boolean {
        if (node.type !== this.node.type) return false;
        this.node = node;
        updateColumnsOnResize(node, this.colgroup, this.table, 40); // <-- NEU
        this.applyStyles(node);
        return true;
    }
}
