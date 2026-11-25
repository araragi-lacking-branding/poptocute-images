// The site font: BIZ UDMincho, served from cutetopop.com itself (public/fonts/, made by
// scripts/self-host-font.mjs), so every device gets the same Mincho and no visitor
// contacts a font provider. If it can't load, fall back to the Mincho each platform
// already has (Windows, macOS/iOS, Android/Linux), then any serif.
export const FONT_CSS_PATH = '/fonts/biz-udmincho-v11.css';
// The slice with Basic Latin (U+0000-00FF): every page needs it, so it's preloaded.
export const FONT_LATIN_PATH = '/fonts/biz-udmincho-v11/123.woff2';

export const MINCHO_STACK = [
  '"cutetopop Mincho"',
  '"BIZ UDMincho"', '"MS Mincho"', '"Yu Mincho"', 'YuMincho',
  '"Hiragino Mincho ProN"', '"Hiragino Mincho Pro"',
  '"Noto Serif JP"', '"Noto Serif CJK JP"', '"Source Han Serif JP"',
  '"Heisei Mincho"', '"SimSun"', 'serif',
].join(', ');

// For <head>: the font CSS plus a preload of the Latin slice. Same-origin only;
// pages with a CSP need style-src 'self' and font-src 'self'.
export const FONT_HEAD = `<link rel="preload" href="${FONT_LATIN_PATH}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${FONT_CSS_PATH}">`;
