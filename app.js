(function () {
  'use strict';

  const bgCanvas = document.getElementById('bg-canvas');
  const planetsCanvas = document.getElementById('planets-canvas');
  const coverCanvas = document.getElementById('cover-canvas');
  const bgCtx = bgCanvas.getContext('2d');
  const planetsCtx = planetsCanvas.getContext('2d');
  const coverCtx = coverCanvas.getContext('2d');
  const audio = document.getElementById('audio');
  const volumeSlider = document.getElementById('volume');
  const btnPlay = document.getElementById('btn-play');
  const btnSkip = document.getElementById('btn-skip');
  const btnStart = document.getElementById('btn-start');
  const startOverlay = document.getElementById('start-overlay');
  const trackTitle = document.getElementById('track-title');
  const trackArtist = document.getElementById('track-artist');
  const progressBar = document.getElementById('progress-bar');
  const audioError = document.getElementById('audio-error');

  let width = 0;
  let height = 0;
  let currentTrackIndex = 0;
  let isPlaying = false;
  let transitionState = 'idle';
  let transitionProgress = 0;
  const TRANSITION_DURATION = 2200;

  const stars = [];
  const STAR_COUNT = 900;
  const planets = [];
  let shootingStar = null;
  let lastShootingStarTime = 0;
  const SHOOTING_STAR_INTERVAL = 60000;
  const coverParticles = [];
  let coverTargetW = 0;
  let coverTargetH = 0;
  let coverOffsetX = 0;
  let coverOffsetY = 0;
  const COVER_SAMPLE_STEP = 4;
  let coverImage = null;
  let pendingCoverImage = null;
  let coverImageAlpha = 1;
  const imageCache = new Map();

  let themeBlend = 0;
  let themeTarget = 0;
  let targetThemeId = null;
  const oceanWaves = [];
  const WAVE_COUNT = 5;
  const THEME_BLEND_MS = 2800;

  function initOceanWaves() {
    oceanWaves.length = 0;
    for (let i = 0; i < WAVE_COUNT; i++) {
      oceanWaves.push({
        yRatio: 0.48 + i * 0.028,
        amplitude: 6 + i * 3,
        length: 0.004 + i * 0.0015,
        speed: 0.0008 + i * 0.0003,
        phase: i * 1.4,
        alpha: 0.12 + i * 0.06,
      });
    }
  }

  function setTrackTheme(track) {
    targetThemeId = (track.theme && track.theme.id) || null;
    themeTarget = targetThemeId ? 1 : 0;

    const themeBg = document.getElementById('theme-bg');
    if (themeBg) {
      const bg = track.theme && track.theme.background;
      themeBg.style.backgroundImage = bg ? `url("${bg}")` : '';
    }
  }

  function updateThemeBlend(dt) {
    const step = dt / THEME_BLEND_MS;
    if (themeBlend < themeTarget) {
      themeBlend = Math.min(themeTarget, themeBlend + step);
    } else if (themeBlend > themeTarget) {
      themeBlend = Math.max(themeTarget, themeBlend - step);
    }
    document.documentElement.style.setProperty('--theme-mix', themeBlend.toFixed(3));
    document.body.classList.toggle('theme-ocean', targetThemeId === 'ocean-evening' && themeBlend > 0.42);
    document.body.classList.toggle('theme-highway', targetThemeId === 'highway-supra' && themeBlend > 0.42);
    document.body.classList.toggle('theme-city', targetThemeId === 'city-night' && themeBlend > 0.42);
  }

  function canvasScale(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvasScale(bgCanvas, bgCtx);
    canvasScale(planetsCanvas, planetsCtx);
    canvasScale(coverCanvas, coverCtx);
    initStars();
    initPlanets();
    initOceanWaves();
    repositionCover();
  }

  function initStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      const roll = Math.random();
      let r = 255;
      let g = 255;
      let b = 255;
      if (roll < 0.12) {
        r = 180; g = 200; b = 255;
      } else if (roll < 0.2) {
        r = 255; g = 230; b = 180;
      } else if (roll < 0.28) {
        r = 200; g = 180; b = 255;
      }
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.6 + 0.3,
        r, g, b,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.002 + Math.random() * 0.004,
        baseAlpha: 0.25 + Math.random() * 0.65,
      });
    }
  }

  function initPlanets() {
    planets.length = 0;
    planets.push({
      xRatio: 0.12,
      yRatio: 0.72,
      radius: Math.min(width, height) * 0.09,
      colors: ['#3a2855', '#6b4a8a', '#1a1028'],
      ring: false,
      drift: 0.00015,
      phase: 0,
    });
    planets.push({
      xRatio: 0.28,
      yRatio: 0.38,
      radius: Math.min(width, height) * 0.055,
      colors: ['#2a3a4a', '#5a7a9a', '#152028'],
      ring: true,
      drift: 0.0002,
      phase: 1.5,
    });
    planets.push({
      xRatio: 0.06,
      yRatio: 0.28,
      radius: Math.min(width, height) * 0.035,
      colors: ['#4a3020', '#8a6040', '#201510'],
      ring: false,
      drift: 0.00025,
      phase: 3,
    });
  }

  function spawnShootingStar(time) {
    const startX = Math.random() * width * 0.85;
    const startY = Math.random() * height * 0.35;
    const angle = Math.PI * 0.2 + Math.random() * 0.25;
    const speed = 7 + Math.random() * 5;
    shootingStar = {
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      len: 80 + Math.random() * 60,
      born: time,
    };
    lastShootingStarTime = time;
  }

  function updateShootingStar(dt) {
    if (!shootingStar) return;
    shootingStar.x += shootingStar.vx * (dt / 16);
    shootingStar.y += shootingStar.vy * (dt / 16);
    shootingStar.life -= dt / 900;
    if (
      shootingStar.life <= 0 ||
      shootingStar.x > width + 100 ||
      shootingStar.y > height + 100
    ) {
      shootingStar = null;
    }
  }

  function repositionCover() {
    const coverSize = Math.min(width * 0.36, height * 0.58, 380);
    coverTargetW = coverSize;
    coverTargetH = coverSize;
    coverOffsetX = width * 0.68 - coverSize / 2;
    coverOffsetY = height * 0.5 - coverSize / 2;
  }

  async function loadImage(src) {
    const cached = imageCache.get(src);
    if (cached && cached.naturalWidth > 0) return cached;

    const loadFromUrl = (url) => new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = async () => {
        try { await el.decode(); } catch (_) {}
        if (el.naturalWidth > 0) resolve(el);
        else reject(new Error('empty image'));
      };
      el.onerror = reject;
      el.src = url;
    });

    try {
      const res = await fetch(src);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const img = await loadFromUrl(url);
        imageCache.set(src, img);
        return img;
      }
    } catch (_) {}

    try {
      const img = await loadFromUrl(src);
      imageCache.set(src, img);
      return img;
    } catch (_) {
      const placeholder = await createPlaceholderImage();
      imageCache.set(src, placeholder);
      return placeholder;
    }
  }

  function createPlaceholderImage() {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 300;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 300, 300);
    g.addColorStop(0, '#222');
    g.addColorStop(1, '#888');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 300, 300);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 252, 252);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('cover', 150, 155);
    const img = new Image();
    img.src = c.toDataURL();
    return new Promise((resolve) => {
      img.onload = () => resolve(img);
    });
  }

  function samplePixels(image) {
    const imgW = image.naturalWidth || image.width;
    const imgH = image.naturalHeight || image.height;
    if (!imgW || !imgH) throw new Error('invalid dimensions');

    const sampleW = 180;
    const aspect = imgW / imgH;
    let sampleH = Math.round(sampleW / aspect);
    if (!sampleH) sampleH = sampleW;

    const off = document.createElement('canvas');
    off.width = sampleW;
    off.height = sampleH;
    const octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(image, 0, 0, sampleW, sampleH);
    return octx.getImageData(0, 0, sampleW, sampleH);
  }

  function buildCoverParticles(image) {
    let imageData;
    try {
      imageData = samplePixels(image);
    } catch {
      return null;
    }

    const imgW = image.naturalWidth || image.width;
    const imgH = image.naturalHeight || image.height;
    const { width: pw, height: ph, data: pixels } = imageData;
    const aspect = imgW / imgH;
    let drawW = coverTargetW;
    let drawH = coverTargetH;
    if (aspect > 1) drawH = drawW / aspect;
    else drawW = drawH * aspect;

    const ox = coverOffsetX + (coverTargetW - drawW) / 2;
    const oy = coverOffsetY + (coverTargetH - drawH) / 2;
    const scaleX = drawW / pw;
    const scaleY = drawH / ph;

    const candidates = [];

    for (let sy = 0; sy < ph; sy += COVER_SAMPLE_STEP) {
      for (let sx = 0; sx < pw; sx += COVER_SAMPLE_STEP) {
        const i = (sy * pw + sx) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        if (a < 12) continue;

        const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        candidates.push({ sx, sy, r, g, b, brightness });
      }
    }

    if (!candidates.length) return null;

    let minB = 1;
    let maxB = 0;
    candidates.forEach((c) => {
      minB = Math.min(minB, c.brightness);
      maxB = Math.max(maxB, c.brightness);
    });
    const range = maxB - minB || 1;

    const newParticles = [];
    for (const c of candidates) {
      const norm = (c.brightness - minB) / range;
      if (norm < 0.04) continue;

      const boost = 1.0 + norm * 0.55;
      const cr = Math.min(255, Math.round(c.r * boost));
      const cg = Math.min(255, Math.round(c.g * boost));
      const cb = Math.min(255, Math.round(c.b * boost));
      const tx = ox + c.sx * scaleX;
      const ty = oy + c.sy * scaleY;

      newParticles.push({
        tx, ty, x: tx, y: ty,
        scatterX: tx, scatterY: ty,
        r: cr, g: cg, b: cb,
        size: 1.4 + norm * 3.2,
        phase: Math.random() * Math.PI * 2,
        fade: 1,
      });
    }

    return newParticles.length ? newParticles : null;
  }

  async function setCoverFromTrack(track, animateIn) {
    if (transitionState !== 'idle') {
      transitionState = 'idle';
      transitionProgress = 0;
      pendingNewParticles = null;
      pendingCoverImage = null;
      coverImageAlpha = 1;
    }

    const img = await loadImage(track.cover);
    const newParticles = buildCoverParticles(img);

    if (!newParticles) {
      coverParticles.length = 0;
      coverImage = img;
      coverImageAlpha = 1;
      if (location.protocol === 'file:') {
        showAudioError('Для обложки из точек запусти start.bat → http://localhost:8080');
      }
      return;
    }

    if (!animateIn || coverParticles.length === 0) {
      coverImage = img;
      coverImageAlpha = 1;
      pendingCoverImage = null;
      coverParticles.length = 0;
      coverParticles.push(...newParticles);
      return;
    }

    pendingCoverImage = img;
    startTransition(newParticles);
  }

  function scatterPoint(tx, ty) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 100 + Math.random() * Math.max(width, height) * 0.7;
    return { x: tx + Math.cos(angle) * dist, y: ty + Math.sin(angle) * dist };
  }

  let pendingNewParticles = null;

  function startTransition(newParticles) {
    transitionState = 'scatter';
    transitionProgress = 0;
    coverImageAlpha = 1;
    coverParticles.forEach((p) => {
      const s = scatterPoint(p.tx, p.ty);
      p.scatterX = s.x;
      p.scatterY = s.y;
    });
    pendingNewParticles = newParticles;
  }

  function updateTransition(dt) {
    if (transitionState === 'idle') return;
    transitionProgress += dt;

    if (transitionState === 'scatter') {
      const t = Math.min(transitionProgress / (TRANSITION_DURATION * 0.4), 1);
      const ease = 1 - Math.pow(1 - t, 3);
      coverImageAlpha = 1 - ease;

      coverParticles.forEach((p) => {
        p.x = p.tx + (p.scatterX - p.tx) * ease;
        p.y = p.ty + (p.scatterY - p.ty) * ease;
        p.fade = 1 - ease;
      });

      if (t >= 1) {
        transitionState = 'swap';
        transitionProgress = 0;
        coverParticles.length = 0;
        coverImage = pendingCoverImage;
        pendingCoverImage = null;
        coverImageAlpha = 0;

        if (pendingNewParticles) {
          pendingNewParticles.forEach((p) => {
            const s = scatterPoint(p.tx, p.ty);
            p.x = s.x;
            p.y = s.y;
            p.scatterX = s.x;
            p.scatterY = s.y;
            p.fade = 0;
          });
          coverParticles.push(...pendingNewParticles);
          pendingNewParticles = null;
        }
      }
    } else if (transitionState === 'swap') {
      const t = Math.min(transitionProgress / (TRANSITION_DURATION * 0.6), 1);
      const ease = 1 - Math.pow(1 - t, 4);
      coverImageAlpha = ease;

      coverParticles.forEach((p) => {
        p.x = p.scatterX + (p.tx - p.scatterX) * ease;
        p.y = p.scatterY + (p.ty - p.scatterY) * ease;
        p.fade = ease;
      });

      if (t >= 1) {
        transitionState = 'idle';
        transitionProgress = 0;
        coverImageAlpha = 1;
        coverParticles.forEach((p) => {
          p.x = p.tx;
          p.y = p.ty;
          p.fade = 1;
        });
      }
    }
  }

  function showAudioError(msg) {
    audioError.hidden = false;
    audioError.textContent = msg;
  }

  function clearAudioError() {
    audioError.hidden = true;
    audioError.textContent = '';
  }

  function waitForAudio(src) {
    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        clearAudioError();
        resolve();
      };
      const onFail = () => {
        cleanup();
        reject(new Error(src));
      };
      const cleanup = () => {
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('loadeddata', onReady);
        audio.removeEventListener('error', onFail);
      };

      audio.addEventListener('canplaythrough', onReady, { once: true });
      audio.addEventListener('loadeddata', onReady, { once: true });
      audio.addEventListener('error', onFail, { once: true });

      audio.src = src;
      audio.load();
    });
  }

  async function loadTrack(index, withTransition) {
    if (!PLAYLIST.length) {
      showAudioError('Плейлист пуст. Заполни playlist.js');
      return;
    }

    currentTrackIndex = ((index % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
    const track = PLAYLIST[currentTrackIndex];

    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    setTrackTheme(track);

    await setCoverFromTrack(track, withTransition);

    try {
      await waitForAudio(track.audio);
      if (isPlaying) await audio.play();
    } catch {
      const isFileProtocol = location.protocol === 'file:';
      showAudioError(
        isFileProtocol
          ? `Запусти start.bat и открой http://localhost:8080 — иначе обложка не соберётся из точек`
          : `Не удалось загрузить «${track.audio}». Проверь файл в папке music\\`
      );
    }
  }

  async function nextTrack() {
    await loadTrack(currentTrackIndex + 1, true);
    if (isPlaying) {
      try { await audio.play(); } catch (_) {}
    }
  }

  function drawDefaultSky(time, mix) {
    if (mix <= 0) return;

    const sky = bgCtx.createRadialGradient(
      width * 0.35, height * 0.4, 0,
      width * 0.5, height * 0.5, Math.max(width, height) * 0.85
    );
    sky.addColorStop(0, '#0a0a1a');
    sky.addColorStop(0.45, '#050510');
    sky.addColorStop(1, '#000005');
    bgCtx.fillStyle = sky;
    bgCtx.globalAlpha = mix;
    bgCtx.fillRect(0, 0, width, height);
    bgCtx.globalAlpha = 1;

    stars.forEach((s) => {
      const twinkle = 0.55 + Math.sin(time * s.twinkleSpeed + s.twinkle) * 0.45;
      const alpha = s.baseAlpha * twinkle * mix;
      bgCtx.beginPath();
      bgCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(${s.r}, ${s.g}, ${s.b}, ${alpha})`;
      bgCtx.fill();
    });

    if (mix > 0.5) {
      if (!shootingStar && time - lastShootingStarTime >= SHOOTING_STAR_INTERVAL) {
        spawnShootingStar(time);
      }
      if (!lastShootingStarTime) lastShootingStarTime = time;

      if (shootingStar) {
        const ss = shootingStar;
        const tailX = ss.x - (ss.vx / Math.hypot(ss.vx, ss.vy)) * ss.len;
        const tailY = ss.y - (ss.vy / Math.hypot(ss.vx, ss.vy)) * ss.len;
        const grad = bgCtx.createLinearGradient(tailX, tailY, ss.x, ss.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.6, `rgba(200,220,255,${ss.life * 0.5 * mix})`);
        grad.addColorStop(1, `rgba(255,255,255,${ss.life * 0.95 * mix})`);
        bgCtx.strokeStyle = grad;
        bgCtx.lineWidth = 2;
        bgCtx.lineCap = 'round';
        bgCtx.beginPath();
        bgCtx.moveTo(tailX, tailY);
        bgCtx.lineTo(ss.x, ss.y);
        bgCtx.stroke();
      }
    }
  }

  function drawOceanEveningBg(time, mix) {
    if (mix <= 0) return;

    const horizon = height * 0.48;
    const sandTop = height * 0.78;

    const sky = bgCtx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, `rgba(2, 4, 14, ${mix})`);
    sky.addColorStop(0.45, `rgba(6, 12, 28, ${mix})`);
    sky.addColorStop(0.85, `rgba(10, 20, 38, ${mix})`);
    sky.addColorStop(1, `rgba(14, 28, 48, ${mix})`);
    bgCtx.fillStyle = sky;
    bgCtx.fillRect(0, 0, width, horizon);

    for (let i = 0; i < 140; i++) {
      const sx = (Math.sin(i * 13.7 + 1.2) * 0.5 + 0.5) * width;
      const sy = (Math.cos(i * 9.3 + 0.5) * 0.5 + 0.5) * horizon * 0.92;
      const tw = 0.4 + Math.sin(time * 0.002 + i) * 0.3;
      const size = (i % 7 === 0) ? 1.4 : 0.7;
      bgCtx.beginPath();
      bgCtx.arc(sx, sy, size, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(220, 230, 255, ${tw * mix * 0.7})`;
      bgCtx.fill();
    }

    const moonX = width * 0.68;
    const moonY = height * 0.14;
    const moonGlow = bgCtx.createRadialGradient(moonX, moonY, 0, moonX, moonY, height * 0.18);
    moonGlow.addColorStop(0, `rgba(200, 210, 230, ${mix * 0.25})`);
    moonGlow.addColorStop(0.5, `rgba(140, 160, 200, ${mix * 0.08})`);
    moonGlow.addColorStop(1, 'transparent');
    bgCtx.fillStyle = moonGlow;
    bgCtx.fillRect(0, 0, width, horizon);

    bgCtx.beginPath();
    bgCtx.arc(moonX, moonY, height * 0.028, 0, Math.PI * 2);
    bgCtx.fillStyle = `rgba(230, 235, 245, ${mix * 0.9})`;
    bgCtx.fill();

    const oceanBase = bgCtx.createLinearGradient(0, horizon, 0, sandTop);
    oceanBase.addColorStop(0, `rgba(4, 18, 32, ${mix})`);
    oceanBase.addColorStop(0.45, `rgba(3, 14, 26, ${mix})`);
    oceanBase.addColorStop(1, `rgba(2, 10, 20, ${mix})`);
    bgCtx.fillStyle = oceanBase;
    bgCtx.fillRect(0, horizon, width, sandTop - horizon);

    const reflect = bgCtx.createLinearGradient(moonX - 30, horizon, moonX + 30, sandTop);
    reflect.addColorStop(0, `rgba(180, 200, 230, ${mix * 0.12})`);
    reflect.addColorStop(0.5, `rgba(100, 130, 170, ${mix * 0.05})`);
    reflect.addColorStop(1, 'transparent');
    bgCtx.fillStyle = reflect;
    bgCtx.fillRect(moonX - 40, horizon, 80, sandTop - horizon);

    oceanWaves.forEach((wave) => {
      const baseY = height * wave.yRatio;
      bgCtx.beginPath();
      bgCtx.moveTo(0, baseY);
      for (let x = 0; x <= width; x += 4) {
        const y = baseY + Math.sin(x * wave.length + time * wave.speed + wave.phase) * wave.amplitude;
        bgCtx.lineTo(x, y);
      }
      bgCtx.lineTo(width, sandTop);
      bgCtx.lineTo(0, sandTop);
      bgCtx.closePath();
      bgCtx.fillStyle = `rgba(30, 60, 85, ${wave.alpha * mix * 1.4})`;
      bgCtx.fill();
    });

    for (let x = 0; x < width; x += 5) {
      const foamY = horizon + Math.sin(x * 0.02 + time * 0.001) * 3;
      bgCtx.fillStyle = `rgba(120, 160, 190, ${mix * 0.06})`;
      bgCtx.fillRect(x, foamY, 4, 1);
    }

    const sand = bgCtx.createLinearGradient(0, sandTop, 0, height);
    sand.addColorStop(0, `rgba(18, 16, 14, ${mix})`);
    sand.addColorStop(0.5, `rgba(22, 20, 18, ${mix})`);
    sand.addColorStop(1, `rgba(14, 12, 10, ${mix})`);
    bgCtx.fillStyle = sand;
    bgCtx.fillRect(0, sandTop, width, height - sandTop);

    for (let i = 0; i < 120; i++) {
      const sx = (Math.sin(i * 7.3) * 0.5 + 0.5) * width;
      const sy = sandTop + (Math.cos(i * 5.1) * 0.5 + 0.5) * (height - sandTop);
      bgCtx.fillStyle = `rgba(60, 55, 50, ${mix * 0.2})`;
      bgCtx.fillRect(sx, sy, 1, 1);
    }
  }

  function drawBackground(time) {
    bgCtx.clearRect(0, 0, width, height);
    const customMix = themeBlend;
    const starMix = 1 - customMix;

    if (targetThemeId === 'ocean-evening') {
      drawOceanEveningBg(time, customMix);
    }
    drawDefaultSky(time, starMix);
  }

  function drawPlanets(time) {
    planetsCtx.clearRect(0, 0, width, height);
    const planetAlpha = 1 - themeBlend;
    if (planetAlpha <= 0.01) return;

    planetsCtx.globalAlpha = planetAlpha;

    planets.forEach((pl) => {
      const drift = Math.sin(time * pl.drift + pl.phase) * 8;
      const cx = width * pl.xRatio + drift;
      const cy = height * pl.yRatio + drift * 0.4;
      const r = pl.radius;

      const glow = planetsCtx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.2);
      glow.addColorStop(0, pl.colors[1] + '33');
      glow.addColorStop(1, 'transparent');
      planetsCtx.fillStyle = glow;
      planetsCtx.beginPath();
      planetsCtx.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
      planetsCtx.fill();

      const body = planetsCtx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      body.addColorStop(0, pl.colors[2]);
      body.addColorStop(0.45, pl.colors[0]);
      body.addColorStop(1, pl.colors[1]);
      planetsCtx.fillStyle = body;
      planetsCtx.beginPath();
      planetsCtx.arc(cx, cy, r, 0, Math.PI * 2);
      planetsCtx.fill();

      if (pl.ring) {
        planetsCtx.save();
        planetsCtx.translate(cx, cy);
        planetsCtx.rotate(-0.35);
        planetsCtx.strokeStyle = 'rgba(180, 160, 140, 0.35)';
        planetsCtx.lineWidth = r * 0.12;
        planetsCtx.beginPath();
        planetsCtx.ellipse(0, 0, r * 1.55, r * 0.38, 0, 0, Math.PI * 2);
        planetsCtx.stroke();
        planetsCtx.restore();
      }
    });

    planetsCtx.globalAlpha = 1;
  }

  function drawCover(time) {
    coverCtx.clearRect(0, 0, width, height);

    const aspect = coverImage ? (coverImage.naturalWidth || coverImage.width) / (coverImage.naturalHeight || coverImage.height) : 1;
    let drawW = coverTargetW;
    let drawH = coverTargetH;
    if (aspect > 1) drawH = drawW / aspect;
    else drawW = drawH * aspect;
    const ox = coverOffsetX + (coverTargetW - drawW) / 2;
    const oy = coverOffsetY + (coverTargetH - drawH) / 2;

    const cx = coverOffsetX + coverTargetW / 2;
    const cy = coverOffsetY + coverTargetH / 2;
    const pad = 24;

    const backdrop = coverCtx.createRadialGradient(cx, cy, 0, cx, cy, coverTargetW * 0.72);
    backdrop.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    backdrop.addColorStop(0.7, 'rgba(0, 0, 0, 0.35)');
    backdrop.addColorStop(1, 'rgba(0, 0, 0, 0)');
    coverCtx.fillStyle = backdrop;
    coverCtx.fillRect(
      coverOffsetX - pad,
      coverOffsetY - pad,
      coverTargetW + pad * 2,
      coverTargetH + pad * 2
    );

    if (coverImage && coverImageAlpha > 0.01) {
      coverCtx.globalAlpha = coverImageAlpha * 0.38;
      coverCtx.drawImage(coverImage, ox, oy, drawW, drawH);
      coverCtx.globalAlpha = 1;
    }

    if (!coverParticles.length) return;

    const holoShift = Math.sin(time * 0.0015) * 1.5;

    coverParticles.forEach((p) => {
      const floatX = Math.sin(time * 0.001 + p.phase) * 1.2 + holoShift * 0.3;
      const floatY = Math.cos(time * 0.0009 + p.phase) * 1;
      const px = p.x + floatX;
      const py = p.y + floatY;
      const fade = p.fade != null ? p.fade : 1;
      const lum = (p.r * 0.299 + p.g * 0.587 + p.b * 0.114) / 255;
      const alpha = (0.72 + lum * 0.28) * fade;

      if (alpha < 0.02) return;

      coverCtx.beginPath();
      coverCtx.arc(px, py, p.size, 0, Math.PI * 2);
      coverCtx.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${alpha})`;
      coverCtx.fill();

      coverCtx.beginPath();
      coverCtx.arc(px, py, p.size * 0.45, 0, Math.PI * 2);
      coverCtx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.2})`;
      coverCtx.fill();
    });

    const frameAlpha = transitionState === 'idle' ? 1 : coverImageAlpha;
    coverCtx.strokeStyle = `rgba(255, 255, 255, ${0.35 * frameAlpha})`;
    coverCtx.lineWidth = 1;
    coverCtx.strokeRect(
      coverOffsetX + holoShift * 0.5,
      coverOffsetY,
      coverTargetW,
      coverTargetH
    );

    const scanY = coverOffsetY + ((time * 0.05) % coverTargetH);
    coverCtx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    coverCtx.fillRect(coverOffsetX, scanY, coverTargetW, 2);
  }

  let lastTime = 0;
  function animate(time) {
    const dt = lastTime ? time - lastTime : 16;
    lastTime = time;

    updateTransition(dt);
    updateShootingStar(dt);
    updateThemeBlend(dt);
    drawBackground(time);
    drawPlanets(time);
    drawCover(time);

    if (audio.duration && !isNaN(audio.duration)) {
      progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    }

    requestAnimationFrame(animate);
  }

  async function startExperience() {
    startOverlay.classList.add('hidden');
    isPlaying = true;
    btnPlay.textContent = '⏸';
    audio.volume = volumeSlider.value / 100;
    await loadTrack(0, false);
  }

  volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value / 100;
  });

  btnPlay.addEventListener('click', async () => {
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      btnPlay.textContent = '▶';
    } else {
      isPlaying = true;
      btnPlay.textContent = '⏸';
      if (!audio.src && PLAYLIST.length) await loadTrack(currentTrackIndex, false);
      try { await audio.play(); } catch (_) {}
    }
  });

  btnSkip.addEventListener('click', () => nextTrack());
  btnStart.addEventListener('click', () => startExperience());
  audio.addEventListener('ended', () => nextTrack());

  window.addEventListener('resize', () => {
    resize();
    initPlanets();
    const track = PLAYLIST[currentTrackIndex];
    if (track) setCoverFromTrack(track, false);
  });

  resize();
  requestAnimationFrame(animate);

  if (PLAYLIST.length) {
    setCoverFromTrack(PLAYLIST[0], false);
    setTrackTheme(PLAYLIST[0]);
  }
})();
