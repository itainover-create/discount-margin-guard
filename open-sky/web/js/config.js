// Graphics quality presets (also used by the settings menu).
export const QUALITY = {
  low: { pixelRatio: 0.75, terrain: 0.7, view: 45000, near: 1.4, mid: 3.5, far: 10, trees: 600, clouds: 0.5, traffic: 6, cars: 60, aa: false, shadows: 0 },
  medium: { pixelRatio: 1.0, terrain: 0.9, view: 70000, near: 2.0, mid: 5, far: 16, trees: 1200, clouds: 0.75, traffic: 10, cars: 120, aa: true, shadows: 1024 },
  high: { pixelRatio: 1.0, terrain: 1.1, view: 95000, near: 2.6, mid: 6.5, far: 24, trees: 1800, clouds: 1, traffic: 14, cars: 180, aa: true, shadows: 2048 },
  ultra: { pixelRatio: 1.5, terrain: 1.35, view: 130000, near: 3.2, mid: 8, far: 32, trees: 2500, clouds: 1.2, traffic: 20, cars: 220, aa: true, shadows: 2048 },
};
