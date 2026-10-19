/* taja market — script.js: الإعدادات + API + دوال مشتركة + واجهة المتجر
   يُحمَّل في كل الصفحات (المتجر ولوحة التحكم). منطق الإدارة في admin.js */

// ---------- الإعدادات ----------
const API_URL = "https://script.google.com/macros/s/AKfycby8Y0AKnFOAjb2sHFOE_nDYEtlCcym-EVIx0e2HOVwY96f9NeILQfEPWDwXGwtYFx1xug/exec";
const CACHE_KEY = "products_light"; // مفتاح تخزين قائمة المنتجات في المتصفح
const LOW_STOCK = 5;                // أقل أو يساوي: تظهر "باقي X قطع فقط"
const ORDER_ACTION = "addOrder";    // اسم عملية إرسال الطلب في Apps Script

// روابط التواصل: ضع الرابط الكامل، والفارغ يُخفى تلقائيًا
// مثال واتساب: "https://wa.me/2126XXXXXXXX"
const SOCIALS = { facebook: "", tiktok: "", instagram: "", whatsapp: "" };

// ---------- دوال مساعدة ----------
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function formatMoney(n) {
  return (Number(n) || 0).toLocaleString("en-US") + " د.م";
}

// رابط صورة Google Drive بحجم مصغّر (أسرع بكثير)
function imgUrl(url, width) {
  url = String(url || "");
  if (url.indexOf("lh3.googleusercontent.com/d/") > -1 && !/=[whs]\d/i.test(url)) return url + "=w" + width;
  return url;
}

// صور GIF تُخزَّن داخل الوصف بصيغة [[gif:الرابط]]
function splitDescription(desc) {
  const gifs = [];
  const text = String(desc || "")
    .replace(/\[\[gif:(https?:\/\/[^\]\s]+)\]\]/g, (m, url) => { gifs.push(url); return ""; })
    .trim();
  return { text: text, gifs: gifs };
}

function discountPercent(p) {
  const price = Number(p.price), old = Number(p.oldPrice);
  if (!(old > price) || !(price > 0)) return 0;
  return Math.round((1 - price / old) * 100);
}

// سطر قصير من الوصف للبطاقة (summary يأتي جاهزًا من الخادم في القائمة الخفيفة)
function cardSummary(p) {
  if (p.summary) return String(p.summary);
  return splitDescription(p.description).text.replace(/\s+/g, " ").slice(0, 110);
}

// بطاقة منتج (تطابق أصناف style.css: .card و .card-img ...)
function productCardHtml(p, index) {
  const href = "product.html?id=" + encodeURIComponent(p.id);
  const hasImg = /^https?:\/\//i.test(p.image1 || "");
  const off = discountPercent(p);
  const stock = Number(p.stock) || 0, out = stock <= 0;
  const loading = index < 4 ? "" : ' loading="lazy"';
  const desc = cardSummary(p);

  return '<article class="card' + (out ? " out" : "") + '">' +
    '<a class="card-img' + (hasImg ? "" : " no-img") + '" href="' + href + '" aria-label="' + esc(p.name) + '">' +
      (hasImg ? '<img src="' + esc(imgUrl(p.image1, 400)) + '" alt="' + esc(p.name) + '" width="400" height="400"' + loading + ' decoding="async">' : "") +
      (off && !out ? '<span class="badge">-' + off + "%</span>" : "") +
      (!out && stock <= LOW_STOCK ? '<span class="badge low">باقي ' + stock + "</span>" : "") +
    "</a>" +
    '<div class="card-body">' +
      '<div class="card-top">' +
        '<h3 class="card-name"><a href="' + href + '">' + esc(p.name) + "</a></h3>" +
        '<div class="card-price"><b>' + formatMoney(p.price) + "</b>" + (off ? "<s>" + formatMoney(p.oldPrice) + "</s>" : "") + "</div>" +
      "</div>" +
      (desc ? '<p class="card-desc">' + esc(desc) + "</p>" : "") +
      (off ? '<div class="card-save">وفّر ' + formatMoney(Number(p.oldPrice) - Number(p.price)) + "</div>" : "") +
      '<a class="btn card-btn" href="' + href + '">' + (out ? "عرض المنتج" : "اطلب الآن") + "</a>" +
    "</div></article>";
}

// ---------- تخزين مؤقت للمتجر (sessionStorage) ----------
function cacheSet(key, value) { try { sessionStorage.setItem("taja_s_" + key, JSON.stringify(value)); } catch (e) { /* تجاهل */ } }
function cacheGet(key) { try { return JSON.parse(sessionStorage.getItem("taja_s_" + key)); } catch (e) { return null; } }

// ---------- الاتصال بالـ API ----------
async function parseResponse(res) {
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch (e) {
    console.error("رد غير متوقع من الخادم:", res.status, text.slice(0, 500));
    throw new Error("حدث خطأ في الاتصال بالخادم");
  }
  if (!json.success) {
    const err = new Error(json.message || "حدث خطأ");
    err.auth = /انتهت الجلسة/.test(err.message);
    throw err;
  }
  return json.data;
}

function normalizeError(e) {
  if (e && e.name === "AbortError") return new Error("انتهت مهلة الاتصال، تحقق من الإنترنت وحاول مرة أخرى");
  if (e instanceof TypeError) return new Error("تعذر الاتصال بالخادم، تحقق من الإنترنت");
  return e;
}

async function apiGet(params, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);
  try {
    const res = await fetch(API_URL + "?" + new URLSearchParams(params), { signal: controller.signal });
    return await parseResponse(res);
  } catch (e) { throw normalizeError(e); }
  finally { clearTimeout(timer); }
}

// text/plain لتجنب مشاكل CORS مع Apps Script
async function apiPost(body, timeoutMs) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
    return await parseResponse(res);
  } catch (e) { throw normalizeError(e); }
  finally { if (timer) clearTimeout(timer); }
}

// ---------- واجهة المتجر المشتركة (هيدر + بحث + قائمة + فوتر) ----------
function initStoreUi() {
  const $ = id => document.getElementById(id);

  // ظل الهيدر عند التمرير
  const header = $("siteHeader");
  if (header) {
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // قائمة الجوال
  const toggle = $("menuToggle"), nav = $("mainNav");
  if (toggle && nav) {
    const set = open => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "✕" : "☰";
    };
    toggle.addEventListener("click", e => { e.stopPropagation(); set(!nav.classList.contains("open")); });
    nav.addEventListener("click", e => { if (e.target.closest("a")) set(false); });
    document.addEventListener("click", e => { if (!nav.contains(e.target)) set(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") set(false); });
  }

  // البحث: في الرئيسية يفلتر مباشرة، وفي بقية الصفحات يحوّل للرئيسية
  const form = $("searchForm"), input = $("searchInput");
  if (form && input) {
    input.addEventListener("input", () => {
      if (typeof window.onStoreSearch === "function") window.onStoreSearch(input.value);
    });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const q = input.value.trim();
      if (typeof window.onStoreSearch === "function") {
        window.onStoreSearch(q);
        const s = $("products"); if (s) s.scrollIntoView({ behavior: "smooth" });
        input.blur();
      } else {
        location.href = "index.html" + (q ? "?q=" + encodeURIComponent(q) : "") + "#products";
      }
    });
  }

  // روابط التواصل (الفارغة تُخفى)
  let visible = 0;
  document.querySelectorAll("[data-social]").forEach(a => {
    const u = SOCIALS[a.dataset.social];
    if (u) { a.href = u; a.target = "_blank"; a.rel = "noopener"; visible++; } else a.hidden = true;
  });
  if (!visible) { const s = document.querySelector(".socials"); if (s && s.parentElement) s.parentElement.hidden = true; }

  const year = $("year"); if (year) year.textContent = new Date().getFullYear();

  // أزرار عائمة: واتساب (إن وُجد رابطه) + للأعلى
  if (!document.body.classList.contains("admin-body")) {
    const fab = document.createElement("div");
    fab.className = "fab";
    fab.innerHTML = (SOCIALS.whatsapp ? '<a class="wa" href="' + esc(SOCIALS.whatsapp) + '" target="_blank" rel="noopener" aria-label="واتساب">💬</a>' : "") +
      '<button type="button" class="up" aria-label="للأعلى">↑</button>';
    document.body.appendChild(fab);
    const up = fab.querySelector(".up");
    up.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    window.addEventListener("scroll", () => up.classList.toggle("show", window.scrollY > 600), { passive: true });
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initStoreUi);
else initStoreUi();