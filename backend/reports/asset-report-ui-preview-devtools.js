wx.setStorageSync("opc_access_token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTUwMzk1YjM1LWEyZmQtNGVhOS05Mzc5LWRlMmQ0YTFmODBkNyIsInNpZCI6Ijc3ZjM1MDk2LTYzMDktNGU1Yy1hZDVkLTIxZmZlZGExZGIxNSIsInR5cCI6ImFjY2VzcyIsImlhdCI6MTc3NzM2ODEyNSwiZXhwIjoxNzc3Mzc1MzI1fQ.cdS1wNDH11GHuFCsgAmyjr0qshdPF9_Iebvxo6nNPEQ");
wx.setStorageSync("opc_refresh_token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTUwMzk1YjM1LWEyZmQtNGVhOS05Mzc5LWRlMmQ0YTFmODBkNyIsInNpZCI6Ijc3ZjM1MDk2LTYzMDktNGU1Yy1hZDVkLTIxZmZlZGExZGIxNSIsInR5cCI6InJlZnJlc2giLCJpYXQiOjE3NzczNjgxMjUsImV4cCI6MTc3OTk2MDEyNX0.nKRcej99Wd8QHwo6NoiMOF7gTFrWEelT_XT1HuLzjRs");
const app = getApp();
app.globalData.runtimeConfig = { ...app.globalData.runtimeConfig, baseURL: "http://127.0.0.1:3000", useMock: false };
app.globalData.user = { ...app.globalData.user, id: "user-50395b35-a2fd-4ea9-9379-de2d4a1f80d7", name: "资产报告预览用户", nickname: "资产报告预览用户", initial: "资", loggedIn: true, loginMode: "mock-wechat", stage: "资产盘点已完成", streakDays: 7 };
wx.reLaunch({ url: "/pages/profile/profile" });
