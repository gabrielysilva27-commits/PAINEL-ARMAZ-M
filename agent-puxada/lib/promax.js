const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

function abs(root, value) {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function missingSelectors(promax) {
  const s = (promax && promax.selectors) || {};
  return ["reportSearch","dateFrom","dateTo","warehouse","deposit","operationFrom","operationTo","searchButton","exportCsv"].filter(function (key) {
    return !String(s[key] || "").trim();
  });
}

function isConfigured(config) {
  return !!String(config && config.promax && config.promax.url || "").trim() && missingSelectors(config.promax).length === 0;
}

function formatDate(iso, pattern) {
  const parts = String(iso || "").split("-");
  if (parts.length !== 3) return iso;
  if (pattern === "YYYY-MM-DD") return parts[0] + "-" + parts[1] + "-" + parts[2];
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

function getLocator(page, spec) {
  const value = String(spec || "").trim();
  if (!value) throw new Error("CALIBRATION_REQUIRED: seletor do Promax nao configurado.");
  if (value.indexOf("label=") === 0) return page.getByLabel(value.slice(6), { exact: false });
  if (value.indexOf("placeholder=") === 0) return page.getByPlaceholder(value.slice(12), { exact: false });
  if (value.indexOf("text=") === 0) return page.getByText(value.slice(5), { exact: false });
  if (value.indexOf("role=") === 0) {
    const body = value.slice(5);
    const split = body.indexOf(":");
    const role = split >= 0 ? body.slice(0, split) : body;
    const name = split >= 0 ? body.slice(split + 1) : "";
    return page.getByRole(role, name ? { name: name, exact: false } : {});
  }
  return page.locator(value);
}

async function setField(page, spec, value) {
  const el = getLocator(page, spec).first();
  await el.waitFor({ state: "visible", timeout: 15000 });
  const tag = await el.evaluate(function (node) { return node.tagName.toLowerCase(); });
  if (tag === "select") {
    try { await el.selectOption({ label: String(value) }); }
    catch (e) { await el.selectOption(String(value)); }
  } else {
    await el.fill(String(value));
  }
}

async function openContext(config, rootDir) {
  const browser = config.browser || {};
  const profileDir = abs(rootDir, browser.profileDir || "./promax-profile");
  fs.mkdirSync(profileDir, { recursive: true });
  return chromium.launchPersistentContext(profileDir, {
    channel: browser.channel || "msedge",
    headless: !!browser.headless,
    acceptDownloads: true,
    viewport: null,
    chromiumSandbox: true
  });
}

async function openCalibrationBrowser(config, rootDir) {
  const ctx = await openContext(config, rootDir);
  const page = ctx.pages()[0] || await ctx.newPage();
  if (config.promax && config.promax.url) {
    await page.goto(config.promax.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  }
  console.log("CALIBRACAO PROMAX: faca login no perfil dedicado e feche todas as janelas do Edge deste perfil quando terminar.");

  // O Promax pode abrir o relatório em outra janela/aba e fechar a tela inicial.
  // Não encerre o contexto quando apenas a primeira página for fechada.
  await new Promise(function (resolve) {
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      resolve();
    }
    function watch(p) {
      p.on("close", function () {
        setTimeout(function () {
          if (ctx.pages().length === 0) finish();
        }, 300);
      });
    }
    ctx.pages().forEach(watch);
    ctx.on("page", watch);
    ctx.on("close", finish);
  });
  await ctx.close().catch(function () {});
}

async function export020501(job, config, rootDir) {
  if (!isConfigured(config)) {
    throw new Error("CALIBRATION_REQUIRED: Promax ainda nao calibrado. Pendencias: " + missingSelectors(config.promax).join(", "));
  }
  const p = config.promax;
  const s = p.selectors;
  const ctx = await openContext(config, rootDir);
  try {
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const search = getLocator(page, s.reportSearch).first();
    await search.waitFor({ state: "visible", timeout: 20000 });
    await search.fill(p.report || job.report || "020501");
    await search.press("Enter");

    if (s.reportOpen) {
      const open = getLocator(page, s.reportOpen).first();
      await open.waitFor({ state: "visible", timeout: 15000 });
      await open.click();
    }

    await setField(page, s.dateFrom, formatDate(job.date_from, p.dateFormat || "DD/MM/YYYY"));
    await setField(page, s.dateTo, formatDate(job.date_to, p.dateFormat || "DD/MM/YYYY"));
    await setField(page, s.warehouse, p.warehouse || job.warehouse || "1");
    await setField(page, s.deposit, p.deposit || job.deposit || "1");
    await setField(page, s.operationFrom, p.operationFrom || job.operation_from || "251");
    await setField(page, s.operationTo, p.operationTo || job.operation_to || "314");

    await getLocator(page, s.searchButton).first().click();
    await page.waitForTimeout(Number(p.afterSearchWaitMs || 1200));

    if (s.exportCsvMenu) {
      await getLocator(page, s.exportCsvMenu).first().click();
      await page.waitForTimeout(300);
    }

    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    await getLocator(page, s.exportCsv).first().click();
    const download = await downloadPromise;

    const downloadDir = abs(rootDir, config.browser && config.browser.downloadDir || "./downloads");
    fs.mkdirSync(downloadDir, { recursive: true });
    const name = "020501_" + job.date_from + "_a_" + job.date_to + "_" + Date.now() + ".csv";
    const target = path.join(downloadDir, name);
    await download.saveAs(target);
    return target;
  } finally {
    await ctx.close();
  }
}

module.exports = { isConfigured, missingSelectors, openCalibrationBrowser, export020501 };
