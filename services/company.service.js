const { get, post } = require("./request");
const { clone, requestWithFallback } = require("./service-utils");
const { companyCards } = require("../mock/company");

function getCompanyCards() {
  return clone(companyCards);
}

async function fetchCompanyCards() {
  return requestWithFallback(
    () => get("/company/cards"),
    companyCards
  );
}

async function fetchCompanyPanel() {
  return requestWithFallback(
    () => get("/company/panel"),
    {
      title: "\u6211\u7684\u516c\u53f8",
      cards: companyCards
    }
  );
}

async function executeCompanyAction(actionId, payload = {}) {
  if (!actionId) {
    return { success: false };
  }

  return requestWithFallback(
    () => post(`/company/actions/${actionId}`, payload),
    {
      success: true,
      actionId
    }
  );
}

module.exports = {
  getCompanyCards,
  fetchCompanyCards,
  fetchCompanyPanel,
  executeCompanyAction
};
