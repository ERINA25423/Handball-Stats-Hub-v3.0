/**
 * storage.js
 * ------------------------------------------------------------------
 * 試合データの保存・読み込みを担当するレイヤー。
 *
 * 方針:
 *  - 常に localStorage に即時保存する(未ログインでも使える / オフライン対応 / 高速な体感速度)
 *  - ログイン中(Google等)は Firestore にも書き込む
 *      パス: users/{uid}/matches/{matchId}
 *  - ログインした瞬間、それまでローカルにしかなかった試合を自動でクラウドへアップロードする
 *  - Firestore への書き込みが失敗した場合(オフライン等)は syncStatus を 'pending' にして
 *    ローカルに残し、次回オンライン復帰・再ログイン時に再送する
 *
 * このファイルは firebase.js が公開する想定のインターフェースに依存する:
 *   App.Firebase.getDb()              -> firebase.firestore() インスタンス (未初期化なら null)
 *   App.Firebase.getCurrentUser()     -> { uid, displayName, ... } もしくは null
 *   App.Firebase.onAuthStateChanged(cb) -> ログイン状態が変わるたびに cb(user|null) を呼ぶ
 *
 * firebase.js がまだ読み込まれていない/初期化されていない場合でも、
 * このファイルはローカル保存のみで問題なく動作する(常にガードして呼び出す)。
 * ------------------------------------------------------------------
 */

window.App = window.App || {};

App.Storage = (function () {
  "use strict";

  const LOCAL_STORAGE_KEY = "hsh_matches_v1";

 // ------------------------------------------------------------------
  // 内部ユーティリティ
  // ------------------------------------------------------------------

  /** 試合IDを新規発行する */
  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "m_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  /** localStorage から全試合を読み込む(壊れていても落ちない) */
  function readLocalRaw() {
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("[Storage] ローカルデータの読み込みに失敗しました。空配列で継続します。", err);
      return [];
    }
  }

  /** localStorage へ全試合を書き戻す */
  function writeLocalRaw(matches) {
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(matches));
      return true;
    } catch (err) {
      // 容量オーバーやプライベートモードなどで失敗することがある
      console.warn("[Storage] ローカル保存に失敗しました。", err);
      return false;
    }
  }

  /** id が一致する試合を置き換え(なければ先頭に追加)して保存する */
  function upsertLocal(match) {
    const all = readLocalRaw();
    const idx = all.findIndex((m) => m.id === match.id);
    if (idx >= 0) {
      all[idx] = match;
    } else {
      all.unshift(match);
    }
    writeLocalRaw(all);
    return all;
  }

  /** 更新日時の新しい順に並べ替える */
  function sortMatches(matches) {
    return [...matches].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /** 現在のログインユーザーを安全に取得する(firebase.js未準備でも例外にしない) */
  function getCurrentUserSafe() {
    try {
      if (App.Firebase && typeof App.Firebase.getCurrentUser === "function") {
        return App.Firebase.getCurrentUser();
      }
    } catch (err) {
      console.warn("[Storage] getCurrentUser の呼び出しに失敗しました。", err);
    }
    return null;
  }

  /** Firestore インスタンスを安全に取得する */
  function getDbSafe() {
    try {
      if (App.Firebase && typeof App.Firebase.getDb === "function") {
        return App.Firebase.getDb();
      }
    } catch (err) {
      console.warn("[Storage] getDb の呼び出しに失敗しました。", err);
    }
    return null;
  }

  /** Firestore へ1試合分を書き込む(merge保存) */
  async function cloudSaveMatch(uid, match) {
    const db = getDbSafe();
    if (!db) throw new Error("Firestore is not ready");
    await db
      .collection("users")
      .doc(uid)
      .collection("matches")
      .doc(match.id)
      .set(match, { merge: true });
  }

  /** Firestore から1試合分を削除する */
  async function cloudDeleteMatch(uid, matchId) {
    const db = getDbSafe();
    if (!db) throw new Error("Firestore is not ready");
    await db.collection("users").doc(uid).collection("matches").doc(matchId).delete();
  }

  /** Firestore からそのユーザーの全試合を取得する */
  async function cloudFetchMatches(uid) {
    const db = getDbSafe();
    if (!db) throw new Error("Firestore is not ready");
    const snap = await db.collection("users").doc(uid).collection("matches").get();
    return snap.docs.map((doc) => doc.data());
  }

  /**
   * ローカルとクラウドのデータをマージする。
   * 同じ id の場合、ローカルが 'pending'(まだ送信できていない編集)なら
   * ローカル側を優先し、クラウドの内容で上書きしてしまわないようにする。
   */
  function mergeMatches(local, cloud) {
    const map = new Map();
    cloud.forEach((m) => map.set(m.id, m));
    local.forEach((m) => {
      const existing = map.get(m.id);
      if (!existing) {
        // クラウドにまだ存在しない = 未送信のローカル試合
        map.set(m.id, m);
      } else if (m.syncStatus === "pending" && (m.updatedAt || 0) >= (existing.updatedAt || 0)) {
        // ローカルの方が新しい未送信編集を持っている
        map.set(m.id, m);
      }
    });
    return Array.from(map.values());
  }

     // ------------------------------------------------------------------
  // 公開 API
  // ------------------------------------------------------------------

  /**
   * 試合を保存する(新規 / 更新どちらも)。
   * 常にローカルへ即保存し、ログイン中ならクラウドへも書き込みを試みる。
   * @param {Object} match 保存したい試合オブジェクト(id が無ければ新規発行される)
   * @returns {Promise<Object>} 保存後の match(id・timestamps・syncStatus 反映済み)
   */
  async function saveMatch(match) {
    const now = Date.now();
    const toSave = Object.assign({}, match);

    if (!toSave.id) toSave.id = generateId();
    toSave.createdAt = toSave.createdAt || now;
    toSave.updatedAt = now;

    const user = getCurrentUserSafe();
    toSave.ownerUid = user ? user.uid : toSave.ownerUid || null;
    toSave.syncStatus = "local";

    // まずは楽観的にローカル保存(オフラインでも即座に反映される)
    upsertLocal(toSave);

    if (user) {
      try {
        await cloudSaveMatch(user.uid, toSave);
        toSave.syncStatus = "synced";
      } catch (err) {
        console.warn("[Storage] クラウド保存に失敗しました。ローカルに保留として残します。", err);
        toSave.syncStatus = "pending";
      }
      upsertLocal(toSave);
    }

    return toSave;
  }

  /**
   * 全試合を取得する(新しい順)。
   * ログイン中はクラウドを正として取得し、ローカルキャッシュも更新する。
   * クラウド取得に失敗した場合はローカルキャッシュにフォールバックする。
   */
  async function getMatches() {
    const local = readLocalRaw();
    const user = getCurrentUserSafe();

    if (!user) {
      return sortMatches(local);
    }

    try {
      const cloud = await cloudFetchMatches(user.uid);
      const merged = mergeMatches(local, cloud);
      writeLocalRaw(merged);
      return sortMatches(merged);
    } catch (err) {
      console.warn("[Storage] クラウド取得に失敗しました。ローカルキャッシュを使用します。", err);
      return sortMatches(local);
    }
  }

  /** id を指定して1試合を取得する */
  async function getMatch(matchId) {
    const matches = await getMatches();
    return matches.find((m) => m.id === matchId) || null;
  }

  /** 試合を削除する(ローカル・クラウド両方) */
  async function deleteMatch(matchId) {
    const local = readLocalRaw().filter((m) => m.id !== matchId);
    writeLocalRaw(local);

    const user = getCurrentUserSafe();
    if (user) {
      try {
        await cloudDeleteMatch(user.uid, matchId);
      } catch (err) {
        console.warn("[Storage] クラウド削除に失敗しました(ローカルからは削除済み)。", err);
      }
    }
  }

  /**
   * ログイン直後に呼び出す想定。
   * まだクラウドに同期されていない(local / pending / 所有者未確定)ローカル試合を
   * そのユーザーの Firestore へアップロードする。
   */
  async function syncLocalToCloud(uid) {
    const local = readLocalRaw();
    const needsUpload = local.filter(
      (m) => m.syncStatus !== "synced" || !m.ownerUid || m.ownerUid !== uid
    );

    for (const match of needsUpload) {
      const toUpload = Object.assign({}, match, { ownerUid: uid, updatedAt: Date.now() });
      try {
        await cloudSaveMatch(uid, toUpload);
        toUpload.syncStatus = "synced";
      } catch (err) {
        console.warn("[Storage] ログイン時同期に失敗した試合があります。後で再試行されます。", err);
        toUpload.syncStatus = "pending";
      }
      upsertLocal(toUpload);
    }
  }

  /**
   * 初期化。main.js から起動時に1度呼び出す。
   * firebase.js がログイン状態の変化を通知してくれる場合、
   * ログインを検知したら自動でローカル→クラウド同期を行う。
   */
  function init() {
    try {
      if (App.Firebase && typeof App.Firebase.onAuthStateChanged === "function") {
        App.Firebase.onAuthStateChanged((user) => {
          if (user) {
            syncLocalToCloud(user.uid).catch((err) => {
              console.warn("[Storage] 自動同期中にエラーが発生しました。", err);
            });
          }
        });
      }
    } catch (err) {
      console.warn("[Storage] 認証状態リスナーの登録に失敗しました。ローカル保存のみで継続します。", err);
    }
  }

  return {
    init,
    generateId,
    saveMatch,
    getMatches,
    getMatch,
    deleteMatch,
    syncLocalToCloud,
    STORAGE_KEY: LOCAL_STORAGE_KEY,
  };
})();

               
