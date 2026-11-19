/* ATLAS · Bolsa de emprego (pedido do Pedro, 19 Nov. 2026)
   As ofertas em vigor no mesmo mapa dos Guias de Arquitectura (regiões a cor, concelhos, Açores e Madeira em molduras)
   e numa lista arrumada por região. */
(function(){
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const root = $('#emp'); if (!root) return;
const snap = id => { const e = document.getElementById(id); try { return e ? JSON.parse(e.textContent) : null; } catch (x) { return null; } };
const CFG = snap('atlas-cfg') || {};
const SEC = CFG.sec || {}, ORDER = CFG.secOrder || Object.keys(SEC);
const MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESF = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const dcurta = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MES[m - 1]} ${y}`; };
const dlonga = s => { const [y, m, d] = s.split('-').map(Number); return `${d} de ${MESF[m - 1]} de ${y}`; };
const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const dias = s => Math.round((new Date(s + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 864e5);
const EXT = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5h5v5M9.5 2.5L3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
async function fresh(name, fallback){
  if (!CFG.data) return fallback;
  try { const r = await fetch(CFG.data + name + '?t=' + Math.floor(Date.now() / 3e5)); if (r.ok) return await r.json(); } catch (x) {}
  return fallback;
}
const estagio = o => /est[aá]gi/i.test(o.t) || /^est[aá]gi/i.test(o.resumo || '');
const state = {sec: 'all', q: '', tipo: 'all', sel: null};
let D = null, OF = [], map = null, markers = {}, mlayer = null, secFill = null;

function visiveis(){
  const q = fold(state.q).trim();
  return OF.filter(o => (state.sec === 'all' || o.sec === state.sec) && (state.tipo === 'all' || (state.tipo === 'estagio') === estagio(o)) &&
    (!q || fold([o.t, o.ent, o.loc, o.resumo, o.funcoes, o.requisitos, (SEC[o.sec] || {}).nome].join(' ')).includes(q)));
}

/* ---------------------------------------------------------------- lista */
function cartao(o){
  const s = SEC[o.sec] || {nome: 'Sem região', cor: '#8c8c8c'};
  const dd = o.prazo ? dias(o.prazo) : null;
  const prazo = o.prazo ? `<span class="pill${dd <= 7 ? ' dark' : ''}">Candidaturas até ${dcurta(o.prazo)}</span>` : '<span class="pill out">Sem prazo indicado</span>';
  const det = [o.funcoes && ['Funções', o.funcoes], o.requisitos && ['Requisitos', o.requisitos]].filter(Boolean);
  return `<article class="eo${state.sel === o.id ? ' sel' : ''}" id="o-${o.id}" data-id="${o.id}" style="--c:${s.cor}">
<div class="tg"><span class="pill rg"><i></i>${esc(s.nome)}</span>${prazo}${estagio(o) ? '<span class="pill out">Estágio</span>' : ''}</div>
<h3><a href="${esc(o.u)}" target="_blank" rel="noopener">${esc(o.t)}</a></h3>
<div class="m">${esc([o.ent, o.loc].filter(Boolean).join(' · '))}</div>
${o.resumo ? `<p class="er">${esc(o.resumo)}</p>` : ''}
${det.length ? `<details class="ed"><summary>Funções e requisitos</summary>${det.map(([k, v]) => `<p><b>${k}.</b> ${esc(v)}</p>`).join('')}</details>` : ''}
<div class="lnks"><a class="lnk dark" href="${esc(o.u)}" target="_blank" rel="noopener">Ver a oferta e candidatar-se ${EXT}</a>${o.site ? `<a class="lnk" href="${esc(o.site)}" target="_blank" rel="noopener">Sítio da entidade ${EXT}</a>` : ''}${o.lat != null ? `<button class="lnk" type="button" data-ver="${o.id}">Ver no mapa</button>` : ''}</div>
${o.pub ? `<div class="src">Publicada a ${dlonga(o.pub)}</div>` : ''}</article>`;
}
function desenharLista(){
  const box = $('#emp-list'), list = visiveis();
  const grupos = [...ORDER, '_'].map(id => [id, list.filter(o => (id === '_' ? !SEC[o.sec] : o.sec === id))]).filter(([, l]) => l.length);
  box.innerHTML = grupos.length ? grupos.map(([id, l]) => { const s = SEC[id] || {nome: 'Sem região', cor: '#8c8c8c'};
    return `<section class="egrp" data-sec="${esc(id)}" style="--c:${s.cor}"><h2 class="nmonth eh"><i></i>${esc(s.nome)}<span class="gn num">${l.length} ${l.length === 1 ? 'oferta' : 'ofertas'}</span></h2>${l.map(cartao).join('')}</section>`; }).join('')
    : '<p class="empty">Nenhuma oferta corresponde aos filtros escolhidos.</p>';
  const c = $('#cnt-e'); if (c) c.textContent = `${list.length} ${list.length === 1 ? 'oferta' : 'ofertas'}`;
  desenharMarcadores(list);
}
function desenharFiltros(){
  const rb = $('#regs-e'); if (!rb) return;
  const n = id => OF.filter(o => id === 'all' || o.sec === id).length;
  rb.innerHTML = '<span class="lab">Região</span>' + [['all', {nome: 'Todas'}], ...ORDER.map(id => [id, SEC[id]])].map(([id, s]) =>
    `<button class="fb" type="button" data-sec="${esc(id)}" aria-pressed="${state.sec === id}"${id === 'all' ? '' : ` style="--c:${s.cor}"`}${id !== 'all' && !n(id) ? ' disabled' : ''}>${id === 'all' ? '' : '<i></i>'}${esc(s.nome)} <span class="n num">${n(id)}</span></button>`).join('');
}

/* ---------------------------------------------------------------- mapa (o dos Guias de Arquitectura) */
const INS = {ACORES: {c: [38.327, -28.141], k: .55, t: [41.08, -12.27]}, MAD: {c: [32.766, -16.7715], k: 1.5, t: [37.73, -11.3]}};
const zoneOf = (lat, lng) => lng < -20 ? 'ACORES' : (lng < -15 && lat < 34.5 ? 'MAD' : null);
const shiftLL = (lat, lng) => { const z = zoneOf(lat, lng); if (!z) return [lat, lng]; const {c, k, t} = INS[z]; return [t[0] + (lat - c[0]) * k, t[1] + (lng - c[1]) * k]; };
const FRAME = {ACORES: [[40.06, -14.24], [42.1, -10.3]], MAD: [[36.965, -12.295], [38.495, -10.305]]};
const FULL = [[36.9, -14.4], [42.35, -6.15]], MAINLAND = [[36.95, -9.6], [42.16, -6.2]];
const loadJS = src => new Promise((ok, ko) => { const x = document.createElement('script'); x.src = src; x.onload = ok; x.onerror = ko; document.head.appendChild(x); });
const NUDGE = {};
function afastar(){                                 /* ofertas no mesmo sítio afastam-se uns metros, para se verem todas */
  const by = {}; OF.forEach(o => { if (o.lat != null) (by[o.lat.toFixed(4) + ',' + o.lng.toFixed(4)] ||= []).push(o.id); });
  Object.values(by).forEach(ids => { if (ids.length > 1) ids.forEach((id, i) => { const a = i * 2.4, r = .0009 * Math.sqrt(i + .6); NUDGE[id] = [r * Math.sin(a), r * Math.cos(a) * 1.25]; }); });
}
const pos = o => { const n = NUDGE[o.id] || [0, 0]; return shiftLL(o.lat + n[0], o.lng + n[1]); };
async function iniciarMapa(){
  const el = $('#emp-map');
  const topo = root.dataset.topo;
  if (!topo) { el.remove(); root.classList.add('semapa'); return; }
  try {
    if (!window.L) await loadJS('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js');
    if (!window.topojson) await loadJS('https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js');
    const [TS, TC] = await Promise.all(['seccoes.topo.json', 'concelhos.topo.json'].map(f => fetch(topo + f).then(r => { if (!r.ok) throw 0; return r.json(); })));
    map = L.map(el, {zoomControl: false, preferCanvas: true, minZoom: 5, maxZoom: 16, zoomSnap: .25, zoomDelta: .5, scrollWheelZoom: false});
    L.control.zoom({position: 'topright'}).addTo(map);
    map.attributionControl.setPrefix('Leaflet').addAttribution('Limites: CAOP, DGT');
    const c2l = c => L.latLng(shiftLL(c[1], c[0]));
    const geo = (g, o) => L.geoJSON(g, Object.assign({interactive: false, coordsToLatLng: c2l}, o));
    const gS = topojson.feature(TS, TS.objects.seccoes), gC = topojson.feature(TC, TC.objects.concelhos);
    const secOn = s => state.sec === 'all' || s === state.sec;
    const fillStyle = f => { const z = map.getZoom(), s = f.properties.s;
      return {stroke: false, fill: true, fillColor: secOn(s) ? ((SEC[s] || {}).cor || '#bdbdbd') : '#e4e4e4', fillOpacity: z < 8.5 ? 1 : z < 11 ? .7 : .35}; };
    const concStyle = () => { const z = map.getZoom(); return {color: '#fff', weight: z < 8.5 ? .5 : .8, opacity: z < 8.5 ? .6 : .9, fill: false}; };
    secFill = geo(gS, {style: fillStyle}).addTo(map);
    const conc = geo(gC, {style: concStyle}).addTo(map);
    const line = geo(gS, {style: () => ({color: '#1b1b1b', weight: map.getZoom() < 8.5 ? 1 : 1.5, fill: false, lineJoin: 'round'})}).addTo(map);
    L.layerGroup(Object.values(FRAME).map(b => L.rectangle(b, {interactive: false, color: '#c9c5bd', weight: 1.4, fill: false}))).addTo(map);
    const LABEL = {ACORES: [FRAME.ACORES[1][0], FRAME.ACORES[0][1]], MAD: [FRAME.MAD[1][0], FRAME.MAD[0][1]]};
    const ink = hex => { const h = hex.replace('#', ''), lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * lin(parseInt(h.slice(0, 2), 16)) + .7152 * lin(parseInt(h.slice(2, 4), 16)) + .0722 * lin(parseInt(h.slice(4, 6), 16)) >= .179 ? '#111' : '#fff'; };
    Object.entries(LABEL).forEach(([id, ll]) => { if (SEC[id]) L.marker(ll, {interactive: false, keyboard: false, icon: L.divIcon({className: 'slbl inset', iconSize: null,
      html: `<span style="--c:${SEC[id].cor};--ci:${ink(SEC[id].cor)}">${esc(SEC[id].nome)}</span>`})}).addTo(map); });
    map.restyle = () => { secFill.setStyle(fillStyle); conc.setStyle(concStyle); line.setStyle({weight: map.getZoom() < 8.5 ? 1 : 1.5}); };
    map.on('zoomend', () => { map.restyle(); desenharMarcadores(visiveis()); });
    mlayer = L.layerGroup().addTo(map);
    map.fitBounds(innerWidth > 760 ? FULL : MAINLAND);
    el.addEventListener('click', () => map.scrollWheelZoom.enable(), {once: true});
  } catch (x) {
    el.remove(); root.classList.add('semapa'); map = null;
  }
}
function desenharMarcadores(list){
  if (!map || !mlayer) return;
  mlayer.clearLayers(); markers = {};
  const z = map.getZoom();
  list.forEach(o => {
    if (o.lat == null) return;
    const sel = state.sel === o.id;
    const m = L.circleMarker(pos(o), {radius: sel ? 8 : z >= 11 ? 6 : z >= 8.5 ? 5 : 4, color: '#fff', weight: sel ? 2.5 : 1.4, fillColor: sel ? '#1b1b1b' : '#111', fillOpacity: 1});
    m.bindTooltip(`<b>${esc(o.ent || o.t)}</b><br>${esc(o.t)}`, {className: 'tt', direction: 'top', offset: [0, -6]});
    m.on('click', () => escolher(o.id, true));
    m.addTo(mlayer); markers[o.id] = m;
    if (sel) m.bringToFront();
  });
}
function escolher(id, rolar){
  state.sel = id;
  $$('.eo.sel').forEach(x => x.classList.remove('sel'));
  const c = document.getElementById('o-' + id);
  if (c) { c.classList.add('sel'); if (rolar) c.scrollIntoView({behavior: 'smooth', block: 'center'}); }
  desenharMarcadores(visiveis());
}
function enquadrar(){
  if (!map) return;
  const pts = visiveis().filter(o => o.lat != null).map(pos);
  if (state.sec === 'all' || !pts.length) map.fitBounds(innerWidth > 760 ? FULL : MAINLAND);
  else map.fitBounds(L.latLngBounds(pts).pad(.25), {maxZoom: 10});
}

/* ---------------------------------------------------------------- arranque */
(async () => {
  D = await fresh('emprego.json', snap('snap-emprego')) || {ofertas: []};
  const h = hoje();
  OF = (D.ofertas || []).filter(o => !o.prazo || o.prazo >= h);       /* o prazo conta no dia em que se abre a página */
  afastar();
  const t = $('#tot-e'); if (t) t.textContent = OF.length;
  const u = $('#upd-e'); if (u && D.actualizado) u.textContent = dlonga(D.actualizado);
  $$('[data-emp-count]').forEach(e => e.textContent = OF.length);
  desenharFiltros();
  await iniciarMapa();
  desenharLista();
  $('#regs-e').addEventListener('click', ev => { const b = ev.target.closest('[data-sec]'); if (!b || b.disabled) return;
    state.sec = b.dataset.sec; state.sel = null; $$('#regs-e [data-sec]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (map) map.restyle(); desenharLista(); enquadrar(); });
  let qT; $('#q-e').addEventListener('input', ev => { clearTimeout(qT); qT = setTimeout(() => { state.q = ev.target.value; desenharLista(); }, 160); });
  $('#tipo-e').addEventListener('change', ev => { state.tipo = ev.target.value; desenharLista(); });
  $('#emp-list').addEventListener('click', ev => { const b = ev.target.closest('[data-ver]'); if (!b) return;
    const o = OF.find(x => x.id === Number(b.dataset.ver)); if (!o || !map) return;
    escolher(o.id, false); map.flyTo(pos(o), Math.max(map.getZoom(), 11), {duration: .6}); $('#emp-map').scrollIntoView({behavior: 'smooth', block: 'nearest'}); });
  $('#emp-list').addEventListener('pointerover', ev => { const c = ev.target.closest('.eo'); if (!c || !markers[c.dataset.id]) return;
    const m = markers[c.dataset.id]; m.setStyle({radius: 8, weight: 2.5}); m.bringToFront(); });
  $('#emp-list').addEventListener('pointerout', ev => { const c = ev.target.closest('.eo'); if (!c || !markers[c.dataset.id] || state.sel === Number(c.dataset.id)) return;
    const z = map.getZoom(); markers[c.dataset.id].setStyle({radius: z >= 11 ? 6 : z >= 8.5 ? 5 : 4, weight: 1.4}); });
})();
})();
