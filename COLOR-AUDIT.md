# Color audit — OMNIFILE

Measured from src/styles.css using sRGB relative luminance. Normal text target: 4.5:1. Essential control boundaries: 3:1. This is a palette audit, not a claim of full accessibility conformance.

| Theme | Pair | Before | After |
| --- | --- | ---: | ---: |
| dark | faint / surface | 3.11 | 7.37 |
| dark | muted / surface-3 | 5.08 | 6.46 |
| dark | primary-foreground / primary | 15.11 | 8.27 |
| dark | success / surface | 6.87 | 10.05 |
| dark | danger / surface | 5.72 | 9.22 |
| dark | warn / surface | 7.87 | 11.05 |
| light | faint / surface | 3.50 | 5.82 |
| light | muted / surface-3 | 4.84 | 5.67 |
| light | primary-foreground / primary | 16.08 | 6.62 |
| light | success / surface | 5.97 | 7.06 |
| light | danger / surface | 6.29 | 7.00 |
| light | warn / surface | 5.12 | 7.12 |

Changes: brighter secondary text; blue primary actions; green/amber/red status text with retained labels; theme-aware XYFlow canvas, controls, handles, selection and minimap; keyboard focus rings; native scrollbar and placeholder colors.

Validation: TypeScript and production build passed. Development and production desktop/mobile smoke passed without overflow or console errors. Pipeline dark/light visually inspected.

126 audited text, badge and control-boundary combinations pass. Text targets are 4.5:1; essential control boundaries are 3:1.
