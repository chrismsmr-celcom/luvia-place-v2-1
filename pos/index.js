const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');
const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') ? { rejectUnauthorized: false } : false, options: '-c search_path=pos,public', max: 10 });
const secret = process.env.POS_JWT_SECRET;
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
const fail = (status,message) => Object.assign(new Error(message),{status});
const emailOK = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const dateOK = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const org = req => req.user.organizationId;
function config(){ if(!process.env.DATABASE_URL) throw fail(503,'DATABASE_URL is missing'); if(!secret || secret.length<32) throw fail(503,'POS_JWT_SECRET must be at least 32 characters'); }
function token(u){ return jwt.sign({sub:u.id,organizationId:u.organization_id,role:u.role,email:u.email},secret,{expiresIn:process.env.POS_TOKEN_TTL||'12h',issuer:'luvia-pos'}); }
function auth(req,res,next){ try { config(); const h=req.headers.authorization||''; if(!h.startsWith('Bearer ')) throw fail(401,'Bearer token required'); const c=jwt.verify(h.slice(7),secret,{issuer:'luvia-pos'}); req.user={id:c.sub,organizationId:c.organizationId,role:c.role,email:c.email}; next(); } catch(e){ next(e.status?e:fail(401,'Invalid or expired session')); } }
function allow(...roles){ return (req,res,next)=>roles.includes(req.user.role)?next():next(fail(403,'Insufficient permissions')); }
async function audit(db,req,action,type,id,metadata={}){ await db.query('INSERT INTO audit_logs (organization_id,actor_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5,$6)',[org(req),req.user.id,action,type,id||null,metadata]); }
async function tx(fn){ const db=await pool.connect(); try{ await db.query('BEGIN'); const out=await fn(db); await db.query('COMMIT'); return out; }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();} }
async function lite(path,body){ const mode=(process.env.LITEAPI_ENV||'sandbox').toLowerCase(); const key=(mode==='prod'||mode==='production')?process.env.PROD_API_KEY:process.env.SAND_API_KEY; if(!key) throw fail(503,'LiteAPI key is not configured'); const r=await fetch('https://api.liteapi.travel/v3.0/'+path,{method:'POST',headers:{'X-API-Key':key,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)}); const data=await r.json().catch(()=>({})); if(!r.ok||data.error) throw fail(r.status>=500?502:r.status,data.error?.message||data.message||'LiteAPI request failed'); return data; }
router.get('/health',asyncRoute(async(req,res)=>{
 const missing=[];if(!process.env.DATABASE_URL)missing.push('DATABASE_URL');if(!secret||secret.length<32)missing.push('POS_JWT_SECRET');
 if(missing.length)return res.status(503).json({success:false,error:'Configuration manquante : '+missing.join(', ')});
 try{await pool.query('SELECT 1')}catch(e){throw fail(503,'Connexion PostgreSQL impossible. Vérifiez DATABASE_URL et les paramètres de connexion Supabase.')}
 const requiredTables=['organizations','users','customers','suppliers','travel_requests','quotes','quote_items','orders','bookings','payments','invoices','audit_logs','order_items'];
 const checks=await pool.query(
  "SELECT name, to_regclass('pos.' || quote_ident(name)) IS NOT NULL AS present FROM unnest($1::text[]) AS required(name)",
  [requiredTables]
 );
 const missingTables=checks.rows.filter(row=>!row.present).map(row=>row.name);
 if(missingTables.length)return res.status(503).json({success:false,error:'Schéma POS incomplet. Exécutez pos/schema.sql dans Supabase SQL Editor.',missingTables});
 const path=await pool.query("SELECT current_schema() AS current_schema, current_setting('search_path') AS search_path");
 if(path.rows[0].current_schema!=='pos')return res.status(503).json({success:false,error:'Le search_path PostgreSQL du POS est incorrect.',searchPath:path.rows[0].search_path});
 res.json({success:true,service:'luvia-pos-api',version:'1.2.0',database:'connected',schema:'ready',schemaName:'pos'});
}));
router.post('/auth/bootstrap',asyncRoute(async(req,res)=>{
 config(); const supplied=String(req.headers['x-bootstrap-secret']||''), expected=String(process.env.POS_BOOTSTRAP_SECRET||'');
 if(!expected||!supplied||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) throw fail(403,'Invalid bootstrap secret');
 const b=req.body||{}; if(!b.organizationName||!b.slug||!b.fullName||!emailOK(b.email)||typeof b.password!=='string'||b.password.length<12) throw fail(400,'Organization, slug, name, valid email and password (12+ chars) required');
 const result=await tx(async db=>{const count=await db.query('SELECT COUNT(*)::int AS n FROM organizations');if(count.rows[0].n)throw fail(409,'Bootstrap already completed');const o=await db.query('INSERT INTO organizations(name,slug,country_code,default_currency) VALUES($1,$2,$3,$4) RETURNING *',[b.organizationName,b.slug.toLowerCase(),(b.countryCode||'CD').toUpperCase(),(b.currency||'USD').toUpperCase()]);const hash=await bcrypt.hash(b.password,12);const u=await db.query('INSERT INTO users(organization_id,full_name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,organization_id,full_name,email,role',[o.rows[0].id,b.fullName,b.email.toLowerCase(),hash,'owner']);return {organization:o.rows[0],user:u.rows[0]};});
 res.status(201).json({success:true,...result,token:token(result.user)});
}));
const registrationAttempts=new Map();
router.post('/auth/register',asyncRoute(async(req,res)=>{
 config();
 const ip=req.ip||req.socket.remoteAddress||'unknown',now=Date.now(),prior=registrationAttempts.get(ip)||[];
 const recent=prior.filter(t=>now-t<15*60*1000);
 if(recent.length>=5)throw fail(429,'Trop de tentatives. Réessayez dans 15 minutes.');
 recent.push(now);registrationAttempts.set(ip,recent);
 if(registrationAttempts.size>5000)for(const [key,times] of registrationAttempts)if(!times.some(t=>now-t<15*60*1000))registrationAttempts.delete(key);
 const b=req.body||{};
 const organizationName=String(b.organizationName||'').trim();
 const slug=String(b.slug||'').trim().toLowerCase();
 const fullName=String(b.fullName||'').trim();
 const email=String(b.email||'').trim().toLowerCase();
 const password=b.password;
 const countryCode=String(b.countryCode||'CD').trim().toUpperCase();
 const currency=String(b.currency||'USD').trim().toUpperCase();
 if(!organizationName||organizationName.length>120||!fullName||fullName.length>120||!emailOK(email)||email.length>254||typeof password!=='string'||password.length<12||password.length>128||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>60||!/^[A-Z]{2}$/.test(countryCode)||!/^[A-Z]{3}$/.test(currency))throw fail(400,'Vérifiez les champs. Le mot de passe doit contenir au moins 12 caractères et l’identifiant agence doit utiliser lettres, chiffres et tirets.');
 const result=await tx(async db=>{
  const existing=await db.query('SELECT id FROM organizations WHERE slug=$1',[slug]);
  if(existing.rowCount)throw fail(409,'Cet identifiant agence est déjà utilisé.');
  const o=await db.query('INSERT INTO organizations(name,slug,country_code,default_currency) VALUES($1,$2,$3,$4) RETURNING id,name,slug,country_code,default_currency',[organizationName,slug,countryCode,currency]);
  const hash=await bcrypt.hash(password,12);
  const u=await db.query('INSERT INTO users(organization_id,full_name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,organization_id,full_name,email,role',[o.rows[0].id,fullName,email,hash,'owner']);
  return {organization:o.rows[0],user:{...u.rows[0],organization_name:o.rows[0].name,organization_slug:o.rows[0].slug}};
 }).catch(e=>{if(e.code==='23505')throw fail(409,'Cet identifiant agence ou cet e-mail existe déjà.');throw e;});
 res.status(201).json({success:true,...result,token:token(result.user)});
}));
router.post('/auth/login',asyncRoute(async(req,res)=>{config();const b=req.body||{};if(!emailOK(b.email)||!b.password||!b.organizationSlug)throw fail(400,'organizationSlug, email and password required');const q=await pool.query('SELECT u.*,o.name AS organization_name,o.slug AS organization_slug FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.email=$1 AND o.slug=$2',[b.email.toLowerCase(),b.organizationSlug.toLowerCase()]);const u=q.rows[0];if(!u||!u.active||!(await bcrypt.compare(b.password,u.password_hash)))throw fail(401,'Invalid credentials');delete u.password_hash;res.json({success:true,user:u,token:token(u)});}));
router.use(auth);
router.get('/auth/me',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT u.id,u.full_name,u.email,u.role,o.id AS organization_id,o.name AS organization_name,o.slug,o.default_currency,o.country_code FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=$1 AND u.organization_id=$2 AND u.active=true',[req.user.id,org(req)]);if(!q.rowCount)throw fail(401,'User inactive');res.json({success:true,user:q.rows[0]});}));
router.get('/organization',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT id,name,slug,country_code,default_currency,phone,email,address,website,logo_url,created_at FROM organizations WHERE id=$1',[org(req)]);if(!q.rowCount)throw fail(404,'Agency not found');res.json({success:true,data:q.rows[0]});}));
router.patch('/organization',allow('owner','admin'),asyncRoute(async(req,res)=>{const b=req.body||{},name=String(b.name||'').trim(),country=String(b.countryCode||'').toUpperCase(),currency=String(b.currency||'').toUpperCase();if(!name||name.length>120||!/^[A-Z]{2}$/.test(country)||!/^[A-Z]{3}$/.test(currency))throw fail(400,'Nom, code pays ISO (2 lettres) et devise ISO (3 lettres) requis.');if(b.email&&!emailOK(b.email))throw fail(400,'Adresse e-mail invalide.');const q=await pool.query('UPDATE organizations SET name=$1,country_code=$2,default_currency=$3,email=$4,phone=$5,address=$6,website=$7,logo_url=$8,updated_at=now() WHERE id=$9 RETURNING id,name,slug,country_code,default_currency,phone,email,address,website,logo_url',[name,country,currency,String(b.email||'').trim()||null,String(b.phone||'').trim()||null,String(b.address||'').trim()||null,String(b.website||'').trim()||null,String(b.logoUrl||'').trim()||null,org(req)]);await audit(pool,req,'organization.updated','organization',org(req));res.json({success:true,data:q.rows[0]});}));
router.get('/dashboard/summary',asyncRoute(async(req,res)=>{const o=org(req);const names=['customers','travel_requests','orders','bookings'];const counts={};for(const t of names){const q=await pool.query('SELECT COUNT(*)::int AS n FROM '+t+' WHERE organization_id=$1',[o]);counts[t]=q.rows[0].n;}const rev=await pool.query("SELECT COALESCE(SUM(amount),0)::numeric(14,2) AS n FROM payments WHERE organization_id=$1 AND status='received' AND received_at>=date_trunc('month',now())",[o]);const recent=await pool.query('SELECT id,order_number,status,total,currency,created_at FROM orders WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 6',[o]);res.json({success:true,metrics:{customers:counts.customers,openRequests:counts.travel_requests,activeOrders:counts.orders,pendingBookings:counts.bookings,monthRevenue:rev.rows[0].n},recentOrders:recent.rows});}));
router.get('/customers',asyncRoute(async(req,res)=>{const q=await pool.query("SELECT id,first_name,last_name,email,phone,nationality,created_at FROM customers WHERE organization_id=$1 AND ($2='' OR first_name ILIKE '%'||$2||'%' OR last_name ILIKE '%'||$2||'%' OR email ILIKE '%'||$2||'%') ORDER BY created_at DESC LIMIT 100",[org(req),String(req.query.q||'')]);res.json({success:true,data:q.rows});}));
router.post('/customers',asyncRoute(async(req,res)=>{const b=req.body||{};if(!b.firstName||!b.lastName)throw fail(400,'firstName and lastName required');if(b.email&&!emailOK(b.email))throw fail(400,'Invalid email');const q=await pool.query('INSERT INTO customers(organization_id,first_name,last_name,email,phone,nationality,passport_number,passport_expiry,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[org(req),b.firstName,b.lastName,b.email?.toLowerCase()||null,b.phone||null,b.nationality?.toUpperCase()||null,b.passportNumber||null,b.passportExpiry||null,b.notes||null,req.user.id]);await audit(pool,req,'customer.created','customer',q.rows[0].id);res.status(201).json({success:true,data:q.rows[0]});}));
router.patch('/customers/:id',asyncRoute(async(req,res)=>{const map={firstName:'first_name',lastName:'last_name',email:'email',phone:'phone',nationality:'nationality',passportNumber:'passport_number',passportExpiry:'passport_expiry',notes:'notes'};const vals=[],sets=[];for(const [k,c] of Object.entries(map)){if(req.body&&Object.prototype.hasOwnProperty.call(req.body,k)){vals.push(req.body[k]);sets.push(c+'=$'+vals.length);}}if(!sets.length)throw fail(400,'No fields to update');vals.push(req.params.id,org(req));const q=await pool.query('UPDATE customers SET '+sets.join(',')+',updated_at=now() WHERE id=$'+(vals.length-1)+' AND organization_id=$'+vals.length+' RETURNING *',vals);if(!q.rowCount)throw fail(404,'Customer not found');await audit(pool,req,'customer.updated','customer',req.params.id);res.json({success:true,data:q.rows[0]});}));
router.get('/suppliers',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT * FROM suppliers WHERE organization_id=$1 ORDER BY name',[org(req)]);res.json({success:true,data:q.rows});}));
router.post('/suppliers',asyncRoute(async(req,res)=>{const b=req.body||{};if(!b.name||!['airline','hotel','transport','visa','tour_operator','other'].includes(b.type))throw fail(400,'Supplier name and valid type required');const q=await pool.query('INSERT INTO suppliers(organization_id,name,type,contact_name,email,phone,currency,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[org(req),b.name,b.type,b.contactName||null,b.email||null,b.phone||null,(b.currency||'USD').toUpperCase(),b.notes||null]);await audit(pool,req,'supplier.created','supplier',q.rows[0].id);res.status(201).json({success:true,data:q.rows[0]});}));
router.get('/travel-requests',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT r.*,c.first_name,c.last_name FROM travel_requests r JOIN customers c ON c.id=r.customer_id WHERE r.organization_id=$1 ORDER BY r.created_at DESC LIMIT 100',[org(req)]);res.json({success:true,data:q.rows});}));
router.post('/travel-requests',asyncRoute(async(req,res)=>{const b=req.body||{};if(!b.customerId||!['flight','hotel','package','transfer','visa','other'].includes(b.requestType))throw fail(400,'customerId and valid requestType required');if(b.departureDate&&!dateOK(b.departureDate))throw fail(400,'Invalid departureDate');if(b.returnDate&&!dateOK(b.returnDate))throw fail(400,'Invalid returnDate');const q=await pool.query('INSERT INTO travel_requests(organization_id,customer_id,request_type,origin,destination,departure_date,return_date,adults,children,currency,notes,created_by) SELECT $1,id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 FROM customers WHERE id=$2 AND organization_id=$1 RETURNING *',[org(req),b.customerId,b.requestType,b.origin||null,b.destination||null,b.departureDate||null,b.returnDate||null,Math.max(1,Number(b.adults)||1),Math.max(0,Number(b.children)||0),(b.currency||'USD').toUpperCase(),b.notes||null,req.user.id]);if(!q.rowCount)throw fail(404,'Customer not found');await audit(pool,req,'travel_request.created','travel_request',q.rows[0].id);res.status(201).json({success:true,data:q.rows[0]});}));
router.patch('/travel-requests/:id',allow('owner','admin','manager'),asyncRoute(async(req,res)=>{const b=req.body||{},allowed=['open','quoted','confirmed','cancelled','closed'];if(!allowed.includes(b.status))throw fail(400,'Statut de demande invalide.');const q=await pool.query('UPDATE travel_requests SET status=$1,updated_at=now() WHERE id=$2 AND organization_id=$3 RETURNING *',[b.status,req.params.id,org(req)]);if(!q.rowCount)throw fail(404,'Demande introuvable.');await audit(pool,req,'travel_request.status_changed','travel_request',req.params.id,{status:b.status});res.json({success:true,data:q.rows[0]});}));
router.get('/quotes',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT q.*,c.first_name,c.last_name FROM quotes q JOIN customers c ON c.id=q.customer_id WHERE q.organization_id=$1 ORDER BY q.created_at DESC LIMIT 100',[org(req)]);res.json({success:true,data:q.rows});}));
router.post('/quotes',asyncRoute(async(req,res)=>{const b=req.body||{};if(!b.customerId||!Array.isArray(b.items)||!b.items.length)throw fail(400,'customerId and quote items required');const data=await tx(async db=>{const cust=await db.query('SELECT id FROM customers WHERE id=$1 AND organization_id=$2',[b.customerId,org(req)]);if(!cust.rowCount)throw fail(404,'Customer not found');if(b.requestId){const rq=await db.query('SELECT id FROM travel_requests WHERE id=$1 AND organization_id=$2 AND customer_id=$3',[b.requestId,org(req),b.customerId]);if(!rq.rowCount)throw fail(404,'Travel request not found for this customer');}const number=await nextNumber(db,org(req),'quote','DV');const items=b.items.map(i=>({description:i.description||'Travel service',type:i.serviceType||'other',quantity:Math.max(.01,Number(i.quantity)||1),cost:Math.max(0,Number(i.unitCost)||0),price:Math.max(0,Number(i.unitPrice)||0)}));const subtotal=items.reduce((s,i)=>s+i.quantity*i.price,0),discount=Math.max(0,Number(b.discount)||0),tax=Math.max(0,Number(b.tax)||0),total=Math.max(0,subtotal-discount+tax);const q=await db.query('INSERT INTO quotes(organization_id,request_id,customer_id,quote_number,currency,subtotal,discount,tax,total,valid_until,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[org(req),b.requestId||null,b.customerId,number,(b.currency||'USD').toUpperCase(),subtotal,discount,tax,total,b.validUntil||null,b.notes||null,req.user.id]);for(const i of items)await db.query('INSERT INTO quote_items(quote_id,description,service_type,quantity,unit_cost,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7)',[q.rows[0].id,i.description,i.type,i.quantity,i.cost,i.price,i.quantity*i.price]);await audit(db,req,'quote.created','quote',q.rows[0].id,{total});return q.rows[0];});res.status(201).json({success:true,data});}));
router.post('/quotes/:id/accept',asyncRoute(async(req,res)=>{const q=await pool.query("UPDATE quotes SET status='accepted' WHERE id=$1 AND organization_id=$2 AND status IN ('draft','sent') RETURNING *",[req.params.id,org(req)]);if(!q.rowCount)throw fail(404,'Quote not found or not actionable');await audit(pool,req,'quote.accepted','quote',req.params.id);res.json({success:true,data:q.rows[0]});}));
router.get('/orders',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT o.*,c.first_name,c.last_name FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.organization_id=$1 ORDER BY o.created_at DESC LIMIT 100',[org(req)]);res.json({success:true,data:q.rows});}));
// ---- Orders: server-side totals, supplier cost, margin, order lines and pending bookings ----
const SERVICE_TYPES=['flight','hotel','transfer','visa','tour','other'];
const num=v=>Math.max(0,Number(v)||0);
const r2=n=>Math.round((Number(n)||0)*100)/100;
async function nextNumber(db,orgId,kind,prefix){
 const col={order:'order_seq',quote:'quote_seq',invoice:'invoice_seq'}[kind];
 const r=await db.query('UPDATE organizations SET '+col+'='+col+'+1 WHERE id=$1 RETURNING '+col+' AS n',[orgId]);
 return prefix+'-'+new Date().getFullYear()+'-'+String(r.rows[0].n).padStart(5,'0');
}
const stamp=prefix=>prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase();
function normalizeItem(i){
 const type=i.serviceType==='activity'?'tour':(SERVICE_TYPES.includes(i.serviceType)?i.serviceType:'other');
 return{type,description:String(i.description||'Travel service').slice(0,500),quantity:Math.max(.01,Number(i.quantity)||1),cost:num(i.unitCost),price:num(i.unitPrice),supplierId:i.supplierId||null,provider:String(i.provider||'manual').slice(0,40),offerId:i.providerOfferId?String(i.providerOfferId).slice(0,500):null,details:(i.details&&typeof i.details==='object')?i.details:{},startDate:dateOK(i.startDate)?i.startDate:null,endDate:dateOK(i.endDate)?i.endDate:null,travelerName:i.travelerName?String(i.travelerName).slice(0,200):null};
}
function computeTotals(items,tax,agencyFee,discount){
 const subtotal=r2(items.reduce((s,i)=>s+i.quantity*i.price,0)),costTotal=r2(items.reduce((s,i)=>s+i.quantity*i.cost,0));
 return{subtotal,costTotal,tax,agencyFee,discount,total:Math.max(0,r2(subtotal+tax+agencyFee-discount)),margin:r2(subtotal+agencyFee-discount-costTotal)};
}
async function insertOrderWithItems(db,{organizationId,customerId,quoteId,currency,items,t,notes,createdBy,agentId,source,externalRef,dueDate,status,amountPaid,margin}){
 const paid=num(amountPaid);
 const o=await db.query('INSERT INTO orders(organization_id,customer_id,quote_id,order_number,status,currency,total,amount_paid,balance_due,subtotal,tax,agency_fee,discount,cost_total,margin,source,external_ref,agent_id,due_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *',[organizationId,customerId,quoteId||null,await nextNumber(db,organizationId,'order','D'),status||'pending',currency,t.total,paid,r2(t.total-paid),t.subtotal,t.tax,t.agencyFee,t.discount,t.costTotal,margin===undefined?t.margin:margin,source||'pos',externalRef||null,agentId||null,dueDate||null,notes||null,createdBy||null]);
 const order=o.rows[0];
 for(const i of items){
  const it=await db.query('INSERT INTO order_items(organization_id,order_id,service_type,description,supplier_id,quantity,unit_cost,unit_price,line_total,provider,provider_offer_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',[organizationId,order.id,i.type,i.description,i.supplierId,i.quantity,i.cost,i.price,r2(i.quantity*i.price),i.provider,i.offerId,i.details]);
  if(i.type!=='other')await db.query('INSERT INTO bookings(organization_id,order_id,order_item_id,supplier_id,service_type,provider,provider_reference,status,start_date,end_date,traveler_name,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[organizationId,order.id,it.rows[0].id,i.supplierId,i.type,i.provider,i.providerReference||null,i.bookingStatus||'pending',i.startDate,i.endDate,i.travelerName,{...i.details,offerId:i.offerId,description:i.description}]);
 }
 return order;
}
router.post('/orders',asyncRoute(async(req,res)=>{
 const b=req.body||{};if(!b.customerId)throw fail(400,'customerId required');
 const data=await tx(async db=>{
  const c=await db.query('SELECT id FROM customers WHERE id=$1 AND organization_id=$2',[b.customerId,org(req)]);if(!c.rowCount)throw fail(404,'Customer not found');
  let items,currency=String(b.currency||'USD').toUpperCase(),tax=num(b.tax),agencyFee=num(b.agencyFee),discount=num(b.discount),quoteId=null;
  if(b.quoteId){
   const q=await db.query("SELECT * FROM quotes WHERE id=$1 AND organization_id=$2 AND status='accepted' FOR UPDATE",[b.quoteId,org(req)]);
   if(!q.rowCount)throw fail(409,'Only accepted quotes can be converted');if(q.rows[0].customer_id!==b.customerId)throw fail(409,'Quote customer does not match order customer');
   const qi=await db.query('SELECT * FROM quote_items WHERE quote_id=$1',[b.quoteId]);
   items=qi.rows.map(r=>normalizeItem({description:r.description,serviceType:r.service_type,quantity:r.quantity,unitCost:r.unit_cost,unitPrice:r.unit_price,supplierId:r.supplier_id,details:r.metadata}));
   tax=num(q.rows[0].tax);discount=num(q.rows[0].discount);agencyFee=0;currency=q.rows[0].currency;quoteId=b.quoteId;
   await db.query("UPDATE quotes SET status='converted' WHERE id=$1",[b.quoteId]);
  }else if(Array.isArray(b.items)&&b.items.length){
   if(b.items.length>50)throw fail(400,'Too many order lines (max 50)');
   items=b.items.map(normalizeItem);
   const ids=[...new Set(items.map(i=>i.supplierId).filter(Boolean))];
   if(ids.length){const s=await db.query('SELECT id FROM suppliers WHERE id=ANY($1::uuid[]) AND organization_id=$2',[ids,org(req)]);if(s.rowCount!==ids.length)throw fail(404,'Supplier not found');}
  }else{
   // Legacy payload: a bare total with no lines.
   const total=num(b.total);if(!total)throw fail(400,'items, quoteId or total required');
   items=[normalizeItem({description:b.notes||'Dossier de voyage',serviceType:'other',unitPrice:total})];
  }
  const t=computeTotals(items,tax,agencyFee,discount);
  const order=await insertOrderWithItems(db,{organizationId:org(req),customerId:b.customerId,quoteId,currency,items,t,notes:b.notes,createdBy:req.user.id,agentId:req.user.id,source:'pos',dueDate:dateOK(b.dueDate)?b.dueDate:null,margin:items.every(i=>i.cost>0||i.price===0)?undefined:null});
  await audit(db,req,'order.created','order',order.id,{total:t.total,margin:order.margin,lines:items.length});
  return order;
 });
 res.status(201).json({success:true,data});
}));
router.get('/orders/:id',asyncRoute(async(req,res)=>{
 const [o,b,p,i,inv]=await Promise.all([
  pool.query('SELECT o.*,c.first_name,c.last_name,c.email,c.phone,u.full_name AS agent_name FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN users u ON u.id=o.agent_id WHERE o.id=$1 AND o.organization_id=$2',[req.params.id,org(req)]),
  pool.query('SELECT * FROM bookings WHERE order_id=$1 AND organization_id=$2 ORDER BY created_at',[req.params.id,org(req)]),
  pool.query('SELECT * FROM payments WHERE order_id=$1 AND organization_id=$2 ORDER BY received_at DESC',[req.params.id,org(req)]),
  pool.query('SELECT * FROM order_items WHERE order_id=$1 AND organization_id=$2 ORDER BY created_at',[req.params.id,org(req)]),
  pool.query('SELECT * FROM invoices WHERE order_id=$1 AND organization_id=$2 ORDER BY issued_at DESC',[req.params.id,org(req)])]);
 if(!o.rowCount)throw fail(404,'Order not found');
 res.json({success:true,data:{...o.rows[0],items:i.rows,bookings:b.rows,payments:p.rows,invoices:inv.rows}});
}));
router.get('/reports/sales',allow('owner','admin','manager','accountant'),asyncRoute(async(req,res)=>{
 const to=dateOK(req.query.to)?req.query.to:new Date().toISOString().slice(0,10);
 const from=dateOK(req.query.from)?req.query.from:new Date(Date.parse(to)-29*86400000).toISOString().slice(0,10);
 const args=[org(req),from,to],where="o.organization_id=$1 AND o.status NOT IN ('cancelled','refunded') AND o.created_at>=$2::date AND o.created_at<($3::date+1)";
 const [sum,byAgent,byType,bySource]=await Promise.all([
  pool.query("SELECT COUNT(*)::int AS orders,COALESCE(SUM(o.total),0)::numeric(14,2) AS revenue,COALESCE(SUM(o.cost_total) FILTER (WHERE o.margin IS NOT NULL),0)::numeric(14,2) AS cost,COALESCE(SUM(o.margin),0)::numeric(14,2) AS margin,COUNT(*) FILTER (WHERE o.margin IS NULL)::int AS orders_without_margin,COALESCE(SUM(o.amount_paid),0)::numeric(14,2) AS collected,COALESCE(SUM(o.balance_due),0)::numeric(14,2) AS outstanding FROM orders o WHERE "+where,args),
  pool.query("SELECT u.id,u.full_name,COUNT(*)::int AS orders,COALESCE(SUM(o.total),0)::numeric(14,2) AS revenue,COALESCE(SUM(o.margin),0)::numeric(14,2) AS margin FROM orders o LEFT JOIN users u ON u.id=o.agent_id WHERE "+where+" GROUP BY u.id,u.full_name ORDER BY revenue DESC",args),
  pool.query("SELECT i.service_type,COUNT(*)::int AS lines,COALESCE(SUM(i.line_total),0)::numeric(14,2) AS revenue FROM order_items i JOIN orders o ON o.id=i.order_id WHERE "+where+" GROUP BY i.service_type ORDER BY revenue DESC",args),
  pool.query("SELECT o.source,COUNT(*)::int AS orders,COALESCE(SUM(o.total),0)::numeric(14,2) AS revenue FROM orders o WHERE "+where+" GROUP BY o.source ORDER BY revenue DESC",args)]);
 res.json({success:true,period:{from,to},currencyNote:'Amounts are summed as stored; use one currency per agency until FX is configured.',summary:sum.rows[0],byAgent:byAgent.rows,byServiceType:byType.rows,bySource:bySource.rows});
}));
router.post('/orders/:id/payments',asyncRoute(async(req,res)=>{const b=req.body||{},amount=Number(b.amount);if(!Number.isFinite(amount)||amount<=0||!['cash','bank_transfer','mobile_money','card','other'].includes(b.method))throw fail(400,'Valid amount and payment method required');const p=await tx(async db=>{const o=await db.query('SELECT * FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE',[req.params.id,org(req)]);if(!o.rowCount)throw fail(404,'Order not found');if(['cancelled','refunded'].includes(o.rows[0].status))throw fail(409,'Cannot take payment on a '+o.rows[0].status+' order');if(amount>Number(o.rows[0].balance_due))throw fail(409,'Payment exceeds balance due');const x=await db.query('INSERT INTO payments(organization_id,order_id,amount,currency,method,reference,received_by,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[org(req),req.params.id,amount,o.rows[0].currency,b.method,b.reference||null,req.user.id,b.notes||null]);const paid=Number(o.rows[0].amount_paid)+amount,balance=Number((Number(o.rows[0].total)-paid).toFixed(2));await db.query("UPDATE orders SET amount_paid=$1,balance_due=$2,status=CASE WHEN $2::numeric=0 AND status='pending' THEN 'confirmed' ELSE status END WHERE id=$3",[paid,balance,req.params.id]);await audit(db,req,'payment.received','payment',x.rows[0].id,{amount});return x.rows[0];});res.status(201).json({success:true,data:p});}));
router.post('/orders/:id/bookings',asyncRoute(async(req,res)=>{const b=req.body||{};if(!['flight','hotel','transfer','visa','tour','other'].includes(b.serviceType))throw fail(400,'Valid serviceType required');if(b.supplierId){const s=await pool.query('SELECT id FROM suppliers WHERE id=$1 AND organization_id=$2',[b.supplierId,org(req)]);if(!s.rowCount)throw fail(404,'Supplier not found');}const q=await pool.query('INSERT INTO bookings(organization_id,order_id,supplier_id,service_type,provider,provider_reference,status,start_date,end_date,traveler_name,details) SELECT $1,id,$3,$4,$5,$6,$7,$8,$9,$10,$11 FROM orders WHERE id=$2 AND organization_id=$1 RETURNING *',[org(req),req.params.id,b.supplierId||null,b.serviceType,b.provider||'manual',b.providerReference||null,b.status||'pending',b.startDate||null,b.endDate||null,b.travelerName||null,b.details||{}]);if(!q.rowCount)throw fail(404,'Order not found');await audit(pool,req,'booking.created','booking',q.rows[0].id);res.status(201).json({success:true,data:q.rows[0]});}));
router.patch('/bookings/:id',asyncRoute(async(req,res)=>{const b=req.body||{},map={status:'status',providerReference:'provider_reference',startDate:'start_date',endDate:'end_date',travelerName:'traveler_name',details:'details'},vals=[],sets=[];for(const [k,c] of Object.entries(map))if(Object.prototype.hasOwnProperty.call(b,k)){vals.push(b[k]);sets.push(c+'=$'+vals.length);}if(!sets.length)throw fail(400,'No supported fields');vals.push(req.params.id,org(req));const q=await pool.query('UPDATE bookings SET '+sets.join(',')+',updated_at=now() WHERE id=$'+(vals.length-1)+' AND organization_id=$'+vals.length+' RETURNING *',vals);if(!q.rowCount)throw fail(404,'Booking not found');await audit(pool,req,'booking.updated','booking',req.params.id);res.json({success:true,data:q.rows[0]});}));

router.get('/team',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT id,full_name,email,role,active,created_at FROM users WHERE organization_id=$1 ORDER BY created_at',[org(req)]);res.json({success:true,data:q.rows});}));
router.post('/team',allow('owner','admin'),asyncRoute(async(req,res)=>{const b=req.body||{};if(!b.fullName||!emailOK(b.email)||typeof b.password!=='string'||b.password.length<12||!['admin','manager','agent','accountant'].includes(b.role))throw fail(400,'Full name, valid email, password (12+ chars) and valid role required');const hash=await bcrypt.hash(b.password,12);const q=await pool.query('INSERT INTO users(organization_id,full_name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,email,role,active,created_at',[org(req),b.fullName,b.email.toLowerCase(),hash,b.role]);await audit(pool,req,'team_member.created','user',q.rows[0].id,{role:b.role});res.status(201).json({success:true,data:q.rows[0]});}));
router.patch('/team/:id',allow('owner','admin'),asyncRoute(async(req,res)=>{const b=req.body||{};if(b.role!==undefined&&!['admin','manager','agent','accountant'].includes(b.role))throw fail(400,'Rôle invalide.');const target=await pool.query('SELECT id,role FROM users WHERE id=$1 AND organization_id=$2',[req.params.id,org(req)]);if(!target.rowCount)throw fail(404,'Membre introuvable.');if(target.rows[0].role==='owner')throw fail(403,'Le rôle du propriétaire ne peut pas être modifié.');if(req.user.role==='admin'&&(target.rows[0].role==='admin'||b.role==='admin'))throw fail(403,'Un administrateur ne peut pas modifier un autre administrateur ni attribuer le rôle Admin.');if(b.active===false&&req.params.id===req.user.id)throw fail(409,'Vous ne pouvez pas désactiver votre propre compte.');const q=await pool.query('UPDATE users SET role=COALESCE($1,role),active=COALESCE($2,active) WHERE id=$3 AND organization_id=$4 RETURNING id,full_name,email,role,active,created_at',[b.role||null,typeof b.active==='boolean'?b.active:null,req.params.id,org(req)]);await audit(pool,req,'team_member.updated','user',req.params.id,{role:q.rows[0].role,active:q.rows[0].active});res.json({success:true,data:q.rows[0]});}));
router.get('/audit',allow('owner','admin','manager','accountant'),asyncRoute(async(req,res)=>{const q=await pool.query('SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,u.full_name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 100',[org(req)]);res.json({success:true,data:q.rows});}));
router.get('/invoices',asyncRoute(async(req,res)=>{const q=await pool.query('SELECT i.*,o.order_number,c.first_name,c.last_name FROM invoices i JOIN orders o ON o.id=i.order_id JOIN customers c ON c.id=o.customer_id WHERE i.organization_id=$1 ORDER BY i.issued_at DESC LIMIT 100',[org(req)]);res.json({success:true,data:q.rows});}));
router.post('/orders/:id/invoices',asyncRoute(async(req,res)=>{const b=req.body||{};const q=await pool.query('SELECT * FROM orders WHERE id=$1 AND organization_id=$2',[req.params.id,org(req)]);if(!q.rowCount)throw fail(404,'Order not found');const number=await nextNumber(pool,org(req),'invoice','F');const invoice=await pool.query("INSERT INTO invoices(organization_id,order_id,invoice_number,status,currency,total,due_date) VALUES($1,$2,$3,'issued',$4,$5,$6) RETURNING *",[org(req),req.params.id,number,q.rows[0].currency,q.rows[0].total,b.dueDate||null]);await audit(pool,req,'invoice.issued','invoice',invoice.rows[0].id);res.status(201).json({success:true,data:invoice.rows[0]});}));
router.patch('/orders/:id/status',allow('owner','admin','manager'),asyncRoute(async(req,res)=>{const allowed=['pending','confirmed','in_progress','completed','cancelled','refunded'];if(!allowed.includes(req.body?.status))throw fail(400,'Invalid order status');const q=await pool.query('UPDATE orders SET status=$1 WHERE id=$2 AND organization_id=$3 RETURNING *',[req.body.status,req.params.id,org(req)]);if(!q.rowCount)throw fail(404,'Order not found');await audit(pool,req,'order.status_changed','order',req.params.id,{status:req.body.status});res.json({success:true,data:q.rows[0]});}));

// ---- Workspace context: saved searches, real booking calendar, map destination context ----
router.get('/workspace/search-history',asyncRoute(async(req,res)=>{
 const q=await pool.query('SELECT id,service_type,summary,search_params,searched_at FROM workspace_searches WHERE organization_id=$1 AND user_id=$2 ORDER BY searched_at DESC LIMIT 12',[org(req),req.user.id]);
 res.json({success:true,data:q.rows});
}));
router.post('/workspace/search-history',asyncRoute(async(req,res)=>{
 const b=req.body||{},type=String(b.serviceType||''),summary=String(b.summary||'').trim();
 if(!['flight','hotel'].includes(type)||!summary||summary.length>240)throw fail(400,'Type de recherche ou résumé invalide.');
 const params=b.searchParams&&typeof b.searchParams==='object'&&!Array.isArray(b.searchParams)?b.searchParams:{};
 const q=await pool.query('INSERT INTO workspace_searches(organization_id,user_id,service_type,summary,search_params) VALUES($1,$2,$3,$4,$5) RETURNING id,service_type,summary,search_params,searched_at',[org(req),req.user.id,type,summary,params]);
 res.status(201).json({success:true,data:q.rows[0]});
}));
router.delete('/workspace/search-history',asyncRoute(async(req,res)=>{
 await pool.query('DELETE FROM workspace_searches WHERE organization_id=$1 AND user_id=$2',[org(req),req.user.id]);
 res.json({success:true});
}));
router.get('/workspace/calendar',asyncRoute(async(req,res)=>{
 const from=String(req.query.from||''),to=String(req.query.to||'');
 if(!dateOK(from)||!dateOK(to)||to<from)throw fail(400,'Période calendrier invalide.');
 const q=await pool.query(`
  SELECT b.id,'booking' AS source,b.service_type AS type,
   COALESCE(NULLIF(b.traveler_name,''),o.order_number) AS title,
   b.start_date::text AS start_date,b.end_date::text AS end_date,b.status,
   COALESCE(b.details->>'destination',b.details->>'city',b.details->>'hotelName') AS destination,
   o.order_number
  FROM bookings b JOIN orders o ON o.id=b.order_id
  WHERE b.organization_id=$1 AND b.start_date BETWEEN $2::date AND $3::date
  UNION ALL
  SELECT r.id,'request' AS source,r.request_type AS type,
   COALESCE(NULLIF(c.first_name||' '||c.last_name,' '),'Demande de voyage') AS title,
   r.departure_date::text AS start_date,r.return_date::text AS end_date,r.status,
   r.destination,NULL::text AS order_number
  FROM travel_requests r JOIN customers c ON c.id=r.customer_id
  WHERE r.organization_id=$1 AND r.departure_date BETWEEN $2::date AND $3::date
  ORDER BY start_date ASC
 `,[org(req),from,to]);
 res.json({success:true,data:q.rows});
}));
router.get('/workspace/map-context',asyncRoute(async(req,res)=>{
 const q=await pool.query(`
  SELECT service_type,summary,search_params,searched_at
  FROM workspace_searches WHERE organization_id=$1 AND user_id=$2
  ORDER BY searched_at DESC LIMIT 12
 `,[org(req),req.user.id]);
 const destinations=q.rows.map(x=>({type:x.service_type,summary:x.summary,destination:x.search_params.destination||x.search_params.cityName||x.search_params.to||null,searchedAt:x.searched_at})).filter(x=>x.destination);
 res.json({success:true,data:destinations});
}));
router.post('/integrations/liteapi/hotels/search',asyncRoute(async(req,res)=>{const b=req.body||{};if(!dateOK(b.checkin)||!dateOK(b.checkout)||b.checkout<=b.checkin)throw fail(400,'Valid checkin and checkout required');if(!b.placeId&&!(b.cityName&&b.countryCode)&&!Array.isArray(b.hotelIds))throw fail(400,'placeId, cityName+countryCode or hotelIds required');const payload={checkin:b.checkin,checkout:b.checkout,currency:(b.currency||'USD').toUpperCase(),guestNationality:(b.guestNationality||'CD').toUpperCase(),occupancies:Array.isArray(b.occupancies)&&b.occupancies.length?b.occupancies:[{adults:1}],roomMapping:true,maxRatesPerHotel:Math.min(10,Math.max(1,Number(b.maxRatesPerHotel)||3)),includeHotelData:true,timeout:25};for(const k of ['placeId','cityName','countryCode','hotelIds','limit','offset'])if(b[k]!==undefined)payload[k]=b[k];const d=await lite('hotels/rates',payload);const rates=Array.isArray(d.data)?d.data:[];const hotelRows=Array.isArray(d.hotels)?d.hotels:[];const infoById=new Map(hotelRows.map(h=>[String(h.id||h.hotelId),h]));const hotels=rates.map(entry=>{const id=String(entry.hotelId||entry.id||entry.hotel?.hotelId||'');const info=infoById.get(id)||entry.hotel||{};const room=(entry.roomTypes||[]).find(r=>Array.isArray(r.rates)&&r.rates.length)||entry.roomTypes?.[0]||{};const rate=room.rates?.[0]||{};const total=rate.retailRate?.total?.[0]||{};return{id:id||crypto.randomUUID(),hotelId:id,name:info.name||entry.name||'Hôtel',address:info.address||'',city:info.city||'',country:info.country||'',main_photo:info.main_photo||info.mainPhoto||info.thumbnail||'',rating:Number(info.rating||0),reviewCount:Number(info.reviewCount||info.review_count||0),starRating:Number(info.stars??info.starRating??entry.stars??entry.starRating??0),price:Number(total.amount||0),currency:total.currency||payload.currency,roomName:room.name||rate.name||'Chambre disponible',offerId:room.offerId||entry.offerId||null,refundable:rate.cancellationPolicies?.refundableTag==='RFN',boardName:rate.boardName||'Conditions fournisseur',nights:Math.max(1,(Date.parse(b.checkout)-Date.parse(b.checkin))/86400000),rate:rate};}).filter(h=>h.price>0).sort((a,b)=>a.price-b.price);await audit(pool,req,'provider.search','liteapi_hotels',null,{checkin:b.checkin,checkout:b.checkout,resultCount:hotels.length});res.json({success:true,provider:'liteapi',data:hotels,total:hotels.length,currency:payload.currency,meta:{guestLevel:d.guestLevel??null}});}));
router.post('/integrations/liteapi/flights/search',asyncRoute(async(req,res)=>{const b=req.body||{};if(!Array.isArray(b.legs)||!b.legs.length||Number(b.adults)<1)throw fail(400,'legs and adults >= 1 required');for(const l of b.legs)if(!l.origin||!l.destination||!dateOK(l.date))throw fail(400,'Each leg needs origin, destination and YYYY-MM-DD date');const payload={legs:b.legs,adults:Number(b.adults),currency:(b.currency||'USD').toUpperCase(),country:(b.country||'CD').toUpperCase()};for(const k of ['children','infants','childrenAges','infantAges','cabinClass','filters','sort'])if(b[k]!==undefined)payload[k]=b[k];const d=await lite('flights/rates',payload);await audit(pool,req,'provider.search','liteapi_flights',null,{legs:b.legs});res.json({success:true,provider:'liteapi',data:d.data||[]});}));
// ---- B2C -> POS link: called in-process by server.js after a confirmed B2C booking (no public endpoint) ----
router.ingestB2C=async function(p){
 const slug=String(process.env.POS_B2C_ORG_SLUG||'luvia-direct').toLowerCase();
 if(!process.env.DATABASE_URL)return{skipped:'DATABASE_URL missing'};
 const amount=num(p.totalAmount),ref=String(p.bookingId||'').trim();
 if(!ref||!amount)return{skipped:'bookingId and totalAmount required'};
 return tx(async db=>{
  const o=await db.query('SELECT id FROM organizations WHERE slug=$1',[slug]);
  if(!o.rowCount)return{skipped:'B2C organization "'+slug+'" not found — create it first'};
  const organizationId=o.rows[0].id;
  const dup=await db.query("SELECT id FROM orders WHERE organization_id=$1 AND source='b2c' AND external_ref=$2",[organizationId,ref]);
  if(dup.rowCount)return{duplicate:true,orderId:dup.rows[0].id};
  const email=String(p.guestEmail||'').trim().toLowerCase()||null;
  let cust=email?await db.query('SELECT id FROM customers WHERE organization_id=$1 AND lower(email)=$2 LIMIT 1',[organizationId,email]):{rowCount:0,rows:[]};
  if(!cust.rowCount)cust=await db.query('INSERT INTO customers(organization_id,first_name,last_name,email,phone) VALUES($1,$2,$3,$4,$5) RETURNING id',[organizationId,String(p.guestFirstName||'Client').slice(0,120),String(p.guestLastName||'Luvia').slice(0,120),email,p.guestPhone||null]);
  const currency=String(p.currency||'USD').toUpperCase().slice(0,3);
  const item=normalizeItem({description:p.description||(p.hotelName||'Hôtel')+' · '+(p.checkin||'')+' → '+(p.checkout||''),serviceType:'hotel',quantity:1,unitPrice:amount,unitCost:0,provider:'liteapi',startDate:p.checkin,endDate:p.checkout,travelerName:[p.guestFirstName,p.guestLastName].filter(Boolean).join(' '),details:{hotelName:p.hotelName||null,hotelConfirmationCode:p.hotelConfirmationCode||null,channel:'b2c'}});
  item.providerReference=ref;item.bookingStatus='confirmed';
  const t=computeTotals([item],0,0,0);
  const order=await insertOrderWithItems(db,{organizationId,customerId:cust.rows[0].id,currency,items:[item],t,notes:'Réservation site luviaplace.com',source:'b2c',externalRef:ref,status:'confirmed',amountPaid:amount,margin:null});
  const method=({MOBILE_MONEY:'mobile_money',PAYPAL:'other',CARD:'card'})[String(p.paymentMethod||'').toUpperCase()]||'other';
  await db.query("INSERT INTO payments(organization_id,order_id,amount,currency,method,reference,status,notes) VALUES($1,$2,$3,$4,$5,$6,'received','Paiement site B2C')",[organizationId,order.id,amount,currency,method,p.transactionId||null]);
  await db.query('INSERT INTO audit_logs(organization_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[organizationId,'order.ingested_b2c','order',order.id,{bookingId:ref}]);
  return{orderId:order.id,orderNumber:order.order_number};
 });
};
router.use((err,req,res,next)=>{if((err.status||500)>=500)console.error('[Luvia POS]',err);const status=err.status||500;res.status(status).json({success:false,error:status===503?err.message:(status>=500?'Internal POS error':err.message)});});
module.exports=router;
