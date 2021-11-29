import { AfterViewChecked, Directive, ElementRef, HostListener, Input, NgZone } from '@angular/core';
import { ImageService } from '../services/image.service';

/**
 * Set same height (maximum) to different elements
 */
@Directive({
  selector: '[ltMatchHeight]',
})
export class MatchHeightDirective implements AfterViewChecked {
  // class name to match height
  @Input()
  ltMatchHeight: string | string[];

  @Input()
  loadLazyImages = true;

  constructor(protected el: ElementRef, protected imageService: ImageService, private zone: NgZone) {}

  @HostListener('window:resize')
  onResize() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  ngAfterViewChecked() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  matchHeight(parent: HTMLElement, target: string | string[]) {
    // Timeout is set to force Angular to wait for all actions and only continue once the process has run through.
    // Otherwise, an infinite loop will occur.
    setTimeout(async () => {
      if (!parent) {
        return;
      }

      let classNames;
      if (!Array.isArray(target)) {
        classNames = [target];
      } else {
        classNames = target;
      }

      for (const className of classNames) {
        // find all child structureElements with the selected class name
        const children = parent.getElementsByClassName(className);

        if (!children || children.length < 2) {
          continue;
        }

        // Load images of children
        if (this.loadLazyImages) {
          await this.imageService.preLoadImages({ elements: children });
        }

        // reset all children height
        Array.from(children).forEach((element: HTMLElement) => {
          element.style.height = 'initial';
        });

        // get all the child structureElements heights
        const itemHeights = Array.from(children).map((x) => x.getBoundingClientRect().height);

        // find out the tallest one
        const maxHeight = itemHeights.reduce((prev, curr) => (curr > prev ? curr : prev), 0);

        // update the child structureElements height to the tallest one
        Array.from(children).forEach((element: HTMLElement) => (element.style.height = `${maxHeight}px`));
      }
    }, 1);
  }
}
