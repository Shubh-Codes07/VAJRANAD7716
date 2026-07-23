import html2canvas from 'html2canvas';

// Helper to detect if a CSS string contains modern color functions unsupported by html2canvas
function hasUnsupportedColor(str: string): boolean {
  if (!str) return false;
  return str.includes('oklch') || 
         str.includes('oklab') || 
         str.includes('lch') || 
         str.includes('lab') || 
         str.includes('color(');
}

// Helper to convert oklch/oklab/etc colors using the browser's native canvas rendering engine.
// This uses a regex to find and convert colors even if they are embedded inside complex
// properties like "linear-gradient(...)".
function colorToRgb(colorStr: string): string {
  if (!colorStr) return colorStr;
  if (!hasUnsupportedColor(colorStr)) {
    return colorStr;
  }

  // Regex matches oklch(), oklab(), lch(), lab(), color() and allows up to 1 level of nested parens (e.g. calc())
  const colorFuncRegex = /(?:oklch|oklab|lch|lab|color)\((?:[^)(]+|\([^)(]*\))*\)/gi;
  
  const convertedStr = colorStr.replace(colorFuncRegex, (match) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return match;
      
      ctx.fillStyle = match;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      
      const rgbStr = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      console.log(`[colorToRgb] Converted "${match}" -> "${rgbStr}"`);
      return rgbStr;
    } catch (e) {
      console.error(`[colorToRgb] Failed to convert "${match}"`, e);
      return match;
    }
  });

  // Only log if the string actually changed (to avoid spamming logs for unmodified complex strings)
  if (convertedStr !== colorStr) {
    console.log(`[colorToRgb] Full property conversion:\n  From: ${colorStr}\n  To:   ${convertedStr}`);
  }
  
  return convertedStr;
}

// FIX: bind to window immediately — extracting a native method without .bind()
// creates a detached function that throws "TypeError: Illegal invocation" when
// html2canvas calls it from any context other than the main window.
const nativeGetComputedStyle = window.getComputedStyle.bind(window);

// Proxied getComputedStyle that intercepts oklch/lch colors and returns rgba fallbacks.
// Accepts an ALREADY-BOUND version of getComputedStyle — never a raw detached reference.
const createPatchedGetComputedStyle = (
  boundGetComputedStyle: (elt: Element, pseudoElt?: string | null) => CSSStyleDeclaration
) => {
  return function (this: any, elt: Element, pseudoElt?: string | null): CSSStyleDeclaration {
    let style: CSSStyleDeclaration;
    try {
      // Call the pre-bound function directly — .call(this,...) is intentionally removed
      // because the function is already bound to its owning window; using a different
      // `this` here was causing the "Illegal invocation" error.
      style = boundGetComputedStyle(elt, pseudoElt ?? null);
    } catch (e) {
      try {
        // Fallback: re-bind to the element's actual window and retry
        const win = elt.ownerDocument?.defaultView || window;
        style = win.getComputedStyle.bind(win)(elt, pseudoElt ?? null);
      } catch (e2) {
        // Ultimate fallback: main window's bound native
        style = nativeGetComputedStyle(elt, pseudoElt ?? null);
      }
    }

    return new Proxy(style, {
      get(target, prop, receiver) {
        // Temporary log to trace exact property access causing issues
        console.log(`[html2canvasSafe Proxy] Accessing property: ${String(prop)}`);

        // Fix: Pass 'target' instead of 'receiver' (the Proxy) to Reflect.get.
        // Native DOM getters check the 'this' context, and if they receive the Proxy,
        // they throw "TypeError: Illegal invocation".
        const val = Reflect.get(target, prop, target);
        
        if (typeof val === 'string' && hasUnsupportedColor(val)) {
          return colorToRgb(val);
        }
        if (typeof val === 'function') {
          if (prop === 'getPropertyValue') {
            return function(propertyName: string) {
              const originalValue = target.getPropertyValue(propertyName);
              if (typeof originalValue === 'string' && hasUnsupportedColor(originalValue)) {
                return colorToRgb(originalValue);
              }
              return originalValue;
            };
          }
          // Fix: Bind all other native methods to the target
          return val.bind(target);
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
  // FIX: bind before storing — never store a detached native method reference
  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  const patchedGetComputedStyle = createPatchedGetComputedStyle(originalGetComputedStyle);

  // Patch the main window's getComputedStyle
  window.getComputedStyle = patchedGetComputedStyle;

  // Intercept onclone to also patch the iframe/cloned document's window
  const originalOnClone = options.onclone;
  options.onclone = async (clonedDoc: Document, clonedElt: HTMLElement) => {
    if (clonedDoc.defaultView) {
      const clonedWin = clonedDoc.defaultView;
      // FIX: bind to the iframe's own window before passing to createPatchedGetComputedStyle.
      // Without .bind(clonedWin), the extracted function throws "Illegal invocation" when
      // html2canvas calls it from inside the cloned document context.
      const boundClonedGCS = (clonedWin.getComputedStyle || nativeGetComputedStyle).bind(clonedWin);
      clonedWin.getComputedStyle = createPatchedGetComputedStyle(boundClonedGCS);
    }
    if (originalOnClone) {
      await originalOnClone(clonedDoc, clonedElt);
    }
  };

  try {
    console.log('[html2canvasSafe] Starting capture with patched getComputedStyle...');
    const canvas = await html2canvas(element, options);
    console.log('[html2canvasSafe] Capture complete ✓');
    return canvas;
  } catch (err: any) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error('[html2canvasSafe] html2canvas threw an error:', msg, err);
    throw err; // re-throw so caller's catch shows the specific message
  } finally {
    // Always restore original — even if html2canvas throws
    window.getComputedStyle = originalGetComputedStyle;
  }
}
