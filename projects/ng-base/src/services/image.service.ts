import { Injectable } from '@angular/core';
import { Helper } from '@lenne.tech/ng-base/shared';

/**
 * Image service
 */
@Injectable({
  providedIn: 'root',
})
export class ImageService {
  /**
   * Preaload images (for lazy handling)
   *
   * @param options
   * @protected
   */
  public preLoadImages(options?: {
    doneFunction?: () => Promise<any> | any | void;
    elements?:
      | Element
      | Element[]
      | HTMLCollectionOf<Element>
      | Node
      | NodeList
      | Document
      | HTMLElement
      | HTMLElement[];
    regExp?: RegExp;
  }): Promise<any> {
    // Init configuration
    const config = {
      doneFunnction: undefined,
      elements: document,
      regExp: undefined,
      ...options,
    };

    return new Promise((resolve) => {
      // Convert element(s) into array
      if (!Array.isArray(config.elements)) {
        // NodeList or HTMLCollection
        if (Helper.isNodeList(config.elements)) {
          config.elements = Array.from(config.elements as HTMLCollection | NodeList) as Element[];
        }

        // Single element
        else {
          config.elements = [config.elements] as Element[];
        }
      }

      // Init loading
      const promises = [];

      // Get all images
      let images: HTMLImageElement[] = [];
      config.elements.forEach((element) => {
        images = images.concat(Array.from(element.getElementsByTagName('img')));
      });

      // Prepare images
      for (let image of images) {
        const src = image.getAttribute('src');

        // Check if changes are necessary and possible
        if (
          (image.complete && image.naturalHeight !== 0) || // already laoded
          !src || // Image has no src
          config.regExp?.test(src) // Test if src matches regular expression
        ) {
          continue;
        }

        // Replace lazy loading image with immediately loading image
        if (image.getAttribute('loading') === 'lazy') {
          const newImage = document.createElement('img');
          Array.from(image.attributes).forEach((attr) => {
            if (attr.name !== 'loading' && attr.name !== 'src') {
              newImage.setAttribute(attr.name, attr.value);
            }
          });
          image.replaceWith(newImage);
          image = newImage;
        }

        // Wait for laoding
        promises.push(this.loadImage(image, src));
      }

      // Wait until all images loaded
      Promise.all(promises)
        .catch((e) => console.error('Error during image loading', e))
        .finally(async () => {
          // Return result
          let result;
          if (config.doneFunnction) {
            result = await config.doneFunction();
          }
          resolve(result);
        });
    });
  }

  /**
   * Load image for image element
   *
   * @param imageElement
   * @param src
   * @protected
   */
  public async loadImage(imageElement: HTMLImageElement, src?: string) {
    src = src || imageElement.src;
    return new Promise((resolve, reject) => {
      imageElement.onload = () => resolve(imageElement);
      imageElement.onerror = reject;
      imageElement.src = src;
    });
  }
}
