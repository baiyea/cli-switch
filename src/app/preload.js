const { contextBridge } = require("electron");
const { createPageApis } = require("./register-page-preload");

contextBridge.exposeInMainWorld("electronAPI", createPageApis());
