/* ===================== KONSTAN ===================== */

const SHIFTS = [
  { id: "pagi",  nama: "Pagi",  mulai: "07:00", selesai: "16:00" },
  { id: "siang", nama: "Siang", mulai: "10:00", selesai: "19:00" },
  { id: "sore",  nama: "Sore",  mulai: "12:30", selesai: "21:30" },
];

const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

const LS_KEY = {
  karyawan: "at_karyawan",
  jadwal: "at_jadwal",
  absensi: "at_absensi",
  pin: "at_pin",
};

/* ===================== UTIL WAKTU ===================== */

function pad(n) { return n.toString().padStart(2, "0"); }

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowHHMM(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hhmmToMinutes(s) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function minutesToJamMenit(total) {
  if (total == null) return "-";
  const sign = total < 0 ? "-" : "";
  total = Math.abs(Math.round(total));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${sign}${h}j ${pad(m)}m`;
}

function shiftById(id) { return SHIFTS.find((s) => s.id === id); }

function tanggalIndo(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${HARI[dt.getDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayStr(dt);
}

/* ===================== STORAGE ===================== */

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getKaryawan() { return loadJSON(LS_KEY.karyawan, []); }
function saveKaryawan(arr) { saveJSON(LS_KEY.karyawan, arr); }

function getJadwal() { return loadJSON(LS_KEY.jadwal, {}); }
function saveJadwal(obj) { saveJSON(LS_KEY.jadwal, obj); }

function getAbsensi() { return loadJSON(LS_KEY.absensi, {}); }
function saveAbsensi(obj) { saveJSON(LS_KEY.absensi, obj); }

function getPin() { return localStorage.getItem(LS_KEY.pin) || "1234"; }
function setPin(p) { localStorage.setItem(LS_KEY.pin, p); }

/* ===================== KALKULASI ===================== */

function hitungEntri(shiftId, masuk, pulang) {
  const shift = shiftById(shiftId);
  if (!shift) return null;

  const shiftMulai = hhmmToMinutes(shift.mulai);
  const shiftSelesai = hhmmToMinutes(shift.selesai);
  const shiftNormal = shiftSelesai - shiftMulai;

  const masukMin = masuk ? hhmmToMinutes(masuk) : null;
  const pulangMin = pulang ? hhmmToMinutes(pulang) : null;

  const telat = masukMin != null ? Math.max(0, masukMin - shiftMulai) : 0;

  // Lembur = murni waktu kerja SETELAH jam tutup shift resmi, terlepas dari telat atau tidak.
  // Jam normal = sisanya, dibatasi maksimal sebesar durasi shift (datang lebih awal tidak menambah jam normal).
  let total = null, normal = null, lembur = null;
  if (masukMin != null && pulangMin != null) {
    total = Math.max(0, pulangMin - masukMin);
    lembur = Math.max(0, pulangMin - shiftSelesai);
    const rawNormal = total - lembur;
    normal = Math.max(0, Math.min(rawNormal, shiftNormal));
  }

  return { shiftNormal, telat, total, normal, lembur };
}

/* ===================== STATE ===================== */

let currentTab = "absen";
let pinUnlockedThisSession = false;
let pinPendingTab = null;

/* ===================== JAM BERJALAN ===================== */

function tickClock() {
  const now = new Date();
  document.getElementById("clock-time").textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  document.getElementById("clock-date").textContent = tanggalIndo(todayStr(now));
}

/* ===================== TAB: ABSEN ===================== */

function renderAbsenSelect() {
  const sel = document.getElementById("pilih-karyawan");
  const karyawan = getKaryawan();
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">— Pilih nama —</option>' +
    karyawan.map((k) => `<option value="${k.id}">${escapeHtml(k.nama)}</option>`).join("");
  if (karyawan.some((k) => k.id === currentVal)) sel.value = currentVal;
}

function renderAbsenStatus() {
  const sel = document.getElementById("pilih-karyawan");
  const id = sel.value;
  const shiftInfo = document.getElementById("shift-info");
  const statusInfo = document.getElementById("status-info");
  const btn = document.getElementById("btn-absen");

  if (!id) {
    shiftInfo.hidden = true;
    statusInfo.hidden = true;
    btn.disabled = true;
    btn.className = "btn-action";
    btn.textContent = "Pilih nama dulu";
    return;
  }

  const today = todayStr();
  const jadwal = getJadwal();
  const shiftId = jadwal[today] ? jadwal[today][id] : null;

  if (!shiftId) {
    shiftInfo.hidden = false;
    shiftInfo.innerHTML = `Jadwal shift belum diatur untuk hari ini. <b>Hubungi admin.</b>`;
    statusInfo.hidden = true;
    btn.disabled = true;
    btn.className = "btn-action";
    btn.textContent = "Belum bisa absen";
    return;
  }

  const shift = shiftById(shiftId);
  shiftInfo.hidden = false;
  shiftInfo.innerHTML = `Shift hari ini: <b>${shift.nama}</b> · ${shift.mulai}–${shift.selesai}`;

  const absensi = getAbsensi();
  const entry = (absensi[today] && absensi[today][id]) || {};

  if (!entry.masuk) {
    statusInfo.hidden = true;
    btn.disabled = false;
    btn.className = "btn-action mode-masuk";
    btn.innerHTML = "Absen Masuk";
    btn.dataset.action = "masuk";
    const existingPulang = document.getElementById("btn-pulang-wrap");
    if (existingPulang) existingPulang.remove();
    return;
  }

  if (entry.masuk && !entry.pulang) {
    const calc = hitungEntri(shiftId, entry.masuk, null);
    // Status masuk ditampilkan DI DALAM tombol info
    statusInfo.hidden = true;
    btn.disabled = true;
    btn.className = "btn-action btn-info-masuk";
    btn.innerHTML =
      `<span class="btn-info-jam">✓ Masuk ${entry.masuk}</span>` +
      (calc.telat > 0
        ? `<span class="btn-info-status telat-label">Telat ${minutesToJamMenit(calc.telat)}</span>`
        : `<span class="btn-info-status tepat-label">Tepat Waktu</span>`);

    // Render tombol pulang terpisah, aktif otomatis 5 menit sebelum jam pulang shift
    renderTombolPulang(id, shiftId);
    return;
  }

  // sudah masuk & pulang
  const calc = hitungEntri(shiftId, entry.masuk, entry.pulang);
  statusInfo.hidden = false;
  statusInfo.innerHTML =
    `Masuk: ${entry.masuk}${calc.telat > 0 ? ` <span class="telat">(telat ${minutesToJamMenit(calc.telat)})</span>` : ""}<br>` +
    `Pulang: ${entry.pulang}<br>` +
    `Jam normal: ${minutesToJamMenit(calc.normal)}` +
    (calc.lembur > 0 ? ` · <span class="lembur">Lembur ${minutesToJamMenit(calc.lembur)}</span>` : "");
  btn.disabled = true;
  btn.className = "btn-action";
  btn.innerHTML = "Selesai untuk hari ini ✓";
  const existingPulang = document.getElementById("btn-pulang-wrap");
  if (existingPulang) existingPulang.remove();
}

const PULANG_AKTIF_SEBELUM_MENIT = 5; // tombol "Absen Pulang" aktif mulai N menit sebelum jam pulang shift

function formatSisaWaktu(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}j ${pad(m)}m ${pad(s)}d`;
  return `${pad(m)}:${pad(s)}`;
}

function hitungTargetAktifPulang(shiftId) {
  const shift = shiftById(shiftId);
  const [hh, mm] = shift.selesai.split(":").map(Number);
  const target = new Date();
  target.setHours(hh, mm - PULANG_AKTIF_SEBELUM_MENIT, 0, 0);
  return target;
}

function renderTombolPulang(karyawanId, shiftId) {
  const old = document.getElementById("btn-pulang-wrap");
  if (old) old.remove();

  const card = document.getElementById("btn-absen").closest(".card");
  const wrap = document.createElement("div");
  wrap.id = "btn-pulang-wrap";
  wrap.className = "card pulang-card";

  const target = hitungTargetAktifPulang(shiftId);
  const now = new Date();
  const sudahAktif = now >= target;
  const jamTarget = `${pad(target.getHours())}:${pad(target.getMinutes())}`;

  wrap.innerHTML = `
    <div class="pulang-label">Absen Pulang</div>
    <div class="pulang-progress-wrap">
      <div class="pulang-progress-bar" id="pulang-progress-bar"></div>
    </div>
    <button id="btn-pulang-action" class="btn-action mode-pulang" ${sudahAktif ? "" : "disabled"}>
      ${
        sudahAktif
          ? "Absen Pulang"
          : `Aktif jam ${jamTarget} <span id="pulang-countdown">(${formatSisaWaktu(target - now)})</span>`
      }
    </button>`;
  card.after(wrap);

  const btnPulang = document.getElementById("btn-pulang-action");
  const progressBar = document.getElementById("pulang-progress-bar");

  let interval = null;

  if (sudahAktif) {
    progressBar.style.width = "100%";
  } else {
    const countdownEl = document.getElementById("pulang-countdown");
    const totalMs = target.getTime() - now.getTime();
    const startTime = Date.now();

    interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      progressBar.style.width = pct + "%";

      const sisaMs = target.getTime() - Date.now();
      if (sisaMs <= 0) {
        clearInterval(interval);
        btnPulang.disabled = false;
        btnPulang.textContent = "Absen Pulang";
        progressBar.style.width = "100%";
      } else {
        countdownEl.textContent = `(${formatSisaWaktu(sisaMs)})`;
      }
    }, 1000);
  }

  btnPulang.addEventListener("click", () => {
    if (interval) clearInterval(interval);
    const today = todayStr();
    const absensi = getAbsensi();
    if (!absensi[today]) absensi[today] = {};
    if (!absensi[today][karyawanId]) absensi[today][karyawanId] = {};
    const jam = nowHHMM();
    absensi[today][karyawanId].pulang = jam;
    saveAbsensi(absensi);
    renderAbsenStatus();
    renderLogHariIni();

    // Absen sudah tersimpan di atas. Sekarang buka modal kamera (opsional bagi karyawan).
    const karyawan = getKaryawan().find((k) => k.id === karyawanId);
    const shift = shiftById(shiftId);
    bukaKameraModal(
      karyawan ? karyawan.nama : "Karyawan",
      "Absen Pulang",
      jam,
      shift ? shift.nama : "-"
    );
  });
}

/* ===================== FOTO ABSEN + SHARE WHATSAPP ===================== */
// Absen sudah tersimpan SEBELUM modal kamera ini dibuka (lihat handleAbsenClick /
// renderTombolPulang). Jadi kalau kamera/share gagal, absen tetap aman.

function unduhFotoFallback(blob, fileName) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    /* abaikan */
  }
}

let cameraStreamAktif = null;
let cameraContextPending = null;

async function bukaKameraModal(namaKaryawan, labelAksi, jamLabel, shiftNama) {
  cameraContextPending = { namaKaryawan, labelAksi, jamLabel, shiftNama };

  const modal = document.getElementById("camera-modal");
  const video = document.getElementById("camera-preview");
  const errorEl = document.getElementById("camera-error");
  const captureBtn = document.getElementById("camera-capture");

  errorEl.hidden = true;
  captureBtn.disabled = true;
  modal.hidden = false;

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia tidak didukung di browser ini");
    }
    cameraStreamAktif = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = cameraStreamAktif;
    await video.play().catch(() => {});
    captureBtn.disabled = false;
  } catch (e) {
    console.warn("Kamera tidak tersedia:", e);
    errorEl.hidden = false;
  }
}

function tutupKameraModal() {
  document.getElementById("camera-modal").hidden = true;
  document.getElementById("camera-preview").srcObject = null;
  if (cameraStreamAktif) {
    cameraStreamAktif.getTracks().forEach((t) => t.stop());
    cameraStreamAktif = null;
  }
  cameraContextPending = null;
}

async function handleAmbilGambar() {
  const video = document.getElementById("camera-preview");
  const ctx = cameraContextPending;
  if (!ctx || !cameraStreamAktif || !video.videoWidth) {
    tutupKameraModal();
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  tutupKameraModal(); // matikan kamera & tutup modal duluan, baru proses share

  canvas.toBlob(
    async (blob) => {
      if (!blob) return;
      const fileName = `Absen-${sanitizeFileName(ctx.namaKaryawan)}-${ctx.jamLabel.replace(":", "")}.jpg`;
      const caption = `${ctx.namaKaryawan} · ${ctx.labelAksi} · ${ctx.jamLabel} · Shift ${ctx.shiftNama}`;
      const file = new File([blob], fileName, { type: "image/jpeg" });

      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: caption });
          return;
        }
      } catch (shareErr) {
        /* lanjut ke fallback unduh di bawah */
      }
      unduhFotoFallback(blob, fileName);
    },
    "image/jpeg",
    0.85
  );
}


function handleAbsenClick() {
  const sel = document.getElementById("pilih-karyawan");
  const id = sel.value;
  const btn = document.getElementById("btn-absen");
  const action = btn.dataset.action;
  if (!id || !action) return;

  const today = todayStr();
  const absensi = getAbsensi();
  if (!absensi[today]) absensi[today] = {};
  if (!absensi[today][id]) absensi[today][id] = {};

  const jam = nowHHMM();
  absensi[today][id][action] = jam;
  saveAbsensi(absensi);

  renderAbsenStatus();
  renderLogHariIni();

  // Absen sudah tersimpan di atas. Sekarang buka modal kamera (opsional bagi karyawan).
  const karyawan = getKaryawan().find((k) => k.id === id);
  const shift = shiftById((getJadwal()[today] || {})[id]);
  bukaKameraModal(
    karyawan ? karyawan.nama : "Karyawan",
    action === "masuk" ? "Absen Masuk" : "Absen Pulang",
    jam,
    shift ? shift.nama : "-"
  );
}

function renderLogHariIni() {
  const wrap = document.getElementById("log-hari-ini");
  const today = todayStr();
  const absensi = getAbsensi()[today] || {};
  const jadwal = getJadwal()[today] || {};
  const karyawan = getKaryawan();

  const rows = Object.keys(absensi)
    .map((id) => {
      const k = karyawan.find((x) => x.id === id);
      if (!k) return null;
      const e = absensi[id];
      const shift = shiftById(jadwal[id]);
      return { nama: k.nama, masuk: e.masuk, pulang: e.pulang, shiftNama: shift ? shift.nama : "-" };
    })
    .filter(Boolean)
    .sort((a, b) => (a.masuk || "").localeCompare(b.masuk || ""));

  if (rows.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada yang absen hari ini.</div>';
    return;
  }

  wrap.innerHTML = rows
    .map(
      (r) =>
        `<div class="log-row"><span class="nm">${escapeHtml(r.nama)} · ${r.shiftNama}</span>` +
        `<span class="tm">${r.masuk || "--:--"} → ${r.pulang || "--:--"}</span></div>`
    )
    .join("");
}

/* ===================== TAB: JADWAL ===================== */

function renderJadwalTab() {
  const tanggalInput = document.getElementById("jadwal-tanggal");
  if (!tanggalInput.value) tanggalInput.value = todayStr();
  const tanggal = tanggalInput.value;

  const karyawan = getKaryawan();
  const jadwal = getJadwal();
  const wrap = document.getElementById("jadwal-list");

  if (karyawan.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada karyawan. Tambahkan dulu di tab Karyawan.</div>';
    return;
  }

  const hariJadwal = jadwal[tanggal] || {};

  wrap.innerHTML = karyawan
    .map((k) => {
      const val = hariJadwal[k.id] || "";
      const options =
        `<option value="">Belum diatur</option>` +
        SHIFTS.map((s) => `<option value="${s.id}" ${val === s.id ? "selected" : ""}>${s.nama} (${s.mulai}-${s.selesai})</option>`).join("");
      return `<div class="jadwal-row"><span class="nm">${escapeHtml(k.nama)}</span>
        <select data-karyawan-id="${k.id}" class="jadwal-select">${options}</select></div>`;
    })
    .join("");

  wrap.querySelectorAll(".jadwal-select").forEach((selEl) => {
    selEl.addEventListener("change", () => {
      const tanggal2 = document.getElementById("jadwal-tanggal").value;
      const jadwalAll = getJadwal();
      if (!jadwalAll[tanggal2]) jadwalAll[tanggal2] = {};
      if (selEl.value) jadwalAll[tanggal2][selEl.dataset.karyawanId] = selEl.value;
      else delete jadwalAll[tanggal2][selEl.dataset.karyawanId];
      saveJadwal(jadwalAll);
      renderKoreksiAbsensi();
    });
  });

  renderKoreksiAbsensi();
}

function renderKoreksiAbsensi() {
  const tanggal = document.getElementById("jadwal-tanggal").value;
  const karyawan = getKaryawan();
  const jadwalHari = getJadwal()[tanggal] || {};
  const absensiHari = getAbsensi()[tanggal] || {};
  const wrap = document.getElementById("koreksi-list");

  // tampilkan karyawan yang berjadwal HARI ITU, atau yang sudah punya entri absensi (kalau jadwalnya kebetulan dihapus belakangan)
  const idList = Array.from(new Set([...Object.keys(jadwalHari), ...Object.keys(absensiHari)]));
  const rows = idList
    .map((id) => karyawan.find((k) => k.id === id))
    .filter(Boolean);

  if (rows.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Tidak ada karyawan berjadwal di tanggal ini.</div>';
    return;
  }

  wrap.innerHTML = rows
    .map((k) => {
      const shift = shiftById(jadwalHari[k.id]);
      const entry = absensiHari[k.id] || {};
      return `<div class="koreksi-row">
        <span class="nm">${escapeHtml(k.nama)}<small>${shift ? shift.nama + " · " + shift.mulai + "-" + shift.selesai : "tanpa shift"}</small></span>
        <input type="time" class="koreksi-masuk" data-karyawan-id="${k.id}" value="${entry.masuk || ""}" aria-label="Jam masuk" />
        <input type="time" class="koreksi-pulang" data-karyawan-id="${k.id}" value="${entry.pulang || ""}" aria-label="Jam pulang" />
      </div>`;
    })
    .join("");

  function simpanKoreksi(inputEl, field) {
    const id = inputEl.dataset.karyawanId;
    const absensiAll = getAbsensi();
    if (!absensiAll[tanggal]) absensiAll[tanggal] = {};
    if (!absensiAll[tanggal][id]) absensiAll[tanggal][id] = {};
    if (inputEl.value) absensiAll[tanggal][id][field] = inputEl.value;
    else delete absensiAll[tanggal][id][field];
    saveAbsensi(absensiAll);
    inputEl.classList.add("saved-flash");
    setTimeout(() => inputEl.classList.remove("saved-flash"), 600);
  }

  wrap.querySelectorAll(".koreksi-masuk").forEach((el) => el.addEventListener("change", () => simpanKoreksi(el, "masuk")));
  wrap.querySelectorAll(".koreksi-pulang").forEach((el) => el.addEventListener("change", () => simpanKoreksi(el, "pulang")));
}

function handleCopyKemarin() {
  const tanggalInput = document.getElementById("jadwal-tanggal");
  const tanggal = tanggalInput.value || todayStr();
  const kemarin = addDays(tanggal, -1);
  const jadwalAll = getJadwal();
  if (!jadwalAll[kemarin]) {
    alert("Tidak ada jadwal di tanggal sebelumnya untuk disalin.");
    return;
  }
  jadwalAll[tanggal] = { ...jadwalAll[kemarin] };
  saveJadwal(jadwalAll);
  renderJadwalTab();
}

/* ===================== TAB: KARYAWAN ===================== */

function renderKaryawanTab() {
  const wrap = document.getElementById("daftar-karyawan");
  const karyawan = getKaryawan();
  if (karyawan.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada karyawan.</div>';
    return;
  }
  wrap.innerHTML = karyawan
    .map(
      (k) =>
        `<div class="employee-row"><span>${escapeHtml(k.nama)}</span>` +
        `<button class="btn-del" data-id="${k.id}">Hapus</button></div>`
    )
    .join("");

  wrap.querySelectorAll(".btn-del").forEach((b) => {
    b.addEventListener("click", () => {
      if (!confirm("Hapus karyawan ini? Data absensi lama tetap tersimpan.")) return;
      const arr = getKaryawan().filter((k) => k.id !== b.dataset.id);
      saveKaryawan(arr);
      renderKaryawanTab();
      renderAbsenSelect();
      renderJadwalTab();
    });
  });
}

function handleTambahKaryawan() {
  const input = document.getElementById("input-nama-karyawan");
  const nama = input.value.trim();
  if (!nama) return;
  const arr = getKaryawan();
  arr.push({ id: "k_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nama });
  saveKaryawan(arr);
  input.value = "";
  renderKaryawanTab();
  renderAbsenSelect();
  renderJadwalTab();
}

function handleGantiPin() {
  const lama = document.getElementById("pin-lama").value;
  const baru = document.getElementById("pin-baru").value;
  if (lama !== getPin()) { alert("PIN lama salah."); return; }
  if (!baru || baru.length < 4) { alert("PIN baru minimal 4 digit."); return; }
  setPin(baru);
  document.getElementById("pin-lama").value = "";
  document.getElementById("pin-baru").value = "";
  alert("PIN berhasil diganti.");
}

/* ===================== TAB: REKAP ===================== */

function bulanRange(bulanStr) {
  // bulanStr format "YYYY-MM"
  const [y, m] = bulanStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const dates = [];
  for (let d = 1; d <= lastDay; d++) {
    dates.push(`${y}-${pad(m)}-${pad(d)}`);
  }
  return dates;
}

function hitungRekapBulanan(bulanStr) {
  const dates = bulanRange(bulanStr);
  const karyawan = getKaryawan();
  const jadwalAll = getJadwal();
  const absensiAll = getAbsensi();

  const detail = []; // baris per hari per karyawan yang hadir
  const ringkasanMap = {}; // id -> {nama, hadir, normal, lembur, telat}

  karyawan.forEach((k) => (ringkasanMap[k.id] = { nama: k.nama, hadir: 0, normal: 0, lembur: 0, telat: 0 }));

  dates.forEach((tgl) => {
    const jadwalHari = jadwalAll[tgl] || {};
    const absensiHari = absensiAll[tgl] || {};
    Object.keys(absensiHari).forEach((id) => {
      const k = karyawan.find((x) => x.id === id);
      if (!k) return;
      const shiftId = jadwalHari[id];
      const e = absensiHari[id];
      if (!shiftId || !e.masuk) return;
      const calc = hitungEntri(shiftId, e.masuk, e.pulang || null);
      const shift = shiftById(shiftId);

      detail.push({
        tanggal: tgl,
        nama: k.nama,
        shift: shift.nama,
        masuk: e.masuk,
        pulang: e.pulang || "-",
        normal: calc.normal != null ? calc.normal : 0,
        lembur: calc.lembur != null ? calc.lembur : 0,
        telat: calc.telat,
      });

      if (!ringkasanMap[id]) ringkasanMap[id] = { nama: k.nama, hadir: 0, normal: 0, lembur: 0, telat: 0 };
      ringkasanMap[id].hadir += 1;
      ringkasanMap[id].normal += calc.normal || 0;
      ringkasanMap[id].lembur += calc.lembur || 0;
      ringkasanMap[id].telat += calc.telat || 0;
    });
  });

  const ringkasan = Object.values(ringkasanMap);
  return { ringkasan, detail };
}

function renderRekapTampilan() {
  const bulanInput = document.getElementById("rekap-bulan");
  if (!bulanInput.value) {
    const now = new Date();
    bulanInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  }
  const { ringkasan } = hitungRekapBulanan(bulanInput.value);
  const wrap = document.getElementById("rekap-ringkasan");

  if (ringkasan.length === 0) {
    wrap.innerHTML = '<div class="log-empty">Belum ada data absensi di bulan ini.</div>';
    return;
  }

  wrap.innerHTML = `
    <table class="rekap">
      <thead><tr>
        <th>Nama</th><th>Hadir</th><th>Jam Normal</th><th>Lembur</th><th>Telat</th>
      </tr></thead>
      <tbody>
        ${ringkasan
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.nama)}</td><td>${r.hadir} hari</td><td>${minutesToJamMenit(r.normal)}</td><td>${minutesToJamMenit(r.lembur)}</td><td>${minutesToJamMenit(r.telat)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

let exportPendingBulanStr = null;

function sanitizeFileName(name) {
  // Hapus karakter yang tidak aman untuk nama file, sisanya dibiarkan apa adanya.
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "Absensi";
}

function openExportModal() {
  const bulanInput = document.getElementById("rekap-bulan");
  const bulanStr = bulanInput.value;
  if (!bulanStr) { alert("Pilih bulan dulu."); return; }
  if (typeof XLSX === "undefined") {
    alert("Fitur export butuh koneksi internet sekali untuk memuat library Excel. Coba lagi saat online.");
    return;
  }

  exportPendingBulanStr = bulanStr;
  const input = document.getElementById("export-filename");
  input.value = `Absensi-${bulanStr}`;
  document.getElementById("export-modal").hidden = false;
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

function closeExportModal() {
  document.getElementById("export-modal").hidden = true;
  exportPendingBulanStr = null;
}

function confirmExportExcel() {
  const bulanStr = exportPendingBulanStr;
  if (!bulanStr) { closeExportModal(); return; }

  const rawName = document.getElementById("export-filename").value;
  const fileName = sanitizeFileName(rawName);

  const { ringkasan, detail } = hitungRekapBulanan(bulanStr);

  const ringkasanSheet = XLSX.utils.json_to_sheet(
    ringkasan.map((r) => ({
      Nama: r.nama,
      "Total Hari Hadir": r.hadir,
      "Total Jam Normal": minutesToJamMenit(r.normal),
      "Total Jam Lembur": minutesToJamMenit(r.lembur),
      "Total Telat": minutesToJamMenit(r.telat),
    }))
  );

  const detailSheet = XLSX.utils.json_to_sheet(
    detail
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.nama.localeCompare(b.nama))
      .map((d) => ({
        Tanggal: d.tanggal,
        Nama: d.nama,
        Shift: d.shift,
        "Jam Masuk": d.masuk,
        "Jam Pulang": d.pulang,
        "Jam Normal": minutesToJamMenit(d.normal),
        "Jam Lembur": minutesToJamMenit(d.lembur),
        Telat: minutesToJamMenit(d.telat),
      }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ringkasanSheet, "Rekap Bulanan");
  XLSX.utils.book_append_sheet(wb, detailSheet, "Detail Harian");
  XLSX.writeFile(wb, `${fileName}.xlsx`);

  closeExportModal();
}

/* ===================== PIN ADMIN ===================== */

const TABS_PROTECTED = ["jadwal", "karyawan", "rekap"];

function openPinModal(forTab) {
  pinPendingTab = forTab;
  document.getElementById("pin-modal").hidden = false;
  document.getElementById("pin-error").hidden = true;
  const input = document.getElementById("pin-input");
  input.value = "";
  setTimeout(() => input.focus(), 50);
}

function closePinModal() {
  document.getElementById("pin-modal").hidden = true;
  pinPendingTab = null;
}

function submitPin() {
  const input = document.getElementById("pin-input").value;
  if (input === getPin()) {
    pinUnlockedThisSession = true;
    document.getElementById("lock-indicator").hidden = false;
    const tab = pinPendingTab;
    closePinModal();
    activateTab(tab);
  } else {
    document.getElementById("pin-error").hidden = false;
  }
}

/* ===================== NAVIGASI TAB ===================== */

function activateTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach((el) => el.classList.remove("active"));
  document.getElementById(`tab-${tab}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

  if (tab === "jadwal") renderJadwalTab();
  if (tab === "karyawan") renderKaryawanTab();
  if (tab === "rekap") renderRekapTampilan();
}

function requestTab(tab) {
  if (TABS_PROTECTED.includes(tab) && !pinUnlockedThisSession) {
    openPinModal(tab);
    return;
  }
  activateTab(tab);
}

/* ===================== HELPER ===================== */

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ===================== INIT ===================== */

function init() {
  tickClock();
  setInterval(tickClock, 1000);

  renderAbsenSelect();
  renderAbsenStatus();
  renderLogHariIni();

  document.getElementById("pilih-karyawan").addEventListener("change", renderAbsenStatus);
  document.getElementById("btn-absen").addEventListener("click", handleAbsenClick);

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => requestTab(b.dataset.tab));
  });

  document.getElementById("jadwal-tanggal").addEventListener("change", renderJadwalTab);
  document.getElementById("btn-copy-kemarin").addEventListener("click", handleCopyKemarin);

  document.getElementById("btn-tambah-karyawan").addEventListener("click", handleTambahKaryawan);
  document.getElementById("input-nama-karyawan").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleTambahKaryawan();
  });
  document.getElementById("btn-ganti-pin").addEventListener("click", handleGantiPin);

  document.getElementById("btn-tampilkan-rekap").addEventListener("click", renderRekapTampilan);
  document.getElementById("btn-export-excel").addEventListener("click", openExportModal);

  document.getElementById("export-cancel").addEventListener("click", closeExportModal);
  document.getElementById("export-confirm").addEventListener("click", confirmExportExcel);
  document.getElementById("export-filename").addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmExportExcel();
  });

  document.getElementById("camera-skip").addEventListener("click", tutupKameraModal);
  document.getElementById("camera-capture").addEventListener("click", handleAmbilGambar);

  document.getElementById("pin-cancel").addEventListener("click", closePinModal);
  document.getElementById("pin-submit").addEventListener("click", submitPin);
  document.getElementById("pin-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPin();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
