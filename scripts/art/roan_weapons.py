"""로안 무기별 스프라이트 생성: 기존 roan.png 에서 검을 지운 몸체에 무기 픽셀 아트를 쥐어 준다.
python3 scripts/art/roan_weapons.py  → src/assets/roan/*.png, src/assets/roan-weapons.png
"""
from PIL import Image
import os, sys

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'src/assets/roan.png')
OUT = os.path.join(ROOT, 'src/assets/roan')
os.makedirs(OUT, exist_ok=True)

PAL = {
    'o': (16, 20, 34), 'w': (237, 241, 223), 'l': (200, 217, 223), 's': (157, 179, 197), 'd': (98, 120, 141),
    'k': (67, 89, 115), 'g': (255, 210, 122), 'G': (214, 150, 70), 'b': (128, 70, 37), 'B': (88, 48, 30),
    'r': (233, 96, 85), 'R': (168, 63, 76), 'p': (199, 140, 255), 'P': (130, 84, 190), 'c': (120, 220, 255),
}

class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]
        self.grip = (w // 2, h - 3)  # 손잡이 중심
    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h: self.px[y][x] = c
    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.set(x, y, c)
    def outlined(self):
        out = [row[:] for row in self.px]
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is None and any(
                    0 <= x + dx < self.w and 0 <= y + dy < self.h and self.px[y + dy][x + dx] not in (None, 'o')
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = 'o'
        return out
    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for y, row in enumerate(self.outlined()):
            for x, c in enumerate(row):
                if c: im.putpixel((x, y), PAL[c] + (255,))
        return im

def blade(g, cx, top, length, width, edge='l', core='w', tip=True):
    half = width // 2
    for i in range(length):
        y = top + i
        if tip and i == 0:
            g.set(cx, y, core); continue
        for dx in range(-half, half + 1):
            g.set(cx + dx, y, core if dx == 0 else edge)
        if width >= 5:
            g.set(cx - half, y, 's'); g.set(cx + half, y, 's')

def hilt(g, cx, y, guard, grip, pommel='g', guard_c='g', grip_c='b'):
    g.rect(cx - guard // 2, y, cx + guard // 2, y, guard_c)
    for i in range(grip): g.set(cx, y + 1 + i, grip_c)
    g.set(cx, y + 1 + grip, pommel)
    g.grip = (cx, y + 1 + grip // 2)

def shaft(g, cx, y0, y1, c='b', dark='B'):
    for y in range(y0, y1 + 1): g.set(cx, y, c if y % 3 else dark)

def make(design):
    if design == 'sword':
        g = Grid(9, 26); blade(g, 4, 1, 16, 3); hilt(g, 4, 17, 7, 4)
    elif design == 'onehand':
        g = Grid(9, 25); blade(g, 4, 1, 15, 3, edge='c'); hilt(g, 4, 16, 5, 4, pommel='r'); g.set(4, 16, 'r')
    elif design == 'greatsword':
        g = Grid(11, 33); blade(g, 5, 1, 21, 5); hilt(g, 5, 22, 11, 6, guard_c='G'); g.set(5, 22, 'r')
    elif design == 'rapier':
        g = Grid(9, 27); blade(g, 4, 1, 18, 1, core='w')
        g.rect(2, 19, 6, 19, 'g'); g.set(2, 20, 'g'); g.set(6, 20, 'g'); g.rect(3, 21, 5, 21, 'G')
        for i in range(3): g.set(4, 20 + i, 'b')
        g.set(4, 23, 'g'); g.grip = (4, 21)
    elif design == 'dagger':
        g = Grid(7, 15); blade(g, 3, 1, 8, 3); hilt(g, 3, 9, 5, 3)
    elif design == 'stiletto':
        g = Grid(7, 16); blade(g, 3, 1, 9, 3, edge='p'); hilt(g, 3, 10, 5, 3, pommel='p', guard_c='P'); g.set(3, 10, 'r')
    elif design == 'scimitar':
        g = Grid(9, 18)
        for i in range(11):
            y = 1 + i; off = (10 - i) // 4
            for dx in (-1, 0, 1): g.set(4 + off + dx, y, 'w' if dx == 0 else 'l')
        g.set(4 + 2, 1, 'w'); hilt(g, 4, 12, 5, 3, guard_c='G')
    elif design == 'twinblades':
        g = Grid(7, 15); blade(g, 3, 1, 8, 3, edge='r'); hilt(g, 3, 9, 5, 3, pommel='r', guard_c='R')
    elif design == 'mace':
        g = Grid(9, 21); g.rect(2, 1, 6, 5, 's'); g.rect(3, 0, 5, 6, 's'); g.rect(3, 2, 5, 4, 'l'); g.set(4, 3, 'w')
        shaft(g, 4, 7, 18); g.set(4, 19, 'g'); g.grip = (4, 16)
    elif design == 'warmace':
        g = Grid(11, 22)
        for x in (1, 9): g.rect(x, 2, x, 6, 'd')
        g.rect(2, 1, 8, 7, 's'); g.rect(4, 0, 6, 8, 'l'); g.rect(2, 4, 8, 4, 'g')
        shaft(g, 5, 9, 19, c='k', dark='d'); g.set(5, 20, 'g'); g.grip = (5, 17)
    elif design == 'morningstar':
        g = Grid(11, 22); g.rect(2, 2, 8, 8, 's'); g.rect(3, 1, 7, 9, 's'); g.rect(1, 3, 9, 7, 's'); g.rect(3, 3, 6, 6, 'l')
        for x, y in ((5, 0), (0, 5), (10, 5), (1, 1), (9, 1), (5, 10)): g.set(x, y, 'w')
        shaft(g, 5, 11, 19); g.set(5, 20, 'g'); g.grip = (5, 17)
    elif design == 'flail':
        g = Grid(11, 22); g.rect(1, 1, 5, 5, 's'); g.rect(2, 0, 4, 6, 's'); g.rect(2, 2, 3, 3, 'l')
        for x, y in ((3, -1), (0, 3), (6, 3)): g.set(x, y + 0 if y >= 0 else 0, 'w')
        for i, (x, y) in enumerate(((4, 7), (5, 8), (6, 9), (6, 10), (7, 11))): g.set(x, y, 'd' if i % 2 else 'k')
        shaft(g, 7, 12, 19); g.set(7, 20, 'g'); g.grip = (7, 17)
    elif design == 'maul':
        g = Grid(13, 30); g.rect(1, 1, 11, 7, 's'); g.rect(2, 2, 10, 6, 'l'); g.rect(1, 4, 11, 4, 'g'); g.rect(5, 0, 7, 8, 'd')
        shaft(g, 6, 9, 27); g.set(6, 28, 'g'); g.grip = (6, 24)
    elif design == 'waraxe':
        g = Grid(11, 24); shaft(g, 4, 1, 21); g.set(4, 22, 'g')
        g.rect(5, 2, 7, 8, 's'); g.rect(8, 1, 9, 9, 'l'); g.set(10, 2, 'w'); g.rect(10, 3, 10, 7, 'w'); g.set(10, 8, 'w')
        g.set(3, 3, 'd'); g.set(3, 4, 'd'); g.grip = (4, 18)
    elif design == 'greataxe':
        g = Grid(15, 30); shaft(g, 7, 1, 27); g.set(7, 28, 'g')
        for side in (-1, 1):
            for i in range(4):
                h0, h1 = 2 - (i >= 2) * 1, 11 + (i >= 2) * 1
                x = 7 + side * (1 + i)
                g.rect(x, h0, x, h1, 'w' if i == 3 else 'l' if i == 2 else 's')
            g.set(7 + side * 5, 1, 'w'); g.set(7 + side * 5, 13, 'w'); g.rect(7 + side * 5, 2, 7 + side * 5, 12, 'w')
        g.set(7, 0, 'g'); g.grip = (7, 24)
    elif design == 'halberd':
        g = Grid(11, 36); shaft(g, 5, 7, 33); g.set(5, 34, 'g')
        for i in range(6): g.set(5, i + 1, 'w' if i < 5 else 'l'); g.set(4, 3 + i // 2, 'l') if i > 1 else None
        g.rect(6, 8, 8, 13, 's'); g.rect(9, 7, 9, 14, 'w'); g.rect(3, 9, 4, 10, 'd'); g.set(2, 11, 'd'); g.grip = (5, 29)
    elif design == 'throwingaxe':
        g = Grid(9, 15); shaft(g, 3, 1, 12); g.set(3, 13, 'g'); g.rect(4, 1, 5, 5, 's'); g.rect(6, 0, 6, 6, 'w'); g.grip = (3, 10)
    else:
        raise ValueError(design)
    return g

def sheet_without_sword(src):
    """기존 시트에서 검을 지운 몸체 (프레임 0 동쪽, 1 남쪽, 2 북쪽)."""
    im = src.copy()
    px = im.load()
    def clear(x0, y0, x1, y1, keep=None):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if keep and keep(x, y): continue
                px[x, y] = (0, 0, 0, 0)
    # 동쪽: 몸 밖으로 나온 칼날과 가드
    clear(29, 21, 39, 29)
    for y in range(21, 30):
        for x in range(23, 29):
            c = px[x, y][:3]
            if c == (255, 210, 122): px[x, y] = PAL['o'] + (255,) if x >= 27 else PAL['d'] + (255,)
            if c == (128, 70, 37): px[x, y] = PAL['d'] + (255,)
    # 남쪽: 오른쪽 칼날·가드 (손은 남김)
    clear(40 + 30, 0, 40 + 39, 23)
    for y in range(21, 25):
        for x in range(40 + 27, 40 + 39):
            c = px[x, y][:3]
            if c in ((255, 210, 122), (169, 109, 57), (237, 241, 223)): px[x, y] = (0, 0, 0, 0) if x >= 40 + 35 else PAL['d'] + (255,)
    # 북쪽: 등에 멘 검 → 가죽 끈
    for y in range(40):
        for x in range(80, 120):
            if px[x, y][:3] == (241, 239, 225): px[x, y] = (169, 109, 57, 255)
            if px[x, y][:3] == (105, 127, 147) and 15 <= y <= 18 and 96 <= x <= 102: pass
    return im

HANDS = {0: (25, 25), 1: (31, 25), 2: (17, 17)}
OFF_HAND = (7, 24)

def paste(dst, weapon, frame, hand, rotate=0, flip=False):
    w = weapon
    gx, gy = HANDS[frame] if hand is None else hand
    img = w.image()
    cx, cy = w.grip
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT); cx = w.w - 1 - cx
    if rotate:
        # 손잡이 중심을 기준으로 회전
        big = Image.new('RGBA', (64, 64), (0, 0, 0, 0)); big.paste(img, (32 - cx, 32 - cy), img)
        big = big.rotate(rotate, resample=Image.NEAREST, center=(32, 32))
        img, cx, cy = big, 32, 32
    layer = Image.new('RGBA', (40, 40), (0, 0, 0, 0))
    layer.paste(img, (gx - cx, gy - cy), img)
    frame_img = dst.crop((frame * 40, 0, frame * 40 + 40, 40))
    return layer, frame_img

def compose(body, src, design):
    out = Image.new('RGBA', body.size, (0, 0, 0, 0))
    weapon = make(design)
    twin = design in ('twinblades', 'throwingaxe')
    for frame in range(3):
        base = body.crop((frame * 40, 0, frame * 40 + 40, 40))
        canvas = Image.new('RGBA', (40, 40), (0, 0, 0, 0))
        if frame == 2:
            # 북쪽: 등 뒤 대각선
            layer, _ = paste(body, weapon, 2, (20, 21), rotate=40)
            canvas.alpha_composite(base); canvas.alpha_composite(layer)
            if twin:
                layer2, _ = paste(body, weapon, 2, (22, 22), rotate=-40, flip=True); canvas.alpha_composite(layer2)
        else:
            # 동쪽: 짧은 무기는 앞으로 겨누고, 긴 무기는 프레임에 들어오도록 비스듬히 든다
            rot = (-90 if weapon.h <= 18 else -50) if frame == 0 else 0
            layer, _ = paste(body, weapon, frame, None, rotate=rot)
            canvas.alpha_composite(layer)
            canvas.alpha_composite(base)
            # 손을 무기 위에 다시 그린다
            hx, hy = HANDS[frame]
            hand = base.crop((hx - 2, hy - 2, hx + 3, hy + 3))
            canvas.alpha_composite(hand, (hx - 2, hy - 2))
            if twin and frame == 1:
                l2, _ = paste(body, weapon, 1, OFF_HAND, flip=True)
                c2 = Image.new('RGBA', (40, 40), (0, 0, 0, 0)); c2.alpha_composite(l2); c2.alpha_composite(canvas); canvas = c2
                hand2 = base.crop((OFF_HAND[0] - 2, OFF_HAND[1] - 2, OFF_HAND[0] + 3, OFF_HAND[1] + 3))
                canvas.alpha_composite(hand2, (OFF_HAND[0] - 2, OFF_HAND[1] - 2))
        out.paste(canvas, (frame * 40, 0))
    return out

DESIGNS = ['dagger', 'mace', 'waraxe', 'onehand', 'greatsword', 'rapier', 'stiletto', 'scimitar', 'twinblades',
           'warmace', 'morningstar', 'flail', 'maul', 'greataxe', 'halberd', 'throwingaxe', 'sword']

def main():
    src = Image.open(SRC).convert('RGBA')
    body = sheet_without_sword(src)
    for d in DESIGNS:
        img = src.copy() if d == 'sword' else compose(body, src, d)
        img.save(os.path.join(OUT, f'{d}.png'))
    # 휘두르기 모션용 무기 이미지 (16x40, 손잡이 중심 = 프레임 아래쪽 기준점)
    icons = Image.new('RGBA', (16 * len(DESIGNS), 40), (0, 0, 0, 0))
    meta = []
    for i, d in enumerate(DESIGNS):
        w = make(d)
        img = w.image()
        ox = i * 16 + (16 - w.w) // 2
        oy = 40 - w.h
        icons.paste(img, (ox, oy), img)
        meta.append((d, (16 - w.w) // 2 + w.grip[0], oy + w.grip[1]))
    icons.save(os.path.join(ROOT, 'src/assets/roan-weapons.png'))
    print('designs', DESIGNS)
    print('grips', meta)

if __name__ == '__main__':
    main()
