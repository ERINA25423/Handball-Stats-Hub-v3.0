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

  /* ==========================================================
     Team / Position
     ========================================================== */

  function setSelectedTeam(team) {

    if (team !== "my" && team !== "opponent") {
      return;
    }

    selectedTeam = team;

    renderTeamToggle();

    refreshNumberInputs(); 
  }

  function renderTeamToggle() {

    const e = els();

    if (!e.firstTeamToggle) {
      return;
    }

    e.firstTeamToggle
      .querySelectorAll("[data-team]")
      .forEach(button => {

        const active =
          button.dataset.team === selectedTeam;

        button.classList.toggle("active", active);

      });

  }

  function updatePositionNumber(team, position, number) {

    if (!positionNumbers[team]) {
      return;
    }

    positionNumbers[team][position] = number;

  }

  function getPositionNumber(team, position) {

    if (!positionNumbers[team]) {
      return "";
    }

    return positionNumbers[team][position] || "";

  }

  function selectPosition(position) {

    if (!POSITIONS.includes(position)) {
      return;
    }

    selectedPosition = position;

    renderSelectedPosition();

  }

  function renderSelectedPosition() {

    document
      .querySelectorAll("[data-position]")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.position === selectedPosition
        );

      });

  }

     /* ==========================================================
     Shot Selection
     ========================================================== */

  function selectShotCourse(course) {

    selectedCourse = course;

    renderSelectedShotCourse();

  }

  function selectShotType(type) {

    selectedShotType = type;

    renderSelectedShotType();

  }

  function selectResult(result) {

    selectedResult = result;

    renderSelectedResult();

  }

  function renderSelectedShotCourse() {

    document
      .querySelectorAll("[data-shot-course]")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.shotCourse === selectedCourse
        );

      });

  }

  function renderSelectedShotType() {

    document
      .querySelectorAll("[data-shot-type]")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.shotType === selectedShotType
        );

      });

  }

  function renderSelectedResult() {

    document
      .querySelectorAll("[data-result]")
      .forEach(button => {

        button.classList.toggle(
          "active",
          button.dataset.result === selectedResult
        );

      });

  }

  function bindShotSelectionEvents() {

    document
      .querySelectorAll("[data-shot-course]")
      .forEach(button => {

        button.addEventListener("click", () => {

          selectShotCourse(
            button.dataset.shotCourse
          );

        });

      });

    document
      .querySelectorAll("[data-shot-type]")
      .forEach(button => {

        button.addEventListener("click", () => {

          selectShotType(
            button.dataset.shotType
          );

        });

      });

    document
      .querySelectorAll("[data-result]")
      .forEach(button => {

        button.addEventListener("click", () => {

          selectResult(
            button.dataset.result
          );

        });

      });

  }

     /* ==========================================================
     Event Save
     ========================================================== */

  function createEventObject() {

    return {

      id: crypto.randomUUID(),

      team: selectedTeam,

      position: selectedPosition,

      shotCourse: selectedCourse,

      shotType: selectedShotType,

      result: selectedResult,

      timestamp: Date.now()

    };

  }

  function canSaveEvent() {

    return (
      selectedPosition &&
      selectedCourse &&
      selectedShotType &&
      selectedResult
    );

  }

  function saveEvent() {

  if (!currentMatch) {
    return;
  }

  if (!canSaveEvent()) {

    alert("入力が完了していません。");

    return;

  }

  currentMatch.events.push(
    createEventObject()
  );

  updateAnalysis();

  renderHistory();

  renderAnalysis();

  renderAnalysisDetails();

  renderPlayerAnalysis();

  renderPlayerDetails();

  renderRanking();

  renderGoalkeeperAnalysis();

  renderCourtPlayerAnalysis();

  resetSelections();

  renderSelectedPosition();

  renderSelectedShotCourse();

  renderSelectedShotType();

  renderSelectedResult();

}

      function renderHistory() {

    const e = els();

    if (!e.history) {
      return;
    }

    e.history.innerHTML = "";

    if (!currentMatch) {
      return;
    }

    currentMatch.events.forEach((event, index) => {

      const row = document.createElement("div");

      row.className = "history-item";

      row.textContent =
        `${index + 1}. `
        + `[${event.team}] `
        + `${event.position} `
        + `${event.shotType} `
        + `${event.shotCourse} `
        + `${event.result}`;

      e.history.appendChild(row);

    });

  }

  function undoLastEvent() {

    if (!currentMatch) {
      return;
    }

    if (currentMatch.events.length === 0) {
      return;
    }

    currentMatch.events.pop();

    renderHistory();

  }

  function handleSaveEvent() {

    saveEvent();

  }

  function handleUndo() {

    undoLastEvent();

  }

       /* ==========================================================
     End Match
     ========================================================== */

  async function endMatch() {

    if (!currentMatch) {
      return;
    }

    try {

      if (
        window.App &&
        window.App.Storage &&
        typeof window.App.Storage.saveMatch === "function"
      ) {

        await window.App.Storage.saveMatch(currentMatch);

      }

      alert("試合を保存しました。");

      currentMatch = null;

      resetSelections();

      App.UI.showScreen("screen-home");

    } catch (error) {

      console.error(error);

      alert("試合の保存に失敗しました。");

    }

  }

  function handleEndMatch() {

    endMatch();

  }

       /* ==========================================================
     Match Timer
     ========================================================== */

  let timerInterval = null;

  let elapsedSeconds = 0;

  let currentHalf = 1;

  function formatTime(totalSeconds) {

    const minutes = Math.floor(totalSeconds / 60);

    const seconds = totalSeconds % 60;

    return (
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0")
    );

  }

  function renderTimer() {

    const e = els();

    if (!e.timer) {
      return;
    }

    e.timer.textContent = formatTime(elapsedSeconds);

  }

  function startTimer() {

    if (timerInterval) {
      return;
    }

    timerInterval = setInterval(() => {

      elapsedSeconds++;

      renderTimer();

    }, 1000);

  }

  function stopTimer() {

    if (!timerInterval) {
      return;
    }

    clearInterval(timerInterval);

    timerInterval = null;

  }

  function resetTimer() {

    stopTimer();

    elapsedSeconds = 0;

    renderTimer();

  }

  function toggleHalf() {

    currentHalf =
      currentHalf === 1 ? 2 : 1;

  }

      /* ==========================================================
     Analysis
     ========================================================== */

  function buildAnalysis() {

    if (!currentMatch) {
      return null;
    }

    const analysis = {

      totalShots: 0,

      totalGoals: 0,

      totalSaves: 0,

      byPosition: {},

      byCourse: {},

      byShotType: {}

    };

    currentMatch.events.forEach(event => {

      analysis.totalShots++;

      if (!analysis.byPosition[event.position]) {

        analysis.byPosition[event.position] = {

          shots: 0,

          goals: 0,

          saves: 0

        };

      }

      if (!analysis.byCourse[event.shotCourse]) {

        analysis.byCourse[event.shotCourse] = {

          shots: 0,

          goals: 0,

          saves: 0

        };

      }

      if (!analysis.byShotType[event.shotType]) {

        analysis.byShotType[event.shotType] = {

          shots: 0,

          goals: 0,

          saves: 0

        };

      }

      analysis.byPosition[event.position].shots++;

      analysis.byCourse[event.shotCourse].shots++;

      analysis.byShotType[event.shotType].shots++;

      if (event.result === "goal") {

        analysis.totalGoals++;

        analysis.byPosition[event.position].goals++;

        analysis.byCourse[event.shotCourse].goals++;

        analysis.byShotType[event.shotType].goals++;

      }

      if (event.result === "save") {

        analysis.totalSaves++;

        analysis.byPosition[event.position].saves++;

        analysis.byCourse[event.shotCourse].saves++;

        analysis.byShotType[event.shotType].saves++;

      }

    });

    return analysis;

  }

  function updateAnalysis() {
  if (!currentMatch) return;

  currentMatch.analysis = buildAnalysis();
  currentMatch.analysis.players = buildPlayerAnalysis();
}

  currentMatch.analysis = buildAnalysis();

  currentMatch.analysis.players =
    buildPlayerAnalysis();

}

       function renderAnalysis() {

    const e = els();

    if (!e.analysis) {
      return;
    }

    if (!currentMatch || !currentMatch.analysis) {

      e.analysis.innerHTML = "";

      return;

    }

    const a = currentMatch.analysis;

    const goalRate =
      a.totalShots === 0
        ? 0
        : Math.round((a.totalGoals / a.totalShots) * 100);

    const saveRate =
      a.totalShots === 0
        ? 0
        : Math.round((a.totalSaves / a.totalShots) * 100);

    e.analysis.innerHTML = `
      <div class="analysis-card">
        <h3>Match Summary</h3>

        <p><strong>Shots:</strong> ${a.totalShots}</p>

        <p><strong>Goals:</strong> ${a.totalGoals}</p>

        <p><strong>Saves:</strong> ${a.totalSaves}</p>

        <p><strong>Goal %:</strong> ${goalRate}%</p>

        <p><strong>Save %:</strong> ${saveRate}%</p>

      </div>
    `;

  }

       function renderAnalysisDetails() {

    const e = els();

    if (!e.analysis) {
      return;
    }

    if (!currentMatch || !currentMatch.analysis) {
      return;
    }

    const a = currentMatch.analysis;

    let html = e.analysis.innerHTML;

    /* -------------------------
       Position
    ------------------------- */

    html += `
      <div class="analysis-card">
        <h3>Position Analysis</h3>
    `;

    Object.entries(a.byPosition).forEach(([position, value]) => {

      const rate =
        value.shots === 0
          ? 0
          : Math.round(value.goals / value.shots * 100);

      html += `
        <p>
          <strong>${position}</strong><br>
          Shots: ${value.shots}
          /
          Goals: ${value.goals}
          /
          Saves: ${value.saves}
          /
          Goal%: ${rate}%
        </p>
      `;

    });

    html += `</div>`;

    /* -------------------------
       Shot Course
    ------------------------- */

    html += `
      <div class="analysis-card">
        <h3>Shot Course Analysis</h3>
    `;

    Object.entries(a.byCourse).forEach(([course, value]) => {

      const rate =
        value.shots === 0
          ? 0
          : Math.round(value.goals / value.shots * 100);

      html += `
        <p>
          <strong>${course}</strong><br>
          Shots: ${value.shots}
          /
          Goals: ${value.goals}
          /
          Saves: ${value.saves}
          /
          Goal%: ${rate}%
        </p>
      `;

    });

    html += `</div>`;

    /* -------------------------
       Shot Type
    ------------------------- */

    html += `
      <div class="analysis-card">
        <h3>Shot Type Analysis</h3>
    `;

    Object.entries(a.byShotType).forEach(([type, value]) => {

      const rate =
        value.shots === 0
          ? 0
          : Math.round(value.goals / value.shots * 100);

      html += `
        <p>
          <strong>${type}</strong><br>
          Shots: ${value.shots}
          /
          Goals: ${value.goals}
          /
          Saves: ${value.saves}
          /
          Goal%: ${rate}%
        </p>
      `;

    });

    html += `</div>`;

    e.analysis.innerHTML = html;

  }

       /* ==========================================================
     Match History
     ========================================================== */

  function loadMatch(match) {

    if (!match) {
      return;
    }

    currentMatch = clone(match);


    App.UI.showScreen("screen-record");

  }

  async function loadSavedMatch(matchId) {

    try {

      if (
        window.App &&
        window.App.Storage &&
        typeof window.App.Storage.getMatch === "function"
      ) {

        const match =
          await window.App.Storage.getMatch(matchId);

        loadMatch(match);

      }

    } catch (error) {

      console.error(error);

      alert("試合データを読み込めませんでした。");

    }

  }

  function openHistoryItem(matchId) {

    loadSavedMatch(matchId);

  }

   /* ==========================================================
     Player Analysis
     ========================================================== */

  function buildPlayerAnalysis() {

    if (!currentMatch) {
      return {};
    }

    const players = {};

    currentMatch.events.forEach(event => {

      const key =
        `${event.team}_${event.position}`;

      if (!players[key]) {

        players[key] = {

          team: event.team,

          position: event.position,

          shots: 0,

          goals: 0,

          saves: 0,

          results: {},

          courses: {},

          shotTypes: {}

        };

      }

      const p = players[key];

      p.shots++;

      if (event.result === "goal") {
        p.goals++;
      }

      if (event.result === "save") {
        p.saves++;
      }

      p.results[event.result] =
        (p.results[event.result] || 0) + 1;

      p.courses[event.shotCourse] =
        (p.courses[event.shotCourse] || 0) + 1;

      p.shotTypes[event.shotType] =
        (p.shotTypes[event.shotType] || 0) + 1;

    });

    return players;

  }

  function getPlayerSuccessRate(player) {

    if (!player) {
      return 0;
    }

    if (player.shots === 0) {
      return 0;
    }

    return Math.round(
      player.goals / player.shots * 100
    );

  }

      function renderPlayerAnalysis() {

    const e = els();

    if (!e.analysis) {
      return;
    }

    if (
      !currentMatch ||
      !currentMatch.analysis ||
      !currentMatch.analysis.players
    ) {
      return;
    }

    let html = e.analysis.innerHTML;

    html += `
      <div class="analysis-card">
        <h3>Player Analysis</h3>
    `;

    Object.values(currentMatch.analysis.players)
      .forEach(player => {

        const success =
          getPlayerSuccessRate(player);

        html += `
          <div class="player-analysis">

            <h4>
              ${player.team}
              /
              ${player.position}
            </h4>

            <p>Shots : ${player.shots}</p>

            <p>Goals : ${player.goals}</p>

            <p>Saves : ${player.saves}</p>

            <p>Success : ${success}%</p>

          </div>
        `;

      });

    html += `</div>`;

    e.analysis.innerHTML = html;

  }

      function getMostUsedKey(data) {

    let bestKey = "-";
    let bestValue = 0;

    Object.entries(data).forEach(([key, value]) => {

      if (value > bestValue) {

        bestValue = value;
        bestKey = key;

      }

    });

    return bestKey;

  }

  function renderPlayerDetails() {

    const e = els();

    if (!e.analysis) {
      return;
    }

    if (
      !currentMatch ||
      !currentMatch.analysis ||
      !currentMatch.analysis.players
    ) {
      return;
    }

    let html = e.analysis.innerHTML;

    html += `
      <div class="analysis-card">
        <h3>Player Details</h3>
    `;

    Object.values(currentMatch.analysis.players)
      .forEach(player => {

        const success =
          getPlayerSuccessRate(player);

        const favoriteCourse =
          getMostUsedKey(player.courses);

        const favoriteShot =
          getMostUsedKey(player.shotTypes);

        const misses =
          player.results.miss || 0;

        html += `
          <div class="player-analysis">

            <h4>${player.team} / ${player.position}</h4>

            <p>Success : ${success}%</p>

            <p>Favorite Course : ${favoriteCourse}</p>

            <p>Favorite Shot : ${favoriteShot}</p>

            <p>Misses : ${misses}</p>

          </div>
        `;

      });

    html += `</div>`;

    e.analysis.innerHTML = html;

  } 

     renderPlayerDetails();
     renderRanking();
     renderGoalkeeperAnalysis();
     renderCourtPlayerAnalysis();

       /* ==========================================================
     CSV Export
     ========================================================== */

  function convertEventsToCSV() {

    if (!currentMatch) {
      return "";
    }

    const rows = [];

    rows.push([
      "Team",
      "Position",
      "ShotType",
      "ShotCourse",
      "Result",
      "Timestamp"
    ].join(","));

    currentMatch.events.forEach(event => {

      rows.push([

        event.team,

        event.position,

        event.shotType,

        event.shotCourse,

        event.result,

        event.timestamp

      ].join(","));

    });

    return rows.join("\n");

  }

  function downloadCSV() {

    if (!currentMatch) {
      return;
    }

    const csv = convertEventsToCSV();

    const blob = new Blob(
      [csv],
      {
        type: "text/csv;charset=utf-8;"
      }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download =
      `${currentMatch.date || "match"}_${currentMatch.opponent || "opponent"}.csv`;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);

  }
       /* ==========================================================
     Goalkeeper / Court Analysis
     ========================================================== */

  function buildGoalkeeperAnalysis() {

    if (
      !currentMatch ||
      !currentMatch.analysis ||
      !currentMatch.analysis.players
    ) {
      return [];
    }

    return Object.values(
      currentMatch.analysis.players
    ).filter(player => player.position === "GK");
  }

  function buildCourtPlayerAnalysis() {

    if (
      !currentMatch ||
      !currentMatch.analysis ||
      !currentMatch.analysis.players
    ) {
      return [];
    }

    return Object.values(
      currentMatch.analysis.players
    ).filter(player => player.position !== "GK");
  }

  function renderGoalkeeperAnalysis() {

    const e = els();

    if (!e.analysis) {
      return;
    }

    const keepers = buildGoalkeeperAnalysis();

    let html = e.analysis.innerHTML;

    html += `
      <div class="analysis-card">
        <h3>Goalkeeper Analysis</h3>
    `;

    keepers.forEach(gk => {

      const rate =
        gk.shots === 0
          ? 0
          : Math.round(gk.saves / gk.shots * 100);

      html += `
        <div class="player-analysis">

          <h4>${gk.team} / GK</h4>

          <p>Shots : ${gk.shots}</p>

          <p>Saves : ${gk.saves}</p>

          <p>Save % : ${rate}%</p>

        </div>
      `;

    });

    html += `</div>`;

    e.analysis.innerHTML = html;

  }

  function renderCourtPlayerAnalysis() {

    const e = els();

    if (!e.analysis) {
      return;
    }

    const players = buildCourtPlayerAnalysis();

    let html = e.analysis.innerHTML;

    html += `
      <div class="analysis-card">
        <h3>Court Player Analysis</h3>
    `;

    players.forEach(player => {

      const rate =
        getPlayerSuccessRate(player);

      html += `
        <div class="player-analysis">

          <h4>
            ${player.team}
            /
            ${player.position}
          </h4>

          <p>Shots : ${player.shots}</p>

          <p>Goals : ${player.goals}</p>

          <p>Goal % : ${rate}%</p>

        </div>
      `;

    });

    html += `</div>`;

    e.analysis.innerHTML = html;

  }


       /* ==========================================================
     Ranking
     ========================================================== */

  function buildRanking() {

    if (
      !currentMatch ||
      !currentMatch.analysis ||
      !currentMatch.analysis.players
    ) {
      return [];
    }

    return Object.values(
      currentMatch.analysis.players
    )
      .map(player => ({

        ...player,

        successRate:
          getPlayerSuccessRate(player)

      }))
      .sort(
        (a, b) =>
          b.successRate - a.successRate
      );

  }

  function renderRanking() {

    const e = els();

    if (!e.analysis) {
      return;
    }

    const ranking = buildRanking();

    let html = e.analysis.innerHTML;

    html += `
      <div class="analysis-card">
        <h3>Player Ranking</h3>
    `;

    ranking.forEach((player, index) => {

      html += `
        <div class="ranking-row">

          <strong>#${index + 1}</strong>

          ${player.team}

          /

          ${player.position}

          -

          ${player.successRate}%

        </div>
      `;

    });

    html += `</div>`;

    e.analysis.innerHTML = html;

  }

   
     function bindTeamToggleEvents() {

    document
      .querySelectorAll("[data-team]")
      .forEach(button => {

        button.addEventListener("click", () => {

          setSelectedTeam(button.dataset.team);

        });

      });

  }

  function bindPositionEvents() {

    document
      .querySelectorAll("[data-position]")
      .forEach(button => {

        button.addEventListener("click", () => {

          selectPosition(button.dataset.position);

        });

      });

  }

  function bindNumberInputs() {

    document
      .querySelectorAll("[data-number-position]")
      .forEach(input => {

        input.addEventListener("input", () => {

          updatePositionNumber(
            selectedTeam,
            input.dataset.numberPosition,
            input.value.trim()
          );

        });

      });

  }

  function refreshNumberInputs() {

    document
      .querySelectorAll("[data-number-position]")
      .forEach(input => {

        input.value = getPositionNumber(
          selectedTeam,
          input.dataset.numberPosition
        );

      });

  }
   
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

      bindTeamToggleEvents();

    bindPositionEvents();

    bindNumberInputs(); 

      bindShotSelectionEvents();
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




            
