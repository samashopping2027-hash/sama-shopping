/* Sama shopping — index.js v2: منتجات + بحث + سلايدر، مع صور أسرع ومزامنة ذكية */
const PAGE_SIZE = 12;
const REFRESH_MIN = 60 * 1000;      // أقل فاصل بين جلبين متتاليين
const REFRESH_EVERY = 5 * 60 * 1000; // تحديث دوري والصفحة مفتوحة

function norm(s) {
  return String(s || "").toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
}

/* ---------- تحسين الصور ---------- */
// صور Google (lh3.googleusercontent.com/...=s220 أو =w1000) نطلبها بالحجم المناسب فقط
function gimg(src, w) { return src.replace(/=[a-z]\d+[a-z0-9-]*$/i, "") + "=w" + w; }
const sizesFor = big => "(min-width:1180px) 290px,(min-width:900px) 30vw,(min-width:640px) 46vw," + (big ? "100vw" : "50vw");

// نمرّر ناتج productCardHtml عبر هذه الدالة: تحميل كسول، فك ترميز غير حاجب، وsrcset
function enhance(html, idx) {
  const big = idx % 3 === 0; // البطاقة الكبيرة على الهاتف (نمط 1-2-1-2)
  return html.replace(/<img\b([^>]*)>/gi, (m, a) => {
    a = a.replace(/\/\s*$/, "");
    const has = n => new RegExp("\\s" + n + "=").test(" " + a);
    let x = "";
    if (!has("loading")) x += idx < 2 ? ' fetchpriority="high"' : ' loading="lazy"';
    if (!has("decoding")) x += ' decoding="async"';
    const s = /\bsrc="([^"]+)"/.exec(a);
    if (s && /googleusercontent\.com\/[^?#]*$/.test(s[1]) && !has("srcset")) {
      a = a.replace(s[0], 'src="' + gimg(s[1], 480) + '"');
      x += ' srcset="' + gimg(s[1], 320) + " 320w, " + gimg(s[1], 480) + " 480w, " + gimg(s[1], 720) + ' 720w" sizes="' + sizesFor(big) + '"';
    }
    return "<img" + a + x + ">";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);

  /* ظل الهيدر عند التمرير */
  const hdr = $("siteHeader");
  if (hdr) {
    let tick = false;
    addEventListener("scroll", () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => { hdr.classList.toggle("scrolled", scrollY > 8); tick = false; });
    }, { passive: true });
  }

  const grid = $("shopGrid");
  if (!grid) return;

  let all = [], list = [], shown = 0, query = "", filter = "all", sort = "new";
  let sig = "", lastFetch = 0, busy = false;

  const card = (p, i) => enhance(productCardHtml(p, i), i);
  const skeleton = () => new Array(8).fill('<div class="card skel"><div class="card-img"></div><div class="card-body"><i></i><i style="width:60%"></i></div></div>').join("");
  const setState = h => { $("shopState").innerHTML = h; $("shopState").hidden = !h; };

  // keep=true: تحديث في الخلفية دون إرجاع المستخدم إلى أول الصفحة
  function apply(keep) {
    const q = norm(query), prev = shown;
    list = all.filter(p => (!q || norm(p.name).indexOf(q) >= 0) &&
      (filter === "all" || (filter === "offers" && discountPercent(p) > 0) || (filter === "stock" && Number(p.stock) > 0)));
    if (sort === "low") list.sort((a, b) => a.price - b.price);
    else if (sort === "high") list.sort((a, b) => b.price - a.price);
    shown = Math.min(keep ? Math.max(prev, PAGE_SIZE) : PAGE_SIZE, list.length);
    grid.innerHTML = list.slice(0, shown).map((p, i) => card(p, i)).join("");
    $("shopCount").textContent = all.length ? list.length + " منتج" : "";
    $("shopMore").hidden = shown >= list.length;
    if (!all.length) setState("لا توجد منتجات حاليًا، عُد قريبًا.");
    else if (!list.length) setState('لا توجد نتائج مطابقة.<br><button type="button" class="btn btn-ghost" id="resetBtn" style="margin-top:12px">عرض كل المنتجات</button>');
    else setState("");
  }

  function more() {
    if (shown >= list.length) return;
    const next = Math.min(shown + PAGE_SIZE, list.length), start = shown;
    grid.insertAdjacentHTML("beforeend", list.slice(start, next).map((p, i) => card(p, start + i)).join(""));
    shown = next;
    $("shopMore").hidden = shown >= list.length;
  }
  $("moreBtn").addEventListener("click", more);
  if ("IntersectionObserver" in window) new IntersectionObserver(en => { if (en.some(e => e.isIntersecting)) more(); }, { rootMargin: "700px" }).observe($("shopMore"));

  // صورة معطوبة: نعرض أيقونة بدلها
  grid.addEventListener("error", e => {
    if (e.target.tagName === "IMG") { e.target.parentElement.classList.add("no-img"); e.target.remove(); }
  }, true);

  $("shopState").addEventListener("click", e => {
    if (e.target.id === "retryBtn") load();
    if (e.target.id === "resetBtn") { query = ""; filter = "all"; $("searchInput").value = ""; apply(); }
  });

  $("sortSel").addEventListener("change", e => { sort = e.target.value; apply(); });

  let t;
  window.onStoreSearch = q => { clearTimeout(t); t = setTimeout(() => { query = q; apply(); }, 150); };

  /* ---------- المزامنة ---------- */
  // تجلب المنتجات، ولا تعيد رسم الشبكة إلا إذا تغيّرت البيانات فعلًا
  async function sync() {
    if (busy) return true;
    busy = true;
    try {
      const fresh = (await apiGet({ action: "products", light: "1" })).filter(p => p.status === "active");
      lastFetch = Date.now();
      const s = JSON.stringify(fresh);
      cacheSet(CACHE_KEY, fresh);
      if (s !== sig) { sig = s; all = fresh; apply(true); }
      return true;
    } catch (err) {
      return false;
    } finally {
      busy = false;
    }
  }

  async function load() {
    const cached = cacheGet(CACHE_KEY);
    if (cached && cached.length) { all = cached; sig = JSON.stringify(cached); apply(); }
    else { setState(""); grid.innerHTML = skeleton(); }
    const ok = await sync();
    if (!ok && !all.length) {
      grid.innerHTML = ""; $("shopMore").hidden = true;
      setState('حدث خطأ أثناء تحميل المنتجات<br><button type="button" class="btn btn-ghost" id="retryBtn" style="margin-top:12px">إعادة المحاولة</button>');
    }
  }

  // تحديث تلقائي: عند العودة للتبويب، عند رجوع الاتصال، وكل 5 دقائق
  const refresh = () => { if (!document.hidden && Date.now() - lastFetch > REFRESH_MIN) sync(); };
  document.addEventListener("visibilitychange", refresh);
  addEventListener("online", () => sync());
  setInterval(refresh, REFRESH_EVERY);

  const q0 = new URLSearchParams(location.search).get("q");
  if (q0) { query = q0; $("searchInput").value = q0; }
  load();

  // ----- السلايدر -----
  const root = $("heroSlider");
  if (!root) return;

  // الشريحتان 2 و3 تُحمَّلان بعد اكتمال الصفحة حتى لا تنافسا الصورة الأولى ولا المنتجات
  const loadLazySlides = () => root.querySelectorAll(".s-bg[data-img]").forEach(el => {
    const u = el.getAttribute("data-img"); el.removeAttribute("data-img");
    const im = new Image(); im.decoding = "async";
    im.onload = () => el.style.setProperty("--img", "url('" + u + "')");
    im.src = u;
  });
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1200));
  if (document.readyState === "complete") idle(loadLazySlides); else addEventListener("load", () => idle(loadLazySlides));

  const slides = [].slice.call(root.querySelectorAll(".slide")), dots = root.querySelector(".s-dots"), bar = root.querySelector(".s-bar");
  const DUR = 6000;
  let i = 0, timer = null;
  root.style.setProperty("--dur", DUR + "ms");
  const dotEls = slides.map((_, n) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", "الشريحة " + (n + 1)); b.onclick = () => go(n); dots.appendChild(b); return b; });
  function restart() {
    clearTimeout(timer); bar.classList.remove("run"); void bar.offsetWidth;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    bar.classList.add("run"); timer = setTimeout(() => go(i + 1), DUR);
  }
  function go(n) {
    slides[i].classList.remove("on"); i = (n + slides.length) % slides.length; slides[i].classList.add("on");
    dotEls.forEach((d, k) => d.classList.toggle("on", k === i)); restart();
  }
  const pause = () => { clearTimeout(timer); bar.classList.remove("run"); };
  root.querySelector(".s-next").onclick = () => go(i + 1);
  root.querySelector(".s-prev").onclick = () => go(i - 1);
  root.addEventListener("mouseenter", pause); root.addEventListener("mouseleave", restart);
  let x0 = null;
  root.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; pause(); }, { passive: true });
  root.addEventListener("touchend", e => { if (x0 !== null) { const dx = e.changedTouches[0].clientX - x0; Math.abs(dx) > 40 ? go(i + (dx < 0 ? 1 : -1)) : restart(); } x0 = null; });
  document.addEventListener("visibilitychange", () => document.hidden ? pause() : restart());
  go(0);
});