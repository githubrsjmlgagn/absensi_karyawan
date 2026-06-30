/* ============================================================
   CORE-PIN.JS — Modul Kunci PIN (Lego Brick #1)
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day (IP, RO, dan outlet baru)

   CARA PAKAI di index.html app baru:
   1. Tambahkan sebelum penutup </body>:
        <script src="core-pin.js"></script>
   2. Panggil sekali saat app mulai, contoh:
        CorePin.init({
          storageKey: 'cda_pin',         // nama unik per app, boleh sama antar app 1 outlet
          onUnlocked: function(tujuan){  // dipanggil saat PIN benar / berhasil dibuat
            bukaPengaturan();             // ganti dengan fungsi panel Anda sendiri
          }
        });
   3. Untuk membuka kunci (misal saat klik ikon gerigi):
        CorePin.open();
   4. Untuk ganti PIN dari dalam panel Pengaturan:
        CorePin.change();

   Modul ini TIDAK perlu HTML tambahan apa pun — semua tampilan
   (overlay, numpad, titik PIN) dibuat otomatis oleh modul ini.
   ============================================================ */
(function(){

  let cfg = {
    storageKey: 'core_pin',
    onUnlocked: function(){},
    judulBuat: 'Buat PIN',
    subBuat: 'Buat PIN 4 digit untuk mengunci Pengaturan',
    judulBuka: 'Pengaturan',
    subBuka: 'Masukkan PIN untuk membuka Pengaturan'
  };

  let buffer = '', sementara = '', mode = '', tujuan = '';
  let percobaanSalah = 0, blokSampai = 0;
  let el = {}; // referensi elemen DOM, diisi saat injectDOM()

  function getPIN(){ return localStorage.getItem(cfg.storageKey) || ''; }
  function sudahAdaPIN(){ return !!getPIN(); }

  /* ---- buat tampilan sekali saja, suntik ke <body> ---- */
  function injectDOM(){
    if(document.getElementById('corepin-overlay')) return; // sudah ada, jangan dobel

    const style = document.createElement('style');
    style.textContent = `
      #corepin-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
        display:none;align-items:center;justify-content:center;padding:20px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
      #corepin-overlay.show{display:flex;}
      .corepin-box{background:#fff;border-radius:20px;padding:28px 22px;width:100%;
        max-width:320px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.18);}
      .corepin-box h3{margin:0 0 4px;font-size:17px;color:#7A1E1E;}
      .corepin-box p{margin:0 0 18px;font-size:13px;color:#8a8a8a;line-height:1.5;}
      .corepin-dots{display:flex;justify-content:center;gap:12px;margin-bottom:18px;}
      .corepin-dot{width:13px;height:13px;border-radius:50%;border:2px solid #e8e4e0;
        background:#fff;transition:background .15s;}
      .corepin-dot.isi{background:#7A1E1E;border-color:#7A1E1E;}
      .corepin-dot.salah{background:#b83228;border-color:#b83228;}
      .corepin-numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;}
      .corepin-numpad button{padding:15px;border:1.5px solid #e8e4e0;border-radius:10px;
        background:#fff;font-size:20px;font-weight:700;cursor:pointer;color:#1e1e1e;}
      .corepin-numpad button:active{background:#f0ece8;}
      .corepin-numpad .corepin-del{font-size:16px;color:#8a8a8a;}
      .corepin-numpad .corepin-kosong{border:none;background:none;cursor:default;}
      .corepin-err{color:#b83228;font-size:12px;font-weight:600;min-height:16px;margin-bottom:8px;}
      .corepin-batal{background:none;border:none;color:#8a8a8a;font-size:13px;cursor:pointer;
        text-decoration:underline;padding:4px;}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'corepin-overlay';
    wrap.innerHTML = `
      <div class="corepin-box">
        <h3 id="corepin-judul">Pengaturan</h3>
        <p id="corepin-sub">Masukkan PIN</p>
        <div class="corepin-dots" id="corepin-dots">
          <div class="corepin-dot" id="corepin-d0"></div>
          <div class="corepin-dot" id="corepin-d1"></div>
          <div class="corepin-dot" id="corepin-d2"></div>
          <div class="corepin-dot" id="corepin-d3"></div>
        </div>
        <div class="corepin-err" id="corepin-err"></div>
        <div class="corepin-numpad">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-n="${n}">${n}</button>`).join('')}
          <button class="corepin-kosong" disabled></button>
          <button data-n="0">0</button>
          <button class="corepin-del" data-del="1">⌫</button>
        </div>
        <button class="corepin-batal" data-batal="1">Batal</button>
      </div>`;
    document.body.appendChild(wrap);

    // event delegation — satu listener untuk semua tombol numpad
    wrap.addEventListener('click', e=>{
      const t = e.target;
      if(t.dataset.n) input(t.dataset.n);
      else if(t.dataset.del) hapus();
      else if(t.dataset.batal) tutup();
    });

    el = {
      overlay: wrap,
      judul: document.getElementById('corepin-judul'),
      sub: document.getElementById('corepin-sub'),
      err: document.getElementById('corepin-err')
    };
  }

  function renderDots(){
    for(let i=0;i<4;i++){
      const d = document.getElementById('corepin-d'+i);
      d.classList.toggle('isi', i<buffer.length);
      d.classList.remove('salah');
    }
  }
  function renderSalah(){
    for(let i=0;i<4;i++) document.getElementById('corepin-d'+i).classList.add('salah');
    setTimeout(()=>{ buffer=''; renderDots(); }, 500);
  }

  function input(d){
    if(buffer.length>=4) return;
    buffer+=d; renderDots();
    if(buffer.length===4) setTimeout(proses,120);
  }
  function hapus(){ buffer=buffer.slice(0,-1); renderDots(); el.err.textContent=''; }

  function tutup(){
    el.overlay.classList.remove('show');
    buffer=''; sementara=''; mode='';
  }

  function proses(){
    if(mode==='buat'){
      sementara = buffer; buffer='';
      mode = 'konfirmasi';
      el.judul.textContent='Konfirmasi PIN';
      el.sub.textContent='Masukkan ulang PIN untuk konfirmasi';
      el.err.textContent='';
      renderDots();
    } else if(mode==='konfirmasi'){
      if(buffer===sementara){
        localStorage.setItem(cfg.storageKey, buffer);
        tutup();
        cfg.onUnlocked(tujuan);
      } else {
        el.err.textContent='PIN tidak sama, ulangi';
        renderSalah();
        setTimeout(()=>{
          mode='buat'; sementara='';
          el.judul.textContent=cfg.judulBuat;
          el.sub.textContent=cfg.subBuat;
          el.err.textContent='';
        },600);
      }
    } else if(mode==='buka'){
      if(buffer===getPIN()){
        percobaanSalah=0; tutup();
        cfg.onUnlocked(tujuan);
      } else {
        percobaanSalah++; renderSalah();
        if(percobaanSalah>=3){
          blokSampai = Date.now()+30000;
          el.err.textContent='3× salah. Tunggu 30 detik.';
          setTimeout(tutup,1000);
        } else {
          el.err.textContent = `PIN salah (${percobaanSalah}/3)`;
        }
      }
    }
  }

  /* ---- API publik ---- */
  function init(opts){
    cfg = Object.assign({}, cfg, opts||{});
    injectDOM();
  }

  function open(tujuanBaru){
    injectDOM(); // jaga-jaga kalau init() lupa dipanggil
    tujuan = tujuanBaru||'';
    buffer=''; percobaanSalah=0;
    if(!sudahAdaPIN()){
      mode='buat';
      el.judul.textContent=cfg.judulBuat;
      el.sub.textContent=cfg.subBuat;
    } else {
      const now=Date.now();
      if(blokSampai>now){
        const detik=Math.ceil((blokSampai-now)/1000);
        alert(`Terlalu banyak percobaan. Coba lagi dalam ${detik} detik.`);
        return;
      }
      mode='buka';
      el.judul.textContent=cfg.judulBuka;
      el.sub.textContent=cfg.subBuka;
    }
    el.err.textContent='';
    renderDots();
    el.overlay.classList.add('show');
  }

  function change(){
    injectDOM();
    buffer=''; sementara=''; mode='buat';
    el.judul.textContent='Ganti PIN';
    el.sub.textContent='Masukkan PIN baru 4 digit';
    el.err.textContent='';
    renderDots();
    el.overlay.classList.add('show');
  }

  window.CorePin = { init, open, change, sudahAdaPIN };
})();
