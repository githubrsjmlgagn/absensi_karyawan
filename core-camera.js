/* ============================================================
   CORE-CAMERA.JS — Modul Ambil Foto & Bagikan (Lego Brick #14)
   v2 — tambahan: opts.tujuanWa (lihat poin di bawah) untuk app yang
   butuh foto langsung terarah ke satu nomor/grup WA tertentu, bukan
   cuma share sheet umum. Perilaku lama (tanpa tujuanWa) TIDAK berubah.
   ------------------------------------------------------------
   Dipakai oleh: app yang butuh foto bukti dari kamera HP (mis.
   foto bukti absen masuk/pulang, foto bukti serah-terima barang,
   dst), lalu otomatis ditawarkan untuk dibagikan (WhatsApp/aplikasi
   lain lewat Web Share API), dengan fallback unduh ke galeri kalau
   share atau kamera tidak didukung di HP itu.

   Modul ini TIDAK perlu HTML tambahan — tampilan kamera (overlay,
   video preview, tombol) dibuat & disuntik sendiri ke <body>, sama
   seperti CorePin/CoreConfirm/CoreToast.

   PENTING: foto ini sifatnya PELENGKAP/opsional bagi user (boleh
   ditekan "Lewati"). Simpan dulu data penting Anda (absen, nota,
   dll) SEBELUM memanggil CoreCamera.tangkap(), supaya kalau user
   melewati foto atau kamera gagal, data utama tetap aman tersimpan.

   CARA PAKAI (selalu pakai "await", karena ini async):

     const hasil = await CoreCamera.tangkap({
       judul: 'Foto Absen Masuk',
       namaFile: `Absen-${nama}-${jam.replace(':','')}.jpg`,
       caption: `${nama} · Absen Masuk · ${jam} · Shift ${shiftNama}`
     });
     // hasil.status -> 'dibagikan' | 'diunduh' | 'dilewati' | 'tanpaKamera'

   (BARU v2) Kalau Anda mau foto SELALU terarah ke 1 nomor/grup WA
   tertentu (bukan dipilih bebas lewat share sheet), isi opts.tujuanWa
   dengan nomor WA tujuan (format 62xxx, tanpa '+'). Modul akan SELALU
   mengunduh foto dulu (supaya ada di galeri HP), lalu langsung membuka
   WhatsApp ke nomor itu dengan teks caption siap kirim — user tinggal
   lampirkan foto dari galeri secara manual (keterbatasan teknis wa.me:
   link WhatsApp cuma bisa isi teks otomatis, tidak bisa lampir file):

     await CoreCamera.tangkap({
       judul: 'Foto Absen Masuk',
       namaFile: `Absen-${nama}-${jam.replace(':','')}.jpg`,
       caption: `${nama} · Absen Masuk · ${jam} · Shift ${shiftNama}`,
       tujuanWa: '6281234567890'   // kosongkan/jangan diisi utk share sheet biasa
     });

   Kalau HP tidak punya kamera / izin ditolak, modal otomatis
   menampilkan pesan error dan tombol "Lewati" tetap bisa dipakai
   user untuk lanjut tanpa foto.
   ============================================================ */
(function(){

  let el = {}, stream = null, resolveFn = null, ctxNow = null;

  function injectDOM(){
    if(document.getElementById('corecamera-overlay')) return;

    const style = document.createElement('style');
    style.textContent = `
      #corecamera-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9997;
        display:none;align-items:center;justify-content:center;padding:20px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
      #corecamera-overlay.show{display:flex;}
      .corecamera-box{background:#fff;border-radius:20px;padding:18px;width:100%;
        max-width:360px;box-shadow:0 8px 40px rgba(0,0,0,.18);}
      .corecamera-box h3{margin:0 0 12px;font-size:16px;color:#7A1E1E;text-align:center;}
      .corecamera-video{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:12px;
        background:#000;margin-bottom:12px;transform:scaleX(-1);}
      .corecamera-err{color:#b83228;font-size:13px;text-align:center;margin-bottom:12px;}
      .corecamera-footer{display:flex;gap:8px;}
      .corecamera-footer button{flex:1;padding:13px;border:none;border-radius:10px;
        font-weight:700;font-size:15px;cursor:pointer;}
      .cc-cam-skip{background:#fff;border:1.5px solid #e8e4e0;color:#1e1e1e;}
      .cc-cam-shoot{background:#7A1E1E;color:#fff;}
      .cc-cam-shoot:disabled{opacity:.5;cursor:not-allowed;}
      .cc-cam-hidden{display:none!important;}
    `;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.id = 'corecamera-overlay';
    wrap.innerHTML = `
      <div class="corecamera-box">
        <h3 id="cc-cam-judul">Ambil Foto</h3>
        <video id="cc-cam-video" class="corecamera-video" autoplay muted playsinline></video>
        <div id="cc-cam-err" class="corecamera-err cc-cam-hidden">Kamera tidak tersedia di HP ini.</div>
        <div class="corecamera-footer">
          <button class="cc-cam-skip" id="cc-cam-skip" type="button">Lewati</button>
          <button class="cc-cam-shoot" id="cc-cam-shoot" type="button" disabled>Ambil Gambar</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    el = {
      overlay: wrap,
      judul: document.getElementById('cc-cam-judul'),
      video: document.getElementById('cc-cam-video'),
      err: document.getElementById('cc-cam-err'),
      btnSkip: document.getElementById('cc-cam-skip'),
      btnShoot: document.getElementById('cc-cam-shoot')
    };

    el.btnSkip.addEventListener('click', () => { closeUI(); finish('dilewati'); });
    el.btnShoot.addEventListener('click', jepret);
  }

  function closeUI(){
    if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
    el.video.srcObject = null;
    el.overlay.classList.remove('show');
  }

  function finish(status){
    const fn = resolveFn;
    resolveFn = null; ctxNow = null;
    if(fn) fn({ status });
  }

  function unduhFallback(blob, namaFile){
    try{
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = namaFile;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }catch(e){ /* abaikan, foto memang opsional */ }
  }

  async function jepret(){
    const ctx = ctxNow;
    if(!ctx || !stream || !el.video.videoWidth){ closeUI(); finish('tanpaKamera'); return; }

    const canvas = document.createElement('canvas');
    canvas.width = el.video.videoWidth;
    canvas.height = el.video.videoHeight;
    canvas.getContext('2d').drawImage(el.video, 0, 0, canvas.width, canvas.height);

    closeUI(); // matikan kamera & tutup modal duluan, baru proses share/unduh

    canvas.toBlob(async (blob) => {
      if(!blob){ finish('tanpaKamera'); return; }

      // (v2) mode terarah: kalau ada tujuanWa, SELALU unduh dulu (supaya
      // foto ada di galeri utk dilampirkan manual), lalu langsung buka
      // WhatsApp ke nomor itu dgn teks caption siap kirim. Tidak pakai
      // share sheet umum supaya tujuannya pasti & konsisten tiap absen.
      if(ctx.tujuanWa){
        unduhFallback(blob, ctx.namaFile);
        const pesan = encodeURIComponent(ctx.caption || '');
        window.open(`https://wa.me/${ctx.tujuanWa}?text=${pesan}`, '_blank');
        finish('dibagikan');
        return;
      }

      const file = new File([blob], ctx.namaFile, { type:'image/jpeg' });
      let status = 'diunduh';
      try{
        if(navigator.canShare && navigator.canShare({ files:[file] })){
          await navigator.share({ files:[file], title: ctx.caption || '', text: ctx.caption || '' });
          status = 'dibagikan';
        } else {
          unduhFallback(blob, ctx.namaFile);
        }
      }catch(shareErr){
        // user batal share, atau share gagal -> fallback unduh
        unduhFallback(blob, ctx.namaFile);
      }
      finish(status);
    }, 'image/jpeg', 0.85);
  }

  // opts: { judul, namaFile, caption, tujuanWa }
  // return: Promise<{status}> -> status: 'dibagikan'|'diunduh'|'dilewati'|'tanpaKamera'
  function tangkap(opts){
    opts = opts || {};
    injectDOM();
    ctxNow = {
      namaFile: opts.namaFile || `Foto-${Date.now()}.jpg`,
      caption: opts.caption || '',
      tujuanWa: opts.tujuanWa || ''
    };
    el.judul.textContent = opts.judul || 'Ambil Foto';
    el.err.classList.add('cc-cam-hidden');
    el.btnShoot.disabled = true;
    el.overlay.classList.add('show');

    return new Promise((resolve) => {
      resolveFn = resolve;
      (async () => {
        try{
          if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
            throw new Error('getUserMedia tidak didukung di browser ini');
          }
          stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' }, audio:false });
          el.video.srcObject = stream;
          await el.video.play().catch(() => {});
          el.btnShoot.disabled = false;
        }catch(e){
          console.warn('CoreCamera: kamera tidak tersedia:', e);
          el.err.classList.remove('cc-cam-hidden');
        }
      })();
    });
  }

  window.CoreCamera = { tangkap };
})();
