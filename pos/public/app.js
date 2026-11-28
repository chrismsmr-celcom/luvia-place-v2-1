const API = '/api/pos/v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = localStorage.getItem('luvia_pos_token') || '', me = null;

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && token && path !== '/auth/login') { logout(); throw Error('Session expirée. Reconnectez-vous.'); }
  if (!r.ok) throw Error(d.error || 'Erreur serveur');
  return d;
}
const send = (path, body, method = 'POST') => api(path, { method, body: JSON.stringify(body || {}) });
const money = (v, c = 'USD') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' }).format(+v || 0);
const day = v => v ? new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const ago = v => Math.max(0, Math.floor((Date.now() - new Date(v)) / 864e5));
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2600); }

const ORDER = { pending: ['En attente', 'amber'], confirmed: ['Confirmé', 'green'], in_progress: ['En cours', 'blue'], completed: ['Terminé', 'grey'], cancelled: ['Annulé', 'red'], refunded: ['Remboursé', 'red'] };
const BOOKING = { pending: 'En attente', on_request: 'Sur demande', confirmed: 'Confirmée', ticketed: 'Billet émis', cancelled: 'Annulée', failed: 'Échec' };
const QUOTE = { draft: ['Brouillon', 'grey'], sent: ['Envoyé', 'blue'], accepted: ['Accepté', 'green'], rejected: ['Refusé', 'red'], expired: ['Expiré', 'grey'], converted: ['Converti en dossier', 'green'] };
const SERVICE = { flight: 'Vol', hotel: 'Hôtel', transfer: 'Transfert', visa: 'Visa', tour: 'Excursion', other: 'Autre' };
const METHOD = { cash: 'Espèces', mobile_money: 'Mobile Money', card: 'Carte bancaire', bank_transfer: 'Virement', other: 'Autre' };
const SUPPLIER = { airline: 'Compagnie aérienne', hotel: 'Hôtel', transport: 'Transport', visa: 'Visa', tour_operator: 'Tour-opérateur', other: 'Autre' };
const ROLE = { owner: 'Propriétaire', admin: 'Administrateur', manager: 'Responsable', agent: 'Agent', accountant: 'Comptable' };
const SOURCE = { pos: 'Comptoir', b2c: 'Site luviaplace.com' };
const pill = (map, k) => { const [t, c] = map[k] || [k, 'grey']; return `<span class="pill ${c}">${esc(t)}</span>`; };
const name = r => esc((r.first_name || '') + ' ' + (r.last_name || ''));
const empty = (t, s) => `<div class="empty"><b>${esc(t)}</b>${esc(s || '')}</div>`;
const table = (head, rows, none) => rows.length
  ? `<div class="tablewrap"><table><thead><tr>${head.map(h => `<th class="${h[1] || ''}">${esc(h[0])}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="tablewrap">${none}</div>`;

/* ---------- dialog form helper ---------- */
function ask(title, fields, onSubmit, cta = 'Enregistrer') {
  const d = $('#dlg');
  d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${fields.map(f => `<label>${esc(f.l)}${f.opts
    ? `<select name="${f.n}">${f.opts.map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select>`
    : `<input name="${f.n}" type="${f.t || 'text'}" ${f.req ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} value="${esc(f.v ?? '')}">`}</label>`).join('')}
    <p class="error" id="dlg-error" role="alert"></p><menu><button type="button" class="btn" value="x">Annuler</button><button class="btn primary">${esc(cta)}</button></menu></form>`;
  d.querySelector('[value=x]').onclick = () => d.close();
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(e.target))); d.close(); } catch (x) { $('#dlg-error').textContent = x.message; }
  };
  d.showModal();
}

/* ---------- auth ---------- */
function enter(u) {
  me = u; $('#auth').hidden = true; $('#app').hidden = false;
  $('#org').textContent = u.organization_name || ''; $('#user').textContent = (u.full_name || '') + ' · ' + (ROLE[u.role] || u.role);
  route();
}
function logout() { token = ''; localStorage.removeItem('luvia_pos_token'); me = null; $('#app').hidden = true; $('#auth').hidden = false; }
$('#logout').onclick = logout;
$('#login').onsubmit = async e => {
  e.preventDefault(); $('#auth-error').textContent = '';
  try { const d = await send('/auth/login', Object.fromEntries(new FormData(e.target))); token = d.token; localStorage.setItem('luvia_pos_token', token); enter(d.user); }
  catch (x) { $('#auth-error').textContent = x.message === 'Invalid credentials' ? 'Identifiant, e-mail ou mot de passe incorrect.' : x.message; }
};

/* ---------- router ---------- */
const pages = {
  dashboard: ['Tableau de bord', dashboard], dossiers: ['Dossiers', orders], devis: ['Devis', quotes],
  clients: ['Clients', customers], fournisseurs: ['Fournisseurs', suppliers]
};
async function route() {
  if (!me) return;
  const [, p = 'dashboard', id] = location.hash.split('/');
  const page = pages[p] || pages.dashboard, key = pages[p] ? p : 'dashboard';
  document.querySelectorAll('.rail a[data-p]').forEach(a => a.classList.toggle('on', a.dataset.p === key));
  $('#title').textContent = page[0]; document.title = page[0] + ' — Luvia POS';
  $('#view').innerHTML = empty('Chargement…');
  try { await page[1](); } catch (x) { $('#view').innerHTML = empty('Impossible de charger cette page', x.message); }
  if (key === 'dossiers' && id) openOrder(id); else closePanel();
}
window.addEventListener('hashchange', route);

/* ---------- dashboard ---------- */
async function dashboard() {
  const [ord, rep] = await Promise.all([api('/orders'), api('/reports/sales').catch(() => null)]);
  const o = ord.data, live = o.filter(x => !['cancelled', 'refunded'].includes(x.status));
  const owed = live.filter(x => +x.balance_due > 0).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const s = rep && rep.summary, sources = rep ? rep.bySource.map(b => `${SOURCE[b.source] || b.source} ${money(b.revenue)}`).join(' · ') : '';
  const L = (k, v, sub) => `<div><dt>${k}${sub ? `<span class="sub">${sub}</span>` : ''}</dt><dd>${v}</dd></div>`;
  const ledger = s
    ? L('Ventes', money(s.revenue), `${s.orders} dossier${s.orders > 1 ? 's' : ''} · 30 derniers jours`) + L('Encaissé', money(s.collected)) + L('Reste à encaisser', money(s.outstanding))
      + L('Marge brute', money(s.margin), s.orders_without_margin ? `${s.orders_without_margin} dossier${s.orders_without_margin > 1 ? 's' : ''} sans coût fournisseur renseigné` : '')
    : L('Dossiers', live.length) + L('Reste à encaisser', money(owed.reduce((t, x) => t + +x.balance_due, 0)));
  $('#view').innerHTML = `<div class="cols"><section><h2>Situation</h2><dl class="ledger">${ledger}</dl>${sources ? `<p class="hint">${esc(sources)}</p>` : ''}</section>
    <section><h2>Soldes à relancer</h2>${table([['Dossier'], ['Client'], ['Solde', 'n'], ['Depuis']], owed.slice(0, 6).map(x =>
      `<tr data-open="${x.id}"><td>${esc(x.order_number)}</td><td>${name(x)}</td><td class="n">${money(x.balance_due, x.currency)}</td><td class="${ago(x.created_at) > 14 ? 'late' : ''}">${ago(x.created_at)} j</td></tr>`), empty('Aucun solde en attente', 'Tous les dossiers sont soldés.'))}</section></div>
    <h2>Derniers dossiers</h2>${ordersTable(o.slice(0, 8))}`;
}

/* ---------- dossiers ---------- */
const ordersTable = list => table([['Dossier'], ['Client'], ['Date'], ['Total', 'n'], ['Payé', 'n'], ['Solde', 'n'], ['Statut']], list.map(x =>
  `<tr data-open="${x.id}"><td>${esc(x.order_number)}</td><td>${name(x)}</td><td>${day(x.created_at)}</td><td class="n">${money(x.total, x.currency)}</td><td class="n">${money(x.amount_paid, x.currency)}</td><td class="n">${+x.balance_due ? money(x.balance_due, x.currency) : '—'}</td><td>${pill(ORDER, x.status)}</td></tr>`),
  empty('Aucun dossier pour le moment', 'Créez votre première vente depuis « Nouvelle vente ».'));
async function orders() {
  const all = (await api('/orders')).data;
  $('#view').innerHTML = `<div class="tools"><input id="q" class="grow" type="search" placeholder="Rechercher un dossier ou un client" aria-label="Rechercher"><select id="f" aria-label="Filtrer par statut"><option value="">Tous les statuts</option>${Object.entries(ORDER).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></div><div id="list"></div>`;
  const draw = () => { const q = $('#q').value.toLowerCase(), f = $('#f').value; $('#list').innerHTML = ordersTable(all.filter(x => (!f || x.status === f) && (x.order_number + ' ' + x.first_name + ' ' + x.last_name).toLowerCase().includes(q))); };
  $('#q').oninput = draw; $('#f').onchange = draw; draw();
}
document.addEventListener('click', e => { const r = e.target.closest('tr[data-open]'); if (r) location.hash = '#/dossiers/' + r.dataset.open; });
function closePanel() { $('#panel').hidden = true; }
async function openOrder(id) {
  const p = $('#panel'); p.hidden = false;
  try {
    const o = (await api('/orders/' + id)).data, canStatus = ['owner', 'admin', 'manager'].includes(me.role);
    const kv = (k, v, c = '') => `<dt class="${c}">${k}</dt><dd class="${c}">${v}</dd>`;
    p.innerHTML = `<header><div><h1>${esc(o.order_number)}</h1><span>${name(o)} · ${esc(o.phone || o.email || '')}</span></div><button class="btn small" id="x">Fermer</button></header>
    <div>${canStatus ? `<select id="st" aria-label="Statut du dossier">${Object.entries(ORDER).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>` : pill(ORDER, o.status)}
      <span class="hint"> Créé le ${day(o.created_at)} · ${esc(SOURCE[o.source] || o.source)}${o.agent_name ? ' · ' + esc(o.agent_name) : ''}</span></div>
    <section><h2>Prestations</h2>${table([['Service'], ['Détail'], ['Prix', 'n']], o.items.map(i => `<tr><td>${SERVICE[i.service_type] || ''}</td><td>${esc(i.description)}</td><td class="n">${money(i.line_total, o.currency)}</td></tr>`), empty('Aucune ligne'))}</section>
    <section><h2>Réservations fournisseurs</h2>${table([['Service'], ['Référence'], ['Statut']], o.bookings.map(b => `<tr><td>${SERVICE[b.service_type] || ''}${b.traveler_name ? '<br><small>' + esc(b.traveler_name) + '</small>' : ''}</td><td>${esc(b.provider_reference || '—')}</td><td><select data-b="${b.id}" aria-label="Statut de la réservation">${Object.entries(BOOKING).map(([k, v]) => `<option value="${k}" ${k === b.status ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`), empty('Aucune réservation à suivre'))}
      <p class="hint">Une réservation passe à « Confirmée » uniquement lorsque le fournisseur vous a donné sa référence.</p></section>
    <section><h2>Montants</h2><dl class="kv">${kv('Sous-total', money(o.subtotal, o.currency))}${+o.tax ? kv('Taxes et frais fournisseur', money(o.tax, o.currency)) : ''}${+o.agency_fee ? kv('Frais d\'agence', money(o.agency_fee, o.currency)) : ''}${+o.discount ? kv('Remise', '− ' + money(o.discount, o.currency)) : ''}${kv('Total', money(o.total, o.currency), 'tot')}${kv('Payé', money(o.amount_paid, o.currency))}${kv('Solde', money(o.balance_due, o.currency))}${o.margin !== null ? kv('Marge brute', money(o.margin, o.currency)) : ''}</dl></section>
    <section><h2>Paiements</h2>${table([['Date'], ['Mode'], ['Montant', 'n']], o.payments.map(x => `<tr><td>${day(x.received_at)}</td><td>${METHOD[x.method] || x.method}${x.reference ? ' · ' + esc(x.reference) : ''}</td><td class="n">${money(x.amount, x.currency)}</td></tr>`), empty('Aucun paiement enregistré'))}</section>
    <div class="actions">${+o.balance_due > 0 && !['cancelled', 'refunded'].includes(o.status) ? '<button class="btn primary" id="pay">Encaisser un paiement</button>' : ''}<button class="btn" id="inv">Émettre une facture</button><button class="btn" id="print">Imprimer</button></div>
    ${o.invoices.length ? `<p class="hint">Factures : ${o.invoices.map(i => esc(i.invoice_number)).join(', ')}</p>` : ''}`;
    $('#x').onclick = () => { location.hash = '#/dossiers'; };
    $('#print').onclick = () => window.print();
    $('#inv').onclick = async () => { try { const r = await send('/orders/' + id + '/invoices'); toast('Facture ' + r.data.invoice_number + ' émise'); openOrder(id); } catch (x) { toast(x.message); } };
    if ($('#pay')) $('#pay').onclick = () => ask('Encaisser un paiement', [{ n: 'amount', l: 'Montant (' + o.currency + ')', t: 'number', step: '.01', req: 1, v: o.balance_due }, { n: 'method', l: 'Mode de paiement', opts: Object.entries(METHOD).filter(m => m[0] !== 'other') }, { n: 'reference', l: 'Référence (numéro de transaction, reçu…)' }],
      async b => { await send('/orders/' + id + '/payments', { ...b, amount: +b.amount }); toast('Paiement enregistré'); await route(); }, 'Enregistrer le paiement');
    if ($('#st')) $('#st').onchange = async e => { try { await send('/orders/' + id + '/status', { status: e.target.value }, 'PATCH'); toast('Statut mis à jour'); route(); } catch (x) { toast(x.message); openOrder(id); } };
    p.querySelectorAll('select[data-b]').forEach(s => s.onchange = async () => {
      try { await send('/bookings/' + s.dataset.b, { status: s.value }, 'PATCH'); toast('Réservation mise à jour'); } catch (x) { toast(x.message); openOrder(id); }
    });
  } catch (x) { p.innerHTML = `<header><h1>Dossier introuvable</h1><button class="btn small" id="x">Fermer</button></header>${empty('Ce dossier n\'est pas accessible', x.message)}`; $('#x').onclick = () => { location.hash = '#/dossiers'; }; }
}

/* ---------- devis ---------- */
async function quotes() {
  const list = (await api('/quotes')).data;
  $('#view').innerHTML = table([['Devis'], ['Client'], ['Date'], ['Total', 'n'], ['Statut'], ['']], list.map(q => `<tr><td>${esc(q.quote_number)}</td><td>${name(q)}</td><td>${day(q.created_at)}</td><td class="n">${money(q.total, q.currency)}</td><td>${pill(QUOTE, q.status)}</td><td class="n">${
    ['draft', 'sent'].includes(q.status) ? `<button class="btn small" data-accept="${q.id}">Marquer accepté</button>` : q.status === 'accepted' ? `<button class="btn small primary" data-convert="${q.id}" data-c="${q.customer_id}">Créer le dossier</button>` : ''}</td></tr>`),
    empty('Aucun devis', 'Les devis créés depuis « Nouvelle vente » (option Devis) apparaissent ici.'));
  $('#view').onclick = async e => {
    const a = e.target.closest('[data-accept]'), c = e.target.closest('[data-convert]');
    try {
      if (a) { await send('/quotes/' + a.dataset.accept + '/accept'); toast('Devis accepté'); quotes(); }
      if (c) { const r = await send('/orders', { customerId: c.dataset.c, quoteId: c.dataset.convert }); toast('Dossier ' + r.data.order_number + ' créé'); location.hash = '#/dossiers/' + r.data.id; }
    } catch (x) { toast(x.message); }
  };
}

/* ---------- clients & fournisseurs ---------- */
async function customers() {
  const all = (await api('/customers')).data;
  $('#view').innerHTML = `<div class="tools"><input id="q" class="grow" type="search" placeholder="Rechercher par nom ou e-mail" aria-label="Rechercher"><button class="btn primary" id="add">Ajouter un client</button></div><div id="list"></div>`;
  const draw = () => { const q = $('#q').value.toLowerCase(); $('#list').innerHTML = table([['Nom'], ['Téléphone'], ['E-mail'], ['Nationalité'], ['Ajouté le']], all.filter(c => (c.first_name + ' ' + c.last_name + ' ' + (c.email || '')).toLowerCase().includes(q)).map(c =>
    `<tr><td>${name(c)}</td><td>${esc(c.phone || '—')}</td><td>${esc(c.email || '—')}</td><td>${esc(c.nationality || '—')}</td><td>${day(c.created_at)}</td></tr>`), empty('Aucun client', 'Ajoutez un client ou créez-le pendant une vente.')); };
  $('#q').oninput = draw; draw();
  $('#add').onclick = () => ask('Nouveau client', [{ n: 'firstName', l: 'Prénom', req: 1 }, { n: 'lastName', l: 'Nom', req: 1 }, { n: 'phone', l: 'Téléphone / WhatsApp' }, { n: 'email', l: 'E-mail', t: 'email' }, { n: 'nationality', l: 'Nationalité (code pays, ex. CD)' }],
    async b => { await send('/customers', b); toast('Client ajouté'); customers(); });
}
async function suppliers() {
  const all = (await api('/suppliers')).data;
  $('#view').innerHTML = `<div class="tools"><button class="btn primary" id="add">Ajouter un fournisseur</button></div>` + table([['Nom'], ['Type'], ['Contact'], ['Téléphone'], ['E-mail']], all.map(s =>
    `<tr><td>${esc(s.name)}</td><td>${SUPPLIER[s.type] || s.type}</td><td>${esc(s.contact_name || '—')}</td><td>${esc(s.phone || '—')}</td><td>${esc(s.email || '—')}</td></tr>`), empty('Aucun fournisseur', 'Enregistrez vos compagnies, hôtels et prestataires pour suivre vos réservations.'));
  $('#add').onclick = () => ask('Nouveau fournisseur', [{ n: 'name', l: 'Nom', req: 1 }, { n: 'type', l: 'Type', opts: Object.entries(SUPPLIER) }, { n: 'contactName', l: 'Personne à contacter' }, { n: 'phone', l: 'Téléphone' }, { n: 'email', l: 'E-mail', t: 'email' }],
    async b => { await send('/suppliers', b); toast('Fournisseur ajouté'); suppliers(); });
}

/* ---------- start ---------- */
(async () => {
  if (!token) return;
  try { enter((await api('/auth/me')).user); } catch { logout(); }
})();

if('serviceWorker' in navigator)navigator.serviceWorker.register('/pos/sw.js',{scope:'/pos/'}).catch(()=>{});
