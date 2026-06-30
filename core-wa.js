/* ============================================================
   CORE-WA.JS — Modul Kirim ke WhatsApp (Lego Brick #3)
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day (IP, RO, dan outlet baru)

   Modul ini cuma membungkus 1 baris yang sebenarnya sederhana
   (membuka link wa.me) tapi disatukan supaya kalau suatu hari
   caranya berubah (mis. WhatsApp API resmi), cukup ubah di SINI,
   tidak perlu ubah di setiap app satu-satu.

   CARA PAKAI:
   1. <script src="core-wa.js"></script>
   2. Saat tombol "Buka WhatsApp" ditekan:
        CoreWA.send(nomorAdminAtauKosong, teksPesan);

      Contoh nyata (gabung dengan CoreSettings):
        const nomor = CoreSettings.getWaNumber();
        const teks = `IP_CD Ampel\nTanggal: 30 Juni 2026\nTotal: Rp 1.200.000`;
        CoreWA.send(nomor, teks);

      Kalau nomor dikosongkan (''), WhatsApp akan terbuka tanpa
      nomor tujuan otomatis — user pilih kontak sendiri di WhatsApp.
   ============================================================ */
(function(){

  function send(nomor, teks){
    const pesan = encodeURIComponent(teks||'');
    const url = nomor
      ? `https://wa.me/${nomor}?text=${pesan}`
      : `https://wa.me/?text=${pesan}`;
    window.open(url, '_blank');
  }

  window.CoreWA = { send };
})();
