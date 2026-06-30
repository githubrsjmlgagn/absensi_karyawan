/* ============================================================
   CORE-SETTINGS.JS — Modul Pengaturan Outlet & Nomor WA (Lego Brick #2)
   v2 — tambahan: getWaNumberByKey()/setWaNumberByKey() untuk app yang
   butuh LEBIH dari 1 nomor WA (mis. nomor admin pusat + nomor grup
   yang berbeda). Fungsi lama (getWaNumber/setWaNumber/getOutlet/
   setOutlet) TIDAK berubah perilakunya — aman ditimpa ke app lama.
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day (IP, RO, dan outlet baru)

   Modul ini TIDAK membuat tampilan apa pun (beda dengan core-pin.js).
   Ini cuma "otak"-nya: simpan, ambil, dan validasi data. Tampilan
   form input (nama outlet, nomor WA) tetap Anda buat sendiri di
   index.html masing-masing app, sesuai desain app itu.

   CARA PAKAI:
   1. <script src="core-settings.js"></script>
   2. Saat app mulai (atau sekali saja), atur dulu nama key-nya:
        CoreSettings.init({
          outletKey: 'cda_outlet',   // boleh sama di semua app 1 outlet
          waKey: 'cda_nomor_wa'      // nomor WA UTAMA (mis. admin pusat)
        });
   3. Ambil nilai:
        CoreSettings.getOutlet()      // -> 'Ampel' atau ''
        CoreSettings.getWaNumber()    // -> '6281234567890' atau ''
   4. Simpan nilai (otomatis divalidasi):
        const hasil = CoreSettings.setOutlet(inputValue);
        if(!hasil.ok){ toast(hasil.pesan); }

        const hasil2 = CoreSettings.setWaNumber(inputValue);
        if(!hasil2.ok){ toast(hasil2.pesan); }

   5. (BARU v2) Kalau app butuh nomor WA KEDUA dst (mis. nomor grup
      absensi yang beda dari nomor admin pusat), pakai key apapun
      (bukan cuma cfg.waKey) lewat fungsi generik ini:
        const hasilGrup = CoreSettings.setWaNumberByKey('cda_wa_grup', inputValue);
        if(!hasilGrup.ok){ toast(hasilGrup.pesan); }

        CoreSettings.getWaNumberByKey('cda_wa_grup')   // -> '6281234567890' atau ''
   ============================================================ */
(function(){

  let cfg = {
    outletKey: 'core_outlet',
    waKey: 'core_nomor_wa'
  };

  function init(opts){
    cfg = Object.assign({}, cfg, opts||{});
  }

  function getOutlet(){
    return localStorage.getItem(cfg.outletKey) || '';
  }

  function setOutlet(val){
    val = (val||'').trim();
    if(!val) return { ok:false, pesan:'Nama outlet tidak boleh kosong' };
    localStorage.setItem(cfg.outletKey, val);
    return { ok:true, pesan:'✓ Tersimpan: '+val, value:val };
  }

  // Validasi nomor WA: harus angka saja, diawali kode negara 62, panjang wajar.
  // (aturan ini diambil dari validasi yang sudah ada di app IP — dipertahankan
  //  supaya kebiasaan input staf tidak berubah)
  function validasiNomorWa(val){
    const bersih = (val||'').trim().replace(/\D/g,'');
    if(!bersih) return { ok:false, pesan:'Nomor tidak boleh kosong' };
    if(!bersih.startsWith('62')) return { ok:false, pesan:'Nomor harus diawali kode negara 62 (mis. 6281234567890)' };
    if(bersih.length<10 || bersih.length>15) return { ok:false, pesan:'Panjang nomor tidak wajar — cek kembali nomornya' };
    return { ok:true, value: bersih };
  }

  // (v2) generik: simpan/ambil nomor WA dengan KEY localStorage apapun,
  // tidak terbatas pada cfg.waKey — dipakai kalau 1 app butuh >1 nomor WA.
  function setWaNumberByKey(key, val){
    const v = validasiNomorWa(val);
    if(!v.ok) return v;
    localStorage.setItem(key, v.value);
    return { ok:true, pesan:'✓ Tersimpan: '+v.value, value:v.value };
  }
  function getWaNumberByKey(key){
    return localStorage.getItem(key) || '';
  }

  function getWaNumber(){ return getWaNumberByKey(cfg.waKey); }
  function setWaNumber(val){ return setWaNumberByKey(cfg.waKey, val); }

  window.CoreSettings = {
    init, getOutlet, setOutlet, getWaNumber, setWaNumber,
    getWaNumberByKey, setWaNumberByKey
  };
})();
