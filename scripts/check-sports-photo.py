#!/usr/bin/env python3
"""运动会照片门禁：免审投稿 / 一键全通过 / 管理员删除。

跑法：python scripts/check-sports-photo.py
只读代码 + 无头浏览器，绝对不碰真实共享库（fetch 全打桩）。
管理员与普通同学各跑一遍：管理员应当全部生效，同学应当全部无效。
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")

SEED = """
<script>
try {
  localStorage.clear();
  localStorage.setItem("banji-auth-session-v1", JSON.stringify({
    local: true,
    username: "__USER__",
    user: { id: "local-1", username: "__USER__" }
  }));
} catch (e) {}
</script>
"""

FAKE_FETCH = r"""
<script>
window.__calls = [];
window.__records = {};
window.__version = 1;
function __resp(value, status) {
  const code = status || 200;
  return { ok: code < 400, status: code, json: async () => value };
}
window.fetch = async function (url, options) {
  const method = String((options && options.method) || "GET").toUpperCase();
  const text = String(url);
  window.__calls.push({ method: method, url: text, body: (options && options.body) || "" });
  if (text.indexOf("/list/") >= 0) {
    const entries = Object.keys(window.__records).map(function (k, i) {
      return { path: "photos/" + k, updated_at: window.__version * 1000 + i };
    });
    return __resp({ entries: entries });
  }
  const key = decodeURIComponent(text.split("/").pop());
  if (method === "GET") {
    return window.__records[key] ? __resp(window.__records[key]) : __resp(null, 404);
  }
  window.__version += 1;
  if (method === "DELETE") {
    delete window.__records[key];
    return __resp({ deleted: true });
  }
  try { window.__records[key] = JSON.parse(options.body); } catch (e) {}
  return __resp({ ok: true });
};
</script>
"""

HARNESS = r"""
<pre id="probe-out" style="display:none"></pre>
<script>
(async function () {
  const ADMIN = __ADMIN__;
  const out = { checks: [], calls: [] };
  const log = (name, pass, detail) => out.checks.push({ name: name, pass: !!pass, detail: String(detail == null ? "" : detail) });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 列表响应有 5 秒短时缓存，探测前先清掉，否则读到的是启动时那份空列表。
  const resetCache = () => { mantleValueCache.clear(); mantleEntryCache.clear(); };
  try {
    await sleep(400);
    const cid = currentClassId();
    const photo = (id, status) => ({
      photo_id: id, class_id: cid, title: "图-" + id, data_url: "data:image/jpeg;base64,/9j/AAAA",
      width: 8, height: 8, bytes: 64, uploader_id: "u1", uploader_name: "同学甲",
      uploader_role: "student", status: status, created_at: new Date().toISOString()
    });
    window.__records.p1 = photo("p1", "pending");
    window.__records.p2 = photo("p2", "pending");
    window.__records.a1 = photo("a1", "approved");

    log("免审开关为 true", SPORTS_PHOTO_AUTO_APPROVE === true, SPORTS_PHOTO_AUTO_APPROVE);
    log("审核权限 " + (ADMIN ? "有" : "没有"), hasRolePermission(SPORTS_PHOTO_REVIEW_ROLES) === ADMIN, authState.session.role);

    resetCache();
    await loadSportsPhotos();
    log("读到 2 条待审 + 1 条已通过", sportsPhotos.pending.length === 2 && sportsPhotos.approved.length === 1,
        "pending=" + sportsPhotos.pending.length + " approved=" + sportsPhotos.approved.length);

    const shared = sportsMomentList().filter((p) => p.photoId === "a1");
    log("已通过照片带上了 photoId", shared.length === 1, JSON.stringify(shared.map((p) => p.photoId)));

    // --- 投稿走免审（对谁都一样） ---
    sportsUi.photoDraft = { dataUrl: "data:image/jpeg;base64,/9j/BBBB", width: 8, height: 8, bytes: 64 };
    const input = document.createElement("input");
    input.id = "sports-photo-title";
    input.value = "免审测试";
    document.body.appendChild(input);
    window.__calls.length = 0;
    await submitSportsPhoto();
    const posted = window.__calls.filter((c) => c.method === "POST").pop();
    let postedStatus = "(没有 POST)";
    try { postedStatus = JSON.parse(posted.body).status; } catch (e) {}
    log("投稿直接落成 approved", postedStatus === "approved", postedStatus);
    input.remove();

    // --- 一键全通过 ---
    resetCache();
    await loadSportsPhotos();
    const before = sportsPhotos.pending.length;
    window.__calls.length = 0;
    await approveAllSportsPhotos();
    const posts = window.__calls.filter((c) => c.method === "POST");
    const allApproved = posts.every((c) => { try { return JSON.parse(c.body).status === "approved"; } catch (e) { return false; } });
    resetCache();
    await loadSportsPhotos();
    if (ADMIN) {
      log("一键全通过把 " + before + " 条都改了", posts.length === before && before > 0 && allApproved, "POST=" + posts.length);
      log("通过后待审清零", sportsPhotos.pending.length === 0, sportsPhotos.pending.length);
    } else {
      log("同学点不动一键全通过", posts.length === 0, "POST=" + posts.length);
      log("同学的待审队列原封不动", sportsPhotos.pending.length === before && before > 0, sportsPhotos.pending.length);
    }

    // --- 审核弹窗 ---
    sportsPhotos.pending = [photo("x1", "pending"), photo("x2", "pending"), photo("x3", "pending")];
    closeSportsDialog();
    openSportsReviewDialog();
    const dlg = document.getElementById("sports-dialog");
    const dialogHtml = dlg ? dlg.innerHTML : "";
    if (ADMIN) {
      log("审核弹窗出现「全部通过」按钮", dialogHtml.indexOf("sports-photo-approve-all") >= 0, dialogHtml.length + " 字节");
      log("弹窗文案含全部通过", dialogHtml.indexOf("全部通过") >= 0, "");
    } else {
      log("同学根本打不开审核弹窗", !dlg, dialogHtml.length + " 字节");
    }
    closeSportsDialog();

    // --- 灯箱删除按钮 ---
    resetCache();
    await loadSportsPhotos();
    const list = sportsMomentList();
    const sharedIdx = list.findIndex((p) => p.photoId === "a1");
    closeSportsPhoto();
    openSportsPhoto(sharedIdx);
    const box = document.getElementById("sports-lightbox");
    const lbHtml = box ? box.innerHTML : "";
    log("共享照片灯箱删除按钮 " + (ADMIN ? "有" : "没有"),
        (lbHtml.indexOf("sports-photo-delete") >= 0) === ADMIN, lbHtml.length + " 字节");
    closeSportsPhoto();

    // --- 删除真的发 DELETE ---
    window.confirm = () => true;
    window.__calls.length = 0;
    await removeSportsPhoto("a1");
    const dels = window.__calls.filter((c) => c.method === "DELETE");
    if (ADMIN) {
      log("删除发出 1 次 DELETE", dels.length === 1, "DELETE=" + dels.length);
      log("删除后记录真的没了", !window.__records.a1, Object.keys(window.__records).join(","));
    } else {
      log("同学删不掉，不发 DELETE", dels.length === 0, "DELETE=" + dels.length);
      log("同学的记录还在", !!window.__records.a1, Object.keys(window.__records).join(","));
    }

    // --- 面板说明文案 ---
    const panel = renderSportsMomentsPanel();
    log("面板说明改成免审口径", panel.indexOf("发出来立刻就能看到") >= 0, "");
  } catch (error) {
    log("探针整体未抛异常", false, (error && error.message) || error);
  }
  document.getElementById("probe-out").textContent = JSON.stringify(out);
})();
</script>
"""


def build(username: str, is_admin: bool, target: Path) -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert html.count("</body>") == 1, "index.html 里 </body> 不是唯一"
    inject = (
        SEED.replace("__USER__", username)
        + FAKE_FETCH
        + HARNESS.replace("__ADMIN__", "true" if is_admin else "false")
    )
    target.write_text(html.replace("</body>", inject + "</body>"), encoding="utf-8")


def run(username: str, is_admin: bool, tag: str) -> dict:
    page = ROOT / ("__photo_probe_%s.html" % tag)
    build(username, is_admin, page)
    cmd = [
        str(EDGE), "--headless=new", "--disable-gpu", "--log-level=3",
        "--allow-file-access-from-files",
        "--user-data-dir=%s" % (ROOT / (".edge-photo-" + tag)),
        "--virtual-time-budget=15000", "--dump-dom", page.as_uri(),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    dom = proc.stdout or ""
    try:
        page.unlink()
    except OSError:
        pass
    m = re.search(r'<pre id="probe-out"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        print("FAIL: 探针没有回填结果（页面可能整体崩了）")
        sys.exit(1)
    raw = m.group(1)
    raw = raw.replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return json.loads(raw)


def report(title: str, payload: dict) -> int:
    print("=== %s ===" % title)
    bad = 0
    for c in payload["checks"]:
        if not c["pass"]:
            bad += 1
        extra = ("  -> " + c["detail"]) if c["detail"] else ""
        print("  %s %s%s" % ("OK  " if c["pass"] else "FAIL", c["name"], extra))
    return bad


def main() -> int:
    if not EDGE.exists():
        print("找不到 Edge，跳过。")
        return 0
    bad = report("管理员 刘凯翔", run("刘凯翔", True, "admin"))
    print("")
    bad += report("普通同学 陈可", run("陈可", False, "student"))
    print("")
    print("RESULT:", "PASS" if bad == 0 else "FAIL（%d 项不过）" % bad)
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
