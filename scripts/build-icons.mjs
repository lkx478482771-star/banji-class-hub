#!/usr/bin/env node
/**
 * 生成 assets/icons.js —— 只打包站点真正用到的 lucide 图标。
 *
 * 背景：原来 assets/lucide.min.js 是 358 KB 的全量包（1743 个图标），
 * 而站点只用到几十个。本脚本扫描源码里出现的图标名，从 lucide 里挑出这些图标，
 * 生成一个自带 createIcons 的小文件（约十几 KB）。
 *
 * 用法：
 *   node scripts/build-icons.mjs                     # 从 unpkg 下载 lucide 0.468.0
 *   node scripts/build-icons.mjs path/to/lucide.min.js   # 用本地已有的 umd 包
 *
 * 新增图标后必须重新运行本脚本，否则图标不会显示（页面控制台会给出警告），
 * CI 里的 scripts/check-icons.mjs 也会直接失败。
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "assets", "icons.js");
const SOURCES = ["index.html", "app.js", "ahu-import.js"];
const NAME_PATTERNS = [
  /data-lucide="([a-z0-9-]+)"/g,
  /\bicon\(\s*"([a-z0-9-]+)"\s*\)/g,
  /\bicon\(\s*'([a-z0-9-]+)'\s*\)/g,
  /iconName\s*=\s*"([a-z0-9-]+)"/g,
];
const LUCIDE_VERSION = "0.468.0";

function pascalCase(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function collectIconNames(isLucideIcon) {
  const names = new Set();
  for (const file of SOURCES) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    const text = readFileSync(full, "utf8");
    for (const pattern of NAME_PATTERNS) {
      for (const match of text.matchAll(pattern)) names.add(match[1]);
    }
    // 兜底扫描：任何字符串字面量只要正好是 lucide 的图标名，就一起打包。
    // 这样 `icon(cond ? "eye-off" : "eye")` 这类动态写法不会被漏掉——
    // 漏掉的后果是页面上那个图标直接不显示。
    for (const match of text.matchAll(/["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/g)) {
      const candidate = match[1];
      if (candidate.length >= 2 && isLucideIcon(candidate)) names.add(candidate);
    }
  }
  return [...names].sort();
}

async function loadLucide() {
  const localPath = process.argv[2];
  if (localPath) return require(path.resolve(localPath));
  const url = `https://unpkg.com/lucide@${LUCIDE_VERSION}/dist/umd/lucide.min.js`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载 lucide 失败：${response.status} ${url}`);
  const source = await response.text();
  const temp = path.join(ROOT, "node_modules", ".cache-lucide.min.js");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(path.dirname(temp), { recursive: true });
  writeFileSync(temp, source, "utf8");
  return require(temp);
}

function build(icons, names) {
  const subset = {};
  const missing = [];
  const shapes = new Set();
  for (const name of names) {
    const node = icons[pascalCase(name)];
    if (!node) {
      missing.push(name);
      continue;
    }
    const [, attrs, children] = node;
    shapes.add(JSON.stringify(attrs));
    subset[name] = children;
  }
  if (missing.length) {
    throw new Error(`lucide ${LUCIDE_VERSION} 里找不到这些图标：${missing.join(", ")}`);
  }
  if (shapes.size !== 1) {
    throw new Error(
      "图标的外层 svg 属性不再统一，需要把每个图标自己的 svg 属性也写进 assets/icons.js：" +
        [...shapes].join(" | ")
    );
  }
  return { subset, defaults: JSON.parse([...shapes][0]) };
}

function render({ subset, defaults }, names) {
  const body = JSON.stringify(subset, null, 2)
    .replace(/\[\n\s+/g, "[")
    .replace(/\n\s+\]/g, "]");
  return `/* 由 scripts/build-icons.mjs 生成，请勿手改。
 * 图标数据来自 lucide v${LUCIDE_VERSION}（ISC License，https://lucide.dev）。
 * 本文件只包含站点实际用到的 ${names.length} 个图标，替代原先 358 KB 的全量包。
 * 新增图标后请重新运行：node scripts/build-icons.mjs
 */
(function (global) {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  var DEFAULTS = ${JSON.stringify(defaults)};
  var ICONS = ${body};

  function buildSvg(name, extraAttributes, element) {
    var svg = global.document.createElementNS(SVG_NS, "svg");
    var attributes = {};
    var key;
    for (key in DEFAULTS) attributes[key] = DEFAULTS[key];
    for (key in extraAttributes) attributes[key] = extraAttributes[key];

    var classes = ["lucide", "lucide-" + name];
    if (element) {
      var index;
      for (index = 0; index < element.attributes.length; index += 1) {
        var attribute = element.attributes[index];
        if (attribute.name === "class" || attribute.name === "data-lucide") continue;
        if (attribute.name === "icon-name") continue;
        attributes[attribute.name] = attribute.value;
      }
      if (element.getAttribute("class")) classes.push(element.getAttribute("class"));
    }
    attributes["class"] = classes.join(" ");

    for (key in attributes) {
      if (attributes[key] !== null && attributes[key] !== undefined) {
        svg.setAttribute(key, String(attributes[key]));
      }
    }

    ICONS[name].forEach(function (child) {
      var node = global.document.createElementNS(SVG_NS, child[0]);
      var childAttributes = child[1] || {};
      for (var childKey in childAttributes) {
        if (childAttributes[childKey] !== null && childAttributes[childKey] !== undefined) {
          node.setAttribute(childKey, String(childAttributes[childKey]));
        }
      }
      svg.appendChild(node);
    });
    return svg;
  }

  /**
   * 与 lucide 的 createIcons 兼容。这里**刻意忽略 options.root，永远扫描整个文档**：
   * 站点在局部重绘后会调用 refreshIcons(某个元素)，如果只扫那棵子树，
   * 页面骨架（侧栏、顶栏、通知面板）里的图标就永远不会被替换成 SVG。
   * lucide 原版也是忽略 root 的，行为保持一致最安全。
   */
  function createIcons(options) {
    options = options || {};
    var nameAttr = options.nameAttr || "data-lucide";
    var attrs = options.attrs || {};
    var root = global.document;
    if (!root || typeof root.querySelectorAll !== "function") return;

    var elements = root.querySelectorAll("[" + nameAttr + "]");
    var unknown = [];
    Array.prototype.forEach.call(elements, function (element) {
      var name = element.getAttribute(nameAttr);
      if (!name) return;
      if (!ICONS[name]) {
        unknown.push(name);
        return;
      }
      var svg = buildSvg(name, attrs, element);
      if (element.parentNode) element.parentNode.replaceChild(svg, element);
    });

    if (unknown.length && global.console && global.console.warn) {
      global.console.warn(
        "[班集] 这些图标没有打包进 assets/icons.js：" +
          unknown.join(", ") +
          "。请在源码里确认图标名拼写，然后运行 node scripts/build-icons.mjs。"
      );
    }
  }

  global.lucide = { createIcons: createIcons, icons: ICONS };
})(typeof window !== "undefined" ? window : this);
`;
}

async function main() {
  const lucide = await loadLucide();
  const isLucideIcon = (name) =>
    Object.prototype.hasOwnProperty.call(lucide.icons, pascalCase(name));
  const names = collectIconNames(isLucideIcon);
  if (!names.length) throw new Error("没有扫描到任何图标名，源文件路径可能不对。");
  const built = build(lucide.icons, names);
  writeFileSync(OUTPUT, render(built, names), "utf8");
  const bytes = readFileSync(OUTPUT).length;
  console.log(`已生成 ${path.relative(ROOT, OUTPUT)}：${names.length} 个图标，${bytes} bytes`);
  console.log(names.join(" "));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
