const { get, post } = require("./request");
const { clone, requestData } = require("./service-utils");
const { companyCards } = require("../mock/company");

function getCompanyCards() {
  return clone(companyCards);
}

async function fetchCompanyCards() {
  return requestData(
    () => get("/company/cards"),
    "获取公司卡片失败"
  );
}

async function fetchCompanyPanel() {
  return requestData(
    () => get("/company/panel"),
    "获取公司面板失败"
  );
}

async function executeCompanyAction(actionId, payload = {}) {
  if (!actionId) {
    return { success: false };
  }

  return requestData(
    () => post(`/company/actions/${actionId}`, payload),
    "执行公司动作失败"
  );
}

module.exports = {
  getCompanyCards,
  fetchCompanyCards,
  fetchCompanyPanel,
  executeCompanyAction
};
