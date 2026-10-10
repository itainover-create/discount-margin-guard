// Rain on the windshield (cockpit view): beads that grow, slide down at low
// speed and are blown up and outward by the airflow at speed; jets sweep
// them with wipers. A screen-space overlay drawn on a 2D canvas.
export class Windshield {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.drops = [];
    this.spawn = 0;
    this.wiper = { a: 0, dir: 1, on: false };
    this.visible = false;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.c.width = Math.round(innerWidth * dpr);
    this.c.height = Math.round(innerHeight * dpr);
    this.dpr = dpr;
  }

  clear() { this.drops.length = 0; this.g.clearRect(0, 0, this.c.width, this.c.height); }

  // active: cockpit view; rain: 0..2; kt: airspeed; wipers: jet with wipers on
  update(dt, active, rain, kt, wipers) {
    if (!active || (!rain && !this.drops.length)) {
      if (this.visible) { this.clear(); this.c.style.display = 'none'; this.visible = false; }
      return;
    }
    if (!this.visible) { this.resize(); this.c.style.display = 'block'; this.visible = true; }
    const W = this.c.width, H = this.c.height, s = this.dpr || 1;
    const cx = W / 2;
    // new drops: more when moving through the rain
    this.spawn += dt * rain * (60 + kt * 1.6);
    while (this.spawn > 1 && this.drops.length < 700) {
      this.spawn -= 1;
      this.drops.push({ x: Math.random() * W, y: Math.random() * H * 0.85, r: (1.2 + Math.random() * 3.2) * s, age: 0 });
    }
    if (this.drops.length >= 700) this.spawn = 0;
    // motion
    const fast = Math.max(0, Math.min(1, (kt - 25) / 60));
    for (const d of this.drops) {
      d.age += dt;
      if (fast > 0) {
        const k = (kt * 1.4 + 30) * s * fast * (d.r / (3 * s));
        d.vx = ((d.x - cx) / cx) * k * 0.6;
        d.vy = -k;
      } else {
        d.vx = 0;
        d.vy = d.r > 3.2 * s ? 25 * s : 0;  // big beads run down when parked
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.r < 4.2 * s) d.r += dt * 0.15 * s * rain;  // beads merge and grow
    }
    // wipers: arm pivoting at the bottom, sweeping ±55 degrees
    const wp = this.wiper;
    wp.on = !!wipers && rain > 0;
    if (wp.on) {
      wp.a += wp.dir * dt * 2.6;
      if (wp.a > 1) { wp.a = 1; wp.dir = -1; }
      if (wp.a < -1) { wp.a = -1; wp.dir = 1; }
    }
    const piv = { x: W * 0.5, y: H * 1.05 }, len = H * 0.9, ang = -Math.PI / 2 + wp.a * 0.95;
    const ax = Math.cos(ang), ay = Math.sin(ang);
    this.drops = this.drops.filter((d) => {
      if (d.y < -10 || d.x < -10 || d.x > W + 10 || d.y > H + 10 || d.age > 25) return false;
      if (wp.on) {
        const rx = d.x - piv.x, ry = d.y - piv.y;
        const along = rx * ax + ry * ay, perp = Math.abs(rx * -ay + ry * ax);
        if (along > 0 && along < len && perp < 16 * s) return false;
      }
      return true;
    });
    // draw
    const g = this.g;
    g.clearRect(0, 0, W, H);
    for (const d of this.drops) {
      if (fast > 0.2) {
        g.strokeStyle = 'rgba(205,220,235,0.16)';
        g.lineWidth = d.r * 0.7;
        g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - d.vx * 0.06, d.y - d.vy * 0.06); g.stroke();
      }
      g.fillStyle = 'rgba(190,205,220,0.20)';
      g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.38)';
      g.beginPath(); g.arc(d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.32, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,30,40,0.18)'; g.lineWidth = 1;
      g.beginPath(); g.arc(d.x, d.y, d.r, 0.2, Math.PI - 0.2); g.stroke();
    }
    if (wp.on) {
      g.strokeStyle = 'rgba(15,17,20,0.85)'; g.lineWidth = 7 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(piv.x, piv.y); g.lineTo(piv.x + ax * len, piv.y + ay * len); g.stroke();
    }
  }
}
