#!/usr/bin/env python3
"""渲染冒烟测试：用无头浏览器逐页渲染 + 逐个按钮点击，捕获所有运行时异常。

为什么需要它（2026-10-13 真实事故）：一次自动化重构把
`aria-label="删除事项"` 换成了 `deleteRecordButton("deadline", item.id, 删除事项)`，
引号没了，`删除事项` 成了未定义变量。这是**合法语法**，`node --check` 查不出来，
但页面渲染到那一行就抛 ReferenceError，内容渲染不出来 —— 用户看到的是
"好多按钮点了没反应"。静态检查抓不到这类问题，只有真跑一遍浏览器才行。

用法：
    python scripts/smoke-render.py              # 正常跑
    python scripts/smoke-render.py --broken     # 自检：故意注入已知 bug，应当 FAIL

依赖：本机 Edge（headless）。找不到就跳过并返回 0，不阻塞。
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDGE_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]

SEED = """
<script>
try {
  localStorage.clear();
  localStorage.setItem("banji-auth-session-v1", JSON.stringify({
    local: true,
    username: "刘凯翔",
    user: { id: "local-liukaixiang", username: "刘凯翔" }
  }));
} catch (e) {}
</script>
"""

HARNESS = r"""
<pre id="probe-out" style="display:none"></pre>
<script>
(async function () {
  const errors = [];
  const seen = new Set();
  function note(kind, msg) {
    const key = kind + "|" + msg;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push(kind + ": " + String(msg).slice(0, 220));
  }
  window.addEventListener("error", (e) => note("error", (e.error && e.error.message) || e.message));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    note("reject", (r && r.message) || r);
  });
  const orig = console.error;
  console.error = function (...a) { note("console", a.map(String).join(" ")); return orig.apply(console, a); };

  window.confirm = () => false;
  window.alert = () => {};
  window.prompt = () => null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const app = () => document.getElementById("app");

  await sleep(1800);

  const pages = [...new Set([...document.querySelectorAll('[data-action="navigate"]')].map((b) => b.dataset.page))];
  const pageReport = [];
  const buttonReport = [];

  for (const p of pages) {
    const btn = document.querySelector('[data-action="navigate"][data-page="' + p + '"]');
    if (!btn) { pageReport.push({ page: p, missing: true }); continue; }
    const before = errors.length;
    let thrown = null;
    try { btn.click(); } catch (e) { thrown = String((e && e.message) || e); }
    await sleep(180);
    const html = app() ? app().innerHTML : "";
    pageReport.push({
      page: p,
      len: html.length,
      stuck: html.includes("正在准备工作台") || html.trim() === "",
      thrown,
      errors: errors.slice(before),
    });

    const actions = [...new Set([...document.querySelectorAll("#app [data-action]")].map((el) => el.dataset.action))];
    for (const a of actions.slice(0, 18)) {
      const target = document.querySelector('#app [data-action="' + a + '"]');
      if (!target) continue;
      const b2 = errors.length;
      let t2 = null;
      try { target.click(); } catch (e) { t2 = String((e && e.message) || e); }
      await sleep(70);
      buttonReport.push({ page: p, action: a, thrown: t2, errors: errors.slice(b2) });
      const close = document.querySelector('#modal-root [data-action="close-modal"]');
      if (close) { try { close.click(); } catch (e) {} await sleep(40); }
      const back = document.querySelector('[data-action="navigate"][data-page="' + p + '"]');
      if (back) { try { back.click(); } catch (e) {} await sleep(60); }
    }
  }

  document.getElementById("probe-out").textContent = JSON.stringify({
    pages: pageReport, buttons: buttonReport, allErrors: errors,
  });
})();
</script>
"""


def find_edge() -> Path | None:
    for p in EDGE_CANDIDATES:
        if p.exists():
            return p
    return None


def build(out: Path, app_override: str | None = None) -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = html.replace('<script src="config.js', SEED + '<script src="config.js')
    if app_override:
        html = re.sub(r'src="app\.js', f'src="{app_override}', html)
    html = html.replace("</body>", HARNESS + "</body>")
    out.write_text(html, encoding="utf-8")


def main() -> int:
    edge = find_edge()
    if edge is None:
        print("跳过渲染冒烟测试：本机找不到 Edge。")
        return 0

    broken = "--broken" in sys.argv
    tmp = Path(tempfile.mkdtemp(prefix="banji-smoke-"))
    app_override = None
    if broken:
        src = (ROOT / "app.js").read_text(encoding="utf-8")
        src = src.replace(
            'deleteRecordButton("deadline", item.id, "删除事项")',
            'deleteRecordButton("deadline", item.id, 删除事项)',
        )
        (tmp / "app_broken.js").write_text(src, encoding="utf-8")
        app_override = f"../{tmp.name}/app_broken.js"
        # app_override 需要相对于仓库根可解析，这里直接把文件放到仓库下临时名
        (ROOT / "__smoke_app_broken.js").write_text(src, encoding="utf-8")
        app_override = "__smoke_app_broken.js"
        print("[自检模式] 已注入已知 bug：deleteRecordButton 标签缺引号\n")

    built = ROOT / "__smoke_run.html"
    build(built, app_override)
    dom_out = ROOT / "__smoke_dom.html"

    cmd = [
        str(edge), "--headless=new", "--disable-gpu", "--log-level=3",
        "--allow-file-access-from-files",
        f"--user-data-dir={ROOT / '.edge-smoke'}",
        "--virtual-time-budget=25000", "--dump-dom", built.as_uri(),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    dom = proc.stdout or ""
    dom_out.write_text(dom, encoding="utf-8")

    for f in (built, dom_out, ROOT / "__smoke_app_broken.js"):
        try:
            f.unlink()
        except OSError:
            pass

    m = re.search(r'<pre id="probe-out"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        print("FAIL: 探针没有回填结果（页面可能整体崩了）")
        return 1
    payload = json.loads(
        m.group(1).replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    )

    pages = payload["pages"]
    print(f"=== 页面渲染（{len(pages)} 个）===")
    bad_pages = 0
    for p in pages:
        name = p.get("page", "?")
        if p.get("missing"):
            print(f"  ?  {name}: 导航按钮不存在")
            bad_pages += 1
            continue
        ok = not p["stuck"] and not p["thrown"] and not p["errors"]
        if not ok:
            bad_pages += 1
        extra = ""
        if p["thrown"]:
            extra += f" threw={p['thrown']}"
        if p["stuck"]:
            extra += " 页面卡在加载态"
        if p["errors"]:
            extra += " errors=" + "; ".join(p["errors"])
        print(f"  {'OK  ' if ok else 'FAIL'} {name}: {p['len']} 字节{extra}")

    btns = payload["buttons"]
    print(f"\n=== 按钮点击（{len(btns)} 次）===")
    bad_btns = [b for b in btns if b["thrown"] or b["errors"]]
    for b in bad_btns:
        print(f"  FAIL [{b['page']}] {b['action']}: {b['thrown'] or '; '.join(b['errors'])}")
    if not bad_btns:
        print("  全部按钮点击无异常")

    allerr = payload["allErrors"]
    print(f"\n=== 去重后的全部运行时错误（{len(allerr)} 条）===")
    for e in allerr:
        print("  " + e)

    ok = bad_pages == 0 and not bad_btns and not allerr
    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
