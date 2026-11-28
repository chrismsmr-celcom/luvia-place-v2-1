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
  $('#org').textContent = u.organization_name || 'Mon agence'; $('#user').textContent = u.full_name || '';
  $('#user-role').textContent = ROLE[u.role] || u.role; $('#user-avatar').textContent = (u.full_name || 'U').trim().charAt(0).toUpperCase(); $('#top-user').textContent = (u.full_name || 'U').trim().charAt(0).toUpperCase();
  route();
}
function logout() { token = ''; localStorage.removeItem('luvia_pos_token'); me = null; saleCart=[]; saleCustomerId=''; saleFlightOffers=[]; saleHotelOffers=[]; $('#app').hidden = true; $('#auth').hidden = false; $('#register').hidden=true; $('#login').hidden=false; }
$('#logout').onclick = logout;
$('#login').onsubmit = async e => {
  e.preventDefault(); $('#auth-error').textContent = '';
  try { const d = await send('/auth/login', Object.fromEntries(new FormData(e.target))); token = d.token; localStorage.setItem('luvia_pos_token', token); const profile=await api('/auth/me'); enter(profile.user); }
  catch (x) { token=''; localStorage.removeItem('luvia_pos_token'); $('#auth-error').textContent = x.message === 'Invalid credentials' ? 'Identifiant, e-mail ou mot de passe incorrect.' : x.message; }
};

$('#show-register').onclick = () => { $('#login').hidden = true; $('#register').hidden = false; };
$('#show-login').onclick = () => { $('#register').hidden = true; $('#login').hidden = false; };
$('#register-org').addEventListener('input', e => {
  const slug=$('#register-slug'); if(slug.dataset.edited) return;
  slug.value=e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
});
$('#register-slug').addEventListener('input',e=>{e.target.dataset.edited='1';e.target.value=e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'').replace(/-+/g,'-').replace(/^-|-$/g,'');});
$('#register').onsubmit=async e=>{
 e.preventDefault();$('#register-error').textContent='';
 try{const d=await send('/auth/register',Object.fromEntries(new FormData(e.target)));token=d.token;localStorage.setItem('luvia_pos_token',token);const profile=await api('/auth/me');enter(profile.user);toast('Espace agence créé');}
 catch(x){token='';localStorage.removeItem('luvia_pos_token');$('#register-error').textContent=x.message;}
};

/* ---------- router ---------- */
const pages = {
  dashboard: ['Dashboard', dashboard], sales: ['Nouvelle vente', () => salesWorkspace('flights')],
  flights: ['Vols', () => salesWorkspace('flights')], hotels: ['Hôtels', () => salesWorkspace('hotels')],
  experiences: ['Expériences', () => salesWorkspace('services','tour')], cars: ['Voitures', () => salesWorkspace('services','transfer')], insurance: ['Assurances', () => salesWorkspace('services','other')],
  dossiers: ['Dossiers', orders], devis: ['Devis', quotes], requests: ['Demandes', requestsPage], clients: ['CRM / Clients', customers],
  balance: ['Balance & factures', invoices], history: ['Historique', historyPage], email: ['Email', emailWorkspace],
  'luvia-ai': ['Luvia AI', luviaAssistant], support: ['Support', supportWorkspace], fournisseurs: ['Fournisseurs', suppliers]
};
async function route() {
  if (!me) return;
  const [, p = 'dashboard', id] = location.hash.split('/');
  const page = pages[p] || pages.dashboard, key = pages[p] ? p : 'dashboard';
  document.querySelectorAll('.rail a[data-p]').forEach(a => a.classList.toggle('on', a.dataset.p === key));
  $('#title').textContent = page[0]; $('#top-context').textContent = page[0]; $('#page-kicker').textContent = key === 'dashboard' ? 'OVERVIEW' : 'AGENCY WORKSPACE'; $('#page-subtitle').textContent = key === 'dashboard' ? 'La vue d’ensemble de votre agence.' : 'Gérez vos opérations depuis un espace unique.'; document.title = page[0] + ' — LuviaPlace OS';
  $('#view').innerHTML = empty('Chargement…');
  try { await page[1](); } catch (x) { $('#view').innerHTML = empty('Impossible de charger cette page', x.message); }
  if (key === 'dossiers' && id) openOrder(id); else closePanel();
}
window.addEventListener('hashchange', route);
setupWorkspaceChrome();
$('#workspace-trigger').onclick = openWorkspace;
$('#workspace-settings').onclick = openWorkspace;
$('#feedback').onclick = () => openFeedback();
$('#notifications').onclick = () => { location.hash = '#/history'; };
$('#global-search').addEventListener('input', e => { const q = e.target.value; const local = $('#q'); if (local) { local.value = q; local.dispatchEvent(new Event('input')); } });
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#global-search').focus(); } });

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



/* ---------- provider search and operations ---------- */
function searchShell(title, description, fields) {
  $('#view').innerHTML = '<section class="search-panel"><span class="eyebrow">FOURNISSEURS · LITEAPI</span><h2>' + title + '</h2><p>' + esc(description) + '</p><form id="provider-search" class="provider-form">' + fields + '<div class="form-actions"><button class="btn primary">Rechercher les offres</button></div></form></section><div id="provider-results" aria-live="polite"></div>';
}
const customerOptions = list => list.map(c => [c.id, c.first_name + ' ' + c.last_name + (c.email ? ' · ' + c.email : '')]);
async function makeOfferQuote(customers, description, serviceType, price, currency) {
  if (!customers.length) { toast('Ajoutez d’abord un client dans le CRM.'); return; }
  ask('Créer un devis à partir de cette offre', [
    {n:'customerId',l:'Client',opts:customerOptions(customers),req:1},
    {n:'unitPrice',l:'Prix de vente ('+currency+')',t:'number',step:'.01',req:1,v:price},
    {n:'notes',l:'Note pour le devis'}
  ], async b => {
    const amount=Number(b.unitPrice);
    if (!Number.isFinite(amount)||amount<=0) throw Error('Le prix doit être supérieur à zéro.');
    const r=await send('/quotes',{customerId:b.customerId,currency:currency,notes:b.notes,items:[{description:description,serviceType:serviceType,quantity:1,unitCost:price,unitPrice:amount}]});
    toast('Devis '+r.data.quote_number+' créé'); location.hash='#/devis';
  },'Créer le devis');
}
async function flightSearch() {
  const today=new Date().toISOString().slice(0,10);
  searchShell('Rechercher un vol','Résultats de LiteAPI. Une recherche ne constitue pas une réservation.',
    '<div class="form-grid"><label>Départ (IATA)<input name="origin" maxlength="3" placeholder="FIH" required></label><label>Arrivée (IATA)<input name="destination" maxlength="3" placeholder="CDG" required></label><label>Date aller<input name="departureDate" type="date" min="'+today+'" required></label><label>Date retour<input name="returnDate" type="date"></label><label>Adultes<input name="adults" type="number" min="1" max="9" value="1" required></label><label>Cabine<select name="cabinClass"><option value="economy">Économique</option><option value="premium_economy">Économique premium</option><option value="business">Affaires</option><option value="first">Première</option></select></label><label>Devise<input name="currency" maxlength="3" value="'+esc(me.default_currency||'USD')+'"></label></div>');
  $('#provider-search').onsubmit=async e=>{
    e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),legs=[{origin:b.origin.trim().toUpperCase(),destination:b.destination.trim().toUpperCase(),date:b.departureDate}];
    if(b.returnDate)legs.push({origin:b.destination.trim().toUpperCase(),destination:b.origin.trim().toUpperCase(),date:b.returnDate});
    const target=$('#provider-results');target.innerHTML=empty('Recherche en cours…','Interrogation de LiteAPI.');
    try{
      const pair=await Promise.all([send('/integrations/liteapi/flights/search',{legs:legs,adults:Number(b.adults),cabinClass:b.cabinClass,currency:(b.currency||'USD').toUpperCase(),country:'CD'}),api('/customers')]);
      const rows=Array.isArray(pair[0].data)?pair[0].data:[],clients=pair[1].data;
      if(!rows.length){target.innerHTML=empty('Aucun vol retourné','Essayez d’autres dates ou aéroports.');return;}
      target.innerHTML='<div class="results-heading"><h2>'+rows.length+' résultat(s)</h2><span class="hint">Prix indicatifs · reconfirmation fournisseur obligatoire</span></div><div class="offer-grid">'+rows.map((x,i)=>{
        const airline=x.owner?.name||x.airline?.name||x.airline||'Compagnie aérienne';
        const amount=Number(x.price?.total??x.total??x.amount??x.pricing?.total??x.price??0),currency=x.price?.currency||x.currency||b.currency||'USD';
        return '<article class="offer-card"><span class="eyebrow">OPTION '+(i+1)+'</span><h3>'+esc(airline)+' · '+esc(b.origin.toUpperCase())+' → '+esc(b.destination.toUpperCase())+'</h3><p>'+esc(b.departureDate)+(b.returnDate?' · retour '+esc(b.returnDate):'')+' · '+b.adults+' adulte(s)</p><div class="offer-bottom"><strong>'+(amount>0?money(amount,currency):'Prix à confirmer')+'</strong><button class="btn small primary" data-flight="'+i+'" '+(amount<=0?'disabled':'')+'>Créer un devis</button></div></article>';
      }).join('')+'</div>';
      target.querySelectorAll('[data-flight]').forEach(btn=>btn.onclick=()=>{
        const x=rows[Number(btn.dataset.flight)],amount=Number(x.price?.total??x.total??x.amount??x.pricing?.total??x.price??0);
        makeOfferQuote(clients,(x.owner?.name||x.airline?.name||'Vol')+' · '+b.origin.toUpperCase()+'–'+b.destination.toUpperCase()+' · '+b.departureDate+(b.returnDate?' / '+b.returnDate:''),'flight',amount,x.price?.currency||x.currency||b.currency||'USD');
      });
    }catch(x){target.innerHTML=empty('Recherche impossible',x.message);}
  };
}
async function hotelSearch() {
  const today=new Date().toISOString().slice(0,10);
  searchShell('Rechercher un hôtel','Les tarifs et disponibilités sont fournis par LiteAPI et doivent être reconfirmés.',
    '<div class="form-grid"><label>Ville<input name="cityName" placeholder="Paris" required></label><label>Pays (ISO)<input name="countryCode" maxlength="2" value="FR" required></label><label>Arrivée<input name="checkin" type="date" min="'+today+'" required></label><label>Départ<input name="checkout" type="date" required></label><label>Adultes<input name="adults" type="number" min="1" max="8" value="2"></label><label>Âges des enfants (facultatif)<input name="childrenAges" placeholder="Ex. 4, 9"></label><label>Devise<input name="currency" maxlength="3" value="'+esc(me.default_currency||'USD')+'"></label><label>Nationalité<input name="guestNationality" maxlength="2" value="CD"></label></div>');
  $('#provider-search').onsubmit=async e=>{
    e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),childAges=(b.childrenAges||'').split(',').map(v=>v.trim()).filter(Boolean).map(Number);if(childAges.some(age=>!Number.isInteger(age)||age<0||age>17)){toast('Indiquez un âge valide entre 0 et 17 ans pour chaque enfant.');return;}if(b.checkout<=b.checkin){toast('La date de départ doit être après l’arrivée.');return;}
    const target=$('#provider-results');target.innerHTML=empty('Recherche en cours…','Interrogation de LiteAPI.');
    try{
      const pair=await Promise.all([send('/integrations/liteapi/hotels/search',{cityName:b.cityName.trim(),countryCode:b.countryCode.toUpperCase(),checkin:b.checkin,checkout:b.checkout,currency:b.currency.toUpperCase(),guestNationality:b.guestNationality.toUpperCase(),occupancies:[{adults:Number(b.adults),children:childAges}]}),api('/customers')]);
      const rows=pair[0].data||[],clients=pair[1].data;if(!rows.length){target.innerHTML=empty('Aucun hôtel disponible','Essayez une autre ville ou d’autres dates.');return;}
      target.innerHTML='<div class="results-heading"><h2>'+rows.length+' hôtel(s)</h2><span class="hint">Tarifs fournisseur · disponibilité non garantie</span></div><div class="offer-grid">'+rows.map((h,i)=>'<article class="offer-card hotel-offer">'+(h.main_photo?'<img src="'+esc(h.main_photo)+'" alt="" loading="lazy">':'')+'<span class="eyebrow">'+esc(h.city||b.cityName)+(h.starRating?' · '+h.starRating+' étoiles':'')+'</span><h3>'+esc(h.name)+'</h3><p>'+esc(h.address||h.roomName||'Détails fournisseur')+' · '+h.nights+' nuit(s) · '+(h.refundable?'Remboursable':'Conditions à vérifier')+'</p><div class="offer-bottom"><strong>'+money(h.price,h.currency)+'</strong><button class="btn small primary" data-hotel="'+i+'">Créer un devis</button></div></article>').join('')+'</div>';
      target.querySelectorAll('[data-hotel]').forEach(btn=>btn.onclick=()=>{const h=rows[Number(btn.dataset.hotel)];makeOfferQuote(clients,h.name+' · '+b.cityName+' · '+b.checkin+' au '+b.checkout+' · '+h.roomName,'hotel',Number(h.price),h.currency);});
    }catch(x){target.innerHTML=empty('Recherche impossible',x.message);}
  };
}
async function serviceRequest(title, requestType, prompt) {
  const clients=(await api('/customers')).data;
  if(!clients.length){$('#view').innerHTML='<section class="service-placeholder"><h2>Ajoutez d’abord un client</h2><p>Chaque demande doit être associée à un client.</p><a class="btn primary" href="#/clients">Ouvrir le CRM</a></section>';return;}
  $('#view').innerHTML='<section class="search-panel"><span class="eyebrow">DEMANDE DE PRESTATION</span><h2>'+esc(title)+'</h2><p>'+esc(prompt)+'</p><form id="service-request" class="provider-form"><div class="form-grid"><label>Client<select name="customerId" required>'+customerOptions(clients).map(o=>'<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>').join('')+'</select></label><label>Destination<input name="destination" required></label><label>Date de départ<input name="departureDate" type="date"></label><label>Date de fin<input name="returnDate" type="date"></label><label class="wide">Détails<textarea name="notes" rows="4" placeholder="Besoins, budget, préférences et contraintes"></textarea></label></div><div class="form-actions"><button class="btn primary">Enregistrer la demande</button></div></form></section><p class="hint">La demande est enregistrée dans le pipeline. Aucune réservation fournisseur n’est effectuée.</p>';
  $('#service-request').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await send('/travel-requests',{customerId:b.customerId,requestType:requestType,destination:b.destination,departureDate:b.departureDate||null,returnDate:b.returnDate||null,notes:title+': '+(b.notes||'')});toast('Demande enregistrée');location.hash='#/requests';}catch(x){toast(x.message);}};
}
async function requestsPage() {
  const rows=(await api('/travel-requests')).data;
  const labels={flight:'Vol',hotel:'Hôtel',package:'Expérience / package',transfer:'Transport',visa:'Visa',other:'Autre'};
  const states={open:['Ouverte','amber'],quoted:['Devis envoyé','blue'],confirmed:['Confirmée','green'],cancelled:['Annulée','red'],closed:['Clôturée','grey']};
  $('#view').innerHTML=table([['Client'],['Type'],['Destination'],['Dates'],['Statut'],['Mise à jour']],rows.map(r=>'<tr><td>'+name(r)+'</td><td>'+esc(labels[r.request_type]||r.request_type)+'</td><td>'+esc(r.destination||'—')+'</td><td>'+day(r.departure_date)+(r.return_date?' → '+day(r.return_date):'')+'</td><td>'+pill(states,r.status)+'</td><td>'+(['owner','admin','manager'].includes(me.role)?'<select data-request="'+r.id+'" aria-label="Statut de la demande">'+Object.keys(states).map(k=>'<option value="'+k+'" '+(k===r.status?'selected':'')+'>'+states[k][0]+'</option>').join('')+'</select>':states[r.status]?.[0]||r.status)+'</td></tr>'),empty('Aucune demande','Les demandes de vols, expériences, voitures et assurances seront listées ici.'));
  $('#view').querySelectorAll('[data-request]').forEach(sel=>sel.onchange=async()=>{try{await send('/travel-requests/'+sel.dataset.request,{status:sel.value},'PATCH');toast('Statut de la demande mis à jour');requestsPage();}catch(x){toast(x.message);requestsPage();}});
}
async function emailWorkspace() {
  const clients=(await api('/customers')).data;
  $('#view').innerHTML='<section class="search-panel"><span class="eyebrow">COMMUNICATION CLIENT</span><h2>Préparer un e-mail</h2><p>L’envoi est effectué par votre application e-mail. LuviaPlace OS ne stocke pas encore les messages.</p><form id="email-compose" class="provider-form"><div class="form-grid"><label>Client<select name="customerId" required>'+customerOptions(clients).map(o=>'<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>').join('')+'</select></label><label>Objet<input name="subject" required value="Votre demande de voyage — LuviaPlace"></label><label class="wide">Message<textarea name="body" rows="6" required>Bonjour,\\n\\nNous revenons vers vous concernant votre demande.\\n\\nCordialement,\\nVotre agence</textarea></label></div><div class="form-actions"><button class="btn primary" '+(clients.length?'':'disabled')+'>Ouvrir mon application e-mail</button></div></form></section>';
  $('#email-compose').onsubmit=e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),c=clients.find(x=>x.id===b.customerId);if(!c?.email){toast('Ce client ne possède pas d’adresse e-mail.');return;}location.href='mailto:'+encodeURIComponent(c.email)+'?subject='+encodeURIComponent(b.subject)+'&body='+encodeURIComponent(b.body);};
}
async function luviaAssistant() {
  const pair=await Promise.all([api('/orders'),api('/customers'),api('/quotes')]),open=pair[0].data.filter(x=>+x.balance_due>0&&!['cancelled','refunded'].includes(x.status));
  $('#view').innerHTML='<section class="search-panel"><span class="eyebrow">ASSISTANCE OPÉRATIONNELLE</span><h2>Luvia AI — aperçu de l’activité</h2><p>Cette version affiche des indicateurs calculés depuis vos données. Elle n’utilise pas encore de modèle IA ni de conversation générative.</p><div class="assistant-metrics"><article><strong>'+pair[1].data.length+'</strong><span>Clients</span></article><article><strong>'+pair[0].data.length+'</strong><span>Dossiers</span></article><article><strong>'+pair[2].data.length+'</strong><span>Devis</span></article><article><strong>'+open.length+'</strong><span>Soldes à relancer</span></article></div><h3>Actions recommandées</h3><ul class="action-list">'+(open.slice(0,5).map(o=>'<li><span><b>'+esc(o.order_number)+'</b> · '+name(o)+' — '+money(o.balance_due,o.currency)+'</span><a href="#/dossiers/'+o.id+'">Ouvrir</a></li>').join('')||'<li>Aucun solde en attente.</li>')+'</ul><div class="actions"><a class="btn" href="#/clients">Clients</a><a class="btn" href="#/devis">Devis</a><a class="btn primary" href="#/history">Historique</a></div></section>';
}
async function supportWorkspace() {
  $('#view').innerHTML='<section class="service-placeholder"><div class="service-symbol">?</div><span class="eyebrow">CENTRE D’ASSISTANCE</span><h2>Support LuviaPlace</h2><p>Décrivez votre incident et joignez l’identifiant du dossier concerné.</p><button class="btn primary" id="support-feedback">Contacter le support</button><small>Le formulaire ouvre votre application e-mail. Aucun ticket n’est encore stocké dans LuviaPlace OS.</small></section>';
  $('#support-feedback').onclick=()=>openFeedback();
}

async function servicePlaceholder(title, description, kind) {
  const symbols = {flight:'✈',hotel:'⌂',tour:'✧',car:'▣',insurance:'◇',mail:'✉',sparkles:'✦','life-buoy':'?'};
  $('#view').innerHTML = `<section class="service-placeholder"><div class="service-symbol">${symbols[kind] || '✧'}</div><span class="eyebrow">LUVIA WORKSPACE</span><h2>${esc(title)}</h2><p>${esc(description)}</p><a class="btn primary" href="/pos/counter/">Ouvrir le comptoir de vente →</a><small>Cette section sera connectée progressivement aux workflows de réservation.</small></section>`;
}
async function invoices() {
  const [invoiceResult,orderResult] = await Promise.all([api('/invoices'),api('/orders')]);
  const all=invoiceResult.data,ordersList=orderResult.data,open=ordersList.filter(x=>+x.balance_due>0&&!['cancelled','refunded'].includes(x.status));
  const outstanding=open.reduce((sum,x)=>sum+(+x.balance_due||0),0);
  const invoiced=all.reduce((sum,x)=>sum+(+x.total||0),0);
  $('#view').innerHTML = `<div class="cols"><section><h2>Encaissements à suivre</h2><dl class="ledger"><div><dt>Soldes ouverts</dt><dd>${open.length}</dd></div><div><dt>Total à encaisser</dt><dd>${money(outstanding)}</dd></div><div><dt>Factures émises</dt><dd>${money(invoiced)}</dd></div></dl></section><section><h2>Dossiers avec solde</h2>${table([['Dossier'],['Client'],['Solde','n'],['Statut']],open.slice(0,8).map(x=>`<tr data-open="${x.id}"><td>${esc(x.order_number)}</td><td>${name(x)}</td><td class="n">${money(x.balance_due,x.currency)}</td><td>${pill(ORDER,x.status)}</td></tr>`),empty('Aucun solde en attente','Tous les dossiers sont soldés.'))}</section></div>
  <h2>Factures</h2>${table([['Facture'],['Dossier'],['Client'],['Date'],['Montant','n'],['Statut']], all.map(x => `<tr><td>${esc(x.invoice_number)}</td><td>${esc(x.order_number)}</td><td>${name(x)}</td><td>${day(x.issued_at)}</td><td class="n">${money(x.total,x.currency)}</td><td>${pill({issued:['Émise','blue'],paid:['Payée','green'],draft:['Brouillon','grey'],void:['Annulée','red']},x.status)}</td></tr>`), empty('Aucune facture','Les factures émises depuis les dossiers apparaîtront ici.'))}`;
}
async function historyPage() {
  const all = (await api('/audit')).data;
  $('#view').innerHTML = table([['Événement'],['Type'],['Date'],['Utilisateur']], all.map(x => `<tr><td>${esc(x.action.replace(/[._]/g,' '))}</td><td>${esc(x.entity_type)}</td><td>${day(x.created_at)}</td><td>${esc(x.actor_name || 'Système')}</td></tr>`), empty('Aucune activité','Les événements de votre agence apparaîtront ici.'));
}
async function openWorkspace() {
  const d = $('#workspace-dialog');
  d.innerHTML = '<div class="workspace-head"><div><span class="eyebrow">WORKSPACE SETTINGS</span><h2>Votre espace agence</h2><p class="hint">Profil de l’agence et accès de votre équipe.</p></div><button class="btn small" id="workspace-close">Fermer</button></div><div class="workspace-tabs"><button class="active" data-tab="agency">Agence</button><button data-tab="team">Équipe & rôles</button></div><div class="workspace-body" id="workspace-content">Chargement…</div>';
  d.showModal();
  $('#workspace-close').onclick = () => d.close();
  let organization, team;
  try { [organization, team] = await Promise.all([api('/organization'), api('/team')]); }
  catch (x) { $('#workspace-content').innerHTML = empty('Impossible de charger le workspace',x.message); return; }
  const canManage = ['owner','admin'].includes(me.role);
  const showAgency = () => {
    const o=organization.data;
    $('#workspace-content').innerHTML = `<form id="agency-form"><div class="dialog-grid">
      <label>Nom de l’agence<input name="name" maxlength="120" required value="${esc(o.name)}"></label>
      <label>Identifiant agence<input value="${esc(o.slug)}" disabled><small class="hint">L’identifiant ne peut pas être modifié.</small></label>
      <label>E-mail professionnel<input name="email" type="email" value="${esc(o.email || '')}"></label>
      <label>Téléphone<input name="phone" value="${esc(o.phone || '')}"></label>
      <label>Pays (code ISO)<input name="countryCode" maxlength="2" value="${esc(o.country_code || 'CD')}"></label>
      <label>Devise par défaut<input name="currency" maxlength="3" value="${esc(o.default_currency || 'USD')}"></label>
      <label class="wide">Adresse<input name="address" value="${esc(o.address || '')}"></label>
      <label>Site web<input name="website" type="url" value="${esc(o.website || '')}"></label>
      <label>URL du logo<input name="logoUrl" type="url" value="${esc(o.logo_url || '')}"></label>
    </div>${canManage ? '<div class="dialog-actions"><button class="btn primary">Enregistrer les informations</button></div>' : '<p class="hint">Seuls les propriétaires et administrateurs peuvent modifier ces informations.</p>'}</form>`;
    const f=$('#agency-form'); if(canManage) f.onsubmit=async e=>{e.preventDefault();try{const b=Object.fromEntries(new FormData(f));b.countryCode=b.countryCode.toUpperCase();b.currency=b.currency.toUpperCase();const r=await send('/organization',b,'PATCH');organization=r;$('#org').textContent=r.data.name;toast('Informations agence enregistrées');}catch(x){toast(x.message);}};
  };
  const showTeam = () => {
    const rows=team.data || [];
    $('#workspace-content').innerHTML = `<div class="team-list">${rows.map(m=>`<div class="team-row"><span class="user-avatar">${esc(m.full_name.charAt(0).toUpperCase())}</span><span class="member-info"><b>${esc(m.full_name)}</b><small>${esc(m.email)} · ${m.active?'Actif':'Désactivé'}</small></span><span class="role-pill">${esc(ROLE[m.role] || m.role)}</span>${canManage && m.role!=='owner' && (me.role==='owner' || m.role!=='admin') ? `<select class="team-role-select" data-member-role="${m.id}" aria-label="Rôle de ${esc(m.full_name)}">${['admin','manager','agent','accountant'].filter(r=>me.role==='owner'||r!=='admin').map(r=>`<option value="${r}" ${r===m.role?'selected':''}>${esc(ROLE[r])}</option>`).join('')}</select>` : ''}</div>`).join('') || empty('Aucun membre','Vous êtes le premier membre de cette agence.')}</div>
      ${canManage ? '<form id="member-form" class="member-form"><h3>Ajouter un collaborateur</h3><div class="dialog-grid"><label>Nom complet<input name="fullName" required></label><label>E-mail<input name="email" type="email" required></label><label>Mot de passe temporaire<input name="password" type="password" minlength="12" required><small class="hint">12 caractères minimum.</small></label><label>Rôle<select name="role"><option value="agent">Agent</option><option value="manager">Responsable</option><option value="accountant">Comptable</option><option value="admin">Administrateur</option></select></label></div><div class="dialog-actions"><button class="btn primary">Ajouter à l’équipe</button></div></form>' : '<p class="hint">Vous pouvez consulter l’équipe. La gestion des accès est réservée aux Owner et Admin.</p>'}`;
    $('#workspace-content').querySelectorAll('[data-member-role]').forEach(sel=>sel.onchange=async()=>{try{await send('/team/'+sel.dataset.memberRole,{role:sel.value},'PATCH');team=await api('/team');showTeam();toast('Rôle mis à jour');}catch(x){toast(x.message);showTeam();}});
    const f=$('#member-form');if(f)f.onsubmit=async e=>{e.preventDefault();try{await send('/team',Object.fromEntries(new FormData(f)));team=await api('/team');showTeam();toast('Collaborateur ajouté');}catch(x){toast(x.message);}};
  };
  showAgency();
  d.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{d.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));b.dataset.tab==='agency'?showAgency():showTeam();});
}
function openFeedback() {
  const d=$('#feedback-dialog');
  d.innerHTML='<form id="feedback-form"><span class="eyebrow">PRODUCT FEEDBACK</span><h2>Votre avis compte</h2><p class="hint">Décrivez un problème ou une amélioration souhaitée. Votre application ouvrira votre client e-mail.</p><label>Votre feedback<textarea name="message" required placeholder="Décrivez votre retour…"></textarea></label><div class="dialog-actions"><button type="button" class="btn" id="feedback-cancel">Annuler</button><button class="btn primary">Continuer</button></div></form>';
  d.showModal();$('#feedback-cancel').onclick=()=>d.close();
  $('#feedback-form').onsubmit=e=>{e.preventDefault();const message=new FormData(e.target).get('message');location.href='mailto:christopher-ag@cerbereag.site?subject='+encodeURIComponent('LuviaPlace OS feedback')+'&body='+encodeURIComponent(message);d.close();};
}


/* Workspace chrome: independent navigation + utility sidebars */
let calendarCursor=new Date(),calendarSelected='';
function setupWorkspaceChrome(){
 const app=$('#app'),left=$('#toggle-left-rail'),right=$('#toggle-right-rail');
 left.onclick=()=>{app.classList.toggle('left-collapsed');left.setAttribute('aria-label',app.classList.contains('left-collapsed')?'Déployer la navigation':'Rétracter la navigation');};
 right.onclick=()=>app.classList.toggle('right-collapsed');
 $('#close-right-rail').onclick=()=>app.classList.add('right-collapsed');
 $('#open-map').onclick=()=>$('#map-dialog').showModal();
 $('#close-map').onclick=()=>$('#map-dialog').close();
 $('#clear-search-history').onclick=()=>{localStorage.removeItem('luvia_recent_searches');renderRecentSearches();};
 $('#calendar-prev').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderMiniCalendar();};
 $('#calendar-next').onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderMiniCalendar();};
 renderRecentSearches();renderMiniCalendar();
}
function recordRecentSearch(type,summary){
 const rows=JSON.parse(localStorage.getItem('luvia_recent_searches')||'[]');
 rows.unshift({type,summary,at:new Date().toISOString()});
 localStorage.setItem('luvia_recent_searches',JSON.stringify(rows.slice(0,8)));
 renderRecentSearches();
}
function renderRecentSearches(){
 const root=$('#recent-searches');if(!root)return;
 const rows=JSON.parse(localStorage.getItem('luvia_recent_searches')||'[]');
 root.innerHTML=rows.length?rows.map(x=>'<div class="recent-search"><i>'+(x.type==='Vols'?'✈':x.type==='Hôtels'?'⌂':'⌖')+'</i><span>'+esc(x.summary)+'<small>'+esc(x.type)+' · '+new Date(x.at).toLocaleDateString('fr-FR')+'</small></span></div>').join(''):'<p class="utility-empty">Vos recherches apparaîtront ici.</p>';
}
function renderMiniCalendar(){
 const root=$('#mini-calendar'),label=$('#calendar-month');if(!root||!label)return;
 const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),today=new Date();
 label.textContent=calendarCursor.toLocaleDateString('fr-FR',{month:'short',year:'numeric'});
 const heads=['L','M','M','J','V','S','D'];let out=heads.map(x=>'<span class="weekday">'+x+'</span>').join('');
 for(let i=0;i<offset;i++)out+='<span></span>';
 for(let d=1;d<=days;d++){const key=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'),isToday=y===today.getFullYear()&&m===today.getMonth()&&d===today.getDate();out+='<button type="button" data-calendar-date="'+key+'" class="'+(isToday?'today ':'')+(calendarSelected===key?'selected':'')+'" aria-label="'+key+'">'+d+'</button>';}
 root.innerHTML=out;root.querySelectorAll('[data-calendar-date]').forEach(b=>b.onclick=()=>{calendarSelected=b.dataset.calendarDate;renderMiniCalendar();});
}

/* Unified sales workspace: one catalogue, one cart, one dossier */
let saleCart=[],saleFlightOffers=[],saleHotelOffers=[],saleCustomers=[],saleCustomerId='';
const saleCurrency=()=>String(me&&me.default_currency||'USD').toUpperCase();
const saleToday=()=>new Date().toISOString().slice(0,10);
const saleDate=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
function saleMoney(v,c){return money(v,c||saleCurrency());}
async function salesWorkspace(active,preset){
 saleCustomers=(await api('/customers')).data||[];
 const cur=saleCurrency(),today=saleToday();
 $('#view').innerHTML=
 '<section class="sale-workspace"><div class="sale-catalog">'+
 '<div class="sale-intro"><div><span class="eyebrow">ESPACE DE VENTE UNIFIÉ</span><h2>Construire un dossier de voyage</h2><p>Recherchez les prestations, ajoutez-les au même panier et créez un devis ou un dossier sans changer d’application.</p></div><span class="sale-currency">'+esc(cur)+'</span></div>'+
 '<nav class="sale-tabs"><button type="button" data-sale-tab="flights">✈ Vols</button><button type="button" data-sale-tab="hotels">⌂ Hôtels</button><button type="button" data-sale-tab="services">＋ Autres prestations</button></nav>'+
 '<section class="sale-pane" data-sale-pane="flights"><form id="sale-flight-form" class="sale-search-form"><div class="sale-fields">'+
 '<label>Départ (IATA)<input name="origin" maxlength="3" value="FIH" required></label><label>Destination (IATA)<input name="destination" maxlength="3" placeholder="CDG" required></label>'+
 '<label>Aller<input name="departureDate" type="date" min="'+today+'" value="'+saleDate(20)+'" required></label><label>Retour<input name="returnDate" type="date" min="'+saleDate(20)+'" value="'+saleDate(27)+'"></label>'+
 '<label>Adultes<select name="adults"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select></label><label>Enfants<input name="children" type="number" min="0" max="8" value="0"></label><label>Bébés<input name="infants" type="number" min="0" max="8" value="0"></label>'+
 '<label>Cabine<select name="cabinClass"><option value="ECONOMY">Économique</option><option value="PREMIUM_ECONOMY">Économique premium</option><option value="BUSINESS">Affaires</option><option value="FIRST">Première</option></select></label></div>'+
 '<div class="sale-search-actions"><span>Tarifs fournisseurs · LiteAPI</span><button class="btn primary" id="sale-flight-submit">Rechercher les vols</button></div></form></section>'+
 '<section class="sale-pane" data-sale-pane="hotels" hidden><form id="sale-hotel-form" class="sale-search-form"><div class="sale-fields">'+
 '<label class="sale-span2">Ville / destination<input name="cityName" value="Kinshasa" placeholder="Paris, Kinshasa…" required></label><label>Pays (ISO)<input name="countryCode" maxlength="2" value="'+esc(me&&me.country_code||'CD')+'" required></label>'+
 '<label>Arrivée<input name="checkin" type="date" min="'+today+'" value="'+saleDate(20)+'" required></label><label>Départ<input name="checkout" type="date" min="'+saleDate(21)+'" value="'+saleDate(23)+'" required></label>'+
 '<label>Chambres<select name="rooms"><option>1</option><option>2</option><option>3</option></select></label><label>Adultes / chambre<select name="adults"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><label>Nationalité<input name="guestNationality" maxlength="2" value="'+esc(me&&me.country_code||'CD')+'"></label></div>'+
 '<div class="sale-search-actions"><span>Disponibilités et tarifs LiteAPI</span><button class="btn primary" id="sale-hotel-submit">Rechercher les hôtels</button></div></form></section>'+
 '<section class="sale-pane" data-sale-pane="services" hidden><div class="sale-service-intro"><h3>Autres prestations</h3><p>Ajoutez une prestation au même dossier que vos vols et hôtels.</p></div><div class="sale-service-grid">'+
 '<button type="button" data-sale-service="transfer"><b>Transfert / voiture</b><small>Chauffeur, trajet ou location</small></button><button type="button" data-sale-service="tour"><b>Expérience / excursion</b><small>Activité, visite ou circuit</small></button>'+
 '<button type="button" data-sale-service="visa"><b>Visa & assistance</b><small>Frais de dossier et assistance</small></button><button type="button" data-sale-service="other"><b>Assurance / autre</b><small>Couverture et prestation personnalisée</small></button></div></section>'+
 '<div class="sale-results-head"><h3 id="sale-results-title">Offres de vols</h3><span id="sale-results-count">Renseignez les critères pour commencer</span></div><div id="sale-results">'+empty('Prêt pour votre recherche','Les offres apparaîtront ici. Ajoutez-les au dossier à droite.')+'</div></div>'+
 '<aside class="sale-basket"><div class="sale-basket-head"><div><span class="eyebrow">DOSSIER EN CONSTRUCTION</span><h3>Panier du voyage</h3></div><button class="sale-text-button" id="sale-clear">Vider</button></div>'+
 '<label class="sale-customer-label">Client<select id="sale-customer"><option value="">Sélectionner un client…</option>'+saleCustomers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.first_name+' '+c.last_name)+'</option>').join('')+'</select></label>'+
 '<div class="sale-customer-actions"><button type="button" class="sale-text-button" id="sale-new-customer">＋ Nouveau client</button><a href="#/clients">CRM</a></div><div id="sale-cart" class="sale-cart"></div>'+
 '<div class="sale-totals"><label>Taxes / frais fournisseur<input id="sale-tax" type="number" min="0" step=".01" value="0"></label><label>Frais d’agence<input id="sale-fee" type="number" min="0" step=".01" value="0"></label><label>Remise<input id="sale-discount" type="number" min="0" step=".01" value="0"></label>'+
 '<div class="sale-grand-total"><span>Total estimé</span><strong id="sale-total">'+saleMoney(0)+'</strong></div></div><div class="sale-actions"><button class="btn" id="sale-create-quote" disabled>Créer un devis</button><button class="btn primary" id="sale-create-order" disabled>Créer le dossier</button></div>'+
 '<p class="sale-disclaimer">Une offre affichée n’est pas une réservation confirmée. La confirmation fournisseur reste une étape distincte.</p></aside></section>';
 const tabs=[...$('#view').querySelectorAll('[data-sale-tab]')],panes=[...$('#view').querySelectorAll('[data-sale-pane]')];
 const selectTab=t=>{tabs.forEach(b=>b.classList.toggle('active',b.dataset.saleTab===t));panes.forEach(p=>p.hidden=p.dataset.salePane!==t);const label=t==='flights'?'Vols':t==='hotels'?'Hôtels':'Autres prestations';$('#sale-results-title').textContent=t==='flights'?'Offres de vols':t==='hotels'?'Offres hôtelières':'Autres prestations';$('#title').textContent=label;$('#top-context').textContent=label;document.title=label+' — LuviaPlace OS';document.querySelectorAll('.rail a[data-p]').forEach(a=>a.classList.toggle('on',a.dataset.p===(t==='services'?'experiences':t)));};
 tabs.forEach(b=>b.onclick=()=>selectTab(b.dataset.saleTab));selectTab(active==='services'?'services':active||'flights');
 $('#sale-flight-form').onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),o=b.origin.trim().toUpperCase(),d=b.destination.trim().toUpperCase();
  if(o===d)return toast('Les aéroports doivent être différents.');if(b.returnDate&&b.returnDate<b.departureDate)return toast('La date retour doit suivre la date aller.');
  recordRecentSearch('Vols',o+' → '+d+' · '+b.departureDate+(b.returnDate?' / '+b.returnDate:''));
  const btn=$('#sale-flight-submit');btn.disabled=true;btn.textContent='Recherche…';$('#sale-results').innerHTML=empty('Recherche des vols…','Interrogation de LiteAPI.');
  try{const legs=[{origin:o,destination:d,date:b.departureDate}];if(b.returnDate)legs.push({origin:d,destination:o,date:b.returnDate});
   const r=await send('/integrations/liteapi/flights/search',{legs,adults:Number(b.adults),children:Number(b.children),infants:Number(b.infants),cabinClass:b.cabinClass,currency:cur,country:(me&&me.country_code||'CD').toUpperCase()});
   saleFlightOffers=r.data||[];$('#sale-results-count').textContent=saleFlightOffers.length+' offre(s) LiteAPI';
   $('#sale-results').innerHTML=saleFlightOffers.map((f,i)=>{const airline=f.owner&&f.owner.name||f.airline&&f.airline.name||f.airline||'Compagnie aérienne',price=Number((f.price&&f.price.amount)??f.totalAmount??f.amount??f.price??0),code=f.owner&&f.owner.iataCode||'';return '<article class="sale-offer"><div class="sale-offer-main"><span class="eyebrow">'+esc(code||'VOL')+'</span><h4>'+esc(airline)+'</h4><p>'+esc(o)+' → '+esc(d)+' · '+esc(b.departureDate)+(b.returnDate?' · retour '+esc(b.returnDate):'')+'</p><small>'+esc(f.departureTime||'Horaires à confirmer')+' · '+esc(f.duration||'Durée à confirmer')+'</small></div><div class="sale-offer-price"><strong>'+(price>0?saleMoney(price):'Prix à confirmer')+'</strong><button type="button" class="btn small primary" data-sale-add-flight="'+i+'" '+(price<=0?'disabled':'')+'>Ajouter au dossier</button></div></article>';}).join('')||empty('Aucun vol trouvé','Essayez d’autres dates ou aéroports.');
   $('#sale-results').querySelectorAll('[data-sale-add-flight]').forEach(button=>button.onclick=()=>{const f=saleFlightOffers[Number(button.dataset.saleAddFlight)],price=Number((f.price&&f.price.amount)??f.totalAmount??f.amount??f.price??0);if(price>0)addSaleItem({serviceType:'flight',description:(f.owner&&f.owner.name||f.airline&&f.airline.name||'Vol')+' · '+o+' → '+d+' · '+b.departureDate+(b.returnDate?' / '+b.returnDate:''),unitCost:0,unitPrice:price,provider:'liteapi',providerOfferId:f.offerId||f.id||null,details:{offer:f,legs:legs}});});
  }catch(x){$('#sale-results').innerHTML=empty('Recherche impossible',x.message);$('#sale-results-count').textContent='Erreur fournisseur';}finally{btn.disabled=false;btn.textContent='Rechercher les vols';}
 };
 $('#sale-hotel-form').onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target));if(b.checkout<=b.checkin)return toast('La date de départ doit être après l’arrivée.');
  recordRecentSearch('Hôtels',b.cityName+' · '+b.checkin+' au '+b.checkout);
  const btn=$('#sale-hotel-submit');btn.disabled=true;btn.textContent='Recherche…';$('#sale-results').innerHTML=empty('Recherche des hôtels…','Interrogation de LiteAPI.');
  try{const r=await send('/integrations/liteapi/hotels/search',{cityName:b.cityName.trim(),countryCode:b.countryCode.toUpperCase(),checkin:b.checkin,checkout:b.checkout,currency:cur,guestNationality:(b.guestNationality||'CD').toUpperCase(),occupancies:Array.from({length:Number(b.rooms)},()=>({adults:Number(b.adults)})),maxRatesPerHotel:3});
   saleHotelOffers=r.data||[];$('#sale-results-count').textContent=saleHotelOffers.length+' hôtel(s) disponibles';
   $('#sale-results').innerHTML=saleHotelOffers.map((h,i)=>'<article class="sale-offer sale-hotel-offer">'+(h.main_photo?'<img src="'+esc(h.main_photo)+'" alt="" loading="lazy">':'')+'<div class="sale-offer-main"><span class="eyebrow">'+esc(h.city||b.cityName)+(h.starRating?' · '+h.starRating+' étoiles':'')+'</span><h4>'+esc(h.name)+'</h4><p>'+esc(h.address||'Adresse non renseignée')+' · '+esc(h.roomName||'Chambre disponible')+'</p><small>'+h.nights+' nuit(s) · '+(h.refundable?'Remboursable':'Conditions à vérifier')+' · '+esc(h.boardName||'')+'</small></div><div class="sale-offer-price"><strong>'+saleMoney(h.price,h.currency||cur)+'</strong><button type="button" class="btn small primary" data-sale-add-hotel="'+i+'">Ajouter au dossier</button></div></article>').join('')||empty('Aucun hôtel disponible','Essayez une autre ville ou d’autres dates.');
   $('#sale-results').querySelectorAll('[data-sale-add-hotel]').forEach(button=>button.onclick=()=>{const h=saleHotelOffers[Number(button.dataset.saleAddHotel)];addSaleItem({serviceType:'hotel',description:h.name+' · '+b.cityName+' · '+b.checkin+' au '+b.checkout+' · '+h.roomName,unitCost:0,unitPrice:Number(h.price),provider:'liteapi',providerOfferId:h.offerId||h.hotelId||h.id,details:{rate:h.rate,hotelId:h.hotelId,checkin:b.checkin,checkout:b.checkout,rooms:Number(b.rooms),adults:Number(b.adults)}});});
  }catch(x){$('#sale-results').innerHTML=empty('Recherche impossible',x.message);$('#sale-results-count').textContent='Erreur fournisseur';}finally{btn.disabled=false;btn.textContent='Rechercher les hôtels';}
 };
 $('#view').querySelectorAll('[data-sale-service]').forEach(b=>b.onclick=()=>addManualSaleService(b.dataset.saleService));
 $('#sale-new-customer').onclick=()=>ask('Ajouter un client au dossier',[{n:'firstName',l:'Prénom',req:1},{n:'lastName',l:'Nom',req:1},{n:'email',l:'E-mail',t:'email'},{n:'phone',l:'Téléphone'},{n:'nationality',l:'Nationalité',v:me&&me.country_code||'CD'}],async b=>{const r=await send('/customers',b);saleCustomers.unshift(r.data);$('#sale-customer').insertAdjacentHTML('beforeend','<option value="'+esc(r.data.id)+'">'+esc(r.data.first_name+' '+r.data.last_name)+'</option>');$('#sale-customer').value=r.data.id;saleCustomerId=r.data.id;renderSaleTotals();toast('Client ajouté');},'Ajouter le client');
 $('#sale-customer').value=saleCustomerId;$('#sale-customer').onchange=()=>{saleCustomerId=$('#sale-customer').value;renderSaleTotals();};$('#sale-clear').onclick=()=>{saleCart=[];renderSaleCart();};
 ['sale-tax','sale-fee','sale-discount'].forEach(id=>$('#'+id).oninput=renderSaleTotals);
 $('#sale-create-quote').onclick=createSaleQuote;$('#sale-create-order').onclick=createSaleOrder;renderSaleCart();
}
function addSaleItem(item){saleCart.push(item);renderSaleCart();toast('Prestation ajoutée au dossier');}
function renderSaleCart(){
 const root=$('#sale-cart');if(!root)return;
 root.innerHTML=saleCart.map((i,n)=>'<article class="sale-cart-item"><div><b>'+esc(i.description)+'</b><small>'+esc(i.serviceType)+' · '+esc(i.provider==='liteapi'?'LiteAPI':'Agence')+'</small></div><label>Prix de vente<input type="number" min="0" step=".01" data-sale-price="'+n+'" value="'+Number(i.unitPrice).toFixed(2)+'"></label><button type="button" data-sale-remove="'+n+'" aria-label="Retirer">×</button></article>').join('')||empty('Aucune prestation','Ajoutez un vol, un hôtel ou un service depuis le catalogue.');
 root.querySelectorAll('[data-sale-price]').forEach(x=>x.onchange=()=>{saleCart[Number(x.dataset.salePrice)].unitPrice=Math.max(0,Number(x.value)||0);renderSaleTotals();});
 root.querySelectorAll('[data-sale-remove]').forEach(x=>x.onclick=()=>{saleCart.splice(Number(x.dataset.saleRemove),1);renderSaleCart();});renderSaleTotals();
}
function saleTotals(){const subtotal=saleCart.reduce((n,i)=>n+Number(i.unitPrice||0),0),tax=Math.max(0,Number($('#sale-tax')&&$('#sale-tax').value)||0),fee=Math.max(0,Number($('#sale-fee')&&$('#sale-fee').value)||0),discount=Math.max(0,Number($('#sale-discount')&&$('#sale-discount').value)||0);return{subtotal,tax,fee,discount,total:Math.max(0,subtotal+tax+fee-discount)};}
function renderSaleTotals(){if(!$('#sale-total'))return;const t=saleTotals();$('#sale-total').textContent=saleMoney(t.total);const enabled=saleCart.length&&$('#sale-customer').value&&t.total>0;$('#sale-create-quote').disabled=!enabled;$('#sale-create-order').disabled=!enabled;}
function saleOrderLines(){return saleCart.map(i=>({description:i.description,serviceType:i.serviceType,quantity:1,unitCost:i.unitCost||0,unitPrice:i.unitPrice,provider:i.provider||'manual',providerOfferId:i.providerOfferId||undefined,details:i.details||{}}));}
async function createSaleQuote(){const customerId=$('#sale-customer').value;if(!customerId)return toast('Sélectionnez un client.');const t=saleTotals();try{const feeNote=t.fee>0?'Frais d’agence inclus dans les frais et taxes : '+saleMoney(t.fee)+'.':'';const r=await send('/quotes',{customerId,currency:saleCurrency(),tax:t.tax+t.fee,discount:t.discount,notes:feeNote,items:saleOrderLines()});saleCart=[];toast('Devis '+r.data.quote_number+' créé');location.hash='#/devis';}catch(x){toast('Création du devis impossible : '+x.message);}}
async function createSaleOrder(){const customerId=$('#sale-customer').value;if(!customerId)return toast('Sélectionnez un client.');const t=saleTotals();try{const r=await send('/orders',{customerId,currency:saleCurrency(),tax:t.tax,agencyFee:t.fee,discount:t.discount,items:saleOrderLines()});const order=r.data;saleCart=[];renderSaleCart();toast('Dossier '+order.order_number+' créé');ask('Dossier créé — paiement initial (facultatif)',[{n:'amount',l:'Montant à encaisser (0 pour plus tard)',t:'number',step:'.01',v:t.total},{n:'method',l:'Mode de paiement',opts:[['cash','Espèces'],['mobile_money','Mobile Money'],['card','Carte bancaire'],['bank_transfer','Virement'],['other','Autre']]},{n:'reference',l:'Référence de paiement'}],async b=>{const amount=Number(b.amount)||0;if(amount<0||amount>Number(order.total))throw Error('Montant de paiement invalide.');if(amount>0)await send('/orders/'+order.id+'/payments',{amount,method:b.method,reference:b.reference});toast(amount>0?'Dossier et paiement enregistrés':'Dossier enregistré');location.hash='#/dossiers/'+order.id;},'Terminer');}catch(x){toast('Création du dossier impossible : '+x.message);}}
function addManualSaleService(type){const labels={transfer:'Transfert / voiture',tour:'Expérience / excursion',visa:'Visa & assistance',other:'Assurance / autre prestation'};ask('Ajouter '+labels[type],[{n:'description',l:'Description',req:1},{n:'quantity',l:'Quantité',t:'number',v:'1',req:1},{n:'unitCost',l:'Coût fournisseur',t:'number',step:'.01',v:'0'},{n:'unitPrice',l:'Prix de vente',t:'number',step:'.01',req:1}],async b=>{const q=Math.max(1,Number(b.quantity)||1),p=Number(b.unitPrice),c=Number(b.unitCost)||0;if(!Number.isFinite(p)||p<=0||c<0)throw Error('Vérifiez les prix saisis.');addSaleItem({serviceType:type,description:labels[type]+' · '+b.description+' (x'+q+')',unitCost:c*q,unitPrice:p*q,provider:'manual'});},'Ajouter au dossier');}

/* ---------- start ---------- */
(async () => {
  if (!token) return;
  try { enter((await api('/auth/me')).user); } catch { logout(); }
})();

if('serviceWorker' in navigator)navigator.serviceWorker.register('/pos/sw.js',{scope:'/pos/'}).catch(()=>{});
