"""Generates the ORION brand emblem (vector redraw of the ORION poster mark):
a gold serif "A" with an orbit swoosh that passes behind and in front of the
letter, and a sparkle star where the swoosh begins.

Writes:
  web/assets/orion-emblem.svg  emblem, transparent background (ids used by the intro animation)
  web/assets/orion-mark.svg    emblem on a navy tile (favicon, small badges)
"""
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "web", "assets")

W, H = 400, 360
CX, CY = 205.0, 214.0          # orbit centre
RX, RY = 172.0, 54.0           # orbit radii
ROT = math.radians(-13.0)      # tilt: rising to the right (SVG y is down)
T_START = math.pi + 0.34       # left, slightly above centre: the sparkle
T_END = -math.pi + 1.18        # upper left, behind the A
MAX_W = 11.0                   # swoosh thickness at its widest


def orbit(t):
    x, y = RX * math.cos(t), RY * math.sin(t)
    c, s = math.cos(ROT), math.sin(ROT)
    return CX + x * c - y * s, CY + x * s + y * c


def tangent(t, h=1e-4):
    a, b = orbit(t - h), orbit(t + h)
    dx, dy = b[0] - a[0], b[1] - a[1]
    l = math.hypot(dx, dy)
    return dx / l, dy / l


def width(u):
    # thin at both ends, widest at ~40% (front, lower right)
    return MAX_W * max(0.0, math.sin(math.pi * u)) ** 0.75 * (0.75 + 0.25 * math.sin(math.pi * u * 0.8))


def ring_polys(n=360):
    """Tapered swoosh split into parts behind (sin t < 0) and in front of the A."""
    ts = [T_START + (T_END - T_START) * i / n for i in range(n + 1)]
    parts, cur, cur_front = [], [], None
    for i, t in enumerate(ts):
        front = math.sin(t) >= 0
        if cur_front is None:
            cur_front = front
        if front != cur_front:
            parts.append((cur_front, cur))
            cur = [cur[-1]]
            cur_front = front
        cur.append((t, i / n))
    parts.append((cur_front, cur))
    out = []
    for front, pts in parts:
        left, right = [], []
        for t, u in pts:
            x, y = orbit(t)
            tx, ty = tangent(t)
            nx, ny = -ty, tx
            w = width(u) / 2
            left.append((x + nx * w, y + ny * w))
            right.append((x - nx * w, y - ny * w))
        poly = left + right[::-1]
        d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in poly) + " Z"
        out.append((front, d))
    return out


def centerline():
    n = 240
    pts = [orbit(T_START + (T_END - T_START) * i / n) for i in range(n + 1)]
    return "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in pts)


def sparkle(x, y, r):
    k = r * 0.07 if r > 15 else r * 0.16
    return (f"M{x:.1f},{y - r:.1f} Q{x + k:.1f},{y - k:.1f} {x + r:.1f},{y:.1f} "
            f"Q{x + k:.1f},{y + k:.1f} {x:.1f},{y + r:.1f} Q{x - k:.1f},{y + k:.1f} {x - r:.1f},{y:.1f} "
            f"Q{x - k:.1f},{y - k:.1f} {x:.1f},{y - r:.1f} Z")


DEFS = """
  <defs>
    <linearGradient id="og-light" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff3d1"/><stop offset="0.35" stop-color="#ecc985"/>
      <stop offset="0.75" stop-color="#c39352"/><stop offset="1" stop-color="#8f6331"/>
    </linearGradient>
    <linearGradient id="og-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d9b06c"/><stop offset="0.5" stop-color="#9c6e36"/><stop offset="1" stop-color="#5e3d1a"/>
    </linearGradient>
    <linearGradient id="og-ring" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e9c98b"/><stop offset="0.3" stop-color="#b98a4c"/>
      <stop offset="0.62" stop-color="#f6dca2"/><stop offset="1" stop-color="#9a6a33"/>
    </linearGradient>
    <radialGradient id="og-glow">
      <stop offset="0" stop-color="#fff8e4" stop-opacity="1"/><stop offset="0.25" stop-color="#ffd98a" stop-opacity="0.8"/>
      <stop offset="1" stop-color="#ffb84a" stop-opacity="0"/>
    </radialGradient>
    <filter id="og-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>"""


def letter_a():
    # apex at (206, 6); thick right leg, thin left leg, bracketed serif feet
    right_light = "M206,6 L297,318 L276,318 L197,40 Z"
    right_dark = "M206,6 L318,318 L297,318 Z"
    left_light = "M201,26 L92,318 L97,318 L204,32 Z"
    left_dark = "M204,32 L97,318 L103,318 L207,40 Z"
    foot_l = "M62,327 L128,327 L128,321 Q111,319 103,309 L91,309 Q83,319 62,321 Z"
    foot_r = "M246,327 L348,327 L348,321 Q327,319 318,307 L275,307 Q269,319 246,321 Z"
    return f"""
    <g id="orion-a" filter="url(#og-shadow)">
      <path d="{left_light}" fill="url(#og-light)"/><path d="{left_dark}" fill="url(#og-dark)"/>
      <path d="{right_light}" fill="url(#og-light)"/><path d="{right_dark}" fill="url(#og-dark)"/>
      <path d="{foot_l}" fill="url(#og-dark)"/><path d="{foot_r}" fill="url(#og-dark)"/>
    </g>"""


def emblem_body():
    parts = ring_polys()
    back = "".join(f'<path d="{d}"/>' for f, d in parts if not f)
    front = "".join(f'<path d="{d}"/>' for f, d in parts if f)
    sx, sy = orbit(T_START)
    return f"""
  <path id="orion-orbit-path" d="{centerline()}" fill="none" stroke="none"/>
  <g id="orion-ring-back" fill="url(#og-ring)" opacity="0.92">{back}</g>
  {letter_a()}
  <g id="orion-ring-front" fill="url(#og-ring)" filter="url(#og-shadow)">{front}</g>
  <g id="orion-sparkle-at" transform="translate({sx:.1f} {sy:.1f})"><g id="orion-sparkle">
    <circle r="17" fill="url(#og-glow)"/>
    <path d="{sparkle(0, 0, 30)}" fill="#fff6dc"/>
    <path d="{sparkle(0, 0, 10)}" fill="#ffffff" transform="rotate(45)"/>
  </g></g>"""


def main():
    os.makedirs(OUT, exist_ok=True)
    emblem = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="ORION">{DEFS}{emblem_body()}
</svg>
"""
    open(os.path.join(OUT, "orion-emblem.svg"), "w").write(emblem)
    mark = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -30 440 420" role="img" aria-label="ORION GAMES">{DEFS}
  <rect x="-20" y="-30" width="440" height="420" rx="70" fill="#0c1220"/>{emblem_body()}
</svg>
"""
    open(os.path.join(OUT, "orion-mark.svg"), "w").write(mark)
    print("wrote orion-emblem.svg, orion-mark.svg")


if __name__ == "__main__":
    main()
