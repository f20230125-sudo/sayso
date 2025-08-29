# DESIGN.md: Sayso

Status: Built and live. Direction picked by Claude under Uzair's blanket go-ahead of 2026-10-13; not yet reviewed by him.
Pages covered: `/` (the desk: welcome, conversation, "How it worked" panel, settings dialog, toasts), `/gallery`, the not-found and error pages.
Written 2026-10-13 by the design director. Pictures cited are in the session scratch folder
`C:\Users\UZAIR\AppData\Local\Temp\claude\d--claude-workspace\dc3256bc-48b3-4c89-b760-cb9e543aa661\scratchpad\sayso\`
(`mock\*.png` are static sketches of this plan, not a build; `contrast.mjs` is the arithmetic; `fonts\` holds the B612 files used for the sketches only).
Baseline pictures (before any change): `C:\Users\UZAIR\.claude\design-kit\references\baseline-2026-10-13\sayso-*.png`, scans in `scan\sayso*.json`. I did not re-run the scanner: nothing has changed since that baseline.

## 0. Decisions that are Uzair's (nothing here is final until he says so)

1. **Family or distinct?** Not answered by him. Recommendation applied: **a thin shared layer, a distinct face.** Shared (see `C:\Users\UZAIR\.claude\design-kit\family-layer.md`): light and dark following the system with the header toggle and no flash (`data-theme`), the accessibility baseline, the honest tone, the "Open in Hindsight" control and `frame-ancestors`, a 4 px spacing rhythm, a skip link, titles, descriptions and an `og:image`. Not shared: typeface, accent, radius, first screen, label style, motion, logo. Reverting to the old kit means restoring `globals.css`, `layout.tsx` and the component classes; nothing in `src/agent` changes either way.
2. **The direction itself** (section 4): the desk as a docket of paper forms, marked in highlighter yellow, set in B612 (the typeface Airbus made for cockpit screens). It is a stronger colour move than Hindsight's ink-only chrome. Fallback if he finds yellow too loud: keep everything, make the primary button ink-filled and leave the marker only on marks (section 9, last row).
3. **Claims that change on the page.** (a) The five suggested sentences on the first screen gain a line saying which pieces each one builds, computed from the plan so it cannot go stale (section 7). (b) The eyebrow "Juno Air · demo desk" becomes plain header text. (c) The green "ok" colour is retired; success is an ink check and the word. Nothing else is claimed that was not.
4. **How he is described: nothing changes.** The demo traveller is still "Uzair Khan" because that is the demo account's name (`src/airline/account.ts`); the page says nothing else about him.

## 1. What it is

Sayso is a service desk for a made-up airline, Juno Air. A visitor types or says what they want ("Move my London flight to next week, window seat, and add a bag") and gets working interface instead of a text reply: days to pick, a flight list, a seat map, one price, a receipt, with the steps behind it open to read. Nothing is really booked or charged, and no key is needed.

## 2. Who opens it, and what they do in the first 30 seconds

An AI.AT.Core interviewer or an engineer sent the link (from Uzair's portfolio, where it opens in a window, or from the README's GIF), with a couple of minutes to spare. Within 30 seconds they must: see that this is an airline desk and that it is made up; run one request by clicking a sentence (no typing, no key); watch a form appear, answer it, and see it fold to one line; and find "How it worked". The first screen therefore shows a real trip drawn as a pass, and says what each sample sentence will build. It must also work in a 720-900 px portfolio window and on a phone.

## 3. Source material

1. **The fold.** An answered component closes into one ruled line and the next piece opens (`src/widgets/registry.tsx` `WidgetHost`, 200 ms height change; README "Each folds into one line as you answer it"). This is the product's own behaviour and nothing else on the web does it: a conversation becomes a docket with one open form.
2. **The boarding pass and its stub.** Big airport codes with a line and the flying time, then a tear-off: fact fields, the barcode, the booking code (`src/widgets/TripCard.tsx` `FlightLine`, `src/widgets/travelling.tsx` `BoardingPass`, dashed divider at line 132; picture `docs/screenshots/phone.png`, `baseline...\sayso-desktop-light.png`). The turn footer ("Understood by the built-in rules in 2 ms, How it worked") is already a stub.
3. **Marking.** The desk marks things for you: free seats that match the wish (`SeatMap.tsx`, `matches(seat)`, the "Free window seats are marked" reply), the lowest fare and "You fly now" on the day strip (`choosing.tsx`), the next step on the status timeline (`travelling.tsx`), the tallest bar in an answer chart (`answer.tsx`). A check-in agent does the same with a highlighter pen. Colour means one thing: the desk marked this.
4. **The cabin plan and the fare table.** 24 rows of six, aisle after C, exit rows with extra room, prices 0/35/90/160 by kind (`src/airline/seats.ts`); day cells with a fare or a difference ("+ AED 120", "same fare", `choosing.tsx`); receipt lines with "No charge" and "To pay now" (`simple.tsx` `Lines`).
5. **The airline's vocabulary and codes.** DXB, BOM, LHR; JN 303; booking T5LW4H; Zone, Gate "TBA", "Boards", "Bag drop closed", "Check-in open" (`places.ts`, `travelling.tsx`, `status.ts`).
6. **The four steps, as the back-office copy.** Understand, plan (steps of kind note, call, say, ask), run (method and URL, status, ms), check (`HowItWorked.tsx`, `src/agent/describe.ts`). Treated as the carbon copy of a form, not as a dashboard.

Category conventions borrowed: caption under a ruled blank (paper forms), perforation where a document has a tear-off, highlighter marks. Category looks avoided: split-flap departure boards, amber on black.

Typeface source: **B612**, designed for aircraft cockpit screens (Airbus with ENAC and Université de Toulouse III, Intactile DESIGN; the Google Fonts description says "designed and tested to be used on aircraft cockpit screens", read 2026-10-13 in `ofl/b612/DESCRIPTION.en_us.html`). It is not in the repo; the link to the product is that the product is an airline desk and its numbers (times, seats, fares) must be read at a glance.

## 4. The idea

**Directions considered**

- **A. "The docket" (picked).** From 1, 2 and 3. The desk hands over paper forms; the one you are filling is the large thing; everything you have finished folds to a ruled line with your answer marked in highlighter; the first screen is a real pass. Palette: sage-grey floor, off-white paper, green-black ink, highlighter yellow (hue 68) as a fill under ink only. Type: B612. First screen: the pass at 76 px codes, and the five sentences with what each builds.
- **B. "The departures board".** From 4 and 5 (flight rows, times, status). Everything as aligned rows of time, flight, status. Rejected: a board is something you read, and Sayso is something you act on; the look is amber or white on black, which is second-wave cluster 2 almost by definition; split-flap is a stock airline trope; it would shrink the pass, which is the product's best object.
- **C. "The tape".** From 4 (receipt lines). A narrow till-roll column beside the conversation that adds up what the request costs as it goes. Rejected: only 3 of the 14 components deal with money, a roll is a new feature not a look, and thermal-receipt styling means monospace labels (second-wave "mono for vibes").

**The idea, in one sentence.** The desk hands you paper forms: the one you are filling is large, each one you finish folds to a single ruled line with your answer highlighted, and the only colour on the page is the desk's highlighter.

Everything below follows: boxes exist only around a document (a pass, a form); words sit on the floor; labels are captions under a rule; perforation appears only where a document has a tear-off part; yellow is a fill under ink, never a text colour or a border.

## 5. Token plan

### Colour

Light and dark values; roles are what components use (`--accent`, `--accent-soft`, `--ok`, `--series` are retired). Hue is HSL.

| Token | Light | Dark | Role | Used for / never used for |
|---|---|---|---|---|
| `floor` | `#e5e9df` | `#262c24` | the page, header, the "How it worked" ground is `paper-2` | words sit here. Never behind a seat or a control that needs a boundary. Sage-grey, not cream (hue 84 / 105, low chroma) |
| `paper` / `paper-2` | `#fbfbf7` / `#eef0e8` | `#2f362d` / `#394136` | `paper`: the pass, forms, ask bar, dialog. `paper-2`: taken seats, the carbon-copy panel, recesses, row hover | `paper` is the only ground for form content. `paper-2` is not a third card level |
| `ink`, `ink-2`, `ink-3` | `#161a12`, `#454c3d`, `#596150` | `#eef0e6`, `#c3c9b6`, `#adb5a0` | text, rules that must be seen, the 1.5 px ask-bar edge, selected fill, focus ring. `ink-2` desk replies and secondary. `ink-3` captions, metadata, placeholder (12 px and up) | green-black on purpose (hue 90): printer's black, not Hindsight's blue-black |
| `rule`, `edge` | `#d3d8ca`, `#7a8270` | `#444d40`, `#8a9380` | `rule`: hairlines between lines and around forms (decoration). `edge`: perforations, seat outlines, field edges, anything that must be found (3:1) | `rule` never carries meaning |
| `mark` | `#d9ef47` | `#cde04a` | the highlighter. Fill only, with `ink` text on it (13.76 / 12.06). The desk's marks: matching seats, your answer on a folded line, the lowest fare, the next status step, the largest bar, the primary button of the open form, the logo fill, the model-in-use square | never a text colour, never a border or outline, never a background for more than a button, a seat, a line of text. At most one mark colour on a form's first view apart from seats |
| `signal` | `warn #8f4a00`, `bad #b3261e` | `warn #f0b44a`, `bad #ff8f86` | `warn`: late flight, a check that differs. `bad`: failure, "Cancel booking" outline | always with an icon and a word. `ok` green is gone: a pass is an ink check and the word |

Hue arithmetic for the family rule (`family-layer.md`): accent **68** is outside 235-290; Hindsight's nearest data hue is amber at 41, a 27 degree gap (rule: 20); Agent Desk green 142 is 74 away; Hindsight green 120 is 52 away; no sibling accent exists yet that is closer than 25 (Hindsight has none). What it leaves free: 93-98 and 292-338. Footnote and Flowboard can sit about 30 apart inside 292-338.

**Contrast, computed** (`scratchpad\sayso\contrast.mjs`, WCAG 2.x, final hex values above):

| Pair | Light | Dark | Needs |
|---|---|---|---|
| ink on floor / paper / paper-2 | 14.32 / 17.00 / 15.34 | 12.43 / 10.82 / 9.20 | 4.5 |
| ink-2 on floor / paper / paper-2 | 7.24 / 8.60 / 7.76 | 8.41 / 7.32 / 6.23 | 4.5 |
| ink-3 on floor / paper / paper-2 | 5.25 / 6.23 / 5.62 | 6.74 / 5.87 / **4.99** | 4.5 |
| ink on mark (text on highlighter) | 13.76 | 12.06 | 4.5 |
| selected seat text (paper on ink) | 17.00 | 10.82 | 4.5 |
| warn on floor / paper / paper-2 | 5.42 / 6.43 / 5.80 | 7.72 / 6.72 / 5.71 | 4.5 |
| bad on floor / paper / paper-2 | 5.31 / 6.30 / 5.69 | 6.49 / 5.65 / **4.80** | 4.5 |
| edge on floor / paper (control and seat outline) | 3.25 / 3.85 | 4.47 / 3.89 | 3 |
| focus ring (ink) on floor / paper / paper-2 | 14.32 / 17.00 / 15.34 | 12.43 / 10.82 / 9.20 | 3 |
| primary button edge (light: ink on mark; dark: mark on paper) | 13.76 | 8.51 | 3 |
| mark on paper / floor (a fill, never relied on to be seen) | 1.24 / 1.04 | 8.51 / 9.78 | none |

Everything passes. Borderline: dark `ink-3` on `paper-2` (4.99) and dark `bad` on `paper-2` (4.80): keep both off `paper-2` where you can. In the light theme the mark is almost invisible against paper (1.24), so a mark is never the only cue: seats and the button carry an ink edge (light) and the word on the legend; a folded answer is read from its text; the mark is emphasis, not the signal. `edge` on `floor` in light is 3.25: put fields and seats on `paper`.

### Type

One family, used decisively; mono only for verbatim data.

| Role | Family | Weights | Sizes | Why | Loaded via |
|---|---|---|---|---|---|
| Everything | **B612** (static, no variable axes) | 700 for headings, codes, figures, button text; 400 for the rest | greeting 52 desktop / 38 phone, line 1.04, tracking -0.02em. The traveller's words (turn heading) 26 / 22, line 1.2, tracking -0.015em, max 24em. Airport codes: 76 desktop pass, 48 phone pass, 34 inside widgets, tracking -0.03em. Field value 17/700. Body and desk replies 16 / 1.55, `ink-2`. Form text 15. Captions 12.5, `ink-3`. Stub and notes 13. Seat letters 12 | Made for reading times, seats and codes in a glance (section 3). The sketches show it has a strong shape in 700 at 76 px (DXB, BOM) and sits calmly at 16. **Digits are all one width** (measured: 20.8 px each at 32 px), so fares, times and seat numbers line up with no `tabular-nums` setting. Only two weights exist, so hierarchy is size (76 against 16) and 700 against 400, not 200 against 800 | `next/font/google`, `weight: ["400","700"]`, `subsets: ["latin"]` |
| Verbatim | **B612 Mono** | 400; booking code 700 | 12 to 13; booking code in a field 17 | the HTTP method and URL in the Run step, the JSON tree, the booking code and receipt number. Never for labels | `next/font/google`, `preload: false` |

Licence: B612 and B612 Mono, SIL Open Font License 1.1, "Copyright 2012 The B612 Project Authors (https://github.com/polarsys/b612)" (`ofl/b612/OFL.txt` in google/fonts, read 2026-10-13). Both are in this project's `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`: B612 weights 400 and 700, styles normal and italic, subset `latin` only; B612 Mono the same. Latin files from Google's CSS on 2026-10-13: 21 KB (400) and 13 KB (700) for B612, about 19 KB each for the mono (Geist plus Geist Mono today is about 52 KB; the mono loads only where used).

```ts
const b612 = B612({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-b612" });
const b612mono = B612_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-b612-mono", preload: false });
```

**Glyph holes (measured by rendering, `scratchpad\sayso\mock\glyphs.mjs`)**: `→` (U+2192) and `✓` (U+2713) are not in B612 or its latin subset and would fall back to a system font. `−`, `·`, curly quotes, `…`, `ü` (Türkiye) are present. `choosing.tsx` writes `→` between departure and arrival: draw it with a lucide arrow or a rule instead. Never type `✓`; use the lucide `Check` icon.

No tracked all-caps anywhere. No small mono labels. Labels are captions under a rule (section 6).

GUESS to verify at build: that `next/font` accepts `B612_Mono` as the export name and that no fallback-metrics warning breaks the build (Hindsight's file raised the same worry for its face).

### Shape and depth

- **Radius by role.** The pass, forms, ask bar, dialog and the carbon-copy panel's inner blocks: **14 px**. Buttons, text fields, day cells, flight rows, icon buttons, toasts: **10 px**. Seats, legend swatches, the HTTP method tag: **5 px**. The marker behind an answer: **2 px** (highlighter strokes are nearly square). Full circles only for the perforation notches and the status-timeline dots. No pill shapes: suggestion pills and gallery chips become ruled rows.
- **Elevation.** Three steps: floor (flat), paper (1 px `rule` border, no shadow), overlay (dialog and toast: one shadow, `0 8px 24px` at 18% ink). No blur, no glow, no `shadow-lift` on the ask bar. Borders over shadows.
- **Boxes only around documents.** The pass, each open form, the ask bar, the dialog, the failed-step alert. The traveller's words, the desk's lines, folded lines, the stub, the checks list and the gallery text sit on the floor.
- **Perforation** (2 px dashed `edge`, with a semicircle notch at each end where it crosses a box): only where a document has a tear-off part. The pass (main part above, fact fields below), the boarding pass (barcode below), the receipt (lines above, "Your booking now" below), and the turn stub (dashed line only, no notches). It marks a change of document part and nothing else.
- **Fields.** A value written on a rule: 1.5 px `ink` underline under the value, caption under the line (below). Text inputs are `paper` boxes with a 1.5 px `ink` edge. A selected thing is `ink` fill with `paper` text (your choice); a marked thing is `mark` fill with `ink` text (the desk's choice or suggestion). Focus is a 2 px `ink` outline with 2 px offset everywhere.
- **Captions under a rule** replace the eyebrow: value on top in 700 at 17, a 1.5 px `ink` line, then the label in 12.5 / 400 / `ink-3`, sentence case ("Seat", "Checked in", "Booking"). Group titles are 15/700 plain text ("Or start from one of these").

### Space

4 px base; steps 4, 8, 12, 16, 24, 32, 48, 56. Inside a turn 16 between pieces; between turns 48; folded lines are 10 px above and below their text with shared hairlines. Pass padding 24 by 28. Docket column 800 px, left edge at 120 px on a 1440 screen (the same edge as the welcome column). Prose measure 62ch; the traveller's words 24em; forms use the whole column. Phone side padding 20. Touch targets at least 32 px (seats 32, controls 40, primary on a phone 44).

### Motion

**The one moment: the fold.** When you answer a form, it closes to its line (keep the existing 200 ms height and opacity change in `WidgetHost`, `ease-out`), and 120 ms later a highlighter stroke wipes left to right behind your answer (`background-size` from `0 86%` to `100% 86%`, 240 ms ease-out). The stroke plays only for an answer given in this session: not when a saved conversation is reloaded (set the class from a ref that saw the state go from active to answered).
State transitions: hover and focus 150 ms; "Working" is the label plus a 2 px dashed `edge` rule that advances (background-position, 1 s linear, infinite; it replaces the three pulsing dots); nothing else moves. **Removed:** `rise-in` (fade and slide up 8 px on every line), `working-dot` pulsing, the shadow transition on the ask bar.
Reduced motion: the fold is instant, the stroke is at full width at once, the "Working" rule is still. The existing global rule shortens durations but not delays, so set `animation: none` explicitly on the stroke.

## 6. Layout concept

Skeleton: **a left-aligned docket.** Words and lines hang at the left edge; documents (the pass, forms) are the wide, boxed things; the page has no centred column and no gutter. The right of the screen belongs to a sibling object: the pass on the welcome screen, the "How it worked" copy when it is open.

- **Welcome.** Two unequal columns: the talking on the left (greeting, a sentence, five sample requests with what each builds, then the ask bar), the paper on the right (the real next trip as a pass, the largest thing on the screen).
- **Conversation.** One 800 px docket: the traveller's words as a heading, the desk's lines under them, open form as a box, folded lines as ruled rows, the turn closed by a stub.
- **"How it worked."** The carbon copy: a 400 px panel on `paper-2` with a dashed `edge` left edge instead of a solid border; sections as ruled blocks, not cards.
- **`/gallery`.** The forms catalogue: left-aligned, the 14 names as a ruled two-column index (plain links), then each form with its caption beneath it.

### `/` desktop 1440 (picture: `mock\welcome-light.png`, `welcome-dark-A.png`)

```
+--------------------------------------------------------------------------------------------+
| [ticket] Sayso  Juno Air demo desk                         Uzair Khan  (=) (#) (*) (o) (c) |  56, floor, 1 px rule
|                                                                                            |
|   Hello, Uzair.                       (52/700)    +----------------------------------------+
|   Say what you need in your own       (18, 31ch)  | Juno Air  JN 303                Wed 14 Oct |
|   words. The right screen for it                  |  DXB  ------ plane 3h 15m ------  BOM   |  76/700 codes
|   builds itself here.                             | Dubai 18:55                Mumbai 23:40 |
|                                                   o- - - - - - - - - - - - - - - - - - - -o  perforation + notches
|   Or start from one of these          (15/700)    |  9C        1 bag      Not yet           |  value on a rule
|   ---------------------------------------------   |  ------    ------     ------            |
|   Move my London flight to next week, ...         |  Seat      Checked    Checked in        |  captions 12.5
|   Days, flights, seat map, price, receipt (13)    |  T5LW4H    TBA        Wed 14 Oct        |
|   ---------------------------------------------   |  Booking   Gate       Date              |
|   Check me in for Mumbai                          +----------------------------------------+
|   Passenger check, boarding pass                  
|   ... (5 rows)                                    (right column is deliberately empty below the pass)
|                                                                                            |
|   +------------------------------------------+                                             |
|   | Say what you need              (mic) [^] |  60 high, 1.5 px ink edge, 14 radius; [^] is the mark-yellow send button
|   +------------------------------------------+                                             |
|   A demo. Juno Air is made up and nothing here is really booked or charged.  (12.5)       |
+--------------------------------------------------------------------------------------------+
```
Unequal on purpose: the pass is about 560 px wide and its codes are 76 px, five times the body; the left column is 600 px of small text. The ask bar belongs to the left column.

### `/` phone 390 (not sketched as a picture)

```
| [ticket] Sayso            (=)(#)(*)(o)(c) |  56; "Juno Air demo desk" and the name are hidden
| Hello, Uzair.            (38/700)          |
| Say what you need in your own words...     |
| +--------------------------------------+   |
| | Juno Air JN 303           Wed 14 Oct |   |  pass at full width, codes 48/700
| | DXB ---- plane 3h 15m ---- BOM       |   |
| o- - - - - - - - - - - - - - - - - - -o   |
| | 9C       1 bag      Not yet          |   |  two to three fields per row
| +--------------------------------------+   |
| Or start from one of these                 |
| ------------------------------------------ |
| Move my London flight to next week, ...    |  rows at least 56 high
| Days, flights, seat map, price, receipt    |
| ...                                        |
| [ Say what you need        (mic) [^] ]     |  fixed to the bottom, send button 44
| A demo. Juno Air is made up ...            |
```

### Conversation, desktop 1440 (picture: `mock\docket-light.png`, `docket-dark-A.png`; the mock's ask bar overlaps the form because it is a sketch)

```
|   Move my London flight to next week,          (26/700, the traveller's words, at the left edge)
|   window seat, and add a bag
|   Here are the days Mon 12 Oct to Sun 18 Oct, each with its lowest fare.        (16, ink-2)
|   --------------------------------------------------------------------------------
|   Days     [Wed 14 Oct]                         folded line: title 700, answer on a mark stroke
|   --------------------------------------------------------------------------------
|   Here are the flights to London on Wed 14 Oct, with what each costs ...
|   Flights  [JN 201, 08:30 to 12:15]
|   Here is the cabin on JN 201 to London. Free window seats are marked.
|   +------------------------------------------------------------------------------+
|   | Seat map   JN 201, Dubai to London, Wed 14 Oct                    No seat yet |  15/700 + 13/400 ink-3
|   |                  A  B  C     D  E  F                                          |
|   |              1  [m][ ][ ]   [ ][ ][m]    m = mark, taken = paper-2, picked = ink
|   | [m] Window  [ ] Free  [ ] Taken        7A, window, AED 35    [ Choose 7A ]   |  button: mark fill, ink edge
|   +------------------------------------------------------------------------------+
|   - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -   stub: dashed edge
|   Understood by the built-in rules in 2 ms     How it worked
|   [ Pick a seat above, or type one: "14A"                          (mic) [^] ]
```
With "How it worked" open the 400 px carbon copy sits at the right edge and the docket stays at x 120. If the free space to its right looks unfinished in the 1440 picture, centre the 800 px docket in the space left of the panel and keep every line left-aligned inside it (allowed without asking).

### Pieces, one line each

- **TripCard** (also in Trips, Receipt): the pass at list size, codes 34, same fields; hero size only on the welcome screen.
- **TripChooser, FlightList**: ruled rows inside one form, 10 radius on hover, arrival and departure joined by a drawn arrow, fares on the right in 700.
- **DateStrip (fare ladder)**: day cells in a row; weekday in sentence case ("Wed"), day 22/700, fare or difference underneath; the lowest fare sits on a mark stroke; "the day you fly now" keeps the dashed ink outline.
- **SeatMap**: as the sketch; the exit rows keep their extra gap and say "More legroom" in 12.5; 32 px seats at radius 5; the key shows the three states with their words.
- **StatusTimeline**: vertical rail, ink dots (done filled, next marked, later hollow `edge`), times right-aligned; the phase is plain text ("Boarding") on a mark stroke when it is the current one, with no pill.
- **BoardingPass**: the pass, with the stub below the perforation holding the barcode (kept, decoration, `aria-hidden`) and the booking code in B612 Mono.
- **PriceSummary, Refund, Receipt**: receipt lines as a ruled `dl`, the total in 700 at 17; the button states the amount.
- **AnswerCard**: bars in `ink-2`, the tallest bar `mark` with an `ink` edge (it already singles out the tallest, `answer.tsx`).
- **Gallery**: form, caption beneath ("Trips" in 700, the description in `ink-2`), the answered line under it, "Schema" as a plain underlined toggle. Count in the heading stays computed (`widgets.length`).

## 7. Voice

A counter agent: short, polite, exact about what was done and what it costs.

1. Say what was done and what it costs, with the currency written ("AED 35"), never a bare number.
2. Limits stay where they bite: "A demo. Juno Air is made up and nothing here is really booked or charged." stays on the first screen under the ask bar; "Demo: no real money moves." stays in the price form.
3. No exclamation marks, no emoji, no "Oops", no "AI-powered", "smart", "magic". A model is "a language model" and appears only as "Understood by <model> in N ms".
4. A button says its action and amount: "Choose 7A", "Pay AED 35", "Cancel booking, refund AED 120". Never "Submit", "Continue", "Learn more".
5. Use the airline's own words: check-in, boarding pass, booking, gate, bag drop. Prefer commas to middle dots in running text ("JN 201, Dubai to London, Wed 14 Oct").

Sample lines (kept where already right; tests pin the ones marked T):
- Headline: "Hello, Uzair." (T, `tests/e2e/helpers.ts`). Sentence under it: "Say what you need in your own words. The right screen for it builds itself here." (kept).
- List title: "Or start from one of these" (new; replaces the eyebrow "Try asking"; the list keeps `aria-label="Things to try"`, T).
- Builds line under each sentence: "Days, flights, seat map, price, receipt" (the example is the README's own sentence, "a day picker, a flight list, a seat map and one price", plus the receipt). **Compute it: run each suggestion through the real understand and plan functions and list the widget titles** (`src/agent`, called, not edited; `WIDGETS[type].title`), and pin it with a unit test. If that is not done, drop the line; never type it by hand.
- Primary button: "Choose 7A". Empty: "There are no flights that day." (kept). Error: the failure message plus "Try again" (kept). Tooltip: "Language model: none, built-in rules only" (kept).
- Stub: "Understood by the built-in rules in 2 ms" and "How it worked" (T: the button's name must still end with "How it worked").

Facts that must stay true, with sources:
- Juno Air is made up and nothing is really booked or charged (`Desk.tsx:223`, README).
- The desk works with no key; a model is optional, the visitor's own key stays in the browser and calls go straight to the provider (README "The model is optional", `SettingsDialog.tsx`).
- Fourteen components, shown at `/gallery` (computed from `WIDGETS`); eight journeys (README table); four steps: understand, plan, run, check (`HowItWorked.tsx`, T `accessibility.spec.ts:135`).
- Prices, seats and flights come from the airline's API and the code works out every number; the model never writes a number (README "Decisions").
- "Open in Hindsight" hands the run to Hindsight and falls back to a file (README, `hindsight.spec.ts`).

## 8. Principles that set it apart

1. **One open form.** On any screen after the first request there is exactly one boxed, unfolded document, and everything above it is a ruled line or plain text.
2. **Yellow is a fill under ink.** Pick any pixel that is yellow: black or dark ink text sits on it. Nothing yellow is text, a border or an outline.
3. **Captions sit under the line.** No label above a value anywhere; no all-caps, no mono for a label.
4. **Perforation means a tear-off.** A dashed edge appears only on a pass, a boarding pass, a receipt, the turn stub and the carbon-copy panel edge.
5. **Codes are the biggest type.** On the first screen DXB and BOM are at least 4 times the body size (76 against 16), larger than the greeting.

## 9. Second pass: defaults I removed

| First idea | Why it was a default (tell, wave) | Revised to |
|---|---|---|
| Keep indigo, add a ticket-shaped card | the family accent plus one gimmick (first wave, indigo) | highlighter yellow at hue 68, derived from marking (source 3) |
| Dark theme near-black with the yellow fill | pictured in `mock\welcome-dark.png`: reads as "dark signal", near-black plus an acid accent (second wave 2) | lifted sage ground `#262c24` and `#2f362d`, accent muted a step; pictured in `docket-dark-A.png`, and a blue-green slate (`-B`) was rejected because it sits next to Hindsight's blue-black. Residual risk: still dark with a bright accent; kept because marks are small fills under ink and never glow |
| All-caps field labels as on real boarding passes | tracked caps eyebrows and "A · B" strings (second wave 5), which are the baseline's worst tells | captions under a rule in sentence case, commas in running text |
| Departure-board look for the status and flight rows | amber on black, split-flap; read-only vernacular (second wave 2) | ruled rows and a vertical rail; times in 700 at 17 |
| Pinning the ask bar to the top ("the counter") | breaks the copy "Pick a seat above" and the habit of every chat; no test needs it | bottom, left-aligned with the docket, 14 radius and an ink edge, no shadow |
| A persistent "traveller's file" rail of passes beside the conversation | a new feature (state and tests), not a look | the pass is on the first screen only; a conversation is one docket |
| Pills for suggestions and the gallery index | pill chips (first and second wave) | ruled rows with the builds line; a two-column index |
| Avatar circle with initials, Geist logo tile "S" | template header | plain name; a notched-ticket mark in `mark` with an ink edge and a dashed stub line |
| Green ticks and green "ok" everywhere | colour as decoration, five competing hues | ink check and the word; `warn` and `bad` only with icon and word |
| Fade-and-slide-up on every line, three pulsing dots | stock motion (first wave) | no arrival motion; one moment, the fold with the highlighter stroke |
| B612 for labels in mono as well | mono-for-vibes | B612 Mono only for method, URL, JSON, booking code |
| Hue 72 for the mark | first guess, 31 from amber | 68 with the dark value `#cde04a` (hue 68 too) so the two themes read as one colour |
| Notched ticket card everywhere | "ticket-shaped card" is a common UI-kit trope | only where a tear-off exists (principle 4); the rest is type, captions and marks |

"Have I seen this exact thing?" Checked against the baseline picture (`sayso-desktop-light.png`: centred 640 column, pills, indigo), against `references/good/` as summarised in `craft-notes.md` (Poolsuite commits to a world, tonsky to one colour; I did not re-open those pictures), and against the siblings: Hindsight's `DESIGN.md` (ink-only chrome, Mozilla Headline, gutter and track). Not seen: a highlighter-yellow, sage-paper docket in a cockpit typeface. Seen and avoided: ticket notches on a card, lime on black. Fallback if yellow is rejected, recorded so it does not need another run: primary button `ink` fill with `paper` text, the mark kept for marks only, nothing else changes.

## 10. Anti-list for this product

- No indigo or violet anywhere; no gradient (the stroke is a flat fill), no glow, no blur, no glass, no shadow except the dialog and toasts. No emoji.
- No pills, no tracked all-caps, no mono labels, no `A · B` strings, no arrow on a link (only "Back to the desk", which points back; and the drawn arrow between two times).
- No coloured text for yellow; no yellow border or ring.
- No box around a sentence, a list of suggestions, a caption or the checks. No card inside a card (the panel's intent cards become ruled rows).
- No fade-up, bounce, count-up or pulsing dots. One fold.
- No hero image, screenshot, video or logo row. The first screen is the real pass and the real sentences.
- No invented numbers, no invented journeys; the builds line is computed.
- No stock-looking people; the avatar is gone, the name is text.

## 11. Sibling check

Only Hindsight has a `DESIGN.md` so far (`D:\claude-workspace\hindsight\DESIGN.md`, read 2026-10-13). Flowboard and Footnote were not written yet.

| Axis | Sayso (this plan) | Hindsight | Left for Footnote, Flowboard |
|---|---|---|---|
| Primary typeface | B612 (+ B612 Mono for verbatim) | Mozilla Headline (+ Atkinson Hyperlegible Mono) | avoid B612, Mozilla Headline/Text, Atkinson, Geist, Mona/Hubot/Martian (Agent Desk) |
| Accent | highlighter yellow, hue 68 (`#d9ef47`, dark `#cde04a`), fill under ink only | none; blue-black ink, data hues 0, 17, 26-41, 120, 158, 213 | stay out of about 43-93 and 235-290; 292-338 is free for both, 30 degrees apart |
| Radius | 14 pass and forms, 10 controls, 5 seats, 2 stroke | 3 bars, 6 controls, 8 sheet | avoid 14 / 10 / 5 / 2 together |
| Label style | caption under a ruled value, sentence case 12.5 | plain 500 sentence-case sans in a gutter | any other, not this one |
| Skeleton | left-aligned docket of forms and ruled lines; welcome is a two-column talk and paper | label gutter and track on every page | not a docket, not gutter and track |
| One motion moment | the fold, with a highlighter stroke on the answer | a run draws itself once (bars reveal left to right) | something else |

Shared on purpose: theme mechanism and toggle position (right end of the header), accessibility baseline, honest tone, 4 px rhythm, the "Open in Hindsight" control (kept as a ghost button with the external-link icon in the panel header), skip link, security headers.
One thing to know about Hindsight: it draws "waiting for a person" in green and "API call" in orange. Sayso's yellow is 27 degrees from Hindsight's amber (stopped runs), and the two live in different windows of Portfolio OS; Sayso's mark is only ever a fill under ink, which the chart colours never are.

## 12. Constraints from the repo

- **Headers and CSP** (`next.config.ts`): untouched. Sayso's CSP names `frame-ancestors 'self' https://uzair-khan-lac.vercel.app; base-uri 'self'; object-src 'none'; form-action 'self'` and nothing about fonts, but fonts still go through `next/font` only, self-hosted. No `<link>` or `@import` to a font host.
- **`src/agent` is not edited.** The builds line may import and call its functions.
- **Tests** (about 369 unit under `TZ=Asia/Dubai`, 59 e2e in `tests/e2e` with `timezoneId: "Asia/Dubai"`, axe in both themes). Copy and structure they pin, which change only together with the tests:
  `helpers.ts:16` heading "Hello, Uzair."; `journeys.spec.ts:8` the list named "Things to try" whose buttons have exactly the sentence as text, so **the builds line must sit outside each button** (a sibling in the same `li`; make the row clickable with a stretched `::after`); `accessibility.spec.ts:63,162` the button whose name ends "How it worked" (once per turn plus the header button named exactly "How it worked"); `:64` the `aside` named "How it worked"; `:135` the level-3 headings read "1Understand...", "2Plan10 steps", "3Run1 call, ...", "4Check" (keep number, title, note in that order, with no chip text between); `hindsight.spec.ts` the button "Open in Hindsight" and the toasts; `journeys.spec.ts` folded-line texts, "Not answered", "Paid", "Differs:" and the receipt `dl` terms. Gallery: `getByText("Schema", { exact: true })`.
- **No test pins** the middle dots, the arrows, the eyebrow texts or the colours; none renders widgets by class.
- **Accessibility**: axe clean in both themes; focus ring on every control (the old `ring-within` glow becomes the 1.5 px ink edge plus the outline); seats stay 32 px; the gallery phone scan listed 120 of 317 targets under 24 px, mostly JSON-tree toggles (for example "Close properties" 16 x 20 px): give them 24 px hit areas. Desk has no skip link today: add one to the `main`.
- **Colour hooks to replace**: `--accent`, `--accent-soft`, `--ok`, `--series`, `--shadow`, `--shadow-lift`, `.eyebrow`, `.panel`, `.rise-in`, `.working-dot`, `.ring-within`, and every `font-mono` / `text-accent` / `bg-accent-soft` / `text-ok` use (15 mono-label sites per the baseline). `--font-geist-*` references in `globals.css` and `layout.tsx` change to the B612 variables. `viewport.themeColor` becomes `#e5e9df` and `#262c24`.
- **Files that carry the old look**: `src/app/icon.svg` (indigo tile with "S"; replace with the notched ticket), `src/app/opengraph-image.png` (retake from the built first screen: heading, pass, sentences), `docs/screenshots/*.png` and `docs/demo.gif` (`npm run screenshots`, `npm run gif`), the README pictures.
- **Dev**: port 3030; pictures with `node scripts/look.mjs [light|dark] [width] [journey]`. Framed by Portfolio OS: check 720 and 900 px wide, not only 1440 and 390.
- **Build order**: tokens and fonts; header, ask bar, welcome (pass and list); turn view, folded lines, stub and the fold motion; widgets (TripCard, FlightLine, SeatMap, choosing, simple, travelling, answer); "How it worked" panel; gallery; dialog and toast; icon, og image, README pictures.

## 13. Acceptance

- Scanner on `/` and `/gallery` (baseline: SLOPPY, 5 signals on `/`: indigo, Geist, 5 mono labels, 5 eyebrows, 4 `A · B` strings; SLOPPY, 5 on `/gallery`: identical cards, 40 card-like boxes, 536 mono labels, 73 eyebrows, 29 dot strings): at most one signal, or each remaining hit explained. Expect a "dominant accent" in yellow, which is the mark, by design.
- Pictures checked: 1440 light and dark for the welcome, a conversation with an open seat map, the panel open, and `/gallery`; 390 light for the welcome and a conversation; 800 px light for the desk. Look at the dark welcome for "acid on black" before accepting.
- Contrast ratios in section 5 hold in the built CSS (re-run `contrast.mjs` with the final values).
- No fact, number or claim added that is not sourced (section 7); the builds line is computed and tested.
- Lint, typecheck, unit tests, build and e2e pass (`npm run build`, then `CI=1 npx playwright test`); any changed assertion is listed with the reason.
