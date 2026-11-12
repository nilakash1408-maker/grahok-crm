import React, {useEffect, useMemo, useState} from 'react'
import {onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'firebase/auth'
import {addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc} from 'firebase/firestore'
import {auth, db} from './firebase'
import {
  Users, Package, ShoppingCart, LayoutDashboard, LogOut, Plus, Search,
  Trash2, X, Menu, MessageCircle, Eye, ArrowLeft, Send, UserRound,
  CheckSquare, Square, Repeat2
} from 'lucide-react'

const money = n => '৳' + Number(n || 0).toLocaleString('en-BD')
const dateText = v => v?.toDate ? v.toDate().toLocaleDateString('bn-BD') : (v || '—')
const has = (text, s) => String(text || '').toLowerCase().includes(s.toLowerCase())
const emptyCustomer = {name:'', phone:'', address:'', note:''}
const emptyProduct = {name:'', price:'', unit:'কেজি', sku:''}
const emptyOrder = () => ({customerId:'', items:[{productId:'', qty:1, price:0}], delivery:0, status:'নতুন', note:''})
const statuses = ['নতুন','কনফার্ম','প্যাকেজিং','শিপড','ডেলিভার্ড','হোল্ড','ক্যানসেল']

function normalizeBDPhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('00880')) digits = digits.slice(2)
  if (digits.startsWith('880')) return digits
  if (digits.startsWith('0')) return '88' + digits
  if (digits.length === 10 && digits.startsWith('1')) return '880' + digits
  return digits
}

function orderMessage(order, customer) {
  const lines = (order.items || []).map(item =>
    `• ${item.name} × ${item.qty} ${item.unit || ''} — ${money(item.subtotal ?? Number(item.qty || 0) * Number(item.price || 0))}`
  ).join('\n')
  return `আসসালামু আলাইকুম ${customer?.name || order.customerName || ''}।\n\nGrahok-এ আপনার অর্ডারটি গ্রহণ করা হয়েছে।\n\nঅর্ডারের বিবরণ:\n${lines}\n\nডেলিভারি চার্জ: ${money(order.delivery)}\nসর্বমোট: ${money(order.total)}\nঅর্ডারের অবস্থা: ${order.status || 'নতুন'}\n\nGrahok-এর সঙ্গে থাকার জন্য ধন্যবাদ।`
}

export default function App() {
  const [user, setUser] = useState(undefined)
  const [page, setPage] = useState('dashboard')
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState('')
  const [editing, setEditing] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [customerForm, setCustomerForm] = useState(emptyCustomer)
  const [productForm, setProductForm] = useState(emptyProduct)
  const [orderForm, setOrderForm] = useState(emptyOrder())
  const [login, setLogin] = useState({email:'', password:''})
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([])
  const [waQueue, setWaQueue] = useState([])
  const [waIndex, setWaIndex] = useState(0)
  const [waMessage, setWaMessage] = useState('আসসালামু আলাইকুম {{name}}। Grahok-এ আপনাকে স্বাগতম। আমাদের নতুন পণ্য ও আকর্ষণীয় অফার সম্পর্কে জানতে আমাদের সঙ্গে থাকুন।')

  useEffect(() => onAuthStateChanged(auth, u => setUser(u)), [])

  useEffect(() => {
    if (!user) return
    const unsubs = [
      onSnapshot(query(collection(db, 'customers'), orderBy('createdAt', 'desc')),
        s => setCustomers(s.docs.map(d => ({id:d.id, ...d.data()}))), e => setError(e.message)),
      onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'desc')),
        s => setProducts(s.docs.map(d => ({id:d.id, ...d.data()}))), e => setError(e.message)),
      onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
        s => setOrders(s.docs.map(d => ({id:d.id, ...d.data()}))), e => setError(e.message))
    ]
    return () => unsubs.forEach(f => f())
  }, [user])

  const validOrders = useMemo(() => orders.filter(o => o.status !== 'ক্যানসেল'), [orders])
  const customerStats = useMemo(() => {
    const map = {}
    validOrders.forEach(o => {
      const id = o.customerId || `phone:${o.phone || ''}`
      if (!map[id]) map[id] = {count:0, spend:0, latest:null}
      map[id].count += 1
      map[id].spend += Number(o.total || 0)
      const current = o.createdAt?.toDate ? o.createdAt.toDate().getTime() : 0
      const previous = map[id].latest?.toDate ? map[id].latest.toDate().getTime() : 0
      if (!map[id].latest || current > previous) map[id].latest = o.createdAt || null
    })
    return map
  }, [validOrders])

  const totalSales = validOrders.reduce((a, o) => a + Number(o.total || 0), 0)
  const stats = [
    ['মোট কাস্টমার', customers.length, Users],
    ['মোট পণ্য', products.length, Package],
    ['মোট অর্ডার', orders.length, ShoppingCart],
    ['মোট বিক্রি', money(totalSales), LayoutDashboard]
  ]
  const filteredCustomers = customers.filter(c => has(`${c.name || ''} ${c.phone || ''} ${c.address || ''}`, search))
  const repeatCustomers = customers
    .filter(c => (customerStats[c.id]?.count || 0) >= 2)
    .filter(c => has(`${c.name || ''} ${c.phone || ''} ${c.address || ''}`, search))
    .sort((a, b) => (customerStats[b.id]?.count || 0) - (customerStats[a.id]?.count || 0))
  const filteredProducts = products.filter(p => has(`${p.name || ''} ${p.sku || ''}`, search))
  const filteredOrders = orders.filter(o => has(`${o.customerName || ''} ${o.phone || ''} ${o.status || ''}`, search))
  const customerOrders = selectedCustomer
    ? orders.filter(o => o.customerId === selectedCustomer.id).sort((a,b) => {
        const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0
        const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0
        return bt - at
      })
    : []

  function closeModal() { setModal(''); setError('') }
  async function doLogin(e) {
    e.preventDefault(); setError(''); setBusy(true)
    try { await signInWithEmailAndPassword(auth, login.email, login.password) }
    catch (err) { setError('লগইন হয়নি। ইমেইল ও পাসওয়ার্ড যাচাই করুন।') }
    finally { setBusy(false) }
  }
  async function saveCustomer(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      if (editing) await updateDoc(doc(db, 'customers', editing.id), customerForm)
      else await addDoc(collection(db, 'customers'), {...customerForm, createdAt:serverTimestamp()})
      closeModal()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function saveProduct(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const data = {...productForm, price:Number(productForm.price)}
      if (editing) await updateDoc(doc(db, 'products', editing.id), data)
      else await addDoc(collection(db, 'products'), {...data, createdAt:serverTimestamp()})
      closeModal()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  function startOrder() { setEditing(null); setError(''); setOrderForm(emptyOrder()); setModal('order') }
  function setItem(i, patch) {
    setOrderForm(f => ({...f, items:f.items.map((it,j) => j === i ? {...it, ...patch} : it)}))
  }
  async function saveOrder(e) {
    e.preventDefault()
    const c = customers.find(x => x.id === orderForm.customerId)
    if (!c) { setError('কাস্টমার নির্বাচন করুন'); return }
    const items = orderForm.items.map(it => {
      const p = products.find(x => x.id === it.productId)
      const price = Number(it.price || p?.price || 0), qty = Number(it.qty)
      return {productId:it.productId, name:p?.name || '', unit:p?.unit || '', qty, price, subtotal:qty * price}
    })
    if (items.some(i => !i.productId || !(i.qty > 0))) { setError('প্রতিটি পণ্যের নাম ও পরিমাণ দিন'); return }
    const subtotal = items.reduce((a,i) => a + i.subtotal, 0)
    const delivery = Number(orderForm.delivery || 0)
    const total = subtotal + delivery
    setBusy(true); setError('')
    try {
      await addDoc(collection(db, 'orders'), {
        customerId:c.id, customerName:c.name, phone:c.phone, address:c.address || '',
        items, subtotal, delivery, total, status:orderForm.status, note:orderForm.note,
        createdAt:serverTimestamp()
      })
      closeModal()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  async function remove(collectionName, id) {
    if (confirm('আপনি কি নিশ্চিতভাবে মুছে ফেলতে চান?')) {
      try { await deleteDoc(doc(db, collectionName, id)) }
      catch (err) { setError(err.message) }
    }
  }
  function editCustomer(c) {
    setEditing(c); setError('')
    setCustomerForm({name:c.name || '', phone:c.phone || '', address:c.address || '', note:c.note || ''})
    setModal('customer')
  }
  function editProduct(p) {
    setEditing(p); setError('')
    setProductForm({name:p.name || '', price:p.price ?? '', unit:p.unit || 'কেজি', sku:p.sku || ''})
    setModal('product')
  }
  function newCustomer() { setEditing(null); setError(''); setCustomerForm(emptyCustomer); setModal('customer') }
  function newProduct() { setEditing(null); setError(''); setProductForm(emptyProduct); setModal('product') }

  function toggleCustomer(id) {
    setSelectedCustomerIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }
  function toggleAllVisible(list) {
    const ids = list.map(c => c.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedCustomerIds.includes(id))
    setSelectedCustomerIds(current => allSelected ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])])
  }
  function openCustomer(c) {
    setSelectedCustomer(c)
    setPage('customer-detail')
    setSearch('')
    setMobileNav(false)
  }
  function startWhatsApp(ids, message) {
    const validIds = ids.filter(id => customers.some(c => c.id === id))
    if (!validIds.length) { setError('আগে অন্তত একজন কাস্টমার নির্বাচন করুন।'); return }
    setWaQueue(validIds)
    setWaIndex(0)
    setWaMessage(message || 'আসসালামু আলাইকুম {{name}}। Grahok-এর সঙ্গে থাকার জন্য ধন্যবাদ। আমাদের নতুন পণ্য ও অফার সম্পর্কে জানতে আমাদের সঙ্গে থাকুন।')
    setModal('whatsapp')
  }
  function openNextWhatsApp() {
    const id = waQueue[waIndex]
    const customer = customers.find(c => c.id === id)
    if (!customer) { setError('কাস্টমার খুঁজে পাওয়া যায়নি।'); return }
    const phone = normalizeBDPhone(customer.phone)
    if (phone.length < 11) { setError(`${customer.name} -এর মোবাইল নম্বরটি সঠিক নয়।`); return }
    const message = waMessage.replaceAll('{{name}}', customer.name || 'প্রিয় গ্রাহক')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    if (waIndex + 1 >= waQueue.length) {
      setModal('')
      setSelectedCustomerIds([])
    } else {
      setWaIndex(i => i + 1)
    }
  }
  function sendOrderWhatsApp(order) {
    const customer = customers.find(c => c.id === order.customerId) || {
      name:order.customerName, phone:order.phone
    }
    if (!customer.phone) { setError('এই অর্ডারের কাস্টমারের মোবাইল নম্বর নেই।'); return }
    const phone = normalizeBDPhone(customer.phone)
    if (phone.length < 11) { setError('মোবাইল নম্বরটি সঠিক নয়।'); return }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(order, customer))}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (user === undefined) return <div className="center">লোড হচ্ছে…</div>
  if (!user) return <main className="login-wrap"><form className="login card" onSubmit={doLogin}>
    <div className="brand-mark">G</div><h1>Grahok CRM</h1><p>আপনার কাস্টমার ও অর্ডার ম্যানেজমেন্ট</p>
    {error && <div className="error">{error}</div>}
    <label>ইমেইল<input type="email" required value={login.email} onChange={e => setLogin({...login,email:e.target.value})}/></label>
    <label>পাসওয়ার্ড<input type="password" required value={login.password} onChange={e => setLogin({...login,password:e.target.value})}/></label>
    <button className="primary full" disabled={busy}>{busy ? 'অপেক্ষা করুন…' : 'লগইন করুন'}</button>
    <small>অ্যাডমিন অ্যাকাউন্ট Firebase Console থেকে তৈরি করতে হবে।</small>
  </form></main>

  const nav = [
    ['dashboard','ড্যাশবোর্ড',LayoutDashboard],
    ['customers','কাস্টমার',Users],
    ['repeat','রিপিট কাস্টমার',Repeat2],
    ['products','পণ্য',Package],
    ['orders','অর্ডার',ShoppingCart]
  ]
  const pageTitle = page === 'customer-detail' ? 'কাস্টমার প্রোফাইল' : nav.find(n => n[0] === page)?.[1]

  return <div className="app">
    <aside className={mobileNav ? 'sidebar show' : 'sidebar'}>
      <div className="logo"><span>G</span><div><b>Grahok CRM</b><small>Customer Management</small></div></div>
      <nav>{nav.map(([id,label,Icon]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => {
        setPage(id); setSearch(''); setMobileNav(false); setSelectedCustomerIds([])
      }}><Icon size={18}/>{label}</button>)}</nav>
      <div className="side-bottom"><small>{user.email}</small><button onClick={() => signOut(auth)}><LogOut size={17}/> লগআউট</button></div>
    </aside>

    <main className="main">
      <header>
        <button className="hamb" onClick={() => setMobileNav(!mobileNav)}><Menu/></button>
        <div><h2>{pageTitle}</h2><small>Grahok • কাস্টমার ম্যানেজমেন্ট</small></div>
        <div className="user-pill">অ্যাডমিন</div>
      </header>
      {error && !modal && <div className="error notice">{error}<button onClick={() => setError('')}><X size={16}/></button></div>}

      {page === 'dashboard' && <div className="page-content">
        <div className="welcome"><div><h1>স্বাগতম!</h1><p>আপনার ব্যবসার সার্বিক চিত্র এক জায়গায় দেখুন।</p></div><button className="primary" onClick={startOrder}><Plus size={17}/> নতুন অর্ডার</button></div>
        <section className="stats">{stats.map(([t,v,I]) => <div className="stat card" key={t}><span><I size={20}/></span><small>{t}</small><strong>{v}</strong></div>)}</section>
        <section className="card recent"><div className="section-head"><h3>সাম্প্রতিক অর্ডার</h3><button className="text-btn" onClick={() => setPage('orders')}>সব অর্ডার দেখুন →</button></div><OrderTable orders={orders.slice(0,6)} onWhatsApp={sendOrderWhatsApp}/></section>
        <section className="card recent"><div className="section-head"><h3>রিপিট কাস্টমার</h3><button className="text-btn" onClick={() => setPage('repeat')}>সব দেখুন →</button></div>
          <div className="repeat-summary"><strong>{repeatCustomers.length}</strong><span>জন কাস্টমার একাধিকবার অর্ডার করেছেন</span></div>
        </section>
      </div>}

      {page === 'customers' && <div className="page-content">
        <Toolbar search={search} setSearch={setSearch} placeholder="নাম, মোবাইল বা ঠিকানা দিয়ে খুঁজুন" action={newCustomer} label="কাস্টমার যোগ করুন"/>
        <div className="bulk-toolbar">
          <span>{selectedCustomerIds.length} জন নির্বাচিত</span>
          <button className="small-btn" disabled={!selectedCustomerIds.length} onClick={() => startWhatsApp(selectedCustomerIds)}> <MessageCircle size={15}/> WhatsApp মেসেজ</button>
          <button className="text-btn" onClick={() => setSelectedCustomerIds([])}>নির্বাচন বাতিল</button>
        </div>
        <div className="card table-card">
          <div className="section-head"><h3>কাস্টমার তালিকা ({filteredCustomers.length})</h3></div>
          <div className="table-scroll">
            <table><thead><tr>
              <th><button className="icon-btn" onClick={() => toggleAllVisible(filteredCustomers)}><CheckSquare size={16}/></button></th>
              <th>নাম</th><th>মোবাইল</th><th>ঠিকানা</th><th>অর্ডার</th><th>মোট কেনাকাটা</th><th>কাজ</th>
            </tr></thead>
            <tbody>{filteredCustomers.map(c => <tr key={c.id}>
              <td><button className="icon-btn" onClick={() => toggleCustomer(c.id)}>{selectedCustomerIds.includes(c.id) ? <CheckSquare size={17}/> : <Square size={17}/>}</button></td>
              <td><b>{c.name}</b></td><td>{c.phone}</td><td>{c.address || '—'}</td>
              <td>{customerStats[c.id]?.count || 0} বার</td><td>{money(customerStats[c.id]?.spend || 0)}</td>
              <td><button className="small-btn" onClick={() => openCustomer(c)}><Eye size={14}/> বিস্তারিত</button><button className="small-btn" onClick={() => editCustomer(c)}>এডিট</button><button className="icon-btn danger" onClick={() => remove('customers',c.id)}><Trash2 size={16}/></button></td>
            </tr>)}</tbody></table>
            {!filteredCustomers.length && <Empty text="কোনো কাস্টমার পাওয়া যায়নি"/>}
          </div>
        </div>
      </div>}

      {page === 'repeat' && <div className="page-content">
        <Toolbar search={search} setSearch={setSearch} placeholder="নাম বা মোবাইল দিয়ে খুঁজুন" action={() => startWhatsApp(repeatCustomers.map(c => c.id))} label="সবাইকে মেসেজ"/>
        <div className="repeat-intro card"><Repeat2 size={22}/><div><b>রিপিট কাস্টমার</b><p>যেসব কাস্টমারের বাতিল অর্ডার বাদে অন্তত ২টি অর্ডার রয়েছে, তাঁদের এখানে দেখানো হচ্ছে।</p></div><strong>{repeatCustomers.length}</strong></div>
        <div className="bulk-toolbar">
          <span>{selectedCustomerIds.length} জন নির্বাচিত</span>
          <button className="small-btn" disabled={!selectedCustomerIds.length} onClick={() => startWhatsApp(selectedCustomerIds)}><MessageCircle size={15}/> WhatsApp মেসেজ</button>
          <button className="text-btn" onClick={() => setSelectedCustomerIds([])}>নির্বাচন বাতিল</button>
        </div>
        <div className="card table-card"><div className="section-head"><h3>রিপিট কাস্টমার তালিকা</h3></div>
          <div className="table-scroll"><table><thead><tr><th>নির্বাচন</th><th>নাম</th><th>মোবাইল</th><th>মোট অর্ডার</th><th>মোট কেনাকাটা</th><th>সর্বশেষ অর্ডার</th><th>কাজ</th></tr></thead>
            <tbody>{repeatCustomers.map(c => <tr key={c.id}>
              <td><button className="icon-btn" onClick={() => toggleCustomer(c.id)}>{selectedCustomerIds.includes(c.id) ? <CheckSquare size={17}/> : <Square size={17}/>}</button></td>
              <td><b>{c.name}</b></td><td>{c.phone}</td><td><span className="badge">{customerStats[c.id]?.count || 0} বার</span></td>
              <td>{money(customerStats[c.id]?.spend || 0)}</td><td>{dateText(customerStats[c.id]?.latest)}</td>
              <td><button className="small-btn" onClick={() => openCustomer(c)}>প্রোফাইল</button><button className="small-btn" onClick={() => startWhatsApp([c.id])}><MessageCircle size={14}/> মেসেজ</button></td>
            </tr>)}</tbody></table>
            {!repeatCustomers.length && <Empty text="এখনো কোনো রিপিট কাস্টমার পাওয়া যায়নি"/>}
          </div>
        </div>
      </div>}

      {page === 'customer-detail' && selectedCustomer && <div className="page-content">
        <div className="welcome detail-welcome">
          <div><button className="text-btn back-btn" onClick={() => setPage('customers')}><ArrowLeft size={16}/> কাস্টমার তালিকায় ফিরুন</button><h1>{selectedCustomer.name}</h1><p>{selectedCustomer.phone}</p></div>
          <div className="detail-actions"><button className="primary" onClick={() => startWhatsApp([selectedCustomer.id])}><MessageCircle size={16}/> WhatsApp</button><button className="small-btn" onClick={() => editCustomer(selectedCustomer)}>এডিট</button></div>
        </div>
        <div className="detail-grid">
          <div className="card detail-card"><small>মোট অর্ডার</small><strong>{customerStats[selectedCustomer.id]?.count || 0}</strong></div>
          <div className="card detail-card"><small>মোট কেনাকাটা</small><strong>{money(customerStats[selectedCustomer.id]?.spend || 0)}</strong></div>
          <div className="card detail-card"><small>সর্বশেষ অর্ডার</small><strong className="detail-date">{dateText(customerStats[selectedCustomer.id]?.latest)}</strong></div>
        </div>
        <div className="card detail-info"><h3>কাস্টমারের তথ্য</h3><p><b>মোবাইল:</b> {selectedCustomer.phone || '—'}</p><p><b>ঠিকানা:</b> {selectedCustomer.address || '—'}</p><p><b>নোট:</b> {selectedCustomer.note || '—'}</p></div>
        <div className="card table-card"><div className="section-head"><h3>অর্ডার হিস্টোরি ({customerOrders.length})</h3></div><OrderTable orders={customerOrders} onWhatsApp={sendOrderWhatsApp}/></div>
      </div>}

      {page === 'products' && <div className="page-content">
        <Toolbar search={search} setSearch={setSearch} placeholder="পণ্যের নাম দিয়ে খুঁজুন" action={newProduct} label="পণ্য যোগ করুন"/>
        <div className="card table-card"><div className="section-head"><h3>পণ্য তালিকা ({filteredProducts.length})</h3></div>
          <div className="table-scroll"><table><thead><tr><th>পণ্যের নাম</th><th>কোড</th><th>দাম</th><th>একক</th><th>কাজ</th></tr></thead>
            <tbody>{filteredProducts.map(p => <tr key={p.id}><td><b>{p.name}</b></td><td>{p.sku || '—'}</td><td>{money(p.price)}</td><td>{p.unit}</td><td><button className="small-btn" onClick={() => editProduct(p)}>এডিট</button><button className="icon-btn danger" onClick={() => remove('products',p.id)}><Trash2 size={16}/></button></td></tr>)}</tbody>
          </table>{!filteredProducts.length && <Empty text="এখনো কোনো পণ্য যোগ করা হয়নি"/>}</div>
        </div>
      </div>}

      {page === 'orders' && <div className="page-content">
        <Toolbar search={search} setSearch={setSearch} placeholder="কাস্টমারের নাম, মোবাইল বা স্ট্যাটাস" action={startOrder} label="নতুন অর্ডার"/>
        <div className="card table-card"><div className="section-head"><h3>অর্ডার তালিকা ({filteredOrders.length})</h3></div><OrderTable orders={filteredOrders} onWhatsApp={sendOrderWhatsApp}/></div>
      </div>}
    </main>

    {modal && <div className="overlay" onClick={closeModal}>
      {modal === 'whatsapp' ? <div className="modal card whatsapp-modal" onClick={e => e.stopPropagation()}>
        <div className="section-head"><h3><MessageCircle size={19}/> WhatsApp মেসেজ</h3><button className="icon-btn" onClick={closeModal}><X/></button></div>
        <p className="modal-help">প্রতিটি কাস্টমারের WhatsApp আলাদা করে খুলবে। মেসেজ দেখে Send চাপুন, তারপর এখানে ফিরে পরের কাস্টমারের জন্য বাটনে ক্লিক করুন।</p>
        <div className="wa-progress">কাস্টমার {Math.min(waIndex + 1, waQueue.length)} / {waQueue.length}</div>
        <label>মেসেজ লিখুন<textarea className="wa-textarea" value={waMessage} onChange={e => setWaMessage(e.target.value)} rows={7}/></label>
        <small className="muted">কাস্টমারের নাম বসাতে <b>{'{{name}}'}</b> লিখুন।</small>
        <button className="primary full" onClick={openNextWhatsApp}><MessageCircle size={17}/>{waIndex === 0 ? 'প্রথম কাস্টমারের WhatsApp খুলুন' : 'পরের কাস্টমারের WhatsApp খুলুন'}</button>
        <button className="text-btn full" onClick={closeModal}>বন্ধ করুন</button>
      </div> : <form className="modal card" onClick={e => e.stopPropagation()} onSubmit={modal === 'customer' ? saveCustomer : modal === 'product' ? saveProduct : saveOrder}>
        <div className="section-head"><h3>{modal === 'customer' ? (editing ? 'কাস্টমার এডিট' : 'নতুন কাস্টমার') : modal === 'product' ? (editing ? 'পণ্য এডিট' : 'নতুন পণ্য') : 'নতুন অর্ডার'}</h3><button type="button" className="icon-btn" onClick={closeModal}><X/></button></div>
        {error && <div className="error">{error}</div>}
        {modal === 'customer' && <>
          <label>কাস্টমারের নাম *<input required value={customerForm.name} onChange={e => setCustomerForm({...customerForm,name:e.target.value})}/></label>
          <label>মোবাইল নম্বর *<input required value={customerForm.phone} onChange={e => setCustomerForm({...customerForm,phone:e.target.value})}/></label>
          <label>ঠিকানা<textarea value={customerForm.address} onChange={e => setCustomerForm({...customerForm,address:e.target.value})}/></label>
          <label>নোট<textarea value={customerForm.note} onChange={e => setCustomerForm({...customerForm,note:e.target.value})}/></label>
        </>}
        {modal === 'product' && <>
          <label>পণ্যের নাম *<input required value={productForm.name} onChange={e => setProductForm({...productForm,name:e.target.value})}/></label>
          <div className="form-grid">
            <label>দাম (৳) *<input required type="number" min="0" step="any" value={productForm.price} onChange={e => setProductForm({...productForm,price:e.target.value})}/></label>
            <label>একক<select value={productForm.unit} onChange={e => setProductForm({...productForm,unit:e.target.value})}><option>কেজি</option><option>গ্রাম</option><option>প্যাকেট</option><option>পিস</option><option>লিটার</option></select></label>
          </div>
          <label>পণ্য কোড (ঐচ্ছিক)<input value={productForm.sku} onChange={e => setProductForm({...productForm,sku:e.target.value})}/></label>
        </>}
        {modal === 'order' && <>
          <label>কাস্টমার নির্বাচন *<select required value={orderForm.customerId} onChange={e => setOrderForm({...orderForm,customerId:e.target.value})}><option value="">কাস্টমার নির্বাচন করুন</option>{customers.map(c => <option value={c.id} key={c.id}>{c.name} — {c.phone}</option>)}</select></label>
          <div className="items-head"><b>অর্ডারের পণ্য</b><button type="button" className="small-btn" onClick={() => setOrderForm(f => ({...f,items:[...f.items,{productId:'',qty:1,price:0}]}))}>+ পণ্য যোগ</button></div>
          {orderForm.items.map((it,i) => <div className="order-item" key={i}>
            <select value={it.productId} onChange={e => {const p = products.find(x => x.id === e.target.value); setItem(i,{productId:e.target.value,price:p?.price || 0})}}><option value="">পণ্য</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input aria-label="পরিমাণ" type="number" min="0.01" step="0.01" value={it.qty} onChange={e => setItem(i,{qty:e.target.value})}/>
            <input aria-label="দাম" type="number" min="0" step="any" value={it.price} onChange={e => setItem(i,{price:e.target.value})}/>
            {orderForm.items.length > 1 && <button type="button" className="icon-btn danger" onClick={() => setOrderForm(f => ({...f,items:f.items.filter((_,j) => j !== i)}))}><X size={16}/></button>}
          </div>)}
          <div className="form-grid">
            <label>ডেলিভারি চার্জ (৳)<input type="number" min="0" value={orderForm.delivery} onChange={e => setOrderForm({...orderForm,delivery:e.target.value})}/></label>
            <label>স্ট্যাটাস<select value={orderForm.status} onChange={e => setOrderForm({...orderForm,status:e.target.value})}>{statuses.map(x => <option key={x}>{x}</option>)}</select></label>
          </div>
          <label>নোট<textarea value={orderForm.note} onChange={e => setOrderForm({...orderForm,note:e.target.value})}/></label>
          <div className="total-preview">পণ্যের মোট: {money(orderForm.items.reduce((a,it) => a + Number(it.qty || 0) * Number(it.price || 0),0))} + ডেলিভারি {money(orderForm.delivery)}</div>
        </>}
        <button className="primary full" disabled={busy}>{busy ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'}</button>
      </form>}
    </div>}
  </div>
}

function Toolbar({search,setSearch,placeholder,action,label}) {
  return <div className="toolbar"><div className="search"><Search size={18}/><input placeholder={placeholder} value={search} onChange={e => setSearch(e.target.value)}/></div><button className="primary" onClick={action}><Plus size={17}/>{label}</button></div>
}
function Empty({text}) { return <div className="empty">{text}</div> }
function OrderTable({orders,onWhatsApp}) {
  return <div className="table-scroll">
    <table><thead><tr><th>তারিখ</th><th>কাস্টমার</th><th>মোবাইল</th><th>পণ্য</th><th>মোট</th><th>স্ট্যাটাস</th><th>WhatsApp</th></tr></thead>
      <tbody>{orders.map(o => <tr key={o.id}>
        <td>{dateText(o.createdAt)}</td><td><b>{o.customerName}</b></td><td>{o.phone}</td>
        <td>{(o.items || []).map(i => i.name + ' × ' + i.qty).join(', ')}</td><td><b>{money(o.total)}</b></td>
        <td><span className="badge">{o.status}</span></td>
        <td><button className="small-btn" onClick={() => onWhatsApp?.(o)}><MessageCircle size={14}/> মেসেজ</button></td>
      </tr>)}</tbody>
    </table>
    {!orders.length && <Empty text="এখনো কোনো অর্ডার নেই"/>}
  </div>
}
