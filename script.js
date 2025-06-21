// Import modul Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, doc, collection, addDoc, onSnapshot, query, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// Variabel global yang disediakan oleh lingkungan Canvas
// Ini harus didefinisikan di lingkungan tempat aplikasi berjalan (misalnya, di dalam iframe Canvas)
// atau Anda dapat menggantinya dengan nilai default untuk pengembangan lokal.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


// Inisialisasi Firebase
let app;
let db;
let auth;
let userId = 'anon_user'; // Nilai default, akan diperbarui setelah otentikasi
let isAuthReady = false;

// Dapatkan elemen DOM
const employeeNameInput = document.getElementById('employeeName');
const clockInBtn = document.getElementById('clockInBtn');
const clockOutBtn = document.getElementById('clockOutBtn');
const attendanceLog = document.getElementById('attendanceLog');
const userIdDisplay = document.getElementById('userIdDisplay');
const loadingSpinner = document.getElementById('loadingSpinner');

// Elemen Modal
const modal = document.getElementById('myModal');
const modalMessage = document.getElementById('modalMessage');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const closeButton = document.querySelector('.close-button');

// Fungsi untuk menampilkan modal kustom
function showModal(message, showConfirm = false, onConfirm = null) {
    modalMessage.textContent = message;
    modalConfirmBtn.style.display = showConfirm ? 'inline-block' : 'none';
    modalCloseBtn.textContent = showConfirm ? 'Batal' : 'Tutup';
    modal.style.display = 'flex'; // Tampilkan modal

    modalConfirmBtn.onclick = () => {
        if (onConfirm) onConfirm();
        modal.style.display = 'none';
    };
    modalCloseBtn.onclick = () => {
        modal.style.display = 'none';
    };
    closeButton.onclick = () => {
        modal.style.display = 'none';
    };
    // Tutup modal jika mengklik di luar area modal
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

// Inisialisasi Firebase dan siapkan otentikasi
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId;
                isAuthReady = true;
                console.log("Firebase berhasil diautentikasi. ID Pengguna:", userId);
                // Mulai mendengarkan catatan absensi hanya setelah otentikasi siap
                listenForAttendanceRecords();
            } else {
                // Masuk secara anonim jika tidak ada pengguna yang ditemukan dan tidak ada token kustom yang disediakan
                if (initialAuthToken) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else {
                    await signInAnonymously(auth);
                }
            }
        });
    } catch (error) {
        console.error("Terjadi kesalahan saat menginisialisasi Firebase atau selama otentikasi:", error);
        showModal("Terjadi kesalahan saat menginisialisasi aplikasi. Silakan coba lagi.");
    }
}

// Fungsi untuk menambahkan catatan absensi baru
async function addAttendanceRecord(type) {
    if (!isAuthReady) {
        showModal("Aplikasi sedang memuat atau mengautentikasi. Silakan tunggu.");
        return;
    }

    const employeeName = employeeNameInput.value.trim();
    if (!employeeName) {
        showModal("Nama karyawan tidak boleh kosong.");
        return;
    }

    try {
        // Path koleksi data publik: /artifacts/{appId}/public/data/{nama_koleksi_anda}
        const attendanceRef = collection(db, `artifacts/${appId}/public/data/attendance_records`);

        await addDoc(attendanceRef, {
            userId: userId,
            employeeName: employeeName,
            type: type, // 'clock-in' atau 'clock-out'
            timestamp: serverTimestamp() // Timestamp server Firestore
        });
        showModal(`Berhasil ${type === 'clock-in' ? 'Clock In' : 'Clock Out'} untuk ${employeeName}!`);
        employeeNameInput.value = ''; // Hapus input setelah catatan berhasil
    } catch (error) {
        console.error("Terjadi kesalahan saat menambahkan dokumen: ", error);
        showModal("Terjadi kesalahan saat menyimpan data absensi. Silakan coba lagi.");
    }
}

// Fungsi untuk mendengarkan pembaruan real-time dari Firestore
function listenForAttendanceRecords() {
    if (!db) {
        console.error("Instans Firestore tidak tersedia.");
        return;
    }

    loadingSpinner.classList.remove('hidden'); // Tampilkan spinner

    // Path koleksi data publik: /artifacts/{appId}/public/data/{nama_koleksi_anda}
    const attendanceRef = collection(db, `artifacts/${appId}/public/data/attendance_records`);
    const q = query(attendanceRef); // Firestore tidak mendukung `orderBy` tanpa pengindeksan eksplisit,
                                   // jadi kita akan mengurutkan di JavaScript untuk kesederhanaan.

    onSnapshot(q, (snapshot) => {
        loadingSpinner.classList.add('hidden'); // Sembunyikan spinner
        attendanceLog.innerHTML = ''; // Hapus daftar saat ini

        let records = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            records.push({ id: doc.id, ...data });
        });

        // Urutkan catatan berdasarkan timestamp dalam urutan menurun (terbaru pertama)
        records.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));

        if (records.length === 0) {
            attendanceLog.innerHTML = `<li class="text-center text-gray-500 py-4">Belum ada riwayat absensi.</li>`;
        } else {
            records.forEach((record) => {
                const li = document.createElement('li');
                li.className = 'bg-gray-50 p-3 rounded-lg shadow-sm flex items-center justify-between';
                const time = record.timestamp ? new Date(record.timestamp.toDate()).toLocaleString('id-ID') : 'N/A';
                const typeClass = record.type === 'clock-in' ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold';

                li.innerHTML = `
                    <div>
                        <p class="text-gray-900 font-medium">${record.employeeName}</p>
                        <p class="text-sm text-gray-500">${time}</p>
                    </div>
                    <span class="${typeClass} text-sm uppercase">${record.type === 'clock-in' ? 'Masuk' : 'Keluar'}</span>
                `;
                attendanceLog.appendChild(li);
            });
        }
    }, (error) => {
        console.error("Terjadi kesalahan saat mengambil dokumen: ", error);
        showModal("Gagal memuat riwayat absensi. Silakan periksa koneksi Anda.");
        loadingSpinner.classList.add('hidden'); // Sembunyikan spinner saat terjadi kesalahan
    });
}

// Penanganan Event
clockInBtn.addEventListener('click', () => addAttendanceRecord('clock-in'));
clockOutBtn.addEventListener('click', () => addAttendanceRecord('clock-out'));

// Inisialisasi Firebase saat jendela dimuat
window.onload = initializeFirebase;