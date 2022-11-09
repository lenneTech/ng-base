/**
 * Inspired by Inpspired by https://github.com/jaydenseric/extract-files/releases/tag/v11.0.0
 */

/**
 * Reactive native file
 */
class ReactNativeFile {
  constructor(public uri: string, public name: string, public type: string) {}
}

/**
 * Check whether value is an extractable file
 */
function isExtractableFile(value) {
  return (
    (typeof File !== 'undefined' && value instanceof File) ||
    (typeof Blob !== 'undefined' && value instanceof Blob) ||
    value instanceof ReactNativeFile
  );
}

/**
 * Clones a value, recursively extracting
 */
export default function extractFiles(value, path = '', isExtractableFileFunc = isExtractableFile) {
  // Map of extracted files and their object paths within the input value.
  const files = new Map();

  // Map of arrays and objects recursed within the input value and their clones,
  // for reusing clones of values that are referenced multiple times within the
  // input value.
  const clones = new Map();

  /**
   * Recursively clones the value, extracting files.
   */
  function recurse(recurseValue, recursePath, recursed) {
    let clone = recurseValue;

    if (isExtractableFileFunc(recurseValue)) {
      clone = null;

      const filePaths = files.get(recurseValue);

      filePaths ? filePaths.push(recursePath) : files.set(recurseValue, [recursePath]);
    } else {
      const isList =
        Array.isArray(recurseValue) || (typeof FileList !== 'undefined' && recurseValue instanceof FileList);
      const isObject = recurseValue && recurseValue.constructor === Object;

      if (isList || isObject) {
        const hasClone = clones.has(recurseValue);

        if (hasClone) {
          clone = clones.get(recurseValue);
        } else {
          clone = isList ? [] : {};

          clones.set(recurseValue, clone);
        }

        if (!recursed.has(recurseValue)) {
          const pathPrefix = recursePath ? `${recursePath}.` : '';
          const recursedDeeper = new Set(recursed).add(recurseValue);

          if (isList) {
            let index = 0;

            for (const item of recurseValue as any) {
              const itemClone = recurse(item, pathPrefix + index++, recursedDeeper);

              if (!hasClone) {
                clone.push(itemClone);
              }
            }
          } else {
            for (const key of Object.keys(recurseValue)) {
              const propertyClone = recurse(recurseValue[key], pathPrefix + key, recursedDeeper);

              if (!hasClone) {
                clone[key] = propertyClone;
              }
            }
          }
        }
      }
    }

    return clone;
  }

  return {
    clone: recurse(value, path, new Set()),
    files,
  };
}
