import { AfterViewInit, Directive, ElementRef, HostListener, Inject, Input, PLATFORM_ID } from '@angular/core';
import { ImageService } from '@lenne.tech/ng-base/shared';
import { isPlatformBrowser } from '@angular/common';

/**
 * Set same height (maximum) to different elements
 */
@Directive({
  selector: '[ltMatchHeight]',
})
export class MatchHeightDirective implements AfterViewInit {
  // class name to match height
  @Input()
  ltMatchHeight: string | string[];

  // Replace lazy loading images with immediate loading images
  @Input()
  loadImages = true;

  // Wether current platform is a browser
  readonly isBrowser: boolean;

  constructor(protected el: ElementRef, protected imageService: ImageService, @Inject(PLATFORM_ID) platformId: string) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  @HostListener('window:resize')
  onResize() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  ngAfterViewInit() {
    this.matchHeight(this.el.nativeElement, this.ltMatchHeight);
  }

  async matchHeight(parent: HTMLElement, target: string | string[]) {
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
      if (this.loadImages) {
        await this.imageService.preLoadImages({ elements: children });
      }

      // reset all children height
      Array.from(children).forEach((element: HTMLElement) => {
        element.style.height = 'initial';
      });

      // get all the child structureElements heights
      const itemHeights = Array.from(children).map((element) => {
        if (element.getBoundingClientRect) {
          return element.getBoundingClientRect().height;
        }
        return 0;
      });

      // find out the tallest one
      const maxHeight = itemHeights.reduce((prev, curr) => (curr > prev ? curr : prev), 0);

      // update the child structureElements height to the tallest one
      Array.from(children).forEach((element: HTMLElement) => (element.style.height = `${maxHeight}px`));
    }
  }
}
