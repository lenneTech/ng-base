import { Directive, ElementRef, Input, OnInit, Output } from '@angular/core';

/**
 * Directive vor context menu
 * See https://stackblitz.com/edit/angular-custom-context-menu
 */
@Directive({
  selector: '[ltContextMenu]',
  exportAs: 'contextMenuData',
  standalone: true,
})
export class ContextMenuDirective implements OnInit {
  @Input() contextMenuData?: any;
  @Input() ltContextMenu: HTMLElement;
  @Input() xGap = 0;
  @Input() yGap = 0;
  @Input() overflowSpace = 10;
  @Input() selectors = '*';
  @Output() clickedElement: Element = null;
  previousDisplayStatus: string = null;

  constructor(private el: ElementRef) {}

  ngOnInit() {
    if (this.ltContextMenu) {
      this.previousDisplayStatus = this.ltContextMenu.style.display;
    }

    // Add a click listener to the window,
    // so that we can close the context menu on left click
    window.addEventListener('click', () => {
      this.showContextMenu(null, false);
    });

    // Close context menu when escape is pressed
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        this.showContextMenu(null, false);
      }
    });

    // Add an event listener to listen to the 'contextmenu' event
    this.el.nativeElement.addEventListener('contextmenu', (e) => {
      // Prevent the default context menu to popup
      if (e.preventDefault) {
        e.preventDefault();
      }
      // Shows our own context menu
      this.showContextMenu(e, true);
    });
  }

  // Shows or hides our custom context menu, which is specified as a input
  showContextMenu(event, show: boolean) {
    const cm = this.ltContextMenu;
    if (cm) {
      // Try to open context menu
      if (show && event && event instanceof MouseEvent) {
        // Get valid clicked structureElement
        const clickedElement = (event?.target as HTMLElement)?.closest(this.selectors);
        if (clickedElement) {
          this.clickedElement = clickedElement;

          setTimeout(() => {
            // Set display status
            cm.style.display = 'block';

            // Calculate top position
            let top = event.y + this.yGap;
            if (top + cm.offsetHeight + 10 > document.documentElement.clientHeight) {
              top = document.documentElement.clientHeight - cm.offsetHeight - this.overflowSpace;
            }

            // Calculate left position
            let left = event.x + this.xGap;
            if (left + cm.offsetWidth + 10 > document.documentElement.clientWidth) {
              left = document.documentElement.clientWidth - cm.offsetWidth - this.overflowSpace;
            }

            // Set position
            cm.style.top = top + 'px';
            cm.style.left = left + 'px';

            // Show
            cm.style.opacity = '1.0';
            cm.style['pointer-events'] = 'auto';
          }, 1);

          return;
        }
      }

      // Close context menu
      this.clickedElement = null;
      if (this.previousDisplayStatus) {
        cm.style.display = this.previousDisplayStatus;
      }
      cm.style.opacity = '0.01';
      cm.style['pointer-events'] = 'none';
    }
  }
}
