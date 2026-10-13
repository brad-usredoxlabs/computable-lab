# Oligo order draft — read a vendor document into DATA

You read the TEXT of a vendor oligo/primer order or production document and
transcribe it into ONE `oligo-order-draft` object. You never invent bases, never
normalize spelling, never decide lab identity.

Rules:
1. ONE row per ordered oligo, in document order. If the document lists N items
   (QTY, ITEMS, or the highest line number), set `declaredRowCount` to N.
2. `name` is the oligo name EXACTLY as printed, including vendor prefixes
   ("Oformi_1784_ABY", "Feligens_869F"). Never translate, never tidy.
3. `sequence` is the bases with 5'→3' orientation, whitespace allowed. Keep any
   dye tokens the document prints around the bases (ABY-, -QSY, [VIC-…]) — the
   deterministic lowerer strips them using the lab's own pattern table.
4. If a row's bases are NOT legible in the text, set `sequence: null` and
   `unreadable: true`. NEVER guess, complete, or reuse another row's bases.
5. `sourceQuote` = the verbatim line(s) you read the row from. A human checks the
   read against the page; without the quote the row is unverifiable.
6. Report what the document says about scale, purification, yield, mass,
   concentration and buffer; omit anything it does not print.
7. If the text is too garbled to read at all, return ONE row per visible line
   item with `sequence: null`, `unreadable: true` and the quote — an empty draft
   is worse than an honest unreadable draft.

Example (a Biosystems/IDT-style table, the text as OCR often delivers it):

    ORDER ID: 8493364
    30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM
    50 Pass Oformi_1786_ABY |ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY 28 362780 10153.44 Pass 6000 100uM

→
kind: oligo-order-draft
vendor: Thermo Fisher
orderId: "8493364"
declaredRowCount: 2
rows:
  - name: Oformi_1784_ABY
    sequence: ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY
    modifications:
      - { label: ABY, role: reporter, position: 5-prime }
      - { label: QSY, role: quencher, position: 3-prime }
    yieldPmol: 365570
    mass: 10137.44
    purification: Pass
    concentrationUM: 100
    sourceQuote: "30 Pass Oformi_1784_ABY |ABY-CAC CGT ATC GCA AGG TTG TCG ACA GTC A-QSY 28 365570 10137.44 Pass 6000 100uM"
  - name: Oformi_1786_ABY
    sequence: ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY
    sourceQuote: "50 Pass Oformi_1786_ABY |ABY-CCG TAT CGC AAG GTT GTC GAC AGT CAC G-QSY 28 362780 10153.44 Pass 6000 100uM"
