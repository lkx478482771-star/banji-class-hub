#!/usr/bin/env node
// 门禁：源码里不允许出现「裸中文标识符」。
//
// 背景（2026-10-13 真实事故）：一次自动化重构把
//     aria-label="删除事项" title="删除事项"
// 换成了
//     deleteRecordButton("deadline", item.id, 删除事项)
// 标签少了引号，`删除事项` 就成了一个未定义的变量。这是**合法语法**，
// 所以 `node --check` 一路绿灯，但页面渲染到那一行就抛 ReferenceError，
// 整块内容渲染不出来 —— 表现就是"好多按钮点了没反应"。
//
// 本脚本剥掉字符串 / 模板串 / 正则 / 注释后再找中文字符：字符串里的中文是文案，
// 合法；字符串外面还冒出中文，几乎一定是漏了引号的裸标识符。

const fs = require("fs");
const path = require("path");

// 剥掉字符串、模板串、正则、注释，只留"代码骨架"。
// 返回与原文等长的字符串，被剥掉的位置填空格（保留行号）。
function skeleton(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => {
    for (let k = a; k < b && k < n; k += 1) if (out[k] !== "\n") out[k] = " ";
  };

  // 上下文栈，每个栈帧记录"这一层结束后回到哪个上下文"。
  const stack = [];
  let ctx = "code";

  const afterRegex = new Set([
    "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "\n", "",
  ]);

  let i = 0;
  let prevSig = "";
  while (i < n) {
    const c = src[i];
    const c2 = src.slice(i, i + 2);

    if (ctx === "comment-line") {
      if (c === "\n") ctx = "code";
      else blank(i, i + 1);
      i += 1;
      continue;
    }
    if (ctx === "comment-block") {
      if (c2 === "*/") { blank(i, i + 2); i += 2; ctx = "code"; }
      else { blank(i, i + 1); i += 1; }
      continue;
    }
    if (ctx === "str") {
      const frame = stack[stack.length - 1];
      if (c === "\\") { blank(i, i + 2); i += 2; continue; }
      if (c === frame.quote) { blank(i, i + 1); i += 1; stack.pop(); ctx = frame.restore; continue; }
      if (c === "\n") { stack.pop(); ctx = frame.restore; continue; }
      blank(i, i + 1);
      i += 1;
      continue;
    }
    if (ctx === "tpl") {
      if (c === "\\") { blank(i, i + 2); i += 2; continue; }
      if (c === "`") { blank(i, i + 1); i += 1; const f = stack.pop(); ctx = f.restore; continue; }
      if (c2 === "${") {
        blank(i, i + 2);
        i += 2;
        stack.push({ kind: "expr", restore: "tpl" });
        ctx = "code";
        prevSig = "{";
        continue;
      }
      blank(i, i + 1);
      i += 1;
      continue;
    }

    // ctx === "code"
    if (c2 === "//") { blank(i, i + 2); i += 2; ctx = "comment-line"; continue; }
    if (c2 === "/*") { blank(i, i + 2); i += 2; ctx = "comment-block"; continue; }
    if (c === '"' || c === "'") {
      blank(i, i + 1);
      i += 1;
      stack.push({ kind: "str", quote: c, restore: "code" });
      ctx = "str";
      continue;
    }
    if (c === "`") {
      blank(i, i + 1);
      i += 1;
      stack.push({ kind: "tpl", restore: "code" });
      ctx = "tpl";
      continue;
    }
    if (c === "{") {
      stack.push({ kind: "brace", restore: "code" });
      prevSig = "{";
      i += 1;
      continue;
    }
    if (c === "}") {
      const top = stack[stack.length - 1];
      if (top && top.kind === "brace") { stack.pop(); i += 1; prevSig = "}"; continue; }
      if (top && top.kind === "expr") {
        stack.pop();
        blank(i, i + 1);
        i += 1;
        ctx = top.restore;
        continue;
      }
      i += 1;
      continue;
    }
    if (c === "/" && afterRegex.has(prevSig)) {
      let j = i + 1;
      let closed = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") {
          while (j < n && src[j] !== "]") { if (src[j] === "\\") j += 1; j += 1; }
        }
        if (src[j] === "/") { closed = true; break; }
        j += 1;
      }
      if (closed) { blank(i, j + 1); i = j + 1; prevSig = "/"; continue; }
    }
    if (!/\s/.test(c)) prevSig = c;
    i += 1;
  }
  return out.join("");
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const files = args.length ? args : ["app.js", "config.js", "ahu-import.js", "sw.js"];

let failed = 0;
for (const file of files) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) {
    console.log(`  跳过 ${file}（不存在）`);
    continue;
  }
  const src = fs.readFileSync(full, "utf8");
  const skel = skeleton(src);
  const srcLines = src.split("\n");
  const hits = [];

  skel.split("\n").forEach((line, idx) => {
    const tokens = line.match(/[\u4e00-\u9fff][\u4e00-\u9fff\w]*/g);
    if (!tokens) return;
    // 对象字面量的键（`中文:` 形态）是合法的，放行。
    const keys = new Set([...line.matchAll(/([\u4e00-\u9fff][\u4e00-\u9fff\w]*)\s*:/g)].map((m) => m[1]));
    const real = tokens.filter((t) => !keys.has(t));
    if (real.length) hits.push({ line: idx + 1, tokens: real, text: (srcLines[idx] || "").trim().slice(0, 130) });
  });

  if (hits.length) {
    failed += hits.length;
    console.log(`✗ ${file}：${hits.length} 处裸中文标识符`);
    for (const h of hits) {
      console.log(`    ${file}:${h.line}  [${h.tokens.join(", ")}]`);
      console.log(`      ${h.text}`);
    }
  } else {
    console.log(`✓ ${file} 干净`);
  }
}

if (failed) {
  console.log(`\n中文标识符检查未通过：${failed} 处。多半是字符串少写了引号。`);
  process.exit(1);
}
console.log("\n中文标识符检查通过。");
