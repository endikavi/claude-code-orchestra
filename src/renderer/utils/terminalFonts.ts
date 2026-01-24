import type { TerminalFont } from '@shared/types/uiSettings';

const FONT_FAMILIES: Record<TerminalFont, string> = {
  system:
    '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", "Fira Code", Consolas, Monaco, "Courier New", monospace',
  cascadia: '"Cascadia Code", "Cascadia Mono", monospace',
  jetbrains: '"JetBrains Mono", monospace',
  fira: '"Fira Code", monospace',
  consolas: 'Consolas, Monaco, "Courier New", monospace',
};

export function getTerminalFontFamily(font: TerminalFont): string {
  return FONT_FAMILIES[font] || FONT_FAMILIES.system;
}
