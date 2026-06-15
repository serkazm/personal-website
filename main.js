const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
const todSlider = document.getElementById('tod');

let W = 0, H = 0;
let scrollRatio = 0;
let scrollPhase = 0;
let stars = [];

// Time-of-day palette stops. Each stop has sky top/mid/bottom colours,
// a wave tint, and a star alpha multiplier.
const TOD_STOPS = [
  { t: 0.00, top: [  2, 12, 27], mid: [  3, 48,107], bot: [  0,102,204], wave: [ 80,160,255], starA: 1.0 }, // midnight
  { t: 0.20, top: [ 20, 25, 60], mid: [ 70, 50,100], bot: [180,110,120], wave: [110,140,200], starA: 0.4 }, // pre-dawn
  { t: 0.30, top: [255,170,110], mid: [255,200,160], bot: [255,225,190], wave: [200,210,230], starA: 0.0 }, // sunrise
  { t: 0.50, top: [105,180,225], mid: [165,210,238], bot: [215,235,248], wave: [170,215,245], starA: 0.0 }, // noon
  { t: 0.70, top: [255,150, 90], mid: [255,135,110], bot: [255,200,140], wave: [215,180,180], starA: 0.0 }, // sunset
  { t: 0.80, top: [ 45, 30, 80], mid: [ 80, 55,115], bot: [130,100,140], wave: [110,140,200], starA: 0.5 }, // dusk
  { t: 1.00, top: [  2, 12, 27], mid: [  3, 48,107], bot: [  0,102,204], wave: [ 80,160,255], starA: 1.0 }, // midnight
];

function lerp(a, b, k) { return a + (b - a) * k; }
function lerpColor(c1, c2, k) {
  return [Math.round(lerp(c1[0], c2[0], k)), Math.round(lerp(c1[1], c2[1], k)), Math.round(lerp(c1[2], c2[2], k))];
}
function rgb(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

function paletteAt(t) {
  for (let i = 0; i < TOD_STOPS.length - 1; i++) {
    const a = TOD_STOPS[i], b = TOD_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / (b.t - a.t);
      return {
        top: lerpColor(a.top, b.top, k),
        mid: lerpColor(a.mid, b.mid, k),
        bot: lerpColor(a.bot, b.bot, k),
        wave: lerpColor(a.wave, b.wave, k),
        starA: lerp(a.starA, b.starA, k),
      };
    }
  }
  return TOD_STOPS[0];
}

function randomStars() {
  stars = Array.from({ length: 7 }, () => ({
    x: Math.random(),
    y: Math.random() * 0.16,
    r: Math.random() * 4 + 5,
    twinkleOffset: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.4 + Math.random() * 0.6,
  }));
}

function drawStar(x, y, outerR, alpha) {
  const innerR = outerR * 0.4;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = `rgba(200, 225, 255, ${alpha})`;
  ctx.fill();
}

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  randomStars();
}

window.addEventListener('resize', resize);
window.addEventListener('scroll', () => {
  const maxScroll = document.body.scrollHeight - window.innerHeight;
  scrollRatio = maxScroll > 0 ? window.scrollY / maxScroll : 0;
});

resize();

const layers = [
  { amp: 28, freq: 0.007, speed: 0.10, phase: 0.0, y: 0.22, alpha: 0.14 },
  { amp: 18, freq: 0.011, speed: 0.17, phase: 2.1, y: 0.40, alpha: 0.12 },
  { amp: 32, freq: 0.005, speed: 0.07, phase: 4.5, y: 0.55, alpha: 0.10 },
  { amp: 14, freq: 0.016, speed: 0.25, phase: 1.3, y: 0.70, alpha: 0.09 },
  { amp: 22, freq: 0.009, speed: 0.13, phase: 3.7, y: 0.82, alpha: 0.07 },
  { amp: 10, freq: 0.020, speed: 0.33, phase: 0.8, y: 0.92, alpha: 0.06 },
];

const BOAT_DELAY = 1;
const BOAT_CROSSING = 120;
let boatLayer = layers[1];      // wave layer the boat currently rides on
let boatBaseTime = BOAT_DELAY;  // time at which boat is at its "start" position (-30)
let boatScrollBase = null;
let boatPos = null;             // current boat {x, y} in viewport coords, or null
let ahojUntil = 0;              // timestamp (seconds) until which to show "ahoj!"

let dragState = null;
let suppressClick = false;

function nearestLayer(y) {
  let best = layers[0], bestDist = Infinity;
  for (const layer of layers) {
    const d = Math.abs(H * layer.y - y);
    if (d < bestDist) { bestDist = d; best = layer; }
  }
  return best;
}

window.addEventListener('mousedown', (e) => {
  if (!boatPos) return;
  const dx = e.clientX - boatPos.x;
  const dy = e.clientY - boatPos.y;
  if (dx * dx + dy * dy < 30 * 30) {
    dragState = { x: e.clientX, y: e.clientY, moved: false };
    e.preventDefault();
  }
});

window.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  dragState.x = e.clientX;
  dragState.y = e.clientY;
  if (!dragState.moved && boatPos &&
      Math.hypot(e.clientX - boatPos.x, e.clientY - boatPos.y) > 5) {
    dragState.moved = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (!dragState) return;
  if (dragState.moved) {
    // Snap to the nearest wave layer at the release point and resume drifting from there
    boatLayer = nearestLayer(e.clientY);
    boatScrollBase = scrollRatio;
    const tNow = performance.now() / 1000;
    boatBaseTime = tNow - (e.clientX + 30) * BOAT_CROSSING / (W + 60);
    suppressClick = true;
  }
  dragState = null;
});

window.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  if (!boatPos) return;
  const dx = e.clientX - boatPos.x;
  const dy = e.clientY - boatPos.y;
  if (dx * dx + dy * dy < 30 * 30) {
    ahojUntil = performance.now() / 1000 + 1.6;
  }
});

function waveY(x, t, layer) {
  return H * layer.y
    + Math.sin(x * layer.freq + t * layer.speed + layer.phase + scrollPhase) * layer.amp
    + Math.sin(x * layer.freq * 1.7 + t * layer.speed * 0.6 + layer.phase) * (layer.amp * 0.35);
}

function drawBoat(x, y, t, layer) {
  const dy = waveY(x + 2, t, layer) - waveY(x - 2, t, layer);
  const tilt = Math.atan2(dy, 4);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // Sail — top of mast, base of mast, stern end of deck
  ctx.beginPath();
  ctx.moveTo(0,  -21);  // top of mast
  ctx.lineTo(0,   -1);  // base of mast (middle of vessel)
  ctx.lineTo(11,  -1);  // stern end of vessel
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();

  // Mast
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.lineTo(0, -21);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Hull — flat deck top, rounded bottom
  ctx.beginPath();
  ctx.moveTo(-16, -1);
  ctx.lineTo(16, -1);
  ctx.bezierCurveTo(15, 4, 8, 7, 0, 7);
  ctx.bezierCurveTo(-8, 7, -15, 4, -16, -1);
  ctx.closePath();
  ctx.fillStyle = '#cc2200';
  ctx.fill();

  ctx.restore();
}


function draw(timestamp) {
  const t = timestamp * 0.001;

  scrollPhase = scrollRatio * Math.PI * 6;

  const tod = todSlider ? (parseFloat(todSlider.value) / 1000) : 0;
  const pal = paletteAt(tod);

  // Sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, rgb(pal.top, 1));
  grad.addColorStop(0.5, rgb(pal.mid, 1));
  grad.addColorStop(1, rgb(pal.bot, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars (fade out around dawn / back in at dusk)
  if (pal.starA > 0.01) {
    for (const star of stars) {
      const twinkle = 0.4 + 0.5 * Math.sin(t * star.twinkleSpeed + star.twinkleOffset);
      drawStar(star.x * W, star.y * H, star.r, twinkle * pal.starA);
    }
  }

  // Sun — visible from sunrise (0.25) through sunset (0.75), arcing across the sky
  if (tod > 0.25 && tod < 0.75) {
    const k = (tod - 0.25) / 0.5;           // 0 at sunrise, 1 at sunset
    const sunX = lerp(W * 0.1, W * 0.9, k);
    const sunY = H * 0.55 - Math.sin(k * Math.PI) * H * 0.40;
    const horizonGlow = Math.sin(k * Math.PI);   // 0 at horizon, 1 at noon
    const sunR = 28 + horizonGlow * 10;
    // Soft halo
    const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, sunR * 4);
    halo.addColorStop(0, `rgba(255, 240, 200, ${0.45 + horizonGlow * 0.25})`);
    halo.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 4, 0, Math.PI * 2);
    ctx.fill();
    // Sun disc — warmer near horizon, brighter at noon
    const sunColor = horizonGlow > 0.6
      ? [255, 248, 220]
      : [255, lerp(170, 230, horizonGlow), lerp(110, 180, horizonGlow)];
    ctx.fillStyle = rgb(sunColor, 1);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Waves — tinted by current palette
  for (const layer of layers) {
    const baseY = H * layer.y;
    ctx.beginPath();
    ctx.moveTo(0, baseY);

    for (let x = 0; x <= W; x += 3) {
      const y = baseY
        + Math.sin(x * layer.freq + t * layer.speed + layer.phase + scrollPhase) * layer.amp
        + Math.sin(x * layer.freq * 1.7 + t * layer.speed * 0.6 + layer.phase) * (layer.amp * 0.35);
      ctx.lineTo(x, y);
    }

    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fillStyle = rgb(pal.wave, layer.alpha);
    ctx.fill();
  }

  // Sailboat — enters from the left 1s after load; scroll pushes it; can be dragged to another wave
  boatPos = null;
  if (t > BOAT_DELAY) {
    let boatX, boatY, currentLayer;
    if (dragState && dragState.moved) {
      boatX = dragState.x;
      currentLayer = nearestLayer(dragState.y);
      boatY = waveY(boatX, t, currentLayer);
    } else {
      if (boatScrollBase === null) boatScrollBase = scrollRatio;
      const progress = (t - boatBaseTime) / BOAT_CROSSING;
      const scrollDelta = scrollRatio - boatScrollBase;
      currentLayer = boatLayer;
      boatX = -30 + progress * (W + 60) + scrollDelta * W * 0.9;
      boatY = waveY(boatX, t, currentLayer);
    }
    if (boatX < W + 30 && boatX > -40) {
      drawBoat(boatX, boatY, t, currentLayer);
      boatPos = { x: boatX, y: boatY };

      if (t < ahojUntil) {
        const remaining = ahojUntil - t;
        const alpha = Math.min(1, remaining * 1.5);
        ctx.save();
        ctx.font = 'italic 14px "Comic Sans MS", "Bradley Hand", cursive';
        ctx.fillStyle = `rgba(255, 245, 200, ${alpha})`;
        ctx.textAlign = 'center';
        ctx.fillText('ahoy!', boatX + 14, boatY - 30);
        ctx.restore();
      }
    }
  }

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
