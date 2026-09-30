state.perPage = 12;

const renderTableView = window.renderRows.bind(window);
function renderTenderCards(rows) {
  const grid = document.querySelector("#tender-cards");
  const start = (state.page - 1) * state.perPage;
  const shown = rows.slice(start, start + state.perPage);
  const feedIsConnecting = document.querySelector(".snapshot-pill")?.classList.contains("connecting");

  if (!shown.length) {
    grid.innerHTML = feedIsConnecting
      ? '<div class="cards-empty"><b>Loading current e-GP notices…</b><p>Getting the latest public feed.</p></div>'
      : '<div class="cards-empty"><b>No tenders match these filters</b><p>Try a different search or clear your filters.</p><button id="empty-reset">Clear filters</button></div>';
    return;
  }

  grid.innerHTML = shown.map((r) => {
    const days = daysLeft(r.deadline);
    const closed = days !== null && days < 0;
    const urgent = days !== null && days >= 0 && days <= 5;
    const sourceLink = r.url || `https://www.eprocure.gov.bd/resources/common/ViewTender.jsp?id=${encodeURIComponent(r.id)}`;
    const fundingLabel = r.budgetType !== "—" ? r.budgetType : r.funds;
    return `<article class="tender-card ${closed ? "is-closed" : ""}">
      <div class="card-top">
        <span class="card-id">ID: <b>${escapeHtml(r.id)}</b><button data-copy="${escapeHtml(r.id)}" aria-label="Copy tender ID">▢</button></span>
        <span class="card-chip method-chip">${escapeHtml(r.methodShort || r.method)}</span>
        <span class="card-chip fund-chip">${escapeHtml(fundingLabel)}</span>
        <span class="nature-tag ${chipForNature(r.nature)} card-nature">${escapeHtml(r.nature)}</span>
      </div>
      <div class="card-agency"><span class="pin">⌖</span><b>${escapeHtml(r.district)}</b><span class="agency-divider">·</span><span>${escapeHtml(r.org)}</span></div>
      <div class="card-entity">PE: ${escapeHtml(r.pe)}</div>
      <div class="card-title-line"><button class="card-title" data-detail="${escapeHtml(r.id)}">${escapeHtml(r.title)}</button><button class="save-button ${state.saved.has(r.id) ? "saved" : ""}" data-save="${escapeHtml(r.id)}" aria-label="${state.saved.has(r.id) ? "Remove saved tender" : "Save tender"}">${state.saved.has(r.id) ? "♥" : "♡"}</button></div>
      ${r.reference ? `<div class="card-reference">REF ${escapeHtml(r.reference)}</div>` : ""}
      <div class="card-middle"><button class="eligibility-toggle" data-eligibility aria-expanded="false">Show eligibility <span>⌄</span></button><span class="countdown ${urgent ? "urgent" : ""} ${closed ? "past" : ""}">${closed ? "Closed" : days === null ? "See notice" : `${days} ${days === 1 ? "day" : "days"}`}</span></div>
      <div class="eligibility-detail" hidden><b>Eligibility requirements</b><p>${escapeHtml(r.eligibility)}</p><small>Confirm the complete requirements in the official tender document.</small></div>
      <div class="card-metrics"><div><small>DOCUMENT PRICE</small><b>${formatBDT(r.fee, false)}</b></div><div><small>SECURITY</small><b>${formatBDT(r.security, false)}</b></div><div><small>EST. BUDGET</small><b>${formatBDT(r.budget)}</b></div></div>
      <div class="card-dates"><div><small>PUBLISHED</small><b>${fmtDate(r.published)}</b></div><div class="time-left ${urgent ? "urgent" : ""}"><small>TIME LEFT</small><b>${closed ? "Deadline passed" : escapeHtml(timeRemaining(r.deadline))}</b></div><div class="deadline-date"><small>SELLING DEADLINE</small><b>${fmtDateTime(r.deadline)}</b></div></div>
      <a class="card-official" href="${escapeHtml(sourceLink)}" target="_blank" rel="noreferrer"><span>↗</span> e-GP notice</a>
    </article>`;
  }).join("");
}

window.renderRows = function () {
  const rows = statusRows();
  renderTenderCards(rows);
  const grid = document.querySelector("#tender-cards");
  const table = document.querySelector(".table-wrap:not(.insight-table-wrap)");
  grid.hidden = state.view !== "cards";
  table.hidden = state.view === "cards";
  renderTableView();
};

window.pageTo = function (page) {
  state.page = page;
  window.renderRows();
  document.querySelector(state.view === "cards" ? "#tender-cards" : ".table-wrap:not(.insight-table-wrap)")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
};

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    document.querySelectorAll(".view-tools [data-view]").forEach((button) => button.classList.toggle("selected", button === viewButton));
    window.renderRows();
    return;
  }

  const eligibilityButton = event.target.closest("[data-eligibility]");
  if (eligibilityButton) {
    const panel = eligibilityButton.closest(".tender-card")?.querySelector(".eligibility-detail");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    eligibilityButton.setAttribute("aria-expanded", String(!panel.hidden));
    eligibilityButton.innerHTML = `${panel.hidden ? "Show" : "Hide"} eligibility <span>${panel.hidden ? "⌄" : "⌃"}</span>`;
  }
});

window.renderRows();
setInterval(() => {
  if (document.visibilityState === "visible" && state.view === "cards" && state.rows.length) renderTenderCards(statusRows());
}, 60_000);
