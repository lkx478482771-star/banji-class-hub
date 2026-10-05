// 一次性校验：用最小 DOM 桩跑一遍生成的 assets/icons.js，确认 59 个图标都能替换成 SVG。
// 用法: node verify_icons.mjs <repo>
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repo = path.resolve(process.argv[2]);

class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.childNodes = [];
    this.attributes = [];
    this.parentNode = null;
  }
  setAttribute(name, value) {
    const existing = this.attributes.find((item) => item.name === name);
    if (existing) existing.value = value;
    else this.attributes.push({ name, value });
  }
  getAttribute(name) {
    const found = this.attributes.find((item) => item.name === name);
    return found ? found.value : null;
  }
  get attributesList() {
    return this.attributes;
  }
  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  replaceChild(next, old) {
    const index = this.childNodes.indexOf(old);
    if (index >= 0) this.childNodes[index] = next;
    next.parentNode = this;
    old.parentNode = null;
    return old;
  }
  serialize() {
    const attrs = this.attributes
      .map((item) => ` ${item.name}="${item.value}"`)
      .join("");
    const inner = this.childNodes.map((child) => child.serialize()).join("");
    return `<${this.tagName}${attrs}>${inner}</${this.tagName}>`;
  }
}

const ROOT = new FakeNode("div");

const source = readFileSync(path.join(repo, "assets", "icons.js"), "utf8");
const names = [...source.matchAll(/^  "([a-z0-9-]+)":/gm)].map((match) => match[1]);

for (const name of names) {
  const element = new FakeNode("i");
  element.setAttribute("data-lucide", name);
  ROOT.appendChild(element);
}

const documentStub = {
  createElementNS: (_ns, tag) => new FakeNode(tag),
  querySelectorAll: (selector) => {
    const attribute = selector.replace(/^\[|\]$/g, "");
    return ROOT.childNodes.filter((node) => node.getAttribute(attribute) !== null);
  },
};

const sandbox = { document: documentStub, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

sandbox.lucide.createIcons({ root: documentStub, attrs: { "stroke-width": 1.9 } });

const failures = [];
ROOT.childNodes.forEach((node, index) => {
  const html = node.serialize();
  const name = names[index];
  if (node.tagName !== "svg") failures.push(`${name}: 未替换成 svg（${node.tagName}）`);
  if (!html.includes(`class="lucide lucide-${name}"`)) failures.push(`${name}: class 不正确`);
  if (!html.includes('stroke-width="1.9"')) failures.push(`${name}: attrs 未生效`);
  if (node.childNodes.length === 0) failures.push(`${name}: 没有图形子节点`);
});

console.log(`检查 ${names.length} 个图标`);
console.log("箭头图标样例:", ROOT.childNodes[names.indexOf("arrow-up-right")].serialize());
console.log("用户图标样例:", ROOT.childNodes[names.indexOf("user-round")].serialize());
if (failures.length) {
  console.error("失败:");
  failures.forEach((item) => console.error(" -", item));
  process.exit(1);
}
console.log("全部通过");
