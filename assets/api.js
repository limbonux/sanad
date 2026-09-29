/* عميل API + الإشعارات لنظام سَند
   يحاول الاتصال بالسيرفر المحلي (backend/server.py على localhost:8000).
   إذا كان غير متاح (مثل نسخة GitHub Pages بدون سيرفر محلي شغّال)،
   تتوقف كل الدوال بهدوء وتُبقي الصفحة على بياناتها التجريبية الثابتة. */

(function () {
  var BASE = "http://localhost:8000";
  var TIMEOUT_MS = 1200;
  var onlineCache = null; // null = not checked yet, true/false = checked

  function withTimeout(promise, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms);
    return { signal: ctrl.signal, clear: function () { clearTimeout(timer); } };
  }

  function req(path, opts) {
    opts = opts || {};
    var t = withTimeout(null, TIMEOUT_MS);
    var init = {
      method: opts.method || "GET",
      signal: t.signal,
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    };
    return fetch(BASE + path, init)
      .then(function (r) {
        t.clear();
        if (!r.ok) throw new Error("http " + r.status);
        return r.status === 204 ? null : r.json();
      })
      .catch(function (err) {
        t.clear();
        throw err;
      });
  }

  function isOnline() {
    if (onlineCache !== null) return Promise.resolve(onlineCache);
    return req("/api/ping")
      .then(function () { onlineCache = true; return true; })
      .catch(function () { onlineCache = false; return false; });
  }

  var API = {
    isOnline: isOnline,
    getPatient: function () { return req("/api/patient"); },
    getContacts: function () { return req("/api/contacts"); },
    getAlerts: function (limit) { return req("/api/alerts?limit=" + (limit || 20)); },
    getLocations: function (limit) { return req("/api/locations?limit=" + (limit || 20)); },
    postAlert: function (data) { return req("/api/alerts", { method: "POST", body: data }); },
    postVitals: function (data) { return req("/api/vitals", { method: "POST", body: data }); },
    postSettings: function (data) { return req("/api/settings", { method: "POST", body: data }); },
    postPatient: function (data) { return req("/api/patient", { method: "POST", body: data }); },
    addContact: function (label, phone) { return req("/api/contacts", { method: "POST", body: { label: label, phone: phone } }); },
    deleteContact: function (id) { return req("/api/contacts/" + id, { method: "DELETE" }); },
    postLocation: function (data) { return req("/api/locations", { method: "POST", body: data }); },
  };

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

    /* يعرض إشعار نظام حقيقي إن سُمح، وإلا رسالة داخل الصفحة كبديل */
    fire: function (title, body, opts) {
      opts = opts || {};
      if (Notify.supported && Notification.permission === "granted") {
        try {
          var n = new Notification(title, {
            body: body,
            icon: opts.icon,
            tag: opts.tag || "sanad-alert",
            requireInteraction: !!opts.requireInteraction,
          });
          if (opts.onclick) n.onclick = opts.onclick;
          return n;
        } catch (e) { /* يقع أحيانًا لو الصفحة مفتوحة عبر file:// - نكمل للبديل */ }
      }
      Notify.toast(title, body);
      return null;
    },

    /* رسالة منبثقة داخل الصفحة كبديل عن إشعار النظام */
    toast: function (title, body) {
      var el = document.createElement("div");
      el.className = "sanad-toast";
      el.innerHTML =
        '<b class="sanad-toast-title"></b><span class="sanad-toast-body"></span>';
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

  window.SanadAPI = API;
  window.SanadNotify = Notify;
})();
