module.exports = {
  apps: [
    {
      name: "opc-backend",
      cwd: "/srv/opc-latest/backend",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "700M",
      time: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
