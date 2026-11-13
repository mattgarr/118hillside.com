"""usage: python3 tour/bim2/tools/freerein/sheet.py <plans-dir>  ->  freerein-sheet@2x.png (the five concepts and the Jan 2024 benchmark, scored)"""
import sys
from PIL import Image, ImageDraw, ImageFont
O = sys.argv[1].rstrip('/') + '/'
W = [25, 20, 15, 15, 15, 10]      # circulation, openness, dining, kitchen, sightlines and balance, livability and furniture
SC = {'freerein-1': ('1. The kitchen hall', '5 BR: one vaulted kitchen-and-dining hall on an axis to the deck', [5, 4, 5, 5, 5, 4]),
      'freerein-2': ('2. The long room', '6 BR kept: kitchen at the street end of a 45-ft line', [5, 3, 5, 4, 5, 4]),
      'freerein-3': ('3. Rooms in sequence', '5 BR: dining hall at the entry, fireside living room under the ridge', [4, 3, 4, 4, 4, 5]),
      'freerein-4': ("4. The architect's plan, turned to the sun", '5 BR: Jan 2024 with living on the south side, dining by the kitchen', [4, 4, 4, 4, 4, 4]),
      'freerein-5': ('5. The wrap', '5 BR: least building; fireside living and table at the glass, kitchen round the corner', [4, 4, 4, 4, 4, 5]),
      'bench-jan24': ("Benchmark: architect's Jan 2024", '5 BR: the plan to beat', [4, 4, 4, 4, 3, 3])}
tot = lambda k: sum(a * b for a, b in zip(SC[k][2], W)) / 100.0
if __name__ == '__main__':
    fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 40); fr = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 27)
    tw, th, band = 1352, 1040, 130
    order = ['freerein-1', 'freerein-2', 'freerein-3', 'freerein-4', 'freerein-5', 'bench-jan24']
    sheet = Image.new('RGB', (tw * 3, (th + band) * 2), 'white'); dr = ImageDraw.Draw(sheet)
    for i, k in enumerate(order):
        im = Image.open(O + k + '@2x.png').convert('RGB').crop((0, 250, 2704, 2330)).resize((tw, th), Image.LANCZOS); x, y = (i % 3) * tw, (i // 3) * (th + band)
        sheet.paste(im, (x, y + band)); dr.rectangle([x, y, x + tw - 1, y + band - 1], fill=(70, 70, 70) if k.startswith('bench') else (20, 20, 20))
        dr.text((x + 24, y + 14), SC[k][0], fill='white', font=fb)
        t = '%.2f / 5' % tot(k); dr.text((x + tw - 24 - dr.textlength(t, font=fb), y + 14), t, fill='white', font=fb)
        dr.text((x + 24, y + 76), SC[k][1], fill=(225, 225, 225), font=fr)
        dr.line([x + tw - 1, y, x + tw - 1, y + th + band], fill=(200, 200, 200), width=2)
    sheet.save(O + 'freerein-sheet@2x.png'); print({k: tot(k) for k in order}, sheet.size)
