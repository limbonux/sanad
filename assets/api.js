/* طبقة بيانات + إشعارات لنظام سَند - تعمل بالكامل داخل المتصفح (localStorage)
   لا يوجد سيرفر: كل بيانات المستخدمة (الأرقام، الإعدادات، التنبيهات، المواقع) تُحفظ على جهازها.
   الواجهة (SanadAPI) نفس الدوال القديمة، فكل الصفحات تشتغل بدون تعديل كبير. */

(function () {
  var KEY = "sanad-db-v1";

  function nowSql(offsetMin) {
    var d = new Date(Date.now() + (offsetMin || 0) * 60000);
    return d.toISOString().slice(0, 19).replace("T", " "); // UTC "YYYY-MM-DD HH:MM:SS"
  }

  function seed() {
    return {
      nextId: 100,
      patient: {
        id: 1, name: "أحمد محمد", age: 14, diagnosis: "صرع", file_number: "10482",
        hr_upper_limit: 110, spo2_lower_limit: 92, cancel_window_seconds: 5,
      },
      settings: { auto_detect: 1, notify_guardian: 1, notify_emergency_numbers: 0, sound_alert: 1 },
      devices: [
        { id: 1, kind: "watch", name: "ساعة سَند الذكية", connected: 1, battery_pct: 84 },
        { id: 2, kind: "phone", name: "هاتف المريض", connected: 1, battery_pct: null },
      ],
      contacts: [
        { id: 1, label: "رقم ولي الأمر", phone: "+966 50 123 4567", is_primary: 1, sort_order: 1 },
        { id: 2, label: "رقم قريب (الأخ)", phone: "+966 55 987 6543", is_primary: 0, sort_order: 2 },
        { id: 3, label: "رقم الطوارئ", phone: "997", is_primary: 0, sort_order: 3 },
      ],
      alerts: [
        { id: 1, kind: "seizure", status: "sent", heart_rate: 118, location_label: "الرياض",
          message: "اشتباه نوبة تشنّج - تم إرسال تنبيه لولي الأمر", created_at: nowSql(-60 * 25) },
        { id: 2, kind: "hr_spike", status: "acknowledged", heart_rate: 104, location_label: "الرياض",
          message: "ارتفاع مؤقت في النبض أثناء النوم", created_at: nowSql(-60 * 30) },
        { id: 3, kind: "sync", status: "acknowledged", heart_rate: null, location_label: null,
          message: "تمت مزامنة بيانات الساعة بنجاح", created_at: nowSql(-60 * 2) },
      ],
      locations: [
        { id: 1, label: "حي الملقا، الرياض", latitude: 24.7830, longitude: 46.6217, accuracy_m: 12, recorded_at: nowSql(0) },
        { id: 2, label: "طريق الملك عبدالعزيز", latitude: 24.7580, longitude: 46.6389, accuracy_m: 20, recorded_at: nowSql(-25) },
        { id: 3, label: "المنزل", latitude: 24.7910, longitude: 46.6100, accuracy_m: 8, recorded_at: nowSql(-60 * 24) },
      ],
      vitals: [{ id: 1, heart_rate: 72, spo2: 98, respiration: 16, temperature: 36.7, recorded_at: nowSql(0) }],
    };
  }

  var mem = null; // احتياط لو التخزين محجوب (وضع خاص)
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { if (mem) return mem; }
    var db = seed();
    save(db);
    return db;
  }
  function save(db) {
    mem = db;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* يبقى في الذاكرة */ }
  }
  function newestFirst(list, field) {
    return list.slice().sort(function (a, b) { return a[field] < b[field] ? 1 : a[field] > b[field] ? -1 : 0; });
  }
  function ok(v) { return Promise.resolve(v); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  var API = {
    isOnline: function () { return ok(true); },

    getPatient: function () {
      var db = load();
      var p = clone(db.patient);
      p.devices = clone(db.devices);
      p.settings = clone(db.settings);
      return ok(p);
    },
    postPatient: function (data) {
      var db = load();
      ["hr_upper_limit", "spo2_lower_limit", "cancel_window_seconds", "name", "age", "diagnosis", "file_number"]
        .forEach(function (f) { if (f in data) db.patient[f] = data[f]; });
      save(db);
      return ok(clone(db.patient));
    },
    postSettings: function (data) {
      var db = load();
      Object.keys(db.settings).forEach(function (f) { if (f in data) db.settings[f] = data[f] ? 1 : 0; });
      save(db);
      return ok({ ok: true });
    },

    getContacts: function () {
      return ok(clone(load().contacts.sort(function (a, b) { return a.sort_order - b.sort_order; })));
    },
    addContact: function (label, phone) {
      label = (label || "").trim(); phone = (phone || "").trim();
      if (!label || !phone) return Promise.reject(new Error("label and phone are required"));
      var db = load();
      var max = db.contacts.reduce(function (m, c) { return Math.max(m, c.sort_order); }, 0);
      var c = { id: db.nextId++, label: label, phone: phone, is_primary: 0, sort_order: max + 1 };
      db.contacts.push(c);
      save(db);
      return ok(clone(c));
    },
    updateContact: function (id, label, phone) {
      label = (label || "").trim(); phone = (phone || "").trim();
      if (!label || !phone) return Promise.reject(new Error("label and phone are required"));
      var db = load();
      db.contacts.forEach(function (c) {
        if (String(c.id) === String(id)) { c.label = label; c.phone = phone; }
      });
      save(db);
      return ok({ ok: true });
    },
    deleteContact: function (id) {
      var db = load();
      db.contacts = db.contacts.filter(function (c) { return String(c.id) !== String(id); });
      save(db);
      return ok({ ok: true });
    },

    getAlerts: function (limit) {
      return ok(clone(newestFirst(load().alerts, "created_at").slice(0, limit || 20)));
    },
    postAlert: function (data) {
      var db = load();
      var a = {
        id: db.nextId++,
        kind: data.kind || "manual",
        status: data.status || "sent",
        heart_rate: data.heart_rate == null ? null : data.heart_rate,
        latitude: data.latitude == null ? null : data.latitude,
        longitude: data.longitude == null ? null : data.longitude,
        location_label: data.location_label || null,
        message: data.message || "اشتباه نوبة تشنّج - تم إرسال تنبيه لولي الأمر",
        created_at: nowSql(0),
      };
      db.alerts.push(a);
      save(db);
      return ok(clone(a));
    },

    getLocations: function (limit) {
      return ok(clone(newestFirst(load().locations, "recorded_at").slice(0, limit || 20)));
    },
    postLocation: function (data) {
      var db = load();
      var l = {
        id: db.nextId++, label: data.label || "", latitude: data.latitude,
        longitude: data.longitude, accuracy_m: data.accuracy_m, recorded_at: nowSql(0),
      };
      db.locations.push(l);
      save(db);
      return ok(clone(l));
    },

    postVitals: function (data) {
      var db = load();
      db.vitals.push({
        id: db.nextId++, heart_rate: data.heart_rate, spo2: data.spo2,
        respiration: data.respiration, temperature: data.temperature, recorded_at: nowSql(0),
      });
      save(db);
      return ok({ ok: true });
    },

    /* إعادة ضبط كل بيانات التجربة للوضع الأصلي */
    reset: function () {
      save(seed());
      return ok({ ok: true });
    },
  };

  /* يسجّل service worker (لإشعارات تظهر حتى على جوال أندرويد) - بدون سيرفر */
  function swUrl() {
    return location.pathname.indexOf("/app/") !== -1 ? "../sw.js" : "sw.js";
  }
  function registerSW() {
    if (!("serviceWorker" in navigator)) return Promise.reject(new Error("no sw"));
    return navigator.serviceWorker.register(swUrl()).then(function () {
      return navigator.serviceWorker.ready;
    });
  }
  API.enablePush = registerSW;
  API.registerSW = registerSW;

  /* ---------------- الإشعارات ---------------- */
  var Notify = {
    supported: typeof Notification !== "undefined",
    permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",

    request: function () {
      if (!Notify.supported) return Promise.resolve("unsupported");
      if (Notification.permission === "granted" || Notification.permission === "denied") {
        return Promise.resolve(Notification.permission);
      }
      return Notification.requestPermission().then(function (p) {
        Notify.permission = p;
        return p;
      });
    },

    /* إشعار نظام حقيقي (عبر service worker ليعمل على الجوال)، وإلا رسالة داخل الصفحة */
    fire: function (title, body, opts) {
      opts = opts || {};
      var options = {
        body: body,
        icon: opts.icon,
        tag: opts.tag || "sanad-alert",
        requireInteraction: !!opts.requireInteraction,
        vibrate: [300, 150, 300, 150, 300],
        data: { url: opts.url || "app/emergency.html" },
      };
      if (Notify.supported && Notification.permission === "granted") {
        var viaSW = "serviceWorker" in navigator
          ? registerSW().then(function (reg) { return reg.showNotification(title, options); })
          : Promise.reject();
        viaSW.catch(function () {
          try { new Notification(title, options); } catch (e) { Notify.toast(title, body); }
        });
        return true;
      }
      Notify.toast(title, body);
      return false;
    },

    /* رسالة منبثقة داخل الصفحة كبديل عن إشعار النظام */
    toast: function (title, body, kind) {
      var el = document.createElement("div");
      el.className = "sanad-toast" + (kind === "ok" ? " ok" : "");
      el.innerHTML = '<b class="sanad-toast-title"></b><span class="sanad-toast-body"></span>';
      el.querySelector(".sanad-toast-title").textContent = title;
      el.querySelector(".sanad-toast-body").textContent = body;
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add("show"); });
      setTimeout(function () {
        el.classList.remove("show");
        setTimeout(function () { el.remove(); }, 300);
      }, 5000);
    },
  };


  /* ---------------- نوافذ وتنبيهات بتصميم الموقع ---------------- */
  var UI = {
    /* dialog({title, text, fields:[{name,label,value,placeholder,dir,validate}], ok, cancel, danger}) -> Promise(values | true | null) */
    dialog: function (o) {
      return new Promise(function (resolve) {
        var back = document.createElement("div");
        back.className = "sanad-modal-back";
        var box = document.createElement("form");
        box.className = "sanad-modal";
        box.setAttribute("role", "dialog");
        box.noValidate = true;
        var h = document.createElement("div"); h.className = "sanad-modal-title"; h.textContent = o.title; box.appendChild(h);
        if (o.text) { var t = document.createElement("div"); t.className = "sanad-modal-text"; t.textContent = o.text; box.appendChild(t); }
        var inputs = {};
        (o.fields || []).forEach(function (f) {
          var lab = document.createElement("label"); lab.className = "sanad-field";
          var sp = document.createElement("span"); sp.textContent = f.label; lab.appendChild(sp);
          var inp = document.createElement("input");
          inp.type = "text"; inp.value = f.value == null ? "" : f.value;
          inp.placeholder = f.placeholder || ""; inp.autocomplete = "off";
          if (f.dir) inp.dir = f.dir;
          if (f.inputmode) inp.inputMode = f.inputmode;
          lab.appendChild(inp); box.appendChild(lab); inputs[f.name] = inp;
        });
        var err = document.createElement("div"); err.className = "sanad-modal-err"; box.appendChild(err);
        var row = document.createElement("div"); row.className = "sanad-modal-actions";
        var ok = document.createElement("button"); ok.type = "submit";
        ok.className = "sanad-btn" + (o.danger ? " danger" : ""); ok.textContent = o.ok || "حفظ";
        var no = document.createElement("button"); no.type = "button"; no.className = "sanad-btn ghost"; no.textContent = o.cancel || "إلغاء";
        row.appendChild(ok); row.appendChild(no); box.appendChild(row);
        back.appendChild(box); document.body.appendChild(back);
        requestAnimationFrame(function () { back.classList.add("show"); });
        var first = box.querySelector("input"); if (first) { first.focus(); first.select(); }
        function close(v) {
          document.removeEventListener("keydown", onKey);
          back.classList.remove("show");
          setTimeout(function () { back.remove(); }, 200);
          resolve(v);
        }
        function onKey(e) { if (e.key === "Escape") close(null); }
        document.addEventListener("keydown", onKey);
        no.addEventListener("click", function () { close(null); });
        back.addEventListener("mousedown", function (e) { if (e.target === back) close(null); });
        box.addEventListener("submit", function (e) {
          e.preventDefault();
          var vals = {}, msg = "";
          (o.fields || []).forEach(function (f) {
            vals[f.name] = inputs[f.name].value.trim();
            if (msg) return;
            if (!vals[f.name]) msg = "الرجاء تعبئة: " + f.label;
            else if (f.validate) msg = f.validate(vals[f.name]) || "";
          });
          if (msg) { err.textContent = msg; return; }
          close(o.fields && o.fields.length ? vals : true);
        });
      });
    },
    confirm: function (title, text, okLabel) {
      return UI.dialog({ title: title, text: text, ok: okLabel || "تأكيد", danger: true }).then(function (v) { return !!v; });
    },
    /* toast نجاح/خطأ بتصميم الموقع */
    toast: function (title, body, kind) {
      Notify.toast(title, body || "", kind);
    },
  };

  window.SanadAPI = API;
  window.SanadUI = UI;
  window.SanadNotify = Notify;
})();
