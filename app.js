// ★★★ あなたのFirebase設定をここに貼り付け ★★★
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// --- グローバル変数 ---
let map;
let currentPostData = null; // 投稿するデータを一時的に保持
let allPosts = []; // 全ての投稿をキャッシュ
let markers = []; // 地図上のマーカーを管理
const categoryIcons = {
    road_damage: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
    building_damage: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
    lifeline: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
    fire: 'https://maps.google.com/mapfiles/ms/icons/pink-dot.png',
    shelter: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
    other: 'https://maps.google.com/mapfiles/ms/icons/purple-dot.png'
};

// --- Firebaseの初期化 ---
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// --- 認証チェックと初期化 ---
auth.onAuthStateChanged(user => {
    if (user) {
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('logoutBtn').addEventListener('click', () => auth.signOut());
        initializeApp();
    } else {
        window.location.replace('login.html');
    }
});

function initializeApp() {
    initPostModal();
    listenToPosts();
}

// --- 地図の初期化 (Google Maps APIから呼び出される) ---
function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 12,
        center: { lat: 36.083, lng: 140.111 }, // つくば市
        mapTypeControl: false
    });
}

// --- Firestoreから投稿をリアルタイムで監視 ---
function listenToPosts() {
    db.collection("posts").orderBy("takenAt", "asc").onSnapshot(snapshot => {
        allPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (allPosts.length > 0) {
            initTimeline();
            updateMapByTime();
        }
    });
}

// --- タイムラインの初期化と制御 ---
function initTimeline() {
    const slider = document.getElementById('time-slider');
    const firstPostTime = allPosts[0].takenAt.toDate().getTime();
    const lastPostTime = allPosts[allPosts.length - 1].takenAt.toDate().getTime();
    
    slider.min = firstPostTime;
    slider.max = lastPostTime;
    slider.value = lastPostTime;
    slider.disabled = false;
    
    slider.removeEventListener('input', updateMapByTime); // 念のため既存のリスナーを削除
    slider.addEventListener('input', updateMapByTime);
}

function updateMapByTime() {
    const slider = document.getElementById('time-slider');
    const timeLabel = document.getElementById('slider-time-label');
    const selectedTime = parseInt(slider.value);
    timeLabel.textContent = new Date(selectedTime).toLocaleString('ja-JP');

    markers.forEach(marker => marker.setMap(null));
    markers = [];

    const filteredPosts = allPosts.filter(post => post.takenAt.toDate().getTime() <= selectedTime);
    filteredPosts.forEach(addMarker);
}

// --- マーカーの追加 ---
function addMarker(post) {
    const marker = new google.maps.Marker({
        position: { lat: post.lat, lng: post.lng },
        map: map,
        icon: categoryIcons[post.category] || categoryIcons['other'],
        title: post.description
    });
    marker.addListener("click", () => showDetailModal(post));
    markers.push(marker);
}

// --- 投稿モーダルの処理 ---
function initPostModal() {
    const modal = document.getElementById('post-modal');
    const openBtn = document.getElementById('open-post-modal-btn');
    const closeBtn = modal.querySelector('.close-button');
    const fileInput = document.getElementById('photo-file');
    const submitBtn = document.getElementById('submit-post');

    openBtn.onclick = () => { modal.style.display = 'block'; };
    closeBtn.onclick = () => { modal.style.display = 'none'; };
    window.onclick = (event) => { if (event.target == modal) { modal.style.display = 'none'; } };

    fileInput.addEventListener('change', handleFileSelect);
    submitBtn.addEventListener('click', handleSubmitPost);
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    const exifInfoDiv = document.getElementById('exif-info');
    exifInfoDiv.style.display = 'none';
    currentPostData = null;
    if (!file) return;

    try {
        const exif = await exifr.parse(file);
        if (exif && exif.latitude && exif.longitude && exif.DateTimeOriginal) {
            currentPostData = {
                lat: exif.latitude,
                lng: exif.longitude,
                takenAt: exif.DateTimeOriginal
            };
            document.getElementById('taken-at').textContent = currentPostData.takenAt.toLocaleString('ja-JP');
            document.getElementById('latitude').textContent = currentPostData.lat.toFixed(6);
            document.getElementById('longitude').textContent = currentPostData.lng.toFixed(6);
            exifInfoDiv.style.display = 'block';
        } else {
            alert("この画像にはGPS情報または撮影日時が含まれていません。");
        }
    } catch (error) {
        console.error('Exif parsing error:', error);
        alert("Exif情報の解析に失敗しました。");
    }
}

function handleSubmitPost() {
    const file = document.getElementById('photo-file').files[0];
    const description = document.getElementById('photo-description').value;
    const user = auth.currentUser;

    if (!file || !description || !currentPostData || !user) {
        alert("GPS情報付きの写真を選択し、コメントを入力してください。");
        return;
    }

    const category = document.getElementById('category-select').value;
    const is360 = document.getElementById('is360-checkbox').checked;
    const progressEl = document.getElementById('upload-progress');
    this.disabled = true;
    progressEl.textContent = 'アップロード中...';

    const filePath = `images/${user.uid}/${Date.now()}_${file.name}`;
    const fileRef = storage.ref(filePath);
    const task = fileRef.put(file);

    task.on('state_changed', 
        snapshot => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            progressEl.textContent = 'アップロード中: ' + Math.round(progress) + '%';
        }, 
        error => {
            console.error(error);
            alert('アップロードに失敗しました。');
            this.disabled = false;
        }, 
        () => {
            task.snapshot.ref.getDownloadURL().then(downloadURL => {
                db.collection("posts").add({
                    imageUrl: downloadURL,
                    description: description,
                    category: category,
                    is360: is360,
                    lat: currentPostData.lat,
                    lng: currentPostData.lng,
                    takenAt: currentPostData.takenAt,
                    userId: user.uid,
                    userEmail: user.email
                }).then(() => {
                    alert("投稿しました！");
                    document.getElementById('post-modal').style.display = 'none';
                    resetPostForm();
                });
            });
        }
    );
}

function resetPostForm() {
    document.getElementById('photo-file').value = '';
    document.getElementById('photo-description').value = '';
    document.getElementById('is360-checkbox').checked = false;
    document.getElementById('exif-info').style.display = 'none';
    document.getElementById('upload-progress').textContent = '';
    document.getElementById('submit-post').disabled = false;
    currentPostData = null;
}

// --- 詳細表示モーダルの処理 ---
function showDetailModal(post) {
    const modal = document.getElementById('detail-modal');
    const closeBtn = modal.querySelector('.close-button');
    const viewerContainer = document.getElementById('viewer-container');

    // 以前のビューアが残っていれば削除
    while (viewerContainer.firstChild) {
        viewerContainer.removeChild(viewerContainer.firstChild);
    }
    
    document.getElementById('detail-taken-at').textContent = post.takenAt.toDate().toLocaleString('ja-JP');
    document.getElementById('detail-category').textContent = post.category;
    document.getElementById('detail-user').textContent = post.userEmail;
    document.getElementById('detail-description').textContent = post.description;

    if (post.is360) {
        const panorama = new PANOLENS.ImagePanorama(post.imageUrl);
        const viewer = new PANOLENS.Viewer({ container: viewerContainer });
        viewer.add(panorama);
    } else {
        viewerContainer.innerHTML = `<img src="${post.imageUrl}">`;
    }

    modal.style.display = 'block';
    closeBtn.onclick = () => { modal.style.display = 'none'; };
    window.onclick = (event) => { if (event.target == modal) { modal.style.display = 'none'; } };
}