import { Inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BASE_MODULE_CONFIG, BaseModuleConfig } from '../interfaces/base-module-config.interface';
import { ImageService } from './image.service';

/**
 * Scroll service for autoscroll to specific fragments
 */
@Injectable({
  providedIn: 'root',
})
export class ScrollService {
  /**
   * Current scroll promise
   *
   * @protected
   */
  protected scrollPromise: Promise<void>;

  /**
   * Resolve function of current scroll promise
   *
   * @protected
   */
  protected scrollPromiseResolve: (value: void | PromiseLike<void>) => void;

  /**
   * Is a scroll listener set
   *
   * @protected
   */
  protected scrollListener = false;

  /**
   * Current scroll timer;
   *
   * @protected
   */
  protected scrollTimer = -1;

  /**
   * Scroll offset
   */
  protected readonly scrollOffset: number;

  /**
   * Detection offset
   * Should be >= scrollOffset
   */
  protected readonly detectionOffset: number;

  /**
   * Sampling rate for scroll done detection
   */
  protected readonly scrollSamplingRate: number;

  /**
   * Initializer
   */
  constructor(
    protected router: Router,
    @Inject(BASE_MODULE_CONFIG) protected moduleConfig: BaseModuleConfig,
    protected imageService: ImageService
  ) {
    const config = {
      scrollDetectionOffset: 200,
      scrollOffset: 100,
      scrollSamplingRate: 100,
      ...moduleConfig,
    };

    this.detectionOffset = config.scrollDetectionOffset;
    this.scrollOffset = config.scrollOffset;
    this.scrollSamplingRate = config.scrollSamplingRate;
  }

  /**
   * Scroll to structureElement with specific ID
   */
  async scrollTo(
    id: string,
    options: {
      checkUrl?: boolean;
      loadImagesBefore?: boolean;
      resetStyles?: boolean;
      setOverflow?: boolean;
      stopPropagation?: boolean;
    } = {}
  ) {
    // Prepare config
    const config = {
      checkUrl: true,
      loadImagesBefore: true,
      resetStyles: false,
      setOverflow: true,
      stopPropagation: true,
      ...options,
    };

    // Check current URL
    if (config.checkUrl && this.router.url !== '/' && !this.router.url.startsWith('/#')) {
      await this.router.navigate(['/'], { fragment: id });
      return !config.stopPropagation;
    }

    // Check if target element exits
    const el = document.getElementById(id);
    if (!el) {
      console.error('Missing scroll element with ID:', id);
      return !config.stopPropagation;
    }

    // Check if body overflow is visible
    // This is necessary for scroll handling
    const body = document.querySelector('body');
    let undoOverflowChanges = false;
    const scrollBodyStyles = JSON.parse(JSON.stringify(window.getComputedStyle(body)));
    if (config.setOverflow && (scrollBodyStyles.overflowX !== 'visible' || scrollBodyStyles.overflowY !== 'visible')) {
      // Set body overflow to visible
      console.warn('Style of body element for overflowX and overflowY will be set to "visible" for scrolling!');
      body.style.overflowX = 'visible';
      body.style.overflowY = 'visible';
      undoOverflowChanges = true;
    }

    // Load images before scrolling (once)
    if (config.loadImagesBefore) {
      await this.imageService.preLoadImages();
    }

    // Get get bounding rect of target element
    const cords = el.getBoundingClientRect();

    // Scroll to element
    window.scrollBy({ top: cords.top - this.scrollOffset, behavior: 'smooth' });
    await this.scrollDone({
      doneFunction: () => {
        // Undo changes
        if (undoOverflowChanges && config.resetStyles) {
          body.style.overflowX = scrollBodyStyles.overflowX;
          body.style.overflowY = scrollBodyStyles.overflowY;
          console.warn('Original style of body element for overflowX and overflowY is set.');
        }
      },
    });

    // Return stop propagation configuration
    return !config.stopPropagation;
  }

  /**
   * Get last active structureElement
   */
  getLastActiveElement(list?): string {
    const currentScrollPosition = window.scrollY;
    const elementsWithId = document.querySelectorAll('[id]');
    let lastId = null;
    let lastPosition = 0 - this.detectionOffset - 1;
    elementsWithId.forEach((element) => {
      const cords = element.getBoundingClientRect();
      const top = cords.top + window.pageYOffset - this.detectionOffset;
      if (
        (!list || !list.length || list.includes(element.id)) && // In list
        top < currentScrollPosition && // In active area
        lastPosition < top // Higher than the last one
      ) {
        lastId = element.id;
        lastPosition = top;
      }
    });
    return lastId;
  }

  /**
   * Check if ID is active
   */
  isActive(id, list?, isFirst?) {
    const lastActiveElement = this.getLastActiveElement(list);
    return id === lastActiveElement || (lastActiveElement === null && isFirst);
  }

  /**
   * Scroll done promise
   */
  public async scrollDone(options: { doneFunction?: () => any | void } = {}): Promise<any> {
    // Init configuration
    const config = {
      doneFunction: undefined,
      ...options,
    };

    // Wait for scroll done
    await this.scrollDoneDetection();

    // Get result
    if (config.doneFunction) {
      return config.doneFunction();
    }
  }

  /**
   * Scroll done detecton
   *
   * @protected
   */
  protected scrollDoneDetection(): Promise<void> {
    // Return current scroll promise (Singelton)
    if (this.scrollPromise) {
      return this.scrollPromise;
    }

    // Create current scroll promise
    this.scrollPromise = new Promise((resolve) => {
      this.scrollPromiseResolve = resolve;
      if (this.scrollTimer !== -1) {
        window.clearTimeout(this.scrollTimer);
      }
      this.scrollTimer = window.setTimeout(() => {
        window.removeEventListener('scroll', this.scrollDoneDetection.bind(this));
        this.scrollPromise = undefined;
        resolve();
      }, this.scrollSamplingRate);
    });

    // Lisitening to scroll event;
    window.addEventListener('scroll', this.scrollDoneDetection.bind(this));

    // Return promise
    return this.scrollPromise;
  }
}
