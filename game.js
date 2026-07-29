/**
 * game.js
 * ------------------------------------------------------------------
 * 「記録画面(screen-record)」のロジックを担当するレイヤー。
 *
 * 責務:
 *  - NEW MATCH フォーム(日付/自チーム名/対戦相手名)から試合を開始する
 *  - MY TEAM / OPPONENT の切り替え
 *  - POSITION(背番号込み) / SHOT COURSE / SHOT TYPE / RESULT の選択状態管理
 *  - SAVE EVENT: 選択内容を1イベントとして currentMatch.events に追加し即保存
 *  - UNDO: 直前に追加したイベントを取り消す
 *  - OTHER: ミス(ターンオーバー等)をイベントとして記録するモーダル
 *  - HISTORY: 今の試合で記録済みのイベント一覧(個別削除可)をモーダル表示
 *  - END & SAVE MATCH: 試合を確定保存してホームへ戻る
 *
 * 依存:
 *  - App.Storage (storage.js) … saveMatch / generateId
 *  - App.Timer   (timer.js)   … getElapsedSeconds / getHalf / reset
 * ------------------------------------------------------------------
 */

window.App = window.App || {};

// ------------------------------------------------------------------
// 画面切り替え共通ユーティリティ(main.js からも利用する)
// ------------------------------------------------------------------
App.UI = App.UI || {};
App.UI.showScreen = function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const target = document.getElementById(screenId);
  if (target) target.classList.add("active");
};

App.Game = (function () {
  "use strict";

  const POSITIONS = ["LW", "PV", "RW", "LB", "CB", "RB", "GK", "EP"];

  const MISTAKE_SUBTYPES = [
    { key: "offensive_foul", label: "オフェンスファウル" },
    { key: "steps", label: "ステップ" },
    { key: "pass_catch", label: "パス/キャッチミス" },
    { key: "other", label: "その他" },
  ];

  // ------------------------------------------------------------------
  // 内部状態
  // ------------------------------------------------------------------

  let currentMatch = null; // 記録中の試合オブジェクト

  let selectedTeam = "my"; // 'my' | 'opponent'
  let selectedPosition = null;
  let selectedCourse = null;
  let selectedShotType = null;
  let selectedResult = null;

  // ポジションごとの背番号は自チーム/相手チームで別々に保持する
  let positionNumbers = {
    my: emptyPositionMap(),
    opponent: emptyPositionMap(),
  };

  function emptyPositionMap() {
    const map = {};
    POSITIONS.forEach((p) => (map[p] = ""));
    return map;
  }

  // ------------------------------------------------------------------
  // DOM参照
  // ------------------------------------------------------------------

  function els() {
    return {
      // NEW MATCH screen
      inputDate: document.getElementById("input-date"),
      inputMyTeam: document.getElementById("input-my-team"),
      inputOpponent: document.getElementById("input-opponent"),
      matchStatusLabel: document.getElementById("match-status-label"),
      btnGotoNewMatch: document.getElementById("btn-goto-new-match"),
      btnBackFromNewMatch: document.getElementById("btn-back-from-new-match"),
      btnStartMatch: document.getElementById("btn-start-match"),

      // RECORD screen
      btnTeamMy: document.getElementById("btn-team-my"),
      btnTeamOpponent: document.getElementById("btn-team-opponent"),
      positionGrid: document.getElementById("position-grid"),
      courseGrid: document.getElementById("course-grid"),
      typeButtons: document.querySelectorAll(".type-btn"),
      resultButtons: document.querySelectorAll(".result-btn"),
      btnOther: document.getElementById("btn-other"),
      btnInMatchHistory: document.getElementById("btn-inmatch-history"),
      btnUndo: document.getElementById("btn-undo"),
      btnSaveEvent: document.getElementById("btn-save-event"),
      btnEndMatch: document.getElementById("btn-end-match"),

      // Modal
      modalOverlay: document.getElementById("modal-overlay"),
      modalContent: document.getElementById("modal-content"),
      modalClose: document.getElementById("modal-close"),
    };
  }

           // ------------------------------------------------------------------
  // NEW MATCH → START MATCH
  // ------------------------------------------------------------------

  function resetNewMatchForm() {
    const { inputDate, inputMyTeam, inputOpponent, matchStatusLabel } = els();
    if (inputDate) inputDate.value = "";
    if (inputMyTeam) inputMyTeam.value = "";
    if (inputOpponent) inputOpponent.value = "";
    if (matchStatusLabel) matchStatusLabel.textContent = "NO MATCH STARTED";
  }

  function handleGotoNewMatch() {
    resetNewMatchForm();
    App.UI.showScreen("screen-new-match");
  }

  function handleStartMatch() {
    const { inputDate, inputMyTeam, inputOpponent } = els();

    currentMatch = {
      id: App.Storage.generateId(),
      date: (inputDate && inputDate.value) || "",
      myTeam: (inputMyTeam && inputMyTeam.value.trim()) || "",
      opponentName: (inputOpponent && inputOpponent.value.trim()) || "",
      events: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 選択状態をすべて初期化
    selectedTeam = "my";
    selectedPosition = null;
    selectedCourse = null;
    selectedShotType = null;
    selectedResult = null;
    positionNumbers = { my: emptyPositionMap(), opponent: emptyPositionMap() };

    App.Timer.reset();
    renderAllSelectionStates();
    App.UI.showScreen("screen-record");

    // 開始直後の状態を即座に保存しておく(記録中の不慮の終了でも失われないように)
    persistCurrentMatch();
  }

  // ------------------------------------------------------------------
  // MY TEAM / OPPONENT 切り替え
  // ------------------------------------------------------------------

  function handleTeamToggle(team) {
    selectedTeam = team;
    const { btnTeamMy, btnTeamOpponent } = els();
    if (btnTeamMy) btnTeamMy.classList.toggle("active", team === "my");
    if (btnTeamOpponent) btnTeamOpponent.classList.toggle("active", team === "opponent");
    renderPositionNumberInputs();
  }

  // ------------------------------------------------------------------
  // POSITION
  // ------------------------------------------------------------------

  function bindPositionGrid() {
    const { positionGrid } = els();
    if (!positionGrid) return;

    // ボタン本体クリック → そのポジションを選択状態にする
    positionGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".position-btn");
      if (!btn) return;
      selectedPosition = btn.dataset.position;
      renderPositionSelection();
    });

    // 背番号入力欄への入力 → 現在選択中チーム側のポジション別背番号として保持
    positionGrid.querySelectorAll(".number-input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const pos = e.target.dataset.positionNumber;
        positionNumbers[selectedTeam][pos] = e.target.value;
      });
    });
  }

  function renderPositionSelection() {
    const { positionGrid } = els();
    if (!positionGrid) return;
    positionGrid.querySelectorAll(".position-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.position === selectedPosition);
    });
  }

  /** チーム切り替え時に、対応する側の背番号を各ポジションの入力欄へ反映する */
  function renderPositionNumberInputs() {
    const { positionGrid } = els();
    if (!positionGrid) return;
    positionGrid.querySelectorAll(".number-input").forEach((input) => {
      const pos = input.dataset.positionNumber;
      input.value = positionNumbers[selectedTeam][pos] || "";
    });
  }

   // ------------------------------------------------------------------
  // SHOT COURSE
  // ------------------------------------------------------------------

  function bindCourseGrid() {
    const { courseGrid } = els();
    if (!courseGrid) return;
    courseGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".course-btn");
      if (!btn) return;
      selectedCourse = btn.dataset.course;
      renderCourseSelection();
    });
  }

  function renderCourseSelection() {
    const { courseGrid } = els();
    if (!courseGrid) return;
    courseGrid.querySelectorAll(".course-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.course === selectedCourse);
    });
  }

  // ------------------------------------------------------------------
  // SHOT TYPE
  // ------------------------------------------------------------------

  function bindTypeButtons() {
    els().typeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedShotType = btn.dataset.shotType;
        renderTypeSelection();
      });
    });
  }

  function renderTypeSelection() {
    els().typeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.shotType === selectedShotType);
    });
  }

  // ------------------------------------------------------------------
  // RESULT
  // ------------------------------------------------------------------

  function bindResultButtons() {
    els().resultButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedResult = btn.dataset.result;
        renderResultSelection();
      });
    });
  }

  function renderResultSelection() {
    els().resultButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.result === selectedResult);
    });
  }

  // ------------------------------------------------------------------
  // 選択状態の一括反映(START MATCH直後などに呼ぶ)
  // ------------------------------------------------------------------

  function renderAllSelectionStates() {
    const { btnTeamMy, btnTeamOpponent } = els();
    if (btnTeamMy) btnTeamMy.classList.toggle("active", selectedTeam === "my");
    if (btnTeamOpponent) btnTeamOpponent.classList.toggle("active", selectedTeam === "opponent");
    renderPositionNumberInputs();
    renderPositionSelection();
    renderCourseSelection();
    renderTypeSelection();
    renderResultSelection();
  }

  /** SAVE EVENT後は「結果に関わる選択」だけをクリアし、次の入力に備える */
  function clearShotSelections() {
    selectedPosition = null;
    selectedCourse = null;
    selectedShotType = null;
    selectedResult = null;
    renderPositionSelection();
    renderCourseSelection();
    renderTypeSelection();
    renderResultSelection();

    
// ------------------------------------------------------------------
  // 保存(localStorage / Firestore へ)
  // ------------------------------------------------------------------

  function persistCurrentMatch() {
    if (!currentMatch) return;
    App.Storage.saveMatch(currentMatch).catch((err) => {
      console.error("[Game] 試合データの保存に失敗しました。", err);
    });
  }

  // ------------------------------------------------------------------
  // SAVE EVENT
  // ------------------------------------------------------------------

  function handleSaveEvent() {
    if (!currentMatch) return;

    if (!selectedPosition || !selectedCourse || !selectedShotType || !selectedResult) {
      alert("POSITION・SHOT COURSE・SHOT TYPE・RESULT をすべて選択してください。");
      return;
    }

    const number = positionNumbers[selectedTeam][selectedPosition] || "";

    const event = {
      id: App.Storage.generateId(),
      type: "shot",
      team: selectedTeam,
      position: selectedPosition,
      number,
      shotCourse: selectedCourse,
      shotType: selectedShotType,
      result: selectedResult,
      half: App.Timer.getHalf(),
      time: App.Timer.getElapsedSeconds(),
      createdAt: Date.now(),
    };

    currentMatch.events.push(event);
    currentMatch.updatedAt = Date.now();
    persistCurrentMatch();
    clearShotSelections();
  }

  // ------------------------------------------------------------------
  // UNDO
  // ------------------------------------------------------------------

  function handleUndo() {
    if (!currentMatch || currentMatch.events.length === 0) {
      alert("取り消せるイベントがありません。");
      return;
    }
    currentMatch.events.pop();
    currentMatch.updatedAt = Date.now();
    persistCurrentMatch();
  }

  // ------------------------------------------------------------------
  // モーダル共通ヘルパー
  // ------------------------------------------------------------------

  function openModal(html) {
    const { modalOverlay, modalContent } = els();
    if (!modalOverlay || !modalContent) return;
    modalContent.innerHTML = html;
    modalOverlay.classList.remove("hidden");
  }

  function closeModal() {
    const { modalOverlay, modalContent } = els();
    if (!modalOverlay || !modalContent) return;
    modalOverlay.classList.add("hidden");
    modalContent.innerHTML = "";
  }

  function bindModalDismiss() {
    const { modalOverlay, modalClose } = els();
    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modalOverlay) {
      modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
      });
    }
  }

  /** モーダル内のクリックをイベント委譲で一括処理する(内容が差し替わっても再バインド不要) */
  function bindModalContentDelegation() {
    const { modalContent } = els();
    if (!modalContent) return;

    modalContent.addEventListener("click", (e) => {
      const mistakeBtn = e.target.closest("[data-mistake-subtype]");
      if (mistakeBtn) {
        handleLogMistake(mistakeBtn.dataset.mistakeSubtype);
        return;
      }

      const delBtn = e.target.closest('[data-action="delete-event"]');
      if (delBtn) {
        handleDeleteEvent(delBtn.dataset.eventId);
        return;
      }
    });
  }

    // ------------------------------------------------------------------
  // OTHER(ミス記録)
  // ------------------------------------------------------------------

  function handleOpenOther() {
    if (!currentMatch) return;
    const teamLabel = selectedTeam === "my" ? (currentMatch.myTeam || "MY TEAM") : (currentMatch.opponentName || "OPPONENT");

    const buttonsHtml = MISTAKE_SUBTYPES.map(
      (m) => `<button class="btn btn-modal-option" data-mistake-subtype="${m.key}">${m.label}</button>`
    ).join("");

    openModal(`
      <h3 class="modal-title">OTHER — ${escapeHtml(teamLabel)} のミスを記録</h3>
      <div class="modal-option-list">${buttonsHtml}</div>
    `);
  }

  function handleLogMistake(subtypeKey) {
    if (!currentMatch) return;
    const subtype = MISTAKE_SUBTYPES.find((m) => m.key === subtypeKey);

    const event = {
      id: App.Storage.generateId(),
      type: "mistake",
      team: selectedTeam,
      subtype: subtypeKey,
      subtypeLabel: subtype ? subtype.label : subtypeKey,
      half: App.Timer.getHalf(),
      time: App.Timer.getElapsedSeconds(),
      createdAt: Date.now(),
    };

    currentMatch.events.push(event);
    currentMatch.updatedAt = Date.now();
    persistCurrentMatch();
    closeModal();
  }

  // ------------------------------------------------------------------
  // HISTORY(試合中のイベント一覧)
  // ------------------------------------------------------------------

  function handleOpenInMatchHistory() {
    if (!currentMatch) return;
    renderInMatchHistoryModal();
  }

  function renderInMatchHistoryModal() {
    if (!currentMatch) return;

    const events = [...currentMatch.events].reverse();

    if (events.length === 0) {
      openModal(`
        <h3 class="modal-title">HISTORY</h3>
        <p class="modal-empty">まだイベントが記録されていません。</p>
      `);
      return;
    }

    const rows = events
      .map((ev) => {
        const teamLabel = ev.team === "my" ? "MY" : "OPP";
        const timeLabel = formatMmSs(ev.time) + " / H" + ev.half;

        if (ev.type === "mistake") {
          return `
            <div class="history-row">
              <div class="history-row-main">
                <span class="history-badge history-badge-mistake">MISS</span>
                <span>${teamLabel} ・ ${escapeHtml(ev.subtypeLabel || "")}</span>
              </div>
              <div class="history-row-sub">
                <span>${timeLabel}</span>
                <button class="history-delete" data-action="delete-event" data-event-id="${ev.id}">×</button>
              </div>
            </div>
          `;
        }

        return `
          <div class="history-row">
            <div class="history-row-main">
              <span class="history-badge history-badge-${(ev.result || "").toLowerCase()}">${ev.result}</span>
              <span>${teamLabel} ・ ${escapeHtml(ev.position)}${ev.number ? " #" + escapeHtml(ev.number) : ""} ・ ${escapeHtml(ev.shotCourse)} ・ ${escapeHtml(ev.shotType)}</span>
            </div>
            <div class="history-row-sub">
              <span>${timeLabel}</span>
              <button class="history-delete" data-action="delete-event" data-event-id="${ev.id}">×</button>
            </div>
          </div>
        `;
      })
      .join("");

    openModal(`
      <h3 class="modal-title">HISTORY(${events.length}件)</h3>
      <div class="history-modal-list">${rows}</div>
    `);
  }

  function handleDeleteEvent(eventId) {
    if (!currentMatch) return;
    const confirmed = window.confirm("このイベントを削除しますか?");
    if (!confirmed) return;

    currentMatch.events = currentMatch.events.filter((ev) => ev.id !== eventId);
    currentMatch.updatedAt = Date.now();
    persistCurrentMatch();
    renderInMatchHistoryModal(); // モーダルの内容を再描画
  }

  // ------------------------------------------------------------------
  // END & SAVE MATCH
  // ------------------------------------------------------------------

  function handleEndMatch() {
    if (!currentMatch) return;

    const confirmed = window.confirm("試合を終了して保存しますか?");
    if (!confirmed) return;

    currentMatch.updatedAt = Date.now();

    App.Storage.saveMatch(currentMatch)
      .catch((err) => {
        console.error("[Game] 試合の最終保存に失敗しました(ローカルには保存済みです)。", err);
      })
      .finally(() => {
        currentMatch = null;
        App.Timer.reset();
        clearShotSelections();
        App.UI.showScreen("screen-home");
      });

    // ------------------------------------------------------------------
  // 共通ヘルパー
  // ------------------------------------------------------------------

  function formatMmSs(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds || 0));
    const mm = Math.floor(safe / 60);
    const ss = safe % 60;
    return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCurrentMatch() {
    return currentMatch;
  }

  // ------------------------------------------------------------------
  // 初期化
  // ------------------------------------------------------------------

  function init() {
    const { btnGotoNewMatch, btnBackFromNewMatch, btnStartMatch, btnTeamMy, btnTeamOpponent, btnOther, btnInMatchHistory, btnUndo, btnSaveEvent, btnEndMatch } =
      els();

    if (btnGotoNewMatch) btnGotoNewMatch.addEventListener("click", handleGotoNewMatch);
    if (btnBackFromNewMatch) btnBackFromNewMatch.addEventListener("click", () => App.UI.showScreen("screen-home"));
    if (btnStartMatch) btnStartMatch.addEventListener("click", handleStartMatch);

    if (btnTeamMy) btnTeamMy.addEventListener("click", () => handleTeamToggle("my"));
    if (btnTeamOpponent) btnTeamOpponent.addEventListener("click", () => handleTeamToggle("opponent"));

    bindPositionGrid();
    bindCourseGrid();
    bindTypeButtons();
    bindResultButtons();

    if (btnOther) btnOther.addEventListener("click", handleOpenOther);
    if (btnInMatchHistory) btnInMatchHistory.addEventListener("click", handleOpenInMatchHistory);
    if (btnUndo) btnUndo.addEventListener("click", handleUndo);
    if (btnSaveEvent) btnSaveEvent.addEventListener("click", handleSaveEvent);
    if (btnEndMatch) btnEndMatch.addEventListener("click", handleEndMatch);

    bindModalDismiss();
    bindModalContentDelegation();
  }

  return {
    init,
    getCurrentMatch,
  };
})();
  }



            
