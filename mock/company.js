const companyCards = [
  {
    id: "company-park",
    title: "\u56ed\u533a\u5165\u9a7b",
    icon: "\u25a6",
    badge: "\u8d44\u6599\u5ba1\u6838\u4e2d",
    rows: [
      { label: "\u5f53\u524d\u72b6\u6001", value: "\u8d44\u6599\u5ba1\u6838\u4e2d" },
      { label: "\u5165\u9a7b\u56ed\u533a", value: "\u676d\u5dde\u672a\u6765\u79d1\u6280\u57ce" },
      { label: "\u9884\u8ba1\u5b8c\u6210", value: "4\u670815\u65e5" }
    ],
    action: "\u8ddf\u4e00\u6811\u00b7\u7ba1\u5bb6\u804a\u804a\u8fdb\u5ea6",
    scene: "company_park_followup"
  },
  {
    id: "company-tax",
    title: "\u8d22\u7a0e\u72b6\u6001",
    icon: "$",
    rows: [
      { label: "\u4f01\u4e1a\u7c7b\u578b", value: "\u4e2a\u4f53\u5de5\u5546\u6237" },
      { label: "\u4e0b\u6b21\u7533\u62a5", value: "4\u670815\u65e5\uff0815\u5929\u540e\uff09", tone: "danger" },
      { label: "\u672c\u5b63\u9884\u4f30\u7a0e", value: "\u7ea6 2,400 \u5143" }
    ],
    action: "\u8ba9\u4e00\u6811\u00b7\u7ba1\u5bb6\u5e2e\u6211\u7b79\u5212",
    scene: "company_tax_followup"
  },
  {
    id: "company-profit",
    title: "\u5229\u6da6\u4f18\u5148\u8d26\u6237",
    icon: "\u25f7",
    rows: [
      { label: "\u4e0b\u6b21\u5206\u914d\u65e5", value: "4\u670810\u65e5" }
    ],
    progress: [
      { label: "\u5229\u6da6 30%", value: 30, color: "#10A37F" },
      { label: "\u85aa\u916c 30%", value: 30, color: "#378ADD" },
      { label: "\u7a0e\u52a1 15%", value: 15, color: "#EBA327" },
      { label: "\u8fd0\u8425 25%", value: 25, color: "#AFAAA0" }
    ],
    action: "\u8c03\u6574\u5206\u914d\u6bd4\u4f8b",
    scene: "company_profit_followup"
  },
  {
    id: "company-payroll",
    title: "\u85aa\u8d44\u4ee3\u53d1",
    icon: "\u25cf",
    rows: [
      { label: "\u4e0a\u6b21\u53d1\u653e", value: "3\u670825\u65e5 \u00b7 8,000\u5143" },
      { label: "\u4e0b\u6b21\u53d1\u653e", value: "4\u670825\u65e5" }
    ],
    action: "\u67e5\u770b\u53d1\u653e\u8bb0\u5f55",
    scene: "company_payroll_followup"
  }
];

module.exports = {
  companyCards
};
