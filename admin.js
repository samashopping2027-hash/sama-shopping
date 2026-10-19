/* taja market — admin.js: لوحة التحكم (يعتمد على script.js) */
const SESSION_KEY = "taja_admin_session";
const SESSION_HOURS = 6; // يجب ألا تزيد عن مدة الجلسة في Apps Script
const IMAGE_MAX_SIDE = 1000, IMAGE_QUALITY = 0.82;
const IMAGE_KEYS = ["image1", "image2", "image3", "image4"];
const MAX_GIFS = 8, GIF_MAX_BYTES = 5 * 1024 * 1024;
const ORDER_LABELS = { new: "جديد", confirmed: "مؤكد", shipped: "تم الإرسال", delivered: "تم التوصيل", cancelled: "ملغى" };
const PRODUCT_LABELS = { active: "نشط", inactive: "غير نشط" };
const PRODUCT_FIELDS = ["name", "price", "oldPrice", "description", "stock", "status"].concat(IMAGE_KEYS);

// ---------- مساعدة ----------
const joinDescription = (text, gifs) => [text.trim()].concat(gifs.map(u => "[[gif:" + u + "]]")).filter(Boolean).join("\n\n");
const fileToBase64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("تعذر قراءة الملف")); r.readAsDataURL(file); });

function cacheSave(k, v) { try { sessionStorage.setItem("taja_a_" + k, JSON.stringify(v)); } catch (e) {} }
function cacheLoad(k) { try { return JSON.parse(sessionStorage.getItem("taja_a_" + k)); } catch (e) { return null; } }
function cacheClearAll() { try { Object.keys(sessionStorage).filter(k => k.indexOf("taja_a_") === 0).forEach(k => sessionStorage.removeItem(k)); } catch (e) {} }

// ---------- الجلسة ----------
function saveSession(d) { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: d.token, username: d.username, expires: Date.now() + SESSION_HOURS * 3600 * 1000 })); }
function getSession() {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY)); if (s && s.token && s.expires > Date.now()) return s; } catch (e) {}
  localStorage.removeItem(SESSION_KEY); return null;
}
function clearSession() { localStorage.removeItem(SESSION_KEY); cacheClearAll(); }
function authParams(action) {
  const s = getSession();
  if (!s) { const e = new Error("انتهت الجلسة، يرجى تسجيل الدخول من جديد"); e.auth = true; throw e; }
  return { action: action, token: s.token };
}
// يوسم أخطاء الجلسة المنتهية
async function guard(fn) {
  try { return await fn(); } catch (e) { e.auth = e.auth || /انتهت الجلسة/.test(e.message || ""); throw e; }
}

// ---------- دوال البيانات ----------
const login = async (u, p) => { const d = await apiPost({ action: "login", username: u, password: p }); saveSession(d); return d; };
const getProducts = () => guard(() => apiGet(Object.assign(authParams("products"), { light: "1" })));
const getProduct = id => guard(() => apiGet(Object.assign(authParams("product"), { id: id })));
const getOrders = () => guard(() => apiGet(authParams("orders")));
const getDashboard = () => guard(() => apiGet(authParams("dashboard")));
const updateOrder = (id, status) => guard(() => apiPost(Object.assign({}, authParams("updateOrder"), { id: id, status: status })));
const deleteOrder = id => guard(() => apiPost(Object.assign({}, authParams("deleteOrder"), { id: id })));
const addProduct = p => guard(() => apiPost(Object.assign({}, authParams("addProduct"), p)));
const updateProduct = (id, p) => guard(() => apiPost(Object.assign({}, authParams("updateProduct"), { id: id }, p)));
const deleteProduct = id => guard(() => apiPost(Object.assign({}, authParams("deleteProduct"), { id: id, hard: true })));
const setProductStatus = (id, status) => guard(() => apiPost(Object.assign({}, authParams("setProductStatus"), { id: id, status: status })));
const uploadImage = (b64, mime) => guard(() => apiPost(Object.assign({}, authParams("uploadImage"), { data: b64, mime: mime }), 90000));

function validateProduct(v) {
  if (!v.name || !v.price) return "يرجى ملء الاسم والسعر";
  if (!(Number(v.price) > 0)) return "السعر غير صحيح";
  if (v.oldPrice !== "" && !(Number(v.oldPrice) >= 0)) return "السعر القديم غير صحيح";
  if (v.stock !== "" && !(Number.isInteger(Number(v.stock)) && Number(v.stock) >= 0)) return "المخزون غير صحيح";
  return "";
}
function normalizeProduct(v) {
  return { name: v.name, price: Number(v.price), oldPrice: v.oldPrice === "" ? "" : Number(v.oldPrice), image1: v.image1, image2: v.image2, image3: v.image3, image4: v.image4,
    description: v.description, stock: v.stock === "" ? 0 : Number(v.stock), status: v.status || "active" };
}

// ---------- ضغط الصور قبل الرفع ----------
const readBuffer = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("تعذر قراءة الصورة، اختر صورة أخرى")); r.readAsArrayBuffer(file); });
function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("تعذر قراءة الصورة، جرّب JPG أو PNG")); };
    img.src = url;
  });
}
async function decodeImage(blob) {
  if (window.createImageBitmap) { try { const b = await createImageBitmap(blob); return { src: b, w: b.width, h: b.height, done: () => b.close && b.close() }; } catch (e) {} }
  const img = await loadImage(blob);
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => {} };
}
async function prepareImage(file) {
  const dec = await decodeImage(new Blob([await readBuffer(file)], { type: file.type || "image/jpeg" }));
  try {
    if (!dec.w || !dec.h) throw new Error("تعذر قراءة الصورة، جرّب JPG أو PNG");
    const s = Math.min(1, IMAGE_MAX_SIDE / Math.max(dec.w, dec.h)), w = Math.max(1, Math.round(dec.w * s)), h = Math.max(1, Math.round(dec.h * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(dec.src, 0, 0, w, h);
    const url = c.toDataURL("image/jpeg", IMAGE_QUALITY);
    return { base64: url.split(",")[1], mime: "image/jpeg", preview: url };
  } finally { dec.done(); }
}

// ---------- منطق الصفحة ----------
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const loginView = $("loginView"), appView = $("appView"), msgBox = $("loginMessage"), passInput = $("password");
  const sidebar = $("sidebar"), overlay = $("overlay");
  let products = [], orders = [], editingId = null, deletingId = null, deleteKind = "product";
  let dashStale = false, busy = false, pendingUploads = 0, descGifs = [], descLoading = false;

  const showMessage = (t, type) => { msgBox.textContent = t; msgBox.className = "message " + type; msgBox.hidden = false; };
  let toastTimer;
  function showToast(text, type) {
    const t = $("toast"); t.textContent = text; t.className = "toast show" + (type === "error" ? " error" : "");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = "toast"; }, 3200);
  }
  function handleAuthError(err) {
    if (!err.auth) return false;
    clearSession(); closeModals(); render(); showMessage(err.message, "error"); return true;
  }
  function render() {
    const s = getSession();
    loginView.hidden = !!s; appView.hidden = !s;
    if (s) { $("adminName").textContent = s.username; loadDashboard(); }
  }

  // ----- تسجيل الدخول -----
  $("togglePassword").addEventListener("click", e => { const show = passInput.type === "password"; passInput.type = show ? "text" : "password"; e.target.textContent = show ? "إخفاء" : "إظهار"; });
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault(); msgBox.hidden = true;
    const u = $("username").value.trim(), p = passInput.value, btn = $("loginBtn");
    if (!u || !p) return showMessage("يرجى ملء جميع الحقول", "error");
    btn.disabled = true; btn.textContent = "جاري تسجيل الدخول...";
    try { await login(u, p); showMessage("تم تسجيل الدخول بنجاح", "success"); setTimeout(() => { passInput.value = ""; render(); }, 400); }
    catch (err) { showMessage(err.message, "error"); }
    finally { btn.disabled = false; btn.textContent = "تسجيل الدخول"; }
  });

  // ----- التنقل -----
  const TITLES = { home: "الرئيسية", products: "المنتجات", orders: "الطلبات", ads: "محاكي الإعلانات", wa: "محاكي واتساب" };
  const openMenu = o => { sidebar.classList.toggle("open", o); overlay.classList.toggle("show", o); };
  function showSection(name) {
    Object.keys(TITLES).forEach(k => { $("sec-" + k).hidden = k !== name; });
    document.querySelectorAll(".nav-btn[data-section]").forEach(b => b.classList.toggle("active", b.dataset.section === name));
    $("pageTitle").textContent = TITLES[name]; openMenu(false); scrollTo(0, 0);
    if (name === "products") loadProducts();
    if (name === "orders") loadOrders();
    if (name === "home" && dashStale) loadDashboard();
    if (name === "ads" && window.adsSimRefresh) window.adsSimRefresh();
  }
  document.querySelectorAll(".nav-btn[data-section]").forEach(b => b.addEventListener("click", () => showSection(b.dataset.section)));
  $("menuBtn").addEventListener("click", () => openMenu(true));
  overlay.addEventListener("click", () => openMenu(false));
  $("logoutBtn").addEventListener("click", () => { clearSession(); location.reload(); });
  $("retryBtn").addEventListener("click", loadDashboard);

  // ----- الرئيسية -----
  const setStats = (p, o, n, s) => { $("statProducts").textContent = p; $("statOrders").textContent = o; $("statNew").textContent = n; $("statSales").textContent = s; };
  const latestMsg = t => { $("latestOrders").innerHTML = '<tr><td colspan="6" class="state-msg">' + t + "</td></tr>"; };
  function renderDashboard(d) {
    setStats(d.products, d.orders, d.newOrders, formatMoney(d.sales));
    const l = d.latest || [];
    if (!l.length) return latestMsg("لا توجد طلبات بعد");
    $("latestOrders").innerHTML = l.map(o => "<tr><td>#" + esc(o.id) + "</td><td>" + esc(o.customerName) + '</td><td class="cell-name">' + esc(o.productName) + "</td><td>" + esc(o.quantity) + "</td><td>" + formatMoney(o.total) +
      '</td><td><span class="badge b-' + esc(o.status) + '">' + esc(ORDER_LABELS[o.status] || o.status) + "</span></td></tr>").join("");
  }
  async function loadDashboard() {
    $("dashError").hidden = true;
    const c = cacheLoad("dashboard");
    if (c) renderDashboard(c); else { setStats("-", "-", "-", "-"); latestMsg("جاري تحميل الطلبات..."); }
    try { const d = await getDashboard(); cacheSave("dashboard", d); renderDashboard(d); dashStale = false; }
    catch (err) {
      if (handleAuthError(err)) return;
      if (c) showToast(err.message, "error"); else { $("dashErrorText").textContent = err.message; $("dashError").hidden = false; latestMsg("تعذر تحميل الطلبات"); }
    }
  }

  // ----- المنتجات -----
  function productCard(p) {
    const off = p.status !== "active", has = /^https?:\/\//i.test(p.image1 || ""), id = esc(p.id);
    const old = Number(p.oldPrice) > Number(p.price) ? '<span class="pold">' + formatMoney(p.oldPrice) + "</span>" : "";
    return '<article class="pcard' + (off ? " off" : "") + '"><div class="pimg' + (has ? "" : " no-img") + '">' +
      (has ? '<img src="' + esc(imgUrl(p.image1, 400)) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' : "") +
      '<span class="badge b-' + esc(p.status) + '">' + esc(PRODUCT_LABELS[p.status] || p.status) + "</span></div>" +
      '<div class="pinfo"><h3 class="pname">' + esc(p.name) + '</h3><div class="pprice">' + formatMoney(p.price) + old + '</div><div class="pstock">المخزون: ' + esc(p.stock) + "</div></div>" +
      '<div class="pactions"><button type="button" class="btn btn-ghost" data-action="edit" data-id="' + id + '">تعديل</button>' +
      (off ? '<button type="button" class="btn btn-main" data-action="activate" data-id="' + id + '">تفعيل</button>' : "") +
      '<button type="button" class="btn btn-line-danger" data-action="delete" data-id="' + id + '">حذف</button></div></article>';
  }
  function renderProducts() {
    const st = $("productsState");
    if (!products.length) { $("productsGrid").innerHTML = ""; st.textContent = "لا توجد منتجات بعد. اضغط «+ إضافة منتج» لإضافة أول منتج."; st.hidden = false; return; }
    st.hidden = true; $("productsGrid").innerHTML = products.map(productCard).join("");
  }
  $("productsGrid").addEventListener("error", e => { if (e.target.tagName === "IMG") { e.target.parentElement.classList.add("no-img"); e.target.remove(); } }, true);
  function commitProducts(list) { products = list; cacheSave("products", products); renderProducts(); dashStale = true; }
  async function loadProducts() {
    const st = $("productsState"), c = cacheLoad("products");
    if (c) { products = c; renderProducts(); } else { $("productsGrid").innerHTML = ""; st.textContent = "جاري تحميل المنتجات..."; st.hidden = false; }
    try { products = await getProducts(); cacheSave("products", products); renderProducts(); }
    catch (err) { if (handleAuthError(err)) return; if (c) showToast(err.message, "error"); else st.textContent = "حدث خطأ أثناء تحميل المنتجات: " + err.message; }
  }
  $("refreshProducts").addEventListener("click", loadProducts);

  // ----- الطلبات -----
  const CHOICES = ["confirmed", "shipped", "delivered", "cancelled"]; // الإلغاء ضروري لحساب نسبة التأكيد
  function statusSelect(o) {
    const isChoice = CHOICES.indexOf(o.status) >= 0;
    const cur = isChoice ? "" : '<option value="' + esc(o.status) + '" selected disabled>' + esc(ORDER_LABELS[o.status] || o.status) + "</option>";
    return '<select class="status-select st-' + esc(o.status) + '" data-id="' + esc(o.id) + '" data-prev="' + esc(o.status) + '" aria-label="حالة الطلب">' + cur +
      CHOICES.map(s => '<option value="' + s + '"' + (s === o.status ? " selected" : "") + ">" + ORDER_LABELS[s] + "</option>").join("") + "</select>";
  }
  const ordersMsg = t => { $("ordersBody").innerHTML = '<tr><td colspan="12" class="state-msg">' + t + "</td></tr>"; };
  function renderOrders() {
    if (!orders.length) return ordersMsg("لا توجد طلبات بعد");
    $("ordersBody").innerHTML = orders.map(o => {
      let ph = String(o.phone || ""); if (/^[5-7]\d{8}$/.test(ph)) ph = "0" + ph;
      return "<tr><td>#" + esc(o.id) + "</td><td>" + esc(o.date) + '</td><td class="cell-name">' + esc(o.productName) + "</td><td>" + esc(o.customerName) +
        '</td><td class="cell-phone"><a href="tel:' + esc(ph.replace(/[^\d+]/g, "")) + '">' + esc(ph) + "</a></td><td>" + esc(o.city) + '</td><td class="cell-wrap">' + esc(o.address) +
        "</td><td>" + esc(o.quantity) + "</td><td>" + formatMoney(o.price) + "</td><td>" + formatMoney(o.total) + "</td><td>" + statusSelect(o) +
        '</td><td><button type="button" class="btn btn-line-danger btn-sm" data-del="' + esc(o.id) + '">حذف</button></td></tr>';
    }).join("");
  }
  async function loadOrders() {
    const c = cacheLoad("orders");
    if (c) { orders = c; renderOrders(); } else ordersMsg("جاري تحميل الطلبات...");
    try { orders = await getOrders(); cacheSave("orders", orders); renderOrders(); }
    catch (err) { if (handleAuthError(err)) return; if (c) showToast(err.message, "error"); else ordersMsg("حدث خطأ أثناء تحميل الطلبات: " + esc(err.message)); }
  }
  $("refreshOrders").addEventListener("click", loadOrders);
  $("ordersBody").addEventListener("change", async e => {
    const sel = e.target.closest("select.status-select"); if (!sel) return;
    const id = sel.dataset.id, prev = sel.dataset.prev, status = sel.value;
    if (status === prev) return;
    if (busy) { sel.value = prev; return; }
    busy = true; sel.disabled = true;
    try {
      await updateOrder(id, status);
      orders = orders.map(o => String(o.id) === String(id) ? Object.assign({}, o, { status: status }) : o);
      cacheSave("orders", orders); dashStale = true; renderOrders(); showToast("تم تحديث حالة الطلب بنجاح");
    } catch (err) { if (handleAuthError(err)) return; sel.value = prev; sel.disabled = false; showToast(err.message, "error"); }
    finally { busy = false; }
  });
  $("ordersBody").addEventListener("click", e => {
    const b = e.target.closest("button[data-del]"); if (!b || busy) return;
    const o = orders.find(x => String(x.id) === b.dataset.del); if (!o) return;
    deletingId = o.id; deleteKind = "order"; $("confirmTitle").textContent = "حذف الطلب";
    $("confirmText").textContent = "هل أنت متأكد من حذف الطلب #" + o.id + " الخاص بـ «" + o.customerName + "» نهائيًا؟ لا يمكن التراجع.";
    openModal("confirmModal");
  });

  // ----- النوافذ -----
  function openModal(id) { $(id).hidden = false; document.body.classList.add("no-scroll"); }
  function closeModals() { $("productModal").hidden = true; $("confirmModal").hidden = true; document.body.classList.remove("no-scroll"); editingId = null; deletingId = null; }
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-close]")) closeModals(); }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") { openMenu(false); closeModals(); } });

  // ----- نموذج المنتج: رفع الصور -----
  const pForm = $("productForm"), pMsg = $("productMessage"), uploads = $("uploads"), saveBtn = $("saveProductBtn");
  IMAGE_KEYS.forEach((key, i) => uploads.insertAdjacentHTML("beforeend",
    '<div class="uslot" data-key="' + key + '"><button type="button" class="uframe" aria-label="اختيار صورة"><img alt="" hidden><span class="uplus" aria-hidden="true">+</span><span class="ustatus" hidden></span></button>' +
    '<button type="button" class="uremove" aria-label="حذف الصورة" hidden>×</button><input type="file" accept="image/*" hidden><input type="hidden" name="' + key + '">' +
    '<span class="ucap">' + (i === 0 ? "الصورة الرئيسية" : "صورة " + (i + 1)) + "</span></div>"));
  const slotEl = k => uploads.querySelector('[data-key="' + k + '"]');
  function setSlot(key, url, preview) {
    const slot = slotEl(key), img = slot.querySelector("img");
    slot.querySelector('input[type="hidden"]').value = url || "";
    if (url) { img.src = preview || imgUrl(url, 200); img.hidden = false; } else { img.removeAttribute("src"); img.hidden = true; }
    slot.classList.toggle("has-img", !!url); slot.querySelector(".uremove").hidden = !url;
  }
  function setSlotStatus(key, t) { const st = slotEl(key).querySelector(".ustatus"); st.textContent = t || ""; st.hidden = !t; }
  function updateSaveState() {
    saveBtn.disabled = busy || pendingUploads > 0 || descLoading;
    saveBtn.textContent = pendingUploads > 0 ? "جاري رفع الصور..." : descLoading ? "جاري تحميل الوصف..." : "حفظ";
  }
  async function handleFile(key, file, input) {
    if (!file) return;
    pMsg.hidden = true;
    const previous = slotEl(key).querySelector('input[type="hidden"]').value;
    pendingUploads++; updateSaveState(); setSlotStatus(key, "جاري الرفع...");
    try {
      const img = await prepareImage(file);
      setSlot(key, previous, img.preview);
      const res = await uploadImage(img.base64, img.mime);
      setSlot(key, res.url, img.preview);
    } catch (err) {
      if (handleAuthError(err)) return;
      setSlot(key, previous); pMsg.textContent = err.message || "تعذر رفع الصورة"; pMsg.hidden = false;
    } finally { pendingUploads--; setSlotStatus(key, ""); updateSaveState(); if (input) input.value = ""; }
  }
  uploads.addEventListener("click", e => {
    const slot = e.target.closest(".uslot"); if (!slot) return;
    if (e.target.closest(".uremove")) setSlot(slot.dataset.key, ""); else if (e.target.closest(".uframe")) slot.querySelector('input[type="file"]').click();
  });
  uploads.addEventListener("change", e => { const i = e.target; if (i.type === "file") handleFile(i.closest(".uslot").dataset.key, i.files[0], i); });

  // ----- نموذج المنتج: الوصف و GIF -----
  const descBox = pForm.elements.description, DESC_PH = descBox.placeholder;
  function renderGifs() {
    $("gifList").innerHTML = descGifs.map((u, i) => '<div class="gitem"><img src="' + esc(u) + '" alt="" loading="lazy"><button type="button" class="uremove" data-i="' + i + '" aria-label="حذف GIF">×</button></div>').join("");
    $("addGifBtn").hidden = descGifs.length >= MAX_GIFS;
  }
  $("gifList").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) { descGifs.splice(Number(b.dataset.i), 1); renderGifs(); } });
  $("addGifBtn").addEventListener("click", () => $("gifInput").click());
  $("gifInput").addEventListener("change", e => { const i = e.target; handleGifs(Array.from(i.files)).then(() => { i.value = ""; }); });
  async function handleGifs(files) {
    for (const f of files) {
      const bad = descGifs.length >= MAX_GIFS ? "الحد الأقصى " + MAX_GIFS + " صور GIF"
        : (f.type !== "image/gif" && !/\.gif$/i.test(f.name || "")) ? "يرجى اختيار ملف بصيغة GIF"
        : f.size > GIF_MAX_BYTES ? "حجم الـ GIF كبير، الحد الأقصى 5 ميغابايت" : "";
      if (bad) { pMsg.textContent = bad; pMsg.hidden = false; if (descGifs.length >= MAX_GIFS) break; continue; }
      pMsg.hidden = true; pendingUploads++; updateSaveState(); $("addGifBtn").textContent = "جاري رفع GIF...";
      try { const r = await uploadImage(await fileToBase64(f), "image/gif"); descGifs.push(r.url); renderGifs(); }
      catch (err) { if (handleAuthError(err)) return; pMsg.textContent = err.message || "تعذر رفع الـ GIF"; pMsg.hidden = false; }
      finally { pendingUploads--; $("addGifBtn").textContent = "+ إضافة GIF"; updateSaveState(); }
    }
  }
  // القائمة لا تحمل الوصف، فنجلبه كاملًا عند التعديل
  async function loadFullProduct(id) {
    descLoading = true; descBox.disabled = true; descBox.placeholder = "جاري تحميل الوصف..."; updateSaveState();
    let full;
    try { full = await getProduct(id); }
    catch (err) {
      if (handleAuthError(err)) return;
      if (String(editingId) === String(id)) { pMsg.textContent = "تعذر تحميل وصف المنتج، أغلق النافذة وحاول مرة أخرى"; pMsg.hidden = false; }
      return;
    }
    if (String(editingId) !== String(id)) return;
    const d = splitDescription(full.description);
    descBox.value = d.text; descGifs = d.gifs; renderGifs();
    descLoading = false; descBox.disabled = false; descBox.placeholder = DESC_PH; updateSaveState();
  }
  function openProductModal(p) {
    editingId = p ? p.id : null;
    $("modalTitle").textContent = p ? "تعديل المنتج" : "إضافة منتج"; pMsg.hidden = true;
    PRODUCT_FIELDS.forEach(k => {
      if (IMAGE_KEYS.indexOf(k) >= 0 || k === "description") return;
      const v = p && p[k] != null ? p[k] : ""; pForm.elements[k].value = k === "status" && v === "" ? "active" : v;
    });
    IMAGE_KEYS.forEach(k => setSlot(k, p && p[k] ? p[k] : ""));
    descBox.value = ""; descBox.disabled = false; descBox.placeholder = DESC_PH; descLoading = false; descGifs = []; renderGifs(); updateSaveState();
    openModal("productModal"); pForm.elements.name.focus();
    if (p) loadFullProduct(p.id);
  }
  $("addProductBtn").addEventListener("click", () => openProductModal(null));

  pForm.addEventListener("submit", async e => {
    e.preventDefault(); if (busy) return; pMsg.hidden = true;
    if (pendingUploads > 0) { pMsg.textContent = "يرجى انتظار اكتمال رفع الصور"; pMsg.hidden = false; return; }
    const v = {}; PRODUCT_FIELDS.forEach(k => { v[k] = pForm.elements[k].value.trim(); });
    v.description = joinDescription(v.description, descGifs);
    const problem = validateProduct(v);
    if (problem) { pMsg.textContent = problem; pMsg.hidden = false; return; }
    const id = editingId, isEdit = id !== null;
    busy = true; saveBtn.disabled = true; saveBtn.textContent = "جاري الحفظ...";
    try {
      const res = isEdit ? await updateProduct(id, v) : await addProduct(v);
      const local = normalizeProduct(v); delete local.description;
      commitProducts(isEdit ? products.map(p => String(p.id) === String(id) ? Object.assign({}, p, local) : p) : [Object.assign({ id: res.id, createdAt: "" }, local)].concat(products));
      closeModals(); showToast(isEdit ? "تم تعديل المنتج بنجاح" : "تمت إضافة المنتج بنجاح");
    } catch (err) { if (handleAuthError(err)) return; pMsg.textContent = err.message; pMsg.hidden = false; }
    finally { busy = false; updateSaveState(); }
  });

  // ----- أزرار البطاقات -----
  $("productsGrid").addEventListener("click", async e => {
    const b = e.target.closest("button[data-action]"); if (!b || busy) return;
    const p = products.find(x => String(x.id) === b.dataset.id); if (!p) return;
    if (b.dataset.action === "edit") openProductModal(p);
    else if (b.dataset.action === "delete") {
      deletingId = p.id; deleteKind = "product"; $("confirmTitle").textContent = "حذف المنتج";
      $("confirmText").textContent = "هل أنت متأكد من حذف «" + p.name + "» نهائيًا مع صوره؟ لا يمكن التراجع. وإن أردت إخفاءه مؤقتًا فغيّر حالته إلى «غير نشط» من زر التعديل.";
      openModal("confirmModal");
    } else if (b.dataset.action === "activate") {
      busy = true; b.disabled = true;
      try { await setProductStatus(p.id, "active"); commitProducts(products.map(x => String(x.id) === String(p.id) ? Object.assign({}, x, { status: "active" }) : x)); showToast("تم تفعيل المنتج بنجاح"); }
      catch (err) { if (!handleAuthError(err)) { showToast(err.message, "error"); b.disabled = false; } }
      finally { busy = false; }
    }
  });
  $("confirmYes").addEventListener("click", async () => {
    if (busy || deletingId === null) return;
    const yes = $("confirmYes"), id = deletingId;
    busy = true; yes.disabled = true; yes.textContent = "جاري الحذف...";
    try {
      if (deleteKind === "order") {
        await deleteOrder(id); orders = orders.filter(x => String(x.id) !== String(id)); cacheSave("orders", orders); dashStale = true; renderOrders(); closeModals(); showToast("تم حذف الطلب بنجاح");
      } else { await deleteProduct(id); commitProducts(products.filter(x => String(x.id) !== String(id))); closeModals(); showToast("تم حذف المنتج بنجاح"); }
    } catch (err) { if (handleAuthError(err)) return; closeModals(); showToast(err.message, "error"); }
    finally { busy = false; yes.disabled = false; yes.textContent = "نعم، احذف نهائيًا"; }
  });

  render();
});
