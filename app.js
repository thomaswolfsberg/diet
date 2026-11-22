/* Diet – ren JavaScript, ingen afhængigheder.
 * Data gemmes i browserens localStorage pr. profil.
 */
(function () {
  'use strict';

  // ================================================================
  // Konstanter
  // ================================================================
  const STORAGE_PREFIX = 'kt.';
  const SCHEMA_VERSION = 1;

  const NUTRIENTS = {
    kcal:      { label: 'Energi',      unit: 'kcal', d: 0 },
    protein:   { label: 'Protein',     unit: 'g',  d: 1 },
    carbs:     { label: 'Kulhydrat',   unit: 'g',  d: 1 },
    fat:       { label: 'Fedt',        unit: 'g',  d: 1 },
    fiber:     { label: 'Kostfibre',   unit: 'g',  d: 1 },
    sugar:     { label: 'Sukkerarter', unit: 'g',  d: 1 },
    salt:      { label: 'Salt',        unit: 'g',  d: 1 },
    vitA:      { label: 'A-vitamin',   unit: 'µg', d: 0, micro: true },
    vitD:      { label: 'D-vitamin',   unit: 'µg', d: 1, micro: true },
    vitE:      { label: 'E-vitamin',   unit: 'mg', d: 1, micro: true },
    vitC:      { label: 'C-vitamin',   unit: 'mg', d: 0, micro: true },
    b12:       { label: 'B12-vitamin', unit: 'µg', d: 1, micro: true },
    folate:    { label: 'Folat',       unit: 'µg', d: 0, micro: true },
    calcium:   { label: 'Calcium',     unit: 'mg', d: 0, micro: true },
    iron:      { label: 'Jern',        unit: 'mg', d: 1, micro: true },
    magnesium: { label: 'Magnesium',   unit: 'mg', d: 0, micro: true },
    potassium: { label: 'Kalium',      unit: 'mg', d: 0, micro: true },
    zinc:      { label: 'Zink',        unit: 'mg', d: 1, micro: true }
  };
  const NKEYS = Object.keys(NUTRIENTS);
  const MICRO_KEYS = NKEYS.filter(k => NUTRIENTS[k].micro);
  const BASIC_FORM_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'salt'];

  const MEALS = [
    { id: 'breakfast', label: 'Morgenmad', icon: '🥣' },
    { id: 'lunch',     label: 'Frokost',   icon: '🥪' },
    { id: 'dinner',    label: 'Aftensmad', icon: '🍲' },
    { id: 'snack',     label: 'Snacks',    icon: '🍎' }
  ];

  const ACTIVITY = [
    { v: 1.2,   label: 'Stillesiddende', desc: 'Kontorarbejde, næsten ingen træning' },
    { v: 1.375, label: 'Let aktiv',      desc: 'Træning 1–3 dage om ugen' },
    { v: 1.55,  label: 'Moderat aktiv',  desc: 'Træning 3–5 dage om ugen' },
    { v: 1.725, label: 'Meget aktiv',    desc: 'Hård træning 6–7 dage om ugen' },
    { v: 1.9,   label: 'Ekstremt aktiv', desc: 'Fysisk arbejde + hård træning' }
  ];

  const GOALS = {
    lose:     { label: 'Tabe vægt' },
    maintain: { label: 'Holde vægten' },
    gain:     { label: 'Tage på' }
  };

  const KCAL_PER_KG = 7700;
  const KCAL_FLOOR = { f: 1200, m: 1500 };

  // Vejledende anbefalinger for voksne (baseret på nordiske anbefalinger)
  function microTargets(profile, age) {
    const m = profile.sex === 'm';
    return {
      vitA: m ? 900 : 700,
      vitD: age >= 75 ? 20 : 10,
      vitE: m ? 10 : 8,
      vitC: 75,
      b12: 2,
      folate: m ? 300 : 400,
      calcium: 800,
      iron: m ? 9 : 15,
      magnesium: m ? 350 : 280,
      potassium: m ? 3500 : 3100,
      zinc: m ? 9 : 7,
      fiber: m ? 35 : 25,
      saltMax: m ? 7 : 6
    };
  }

  // ================================================================
  // Hjælpefunktioner
  // ================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(n, d = 0) {
    if (n == null || isNaN(n)) return '–';
    return Number(n).toLocaleString('da-DK', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  function num(v) {
    if (v === '' || v == null) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  function dateKey(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
  const todayKey = () => dateKey(new Date());
  function dateLabel(k) {
    const t = todayKey();
    const rel = k === t ? 'I dag' : k === addDays(t, -1) ? 'I går' : k === addDays(t, 1) ? 'I morgen' : null;
    const long = parseKey(k).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
    return { rel, long };
  }
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ================================================================
  // Lagring
  // ================================================================
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); }
      catch (e) { toast('Kunne ikke gemme data i browseren'); }
    },
    remove(key) { try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (e) {} }
  };

  const state = {
    profiles: store.get('profiles', []),
    activeId: store.get('activeProfile', null),
    data: null,
    view: 'today',
    date: todayKey(),
    nutritionRange: 'day'
  };

  function emptyData() {
    return { version: SCHEMA_VERSION, days: {}, weights: [], customFoods: [], recent: [] };
  }
  function loadData() {
    state.data = state.activeId ? store.get('data.' + state.activeId, emptyData()) : null;
    if (state.data) {
      const def = emptyData();
      for (const k in def) if (state.data[k] == null) state.data[k] = def[k];
    }
  }
  function saveData() { if (state.activeId) store.set('data.' + state.activeId, state.data); }
  function saveProfiles() { store.set('profiles', state.profiles); store.set('activeProfile', state.activeId); }
  const activeProfile = () => state.profiles.find(p => p.id === state.activeId) || null;

  function getDay(k, create) {
    let day = state.data.days[k];
    if (!day && create) day = state.data.days[k] = { entries: [], water: 0, exercise: [] };
    if (day) { day.entries ||= []; day.exercise ||= []; day.water ||= 0; }
    return day || { entries: [], water: 0, exercise: [] };
  }

  // ================================================================
  // Beregninger
  // ================================================================
  function ageOf(p) { return new Date().getFullYear() - p.birthYear; }

  function weightOn(k) {
    const ws = state.data.weights.filter(w => w.date <= k).sort((a, b) => a.date.localeCompare(b.date));
    if (ws.length) return ws[ws.length - 1].kg;
    const p = activeProfile();
    const all = [...state.data.weights].sort((a, b) => a.date.localeCompare(b.date));
    return all.length ? all[0].kg : p.startWeight;
  }

  function calcTargets(p, weight) {
    const age = ageOf(p);
    const bmr = 10 * weight + 6.25 * p.heightCm - 5 * age + (p.sex === 'm' ? 5 : -161);
    const tdee = bmr * p.activity;
    let delta = 0;
    if (p.goal === 'lose') delta = -p.rate * KCAL_PER_KG / 7;
    if (p.goal === 'gain') delta = p.rate * KCAL_PER_KG / 7;
    let kcal = Math.round((tdee + delta) / 10) * 10;
    const floor = KCAL_FLOOR[p.sex];
    let floorApplied = false;
    let belowFloor = false;
    if (p.kcalOverride) {
      kcal = p.kcalOverride;
      belowFloor = kcal < floor;
    } else if (kcal < floor) {
      kcal = floor; floorApplied = true;
    }
    const protein = Math.round(p.proteinPerKg * weight);
    const fat = Math.round(kcal * (p.fatPct / 100) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const micro = microTargets(p, age);
    const water = p.waterOverride || Math.round(weight * 35 / 100) * 100;
    return { age, bmr: Math.round(bmr), tdee: Math.round(tdee), delta: Math.round(delta), kcal, floor, floorApplied, belowFloor, protein, fat, carbs, fiber: micro.fiber, water, micro };
  }

  function targetsFor(k) { return calcTargets(activeProfile(), weightOn(k)); }

  function scale(per100, grams) {
    const n = {};
    for (const k of NKEYS) n[k] = per100[k] == null ? null : per100[k] * grams / 100;
    return n;
  }

  // Summerer næringsstoffer og holder styr på hvor mange registreringer der mangler data
  function sumEntries(entries) {
    const total = {}, known = {};
    for (const k of NKEYS) { total[k] = 0; known[k] = 0; }
    for (const e of entries) {
      for (const k of NKEYS) {
        const v = e.n ? e.n[k] : null;
        if (v != null && !isNaN(v)) { total[k] += v; known[k]++; }
      }
    }
    return { total, known, count: entries.length };
  }
  const exerciseKcal = day => day.exercise.reduce((s, x) => s + (x.kcal || 0), 0);

  // ================================================================
  // Fødevarer
  // ================================================================
  const BUILTIN = (window.BUILTIN_FOODS_RAW || []).map(row => {
    const [name, cat, ...rest] = row;
    const portionsStr = rest[rest.length - 1];
    const per100 = {};
    window.FOOD_COLUMNS.forEach((k, i) => { per100[k] = rest[i]; });
    return { key: 'b:' + name, name, cat, src: 'builtin', per100, portions: parsePortions(portionsStr) };
  });

  function parsePortions(s) {
    if (!s) return [];
    return s.split('|').map(x => { const [label, g] = x.split(':'); return { label, g: Number(g) }; }).filter(p => p.g > 0);
  }

  function normalize(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); }

  function localSearch(q) {
    const words = normalize(q).split(/\s+/).filter(Boolean);
    const pool = [
      ...state.data.customFoods.map(f => ({ ...f, src: 'custom' })),
      ...state.data.recent.filter(f => f.src === 'off'),
      ...BUILTIN
    ];
    const seen = new Set();
    const out = [];
    for (const f of pool) {
      if (seen.has(f.key)) continue;
      const hay = normalize(f.name + ' ' + (f.brand || '') + ' ' + (f.cat || ''));
      if (words.every(w => hay.includes(w))) { out.push(f); seen.add(f.key); }
    }
    // Sortér: navne der starter med søgeordet først
    const first = words[0] || '';
    out.sort((a, b) => (normalize(b.name).startsWith(first) - normalize(a.name).startsWith(first)) || a.name.localeCompare(b.name, 'da'));
    return out.slice(0, 40);
  }

  function rememberRecent(food) {
    const slim = { key: food.key, name: food.name, brand: food.brand, cat: food.cat, src: food.src, per100: food.per100, portions: food.portions, code: food.code };
    state.data.recent = [slim, ...state.data.recent.filter(f => f.key !== food.key)].slice(0, 25);
  }

  function srcLabel(src) {
    return { builtin: 'Basis', custom: 'Egen', off: 'Open Food Facts', quick: 'Hurtig' }[src] || src;
  }

  // ---------- Open Food Facts ----------
  const OFF_FIELDS = 'code,product_name,product_name_da,generic_name,brands,nutriments,serving_quantity,serving_size,quantity';

  function offToFood(p) {
    const n = p.nutriments || {};
    const g = k => (n[k + '_100g'] != null && n[k + '_100g'] !== '' ? Number(n[k + '_100g']) : null);
    let kcal = g('energy-kcal');
    if (kcal == null && g('energy') != null) kcal = g('energy') / 4.184;
    let salt = g('salt');
    if (salt == null && g('sodium') != null) salt = g('sodium') * 2.5;
    const mult = (v, f) => (v == null || isNaN(v) ? null : v * f);
    const per100 = {
      kcal, protein: g('proteins'), carbs: g('carbohydrates'), fat: g('fat'),
      fiber: g('fiber'), sugar: g('sugars'), salt,
      vitA: mult(g('vitamin-a'), 1e6), vitD: mult(g('vitamin-d'), 1e6), vitE: mult(g('vitamin-e'), 1e3),
      vitC: mult(g('vitamin-c'), 1e3), b12: mult(g('vitamin-b12'), 1e6),
      folate: mult(g('vitamin-b9') ?? g('folates'), 1e6),
      calcium: mult(g('calcium'), 1e3), iron: mult(g('iron'), 1e3), magnesium: mult(g('magnesium'), 1e3),
      potassium: mult(g('potassium'), 1e3), zinc: mult(g('zinc'), 1e3)
    };
    const name = p.product_name_da || p.product_name || p.generic_name || 'Ukendt produkt';
    const portions = [];
    const sq = Number(p.serving_quantity);
    if (sq > 0) portions.push({ label: '1 portion' + (p.serving_size ? ` (${p.serving_size})` : ''), g: sq });
    return { key: 'o:' + p.code, code: p.code, name, brand: (p.brands || '').split(',')[0].trim(), cat: 'Produkt', src: 'off', per100, portions };
  }

  async function offSearch(q, dkOnly) {
    const params = new URLSearchParams({
      search_terms: q, search_simple: '1', action: 'process', json: '1', page_size: '24', lc: 'da', fields: OFF_FIELDS
    });
    if (dkOnly) { params.set('tagtype_0', 'countries'); params.set('tag_contains_0', 'contains'); params.set('tag_0', 'denmark'); }
    const res = await fetch('https://world.openfoodfacts.org/cgi/search.pl?' + params.toString());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return (json.products || []).map(offToFood).filter(f => f.per100.kcal != null);
  }

  async function offBarcode(code) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
    if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    json.product.code ||= code;
    return offToFood(json.product);
  }

  // ================================================================
  // Navigation og rendering
  // ================================================================
  function setView(v) {
    state.view = v;
    $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    const p = activeProfile();
    document.body.classList.toggle('onboarding', !p);
    $$('.view').forEach(v => { v.hidden = true; v.innerHTML = ''; });
    if (!p) { renderOnboarding(false); return; }
    $('#profileName').textContent = p.name;
    $('#profileInitial').textContent = (p.name || '?').trim().charAt(0).toUpperCase();
    const map = { today: renderToday, nutrition: renderNutrition, weight: renderWeight, profile: renderProfile };
    (map[state.view] || renderToday)();
  }

  function bar(value, target, color, over = true) {
    const pct = target ? clamp(value / target * 100, 0, 100) : 0;
    const isOver = over && target && value > target * 1.05;
    return `<div class="bar ${isOver ? 'over' : ''}"><i style="width:${pct}%;${color && !isOver ? `background:${color}` : ''}"></i></div>`;
  }

  function datebarHTML() {
    const { rel, long } = dateLabel(state.date);
    return `<div class="card datebar">
      <button class="icon-btn" data-act="prev-day" aria-label="Forrige dag">‹</button>
      <div class="date-label">${esc(rel || long)}${rel ? `<small>${esc(long)}</small>` : ''}</div>
      ${state.date !== todayKey() ? `<button class="btn small ghost" data-act="goto-today">I dag</button>` : ''}
      <button class="icon-btn" data-act="next-day" aria-label="Næste dag">›</button>
    </div>`;
  }

  // ---------------- Dagbog ----------------
  function renderToday() {
    const el = $('#view-today');
    el.hidden = false;
    const p = activeProfile();
    const day = getDay(state.date);
    const t = targetsFor(state.date);
    const sum = sumEntries(day.entries).total;
    const ex = exerciseKcal(day);
    const budget = t.kcal + (p.exerciseMode === 'add' ? ex : 0);
    const left = budget - sum.kcal;
    const R = 56, C = 2 * Math.PI * R;
    const pct = budget ? clamp(sum.kcal / budget, 0, 1) : 0;
    const over = sum.kcal > budget;

    const mealsHTML = MEALS.map(m => {
      const items = day.entries.filter(e => e.meal === m.id);
      const mk = items.reduce((s, e) => s + (e.n.kcal || 0), 0);
      const yesterday = getDay(addDays(state.date, -1)).entries.filter(e => e.meal === m.id);
      return `<div class="card">
        <div class="card-head">
          <h3>${m.icon} ${m.label}</h3>
          <span class="meal-total">${fmt(mk)} kcal</span>
        </div>
        ${items.length ? items.map(e => `
          <div class="entry" data-act="edit-entry" data-id="${e.id}">
            <div class="name">
              <div>${esc(e.name)}</div>
              <div class="muted small">${e.grams != null ? fmt(e.grams) + ' g · ' : ''}P ${fmt(e.n.protein, 0)} · K ${fmt(e.n.carbs, 0)} · F ${fmt(e.n.fat, 0)}</div>
            </div>
            <div class="kcal">${fmt(e.n.kcal)}</div>
          </div>`).join('') : `<div class="empty">Intet registreret endnu</div>`}
        <div class="row" style="margin-top:6px">
          <button class="btn small primary" data-act="add-food" data-meal="${m.id}">+ Tilføj</button>
          ${!items.length && yesterday.length ? `<button class="btn small ghost" data-act="copy-meal" data-meal="${m.id}">Kopiér fra i går (${yesterday.length})</button>` : ''}
        </div>
      </div>`;
    }).join('');

    const glassMl = 250;
    const glasses = Math.ceil(t.water / glassMl);
    const full = Math.floor(day.water / glassMl);

    el.innerHTML = `
      ${datebarHTML()}
      <div class="card">
        <div class="summary">
          <div class="ring">
            <svg width="130" height="130" viewBox="0 0 130 130">
              <circle cx="65" cy="65" r="${R}" fill="none" stroke="var(--line)" stroke-width="11"/>
              <circle cx="65" cy="65" r="${R}" fill="none" stroke="${over ? 'var(--warn)' : 'var(--accent)'}" stroke-width="11"
                stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
            </svg>
            <div class="ring-text"><div><span class="big">${fmt(Math.abs(left))}</span><span class="lbl">${left >= 0 ? 'kcal tilbage' : 'kcal over'}</span></div></div>
          </div>
          <div>
            <div class="kcal-eq">
              <div><b>${fmt(budget)}</b><span>Mål${p.exerciseMode === 'add' && ex ? ' + træning' : ''}</span></div>
              <div><b>${fmt(sum.kcal)}</b><span>Spist</span></div>
              <div><b>${fmt(ex)}</b><span>Træning</span></div>
            </div>
            ${macroBar('Protein', sum.protein, t.protein, 'var(--protein)', false)}
            ${macroBar('Kulhydrat', sum.carbs, t.carbs, 'var(--carbs)')}
            ${macroBar('Fedt', sum.fat, t.fat, 'var(--fat)')}
            ${macroBar('Kostfibre', sum.fiber, t.fiber, 'var(--fiber)', false)}
          </div>
        </div>
      </div>

      ${mealsHTML}

      <div class="card">
        <div class="card-head">
          <h3>💧 Vand</h3>
          <span class="meal-total">${fmt(day.water / 1000, 2)} / ${fmt(t.water / 1000, 1)} l</span>
        </div>
        <div class="water-glasses">${Array.from({ length: Math.max(glasses, full) }, (_, i) => `<i class="${i < full ? 'full' : ''}"></i>`).join('')}</div>
        <div class="row wrap">
          <button class="btn small" data-act="water" data-ml="250">+ 1 glas (250 ml)</button>
          <button class="btn small" data-act="water" data-ml="500">+ 500 ml</button>
          <button class="btn small ghost" data-act="water" data-ml="-250">− 250 ml</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>🏃 Træning</h3>
          <button class="btn small" data-act="add-exercise">+ Tilføj</button>
        </div>
        ${day.exercise.length ? day.exercise.map(x => `
          <div class="entry" data-act="edit-exercise" data-id="${x.id}">
            <div class="name"><div>${esc(x.name)}</div><div class="muted small">${x.minutes ? fmt(x.minutes) + ' min · ' : ''}${esc(x.source === 'manual' ? 'Manuelt' : x.source)}</div></div>
            <div class="kcal">${fmt(x.kcal)} kcal</div>
          </div>`).join('') : `<div class="empty">Ingen træning registreret.</div>`}
        <div class="note">${p.exerciseMode === 'add'
          ? 'Forbrændte kalorier fra træning lægges oven i dit dagsmål.'
          : 'Træning tælles ikke med i dagsmålet, fordi den allerede indgår i dit aktivitetsniveau. Det kan ændres under Profil.'}</div>
      </div>
    `;
  }

  function macroBar(label, v, t, color, over = true) {
    return `<div class="bar-row">
      <div class="bar-label"><span>${label}</span><span class="muted">${fmt(v)} / ${fmt(t)} g</span></div>
      ${bar(v, t, color, over)}
    </div>`;
  }

  // ---------------- Næring ----------------
  function renderNutrition() {
    const el = $('#view-nutrition');
    el.hidden = false;
    const t = targetsFor(state.date);
    let entries, daysCount = 1, title;
    if (state.nutritionRange === 'week') {
      entries = [];
      daysCount = 0;
      for (let i = 0; i < 7; i++) {
        const d = getDay(addDays(state.date, -i));
        if (d.entries.length) { entries.push(...d.entries); daysCount++; }
      }
      title = `Gennemsnit pr. dag – ${daysCount} dag${daysCount === 1 ? '' : 'e'} med registreringer de seneste 7 dage`;
    } else {
      entries = getDay(state.date).entries;
      title = 'Den valgte dag';
    }
    const s = sumEntries(entries);
    const avg = {};
    for (const k of NKEYS) avg[k] = daysCount ? s.total[k] / daysCount : 0;

    const energyFrom = {
      protein: avg.protein * 4, carbs: avg.carbs * 4, fat: avg.fat * 9
    };
    const eSum = energyFrom.protein + energyFrom.carbs + energyFrom.fat || 1;

    const microRows = MICRO_KEYS.map(k => {
      const meta = NUTRIENTS[k];
      const target = t.micro[k];
      const v = avg[k];
      const missing = s.count - s.known[k];
      return `<tr>
        <td style="width:34%">${meta.label}${missing > 0 && s.count ? ` <span class="muted small" title="${missing} af ${s.count} registreringer mangler data">⚠︎</span>` : ''}</td>
        <td>${bar(v, target, v >= target ? 'var(--fiber)' : 'var(--accent)', false)}</td>
        <td class="val">${fmt(v, meta.d)} / ${fmt(target)} ${meta.unit}</td>
        <td class="val muted small">${target ? fmt(v / target * 100) + '%' : ''}</td>
      </tr>`;
    }).join('');

    const missingAny = s.count && MICRO_KEYS.some(k => s.known[k] < s.count);

    el.innerHTML = `
      ${datebarHTML()}
      <div class="seg">
        <button data-act="nrange" data-r="day" class="${state.nutritionRange === 'day' ? 'active' : ''}">Dag</button>
        <button data-act="nrange" data-r="week" class="${state.nutritionRange === 'week' ? 'active' : ''}">7 dage</button>
      </div>
      <div class="card">
        <div class="card-head"><h3>Makronæringsstoffer</h3></div>
        <p class="muted small" style="margin:0 0 8px">${esc(title)}</p>
        <div class="nutri-grid" style="margin-bottom:10px">
          <div><b>${fmt(avg.kcal)}</b><span>kcal</span></div>
          <div><b style="color:var(--protein)">${fmt(energyFrom.protein / eSum * 100)}%</b><span>energi fra protein</span></div>
          <div><b style="color:var(--carbs)">${fmt(energyFrom.carbs / eSum * 100)}%</b><span>fra kulhydrat</span></div>
          <div><b style="color:var(--fat)">${fmt(energyFrom.fat / eSum * 100)}%</b><span>fra fedt</span></div>
        </div>
        ${macroBar('Protein', avg.protein, t.protein, 'var(--protein)', false)}
        ${macroBar('Kulhydrat', avg.carbs, t.carbs, 'var(--carbs)')}
        ${macroBar('Fedt', avg.fat, t.fat, 'var(--fat)')}
        ${macroBar('Kostfibre', avg.fiber, t.fiber, 'var(--fiber)', false)}
        <div class="bar-row">
          <div class="bar-label"><span>Salt (anbefalet maks.)</span><span class="muted">${fmt(avg.salt, 1)} / ${fmt(t.micro.saltMax)} g</span></div>
          ${bar(avg.salt, t.micro.saltMax, 'var(--muted)')}
        </div>
        <div class="bar-label small" style="display:flex;justify-content:space-between;margin-top:6px"><span>Sukkerarter (i alt)</span><span class="muted">${fmt(avg.sugar, 1)} g</span></div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Vitaminer og mineraler</h3></div>
        ${s.count ? `<table class="micro"><tbody>${microRows}</tbody></table>` : '<div class="empty">Ingen registreringer i perioden.</div>'}
        ${missingAny ? `<div class="note" style="margin-top:10px">⚠︎ betyder, at nogle registreringer mangler data for næringsstoffet (fx hurtige registreringer eller produkter uden fuld deklaration). Det reelle indtag er derfor sandsynligvis højere end vist.</div>` : ''}
        <div class="note" style="margin-top:8px">Anbefalingerne er vejledende værdier for voksne baseret på de nordiske næringsstofanbefalinger. Værdierne i basisdatabasen er gennemsnit og kan afvige fra konkrete produkter.</div>
      </div>
    `;
  }

  // ---------------- Vægt ----------------
  function renderWeight() {
    const el = $('#view-weight');
    el.hidden = false;
    const p = activeProfile();
    const ws = [...state.data.weights].sort((a, b) => a.date.localeCompare(b.date));
    const current = ws.length ? ws[ws.length - 1].kg : p.startWeight;
    const change = current - p.startWeight;
    const toGoal = p.targetWeight ? current - p.targetWeight : null;

    // Tendens: lineær regression over de seneste 28 dage
    let ratePerWeek = null;
    if (ws.length >= 3) {
      const cutoff = addDays(todayKey(), -28);
      const recent = ws.filter(w => w.date >= cutoff);
      if (recent.length >= 3) {
        const xs = recent.map(w => parseKey(w.date).getTime() / 86400000), ys = recent.map(w => w.kg);
        const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
        let nume = 0, den = 0;
        xs.forEach((x, i) => { nume += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
        if (den > 0) ratePerWeek = nume / den * 7;
      }
    }
    const planned = p.goal === 'lose' ? -p.rate : p.goal === 'gain' ? p.rate : 0;

    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Registrér vægt</h3></div>
        <div class="row">
          <input type="date" id="wDate" value="${todayKey()}" max="${todayKey()}" style="flex:1.2">
          <input type="number" id="wKg" step="0.1" min="20" max="400" placeholder="kg" value="" style="flex:1" inputmode="decimal">
          <button class="btn primary" data-act="save-weight">Gem</button>
        </div>
      </div>

      <div class="card">
        <div class="stat-row">
          <div><b>${fmt(current, 1)} kg</b><span>Nuværende</span></div>
          <div><b>${change > 0 ? '+' : ''}${fmt(change, 1)} kg</b><span>Siden start (${fmt(p.startWeight, 1)})</span></div>
          <div><b>${toGoal == null ? '–' : fmt(Math.abs(toGoal), 1) + ' kg'}</b><span>${toGoal == null ? 'Intet målvægt' : 'Til målvægt (' + fmt(p.targetWeight, 1) + ')'}</span></div>
        </div>
        <div style="margin-top:12px">${weightChart(ws, p)}</div>
        <p class="muted small" style="margin:8px 0 0">
          ${ratePerWeek == null ? 'Registrér mindst 3 vejninger inden for 4 uger for at se din tendens.' :
            `Tendens de seneste 4 uger: <b>${ratePerWeek > 0 ? '+' : ''}${fmt(ratePerWeek, 2)} kg/uge</b> (plan: ${planned > 0 ? '+' : ''}${fmt(planned, 2)} kg/uge).`}
          Vej dig gerne på samme tidspunkt, fx om morgenen før morgenmad – vægten svinger naturligt fra dag til dag.
        </p>
      </div>

      <div class="card">
        <div class="card-head"><h3>Seneste vejninger</h3></div>
        ${ws.length ? ws.slice(-15).reverse().map(w => `
          <div class="entry">
            <div class="name"><div>${esc(parseKey(w.date).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }))}</div></div>
            <div class="kcal">${fmt(w.kg, 1)} kg</div>
            <button class="icon-btn" data-act="del-weight" data-date="${w.date}" aria-label="Slet">🗑</button>
          </div>`).join('') : '<div class="empty">Ingen vejninger endnu.</div>'}
      </div>
    `;
  }

  function weightChart(ws, p) {
    if (ws.length < 2) return `<div class="empty" style="text-align:center;padding:24px 0">Grafen vises, når du har mindst 2 vejninger.</div>`;
    const W = 360, H = 190, padL = 34, padR = 8, padT = 10, padB = 22;
    const pts = ws.map(w => ({ t: parseKey(w.date).getTime(), kg: w.kg, date: w.date }));
    let minKg = Math.min(...pts.map(x => x.kg)), maxKg = Math.max(...pts.map(x => x.kg));
    if (p.targetWeight) { minKg = Math.min(minKg, p.targetWeight); maxKg = Math.max(maxKg, p.targetWeight); }
    minKg = Math.floor(minKg - 0.5); maxKg = Math.ceil(maxKg + 0.5);
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
    const x = t => padL + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - padL - padR);
    const y = kg => padT + (1 - (kg - minKg) / (maxKg - minKg)) * (H - padT - padB);
    const line = pts.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.t).toFixed(1)},${y(pt.kg).toFixed(1)}`).join(' ');
    // 7-dages glidende gennemsnit
    const trend = pts.map(pt => {
      const win = pts.filter(q => q.t <= pt.t && q.t > pt.t - 7 * 86400000);
      return { t: pt.t, kg: win.reduce((s, q) => s + q.kg, 0) / win.length };
    });
    const trendPath = trend.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.t).toFixed(1)},${y(pt.kg).toFixed(1)}`).join(' ');
    const steps = 4;
    let grid = '';
    for (let i = 0; i <= steps; i++) {
      const kg = minKg + (maxKg - minKg) * i / steps;
      grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(kg)}" y2="${y(kg)}"/><text class="axis" x="${padL - 6}" y="${y(kg) + 3}" text-anchor="end">${fmt(kg, 1)}</text>`;
    }
    const fmtD = t => new Date(t).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
    const goal = p.targetWeight ? `<line class="goal" x1="${padL}" x2="${W - padR}" y1="${y(p.targetWeight)}" y2="${y(p.targetWeight)}"/><text class="axis" x="${W - padR}" y="${y(p.targetWeight) - 4}" text-anchor="end">Mål</text>` : '';
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vægtudvikling">
      ${grid}${goal}
      <path class="trend" d="${trendPath}"/>
      <path class="line" d="${line}"/>
      ${pts.length <= 60 ? pts.map(pt => `<circle class="dot" cx="${x(pt.t)}" cy="${y(pt.kg)}" r="3"><title>${fmtD(pt.t)}: ${fmt(pt.kg, 1)} kg</title></circle>`).join('') : ''}
      <text class="axis" x="${padL}" y="${H - 6}">${fmtD(t0)}</text>
      <text class="axis" x="${W - padR}" y="${H - 6}" text-anchor="end">${fmtD(t1)}</text>
    </svg>
    <div class="muted small row" style="gap:14px"><span>━ Vægt</span><span>┅ 7-dages gennemsnit</span>${p.targetWeight ? '<span style="color:var(--carbs)">┅ Målvægt</span>' : ''}</div>`;
  }

  // ---------------- Profil ----------------
  function profileFormHTML(p, isNew) {
    const v = p || { name: '', sex: 'f', birthYear: 1990, heightCm: 170, startWeight: 70, activity: 1.375, goal: 'lose', rate: 0.5, targetWeight: null, proteinPerKg: 1.8, fatPct: 30, kcalOverride: null, waterOverride: null, exerciseMode: 'ignore' };
    const year = new Date().getFullYear();
    return `<form class="form" id="profileForm" autocomplete="off">
      <div class="form-grid">
        <label class="field full">Navn<input type="text" name="name" required maxlength="40" value="${esc(v.name)}" placeholder="Fx Mikkel"></label>
        <label class="field">Køn (til beregning)
          <select name="sex"><option value="f" ${v.sex === 'f' ? 'selected' : ''}>Kvinde</option><option value="m" ${v.sex === 'm' ? 'selected' : ''}>Mand</option></select>
        </label>
        <label class="field">Fødselsår<input type="number" name="birthYear" required min="${year - 100}" max="${year - 16}" value="${v.birthYear}"></label>
        <label class="field">Højde (cm)<input type="number" name="heightCm" required min="120" max="230" step="1" value="${v.heightCm}"></label>
        <label class="field">${isNew ? 'Nuværende vægt (kg)' : 'Startvægt (kg)'}<input type="number" name="startWeight" required min="30" max="300" step="0.1" value="${v.startWeight}"></label>
        <label class="field full">Aktivitetsniveau
          <select name="activity">${ACTIVITY.map(a => `<option value="${a.v}" ${Number(v.activity) === a.v ? 'selected' : ''}>${a.label} – ${a.desc}</option>`).join('')}</select>
        </label>
      </div>
      <div>
        <div class="muted small" style="margin-bottom:4px">Mål</div>
        <div class="seg" id="goalSeg">${Object.entries(GOALS).map(([k, g]) => `<button type="button" data-goal="${k}" class="${v.goal === k ? 'active' : ''}">${g.label}</button>`).join('')}</div>
        <input type="hidden" name="goal" value="${v.goal}">
      </div>
      <div class="form-grid" id="rateRow">
        <label class="field">Tempo
          <select name="rate">${[0.25, 0.5, 0.75, 1].map(r => `<option value="${r}" ${Number(v.rate) === r ? 'selected' : ''}>${fmt(r, 2)} kg/uge</option>`).join('')}</select>
        </label>
        <label class="field">Målvægt (valgfri)<input type="number" name="targetWeight" min="30" max="300" step="0.1" value="${v.targetWeight ?? ''}"></label>
      </div>
      <details>
        <summary>Avancerede indstillinger</summary>
        <div class="form-grid" style="margin-top:8px">
          <label class="field">Protein (g pr. kg kropsvægt)<input type="number" name="proteinPerKg" min="0.8" max="3" step="0.1" value="${v.proteinPerKg}"></label>
          <label class="field">Fedt (% af energi)<input type="number" name="fatPct" min="15" max="50" step="1" value="${v.fatPct}"></label>
          <label class="field">Eget kaloriemål (tom = automatisk)<input type="number" name="kcalOverride" min="800" max="6000" step="10" value="${v.kcalOverride ?? ''}"></label>
          <label class="field">Eget vandmål i ml (tom = automatisk)<input type="number" name="waterOverride" min="500" max="6000" step="100" value="${v.waterOverride ?? ''}"></label>
          <label class="field full">Træning i dagsmålet
            <select name="exerciseMode">
              <option value="ignore" ${v.exerciseMode !== 'add' ? 'selected' : ''}>Tæl ikke med (indgår i aktivitetsniveau)</option>
              <option value="add" ${v.exerciseMode === 'add' ? 'selected' : ''}>Læg forbrændte kalorier oven i målet</option>
            </select>
          </label>
        </div>
        <div class="note" style="margin-top:8px">Vælger du at lægge træning oven i målet, bør aktivitetsniveauet sættes til "Stillesiddende" eller "Let aktiv", så træningen ikke tælles dobbelt.</div>
      </details>
      <div class="row">
        ${isNew && state.profiles.length ? '<button type="button" class="btn" data-act="cancel-new">Annullér</button>' : ''}
        <span class="spacer"></span>
        <button type="submit" class="btn primary">${isNew ? 'Opret profil' : 'Gem ændringer'}</button>
      </div>
    </form>`;
  }

  function readProfileForm(form) {
    const f = new FormData(form);
    const p = {
      name: String(f.get('name')).trim() || 'Mig',
      sex: f.get('sex'),
      birthYear: Number(f.get('birthYear')),
      heightCm: num(f.get('heightCm')),
      startWeight: num(f.get('startWeight')),
      activity: Number(f.get('activity')),
      goal: f.get('goal'),
      rate: Number(f.get('rate')),
      targetWeight: num(f.get('targetWeight')),
      proteinPerKg: num(f.get('proteinPerKg')) || 1.8,
      fatPct: num(f.get('fatPct')) || 30,
      kcalOverride: num(f.get('kcalOverride')),
      waterOverride: num(f.get('waterOverride')),
      exerciseMode: f.get('exerciseMode') || 'ignore'
    };
    if (p.goal === 'gain' && p.rate > 0.5) p.rate = 0.5;
    return p;
  }

  function wireProfileForm(form, onSubmit) {
    const seg = $('#goalSeg', form);
    const sync = () => {
      const g = form.goal.value;
      $('#rateRow', form).style.display = g === 'maintain' ? 'none' : '';
      $$('option', form.rate).forEach(o => { o.hidden = g === 'gain' && Number(o.value) > 0.5; });
      if (g === 'gain' && Number(form.rate.value) > 0.5) form.rate.value = '0.5';
    };
    seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-goal]');
      if (!b) return;
      form.goal.value = b.dataset.goal;
      $$('button', seg).forEach(x => x.classList.toggle('active', x === b));
      sync();
    });
    sync();
    form.addEventListener('submit', e => { e.preventDefault(); onSubmit(readProfileForm(form)); });
  }

  function renderOnboarding(addingAnother) {
    const el = $('#view-onboarding');
    el.hidden = false;
    document.body.classList.add('onboarding');
    el.innerHTML = `
      <div class="card">
        <h2 style="margin-bottom:6px">${addingAnother ? 'Ny profil' : 'Velkommen 👋'}</h2>
        <p class="muted" style="margin:0 0 14px">${addingAnother ? 'Hver profil har sine egne mål, dagbog og vejninger.' : 'Udfyld din profil, så beregner appen dit daglige kalorie- og næringsbehov ud fra dit mål.'}</p>
        ${profileFormHTML(null, true)}
      </div>
      ${addingAnother ? '' : `<div class="card"><p class="muted small" style="margin:0">Har du data fra en anden enhed? <button class="btn small ghost" data-act="import">Importér backup</button></p></div>`}`;
    const form = $('#profileForm', el);
    wireProfileForm(form, data => {
      const p = { id: uid(), created: new Date().toISOString(), ...data };
      state.profiles.push(p);
      state.activeId = p.id;
      saveProfiles();
      loadData();
      state.data.weights.push({ date: todayKey(), kg: p.startWeight });
      saveData();
      state.view = 'today';
      $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === 'today'));
      render();
      toast('Profil oprettet');
    });
  }

  function renderProfile() {
    const el = $('#view-profile');
    el.hidden = false;
    const p = activeProfile();
    const t = targetsFor(todayKey());
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Dine beregnede mål</h3></div>
        <div class="nutri-grid">
          <div><b>${fmt(t.kcal)}</b><span>kcal/dag</span></div>
          <div><b style="color:var(--protein)">${fmt(t.protein)} g</b><span>protein</span></div>
          <div><b style="color:var(--carbs)">${fmt(t.carbs)} g</b><span>kulhydrat</span></div>
          <div><b style="color:var(--fat)">${fmt(t.fat)} g</b><span>fedt</span></div>
        </div>
        <p class="muted small" style="margin:10px 0 0">
          Hvilestofskifte (BMR): <b>${fmt(t.bmr)} kcal</b> · Dagligt forbrug (TDEE): <b>${fmt(t.tdee)} kcal</b>
          ${p.goal !== 'maintain' && !p.kcalOverride ? ` · ${p.goal === 'lose' ? 'Underskud' : 'Overskud'}: <b>${fmt(Math.abs(t.delta))} kcal</b>` : ''}
          · Vand: <b>${fmt(t.water / 1000, 1)} l</b> · Kostfibre: <b>${fmt(t.fiber)} g</b>
        </p>
        ${t.floorApplied ? `<div class="warn-box" style="margin-top:10px">Det beregnede mål kom under ${fmt(t.floor)} kcal, så det er hævet til ${fmt(t.floor)} kcal. Et meget lavt indtag gør det svært at få nok næring. Overvej et lavere tempo.</div>` : ''}
        ${t.belowFloor ? `<div class="warn-box" style="margin-top:10px">Dit eget kaloriemål er under ${fmt(t.floor)} kcal. Så lavt et indtag bør kun følges i samråd med en læge eller diætist.</div>` : ''}
        <p class="muted small" style="margin:8px 0 0">Beregnet med Mifflin-St Jeor-formlen ud fra din seneste vejning (${fmt(weightOn(todayKey()), 1)} kg). Målene opdateres automatisk, når du registrerer en ny vægt.</p>
      </div>

      <div class="card">
        <div class="card-head"><h3>Profil: ${esc(p.name)}</h3></div>
        ${profileFormHTML(p, false)}
      </div>

      <div class="card">
        <div class="card-head"><h3>Profiler</h3><button class="btn small" data-act="new-profile">+ Ny profil</button></div>
        ${state.profiles.map(x => `
          <div class="profile-item">
            <span class="avatar">${esc(x.name.charAt(0).toUpperCase())}</span>
            <div class="spacer">${esc(x.name)} ${x.id === p.id ? '<span class="muted small">(aktiv)</span>' : ''}</div>
            ${x.id !== p.id ? `<button class="btn small" data-act="switch-profile" data-id="${x.id}">Skift</button>` : ''}
            <button class="btn small ghost danger" data-act="delete-profile" data-id="${x.id}">Slet</button>
          </div>`).join('')}
      </div>

      <div class="card">
        <div class="card-head"><h3>Mine fødevarer</h3></div>
        ${state.data.customFoods.length ? state.data.customFoods.map(f => `
          <div class="profile-item">
            <div class="spacer">${esc(f.name)}<div class="muted small">${fmt(f.per100.kcal)} kcal pr. 100 g</div></div>
            <button class="btn small ghost danger" data-act="delete-custom" data-key="${esc(f.key)}">Slet</button>
          </div>`).join('') : '<div class="empty">Du har ikke oprettet egne fødevarer endnu. Det gør du via "+ Tilføj" i dagbogen.</div>'}
      </div>

      ${installCardHTML()}

      <div class="card">
        <div class="card-head"><h3>Data og backup</h3></div>
        <p class="muted small" style="margin:0 0 10px">Alle data ligger kun i denne browser. Tag en backup jævnligt, eller hvis du vil flytte til en anden enhed.</p>
        <div class="row wrap">
          <button class="btn" data-act="export">⬇ Eksportér backup (JSON)</button>
          <button class="btn" data-act="import">⬆ Importér backup</button>
        </div>
      </div>
    `;
    runInstallCheck();
    wireProfileForm($('#profileForm', el), data => {
      Object.assign(p, data);
      saveProfiles();
      render();
      toast('Profil gemt');
    });
  }

  // ================================================================
  // Modal
  // ================================================================
  const modal = $('#modal');
  let modalCleanup = null;
  function openModal(title, html, onMount) {
    if (modalCleanup) { modalCleanup(); modalCleanup = null; }
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    if (!modal.open) modal.showModal();
    if (onMount) modalCleanup = onMount($('#modalBody')) || null;
  }
  function closeModal() {
    if (modalCleanup) { modalCleanup(); modalCleanup = null; }
    if (modal.open) modal.close();
  }
  $('#modalClose').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  modal.addEventListener('close', () => { if (modalCleanup) { modalCleanup(); modalCleanup = null; } });

  // ================================================================
  // Tilføj mad
  // ================================================================
  const addCtx = { meal: 'breakfast', tab: 'search', query: '', offResults: null, offLoading: false, offError: null, dkOnly: false };

  function mealSelectHTML(selected) {
    return `<select name="meal">${MEALS.map(m => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${m.label}</option>`).join('')}</select>`;
  }

  function openAddFood(meal) {
    addCtx.meal = meal;
    addCtx.tab = 'search';
    addCtx.query = '';
    addCtx.offResults = null;
    addCtx.offError = null;
    renderAddFood();
  }

  function renderAddFood() {
    const mealLabel = MEALS.find(m => m.id === addCtx.meal).label;
    const tabs = [['search', '🔍 Søg'], ['barcode', '▥ Stregkode'], ['custom', '＋ Ny fødevare'], ['quick', '⚡ Hurtig']];
    openModal('Tilføj til ' + mealLabel.toLowerCase(), `
      <div class="tabs">${tabs.map(([k, l]) => `<button class="chip ${addCtx.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="addPane"></div>`, body => {
      $$('.tabs .chip', body).forEach(b => b.addEventListener('click', () => { addCtx.tab = b.dataset.tab; renderAddFood(); }));
      const pane = $('#addPane', body);
      if (addCtx.tab === 'search') return paneSearch(pane);
      if (addCtx.tab === 'barcode') return paneBarcode(pane);
      if (addCtx.tab === 'custom') return paneCustom(pane);
      if (addCtx.tab === 'quick') return paneQuick(pane);
    });
  }

  function resultHTML(f) {
    const meta = [f.brand, f.per100.kcal != null ? fmt(f.per100.kcal) + ' kcal/100 g' : null].filter(Boolean).join(' · ');
    return `<button class="result" data-key="${esc(f.key)}">
      <div class="name"><div>${esc(f.name)}</div><div class="muted small">${esc(meta)}</div></div>
      <span class="src">${srcLabel(f.src)}</span>
    </button>`;
  }

  function paneSearch(pane) {
    const foodsByKey = new Map();
    const draw = () => {
      const q = addCtx.query.trim();
      let html = '';
      foodsByKey.clear();
      const add = f => { foodsByKey.set(f.key, f); return resultHTML(f); };
      if (!q) {
        if (state.data.recent.length) html += `<div class="section-label">Senest brugt</div>` + state.data.recent.slice(0, 12).map(add).join('');
        if (state.data.customFoods.length) html += `<div class="section-label">Mine fødevarer</div>` + state.data.customFoods.map(f => add({ ...f, src: 'custom' })).join('');
        if (!html) html = `<div class="empty" style="padding:10px 4px">Skriv for at søge i basisdatabasen (${BUILTIN.length} almindelige fødevarer) eller online i Open Food Facts.</div>`;
      } else {
        const local = localSearch(q);
        html += local.length ? `<div class="section-label">Basis og egne</div>` + local.map(add).join('') : `<div class="empty" style="padding:6px 4px">Ingen lokale resultater.</div>`;
        if (addCtx.offLoading) html += `<div class="empty" style="padding:10px 4px">Søger i Open Food Facts…</div>`;
        else if (addCtx.offError) html += `<div class="warn-box" style="margin-top:8px">${esc(addCtx.offError)}</div>`;
        else if (addCtx.offResults) {
          html += `<div class="section-label">Open Food Facts</div>` + (addCtx.offResults.length ? addCtx.offResults.map(add).join('') : `<div class="empty" style="padding:6px 4px">Ingen produkter fundet.</div>`);
        }
      }
      $('#results', pane).innerHTML = html;
      $('#offBtn', pane).disabled = !q || addCtx.offLoading;
    };
    pane.innerHTML = `
      <input type="search" id="q" placeholder="Søg fx havregryn, skyr, kylling…" value="${esc(addCtx.query)}" autofocus>
      <div class="row wrap" style="margin:8px 0">
        <button class="btn small" id="offBtn">Søg online i Open Food Facts</button>
        <label class="small muted row" style="gap:4px"><input type="checkbox" id="dkOnly" ${addCtx.dkOnly ? 'checked' : ''}> Kun produkter solgt i Danmark</label>
      </div>
      <div class="results" id="results"></div>`;
    const input = $('#q', pane);
    input.addEventListener('input', () => { addCtx.query = input.value; addCtx.offResults = null; addCtx.offError = null; draw(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runOff(); } });
    $('#dkOnly', pane).addEventListener('change', e => { addCtx.dkOnly = e.target.checked; });
    const runOff = async () => {
      const q = addCtx.query.trim();
      if (!q || addCtx.offLoading) return;
      addCtx.offLoading = true; addCtx.offError = null; draw();
      try {
        addCtx.offResults = await offSearch(q, addCtx.dkOnly);
      } catch (err) {
        addCtx.offError = 'Kunne ikke hente fra Open Food Facts. Tjek din internetforbindelse, eller prøv igen om lidt (tjenesten begrænser antallet af søgninger pr. minut).';
      }
      addCtx.offLoading = false;
      if (addCtx.query.trim() === q && $('#results', pane)) draw();
    };
    $('#offBtn', pane).addEventListener('click', runOff);
    $('#results', pane).addEventListener('click', e => {
      const b = e.target.closest('.result');
      if (b) showAmount(foodsByKey.get(b.dataset.key));
    });
    draw();
    setTimeout(() => input.focus(), 50);
  }

  function nutriPreviewHTML(n) {
    return `<div class="nutri-grid">
      <div><b>${fmt(n.kcal)}</b><span>kcal</span></div>
      <div><b style="color:var(--protein)">${fmt(n.protein, 1)}</b><span>protein g</span></div>
      <div><b style="color:var(--carbs)">${fmt(n.carbs, 1)}</b><span>kulhydrat g</span></div>
      <div><b style="color:var(--fat)">${fmt(n.fat, 1)}</b><span>fedt g</span></div>
    </div>`;
  }

  function microListHTML(n) {
    const rows = MICRO_KEYS.filter(k => n[k] != null).map(k => `<span>${NUTRIENTS[k].label}: <b>${fmt(n[k], NUTRIENTS[k].d)} ${NUTRIENTS[k].unit}</b></span>`);
    const extra = ['fiber', 'sugar', 'salt'].filter(k => n[k] != null).map(k => `<span>${NUTRIENTS[k].label}: <b>${fmt(n[k], 1)} g</b></span>`);
    const all = [...extra, ...rows];
    return all.length ? `<div class="small muted" style="display:flex;flex-wrap:wrap;gap:4px 14px">${all.join('')}</div>` : '';
  }

  // Mængde-skærm – bruges både ved tilføjelse og redigering
  function showAmount(food, entry) {
    if (!food) return;
    const editing = !!entry;
    const startGrams = editing ? entry.grams : (food.portions[0]?.g || 100);
    openModal(editing ? 'Redigér' : food.name, `
      ${editing ? `<div><b>${esc(food.name)}</b></div>` : ''}
      ${food.brand ? `<div class="muted small">${esc(food.brand)}</div>` : ''}
      <div class="row wrap">${food.portions.map(p => `<button class="chip" data-g="${p.g}">${esc(p.label)} (${fmt(p.g)} g)</button>`).join('')}
        <button class="chip" data-g="100">100 g</button></div>
      <div class="form-grid">
        <label class="field">Mængde (gram)<input type="number" id="grams" min="0" step="1" value="${startGrams}" inputmode="decimal"></label>
        <label class="field">Måltid${mealSelectHTML(editing ? entry.meal : addCtx.meal)}</label>
      </div>
      <div id="preview"></div>
      <div class="row">
        ${editing ? '<button class="btn danger" id="delBtn">Slet</button>' : '<button class="btn" id="backBtn">← Tilbage</button>'}
        <span class="spacer"></span>
        <button class="btn primary" id="okBtn">${editing ? 'Gem' : 'Tilføj'}</button>
      </div>
      <div class="muted small">Kilde: ${srcLabel(food.src)}${food.code ? ' · stregkode ' + esc(food.code) : ''}</div>`, body => {
      const gi = $('#grams', body);
      const upd = () => {
        const g = num(gi.value) || 0;
        const n = scale(food.per100, g);
        $('#preview', body).innerHTML = nutriPreviewHTML(n) + `<div style="margin-top:8px">${microListHTML(n)}</div>`;
      };
      gi.addEventListener('input', upd);
      $$('.chip[data-g]', body).forEach(c => c.addEventListener('click', () => { gi.value = c.dataset.g; upd(); }));
      $('#okBtn', body).addEventListener('click', () => {
        const g = num(gi.value);
        if (!g || g <= 0) { gi.focus(); return; }
        const meal = $('select[name=meal]', body).value;
        const day = getDay(state.date, true);
        const slimFood = { key: food.key, name: food.name, brand: food.brand, src: food.src, per100: food.per100, portions: food.portions, code: food.code };
        if (editing) {
          Object.assign(entry, { grams: g, meal, n: scale(food.per100, g) });
        } else {
          day.entries.push({ id: uid(), meal, name: food.name + (food.brand ? ` (${food.brand})` : ''), grams: g, food: slimFood, n: scale(food.per100, g), ts: Date.now() });
          rememberRecent(food);
        }
        saveData();
        closeModal();
        render();
        toast(editing ? 'Gemt' : `${food.name} tilføjet`);
      });
      if (editing) $('#delBtn', body).addEventListener('click', () => deleteEntry(entry.id));
      else $('#backBtn', body).addEventListener('click', renderAddFood);
      upd();
      setTimeout(() => { gi.focus(); gi.select(); }, 50);
    });
  }

  function deleteEntry(id) {
    const day = getDay(state.date, true);
    day.entries = day.entries.filter(e => e.id !== id);
    saveData();
    closeModal();
    render();
    toast('Slettet');
  }

  function nutrientInputsHTML(keys, values = {}, suffix = 'pr. 100 g') {
    return keys.map(k => {
      const meta = NUTRIENTS[k];
      return `<label class="field">${meta.label} (${meta.unit})<input type="number" name="${k}" min="0" step="any" inputmode="decimal" value="${values[k] ?? ''}" ${k === 'kcal' ? 'required' : ''}></label>`;
    }).join('');
  }

  function paneCustom(pane) {
    pane.innerHTML = `
      <form class="form" id="customForm">
        <label class="field">Navn<input type="text" name="name" required maxlength="60" placeholder="Fx Mormors boller"></label>
        <div class="muted small">Næringsindhold pr. 100 g – aflæs fx varedeklarationen.</div>
        <div class="form-grid three">${nutrientInputsHTML(BASIC_FORM_KEYS)}</div>
        <details>
          <summary>Vitaminer og mineraler (valgfrit)</summary>
          <div class="form-grid three" style="margin-top:8px">${nutrientInputsHTML(MICRO_KEYS)}</div>
        </details>
        <div class="form-grid">
          <label class="field">Portionsnavn (valgfrit)<input type="text" name="pLabel" placeholder="Fx 1 stk"></label>
          <label class="field">Portion i gram<input type="number" name="pGrams" min="1" step="any"></label>
        </div>
        <div class="row"><span class="spacer"></span><button type="submit" class="btn primary">Gem og vælg mængde</button></div>
      </form>`;
    $('#customForm', pane).addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const per100 = {};
      for (const k of NKEYS) per100[k] = num(f.get(k));
      // Grundværdier, der ikke er udfyldt, sættes til 0 – mikro forbliver ukendt
      for (const k of ['protein', 'carbs', 'fat']) if (per100[k] == null) per100[k] = 0;
      const portions = [];
      const pg = num(f.get('pGrams'));
      if (pg) portions.push({ label: String(f.get('pLabel') || '1 portion').trim(), g: pg });
      const food = { key: 'c:' + uid(), name: String(f.get('name')).trim(), cat: 'Egen', src: 'custom', per100, portions };
      state.data.customFoods.push(food);
      saveData();
      toast('Fødevare gemt');
      showAmount(food);
    });
  }

  function paneQuick(pane, entry) {
    const v = entry ? entry.n : {};
    pane.innerHTML = `
      <form class="form" id="quickForm">
        <label class="field">Beskrivelse<input type="text" name="name" maxlength="60" value="${esc(entry ? entry.name : '')}" placeholder="Fx Frokost i kantinen"></label>
        <div class="form-grid">
          <label class="field">Kalorier (kcal)<input type="number" name="kcal" required min="0" step="1" value="${v.kcal ?? ''}" inputmode="decimal"></label>
          <label class="field">Måltid${mealSelectHTML(entry ? entry.meal : addCtx.meal)}</label>
          <label class="field">Protein (g)<input type="number" name="protein" min="0" step="any" value="${v.protein ?? ''}"></label>
          <label class="field">Kulhydrat (g)<input type="number" name="carbs" min="0" step="any" value="${v.carbs ?? ''}"></label>
          <label class="field">Fedt (g)<input type="number" name="fat" min="0" step="any" value="${v.fat ?? ''}"></label>
          <label class="field">Kostfibre (g)<input type="number" name="fiber" min="0" step="any" value="${v.fiber ?? ''}"></label>
        </div>
        <div class="muted small">Til når du ikke kender de præcise fødevarer – angiv det samlede indhold for hele portionen.</div>
        <div class="row">
          ${entry ? '<button type="button" class="btn danger" id="delBtn">Slet</button>' : ''}
          <span class="spacer"></span><button type="submit" class="btn primary">${entry ? 'Gem' : 'Tilføj'}</button>
        </div>
      </form>`;
    const form = $('#quickForm', pane);
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(form);
      const n = {};
      for (const k of NKEYS) n[k] = null;
      n.kcal = num(f.get('kcal')) || 0;
      for (const k of ['protein', 'carbs', 'fat']) n[k] = num(f.get(k)) ?? 0;
      n.fiber = num(f.get('fiber'));
      const name = String(f.get('name') || '').trim() || 'Hurtig registrering';
      const meal = f.get('meal');
      if (entry) Object.assign(entry, { name, meal, n });
      else getDay(state.date, true).entries.push({ id: uid(), meal, name, grams: null, food: null, quick: true, n, ts: Date.now() });
      saveData();
      closeModal();
      render();
      toast(entry ? 'Gemt' : 'Tilføjet');
    });
    if (entry) $('#delBtn', pane).addEventListener('click', () => deleteEntry(entry.id));
  }

  function paneBarcode(pane) {
    const hasDetector = 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
    pane.innerHTML = `
      <div class="row">
        <input type="text" id="code" inputmode="numeric" placeholder="Indtast stregkode (EAN)" style="flex:1">
        <button class="btn primary" id="lookBtn">Slå op</button>
      </div>
      ${hasDetector ? '<button class="btn" id="camBtn" style="margin-top:8px">📷 Scan med kamera</button>' : '<div class="note" style="margin-top:8px">Din browser understøtter ikke kamerascanning (virker typisk i Chrome på Android). Du kan indtaste tallene under stregkoden manuelt.</div>'}
      <video id="vid" playsinline muted style="width:100%;border-radius:12px;margin-top:8px;display:none"></video>
      <div id="bcMsg" style="margin-top:8px"></div>`;
    const msg = $('#bcMsg', pane);
    let stream = null, stop = false;
    const lookup = async code => {
      code = String(code).replace(/\D/g, '');
      if (code.length < 8) { msg.innerHTML = '<div class="warn-box">Stregkoden skal være mindst 8 cifre.</div>'; return; }
      msg.innerHTML = '<div class="muted small">Slår op i Open Food Facts…</div>';
      try {
        const food = await offBarcode(code);
        if (!food) { msg.innerHTML = `<div class="warn-box">Produktet ${esc(code)} findes ikke i Open Food Facts. Du kan oprette det under "Ny fødevare".</div>`; return; }
        if (food.per100.kcal == null) { msg.innerHTML = `<div class="warn-box">Produktet blev fundet (${esc(food.name)}), men mangler næringsdata. Opret det under "Ny fødevare".</div>`; return; }
        showAmount(food);
      } catch (e) {
        msg.innerHTML = '<div class="warn-box">Kunne ikke kontakte Open Food Facts. Tjek din internetforbindelse.</div>';
      }
    };
    $('#lookBtn', pane).addEventListener('click', () => lookup($('#code', pane).value));
    $('#code', pane).addEventListener('keydown', e => { if (e.key === 'Enter') lookup(e.target.value); });
    if (hasDetector) {
      $('#camBtn', pane).addEventListener('click', async () => {
        try {
          const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          const vid = $('#vid', pane);
          vid.srcObject = stream; vid.style.display = 'block';
          await vid.play();
          msg.innerHTML = '<div class="muted small">Hold stregkoden foran kameraet…</div>';
          const loop = async () => {
            if (stop) return;
            try {
              const codes = await detector.detect(vid);
              if (codes.length) { cleanup(); lookup(codes[0].rawValue); return; }
            } catch (e) {}
            requestAnimationFrame(loop);
          };
          loop();
        } catch (e) {
          msg.innerHTML = '<div class="warn-box">Kunne ikke starte kameraet. Kamera kræver typisk, at appen åbnes via https (fx GitHub Pages) eller localhost.</div>';
        }
      });
    }
    const cleanup = () => { stop = true; if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    return cleanup;
  }

  function openEditEntry(id) {
    const entry = getDay(state.date).entries.find(e => e.id === id);
    if (!entry) return;
    if (entry.food && entry.grams != null) {
      showAmount(entry.food, entry);
    } else {
      openModal('Redigér registrering', '<div id="addPane"></div>', body => paneQuick($('#addPane', body), entry));
    }
  }

  function copyMealFromYesterday(meal) {
    const src = getDay(addDays(state.date, -1)).entries.filter(e => e.meal === meal);
    const day = getDay(state.date, true);
    src.forEach(e => day.entries.push({ ...JSON.parse(JSON.stringify(e)), id: uid(), ts: Date.now() }));
    saveData();
    render();
    toast(`${src.length} ${src.length === 1 ? 'registrering' : 'registreringer'} kopieret`);
  }

  // ================================================================
  // Træning
  // ================================================================
  function openExercise(id) {
    const day = getDay(state.date, true);
    const x = id ? day.exercise.find(e => e.id === id) : null;
    openModal(x ? 'Redigér træning' : 'Tilføj træning', `
      <form class="form" id="exForm">
        <label class="field">Aktivitet<input type="text" name="name" required maxlength="50" value="${esc(x?.name || '')}" placeholder="Fx Løb, styrketræning"></label>
        <div class="form-grid">
          <label class="field">Varighed (min)<input type="number" name="minutes" min="0" step="1" value="${x?.minutes ?? ''}"></label>
          <label class="field">Forbrændt (kcal)<input type="number" name="kcal" required min="0" step="1" value="${x?.kcal ?? ''}"></label>
        </div>
        <div class="note">Brug gerne tallet fra dit ur eller din træningsapp. Senere kan træning hentes automatisk fra jeres træningsapps.</div>
        <div class="row">
          ${x ? '<button type="button" class="btn danger" id="delBtn">Slet</button>' : ''}
          <span class="spacer"></span><button class="btn primary" type="submit">${x ? 'Gem' : 'Tilføj'}</button>
        </div>
      </form>`, body => {
      const form = $('#exForm', body);
      form.addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(form);
        const data = { name: String(f.get('name')).trim(), minutes: num(f.get('minutes')), kcal: num(f.get('kcal')) || 0 };
        if (x) Object.assign(x, data);
        else day.exercise.push({ id: uid(), source: 'manual', ...data });
        saveData(); closeModal(); render();
      });
      if (x) $('#delBtn', body).addEventListener('click', () => {
        day.exercise = day.exercise.filter(e => e.id !== x.id);
        saveData(); closeModal(); render();
      });
    });
  }

  // ================================================================
  // Profiler, backup
  // ================================================================
  function switchProfile(id) {
    state.activeId = id;
    saveProfiles();
    loadData();
    state.date = todayKey();
    closeModal();
    render();
    toast('Skiftet til ' + activeProfile().name);
  }

  function openProfilePicker() {
    if (!activeProfile()) return;
    openModal('Profiler', `
      ${state.profiles.map(x => `
        <button class="result" data-id="${x.id}">
          <span class="avatar">${esc(x.name.charAt(0).toUpperCase())}</span>
          <div class="name">${esc(x.name)}</div>
          ${x.id === state.activeId ? '<span class="src">Aktiv</span>' : ''}
        </button>`).join('')}
      <button class="btn" id="newProf" style="margin-top:8px">+ Ny profil</button>`, body => {
      $$('.result', body).forEach(b => b.addEventListener('click', () => switchProfile(b.dataset.id)));
      $('#newProf', body).addEventListener('click', () => { closeModal(); startNewProfile(); });
    });
  }

  // ---------- Installation på telefon ----------
  let installPrompt = null;
  function isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  }
  function installCardHTML() {
    if (isInstalled()) return '';
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let body;
    if (location.protocol === 'file:') {
      body = 'Appen er åbnet som en lokal fil og kan derfor ikke installeres. Læg den på GitHub Pages (se README), og åbn adressen på telefonen.';
    } else if (installPrompt) {
      body = `Installér appen, så den får sit eget ikon og åbner i fuld skærm.<div style="margin-top:8px"><button class="btn primary" data-act="install">📲 Installér app</button></div>`;
    } else if (ios) {
      body = 'Åbn siden i <b>Safari</b>, tryk på <b>Del</b>-knappen (firkant med pil op) og vælg <b>Føj til hjemmeskærm</b>.';
    } else {
      body = 'Åbn browserens menu (⋮) og vælg <b>Installér app</b> eller <b>Føj til startskærm</b>.';
    }
    return `<div class="card"><div class="card-head"><h3>📱 Installér på telefonen</h3></div><p class="muted small" style="margin:0">${body}</p>
      <details style="margin-top:8px"><summary>Tjek om alt er på plads</summary><div id="installCheck" class="small" style="margin-top:6px">Tjekker…</div></details></div>`;
  }

  // Tjekker de ting, browseren kræver for at kunne installere appen
  async function runInstallCheck() {
    const el = $('#installCheck');
    if (!el) return;
    const exists = async url => {
      try { const r = await fetch(url + '?check=' + Date.now(), { cache: 'no-store' }); return r.ok; } catch (e) { return false; }
    };
    const checks = [];
    checks.push(['Sikker forbindelse (https)', window.isSecureContext && location.protocol !== 'file:']);
    const files = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'sw.js'];
    const found = await Promise.all(files.map(exists));
    files.forEach((f, i) => checks.push([`Filen ${f} findes`, found[i]]));
    let swOk = false;
    try { const reg = await navigator.serviceWorker?.getRegistration(); swOk = !!(reg && (reg.active || reg.waiting || reg.installing)); } catch (e) {}
    checks.push(['Service worker kører', swOk]);
    const failed = checks.filter(c => !c[1]);
    el.innerHTML = checks.map(([label, ok]) => `<div>${ok ? '✅' : '❌'} ${esc(label)}</div>`).join('') +
      (failed.length
        ? `<div class="warn-box" style="margin-top:8px">Mangler du filer, så upload dem til samme sted som index.html på GitHub. Vent et par minutter, og genindlæs siden.</div>`
        : `<div class="note" style="margin-top:8px">Alt ser fint ud. Kan Chrome stadig ikke installere appen, så luk fanen, åbn adressen igen, og vælg ⋮ → Installér app / Føj til startskærm.</div>`);
  }

  function startNewProfile() {
    $$('.view').forEach(v => { v.hidden = true; v.innerHTML = ''; });
    renderOnboarding(true);
    window.scrollTo(0, 0);
  }

  function deleteProfile(id) {
    const p = state.profiles.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Slet profilen "${p.name}" og alle dens data? Det kan ikke fortrydes.`)) return;
    state.profiles = state.profiles.filter(x => x.id !== id);
    store.remove('data.' + id);
    if (state.activeId === id) state.activeId = state.profiles[0]?.id || null;
    saveProfiles();
    loadData();
    render();
    toast('Profil slettet');
  }

  function exportData() {
    const payload = {
      app: 'kalorietracker', version: SCHEMA_VERSION, exported: new Date().toISOString(),
      activeProfile: state.activeId,
      profiles: state.profiles.map(p => ({ profile: p, data: store.get('data.' + p.id, emptyData()) }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diet-backup-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloadet');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const json = JSON.parse(await file.text());
        if (json.app !== 'kalorietracker' || !Array.isArray(json.profiles)) throw new Error('format');
        const replace = state.profiles.length === 0 || confirm('Erstat eksisterende profiler med dem fra backuppen?\n\nOK = erstat alt · Annullér = tilføj/opdatér profiler fra backuppen');
        if (replace) { state.profiles.forEach(p => store.remove('data.' + p.id)); state.profiles = []; }
        for (const { profile, data } of json.profiles) {
          state.profiles = state.profiles.filter(p => p.id !== profile.id);
          state.profiles.push(profile);
          store.set('data.' + profile.id, data);
        }
        state.activeId = json.profiles.some(x => x.profile.id === json.activeProfile) ? json.activeProfile : json.profiles[0]?.profile.id || state.activeId;
        saveProfiles(); loadData(); state.view = 'today';
        $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === 'today'));
        render();
        toast('Backup importeret');
      } catch (e) {
        toast('Filen kunne ikke læses som en backup');
      }
    });
    input.click();
  }

  // ================================================================
  // Hændelser
  // ================================================================
  $('#tabbar').addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (b) setView(b.dataset.view);
  });
  $('#profileBtn').addEventListener('click', openProfilePicker);

  $('#app').addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    switch (act) {
      case 'prev-day': state.date = addDays(state.date, -1); render(); break;
      case 'next-day': state.date = addDays(state.date, 1); render(); break;
      case 'goto-today': state.date = todayKey(); render(); break;
      case 'add-food': openAddFood(t.dataset.meal); break;
      case 'edit-entry': openEditEntry(t.dataset.id); break;
      case 'copy-meal': copyMealFromYesterday(t.dataset.meal); break;
      case 'water': {
        const day = getDay(state.date, true);
        day.water = Math.max(0, day.water + Number(t.dataset.ml));
        saveData(); render(); break;
      }
      case 'add-exercise': openExercise(null); break;
      case 'edit-exercise': openExercise(t.dataset.id); break;
      case 'nrange': state.nutritionRange = t.dataset.r; render(); break;
      case 'save-weight': {
        const date = $('#wDate').value, kg = num($('#wKg').value);
        if (!date || !kg || kg < 20 || kg > 400) { toast('Indtast en gyldig vægt'); return; }
        state.data.weights = state.data.weights.filter(w => w.date !== date);
        state.data.weights.push({ date, kg });
        saveData(); render(); toast('Vægt gemt – dine mål er opdateret');
        break;
      }
      case 'del-weight':
        state.data.weights = state.data.weights.filter(w => w.date !== t.dataset.date);
        saveData(); render(); break;
      case 'new-profile': startNewProfile(); break;
      case 'cancel-new': document.body.classList.remove('onboarding'); render(); break;
      case 'switch-profile': switchProfile(t.dataset.id); break;
      case 'delete-profile': deleteProfile(t.dataset.id); break;
      case 'delete-custom':
        state.data.customFoods = state.data.customFoods.filter(f => f.key !== t.dataset.key);
        state.data.recent = state.data.recent.filter(f => f.key !== t.dataset.key);
        saveData(); render(); break;
      case 'export': exportData(); break;
      case 'import': importData(); break;
      case 'install':
        if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; render(); }); }
        break;
    }
  });

  // ================================================================
  // Offentligt API til senere integration med træningsapps
  // ================================================================
  window.Diet = window.Kalorietracker = {
    /** Tilføj træning for en dato: { date:'YYYY-MM-DD', name, kcal, minutes, source, externalId } */
    addExercise(x) {
      if (!state.data) return false;
      const day = getDay(x.date || todayKey(), true);
      if (x.externalId && day.exercise.some(e => e.externalId === x.externalId)) return false;
      day.exercise.push({ id: uid(), name: x.name || 'Træning', kcal: Number(x.kcal) || 0, minutes: x.minutes ?? null, source: x.source || 'ekstern', externalId: x.externalId || null });
      saveData(); render();
      return true;
    },
    /** Hent dagsoversigt: indtag, mål og træning */
    getDay(date = todayKey()) {
      if (!state.data) return null;
      const day = getDay(date);
      return { date, totals: sumEntries(day.entries).total, targets: targetsFor(date), exercise: day.exercise, water: day.water };
    }
  };

  // ================================================================
  // Start
  // ================================================================
  if (state.activeId && !state.profiles.some(p => p.id === state.activeId)) state.activeId = state.profiles[0]?.id || null;
  loadData();
  render();

  // Installation som app (PWA) – kræver https, fx GitHub Pages
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // Bed browseren om ikke at slette data automatisk (vigtigt på iPhone)
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    if (state.view === 'profile') render();
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; toast('Appen er installeret'); });
})();
