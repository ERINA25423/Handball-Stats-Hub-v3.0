/**
 * analysis.js
 * ------------------------------------------------------------------
 * 「分析画面(screen-analysis)」の集計・描画を担当するレイヤー。
 *
 * 設計方針(重要): 入力データが不完全でも絶対にエラーにせず、
 * 「暫定値」として出力し続ける。
 *   - 背番号が未入力       → "背番号未入力" というグループにまとめて集計する
 *   - シュートコースが未選択 → "不明" コースとして件数のみ表示し、
 *                            得意/苦手コースの判定対象からは除外する
 *                            (母数として比較する意味がないため)
 *   - 母数が0の割合は必ず "0%" を返す(NaN / Infinity にしない)
 *   - サンプル数が少ない(既定: 3本未満)場合は "暫定値" の注記を出す
 *
 * 依存:
 *  - App.Game.getCurrentMatch() は使わない(過去の任意の match を渡して分析するため)
 *  - main.js が「VIEW ANALYSIS」クリック時に App.Analysis.renderForMatch(match) を呼ぶ想定
 * ------------------------------------------------------------------
 */

window.App = window.App || {};

App.Analysis = (function () {
  "use strict";

  // SHOT COURSE の並び順(3x3グリッドの表示順と一致させる)
  const COURSE_ORDER = ["LT", "CT", "RT", "LM", "CM", "RM", "LB9", "CB9", "RB9"];
  const COURSE_LABELS = {
    LT: "LT",
    CT: "CT",
    RT: "RT",
    LM: "LM",
    CM: "CM",
    RM: "RM",
    LB9: "LB",
    CB9: "CB",
    RB9: "RB",
    unknown: "不明",
  };

  const MIN_SAMPLE_FOR_CONFIDENCE = 3; // これ未満は「暫定値」注記を出す

  let renderedMatch = null; // 現在分析表示中の match(タブ切り替え時の再描画には使わない。参照用)

  // ------------------------------------------------------------------
  // 共通ユーティリティ
  // ------------------------------------------------------------------

  /** 母数0でも安全に%を計算する。常に "NN%" 形式の文字列を返す */
  function formatPct(numerator, denominator) {
    if (!denominator || denominator <= 0) return "0%";
    return Math.round((numerator / denominator) * 100) + "%";
  }

  function pctValue(numerator, denominator) {
    if (!denominator || denominator <= 0) return 0;
    return (numerator / denominator) * 100;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** イベント配列を安全に取り出す(match自体やeventsが欠けていても空配列にフォールバック) */
  function safeEvents(match) {
    if (!match || !Array.isArray(match.events)) return [];
    return match.events;
  }

  // ------------------------------------------------------------------
  // コース別集計(court player の得点率 / GK のセーブ率、共通で使う)
  // ------------------------------------------------------------------

  /**
   * @param {Array} shotEvents 集計対象のシュートイベント
   * @param {(ev:Object)=>boolean} isSuccess 成功とみなす条件(例: result==='GOAL')
   * @returns {{stats: Object, best: Object|null, worst: Object|null, totalAttempts: number}}
   */
  function computeCourseBreakdown(shotEvents, isSuccess) {
    const stats = {};
    COURSE_ORDER.concat(["unknown"]).forEach((c) => {
      stats[c] = { attempts: 0, success: 0 };
    });

    shotEvents.forEach((ev) => {
      const course = ev.shotCourse && stats[ev.shotCourse] ? ev.shotCourse : "unknown";
      stats[course].attempts += 1;
      if (isSuccess(ev)) stats[course].success += 1;
    });

    // 得意/苦手コースの候補は「不明」を除き、かつ1本以上打っているコースのみ
    const eligible = COURSE_ORDER.filter((c) => stats[c].attempts > 0).map((c) => ({
      course: c,
      attempts: stats[c].attempts,
      success: stats[c].success,
      pct: pctValue(stats[c].success, stats[c].attempts),
    }));

    let best = null;
    let worst = null;
    if (eligible.length > 0) {
      const byBest = [...eligible].sort((a, b) => b.pct - a.pct || b.attempts - a.attempts);
      const byWorst = [...eligible].sort((a, b) => a.pct - b.pct || b.attempts - a.attempts);
      best = byBest[0];
      worst = byWorst[0];
    }

    const totalAttempts = shotEvents.length;

    return { stats, best, worst, totalAttempts };
  }

  /** コース別内訳をグリッドHTMLとして描画する(件数0のコースはグレーアウト表示) */
  function renderCourseBreakdownGrid(stats) {
    const cells = COURSE_ORDER.map((c) => {
      const s = stats[c];
      const hasData = s.attempts > 0;
      const pctLabel = formatPct(s.success, s.attempts);
      return `
        <div class="course-cell ${hasData ? "" : "course-cell-empty"}">
          <div class="course-cell-label">${COURSE_LABELS[c]}</div>
          <div class="course-cell-pct">${hasData ? pctLabel : "—"}</div>
          <div class="course-cell-count">${s.attempts}本</div>
        </div>
      `;
    }).join("");

    const unknownCount = stats.unknown ? stats.unknown.attempts : 0;
    const unknownRow =
      unknownCount > 0
        ? `<div class="course-unknown-note">コース未選択のシュート: ${unknownCount}本(得意/苦手コースの判定には含めていません)</div>`
        : "";

    return `<div class="course-breakdown-grid">${cells}</div>${unknownRow}`;
  }

  function renderBestWorstLines(best, worst, totalAttempts) {
    const bestLine = best
      ? `得意コース: ${COURSE_LABELS[best.course]}(${formatPct(best.success, best.attempts)} / ${best.attempts}本)`
      : "得意コース: -(データ不足)";
    const worstLine = worst
      ? `苦手コース: ${COURSE_LABELS[worst.course]}(${formatPct(worst.success, worst.attempts)} / ${worst.attempts}本)`
      : "苦手コース: -(データ不足)";

    const provisionalNote =
      totalAttempts > 0 && totalAttempts < MIN_SAMPLE_FOR_CONFIDENCE
        ? `<p class="provisional-note">※ 試投数が少ないため(${totalAttempts}本)暫定値です。</p>`
        : "";

    return `
      <p class="best-worst-line">${bestLine}</p>
      <p class="best-worst-line">${worstLine}</p>
      ${provisionalNote}
    `;
  }

  // ------------------------------------------------------------------
  // OVERVIEW タブ(チーム全体)
  // ------------------------------------------------------------------

  function computeOverview(match) {
    const events = safeEvents(match);
    const myShots = events.filter((e) => e.type === "shot" && e.team === "my");
    const myMistakes = events.filter((e) => e.type === "mistake" && e.team === "my");

    const goals = myShots.filter((e) => e.result === "GOAL").length;
    const shots = myShots.length;
    const mistakes = myMistakes.length;

    const setShots = myShots.filter((e) => e.shotType === "Normal");
    const setGoals = setShots.filter((e) => e.result === "GOAL").length;

    const fastBreakShots = myShots.filter((e) => e.shotType === "Fast Break");
    const fastBreakGoals = fastBreakShots.filter((e) => e.result === "GOAL").length;

    const sevenMShots = myShots.filter((e) => e.shotType === "7m");
    const sevenMGoals = sevenMShots.filter((e) => e.result === "GOAL").length;

    const half1Shots = myShots.filter((e) => e.half === 1);
    const half1Goals = half1Shots.filter((e) => e.result === "GOAL").length;
    const half2Shots = myShots.filter((e) => e.half === 2);
    const half2Goals = half2Shots.filter((e) => e.result === "GOAL").length;

    return {
      goals,
      shots,
      shotPct: formatPct(goals, shots),
      attackPct: formatPct(goals, shots + mistakes),
      setPct: formatPct(setGoals, setShots.length),
      fastBreakPct: formatPct(fastBreakGoals, fastBreakShots.length),
      sevenMPct: formatPct(sevenMGoals, sevenMShots.length),
      mistakes,
      mistakePct: formatPct(mistakes, shots + mistakes),
      half1: { goals: half1Goals, shots: half1Shots.length, pct: formatPct(half1Goals, half1Shots.length) },
      half2: { goals: half2Goals, shots: half2Shots.length, pct: formatPct(half2Goals, half2Shots.length) },
    };
  }

  function renderOverview(match) {
    const o = computeOverview(match);

    setText("stat-goals", o.goals);
    setText("stat-shots", o.shots);
    setText("stat-shot-pct", o.shotPct);
    setText("stat-attack-pct", o.attackPct);
    setText("stat-set-pct", o.setPct);
    setText("stat-fastbreak-pct", o.fastBreakPct);
    setText("stat-7m-pct", o.sevenMPct);
    setText("stat-mistakes", o.mistakes);
    setText("stat-mistake-pct", o.mistakePct);

    setText("half-breakdown-1", `1ST HALF ${o.half1.goals} GOALS / ${o.half1.shots} SHOTS / ${o.half1.pct}`);
    setText("half-breakdown-2", `2ND HALF ${o.half2.goals} GOALS / ${o.half2.shots} SHOTS / ${o.half2.pct}`);
  }

                // ------------------------------------------------------------------
  // PLAYERS タブ(コートプレーヤー個人別)
  // ------------------------------------------------------------------

  function computePlayers(match) {
    const events = safeEvents(match);
    const myShots = events.filter((e) => e.type === "shot" && e.team === "my");

    if (myShots.length === 0) return [];

    // 背番号ごとにグループ化(空文字は "unknown" にまとめる = 暫定集計)
    const groups = new Map();
    myShots.forEach((ev) => {
      const key = ev.number && String(ev.number).trim() !== "" ? String(ev.number).trim() : "unknown";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ev);
    });

    const players = [];
    groups.forEach((shots, number) => {
      const goals = shots.filter((e) => e.result === "GOAL").length;
      const breakdown = computeCourseBreakdown(shots, (e) => e.result === "GOAL");
      players.push({
        number,
        label: number === "unknown" ? "背番号未入力" : "#" + number,
        shots: shots.length,
        goals,
        shotPct: formatPct(goals, shots.length),
        breakdown,
      });
    });

    // 背番号未入力は最後に、それ以外は本数の多い順に並べる
    players.sort((a, b) => {
      if (a.number === "unknown") return 1;
      if (b.number === "unknown") return -1;
      return b.shots - a.shots;
    });

    return players;
  }

  function renderPlayers(match) {
    const players = computePlayers(match);
    const container = document.getElementById("players-list");
    if (!container) return;

    if (players.length === 0) {
      container.innerHTML = `<p class="modal-empty">まだシュートデータがありません。</p>`;
      return;
    }

    container.innerHTML = players
      .map((p) => {
        return `
          <div class="analysis-card player-card">
            <div class="player-card-header">
              <span class="player-card-number">${escapeHtml(p.label)}</span>
              <span class="player-card-shotpct">SHOT % ${p.shotPct}</span>
            </div>
            <div class="stat-grid stat-grid-compact">
              <div class="stat-cell"><span class="stat-label">GOALS</span><span class="stat-value">${p.goals}</span></div>
              <div class="stat-cell"><span class="stat-label">SHOTS</span><span class="stat-value">${p.shots}</span></div>
            </div>
            ${renderBestWorstLines(p.breakdown.best, p.breakdown.worst, p.breakdown.totalAttempts)}
            ${renderCourseBreakdownGrid(p.breakdown.stats)}
          </div>
        `;
      })
      .join("");
  }

                 // ------------------------------------------------------------------
  // GK タブ(自チームのゴールキーパー)
  // ------------------------------------------------------------------

  function computeGk(match) {
    const events = safeEvents(match);
    // 相手チームが打ってきたシュート = 自チームGKが対応したシュート
    const oppShots = events.filter((e) => e.type === "shot" && e.team === "opponent");

    const saves = oppShots.filter((e) => e.result === "SAVED").length;
    const breakdown = computeCourseBreakdown(oppShots, (e) => e.result === "SAVED");

    return {
      saves,
      shotsFaced: oppShots.length,
      savePct: formatPct(saves, oppShots.length),
      breakdown,
    };
  }

  function renderGk(match) {
    const gk = computeGk(match);

    setText("gk-saves", gk.saves);
    setText("gk-shots-faced", gk.shotsFaced);
    setText("gk-save-pct", gk.savePct);

    const bestWorstHtml = renderBestWorstLines(gk.breakdown.best, gk.breakdown.worst, gk.breakdown.totalAttempts);
    const bestLineEl = document.getElementById("gk-best-course");
    const worstLineEl = document.getElementById("gk-worst-course");
    if (bestLineEl && worstLineEl) {
      // best-worst-line 用の2要素は index.html に個別IDで用意されているため、
      // renderBestWorstLines の中身をそのまま differentiate して割り当てる
      const best = gk.breakdown.best;
      const worst = gk.breakdown.worst;
      bestLineEl.textContent = best
        ? `BEST COURSE: ${COURSE_LABELS[best.course]}(${formatPct(best.success, best.attempts)} / ${best.attempts}本)`
        : "BEST COURSE: -(データ不足)";
      worstLineEl.textContent = worst
        ? `WORST COURSE: ${COURSE_LABELS[worst.course]}(${formatPct(worst.success, worst.attempts)} / ${worst.attempts}本)`
        : "WORST COURSE: -(データ不足)";
    }

    const gridContainer = document.getElementById("gk-course-breakdown");
    if (gridContainer) {
      gridContainer.outerHTML = renderCourseBreakdownGrid(gk.breakdown.stats).replace(
        'class="course-breakdown-grid"',
        'class="course-breakdown-grid" id="gk-course-breakdown"'
      );
    }

    if (gk.shotsFaced === 0) {
      const gkPanel = document.getElementById("tab-gk");
      if (gkPanel && !gkPanel.querySelector(".gk-empty-note")) {
        const note = document.createElement("p");
        note.className = "modal-empty gk-empty-note";
        note.textContent = "まだ相手チームのシュートデータがありません。";
        gkPanel.appendChild(note);
      }
    } else {
      const existingNote = document.querySelector("#tab-gk .gk-empty-note");
      if (existingNote) existingNote.remove();
    }
  }

                // ------------------------------------------------------------------
  // 共通描画ヘルパー
  // ------------------------------------------------------------------

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  // ------------------------------------------------------------------
  // タブ切り替え
  // ------------------------------------------------------------------

  function bindTabs() {
    const tabButtons = document.querySelectorAll("#analysis-tabs .tab-btn");
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabKey = btn.dataset.tab;
        tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".tab-panel").forEach((panel) => {
          panel.classList.toggle("active", panel.id === "tab-" + tabKey);
        });
      });
    });
  }

  function bindBackButton() {
    const backBtn = document.getElementById("btn-back-from-analysis");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        App.UI.showScreen("screen-history");
      });
    }
  }

  // ------------------------------------------------------------------
  // 公開API
  // ------------------------------------------------------------------

  /**
   * 指定した match の分析結果を OVERVIEW / PLAYERS / GK の3タブすべてに描画する。
   * どのフィールドが欠けていても(events が空、shotCourse未選択、背番号未入力等)
   * 例外を投げず、0% や "不明" 等の暫定値で表示する。
   */
  function renderForMatch(match) {
    renderedMatch = match || { events: [] };
    renderOverview(renderedMatch);
    renderPlayers(renderedMatch);
    renderGk(renderedMatch);

    // 分析画面を開くたびに OVERVIEW タブを既定表示に戻す
    const tabButtons = document.querySelectorAll("#analysis-tabs .tab-btn");
    tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === "overview"));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === "tab-overview");
    });
  }

  function init() {
    bindTabs();
    bindBackButton();
  }

  return {
    init,
    renderForMatch,
  };
})();
