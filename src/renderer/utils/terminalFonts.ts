import type { TerminalFont } from '@shared/types/uiSettings';

const FONT_FAMILIES: Record<TerminalFont, string> = {
  embedded: '"JetBrains Mono Embedded", monospace',
  system:
    '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", "Fira Code", Consolas, "JetBrains Mono Embedded", monospace',
  cascadia: '"Cascadia Code", "Cascadia Mono", "JetBrains Mono Embedded", monospace',
  jetbrains: '"JetBrains Mono", "JetBrains Mono Embedded", monospace',
  fira: '"Fira Code", "JetBrains Mono Embedded", monospace',
  consolas: 'Consolas, Monaco, "JetBrains Mono Embedded", monospace',
};

export function getTerminalFontFamily(font: TerminalFont): string {
  return FONT_FAMILIES[font] || FONT_FAMILIES.embedded;
}
