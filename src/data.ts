// Keyboard layout and product data. Mirrors the HLPlanet keyboard size comparison tool
// (https://www.hlplanet.com/keyboard-layout/), so answers here match what the tool draws.

export const SITE = 'https://www.hlplanet.com/';
export const SIZE_TOOL_URL = SITE + 'keyboard-layout/';
export const U_MM = 19.05; // one key unit, the standard key spacing
export const BEZEL_U = 0.55; // estimated case border around the keys, in key units (about 10 mm)

export interface LayoutDef {
  id: string;
  name: string;
  size: string;
  aliases: string[];
  bestFor: string;
  // Rows are [y, keys]. Each key is "Code", "Code:width" or "Code:width:height"; "_:width" is a gap.
  // Codes are KeyboardEvent.code values.
  rows: [number, string][];
  reviews: [string, string][];
}

const NUMS = 'Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal';
const R_TOP = 'Backquote ' + NUMS + ' Backspace:2';
const R_TAB = 'Tab:1.5 KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash:1.5';
const R_CAPS = 'CapsLock:1.75 KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote Enter:2.25';
const R_SHIFT = 'ShiftLeft:2.25 KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash';
const R_BOTTOM = 'ControlLeft:1.25 MetaLeft:1.25 AltLeft:1.25 Space:6.25';
const R_BOTTOM_FN = R_BOTTOM + ' AltRight Fn ControlRight';
const F_WIDE = 'F1 F2 F3 F4 _:0.5 F5 F6 F7 F8 _:0.5 F9 F10 F11 F12';
const F_TIGHT = 'F1 F2 F3 F4 _:0.25 F5 F6 F7 F8 _:0.25 F9 F10 F11 F12';
const F_FLAT = 'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12';

export const LAYOUTS: LayoutDef[] = [
  {
    id: 'full', name: 'Full-size', size: '100%',
    aliases: ['full', 'full-size', 'fullsize', 'full size', '100', '100%', '104', '104 keys', 'standard'],
    bestFor: 'Number entry, office work and spreadsheets',
    rows: [
      [0, 'Escape _:1 ' + F_WIDE + ' _:0.25 PrintScreen ScrollLock Pause'],
      [1.5, R_TOP + ' _:0.25 Insert Home PageUp _:0.25 NumLock NumpadDivide NumpadMultiply NumpadSubtract'],
      [2.5, R_TAB + ' _:0.25 Delete End PageDown _:0.25 Numpad7 Numpad8 Numpad9 NumpadAdd:1:2'],
      [3.5, R_CAPS + ' _:3.5 Numpad4 Numpad5 Numpad6'],
      [4.5, R_SHIFT + ' ShiftRight:2.75 _:1.25 ArrowUp _:1.25 Numpad1 Numpad2 Numpad3 NumpadEnter:1:2'],
      [5.5, R_BOTTOM + ' AltRight:1.25 MetaRight:1.25 ContextMenu:1.25 ControlRight:1.25 _:0.25 ArrowLeft ArrowDown ArrowRight _:0.25 Numpad0:2 NumpadDecimal']
    ],
    reviews: [['Epomaker Galaxy100', 'epomaker-galaxy100-review'], ['NuPhy Air100 V3', 'nuphy-air100-v3-keyboard-review']]
  },
  {
    id: '1800', name: '98% (1800)', size: '98%',
    aliases: ['1800', '98', '98%', '96', '96%', '99 keys', 'compact full-size'],
    bestFor: 'A numpad without the full-size width',
    rows: [
      [0, 'Escape _:0.25 ' + F_TIGHT + ' _:0.5 Delete Home End PageUp PageDown'],
      [1.25, R_TOP + ' _:0.25 NumLock NumpadDivide NumpadMultiply NumpadSubtract'],
      [2.25, R_TAB + ' _:0.25 Numpad7 Numpad8 Numpad9 NumpadAdd:1:2'],
      [3.25, R_CAPS + ' _:0.25 Numpad4 Numpad5 Numpad6'],
      [4.25, R_SHIFT + ' ShiftRight:1.75 _:0.25 ArrowUp Numpad1 Numpad2 Numpad3 NumpadEnter:1:2'],
      [5.25, R_BOTTOM_FN + ' _:0.25 ArrowLeft ArrowDown ArrowRight Numpad0 NumpadDecimal']
    ],
    reviews: [['Varmilo Minilo98 Pro', 'varmilo-minilo98-pro-keyboard-review'], ['Keydous NJ98-CP V2 HE', 'keyboard-keydous-nj98-cp-v2-he-review']]
  },
  {
    id: 'tkl', name: 'TKL (tenkeyless)', size: '80%',
    aliases: ['tkl', 'tenkeyless', 'ten keyless', '80', '80%', '87', '87 keys', '88 keys'],
    bestFor: 'Every key except the numpad, in the usual places',
    rows: [
      [0, 'Escape _:1 ' + F_WIDE + ' _:0.25 PrintScreen ScrollLock Pause'],
      [1.5, R_TOP + ' _:0.25 Insert Home PageUp'],
      [2.5, R_TAB + ' _:0.25 Delete End PageDown'],
      [3.5, R_CAPS],
      [4.5, R_SHIFT + ' ShiftRight:2.75 _:1.25 ArrowUp'],
      [5.5, R_BOTTOM + ' AltRight:1.25 MetaRight:1.25 ContextMenu:1.25 ControlRight:1.25 _:0.25 ArrowLeft ArrowDown ArrowRight']
    ],
    reviews: [['Wooting 80HE vs 60HE', 'wooting-80he-vs-60he'], ['Machenike K500 TKL', 'machenike-k500-mechanical-tkl-keyboard-review']]
  },
  {
    id: '75', name: '75%', size: '75%',
    aliases: ['75', '75%', '84', '84 keys', 'seventy five'],
    bestFor: 'The all-rounder: F-row, arrows and navigation keys in a compact body',
    rows: [
      [0, 'Escape ' + F_FLAT + ' PrintScreen Insert Delete'],
      [1.25, R_TOP + ' Home'],
      [2.25, R_TAB + ' PageUp'],
      [3.25, R_CAPS + ' PageDown'],
      [4.25, R_SHIFT + ' ShiftRight:1.75 ArrowUp End'],
      [5.25, R_BOTTOM_FN + ' ArrowLeft ArrowDown ArrowRight']
    ],
    reviews: [['DrunkDeer A75 Pro', 'drunkdeer-a75-pro-keyboard-review'], ['MCHOSE Jet 75', 'mchose-jet-75-review']]
  },
  {
    id: '65', name: '65%', size: '65%',
    aliases: ['65', '65%', '68', '68 keys', '66', '67'],
    bestFor: 'Compact setups that still need arrow keys',
    rows: [
      [0, 'Escape ' + NUMS + ' Backspace:2 Delete'],
      [1, R_TAB + ' PageUp'],
      [2, R_CAPS + ' PageDown'],
      [3, R_SHIFT + ' ShiftRight:1.75 ArrowUp End'],
      [4, R_BOTTOM_FN + ' ArrowLeft ArrowDown ArrowRight']
    ],
    reviews: [['Epomaker HE65 V2 TMR', 'epomaker-he65-v2-tmr-review'], ['Varmilo Muse65 HE', 'varmilo-muse65-he-review']]
  },
  {
    id: '60', name: '60%', size: '60%',
    aliases: ['60', '60%', '61', '61 keys', '63', '64', 'mini'],
    bestFor: 'Maximum mouse room for low-sensitivity gaming',
    rows: [
      [0, 'Escape ' + NUMS + ' Backspace:2'],
      [1, R_TAB],
      [2, R_CAPS],
      [3, R_SHIFT + ' ShiftRight:2.75'],
      [4, R_BOTTOM + ' AltRight:1.25 Fn:1.25 ContextMenu:1.25 ControlRight:1.25']
    ],
    reviews: [['DrunkDeer G60', 'drunkdeer-g60-review'], ['NuPhy Air60 HE', 'nuphy-air60-he-review']]
  }
];

export interface Model {
  id: string;
  name: string;
  layout: string;
  widthMm: number;
  depthMm: number;
  review: string;
}

// Keyboards reviewed on HLPlanet, with the case size (width x depth, mm) from the review
export const MODELS: Model[] = ([
  ['redragon-k761-pro', 'Redragon K761 Pro', 'full', 443.5, 132.6, 'redragon-k761-pro-wyvern-review'],
  ['epomaker-galaxy100', 'Epomaker Galaxy100', '1800', 405, 137.8, 'epomaker-galaxy100-review'],
  ['nuphy-air100-v3', 'NuPhy Air100 V3', '1800', 380.6, 133.6, 'nuphy-air100-v3-keyboard-review'],
  ['atk-hex80', 'ATK x QK Hex80', 'tkl', 357, 136, 'atk-x-qk-hex80-review'],
  ['wooting-80he', 'Wooting 80HE', 'tkl', 346, 142, 'wooting-80he-vs-60he'],
  ['gamakay-tk75-tmr', 'GamaKay TK75 TMR', '75', 340, 140, 'gamakay-tk75-tmr-review'],
  ['yunzii-rt75', 'Yunzii RT75', '75', 334.4, 143.6, 'yunzii-rt75-keyboard-review'],
  ['nuphy-kick75', 'NuPhy Kick75', '75', 333, 143.3, 'nuphy-kick75-review'],
  ['epomaker-he75-mag', 'Epomaker HE75 Mag', '75', 329, 140, 'epomaker-he75-mag-wireless-keyboard-review'],
  ['iqunix-ez75', 'IQUNIX EZ75', '75', 326, 150, 'iqunix-ez75-review'],
  ['varmilo-minilo75', 'Varmilo Minilo 75', '75', 325.8, 143.5, 'varmilo-minilo-75-review'],
  ['epomaker-he75-v2-tmr', 'Epomaker HE75 V2 TMR', '75', 324, 138, 'epomaker-he75-v2-tmr-review'],
  ['drunkdeer-g75', 'DrunkDeer G75', '75', 323, 135, 'drunkdeer-g75-review'],
  ['mchose-jet75', 'MCHOSE Jet 75', '75', 322, 136.9, 'mchose-jet-75-review'],
  ['xvx-l75-air', 'XVX L75 Air', '75', 321.6, 136, 'xvx-l75-air-review'],
  ['nuphy-air75-v3', 'NuPhy Air75 V3', '75', 318.9, 128.9, 'nuphy-air75-v3-review'],
  ['keychron-k3-he', 'Keychron K3 HE', '75', 318.6, 126, 'keychron-k3-he-review'],
  ['nuphy-air75-he', 'NuPhy Air75 HE', '75', 316.4, 132.5, 'kick75-vs-air75-v3-vs-air75-he'],
  ['keydous-aj68', 'Keydous AJ68-CP', '65', 352, 125, 'keydous-aj68-cp-review'],
  ['epomaker-he65-v2-tmr', 'Epomaker HE65 V2 TMR', '65', 324, 117, 'epomaker-he65-v2-tmr-review'],
  ['mchose-ace68-gt', 'MCHOSE Ace 68 GT', '65', 320, 127.8, 'mchose-ace-68-gt-review'],
  ['melgeek-made68-v2', 'Melgeek Made68 Ultra V2', '65', 319, 117, 'melgeek-made68-ultra-v2-review'],
  ['weikav-nut65', 'Weikav NUT65', '65', 314, 113, 'weikav-nut65-in-depth-review'],
  ['varmilo-muse65-he', 'Varmilo Muse65 HE', '65', 310, 112, 'varmilo-muse65-he-review'],
  ['wooting-60he-v2', 'Wooting 60HE v2', '60', 305, 115, 'wooting-80he-vs-60he'],
  ['xvx-trooper63', 'XVX Trooper63 HE', '60', 304.8, 110.5, 'xvx-trooper63-review'],
  ['epomaker-hack59', 'Epomaker Hack 59', '60', 302.7, 118.5, 'epomaker-hack-59-review-hhkb-alternative'],
  ['wooting-60he-plus', 'Wooting 60HE+', '60', 302, 116, 'wooting-80he-vs-60he'],
  ['iqunix-ev63', 'IQUNIX EV63', '60', 300.9, 126, 'iqunix-ev63-review'],
  ['drunkdeer-g60', 'DrunkDeer G60', '60', 290, 102, 'drunkdeer-g60-review']
] as [string, string, string, number, number, string][]).map(([id, name, layout, widthMm, depthMm, review]) => ({ id, name, layout, widthMm, depthMm, review }));

export const PADS: Record<string, { name: string; widthMm: number; depthMm: number }> = {
  small: { name: 'Small mousepad (25 x 21 cm)', widthMm: 250, depthMm: 210 },
  medium: { name: 'Medium mousepad (36 x 30 cm)', widthMm: 360, depthMm: 300 },
  large: { name: 'Large mousepad (45 x 40 cm)', widthMm: 450, depthMm: 400 },
  xl: { name: 'XL mousepad (49 x 42 cm)', widthMm: 490, depthMm: 420 },
  deskmat: { name: 'Desk mat (90 x 40 cm)', widthMm: 900, depthMm: 400 }
};

export const LABELS: Record<string, string> = {
  Escape: 'Esc', Backquote: '`', Minus: '-', Equal: '=', Backspace: 'Backspace', Tab: 'Tab',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', IntlBackslash: '\\', CapsLock: 'Caps Lock', Semicolon: ';',
  Quote: "'", Enter: 'Enter', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', Comma: ',', Period: '.', Slash: '/',
  ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', MetaLeft: 'Windows key', MetaRight: 'Right Windows key',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', ContextMenu: 'Menu key', Space: 'Space', Fn: 'Fn',
  PrintScreen: 'Print Screen', ScrollLock: 'Scroll Lock', Pause: 'Pause/Break', Insert: 'Insert', Home: 'Home',
  PageUp: 'Page Up', Delete: 'Delete', End: 'End', PageDown: 'Page Down', ArrowUp: 'Up arrow',
  ArrowDown: 'Down arrow', ArrowLeft: 'Left arrow', ArrowRight: 'Right arrow', NumLock: 'Num Lock',
  NumpadDivide: 'Numpad /', NumpadMultiply: 'Numpad *', NumpadSubtract: 'Numpad -', NumpadAdd: 'Numpad +',
  NumpadEnter: 'Numpad Enter', NumpadDecimal: 'Numpad .'
};

// Free browser tools on HLPlanet that an assistant can point people to
export const TESTING_TOOLS: [string, string, string][] = [
  ['Keyboard tester', SITE + 'online-keyboard-tester-tool/', 'Test every key, N-key rollover, switch chatter, rapid trigger tap speed and SOCD / Snap Tap in the browser.'],
  ['Keyboard size comparison', SIZE_TOOL_URL, 'Compare 100%, 98%, TKL, 75%, 65% and 60% layouts and 30 real keyboards to scale, with a desk and mousepad planner.'],
  ['Gamepad tester', SITE + 'gamepad-tester/', 'Test controller buttons, triggers, stick drift, deadzones and rumble.'],
  ['Controller reaction time test', SITE + 'controller-reaction-time-test/', 'Measure reaction time with a controller, keyboard or mouse, and estimate controller input lag.'],
  ['Rapid Trigger & SOCD Tester (browser extension and Windows app)', 'https://github.com/hlplanet/rt-socd-tester', 'Offline rapid trigger and SOCD tester for Chrome, Edge, Firefox and Windows.']
];
