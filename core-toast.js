/* ============================================================
   CORE-TOAST.JS — Modul Notifikasi Toast (Lego Brick #9)
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day (IP, RO, dan outlet baru)

   Pengganti pesan singkat di pojok bawah layar (mis. "Nota
   tersimpan ✓", "Nomor WA disimpan") yang sebelumnya HTML+CSS+JS
   nya ditulis ulang manual di tiap app. Modul ini TIDAK perlu HTML
   tambahan — elemen toast dibuat & disuntik sendiri ke <body>.

   CARA PAKAI:
   1. <script src="core-toast.js"></script>
   2. Panggil di mana saja, kapan saja, tidak perlu init():
        CoreToast.show('Nota tersimpan ✓');

      Durasi tampil bisa diatur (default 2800ms):
        CoreToast.show('Memproses...', 1500);
   ============================================================ */
(function(){

  let el = null, timer = null;

  function injectDOM(){
    if(document.getElementById('coretoast-el')) return;

    const style = document.createElement('style');
    style.textContent = `
      #coretoast-el{position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);
        background:#1e1e1e;color:#fff;padding:11px 18px;border-radius:10px;
        font-size:13px;font-weight:600;max-width:88%;text-align:center;
        box-shadow:0 4px 16px rgba(0,0,0,.2);opacity:0;pointer-events:none;
        transition:opacity .2s,transform .2s;z-index:10000;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
      #coretoast-el.show{opacity:1;transform:translateX(-50%) translateY(0);}
    `;
    document.head.appendChild(style);

    el = document.createElement('div');
    el.id = 'coretoast-el';
    document.body.appendChild(el);
  }

  function show(msg, durasi){
    injectDOM();
    el.textContent = msg;
    el.classList.add('show');
    if(timer) clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('show'), durasi || 2800);
  }

  window.CoreToast = { show };
})();
