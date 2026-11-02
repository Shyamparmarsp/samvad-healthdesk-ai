"""Builds side-by-side Figma-vs-implementation sheets and contact sheets.

Audit evidence tooling only; writes into docs/final-audit/evidence/.
Requires Pillow (run with a temporary venv).
"""
import os
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.join(os.path.dirname(__file__), '..', 'evidence')
FIG = os.path.join(BASE, 'figma')
CMP = os.path.join(BASE, 'comparison')
os.makedirs(CMP, exist_ok=True)

PAIRS = [
    ('P1-welcome', 'implementation/P1-welcome-en.png', 'Welcome (P1)'),
    ('P2-consent', 'implementation/P2-consent.png', 'Consent (P2)'),
    ('P3-conversation', 'implementation/P3-conversation-voice-mode.png', 'Conversation (P3) — voice mode'),
    ('P4-gender-question', 'implementation/P4-gender-question.png', 'Gender question (P4)'),
    ('P5-what-we-heard', 'implementation/P5-what-we-heard-voice.png', 'What we heard (P5) — real voice transcript'),
    ('P6-processing', 'implementation/P6-processing-fixture.png', 'Processing (P6, fixture only)'),
    ('P7-mic-denied', 'states/mic-denied-inline.png', 'Mic denied (P7) — Figma vs real denied state'),
    ('P8-report-review', 'implementation/P8-report-review.png', 'Report review (P8)'),
    ('P9-booking', 'implementation/P9-booking.png', 'Booking (P9)'),
    ('P10-slot-unavailable', 'implementation/P10-slot-unavailable.png', 'No slots (P10)'),
    ('P11-slot-taken', 'implementation/P11-slot-taken.png', 'Slot taken (P11)'),
    ('P12-booking-confirmation', 'implementation/P12-booking-confirmation.png', 'Booking confirmation (P12)'),
    ('P13-report-sent', 'implementation/P13-report-sent.png', 'Report sent (P13)'),
    ('P14-emergency', 'implementation/P14-emergency-en.png', 'Emergency (P14)'),
    ('P15-consent-declined', 'implementation/P15-consent-declined.png', 'Consent declined (P15)'),
    ('D1-login', 'doctor/D1-login.png', 'Doctor login (D1)'),
    ('D2-dashboard', 'doctor/D2-dashboard.png', 'Doctor dashboard (D2)'),
    ('D3-reports-list', 'doctor/D3-reports-list.png', 'Reports list (D3)'),
    ('D4-report-detail', 'doctor/D4-report-detail.png', 'Report detail (D4)'),
    ('D5-urgent-detail', 'doctor/D5-urgent-detail.png', 'Urgent detail (D5)'),
    ('D6-appointments', 'doctor/D6-appointments.png', 'Appointments (D6)'),
    ('D7-urgent-review', 'doctor/D7-urgent-review.png', 'Urgent / Review (D7)'),
]

try:
    FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 18)
    SMALL = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 14)
except Exception:
    FONT = ImageFont.load_default()
    SMALL = ImageFont.load_default()

BAR = 34
GAP = 16
PAD = 16


def label(img, text, color=(31, 42, 68)):
    canvas = Image.new('RGB', (img.width, img.height + BAR), (255, 255, 255))
    canvas.paste(img, (0, 0))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, img.height, img.width, img.height + BAR], fill=(237, 240, 247))
    d.text((10, img.height + 8), text, fill=color, font=FONT)
    return canvas


for node, impl_rel, title in PAIRS:
    fig = Image.open(os.path.join(FIG, node + '.png')).convert('RGB')
    impl = Image.open(os.path.join(BASE, impl_rel)).convert('RGB')
    # pad to equal height without scaling either image
    h = max(fig.height, impl.height)
    left = Image.new('RGB', (fig.width, h), (255, 255, 255))
    left.paste(fig, (0, 0))
    right = Image.new('RGB', (impl.width, h), (255, 255, 255))
    right.paste(impl, (0, 0))
    left = label(left, 'FIGMA — ' + title)
    right = label(right, 'IMPLEMENTATION — ' + title)
    W = left.width + right.width + GAP + PAD * 2
    H = max(left.height, right.height) + PAD * 2
    sheet = Image.new('RGB', (W, H), (245, 247, 251))
    sheet.paste(left, (PAD, PAD))
    sheet.paste(right, (PAD + left.width + GAP, PAD))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 2), f'{node} — original Figma artboard (left) vs running app at native viewport (right)', fill=(60, 70, 95), font=SMALL)
    out = os.path.join(CMP, node + '-comparison.png')
    sheet.save(out)
    print('wrote', out)


def contact(items, out_name, cols, thumb_w, title):
    thumbs = []
    for node, impl_rel, lbl in items:
        fig = Image.open(os.path.join(FIG, node + '.png')).convert('RGB')
        impl = Image.open(os.path.join(BASE, impl_rel)).convert('RGB')
        scale = thumb_w / fig.width
        f = fig.resize((thumb_w, int(fig.height * scale)))
        i = impl.resize((thumb_w, int(impl.height * scale)))
        h = max(f.height, i.height)
        row = Image.new('RGB', (thumb_w * 2 + 8, h), (255, 255, 255))
        row.paste(f, (0, 0))
        row.paste(i, (thumb_w + 8, 0))
        rows = Image.new('RGB', (row.width, row.height + 30), (255, 255, 255))
        rows.paste(row, (0, 0))
        d = ImageDraw.Draw(rows)
        d.text((4, row.height + 5), lbl, fill=(31, 42, 68), font=SMALL)
        thumbs.append(rows)

    cell_w = max(t.width for t in thumbs)
    cell_h = max(t.height for t in thumbs)
    rows_n = (len(thumbs) + cols - 1) // cols
    sheet = Image.new('RGB', (cell_w * cols + 20 * (cols + 1), cell_h * rows_n + 60), (240, 243, 249))
    d = ImageDraw.Draw(sheet)
    d.text((20, 14), title, fill=(20, 30, 55), font=FONT)
    for idx, t in enumerate(thumbs):
        r, c = divmod(idx, cols)
        x = 20 + c * (cell_w + 20)
        y = 50 + r * cell_h
        sheet.paste(t, (x, y))
    out = os.path.join(CMP, out_name)
    sheet.save(out)
    print('wrote', out)


patient = [p for p in PAIRS if p[0].startswith('P')]
doctor = [p for p in PAIRS if p[0].startswith('D')]
contact(patient, 'contact-sheet-patient.png', 3, 250, 'Patient screens — Figma (left) vs implementation (right), native 390x844')
contact(doctor, 'contact-sheet-doctor.png', 2, 430, 'Doctor screens — Figma (left) vs implementation (right), native 1280x820')

# master sheet: one representative implementation screenshot per screen, tightly packed
impl_only = [
    ('implementation/P1-welcome-en.png', 'P1 Welcome'),
    ('implementation/P2-consent.png', 'P2 Consent'),
    ('implementation/P3-conversation-name.png', 'P3 Conversation'),
    ('implementation/P4-gender-question.png', 'P4 Gender'),
    ('implementation/P5-what-we-heard.png', 'P5 What we heard'),
    ('implementation/P8-report-review.png', 'P8 Review'),
    ('implementation/P9-booking.png', 'P9 Booking'),
    ('implementation/P10-slot-unavailable.png', 'P10 No slots'),
    ('implementation/P11-slot-taken.png', 'P11 Slot taken'),
    ('implementation/P12-booking-confirmation.png', 'P12 Booked'),
    ('implementation/P13-report-sent.png', 'P13 Report sent'),
    ('implementation/P14-emergency-en.png', 'P14 Emergency'),
    ('implementation/P15-consent-declined.png', 'P15 Declined'),
]
thumbs = []
for rel, lbl in impl_only:
    im = Image.open(os.path.join(BASE, rel)).convert('RGB')
    w = 200
    im = im.resize((w, int(im.height * w / im.width)))
    cell = Image.new('RGB', (w, im.height + 26), (255, 255, 255))
    cell.paste(im, (0, 0))
    ImageDraw.Draw(cell).text((4, im.height + 5), lbl, fill=(31, 42, 68), font=SMALL)
    thumbs.append(cell)
cols = 5
cw = max(t.width for t in thumbs)
ch = max(t.height for t in thumbs)
rows_n = (len(thumbs) + cols - 1) // cols
master = Image.new('RGB', (cw * cols + 10 * (cols + 1), ch * rows_n + 50), (240, 243, 249))
d = ImageDraw.Draw(master)
d.text((10, 12), 'Patient implementation — captured from the running build at 390x844', fill=(20, 30, 55), font=FONT)
for i, t in enumerate(thumbs):
    r, c = divmod(i, cols)
    master.paste(t, (10 + c * (cw + 10), 40 + r * ch))
master.save(os.path.join(CMP, 'contact-sheet-master.png'))
print('wrote contact-sheet-master.png')
