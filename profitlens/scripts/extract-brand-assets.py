import sys
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
crops = {
 'symbol': (150, 285, 600, 650),
 'wordmark': (80, 655, 660, 750),
 'slogan': (60, 780, 680, 815),
 'signature': (95, 825, 620, 955),
 'lockup': (60, 285, 680, 750),
}
S = 3
for name, box in crops.items():
    c = im.crop(box).resize(((box[2]-box[0])*S, (box[3]-box[1])*S), Image.LANCZOS)
    px = c.load(); w, h = c.size
    o = Image.new('RGBA', (w, h)); op = o.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            gold = (r - b)            # background is neutral grey-navy, ink is warm
            lum=(r*3+g*6+b)/10; a = max(0.0, min(1.0, max((gold - 10) / 28.0, (lum - 88) / 45.0)))
            op[x, y] = (r, g, b, int(a * 255))
    o.save(f'{out}/{name}.png')
    c.save(f'{out}/{name}_raw.png')
    print(name, o.size)
