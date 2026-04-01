const { agents, getAgentMeta } = require("../theme/roles");

function listAgents() {
  return agents;
}

module.exports = {
  listAgents,
  getAgentMeta
};
