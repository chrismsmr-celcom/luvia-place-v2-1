// Données de démonstration pour une agence existante.
// Usage : DATABASE_URL=... node pos/seed-demo.js https://votre-site.onrender.com mon-agence owner@agence.com 'motdepasse'
// Les références fournisseur sont préfixées « DEMO- » : ne les présentez pas comme de vraies réservations.
const { Pool } = require('pg');
const [base, slug, email, password] = process.argv.slice(2);
if (!base || !slug || !email || !password) { console.error('Usage : node pos/seed-demo.js <url> <identifiant-agence> <email> <mot-de-passe>'); process.exit(1); }
let token = '';
const call = async (method, path, body) => {
  const r = await fetch(base.replace(/\/$/, '') + '/api/pos/v1' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(path + ' : ' + (d.error || r.status));
  return d.data || d;
};
const flight = (d, cost, price, qty = 1) => ({ serviceType: 'flight', description: d, unitCost: cost, unitPrice: price, quantity: qty });
const hotel = (d, cost, price) => ({ serviceType: 'hotel', description: d, unitCost: cost, unitPrice: price });
(async () => {
  token = (await call('POST', '/auth/login', { organizationSlug: slug, email, password })).token;
  const people = [['Sarah', 'Mbuyi', '+243 812 450 118'], ['Jean-Claude', 'Ilunga', '+243 899 213 774'], ['Grace', 'Kabeya', '+243 840 336 902'], ['Patrick', 'Mukendi', '+243 970 128 455'], ['Esther', 'Tshimanga', '+243 825 904 361'], ['Didier', 'Kalala', '+243 813 577 029'], ['Nadine', 'Lukusa', '+243 998 640 217']];
  const c = [];
  for (const [firstName, lastName, phone] of people) c.push(await call('POST', '/customers', { firstName, lastName, phone, nationality: 'CD' }));
  for (const [name, type] of [['Ethiopian Airlines', 'airline'], ['Brussels Airlines', 'airline'], ['Air France', 'airline'], ['Pullman Kinshasa Grand Hotel', 'hotel'], ['Fleuve Congo Hotel', 'hotel']]) await call('POST', '/suppliers', { name, type });
  const sales = [
    [0, [flight('Kinshasa → Bruxelles, aller-retour', 820, 895)], 0, 25, 0, [[920, 'card']], 2],
    [1, [flight('Kinshasa → Dubaï via Addis-Abeba, aller-retour', 640, 702)], 0, 0, 0, [[300, 'mobile_money']], 9],
    [2, [hotel('Pullman Kinshasa Grand Hotel, 3 nuits, chambre Deluxe', 540, 603), { serviceType: 'transfer', description: 'Transferts aéroport', unitCost: 25, unitPrice: 40 }], 0, 0, 0, [[643, 'cash']], 5],
    [3, [flight('Kinshasa → Paris, aller-retour', 780, 850), { serviceType: 'visa', description: 'Assistance dossier visa Schengen', unitCost: 20, unitPrice: 60 }], 0, 0, 0, [[400, 'bank_transfer']], 21],
    [4, [flight('Kinshasa → Johannesburg, aller-retour', 410, 455)], 0, 0, 0, [[455, 'mobile_money']], 14],
    [5, [hotel('Fleuve Congo Hotel, 2 nuits, chambre Standard', 380, 420)], 0, 0, 0, [[420, 'cash']], 1],
    [6, [flight('Kinshasa → Luanda, aller-retour, 2 passagers', 300, 340, 2)], 0, 20, 0, [[400, 'mobile_money']], 12]
  ];
  const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }, options: '-c search_path=pos,public' }) : null;
  let n = 0;
  for (const [i, items, tax, agencyFee, discount, pays, age] of sales) {
    const o = await call('POST', '/orders', { customerId: c[i].id, items, tax, agencyFee, discount });
    for (const [amount, method] of pays) await call('POST', `/orders/${o.id}/payments`, { amount, method });
    if (pays.reduce((s, p) => s + p[0], 0) >= Number(o.total)) {
      const full = await call('GET', '/orders/' + o.id);
      for (const b of full.bookings) await call('PATCH', '/bookings/' + b.id, { status: 'confirmed', providerReference: 'DEMO-' + String(++n).padStart(4, '0') });
    }
    if (pool) { await pool.query("UPDATE orders SET created_at=now()-($2||' days')::interval WHERE id=$1", [o.id, age]); await pool.query("UPDATE payments SET received_at=now()-($2||' days')::interval WHERE order_id=$1", [o.id, age]); }
  }
  console.log('Données de démonstration créées :', c.length, 'clients,', sales.length, 'dossiers.');
  if (!pool) console.log('Astuce : fournissez DATABASE_URL pour répartir les dates sur les dernières semaines.');
  if (pool) await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
