// ★★★ あなたのFirebase設定をここに貼り付け ★★★
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebaseを初期化
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();

// ログイン状態を監視
auth.onAuthStateChanged(user => {
    const currentPath = window.location.pathname;
    
    if (user) {
        // ユーザーがログインしている場合
        if (currentPath.endsWith('login.html') || currentPath === '/') {
            window.location.replace('index.html');
        }
    } else {
        // ユーザーがログインしていない場合
        if (!currentPath.endsWith('login.html')) {
            window.location.replace('login.html');
        }
    }
});

// ログインページの要素がある場合のみイベントリスナーを設定
if (document.getElementById('loginBtn')) {
    const loginBtn = document.getElementById('loginBtn');
    const signUpBtn = document.getElementById('signUpBtn');
    const emailField = document.getElementById('email');
    const passwordField = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');

    // ログイン処理
    loginBtn.addEventListener('click', () => {
        auth.signInWithEmailAndPassword(emailField.value, passwordField.value)
            .catch(error => {
                errorMessage.textContent = 'ログインに失敗しました: ' + error.message;
            });
    });

    // 新規登録処理
    signUpBtn.addEventListener('click', () => {
        auth.createUserWithEmailAndPassword(emailField.value, passwordField.value)
            .catch(error => {
                errorMessage.textContent = '新規登録に失敗しました: ' + error.message;
            });
    });
}