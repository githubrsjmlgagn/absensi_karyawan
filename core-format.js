/* ============================================================
   CORE-FORMAT.JS — Modul Format Angka & Tanggal Indonesia (Lego Brick #11)
   v2 — tambahan: durasi() utk format menit->"Xj Ym", tambahHari()
   untuk geser tanggal. Fungsi lama TIDAK berubah (aman ditimpa
   ke app lain yang sudah pakai versi sebelumnya).
   ------------------------------------------------------------
   Dipakai oleh: SEMUA app Chicken Day (IP, RO, dan outlet baru)

   Sebelumnya fungsi-fungsi format ini (Rupiah, tanggal panjang versi
   Indonesia, nama hari, format input ribuan berjalan) ditulis ulang
   manual di tiap app. Modul ini TIDAK bikin tampilan apa pun — murni
   fungsi format, dipanggil dari mana saja.

   CARA PAKAI:
   1. <script src="core-format.js"></script>
   2. Langsung pakai, tidak perlu init():
        CoreFormat.rupiah(125000)              // -> 'Rp 125.000'
        CoreFormat.todayStr()                  // -> '2026-07-01'
        CoreFormat.tglPanjang('2026-07-01')     // -> '1 Juli 2026'
        CoreFormat.namaHari('2026-07-01')       // -> 'Rabu'
        CoreFormat.tglHeader('2026-07-01')      // -> 'Rabu, 1 Juli 2026'

   3. Untuk input angka yang otomatis dapat titik ribuan saat diketik
      (mis. kolom "Total di struk"):
        <input oninput="CoreFormat.formatRibuan(this)">
        // value input langsung berubah jadi '125.000' saat diketik '125000'
        // ambil angka asli lagi pakai CoreFormat.bersihkanAngka(el.value)

   4. Membersihkan string berformat ribuan jadi angka murni lagi:
        CoreFormat.bersihkanAngka('125.000')   // -> '125000' (string, hanya digit)

   5. (BARU v2) Format durasi dalam menit jadi teks "Xj Ym", dipakai
      mis. utk app yang menghitung jam kerja/lembur/telat:
        CoreFormat.durasi(125)    // -> '2j 05m'
        CoreFormat.durasi(-15)    // -> '-0j 15m'
        CoreFormat.durasi(null)   // -> '-'

   6. (BARU v2) Geser tanggal N hari (boleh negatif utk mundur):
        CoreFormat.tambahHari('2026-07-01', -1)   // -> '2026-06-30'
        CoreFormat.tambahHari('2026-07-01', 7)    // -> '2026-07-08'
   ============================================================ */
(function(){

  const NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const NAMA_HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

  function pad2(n){ return n.toString().padStart(2,'0'); }

  function rupiah(n){
    return 'Rp '+(n||0).toLocaleString('id-ID');
  }

  function bersihkanAngka(raw){
    return String(raw||'').replace(/\D/g,'');
  }

  // Dipasang di oninput sebuah <input>, otomatis menambah titik ribuan
  // saat user mengetik (mis. '125000' jadi '125.000' di layar).
  function formatRibuan(el){
    const raw = bersihkanAngka(el.value);
    el.value = raw ? Number(raw).toLocaleString('id-ID') : '';
  }

  function todayStr(){
    const d = new Date();
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  }

  // tgl: string 'YYYY-MM-DD' -> '1 Juli 2026'
  function tglPanjang(tgl){
    const [y,m,d] = tgl.split('-');
    return `${+d} ${NAMA_BULAN[+m-1]} ${y}`;
  }

  // tgl: string 'YYYY-MM-DD' -> 'Rabu'
  function namaHari(tgl){
    return NAMA_HARI[new Date(tgl+'T00:00:00').getDay()];
  }

  // tgl: string 'YYYY-MM-DD' -> 'Rabu, 1 Juli 2026'
  function tglHeader(tgl){
    return namaHari(tgl)+', '+tglPanjang(tgl);
  }

  // (v2) menit (boleh negatif) -> 'Xj Ym'. null/undefined -> '-'
  function durasi(totalMenit){
    if(totalMenit == null) return '-';
    const sign = totalMenit < 0 ? '-' : '';
    const t = Math.abs(Math.round(totalMenit));
    const h = Math.floor(t/60), m = t%60;
    return `${sign}${h}j ${pad2(m)}m`;
  }

  // (v2) geser tanggal 'YYYY-MM-DD' sebanyak n hari (boleh negatif)
  function tambahHari(tgl, n){
    const [y,m,d] = tgl.split('-').map(Number);
    const dt = new Date(y, m-1, d+n);
    return dt.getFullYear()+'-'+pad2(dt.getMonth()+1)+'-'+pad2(dt.getDate());
  }

  window.CoreFormat = {
    rupiah, bersihkanAngka, formatRibuan,
    todayStr, tglPanjang, namaHari, tglHeader,
    durasi, tambahHari
  };
})();
