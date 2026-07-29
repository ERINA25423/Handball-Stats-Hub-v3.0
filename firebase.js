/**
 * firebase.js
 * ------------------------------------------------------------------
 * Firebase(Authentication + Firestore)まわりを一手に引き受けるレイヤー。
 *
 * 提供するAPI(storage.js から呼ばれる想定):
 *   App.Firebase.getDb()               -> firebase.firestore() インスタンス、未設定/未ログイン時は null
 *   App.Firebase.getCurrentUser()      -> 現在ログイン中のユーザー、未ログインなら null
 *   App.Firebase.onAuthStateChanged(cb)-> ログイン状態が変わるたびに cb(user|null) を呼ぶ
 *
 * それ以外に、フッターの「Googleでログイン」「ログアウト」ボタンの
 * クリック処理もこのファイルが直接担当する。
 *
 * 使い方:
 *   1. 下の firebaseConfig を、自分の Firebase プロジェクトの値に書き換える
 *      (Firebaseコンソール > プロジェクトの設定 > 全般 > マイアプリ に表示される)
 *   2. main.js の起動処理で App.Firebase.init() を一番最初に呼ぶ
 *      (App.Storage.init() より前に呼ぶこと)
 *
 * firebaseConfig が未設定(プレースホルダのまま)の場合は、
 * ログイン機能を無効化した状態で安全に動作する(ローカル保存のみのアプリとして機能する)。
 * ------------------------------------------------------------------
 */

window.App = window.App || {};

App.Firebase = (function () {
  "use strict";

  // ================================================================
  // ▼▼▼ ここを自分の Firebase プロジェクトの設定値に書き換えてください ▼▼▼
  // ================================================================
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  };
  // ================================================================
  // ▲▲▲ ここまで ▲▲▲
  // ================================================================

  const PLACEHOLDER_VALUES = [
    "YOUR_API_KEY",
    "YOUR_PROJECT_ID",
    "YOUR_PROJECT_ID.firebaseapp.com",
    "YOUR_PROJECT_ID.appspot.com",
    "YOUR_SENDER_ID",
    "YOUR_APP_ID",
  ];

  let authInstance = null;
  let dbInstance = null;
  let currentUser = null;
  let isConfigured = false;
  const authListeners = [];

  /** firebaseConfig がまだ書き換えられていない(プレースホルダのまま)かどうか判定する */
  function isConfigFilledIn() {
    return !Object.values(firebaseConfig).some((v) => PLACEHOLDER_VALUES.includes(v));
  }

  /**
   * 初期化。main.js から起動時に一番最初に(App.Storage.init() より前に)呼ぶこと。
   * 設定が済んでいない/SDK未読み込みの場合は、警告を出しつつローカル保存のみで
   * 動作するようフォールバックする(例外は投げない)。
   */
  function init() {
    bindFooterButtons();

    if (typeof firebase === "undefined") {
      console.warn(
        "[Firebase] Firebase SDKが読み込まれていません(index.htmlのscriptタグを確認してください)。ログイン機能は無効化されます。"
      );
      updateAuthFooter(null);
      return;
    }

    if (!isConfigFilledIn()) {
      console.warn(
        "[Firebase] firebase.js の firebaseConfig がプレースホルダのままです。" +
          "実際の値に書き換えるまで、ログイン機能は無効化され、ローカル保存のみで動作します。"
      );
      updateAuthFooter(null);
      return;
    }

    try {
      firebase.initializeApp(firebaseConfig);
      authInstance = firebase.auth();
      dbInstance = firebase.firestore();
      isConfigured = true;

      authInstance.onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthFooter(user);
        notifyListeners(user);
      });
    } catch (err) {
      console.error("[Firebase] 初期化に失敗しました。ローカル保存のみで動作します。", err);
      isConfigured = false;
    }
  }

  /** 登録済みリスナー全員に通知する */
  function notifyListeners(user) {
    authListeners.forEach((cb) => {
      try {
        cb(user);
      } catch (err) {
        console.error("[Firebase] 認証状態リスナーの実行中にエラーが発生しました。", err);
      }
    });
  }

  /** フッターのログイン/ログアウトボタンにクリック処理を配線する */
  function bindFooterButtons() {
    const loginBtn = document.getElementById("btn-google-login");
    const logoutBtn = document.getElementById("btn-logout");

    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        loginBtn.disabled = true;
        try {
          await signInWithGoogle();
        } catch (err) {
          console.error("[Firebase] ログインに失敗しました。", err);
          alert("ログインに失敗しました。通信状況を確認して、もう一度お試しください。");
        } finally {
          loginBtn.disabled = false;
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        logoutBtn.disabled = true;
        try {
          await signOutUser();
        } catch (err) {
          console.error("[Firebase] ログアウトに失敗しました。", err);
        } finally {
          logoutBtn.disabled = false;
        }
      });
    }
  }

  /** ログイン状態に応じてフッターの表示を切り替える */
  function updateAuthFooter(user) {
    const loginBtn = document.getElementById("btn-google-login");
    const logoutBtn = document.getElementById("btn-logout");
    if (!loginBtn || !logoutBtn) return;

    if (user) {
      loginBtn.classList.add("hidden");
      logoutBtn.classList.remove("hidden");
      logoutBtn.textContent = (user.displayName ? user.displayName + " / " : "") + "ログアウト";
    } else {
      loginBtn.classList.remove("hidden");
      logoutBtn.classList.add("hidden");
    }
  }

  /** Googleポップアップでログインする(ポップアップがブロックされる場合はリダイレクトにフォールバック) */
  async function signInWithGoogle() {
    if (!isConfigured || !authInstance) {
      throw new Error(
        "Firebaseが設定されていません。firebase.js 内の firebaseConfig を実際の値に書き換えてください。"
      );
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await authInstance.signInWithPopup(provider);
    } catch (err) {
      const fallbackCodes = ["auth/popup-blocked", "auth/cancelled-popup-request", "auth/popup-closed-by-user"];
      if (err && fallbackCodes.includes(err.code)) {
        await authInstance.signInWithRedirect(provider);
        return;
      }
      throw err;
    }
  }

  /** ログアウトする */
  async function signOutUser() {
    if (!authInstance) return;
    await authInstance.signOut();
  }

  /** Firestore インスタンスを取得する(未設定/未ログインなら null) */
  function getDb() {
    return isConfigured ? dbInstance : null;
  }

  /** 現在ログイン中のユーザーを取得する(未ログインなら null) */
  function getCurrentUser() {
    return currentUser;
  }

  /**
   * 認証状態が変わるたびに呼ばれるリスナーを登録する。
   * 登録した瞬間の現在状態も1回コールバックしておく(呼び出し側の初期化を楽にするため)。
   */
  function onAuthStateChanged(callback) {
    authListeners.push(callback);
    try {
      callback(currentUser);
    } catch (err) {
      console.error("[Firebase] リスナー登録直後のコールバックでエラーが発生しました。", err);
    }
  }

  /** Firebaseが実際に設定・初期化済みかどうか */
  function isReady() {
    return isConfigured;
  }

  return {
    init,
    signInWithGoogle,
    signOutUser,
    getDb,
    getCurrentUser,
    onAuthStateChanged,
    isReady,
  };
})();  
