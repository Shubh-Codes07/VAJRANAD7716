import html2canvas from 'html2canvas';

// Helper to convert oklch colors using the browser's native canvas rendering engine
function colorToRgb(colorStr: string): string {
  if (!colorStr) return colorStr;
  if (!colorStr.includes('oklch') && !colorStr.includes('lch')) {
    return colorStr;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return colorStr;
    ctx.fillStyle = colorStr;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  } catch (e) {
    return colorStr;
  }
}

const nativeGetComputedStyle = window.getComputedStyle;

// Proxied getComputedStyle to intercept oklch/lch colors and return rgba fallback
const createPatchedGetComputedStyle = (originalGetComputedStyle: typeof window.getComputedStyle) => {
  return function (this: any, elt: Element, pseudoElt?: string | null): CSSStyleDeclaration {
    let style: CSSStyleDeclaration;
    try {
      // Try invoking with current context (ideal for standard lookups)
      style = originalGetComputedStyle.call(this, elt, pseudoElt);
    } catch (e) {
      try {
        // Fallback: invoke with elements' actual defaultView/window
        const win = elt.ownerDocument?.defaultView || window;
        style = originalGetComputedStyle.call(win, elt, pseudoElt);
      } catch (e2) {
        // Ultimate fallback: call the main window's native getComputedStyle bound to the main window
        style = nativeGetComputedStyle.call(window, elt, pseudoElt);
      }
    }

    return new Proxy(style, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (typeof val === 'string' && (val.includes('oklch') || val.includes('lch'))) {
          return colorToRgb(val);
        }
        if (typeof val === 'function' && prop === 'getPropertyValue') {
          return function(propertyName: string) {
            const originalValue = target.getPropertyValue(propertyName);
            if (typeof originalValue === 'string' && (originalValue.includes('oklch') || originalValue.includes('lch'))) {
              return colorToRgb(originalValue);
            }
            return originalValue;
          };
        }
        return val;
      }
    }) as any as CSSStyleDeclaration;
  };
};

export default async function html2canvasSafe(
  element: HTMLElement,
  options: any = {}
): Promise<HTMLCanvasElement> {
  const originalGetComputedStyle = window.getComputedStyle;
  const patchedGetComputedStyle = createPatchedGetComputedStyle(originalGetComputedStyle);

  // Patch the main window
  window.getComputedStyle = patchedGetComputedStyle;

  // Intercept the onclone callback to also patch the iframe/cloned document's window
  const originalOnClone = options.onclone;
  options.onclone = async (clonedDoc: Document, clonedElt: HTMLElement) => {
    if (clonedDoc.defaultView) {
      clonedDoc.defaultView.getComputedStyle = createPatchedGetComputedStyle(
        clonedDoc.defaultView.getComputedStyle || originalGetComputedStyle
      );
    }
    if (originalOnClone) {
      await originalOnClone(clonedDoc, clonedElt);
    }
  };

  try {
    const canvas = await html2canvas(element, options);
    return canvas;
  } finally {
    // Restore the original getComputedStyle
    window.getComputedStyle = originalGetComputedStyle;
  }
}
