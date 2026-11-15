const $ = id => document.getElementById(id);
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

let hinos = [], visiveis = [], atual = null;
const fav = new Set(JSON.parse(localStorage.getItem('h5fav') || '[]'));
let tamFonte = parseFloat(localStorage.getItem('h5fonte') || '1.15');

const FINAIS = [
  { n: 1, tom: 'Ré',  arq: 'final1.pdf' },
  { n: 2, tom: 'Mi♭', arq: 'final2.pdf' },
  { n: 3, tom: 'Fá',  arq: 'final3.pdf' },
  { n: 4, tom: 'Sol', arq: 'final4.pdf' },
  { n: 5, tom: 'Lá',  arq: 'final5.pdf' },
  { n: 6, tom: 'Si♭', arq: 'final6.pdf' },
  { n: 7, tom: 'Dó',  arq: 'final7.pdf' }
];

/* ---------- Dados ---------- */
async function init() {
  try { hinos = await (await fetch('./dados/hinos.json', { cache: 'no-cache' })).json(); }
  catch { hinos = []; }
  hinos.sort((a, b) => a.numero - b.numero);
  aplicarFonte();
  renderLista();
  renderFinais();
  history.replaceState({ tela: 'lista' }, '');
}

/* ---------- Lista ---------- */
function renderLista() {
  const q = norm($('busca').value.trim());
  visiveis = hinos.filter(h =>
    (!q || String(h.numero).startsWith(q) || norm(h.titulo).includes(q)) &&
    (!$('favOnly').checked || fav.has(String(h.numero)))
  );
  const lista = $('lista');
  lista.innerHTML = '';
  visiveis.forEach(h => {
    const b = document.createElement('button');
    b.className = 'item';
    b.innerHTML = `<b>${h.numero}</b> ${esc(h.titulo)}${fav.has(String(h.numero)) ? ' ★' : ''}`;
    b.onclick = () => abrirHino(h, true);
    lista.append(b);
  });
  $('vazio').hidden = visiveis.length > 0;
  $('vazio').textContent = hinos.length ? 'Nenhum hino encontrado.' : 'Catálogo ainda não carregado.';
  $('tituloLista').textContent = `Hinos (${visiveis.length})`;
}

/* ---------- Hino ---------- */
function abrirHino(h, empilhar) {
  atual = h;
  $('titulo').textContent = `${h.numero} — ${h.titulo}`;
  const t = $('texto');
  t.innerHTML = '';
  const partes = h.estrofes || (h.letra ? [{ tipo: 'estrofe', texto: h.letra }] : []);
  if (!partes.length) t.textContent = 'Letra não cadastrada.';
  let n = 0;
  partes.forEach(p => {
    const d = document.createElement('p');
    const coro = p.tipo === 'coro';
    d.className = 'estrofe' + (coro ? ' coro' : '');
    d.innerHTML = `<span class="rotulo">${coro ? 'Coro' : ++n}</span>${esc(p.texto)}`;
    t.append(d);
  });
  atualizarFavBtn();
  const i = visiveis.indexOf(h);
  $('anterior').disabled = i <= 0;
  $('proximo').disabled = i < 0 || i >= visiveis.length - 1;
  $('filtros').hidden = $('lista').hidden = $('vazio').hidden = $('tituloLista').hidden = true;
  $('detalhe').hidden = false;
  scrollTo(0, 0);
  if (empilhar) history.pushState({ tela: 'hino' }, '');
}

function fecharHino() {
  $('detalhe').hidden = true;
  $('filtros').hidden = $('lista').hidden = $('tituloLista').hidden = false;
  renderLista();
}

function atualizarFavBtn() {
  $('favorito').textContent = fav.has(String(atual.numero)) ? '★ Remover favorito' : '☆ Favoritar';
}

function aplicarFonte() {
  $('texto').style.setProperty('--tam', tamFonte + 'rem');
  localStorage.setItem('h5fonte', tamFonte);
}

/* ---------- Finais (PDFs publicados em ./finais/, exibidos com PDF.js) ---------- */
let pdfjs = null, pdfAtual = null, zoom = 1;

async function carregarPdfjs() {
  if (!pdfjs) {
    const base = new URL('./js/pdfjs/', location.href).href;
    pdfjs = await import(base + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  }
  return pdfjs;
}

function renderFinais() {
  const l = $('listaFinais');
  l.innerHTML = '';
  FINAIS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'item';
    b.innerHTML = `<b>Final ${f.n}</b> ${f.tom}`;
    b.onclick = () => abrirFinal(f);
    l.append(b);
  });
}

async function abrirFinal(f) {
  $('visorTitulo').textContent = `Final ${f.n} — ${f.tom}`;
  $('visorPaginas').innerHTML = '<p class="visorMsg">Carregando…</p>';
  $('visor').hidden = false;
  history.pushState({ tela: 'visor' }, '');
  try {
    const lib = await carregarPdfjs();
    pdfAtual = await lib.getDocument('./finais/' + f.arq).promise;
    zoom = 1;
    await desenharPdf();
  } catch (e) {
    $('visorPaginas').innerHTML = `<p class="visorMsg">Não foi possível abrir a Final ${f.n}.<br>Verifique se o arquivo finais/${f.arq} foi publicado.</p>`;
  }
}

async function desenharPdf() {
  if (!pdfAtual) return;
  const area = $('visorPaginas');
  const largura = area.clientWidth - 20;
  const dpr = window.devicePixelRatio || 1;
  area.innerHTML = '';
  for (let i = 1; i <= pdfAtual.numPages; i++) {
    const pag = await pdfAtual.getPage(i);
    const base = pag.getViewport({ scale: 1 });
    const vp = pag.getViewport({ scale: (largura / base.width) * zoom * dpr });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    c.style.width = (vp.width / dpr) + 'px';
    c.style.height = (vp.height / dpr) + 'px';
    area.append(c);
    await pag.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
}

function fecharVisor() { $('visor').hidden = true; $('visorPaginas').innerHTML = ''; pdfAtual = null; }

/* ---------- Abas ---------- */
document.querySelectorAll('.abas button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.abas button').forEach(x => x.classList.toggle('ativa', x === b));
  $('abaHinos').hidden = b.dataset.aba !== 'hinos';
  $('abaFinais').hidden = b.dataset.aba !== 'finais';
});

/* ---------- Eventos ---------- */
$('busca').oninput = renderLista;
$('favOnly').onchange = renderLista;
$('voltar').onclick = () => history.back();
$('visorFechar').onclick = () => history.back();
$('zoomMais').onclick = () => { zoom = Math.min(3, zoom + 0.25); desenharPdf(); };
$('zoomMenos').onclick = () => { zoom = Math.max(0.5, zoom - 0.25); desenharPdf(); };
$('favorito').onclick = () => {
  const n = String(atual.numero);
  fav.has(n) ? fav.delete(n) : fav.add(n);
  localStorage.setItem('h5fav', JSON.stringify([...fav]));
  atualizarFavBtn();
};
$('fonteMais').onclick = () => { tamFonte = Math.min(2.2, +(tamFonte + 0.1).toFixed(2)); aplicarFonte(); };
$('fonteMenos').onclick = () => { tamFonte = Math.max(0.9, +(tamFonte - 0.1).toFixed(2)); aplicarFonte(); };
$('anterior').onclick = () => { const i = visiveis.indexOf(atual); if (i > 0) abrirHino(visiveis[i - 1], false); };
$('proximo').onclick = () => { const i = visiveis.indexOf(atual); if (i < visiveis.length - 1) abrirHino(visiveis[i + 1], false); };

// Botão Voltar do Android
addEventListener('popstate', () => {
  if (!$('visor').hidden) return fecharVisor();
  if (!$('detalhe').hidden) return fecharHino();
});

function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
init();
