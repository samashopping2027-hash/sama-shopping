/* Sama shopping — product.js: صفحة المنتج + إرسال الطلب */
document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const id = new URLSearchParams(location.search).get("id");
  const state = $("pState"), view = $("productView"), form = $("orderForm"), bar = $("stickyCta");
  let product = null, maxQty = 99, canOrder = false;

  const fail = (msg, retry) => {
    view.hidden = true; state.hidden = false; canOrder = false; updateBar();
    state.innerHTML = esc(msg) + (retry
      ? '<br><button type="button" class="btn btn-blue" id="retry" style="margin-top:12px">إعادة المحاولة</button>'
      : '<br><a class="btn btn-main" href="index.html" style="margin-top:12px">العودة للمتجر</a>');
    const r = $("retry"); if (r) r.onclick = load;
  };

  async function load() {
    if (!id) return fail("المنتج غير موجود");
    state.hidden = false; state.textContent = "جاري تحميل المنتج...";
    let p = null;
    try { p = await apiGet({ action: "product", id: id }); }
    catch (err) {
      const c = (cacheGet(CACHE_KEY) || []).find(x => String(x.id) === String(id)); // نسخة محفوظة بدون الوصف
      if (c) p = c; else return fail(err.message, true);
    }
    if (!p || (p.status && p.status !== "active")) return fail("هذا المنتج غير متوفر حاليًا");
    show(p);
  }

  // ----- عرض الوصف: فقرات + قوائم نقطية (أسطر تبدأ بـ - أو • أو ✔) -----
  const BULLET = /^\s*(?:[-•*·▪●✔✓✅☑️⭐]+)\s*/;
  function renderDescription(text) {
    const out = [];
    text.split(/\n{2,}/).forEach(block => {
      let list = [], para = [];
      const flushList = () => { if (list.length) out.push("<ul>" + list.map(t => "<li>" + esc(t) + "</li>").join("") + "</ul>"); list = []; };
      const flushPara = () => { if (para.length) out.push("<p>" + para.map(esc).join("<br>") + "</p>"); para = []; };
      block.split("\n").forEach(line => {
        if (!line.trim()) return;
        if (BULLET.test(line)) { flushPara(); list.push(line.replace(BULLET, "")); }
        else { flushList(); para.push(line.trim()); }
      });
      flushList(); flushPara();
    });
    return out.join("");
  }

  function show(p) {
    product = p;
    document.title = p.name + " | Sama shopping";
    $("crumbName").textContent = p.name;
    $("pTitle").textContent = p.name;
    $("pPrice").textContent = $("sPrice").textContent = formatMoney(p.price);

    const off = discountPercent(p);
    $("pOld").hidden = $("pOff").hidden = $("pSave").hidden = !off;
    if (off) {
      $("pOld").textContent = formatMoney(p.oldPrice);
      $("pOff").textContent = "-" + off + "%";
      $("pSave").textContent = "وفّرت " + formatMoney(Number(p.oldPrice) - Number(p.price));
    }

    const stock = Number(p.stock) || 0, inStock = stock > 0;
    $("pStatus").textContent = inStock ? "متوفر" : "نفد المخزون";
    $("pStatus").className = "pill " + (inStock ? "in" : "no");
    $("pStock").textContent = inStock && stock <= LOW_STOCK ? "باقي " + stock + " قطع فقط" : "";
    maxQty = inStock ? Math.min(stock, 99) : 0;

    // المعرض
    const imgs = ["image1", "image2", "image3", "image4"].map(k => p[k]).filter(u => /^https?:\/\//i.test(u || ""));
    $("gTrack").innerHTML = imgs.length
      ? imgs.map((u, i) => '<div class="gslide"><img src="' + esc(imgUrl(u, 720)) + '" srcset="' + esc(imgUrl(u, 480)) + ' 480w, ' + esc(imgUrl(u, 720)) + ' 720w, ' + esc(imgUrl(u, 1000)) + ' 1000w" sizes="(min-width:900px) 520px, 100vw" alt="' + esc(p.name) + '" width="900" height="900"' + (i ? ' loading="lazy"' : ' fetchpriority="high"') + ' decoding="async"></div>').join("")
      : '<div class="gslide" style="font-size:4rem;background:var(--bg)">🛍️</div>';
    $("gDots").innerHTML = imgs.length > 1 ? imgs.map((_, i) => "<i" + (i ? "" : ' class="on"') + "></i>").join("") : "";
    $("gThumbs").innerHTML = imgs.length > 1 ? imgs.map((u, i) => '<button type="button" class="gthumb' + (i ? "" : " on") + '" data-i="' + i + '" aria-label="صورة ' + (i + 1) + '"><img src="' + esc(imgUrl(u, 150)) + '" alt="" width="64" height="64" loading="lazy" decoding="async"></button>').join("") : "";
    const track = $("gTrack");
    const mark = i => {
      [].forEach.call($("gDots").children, (d, k) => d.classList.toggle("on", k === i));
      [].forEach.call($("gThumbs").children, (d, k) => d.classList.toggle("on", k === i));
    };
    track.onscroll = () => mark(Math.round(Math.abs(track.scrollLeft) / (track.clientWidth || 1)));
    $("gThumbs").onclick = e => {
      const b = e.target.closest(".gthumb"); if (!b) return;
      track.children[Number(b.dataset.i)].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    };

    // الوصف (نص + GIF)
    const d = splitDescription(p.description);
    const text = d.text ? renderDescription(d.text) : "";
    const gifs = d.gifs.map(u => '<img src="' + esc(u) + '" alt="" loading="lazy" decoding="async">').join("");
    $("pDesc").hidden = !(text || gifs);
    $("pDescBody").innerHTML = text + gifs;

    // الطلب
    [].forEach.call(form.querySelectorAll("input,textarea,button"), el => { el.disabled = !inStock; });
    $("oBtn").textContent = inStock ? "تأكيد الطلب" : "نفد المخزون";
    $("qtyInput").value = 1;
    total();

    // أزرار "اطلب الآن" تظهر فقط إذا كان المنتج متوفرًا
    document.querySelectorAll("[data-go-order]").forEach(a => { a.hidden = !inStock; });
    canOrder = inStock;

    if (navigator.share) { $("shareBtn").hidden = false; $("shareBtn").onclick = () => navigator.share({ title: p.name, url: location.href }).catch(() => {}); }

    state.hidden = true; view.hidden = false;
    updateBar();
    related();
  }

  // ----- زر "اطلب الآن": تمرير سلس إلى النموذج -----
  function goOrder(e) {
    if (e) e.preventDefault();
    const box = $("orderBox");
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    if (history.replaceState) history.replaceState(null, "", "#orderBox");
    box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash");
    // على الكمبيوتر نضع المؤشر في أول خانة (على الجوال نتجنب فتح لوحة المفاتيح تلقائيًا)
    if (matchMedia("(pointer:fine)").matches) setTimeout(() => $("oName").focus({ preventScroll: true }), 600);
  }
  document.querySelectorAll("[data-go-order]").forEach(a => a.addEventListener("click", goOrder));

  // ----- شريط الطلب السفلي (جوال): يظهر عندما يكون النموذج خارج الشاشة -----
  let orderVisible = false, footerVisible = false;
  function updateBar() { if (bar) bar.classList.toggle("show", canOrder && !orderVisible && !footerVisible); }
  if (bar && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.target.id === "orderBox") orderVisible = en.isIntersecting; else footerVisible = en.isIntersecting; });
      updateBar();
    });
    io.observe($("orderBox")); io.observe($("contact"));
  }

  // ----- الكمية والمجموع -----
  const qtyVal = () => { const n = parseInt($("qtyInput").value, 10); return n >= 1 ? Math.min(n, maxQty || 99) : 1; };
  function total() { if (product) $("oTotal").textContent = formatMoney(Number(product.price) * qtyVal()); }
  $("qtyMinus").onclick = () => { $("qtyInput").value = Math.max(1, qtyVal() - 1); total(); };
  $("qtyPlus").onclick = () => { $("qtyInput").value = Math.min(maxQty || 99, qtyVal() + 1); total(); };
  $("qtyInput").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, ""); total(); });
  $("qtyInput").addEventListener("blur", () => { $("qtyInput").value = qtyVal(); total(); });

  // ----- التحقق وإرسال الطلب -----
  const setErr = (name, msg) => {
    const el = form.elements[name], box = form.querySelector('[data-for="' + name + '"]');
    if (box) box.textContent = msg || "";
    if (el) el.classList.toggle("bad", !!msg);
    return !msg;
  };
  form.addEventListener("input", e => { if (e.target.name) setErr(e.target.name, ""); });

  // يحوّل الأرقام العربية ويوحّد الصيغة إلى 0XXXXXXXXX (يرجع null إذا كان غير صحيح)
  function normalizePhone(raw) {
    let p = String(raw).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[\s.\-()]/g, "");
    p = p.replace(/^(\+212|00212|212)/, "0");
    if (/^[5-7]\d{8}$/.test(p)) p = "0" + p;
    return /^0[5-7]\d{8}$/.test(p) ? p : null;
  }

  function validate() {
    const v = n => form.elements[n].value.trim();
    const phone = normalizePhone(v("phone"));
    let ok = true;
    ok = setErr("customerName", v("customerName").length < 3 ? "يرجى إدخال الاسم الكامل" : "") && ok;
    ok = setErr("phone", phone ? "" : "رقم الهاتف غير صحيح (مثال: 06XXXXXXXX)") && ok;
    ok = setErr("city", v("city").length < 2 ? "يرجى إدخال المدينة" : "") && ok;
    ok = setErr("address", v("address").length < 6 ? "يرجى إدخال العنوان بوضوح" : "") && ok;
    const q = parseInt(v("quantity"), 10);
    ok = setErr("quantity", q >= 1 && q <= (maxQty || 99) ? "" : "الكمية المتاحة: " + maxQty) && ok;
    return ok ? { phone: phone, quantity: q } : null;
  }

  let sending = false;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (sending || !product) return;
    $("oMsg").hidden = true;
    const ok = validate();
    if (!ok) { const bad = form.querySelector(".bad"); if (bad) bad.focus(); return; }

    sending = true;
    $("oBtn").disabled = true; $("oBtn").textContent = "جاري إرسال الطلب...";
    try {
      const res = await apiPost({
        action: ORDER_ACTION, productId: product.id, productName: product.name, price: Number(product.price),
        quantity: ok.quantity, customerName: form.elements.customerName.value.trim(), phone: ok.phone,
        city: form.elements.city.value.trim(), address: form.elements.address.value.trim()
      }, 45000);
      const sum = { id: (res && res.id) || "", product: product.name, quantity: ok.quantity, total: Number(product.price) * ok.quantity };
      try { sessionStorage.setItem("taja_last_order", JSON.stringify(sum)); } catch (x) { /* تجاهل */ }
      location.href = "thanks.html";
    } catch (err) {
      $("oMsg").textContent = err.message || "تعذر إرسال الطلب، حاول مرة أخرى";
      $("oMsg").hidden = false;
      $("oBtn").disabled = false; $("oBtn").textContent = "تأكيد الطلب";
      sending = false;
    }
  });

  // ----- منتجات أخرى -----
  async function related() {
    let list = cacheGet(CACHE_KEY);
    if (!list || !list.length) {
      try { list = (await apiGet({ action: "products", light: "1" })).filter(p => p.status === "active"); cacheSet(CACHE_KEY, list); }
      catch (e) { return; }
    }
    const others = list.filter(p => String(p.id) !== String(id) && Number(p.stock) > 0).slice(0, 4);
    if (!others.length) return;
    $("relatedGrid").innerHTML = others.map((p, i) => productCardHtml(p, 9 + i).replace(/<img\b(?![^>]*\bloading=)/gi, '<img loading="lazy" decoding="async"')).join("");
    $("related").hidden = false;
  }
  $("relatedGrid").addEventListener("error", e => { if (e.target.tagName === "IMG") { e.target.parentElement.classList.add("no-img"); e.target.remove(); } }, true);

  load();
});