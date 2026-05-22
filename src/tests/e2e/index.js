const { test, expect } = require('@playwright/test');

const { launchApp, closeApp } = require('./app-runner');

module.exports = {
  test,
  expect,
  launchApp,
  closeApp,
};
