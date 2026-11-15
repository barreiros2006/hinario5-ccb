const $ = id => document.getElementById(id);
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const FINAIS = [
  { n: 1, tom: 'Ré',  arq: 'final1.pdf' },
  { n: 2, tom: 'Mi♭', arq: 'final2.pdf' },
  { n: 3, tom: 'Fá',  arq: 'final3.pdf' },
  { n: 4, tom: 'Sol', arq: 'final4.pdf' },
  { n: 5, tom: 'Lá',  arq: 'final5.pdf' },
  { n: 6, tom: 'Si♭', arq: 'final6.pdf' },
  { n: 7, tom: 'Dó',  arq: 'final7.pdf' }
];
const CATEGORIAS = ['Culto oficial', 'Jovens e menores', 'Santa Ceia', 'Batismo', 'Funeral', 'Coros'];

let hinos = [], visiveis = [], atual = null;
const fav = new Set(JSON.parse(localStorage.getItem('h5fav') || '[]'));
let tamFonte = parseFloat(localStorage.getItem('h5fonte') || '1.15');
let arqAtual = localStorage.getItem('h5arq') || FINAIS[0].arq;
let zoomHino = parseFloat(localStorage.getItem('h5zoom') || '1');
let modoPartitura = false;

const rotulo = h => h.categoria === 'Coros' ? `Coro ${h.numero}` : h.numero;

/* ---------- Início ---------- */
async function init() {
  CATEGORIAS.forEach(c => $('categoria').add(new Option(c, c)));
  FINAIS.forEach(f => $('tom').add(new Option(`Final ${f.n} (${f.tom})`, f.arq)));
  $('tom').value = arqAtual;
  renderFinais();
  aplicarFonte();
  history.replaceState({ tela: 'lista' }, '');
  try {
    hinos = await (await fetch('./dados/hinos.json', { cache: 'no-cache' })).json();
  } catch { hinos = []; }
  // índice de busca: número, título e letra sem acentos
  hinos.forEach(h => h._busca = norm(h.titulo + ' ' + h.estrofes.map(e => e.texto).join(' ')));
  renderLista();
}

/* ---------- Lista ---------- */
function renderLista() {
  const q = norm($('busca').value.trim());
  const cat = $('categoria').value;
  const soNumero = /^\d+$/.test(q);
  visiveis = hinos.filter(h =>
    (!cat || h.categoria === cat) &&
    (!$('favOnly').checked || fav.has(h.id)) &&
    (!q || (soNumero ? String(h.numero).startsWith(q) : h._busca.includes(q)))
  );
  if (soNumero) visiveis.sort((a, b) => (String(b.numero) === q) - (String(a.numero) === q));
  const lista = $('lista');
  lista.innerHTML = '';
  const frag = document.createDocumentFragment();
  visiveis.forEach(h => {
    const b = document.createElement('button');
    b.className = 'item';
    b.innerHTML = `<b>${rotulo(h)}</b> ${esc(h.titulo)}${fav.has(h.id) ? ' ★' : ''}` +
      (cat ? '' : `<small>${esc(h.categoria)}</small>`);
    b.onclick = () => abrirHino(h, true);
    frag.append(b);
  });
  lista.append(frag);
  $('vazio').hidden = visiveis.length > 0;
  $('vazio').textContent = hinos.length ? 'Nenhum hino encontrado.' : 'Não foi possível carregar os hinos. Verifique a internet e recarregue.';
  $('tituloLista').textContent = `Hinos (${visiveis.length})`;
}

/* ---------- Hino ---------- */
function abrirHino(h, empilhar) {
  atual = h;
  $('titulo').textContent = `${rotulo(h)} — ${h.titulo}`;
  $('catHino').textContent = h.categoria;
  const t = $('texto');
  t.innerHTML = '';
  let n = 0;
  h.estrofes.forEach(p => {
    const d = document.createElement('p');
    const coro = p.tipo === 'coro';
    d.className = 'estrofe' + (coro ? ' coro' : '');
    const r = h.categoria === 'Coros' ? '' : `<span class="rotulo">${coro ? 'Coro' : ++n}</span>`;
    d.innerHTML = r + esc(p.texto);
    t.append(d);
  });
  atualizarFavBtn();
  $('verPartitura').hidden = h.categoria === 'Coros';
  const i = visiveis.indexOf(h);
  $('anterior').disabled = i <= 0;
  $('proximo').disabled = i < 0 || i >= visiveis.length - 1;
  $('filtros').hidden = $('lista').hidden = $('vazio').hidden = $('tituloLista').hidden = true;
  $('detalhe').hidden = false;
  scrollTo(0, 0);
  if (empilhar) history.pushState({ tela: 'hino' }, '');
  mostrarModo();
}

function mostrarModo() {
  const part = modoPartitura && atual && atual.categoria !== 'Coros';
  $('texto').hidden = part;
  $('partitura').hidden = !part;
  $('tom').hidden = !part;
  $('verPartitura').classList.toggle('ativo', part);
  $('verPartitura').textContent = part ? '📖 Letra' : '🎼 Partitura';
  $('fonteMenos').setAttribute('aria-label', part ? 'Diminuir zoom' : 'Diminuir letra');
  $('fonteMais').setAttribute('aria-label', part ? 'Aumentar zoom' : 'Aumentar letra');
  if (part) desenharPartitura(atual);
}

function fecharHino() {
  $('detalhe').hidden = true;
  $('filtros').hidden = $('lista').hidden = $('tituloLista').hidden = false;
  renderLista();
}

function atualizarFavBtn() {
  $('favorito').textContent = fav.has(atual.id) ? '★ Remover favorito' : '☆ Favoritar';
}

function aplicarFonte() {
  $('texto').style.setProperty('--tam', tamFonte + 'rem');
  localStorage.setItem('h5fonte', tamFonte);
}

/* ---------- PDF.js ---------- */
let pdfjs = null;
const pdfsAbertos = {};
async function carregarPdfjs() {
  if (!pdfjs) {
    const base = new URL('./js/pdfjs/', location.href).href;
    pdfjs = await import(base + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  }
  return pdfjs;
}
async function abrirPdf(arq) {
  if (!pdfsAbertos[arq]) {
    const lib = await carregarPdfjs();
    pdfsAbertos[arq] = lib.getDocument({ url: './finais/' + arq, disableRange: true, disableStream: true }).promise
      .catch(e => { delete pdfsAbertos[arq]; throw e; });
  }
  return pdfsAbertos[arq];
}
async function desenharPagina(pdf, n, largura, zoom) {
  const pag = await pdf.getPage(n);
  const dpr = window.devicePixelRatio || 1;
  const base = pag.getViewport({ scale: 1 });
  const vp = pag.getViewport({ scale: (largura / base.width) * zoom * dpr });
  const c = document.createElement('canvas');
  c.width = vp.width; c.height = vp.height;
  c.style.width = (vp.width / dpr) + 'px';
  c.style.height = (vp.height / dpr) + 'px';
  await pag.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}

/* Índice (nº do hino -> página do PDF), montado 1 vez por arquivo e guardado no aparelho */
const VERSAO_INDICE = 1;
async function obterIndice(arq, aviso) {
  const chave = `h5idx${VERSAO_INDICE}_${arq}`;
  const salvo = localStorage.getItem(chave);
  if (salvo) return JSON.parse(salvo);
  const pdf = await abrirPdf(arq);
  const mapa = {};
  for (let i = 1; i <= pdf.numPages; i++) {
    if (aviso && i % 5 === 0) aviso(`Preparando as partituras (só na primeira vez)… página ${i} de ${pdf.numPages}`);
    const tc = await (await pdf.getPage(i)).getTextContent();
    const textos = tc.items.map(t => t.str.trim()).filter(Boolean);
    const n = achaNumero(textos);
    if (n && !mapa[n]) mapa[n] = i;
  }
  if (Object.keys(mapa).length) localStorage.setItem(chave, JSON.stringify(mapa));
  return mapa;
}
function achaNumero(textos) {
  for (let k = 0; k < Math.min(textos.length, 4); k++) {
    const m = textos[k].replace(/\s+/g, ' ').match(/^(\d{1,3}) [^\d]/);
    if (m) return +m[1];
    if (/^\d{1,3}$/.test(textos[k]) && textos[k + 1] && /^[^\d]/.test(textos[k + 1])) return +textos[k];
  }
  return null;
}

async function desenharPartitura(h) {
  const area = $('partitura');
  const msg = t => { if (atual === h) area.innerHTML = `<p class="visorMsg">${t}</p>`; };
  msg('Carregando partitura…');
  try {
    const mapa = await obterIndice(arqAtual, msg);
    const pagina = mapa[h.numero];
    if (!pagina) return msg('Partitura deste hino não encontrada neste arquivo.');
    const pdf = await abrirPdf(arqAtual);
    const c = await desenharPagina(pdf, pagina, area.clientWidth || 600, zoomHino);
    if (atual !== h || !modoPartitura) return;
    area.innerHTML = '';
    area.append(c);
  } catch {
    msg('Não foi possível abrir a partitura. Verifique a internet na primeira abertura.');
  }
}

/* ---------- Aba Partituras: PDF completo ---------- */
let pdfVisor = null, zoom = 1;

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
    pdfVisor = await abrirPdf(f.arq);
    zoom = 1;
    await desenharVisor();
  } catch {
    $('visorPaginas').innerHTML = `<p class="visorMsg">Não foi possível abrir a Final ${f.n}.<br>Verifique se o arquivo finais/${f.arq} foi publicado.</p>`;
  }
}

async function desenharVisor() {
  if (!pdfVisor) return;
  const area = $('visorPaginas');
  const largura = area.clientWidth - 20;
  const doc = pdfVisor;
  area.innerHTML = '';
  for (let i = 1; i <= doc.numPages; i++) {
    if (doc !== pdfVisor || $('visor').hidden) return;
    area.append(await desenharPagina(doc, i, largura, zoom));
  }
}

function fecharVisor() { $('visor').hidden = true; $('visorPaginas').innerHTML = ''; pdfVisor = null; }

/* ---------- Abas ---------- */
document.querySelectorAll('.abas button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.abas button').forEach(x => x.classList.toggle('ativa', x === b));
  $('abaHinos').hidden = b.dataset.aba !== 'hinos';
  $('abaFinais').hidden = b.dataset.aba !== 'finais';
});

/* ---------- Eventos ---------- */
let tBusca;
$('busca').oninput = () => { clearTimeout(tBusca); tBusca = setTimeout(renderLista, 150); };
$('categoria').onchange = renderLista;
$('favOnly').onchange = renderLista;
$('voltar').onclick = () => history.back();
$('visorFechar').onclick = () => history.back();
$('verPartitura').onclick = () => { modoPartitura = !modoPartitura; mostrarModo(); };
$('tom').onchange = () => { arqAtual = $('tom').value; localStorage.setItem('h5arq', arqAtual); mostrarModo(); };
$('zoomMais').onclick = () => { zoom = Math.min(3, zoom + 0.25); desenharVisor(); };
$('zoomMenos').onclick = () => { zoom = Math.max(0.5, zoom - 0.25); desenharVisor(); };
$('fonteMais').onclick = () => {
  if (modoPartitura) { zoomHino = Math.min(3, zoomHino + 0.25); localStorage.setItem('h5zoom', zoomHino); desenharPartitura(atual); }
  else { tamFonte = Math.min(2.4, +(tamFonte + 0.1).toFixed(2)); aplicarFonte(); }
};
$('fonteMenos').onclick = () => {
  if (modoPartitura) { zoomHino = Math.max(1, zoomHino - 0.25); localStorage.setItem('h5zoom', zoomHino); desenharPartitura(atual); }
  else { tamFonte = Math.max(0.9, +(tamFonte - 0.1).toFixed(2)); aplicarFonte(); }
};
$('favorito').onclick = () => {
  fav.has(atual.id) ? fav.delete(atual.id) : fav.add(atual.id);
  localStorage.setItem('h5fav', JSON.stringify([...fav]));
  atualizarFavBtn();
};
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
