/**
 * game.js
 * ==============================================================
 * Handball Stats Hub
 * Game Logic
 * ==============================================================
 */

window.App = window.App || {};

/* ==============================================================
   Screen Utility
   ============================================================== */

App.UI = App.UI || {};

App.UI.showScreen = function (screenId) {

  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(screenId);

  if (target) {
    target.classList.add("active");
  }

};

/* ==============================================================
   Game Module
   ============================================================== */

App.Game = (function () {

  "use strict";

  /* ==========================================================
     Constants
     ========================================================== */

  const POSITIONS = [
    "LW",
    "PV",
    "RW",
    "LB",
    "CB",
    "RB",
    "GK",
    "EP"
  ];

  const MISTAKE_TYPES = [
    {
      key: "offensive_foul",
      label: "オフェンスファウル"
    },
    {
      key: "steps",
      label: "ステップ"
    },
    {
      key: "pass_catch",
      label: "パス・キャッチミス"
    },
    {
      key: "other",
      label: "その他"
    }
  ];

  /* ==========================================================
     Internal State
     ========================================================== */

  let currentMatch = null;

  let selectedTeam = "my";

  let selectedPosition = null;

  let selectedCourse = null;

  let selectedShotType = null;

  let selectedResult = null;

              let positionNumbers = {
    my: {},
    opponent: {}
  };

  /* ==========================================================
     Utility
     ========================================================== */

  function emptyPositionMap() {

    const map = {};

    POSITIONS.forEach(position => {
      map[position] = "";
    });

    return map;

  }

  function clone(value) {

    return JSON.parse(JSON.stringify(value));

  }

  function nowISO() {

    return new Date().toISOString();

  }

  /* ==========================================================
     DOM
     ========================================================== */

  function els() {

    return {

      btnGotoNewMatch:
        document.getElementById("btn-goto-new-match"),

      btnStartMatch:
        document.getElementById("btn-start-match"),

      btnBackHome:
        document.getElementById("btn-back-home"),

      matchDate:
        document.getElementById("match-date"),

      opponentName:
        document.getElementById("opponent-name"),

      venue:
        document.getElementById("venue"),

      firstTeamToggle:
        document.getElementById("team-toggle"),

      timer:
        document.getElementById("match-timer"),

      history:
        document.getElementById("history-list"),

      analysis:
        document.getElementById("analysis-container")

    };

  }

    /* ==========================================================
     Reset
     ========================================================== */

  function resetSelections() {

    selectedPosition = null;
    selectedCourse = null;
    selectedShotType = null;
    selectedResult = null;

  }

  function resetNewMatchForm() {

    const e = els();

    if (e.matchDate) {
      e.matchDate.valueAsDate = new Date();
    }

    if (e.opponentName) {
      e.opponentName.value = "";
    }

    if (e.venue) {
      e.venue.value = "";
    }

    positionNumbers.my = emptyPositionMap();
    positionNumbers.opponent = emptyPositionMap();

    resetSelections();

  }

  /* ==========================================================
     Match
     ========================================================== */

  function createMatchObject() {

    const e = els();

    return {

      id:
        crypto.randomUUID(),

      createdAt:
        nowISO(),

      date:
        e.matchDate ? e.matchDate.value : "",

      opponent:
        e.opponentName ? e.opponentName.value.trim() : "",

      venue:
        e.venue ? e.venue.value.trim() : "",

      myPlayers:
        clone(positionNumbers.my),

      opponentPlayers:
        clone(positionNumbers.opponent),

      events: [],

      analysis: {

        my: {},

        opponent: {},

        team: {}

      }

    };

  }

    /* ==========================================================
     Screen Handlers
     ========================================================== */

  function handleGotoNewMatch() {

    resetNewMatchForm();

    App.UI.showScreen("screen-new-match");

  }

  function handleBackHome() {

    App.UI.showScreen("screen-home");

  }

  function handleStartMatch() {

    const e = els();

    const opponentName =
      e.opponentName ? e.opponentName.value.trim() : "";

    if (!opponentName) {

      alert("対戦相手名を入力してください。");

      return;

    }

    currentMatch = createMatchObject();

    selectedTeam = "my";

    resetSelections();

    App.UI.showScreen("screen-record");

    renderCurrentMatch();

  }

  /* ==========================================================
     Render
     ========================================================== */

  function renderCurrentMatch() {

    if (!currentMatch) {
      return;
    }

    const e = els();

    if (e.history) {
      e.history.innerHTML = "";
    }

    if (e.timer) {
      e.timer.textContent = "00:00";
    }

  }

   /* ==========================================================
     Events
     ========================================================== */

  function bindEvents() {

    const e = els();

    if (e.btnGotoNewMatch) {
      e.btnGotoNewMatch.addEventListener(
        "click",
        handleGotoNewMatch
      );
    }

    if (e.btnBackHome) {
      e.btnBackHome.addEventListener(
        "click",
        handleBackHome
      );
    }

    if (e.btnStartMatch) {
      e.btnStartMatch.addEventListener(
        "click",
        handleStartMatch
      );
    }

  }

  /* ==========================================================
     Initialize
     ========================================================== */

  function init() {

    resetSelections();

    positionNumbers.my = emptyPositionMap();

    positionNumbers.opponent = emptyPositionMap();

    bindEvents();

  }

  /* ==========================================================
     Public API
     ========================================================== */

  return {

    init,

    getCurrentMatch() {
      return currentMatch;
    },

    getSelectedTeam() {
      return selectedTeam;
    }

  };

})();

/* ==============================================================
   Auto Initialize
   ============================================================== */

document.addEventListener("DOMContentLoaded", () => {

  if (
    window.App &&
    window.App.Game &&
    typeof window.App.Game.init === "function"
  ) {
    window.App.Game.init();
  }

});




            
