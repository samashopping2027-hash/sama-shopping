/* محاكي حملات فيسبوك — تقديرات قابلة للتعديل، وليست نتائج مضمونة */
(function () {
  var root = document.getElementById('adsSim');
  if (!root) return;
  var CUR = 'د.م';

  var OBJ = { // افتراضات تقريبية: عدّلها بأرقام حملاتك الحقيقية
    conversions: { name: 'مبيعات (Conversions)', cpm: 30, ctr: 1.1 },
    traffic:     { name: 'زيارات (Traffic)',      cpm: 22, ctr: 1.6 },
    messages:    { name: 'رسائل (Messages)',      cpm: 26, ctr: 1.3 },
    engagement:  { name: 'تفاعل (Engagement)',    cpm: 14, ctr: 2.2 }
  };
  var SCEN = {
    low:  { label: 'متشائم', cpm: 1.3, ctr: .7, cr: .7 },
    mid:  { label: 'واقعي',  cpm: 1,   ctr: 1,  cr: 1 },
    high: { label: 'متفائل', cpm: .8,  ctr: 1.3, cr: 1.3 }
  };

  root.innerHTML =
  '<p class="ads-note">هذه المحاكاة تقديرات مبنية على الافتراضات التي تدخلها، وليست نتائج مضمونة. نتائج فيسبوك الحقيقية تتغير حسب المنتج والإعلان والجمهور والمنافسة. استبدل الأرقام الافتراضية بأرقام حملاتك السابقة لتحصل على تقدير أدق.</p>' +
  '<div class="ads-grid">' +
   '<form class="panel" id="adsForm" onsubmit="return false">' +
    '<h3>إعدادات الحملة</h3>' +
    '<div class="field"><label for="a_prod">المنتج</label><select id="a_prod"><option value="">إدخال يدوي</option></select></div>' +
    '<div class="field"><label for="a_obj">هدف الحملة</label><select id="a_obj"></select></div>' +
    '<div class="field-row"><div class="field"><label for="a_budget">الميزانية اليومية (' + CUR + ')</label><input id="a_budget" type="number" inputmode="decimal" min="1" value="100"></div>' +
    '<div class="field"><label for="a_days">المدة (أيام)</label><input id="a_days" type="number" inputmode="numeric" min="1" max="90" value="7"></div></div>' +
    '<h3>المنتج</h3>' +
    '<div class="field-row"><div class="field"><label for="a_price">سعر البيع</label><input id="a_price" type="number" inputmode="decimal" min="1" value="199"></div>' +
    '<div class="field"><label for="a_cost">سعر التكلفة</label><input id="a_cost" type="number" inputmode="decimal" min="0" value="80"></div></div>' +
    '<div class="field"><label for="a_ship">تكلفة التوصيل والتغليف للطلب</label><input id="a_ship" type="number" inputmode="decimal" min="0" value="25"></div>' +
    '<details><summary>افتراضات متقدمة</summary>' +
    '<div class="field-row"><div class="field"><label for="a_cpm">CPM (تكلفة 1000 ظهور)</label><input id="a_cpm" type="number" inputmode="decimal" min="1"></div>' +
    '<div class="field"><label for="a_ctr">CTR (٪ نقر)</label><input id="a_ctr" type="number" inputmode="decimal" step="0.1" min="0.1"></div></div>' +
    '<div class="field-row"><div class="field"><label for="a_land">وصول الزائر للصفحة (٪)</label><input id="a_land" type="number" inputmode="decimal" value="75"></div>' +
    '<div class="field"><label for="a_cr">تحويل الزائر إلى طلب (٪)</label><input id="a_cr" type="number" inputmode="decimal" step="0.1" value="3"></div></div>' +
    '<div class="field-row"><div class="field"><label for="a_conf">تأكيد الطلب بالهاتف (٪)</label><input id="a_conf" type="number" inputmode="decimal" value="65"></div>' +
    '<div class="field"><label for="a_deliv">نسبة التسليم الناجح (٪)</label><input id="a_deliv" type="number" inputmode="decimal" value="80"></div></div>' +
    '<button type="button" class="btn btn-ghost btn-sm" id="a_reset">استعادة الافتراضات</button> ' +
    '<button type="button" class="btn btn-main btn-sm" id="a_real">استخدم أرقام متجري الفعلية</button>' +
    '<small class="hint" id="a_realMsg"></small>' +
    '</details></form>' +
   '<div class="ads-out">' +
    '<div class="ads-tabs" id="adsTabs"></div>' +
    '<div class="ads-kpis" id="adsKpis"></div>' +
    '<div class="ads-verdict" id="adsVerdict"></div>' +
    '<div class="panel" style="margin-top:14px"><h3>مسار الطلب</h3><ul class="ads-funnel" id="adsFunnel"></ul></div>' +
    '<div class="panel" style="margin-top:14px"><h3>الربح التراكمي حسب الأيام</h3><div id="adsChart"></div></div>' +
    '<div class="panel" style="margin-top:14px"><h3>مقارنة السيناريوهات</h3><div class="table-wrap"><table class="table"><thead><tr><th>المؤشر</th><th>متشائم</th><th>واقعي</th><th>متفائل</th></tr></thead><tbody id="adsCmp"></tbody></table></div></div>' +
   '</div></div>';

  var $ = function (id) { return document.getElementById(id); };
  var n = function (id) { var v = parseFloat($(id).value); return isFinite(v) && v >= 0 ? v : 0; };
  var fmt = function (x, d) { return (x || 0).toLocaleString('en-US', { maximumFractionDigits: d == null ? 0 : d }); };
  var money = function (x) { return fmt(x) + ' ' + CUR; };

  var sel = $('a_obj');
  Object.keys(OBJ).forEach(function (k) { sel.add(new Option(OBJ[k].name, k)); });
  function applyObj() { $('a_cpm').value = OBJ[sel.value].cpm; $('a_ctr').value = OBJ[sel.value].ctr; }
  applyObj();

  var active = 'mid';
  var tabs = $('adsTabs');
  Object.keys(SCEN).forEach(function (k) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = SCEN[k].label; b.dataset.k = k;
    b.onclick = function () { active = k; update(); }; tabs.appendChild(b);
  });

  function calc(s) {
    var days = Math.max(1, Math.min(90, Math.round(n('a_days')))), budget = n('a_budget');
    var price = n('a_price'), unit = price - n('a_cost') - n('a_ship');
    var spend = budget * days;
    var cpm = n('a_cpm') * s.cpm, ctr = n('a_ctr') * s.ctr / 100, cr = n('a_cr') * s.cr / 100;
    var imp = cpm ? spend / cpm * 1000 : 0, clicks = imp * ctr, visitors = clicks * n('a_land') / 100;
    var orders = visitors * cr, conf = orders * n('a_conf') / 100, deliv = conf * n('a_deliv') / 100;
    var revenue = deliv * price, profit = deliv * unit - spend;
    return { days: days, budget: budget, price: price, unit: unit, spend: spend, imp: imp, clicks: clicks, visitors: visitors,
      orders: orders, conf: conf, deliv: deliv, revenue: revenue, profit: profit,
      cpc: clicks ? spend / clicks : 0, cpa: orders ? spend / orders : 0,
      roas: spend ? revenue / spend : 0, beRoas: unit > 0 ? price / unit : Infinity,
      beCpa: unit > 0 ? unit * (n('a_conf') / 100) * (n('a_deliv') / 100) : 0 };
  }

  function kpi(label, val, cls) { return '<div class="stat ' + (cls || '') + '"><span class="stat-num">' + val + '</span><span class="stat-label">' + label + '</span></div>'; }

  function chart(r, s) {
    var W = 560, H = 240, p = 34, pts = [], cum = 0, d;
    var gross = r.profit + r.spend, sumW = 0, w = [];
    for (d = 1; d <= r.days; d++) { w.push(d <= 3 ? .7 : 1); sumW += w[d - 1]; } // أول 3 أيام مرحلة تعلّم بكفاءة أقل
    for (d = 1; d <= r.days; d++) { cum += gross * w[d - 1] / sumW - r.spend / r.days; pts.push(cum); } // النهاية = الربح الحسابي تمامًا
    var min = Math.min(0, Math.min.apply(null, pts)), max = Math.max(0, Math.max.apply(null, pts));
    if (max === min) max = min + 1;
    var X = function (i) { return p + (pts.length > 1 ? i / (pts.length - 1) : 0) * (W - p * 1.6); };
    var Y = function (v) { return H - p - (v - min) / (max - min) * (H - p * 1.8); };
    var path = pts.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
    var col = r.profit >= 0 ? '#22c08f' : '#ff5a6e';
    return '<svg class="ads-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="الربح التراكمي">' +
      '<line x1="' + p + '" x2="' + (W - 8) + '" y1="' + Y(0) + '" y2="' + Y(0) + '" stroke="#9aa3c7" stroke-dasharray="4 4"/>' +
      '<path d="' + path + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<text x="' + p + '" y="' + (H - 8) + '">اليوم 1</text><text x="' + (W - 8) + '" y="' + (H - 8) + '" text-anchor="end">اليوم ' + r.days + '</text>' +
      '<text x="' + p + '" y="16">' + money(max) + '</text><text x="' + p + '" y="' + (Y(0) - 6) + '">0</text></svg>';
  }

  function update() {
    var r = calc(SCEN[active]);
    [].forEach.call(tabs.children, function (b) { b.classList.toggle('on', b.dataset.k === active); });
    var ok = r.profit > 0;
    $('adsKpis').innerHTML =
      kpi('الإنفاق الإعلاني', money(r.spend)) + kpi('الإيراد (طلبات مسلّمة)', money(r.revenue)) +
      kpi('صافي الربح', money(r.profit), ok ? 'good' : 'bad') +
      kpi('ROAS', fmt(r.roas, 2) + 'x', r.roas >= r.beRoas ? 'good' : 'bad') +
      kpi('تكلفة الطلب (CPA)', money(r.cpa)) + kpi('عدد الطلبات', fmt(r.orders));
    var v = $('adsVerdict');
    if (r.unit <= 0) { v.className = 'ads-verdict bad'; v.textContent = 'هامش الربح للقطعة سالب أو صفر: السعر لا يغطي التكلفة والتوصيل، فأي إعلان سيزيد الخسارة.'; }
    else if (ok) { v.className = 'ads-verdict good'; v.textContent = 'ضمن هذا السيناريو الحملة رابحة. نقطة التعادل: ROAS ' + fmt(r.beRoas, 2) + 'x، وأقصى تكلفة للطلب الواحد ≈ ' + money(r.beCpa) + '.'; }
    else { v.className = 'ads-verdict ' + (r.profit > -r.spend * .25 ? 'mid' : 'bad'); v.textContent = 'ضمن هذا السيناريو الحملة خاسرة. تحتاج ROAS ' + fmt(r.beRoas, 2) + 'x للتعادل، وأقصى تكلفة للطلب ≈ ' + money(r.beCpa) + '، بينما تقديرك الحالي ' + money(r.cpa) + '.'; }
    var max = Math.max(r.imp, 1);
    var rows = [['ظهور', r.imp], ['نقرات', r.clicks], ['زوار', r.visitors], ['طلبات', r.orders], ['مؤكدة', r.conf], ['مسلّمة', r.deliv]];
    $('adsFunnel').innerHTML = rows.map(function (x, i) {
      var w = i === 0 ? 100 : Math.max(2, Math.sqrt(x[1] / max) * 100); // جذر لتظهر القيم الصغيرة
      return '<li><span>' + x[0] + '</span><span class="bar"><i style="width:' + w + '%"></i></span><b>' + fmt(x[1], x[1] < 10 ? 1 : 0) + '</b></li>';
    }).join('');
    $('adsChart').innerHTML = chart(r, SCEN[active]);
    var all = Object.keys(SCEN).map(function (k) { return calc(SCEN[k]); });
    var line = function (t, f) { return '<tr><td>' + t + '</td>' + all.map(function (x) { return '<td>' + f(x) + '</td>'; }).join('') + '</tr>'; };
    $('adsCmp').innerHTML = line('الطلبات', function (x) { return fmt(x.orders); }) + line('CPA', function (x) { return money(x.cpa); }) +
      line('ROAS', function (x) { return fmt(x.roas, 2) + 'x'; }) + line('صافي الربح', function (x) { return '<b style="color:' + (x.profit >= 0 ? 'var(--mint)' : 'var(--coral)') + '">' + money(x.profit) + '</b>'; });
  }

  $('adsForm').addEventListener('input', update);
  sel.addEventListener('change', function () { applyObj(); update(); });
  $('a_reset').onclick = function () { applyObj(); $('a_land').value = 75; $('a_cr').value = 3; $('a_conf').value = 65; $('a_deliv').value = 80; update(); };

  // ----- ربط البيانات الحقيقية (يستعمل دوال script.js إن وُجدت) -----
  var prodMap = {};
  var costKey = function (id) { return 'taja_cost_' + id; };
  function fillProducts(list) {
    if (!Array.isArray(list)) return;
    var cur = $('a_prod').value;
    var o = '<option value="">إدخال يدوي</option>';
    prodMap = {};
    list.forEach(function (p) {
      prodMap[p.id] = p;
      o += '<option value="' + String(p.id).replace(/"/g, '') + '">' +
        String(p.name).replace(/[<>&"]/g, '') + '</option>';
    });
    $('a_prod').innerHTML = o;
    if (cur && prodMap[cur]) $('a_prod').value = cur;
  }
  function refreshData() {
    try { fillProducts(JSON.parse(sessionStorage.getItem('taja_a_products'))); } catch (e) {}
    try { if (typeof getProducts === 'function') getProducts().then(fillProducts).catch(function () {}); } catch (e) {}
  }
  $('a_prod').addEventListener('change', function () {
    var p = prodMap[this.value];
    if (p) {
      $('a_price').value = Number(p.price) || 0;
      var c = null; try { c = localStorage.getItem(costKey(p.id)); } catch (e) {}
      if (c !== null) $('a_cost').value = c;
    }
    update();
  });
  $('a_cost').addEventListener('change', function () {
    var id = $('a_prod').value;
    if (id) { try { localStorage.setItem(costKey(id), this.value); } catch (e) {} }
  });
  $('a_real').addEventListener('click', function () {
    var msg = $('a_realMsg');
    if (typeof getOrders !== 'function') { msg.textContent = 'هذه الميزة تعمل داخل لوحة التحكم بعد تسجيل الدخول.'; return; }
    msg.textContent = 'جاري قراءة طلباتك...';
    var go;
    try { go = getOrders(); } catch (e) { msg.textContent = 'سجّل الدخول أولًا.'; return; }
    go.then(function (list) {
      var conf = 0, canc = 0;
      list.forEach(function (o) {
        if (o.status === 'cancelled') canc++;
        else if (o.status === 'confirmed' || o.status === 'shipped' || o.status === 'delivered') conf++;
      });
      var decided = conf + canc;
      if (decided < 20) { msg.textContent = 'عدد الطلبات المحسومة ' + decided + ' فقط. نحتاج 20 طلبًا على الأقل لنتيجة موثوقة، فاستخدم تقديرك مؤقتًا.'; return; }
      $('a_conf').value = Math.round(conf / decided * 100);
      update();
      msg.textContent = 'نسبة التأكيد من ' + decided + ' طلبًا محسومًا: ' + $('a_conf').value + '%. نسبة التسليم الناجح لا تُحسب لأن النظام لا يميّز الإلغاء بعد الشحن، فأدخلها بنفسك.';
    }).catch(function (e) { msg.textContent = e.message || 'تعذر جلب الطلبات'; });
  });
  window.adsSimRefresh = refreshData;
  refreshData();
  update();
})();
