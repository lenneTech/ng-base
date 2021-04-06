import { Directive, ElementRef, Input, OnInit } from '@angular/core';

/**
 * Reszise detection
 * (inpsired by: https://stackblitz.com/edit/angular-resizable)
 */
@Directive({
  selector: '[ltResizable]',
})
export class ResizableDirective implements OnInit {
  @Input() resizableGrabWidth = 8;
  @Input() resizableMinWidth = 10;

  dragging = false;

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    this.addListenerToDocument();
    this.addListenerToElement();
  }

  mouseMoveG(evt) {
    if (!this.dragging) {
      return;
    }
    this.newWidth(evt.clientX - this.el.nativeElement.offsetLeft);
    evt.stopPropagation();
  }

  newWidth(wid) {
    const result = Math.max(this.resizableMinWidth, wid);
    this.el.nativeElement.style.width = result + 'px';
  }

  mouseDown(evt) {
    if (this.inDragRegion(evt)) {
      this.dragging = true;
      this.preventGlobalMouseEvents();
      evt.stopPropagation();
    }
  }

  restoreGlobalMouseEvents() {
    document.body.style['pointer-events'] = 'auto';
  }

  mouseUpG(evt: Event) {
    if (!this.dragging) {
      return;
    }
    this.restoreGlobalMouseEvents();
    this.dragging = false;
    evt.stopPropagation();
  }

  mouseMove(evt) {
    if (this.inDragRegion(evt) || this.dragging) {
      this.el.nativeElement.style.cursor = 'col-resize';
    } else {
      this.el.nativeElement.style.cursor = 'default';
    }
  }

  preventGlobalMouseEvents() {
    document.body.style['pointer-events'] = 'none';
  }

  inDragRegion(evt) {
    return this.el.nativeElement.clientWidth - evt.clientX + this.el.nativeElement.offsetLeft < this.resizableGrabWidth;
  }

  private addListenerToDocument() {
    document.addEventListener(
      'mousemove',
      (e) => {
        this.mouseMoveG(e);
      },
      true
    );

    document.addEventListener(
      'mouseup',
      (e) => {
        this.mouseUpG(e);
      },
      true
    );
  }

  private addListenerToElement() {
    this.el.nativeElement.addEventListener(
      'mousedown',
      (e) => {
        this.mouseDown(e);
      },
      true
    );

    this.el.nativeElement.addEventListener(
      'mousemove',
      (e) => {
        this.mouseMove(e);
      },
      true
    );
  }
}
