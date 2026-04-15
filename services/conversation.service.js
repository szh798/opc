const { getAgentMeta } = require("./agent.service");
const { getProfile } = require("./profile.service");
const { getWeeklyReport, getMonthlyCheck, getSocialProof, getMilestone } = require("./report.service");
const { getNicknameReplies, getRoutingReplies } = require("./onboarding.service");
const { buildFeedbackMessages, getFeedbackReplies } = require("./task.service");

function getDisplayName(user = {}) {
  // 不再 fallback 到 "小明",未登录/未初始化就返回 "访客",避免场景问候里
  // 蹦出假身份。真实用户会是后端生成的 "opc_xxxxxxxxxx" 或微信昵称。
  return String(user.nickname || user.name || "访客").trim() || "访客";
}

function getConversationScene(sceneKey, context = {}) {
  const profile = getProfile();
  const weeklyReport = getWeeklyReport();
  const monthlyCheck = getMonthlyCheck();
  const socialProof = getSocialProof();
  const milestone = getMilestone();
  const user = context.user || {
    name: "\u8bbf\u5ba2",
    nickname: "\u8bbf\u5ba2"
  };
  const displayName = getDisplayName(user);

  const scenes = {
    onboarding_intro: {
      agentKey: "master",
      inputPlaceholder: "\u5148\u70b9\u51fb\u767b\u5f55\u5361\u7247\uff0c\u6211\u4eec\u5c31\u5f00\u59cb...",
      messages: [
        {
          id: "onboarding-intro-1",
          type: "agent",
          text: "\u563f\uff0c\u6211\u662f\u4e00\u6811\u3002\u5728\u5f00\u59cb\u4e4b\u524d\uff0c\u5148\u8ba9\u6211\u8ba4\u8bc6\u4e00\u4e0b\u4f60\u3002"
        },
        {
          id: "onboarding-intro-2",
          type: "login_card",
          title: "\u5fae\u4fe1\u4e00\u952e\u767b\u5f55",
          description: "\u767b\u5f55\u662f\u5bf9\u8bdd\u7684\u4e00\u90e8\u5206\uff0c\u4e0d\u662f\u524d\u7f6e\u95e8\u69db\u3002",
          buttonText: "\u5fae\u4fe1\u4e00\u952e\u767b\u5f55",
          action: "login"
        }
      ],
      quickReplies: [],
      allowInput: true
    },
    onboarding_nickname: {
      agentKey: "master",
      inputPlaceholder: "\u4e5f\u53ef\u4ee5\u76f4\u63a5\u8f93\u5165\u4f60\u60f3\u8981\u7684\u540d\u5b57...",
      messages: [
        {
          id: "onboarding-name-1",
          type: "typing"
        },
        {
          id: "onboarding-name-2",
          type: "agent",
          text: "\u6211\u600e\u4e48\u79f0\u547c\u4f60\u6bd4\u8f83\u597d\uff1f"
        }
      ],
      quickReplies: getNicknameReplies(user)
    },
    onboarding_rename: {
      agentKey: "master",
      inputPlaceholder: "\u76f4\u63a5\u53d1\u6211\u4e00\u4e2a\u4f60\u60f3\u8981\u7684\u79f0\u547c...",
      messages: [
        {
          id: "onboarding-rename-1",
          type: "agent",
          text: "\u597d\uff0c\u90a3\u4f60\u60f3\u8ba9\u6211\u600e\u4e48\u79f0\u547c\u4f60\uff1f\u76f4\u63a5\u7ed9\u6211\u4e00\u4e2a\u540d\u5b57\u5c31\u884c\u3002"
        }
      ],
      quickReplies: []
    },
    onboarding_route: {
      agentKey: "master",
      inputPlaceholder: "\u9009\u4e00\u4e2a\u72b6\u6001\uff0c\u6216\u8005\u76f4\u63a5\u544a\u8bc9\u6211\u4f60\u73b0\u5728\u7684\u60c5\u51b5...",
      allowInput: true,
      messages: [
        {
          id: "onboarding-route-1",
          type: "agent",
          text: "\u4f60\u73b0\u5728\u5904\u4e8e\u4ec0\u4e48\u72b6\u6001\uff1f"
        },
        {
          id: "onboarding-route-3",
          type: "artifact_card",
          cardStyle: "soft",
          title: "\u4f60\u77e5\u9053\u5417\uff1f",
          description: "\u5168\u56fd\u6709\u4e0d\u5c11\u56ed\u533a\u6b63\u5728\u62a2\u4e00\u4eba\u516c\u53f8\u5165\u9a7b\uff0c\u514d\u8d39\u6ce8\u518c\u5730\u5740\u3001\u7a0e\u6536\u8fd4\u8fd8\uff0c\u751a\u81f3\u76f4\u63a5\u53d1\u94b1\u3002\u4f60\u53ef\u80fd\u7b26\u5408\u597d\u51e0\u4e2a\uff0c\u4f46\u4e00\u76f4\u6ca1\u542c\u8bf4\u3002",
          primaryText: "\u5e2e\u6211\u67e5\u67e5\u80fd\u8585\u4ec0\u4e48",
          primaryAction: "route_park"
        }
      ],
      quickReplies: getRoutingReplies()
    },
    onboarding_path_working: {
      agentKey: "asset",
      inputPlaceholder: "\u4f8b\u5982\uff1a\u8fd0\u8425 / \u9500\u552e / \u4ea7\u54c1 / \u8bbe\u8ba1...",
      messages: [
        {
          id: "path-working-1",
          type: "agent",
          text: "\u4f60\u77e5\u9053\u5417\uff1f\u4f60\u624b\u91cc\u53ef\u80fd\u6709\u4e00\u4e9b\u4f60\u81ea\u5df1\u90fd\u6ca1\u610f\u8bc6\u5230\u7684\u8d44\u4ea7\u2014\u2014\u8fd9\u4e9b\u5e74\u7684\u5de5\u4f5c\u7ecf\u5386\u3001\u4f60\u79ef\u7d2f\u7684\u8d44\u6e90\u4eba\u8109\u3001\u4f60\u786c\u78d5\u51fa\u6765\u7684\u89c1\u8bc6\uff0c\u6bcf\u4e00\u9879\u90fd\u53ef\u80fd\u6210\u4e3a\u4f60\u7684\u7b2c\u4e8c\u4e2a\u6536\u5165\u6765\u6e90\u3002\u8981\u4e0d\u8981\u4e00\u8d77\u6765\u804a\u4e00\u4e0b\uff1f"
        }
      ],
      quickReplies: [
        { label: "\u597d\u7684", action: "asset_inventory_start" },
        { label: "\u5bf9\u8bdd\u6a21\u5f0f", action: "asset_inventory_start" }
      ]
    },
    onboarding_path_trying: {
      agentKey: "asset",
      inputPlaceholder: "\u8bf4\u8bf4\u4f60\u73b0\u5728\u5728\u5c1d\u8bd5\u4ec0\u4e48...",
      messages: [
        {
          id: "path-trying-1",
          type: "agent",
          text: "\u5f88\u597d\uff0c\u5c1d\u8bd5\u4e86\u5c31\u6bd4\u6ca1\u5f00\u59cb\u7684\u4eba\u8d70\u5728\u524d\u9762\u4e86\u3002\u6211\u4eec\u4e00\u8d77\u505a\u4e00\u4e0b\u4f60\u7684\u8d44\u4ea7\u76d8\u70b9\uff0c\u628a\u4f60\u624b\u91cc\u73b0\u6709\u7684\u80fd\u529b\u3001\u8d44\u6e90\u3001\u7ecf\u9a8c\u6446\u5230\u684c\u9762\u4e0a\uff0c\u770b\u770b\u54ea\u4e2a\u65b9\u5411\u6700\u503c\u5f97\u7ee7\u7eed\u6295\u5165\u3002"
        }
      ],
      quickReplies: [
        { label: "\u597d\u7684", action: "asset_inventory_start" }
      ]
    },
    onboarding_path_fulltime: {
      agentKey: "master",
      inputPlaceholder: "\u8bf4\u8bf4\u4f60\u73b0\u5728\u4e3b\u8981\u5728\u505a\u7684\u8fd9\u4ef6\u4e8b...",
      messages: [
        {
          id: "path-fulltime-1",
          type: "agent",
          text: "\u5df2\u7ecf\u5168\u804c\u5728\u505a\u4e86\uff0c\u90a3\u6211\u5148\u8ddf\u4f60\u804a\u804a\u4f60\u73b0\u5728\u5728\u505a\u7684\u8fd9\u4ef6\u4e8b\u2014\u2014\u7b49\u6211\u4eec\u628a\u4e3b\u8425\u6478\u6e05\u695a\u4e86\uff0c\u518d\u628a\u5b83\u5f53\u4f5c OPC \u7684\u7b2c\u4e00\u4e2a\u8d44\u4ea7\u6b63\u5f0f\u76d8\u4e00\u6b21\u3002"
        }
      ],
      quickReplies: [
        { label: "\u597d\uff0c\u5148\u804a\u804a", action: "fulltime_intake_start" }
      ]
    },
    onboarding_path_park: {
      agentKey: "steward",
      inputPlaceholder: "\u4f60\u73b0\u5728\u662f\u5426\u5df2\u7ecf\u6ce8\u518c...",
      messages: [
        {
          id: "path-park-1",
          type: "agent",
          text: "\u597d\u773c\u5149\uff0c\u5f88\u591a\u4eba\u4e0d\u77e5\u9053\u8fd9\u4e9b\u653f\u7b56\u767d\u767d\u9519\u8fc7\u4e86\u3002\u6211\u5148\u95ee\u4f60\u51e0\u4e2a\u95ee\u9898\uff1a\u4f60\u73b0\u5728\u6ce8\u518c\u516c\u53f8\u4e86\u5417\uff1f"
        }
      ],
      quickReplies: [
        { label: "\u8fd8\u6ca1\u6ce8\u518c", action: "route_park_unregistered" },
        { label: "\u5df2\u7ecf\u6ce8\u518c\u4e86", action: "route_park_registered" }
      ]
    },
    project_execution_followup: {
      agentKey: "execution",
      inputPlaceholder: "\u6211\u6765\u7ed9\u4f60\u5199\u4e0b\u4e00\u6b65\u8bdd\u672f...",
      messages: [
        {
          id: "project-execution-1",
          type: "agent",
          text: "\u6211\u4eec\u56de\u5230\u9879\u76ee\u4e3b\u7ebf\u3002\u8fd9\u5f20\u6210\u679c\u5361\u5f88\u5173\u952e\uff0c\u6211\u73b0\u5728\u5e2e\u4f60\u628a\u5b83\u53d8\u6210\u53ef\u76f4\u63a5\u53d1\u7ed9\u5ba2\u6237\u7684\u8bdd\u672f\u3002"
        }
      ],
      quickReplies: [
        { label: "\u5148\u5199\u5f00\u573a", action: "ai_write_content" },
        { label: "\u5148\u5199\u62a5\u4ef7", action: "ai_reply_clients" }
      ]
    },
    project_asset_followup: {
      agentKey: "asset",
      inputPlaceholder: "\u6211\u4eec\u4ece\u98ce\u9669\u5f31\u9879\u7ee7\u7eed...",
      messages: [
        {
          id: "project-asset-1",
          type: "agent",
          text: "\u597d\uff0c\u6211\u4eec\u5c31\u56f4\u7ed5\u300c\u7ade\u4e89\u300d\u8fd9\u4e2a\u7ef4\u5ea6\u5f80\u4e0b\u62c6\u3002\u6211\u4f1a\u5148\u5e2e\u4f60\u68b3\u7406 3 \u4e2a\u53ef\u5dee\u5f02\u5316\u8868\u8ff0\uff0c\u518d\u8fdb\u5230\u5ba2\u6237\u9a8c\u8bc1\u3002"
        }
      ],
      quickReplies: [
        { label: "\u597d\uff0c\u5f00\u59cb\u62c6", action: "go_home" },
        { label: "\u6211\u60f3\u5148\u770b\u4f8b\u5b50", action: "go_home" }
      ]
    },
    company_park_followup: {
      agentKey: "steward",
      inputPlaceholder: "\u7ed9\u6211\u4f60\u7684\u6700\u65b0\u5165\u9a7b\u8fdb\u5ea6...",
      messages: [
        {
          id: "company-park-followup-1",
          type: "agent",
          text: "\u6211\u5df2\u5207\u5230\u300c\u56ed\u533a\u5165\u9a7b\u300d\u8fdb\u5ea6\u3002\u4eca\u5929\u4f18\u5148\u8865\u5168\u7ecf\u8425\u573a\u666f\u8bf4\u660e\uff0c\u6211\u7ed9\u4f60\u4e00\u4e2a\u53ef\u76f4\u63a5\u63d0\u4ea4\u7684\u6a21\u677f\u3002"
        }
      ],
      quickReplies: [
        { label: "\u76f4\u63a5\u7ed9\u6a21\u677f", action: "go_home" },
        { label: "\u5148\u89e3\u91ca\u4e00\u4e0b", action: "go_home" }
      ]
    },
    company_tax_followup: {
      agentKey: "steward",
      inputPlaceholder: "\u4e0b\u6b21\u7533\u62a5\u4fe1\u606f\u6211\u6765\u5e2e\u4f60\u62c6...",
      messages: [
        {
          id: "company-tax-followup-1",
          type: "agent",
          text: "\u597d\uff0c\u6211\u4eec\u5c31\u56f4\u7ed5\u4e0b\u6b21\u7533\u62a5\u65e5\u505a\u7b79\u5212\u3002\u6211\u4f1a\u5148\u62c6\u6210\u300c\u4eca\u5929-\u672c\u5468-\u4e0b\u5468\u300d\u4e09\u6b65\u6e05\u5355\uff0c\u4f60\u53ea\u9700\u8981\u7167\u7740\u6253\u52fe\u3002"
        }
      ],
      quickReplies: [
        { label: "\u7ed9\u6211\u4e09\u6b65\u6e05\u5355", action: "go_home" },
        { label: "\u6211\u5148\u770b\u98ce\u9669", action: "go_home" }
      ]
    },
    company_profit_followup: {
      agentKey: "steward",
      inputPlaceholder: "\u8d26\u6237\u5206\u914d\u6211\u6765\u5e2e\u4f60\u518d\u7b97\u4e00\u6b21...",
      messages: [
        {
          id: "company-profit-followup-1",
          type: "agent",
          text: "\u5df2\u6253\u5f00\u300c\u5229\u6da6\u4f18\u5148\u300d\u89c6\u89d2\u3002\u4f60\u73b0\u5728\u7684\u6bd4\u4f8b\u57fa\u672c\u5408\u683c\uff0c\u4f46\u300c\u7a0e\u52a1\u300d\u8d26\u6237\u53ef\u4ee5\u518d\u63d0\u524d\u4e00\u70b9\u7f13\u51b2\u3002"
        }
      ],
      quickReplies: [
        { label: "\u8c03\u6210\u66f4\u7a33\u7684\u6bd4\u4f8b", action: "go_home" },
        { label: "\u4fdd\u6301\u4e0d\u53d8", action: "go_home" }
      ]
    },
    company_payroll_followup: {
      agentKey: "steward",
      inputPlaceholder: "\u85aa\u8d44\u53d1\u653e\u6211\u6765\u5e2e\u4f60\u6392\u671f...",
      messages: [
        {
          id: "company-payroll-followup-1",
          type: "agent",
          text: "\u85aa\u8d44\u4ee3\u53d1\u6211\u5df2\u63a5\u624b\u3002\u6211\u4f1a\u5148\u6838\u5bf9\u53d1\u653e\u8282\u594f\u548c\u8d26\u6237\u4f59\u989d\uff0c\u786e\u4fdd\u4e0b\u6b21\u53d1\u653e\u4e0d\u4f1a\u6389\u94fe\u5b50\u3002"
        }
      ],
      quickReplies: [
        { label: "\u7acb\u5373\u751f\u6210\u53d1\u653e\u8868", action: "go_home" },
        { label: "\u5148\u770b\u5386\u53f2\u8bb0\u5f55", action: "go_home" }
      ]
    },
    home: {
      agentKey: "master",
      inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
      messages: [
        {
          id: "home-1",
          type: "agent",
          text: "\u65e9\u4e0a\u597d\uff0c\u4eca\u5929\u7684\u91cd\u70b9\uff1a"
        },
        {
          id: "home-2",
          type: "task_card",
          title: "\u4eca\u65e5\u4efb\u52a1",
          items: [
            {
              id: "task-1",
              label: "\u89e6\u8fbe5\u4e2a\u6f5c\u5728\u5ba2\u6237",
              tag: "\u81ea\u5a92\u4f53\u9879\u76ee"
            },
            {
              id: "task-2",
              label: "\u53d1\u4e00\u6761\u5c0f\u7ea2\u4e66",
              tag: "\u5185\u5bb9\u6760\u6746"
            },
            {
              id: "task-3",
              label: "\u8ddf\u8fdb\u6628\u5929\u7684\u610f\u5411\u5ba2\u6237",
              tag: "\u81ea\u5a92\u4f53\u9879\u76ee"
            }
          ]
        }
      ],
      quickReplies: [
        { label: "\u5148\u770b\u9879\u76ee", action: "open_projects" },
        { label: "\u6253\u5f00\u667a\u80fd\u52a9\u624b", action: "tool_ai" },
        { label: "\u6253\u5f00\u5185\u5bb9\u52a9\u624b", action: "tool_ip" }
      ]
    },
    leverage_intro: {
      agentKey: "master",
      inputPlaceholder: "\u4f60\u4e5f\u53ef\u4ee5\u76f4\u63a5\u95ee\u4e00\u6811...",
      messages: [
        {
          id: "leverage-1",
          type: "leverage_card",
          paragraphs: [
            "\u5728\u8fd9\u4e2a\u65f6\u4ee3\uff0c\u4e00\u4e2a\u4eba\u505a\u751f\u610f\u6709\u4e24\u4e2a\u514d\u8d39\u7684\u8d85\u7ea7\u6760\u6746\u2014\u2014\u4ee3\u7801\u548c\u5a92\u4f53\u3002",
            "\u4ee3\u7801\u6760\u6746\uff1a\u667a\u80fd\u52a9\u624b\u8ba9\u6bcf\u4e2a\u666e\u901a\u4eba\u90fd\u80fd\u7528\u4ee3\u7801\u5e2e\u81ea\u5df1\u5e72\u6d3b\u3002\u4f60\u4e0d\u9700\u8981\u4f1a\u5199\u4ee3\u7801\uff0c\u53ea\u9700\u8981\u4f1a\u628a\u9700\u6c42\u8bf4\u6e05\u695a\u3002",
            "\u5a92\u4f53\u6760\u6746\uff1a\u53d1\u4e00\u6761\u5185\u5bb9\u7684\u6210\u672c\u51e0\u4e4e\u4e3a\u96f6\uff0c\u4f46\u53ef\u4ee5\u89e6\u8fbe\u4e00\u4e07\u4eba\u3002\u552f\u4e00\u7684\u95e8\u69db\u662f\u575a\u6301\u8f93\u51fa\u3002",
            "\u8fd9\u4e24\u4e2a\u6760\u6746\u4e0d\u9700\u8981\u4efb\u4f55\u4eba\u7684\u8bb8\u53ef\uff0c\u6ca1\u6709\u8fb9\u9645\u6210\u672c\uff0c\u800c\u4e14\u8d8a\u7528\u8d8a\u503c\u94b1\u3002"
          ],
          primaryText: "\u7528\u667a\u80fd\u52a9\u624b\u63d0\u6548",
          secondaryText: "\u7528\u5185\u5bb9\u6760\u6746\u653e\u5927"
        }
      ],
      quickReplies: []
    },
    ai_assistant: {
      agentKey: "execution",
      inputPlaceholder: "\u63cf\u8ff0\u4f60\u73b0\u5728\u6700\u8017\u65f6\u7684\u73af\u8282...",
      messages: [
        {
          id: "ai-1",
          type: "agent",
          text: "\u667a\u80fd\u52a9\u624b\u6760\u6746\u7684\u6838\u5fc3\u662f\uff1a\u8ba9\u5b83\u5e2e\u4f60\u505a\u91cd\u590d\u7684\u4e8b\uff0c\u4f60\u53ea\u505a\u9700\u8981\u5224\u65ad\u529b\u7684\u4e8b\u3002\u8bf4\u8bf4\u4f60\u5e73\u65f6\u5de5\u4f5c\u4e2d\u6700\u82b1\u65f6\u95f4\u7684\u4e8b\u662f\u4ec0\u4e48\uff1f"
        }
      ],
      quickReplies: [
        { label: "\u56de\u5ba2\u6237\u6d88\u606f", action: "ai_reply_clients" },
        { label: "\u5199\u5185\u5bb9\u6587\u6848", action: "ai_write_content" },
        { label: "\u6574\u7406\u6570\u636e\u62a5\u8868", action: "ai_data_report" },
        { label: "\u5176\u4ed6", action: "ai_other" }
      ]
    },
    ip_assistant: {
      agentKey: "asset",
      inputPlaceholder: "\u8bf4\u8bf4\u4f60\u60f3\u5728\u54ea\u4e2a\u5e73\u53f0\u505a\u5185\u5bb9...",
      messages: [
        {
          id: "ip-1",
          type: "agent",
          text: "\u5185\u5bb9\u6760\u6746\u7684\u6838\u5fc3\u662f\uff1a\u6301\u7eed\u8f93\u51fa\u4f60\u7684\u72ec\u7279\u8ba4\u77e5\uff0c\u8ba9\u66f4\u591a\u4eba\u8ba4\u8bc6\u4f60\u3002\u6211\u5148\u5e2e\u4f60\u5b9a\u4f4d\u4e00\u4e0b\u2014\u2014\u4f60\u6700\u60f3\u5728\u54ea\u4e2a\u5e73\u53f0\u505a\uff1f"
        }
      ],
      quickReplies: [
        { label: "\u5c0f\u7ea2\u4e66", action: "ip_rednote" },
        { label: "\u6296\u97f3", action: "ip_douyin" },
        { label: "\u516c\u4f17\u53f7", action: "ip_public" },
        { label: "\u591a\u5e73\u53f0", action: "ip_multi" }
      ]
    },
    daily_feedback: {
      agentKey: "execution",
      inputPlaceholder: "\u4e5f\u53ef\u4ee5\u76f4\u63a5\u8bf4\u8bf4\u4f60\u7684\u8ddf\u8fdb\u60c5\u51b5...",
      messages: buildFeedbackMessages(),
      quickReplies: getFeedbackReplies()
    },
    weekly_report: {
      agentKey: "master",
      inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
      messages: [
        {
          id: "weekly-1",
          type: "agent",
          text: weeklyReport.headline
        },
        {
          id: "weekly-2",
          type: "report_card",
          variant: "weekly",
          title: `\u672c\u5468\u62a5\u544a\u00b7 ${weeklyReport.period}`,
          stats: weeklyReport.stats,
          comment: weeklyReport.comment,
          comparison: weeklyReport.comparison,
          primaryText: weeklyReport.primaryText || "\u6652\u5468\u62a5",
          primaryAction: "open_share"
        }
      ],
      quickReplies: []
    },
    monthly_check: {
      agentKey: "steward",
      inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
      messages: [
        {
          id: "monthly-1",
          type: "agent",
          text: monthlyCheck.intro || "\u6bcf\u67081\u53f7\uff0c\u4f8b\u884c\u4f53\u68c0\u65f6\u95f4\u3002\u8fd9\u662f\u4f60 3 \u6708\u4efd\u7684\u5546\u4e1a\u5065\u5eb7\u62a5\u544a\uff1a"
        },
        {
          id: "monthly-2",
          type: "report_card",
          variant: "monthly",
          title: monthlyCheck.title,
          metrics: monthlyCheck.metrics,
          advice: monthlyCheck.advice,
          primaryText: monthlyCheck.primaryText || "\u6652\u6708\u62a5",
          primaryAction: "open_share"
        }
      ],
      quickReplies: []
    },
    social_proof: {
      agentKey: "mindset",
      inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
      messages: [
        {
          id: "social-1",
          type: "social_proof_card",
          headline: socialProof.headline,
          proofTitle: socialProof.proofTitle,
          proof: socialProof.proof,
          proofStats: socialProof.proofStats,
          nudge: socialProof.nudge,
          primaryText: socialProof.primaryText || "\u597d\uff0c\u7ed9\u6211\u4e00\u4e2a\u4efb\u52a1",
          secondaryText: socialProof.secondaryText || "\u6211\u786e\u5b9e\u6709\u56f0\u96be"
        }
      ],
      quickReplies: []
    },
    milestone_unlocked: {
      agentKey: "master",
      inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
      messages: [
        {
          id: "milestone-1",
          type: "milestone_card",
          title: milestone.title,
          unlocked: milestone.unlocked,
          copy: milestone.copy,
          primaryText: milestone.primaryText || "\u770b\u770b\u6211\u7684\u6811",
          secondaryText: milestone.secondaryText || "\u5206\u4eab\u6210\u5c31"
        },
        {
          id: "milestone-2",
          type: "agent",
          text: milestone.followup || "\u4f60\u7684\u6811\u53c8\u957f\u51fa\u4e00\u6839\u65b0\u679d\u4e86\u3002\u63a5\u4e0b\u6765\u6211\u5e2e\u4f60\u628a\u8fd9\u4e2a\u670d\u52a1\u4ea7\u54c1\u5316\uff0c\u8ba9\u5b83\u53ef\u4ee5\u6279\u91cf\u590d\u5236\u3002"
        }
      ],
      quickReplies: []
    },
    share_asset: {
      agentKey: "asset",
      inputPlaceholder: "\u8f93\u5165\u6d88\u606f...",
      messages: [
        {
          id: "share-1",
          type: "agent",
          text: "\u4f60\u7684\u8d44\u4ea7\u76d8\u70b9\u5b8c\u6210\u4e86\u3002\u770b\u770b\u4f60\u7684\u5546\u4e1a\u8d44\u4ea7\u5168\u666f\uff1a"
        },
        {
          id: "share-2",
          type: "artifact_card",
          title: "\u6211\u7684\u8d44\u4ea7\u96f7\u8fbe",
          description: `${profile.radar[0].label} ${profile.radar[0].value}\n${profile.radar[1].label} ${profile.radar[1].value}\n${profile.radar[2].label} ${profile.radar[2].value}\n${profile.radar[3].label} ${profile.radar[3].value}`,
          tags: profile.strengths,
          meta: "3\u670831\u65e5\u751f\u6210",
          primaryText: "\u5206\u4eab\u5230\u670b\u53cb\u5708",
          primaryAction: "open_share"
        }
      ],
      quickReplies: []
    }
  };

  // \u65e7 scene key \u522b\u540d\uff0c\u9632\u6b62\u672a\u66f4\u65b0\u7684\u5ba2\u6237\u7aef / mock / \u8def\u7531\u8868\u4ecd\u6307\u5411\u65e7\u573a\u666f
  const SCENE_KEY_ALIASES = {
    onboarding_path_explore: "onboarding_path_working",
    onboarding_path_stuck: "onboarding_path_trying",
    onboarding_path_scale: "onboarding_path_fulltime"
  };
  const resolvedKey = SCENE_KEY_ALIASES[sceneKey] || sceneKey;
  const scene = scenes[resolvedKey] || scenes.home;

  return {
    ...scene,
    key: resolvedKey,
    agent: getAgentMeta(scene.agentKey)
  };
}

module.exports = {
  getConversationScene
};
