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

let hinos = [], visiveis = [], atual = null;
const fav = new Set(JSON.parse(localStorage.getItem('h5fav') || '[]'));
let arqAtual = localStorage.getItem('h5arq') || FINAIS[0].arq;
let zoomHino = parseFloat(localStorage.getItem('h5zoom') || '1');

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
    // Download inteiro (sem pedaços) para o arquivo ficar no cache e funcionar offline
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

/* ---------- Índice automático: lê o PDF e acha a página de cada hino ---------- */
const VERSAO_INDICE = 1;
async function obterIndice(arq) {
  const chave = `h5idx${VERSAO_INDICE}_${arq}`;
  const salvo = localStorage.getItem(chave);
  if (salvo) return JSON.parse(salvo);
  $('lista').innerHTML = '';
  $('vazio').hidden = false;
  $('vazio').textContent = 'Preparando o hinário (só na primeira vez)…';
  try {
    const pdf = await abrirPdf(arq);
    const lista = [], vistos = new Set();
    for (let i = 1; i <= pdf.numPages; i++) {
      if (i % 5 === 0) $('vazio').textContent = `Preparando o hinário… página ${i} de ${pdf.numPages}`;
      const tc = await (await pdf.getPage(i)).getTextContent();
      const textos = tc.items.map(t => t.str.trim()).filter(Boolean);
      const m = achaCabecalho(textos);
      if (m && !vistos.has(m.numero)) {
        vistos.add(m.numero);
        lista.push({ ...m, pagina: i });
      }
    }
    lista.sort((a, b) => a.numero - b.numero);
    if (lista.length) localStorage.setItem(chave, JSON.stringify(lista));
    return lista;
  } catch {
    return [];
  }
}
// Cabeçalho da página: "12 Sempre em Jesus confiarei" (número e título podem vir em itens separados)
function achaCabecalho(textos) {
  for (let k = 0; k < Math.min(textos.length, 4); k++) {
    let m = textos[k].replace(/\s+/g, ' ').match(/^(\d{1,3}) ([^\d].*)$/);
    if (m) return { numero: +m[1], titulo: m[2].trim() };
    if (/^\d{1,3}$/.test(textos[k]) && textos[k + 1] && /^[^\d]/.test(textos[k + 1])) {
      return { numero: +textos[k], titulo: textos[k + 1].replace(/\s+/g, ' ').trim() };
    }
  }
  return null;
}

/* ---------- Início ---------- */
async function init() {
  renderFinais();
  montarSeletor();
  history.replaceState({ tela: 'lista' }, '');
  hinos = await obterIndice(arqAtual);
  renderLista();
}

function montarSeletor() {
  const sel = $('tom');
  FINAIS.forEach(f => sel.add(new Option(`Final ${f.n} (${f.tom})`, f.arq)));
  sel.value = arqAtual;
  sel.onchange = async () => {
    arqAtual = sel.value;
    localStorage.setItem('h5arq', arqAtual);
    hinos = await obterIndice(arqAtual);
    renderLista();
  };
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
  $('vazio').textContent = hinos.length ? 'Nenhum hino encontrado.' : 'Não foi possível ler o hinário. Verifique a internet e recarregue.';
  $('tituloLista').textContent = `Hinos (${visiveis.length})`;
}

/* ---------- Hino: mostra a página da partitura ---------- */
async function abrirHino(h, empilhar) {
  atual = h;
  $('titulo').textContent = `${h.numero} — ${h.titulo}`;
  atualizarFavBtn();
  const i = visiveis.indexOf(h);
  $('anterior').disabled = i <= 0;
  $('proximo').disabled = i < 0 || i >= visiveis.length - 1;
  $('filtros').hidden = $('lista').hidden = $('vazio').hidden = $('tituloLista').hidden = true;
  $('detalhe').hidden = false;
  if (empilhar) { scrollTo(0, 0); history.pushState({ tela: 'hino' }, ''); }
  const area = $('partitura');
  area.innerHTML = '<p class="visorMsg">Carregando partitura…</p>';
  try {
    const pdf = await abrirPdf(arqAtual);
    const c = await desenharPagina(pdf, h.pagina, area.clientWidth, zoomHino);
    if (atual !== h) return;
    area.innerHTML = '';
    area.append(c);
  } catch {
    area.innerHTML = '<p class="visorMsg">Não foi possível abrir a partitura.</p>';
  }
}

function fecharHino() {
  $('detalhe').hidden = true;
  $('filtros').hidden = $('lista').hidden = $('tituloLista').hidden = false;
  renderLista();
}

function atualizarFavBtn() {
  $('favorito').textContent = fav.has(String(atual.numero)) ? '★ Remover favorito' : '☆ Favoritar';
}

/* ---------- Aba Finais: PDF completo ---------- */
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
$('busca').oninput = renderLista;
$('favOnly').onchange = renderLista;
$('voltar').onclick = () => history.back();
$('visorFechar').onclick = () => history.back();
$('zoomMais').onclick = () => { zoom = Math.min(3, zoom + 0.25); desenharVisor(); };
$('zoomMenos').onclick = () => { zoom = Math.max(0.5, zoom - 0.25); desenharVisor(); };
$('zoomHMais').onclick = () => { zoomHino = Math.min(3, zoomHino + 0.25); localStorage.setItem('h5zoom', zoomHino); abrirHino(atual, false); };
$('zoomHMenos').onclick = () => { zoomHino = Math.max(1, zoomHino - 0.25); localStorage.setItem('h5zoom', zoomHino); abrirHino(atual, false); };
$('favorito').onclick = () => {
  const n = String(atual.numero);
  fav.has(n) ? fav.delete(n) : fav.add(n);
  localStorage.setItem('h5fav', JSON.stringify([...fav]));
  atualizarFavBtn();
};
$('anterior').onclick = () => { const i = visiveis.indexOf(atual); if (i > 0) { abrirHino(visiveis[i - 1], false); scrollTo(0, 0); } };
$('proximo').onclick = () => { const i = visiveis.indexOf(atual); if (i < visiveis.length - 1) { abrirHino(visiveis[i + 1], false); scrollTo(0, 0); } };

// Botão Voltar do Android
addEventListener('popstate', () => {
  if (!$('visor').hidden) return fecharVisor();
  if (!$('detalhe').hidden) return fecharHino();
});

function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js'));
init();
