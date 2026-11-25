// The site fonts, served from cutetopop.com itself (public/fonts/, made by
// scripts/self-host-font.mjs) so every device gets the same look and no visitor
// contacts a font provider. Both are SIL OFL.
//   Body:    Noto Serif JP 500, a Mincho built for reading on screens.
//   Display: Hina Mincho, a stylish Mincho for the site name and post titles only.
// If a font can't load, each falls back to the proportional Mincho the platform
// already has (Android/Linux, macOS/iOS, Windows), then any serif.
const BODY = { css: '/fonts/noto-serif-jp-v34-500.css', latin: '/fonts/noto-serif-jp-v34-500/123.woff2' };
const DISPLAY = { css: '/fonts/hina-mincho-v16-400.css', latin: '/fonts/hina-mincho-v16-400/122.woff2' };
export const FONT_FILES = { BODY, DISPLAY };

export const BODY_STACK = [
  '"cutetopop Noto Serif JP"', '"Noto Serif JP"', '"Noto Serif CJK JP"', '"Source Han Serif JP"',
  '"Hiragino Mincho ProN"', '"Yu Mincho"', 'YuMincho', '"BIZ UDPMincho"', '"MS PMincho"', 'serif',
].join(', ');
export const DISPLAY_STACK = `"cutetopop Hina Mincho", "Hina Mincho", ${BODY_STACK}`;

// Reading settings for body text: medium weight (BODY is served at 500 only),
// a little air between letters, and proportional Japanese punctuation (palt).
export const BODY_TEXT_CSS = `font-family: ${BODY_STACK}; font-weight: 500; letter-spacing: 0.02em; font-feature-settings: "palt";`;
// Titles: Hina has one weight; never let the browser fake a bold.
export const DISPLAY_TEXT_CSS = `font-family: ${DISPLAY_STACK}; font-weight: 400; font-synthesis: none;`;

// For <head>: the font CSS plus a preload of each Basic Latin slice. Pass
// { display: true } on pages that show titles. Same-origin only; pages with a CSP
// need style-src 'self' and font-src 'self'.
const link = (f) => `<link rel="preload" href="${f.latin}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${f.css}">`;
export function fontHead({ display = false } = {}) {
  return display ? `${link(BODY)}\n${link(DISPLAY)}` : link(BODY);
}
