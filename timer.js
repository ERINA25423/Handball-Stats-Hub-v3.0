/**
 * timer.js
 * ------------------------------------------------------------------
 * 試合タイマーの状態管理を担当するレイヤー。
 *
 * 責務:
 *  - 経過秒数のカウントアップ(START/PAUSE)
 *  - -10s / -1s / +1s / +10s による手動調整
 *  - CHANGE HALF によるハーフ切り替え(タイマーは 00:00 にリセットされる)
 *  - #timer-display / #half-label への表示反映
 *  - game.js がイベント保存時に「今の経過時間・ハーフ」を取得できるAPI提供
 *
 * このファイルは DOM(#timer-display, #half-label, 各種ボタン)に直接依存する。
 * ------------------------------------------------------------------
 */

window.App = window.App || {};

App.Timer = (function () {
  "use strict";

  let elapsedSeconds = 0; // 現在のハーフでの経過秒数
  let half = 1; // 1 = 前半, 2 = 後半
  let running = false;
  let intervalId = null;

  const halfChangeListeners = [];
  const tickListeners = [];

   // ------------------------------------------------------------------
  // 内部ユーティリティ
  // ------------------------------------------------------------------

  function els() {
    return {
      display: document.getElementById("timer-display"),
      halfLabel: document.getElementById("half-label"),
      startBtn: document.getElementById("btn-timer-start"),
      minus10Btn: document.getElementById("btn-timer-minus10"),
      minus1Btn: document.getElementById("btn-timer-minus1"),
      plus1Btn: document.getElementById("btn-timer-plus1"),
      plus10Btn: document.getElementById("btn-timer-plus10"),
      changeHalfBtn: document.getElementById("btn-change-half"),
    };
  }

  /** 秒数を "mm:ss" 形式にフォーマットする */
  function formatTime(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const mm = Math.floor(safe / 60);
    const ss = safe % 60;
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
  }

  /** 画面表示を現在の内部状態に合わせて更新する */
  function render() {
    const { display, halfLabel, startBtn } = els();

    if (display) display.textContent = formatTime(elapsedSeconds);
    if (halfLabel) halfLabel.textContent = half === 1 ? "1st Half" : "2nd Half";

    if (startBtn) {
      startBtn.textContent = running ? "PAUSE" : "START";
      startBtn.classList.toggle("is-running", running);
    }
  }

  function notifyTick() {
    tickListeners.forEach((cb) => {
      try {
        cb({ elapsedSeconds, half });
      } catch (err) {
        console.error("[Timer] tickリスナーでエラーが発生しました。", err);
      }
    });
  }

  function notifyHalfChange() {
    halfChangeListeners.forEach((cb) => {
      try {
        cb({ half });
      } catch (err) {
        console.error("[Timer] halfChangeリスナーでエラーが発生しました。", err);
      }
    });
  }

  // ------------------------------------------------------------------
  // タイマー本体
  // ------------------------------------------------------------------

  function tick() {
    elapsedSeconds += 1;
    render();
    notifyTick();
  }

  function start() {
    if (running) return;
    running = true;
    intervalId = window.setInterval(tick, 1000);
    render();
  }

  function pause() {
    if (!running) return;
    running = false;
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    render();
  }

  function toggle() {
    if (running) {
      pause();
    } else {
      start();
    }
  }

  /** 秒数を加減する(0未満にはならない) */
  function adjust(deltaSeconds) {
    elapsedSeconds = Math.max(0, elapsedSeconds + deltaSeconds);
    render();
  }

  /**
   * ハーフを切り替える(1 <-> 2)。
   * タイマーは 00:00 にリセットされ、一時停止状態になる。
   * 誤操作防止のため確認ダイアログを出す。
   */
  function changeHalf() {
    const confirmed = window.confirm(
      "ハーフを切り替えますか?タイマーは 00:00 にリセットされ、一時停止します。"
    );
    if (!confirmed) return;

    pause();
    half = half === 1 ? 2 : 1;
    elapsedSeconds = 0;
    render();
    notifyHalfChange();
  }

  /** 完全リセット(新しい試合を開始するとき用) */
  function reset() {
    pause();
    elapsedSeconds = 0;
    half = 1;
    render();
  }

  /**
   * 保存済み試合を開き直す場合など、外部から状態を復元するためのAPI。
   * @param {{elapsedSeconds?: number, half?: 1|2}} state
   */
  function restoreState(state) {
    pause();
    if (state && typeof state.elapsedSeconds === "number") {
      elapsedSeconds = Math.max(0, Math.floor(state.elapsedSeconds));
    } else {
      elapsedSeconds = 0;
    }
    if (state && (state.half === 1 || state.half === 2)) {
      half = state.half;
    } else {
      half = 1;
    }
    render();
  }

  /** 現在の状態を取得する(match保存時に一緒に保存したい場合などに使う) */
  function getState() {
    return { elapsedSeconds, half, running };
  }

  function getElapsedSeconds() {
    return elapsedSeconds;
  }

  function getFormattedTime() {
    return formatTime(elapsedSeconds);
  }

  function getHalf() {
    return half;
  }

  function isRunning() {
    return running;
  }

  /** 経過秒数が変わるたびに呼ばれるリスナーを登録する */
  function onTick(callback) {
    tickListeners.push(callback);
  }

  /** ハーフが切り替わるたびに呼ばれるリスナーを登録する */
  function onHalfChange(callback) {
    halfChangeListeners.push(callback);
  }

  // ------------------------------------------------------------------
  // 初期化(ボタンへのイベント配線)
  // ------------------------------------------------------------------

  function init() {
    const { startBtn, minus10Btn, minus1Btn, plus1Btn, plus10Btn, changeHalfBtn } = els();

    if (startBtn) startBtn.addEventListener("click", toggle);
    if (minus10Btn) minus10Btn.addEventListener("click", () => adjust(-10));
    if (minus1Btn) minus1Btn.addEventListener("click", () => adjust(-1));
    if (plus1Btn) plus1Btn.addEventListener("click", () => adjust(1));
    if (plus10Btn) plus10Btn.addEventListener("click", () => adjust(10));
    if (changeHalfBtn) changeHalfBtn.addEventListener("click", changeHalf);

    render();
  }

  return {
    init,
    start,
    pause,
    toggle,
    adjust,
    changeHalf,
    reset,
    restoreState,
    getState,
    getElapsedSeconds,
    getFormattedTime,
    getHalf,
    isRunning,
    onTick,
    onHalfChange,
  };
})();            
