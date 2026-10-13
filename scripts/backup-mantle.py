"""把 MantleDB 命名空间里的全部数据导出成一份 JSON 备份。

MantleDB 是无账号的公共原型服务，没有备份、没有审计、没有 SLA，
而且免费命名空间 30 天没有写入就会被自动清空。
在做任何清理或迁移之前，请先跑一次这个脚本。

用法一（推荐，双击 backup-mantle.cmd 就是走这条路）：
    python backup-mantle.py
    命名空间自动从仓库根的 config.js 读取，备份写到仓库根的 backups/ 目录。

用法二（手动指定）：
    python backup-mantle.py <namespace> <输出文件>

注意：导出文件里含有账号记录（口令哈希与盐）和同学的真实信息，
请勿提交进 git（.gitignore 已屏蔽 *-backup-*.json），也不要外传。
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_BASE = "https://mantledb.sh/v2"


def fetch_json(url: str):
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            # MantleDB 前面的 CDN 会拒绝 Python 默认 UA（返回 403）。
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ),
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
    return json.loads(body.decode("utf-8")) if body else None


def read_namespace_from_config(config_path: str):
    """从 config.js 里抠出 mantleNamespace，省得每次手打那串随机 ID。"""
    if not os.path.exists(config_path):
        return None
    with open(config_path, "r", encoding="utf-8") as handle:
        text = handle.read()
    match = re.search(r'mantleNamespace\s*:\s*"([^"]+)"', text)
    return match.group(1) if match else None


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if len(sys.argv) >= 3:
        namespace, output = sys.argv[1], sys.argv[2]
    elif len(sys.argv) == 1:
        namespace = read_namespace_from_config(os.path.join(root, "config.js"))
        if not namespace:
            print("没能从 config.js 里读到 mantleNamespace。")
            print("请改成手动用法：python backup-mantle.py <namespace> <输出文件>")
            return 2
        backup_dir = os.path.join(root, "backups")
        os.makedirs(backup_dir, exist_ok=True)
        output = os.path.join(
            backup_dir, f"banji-backup-{time.strftime('%Y%m%d-%H%M%S')}.json"
        )
    else:
        print(__doc__)
        return 2

    list_url = f"{API_BASE}/list/{urllib.parse.quote(namespace)}"

    listing = fetch_json(list_url)
    paths = [
        entry.get("path")
        for entry in (listing or {}).get("entries", [])
        if isinstance(entry, dict) and isinstance(entry.get("path"), str)
    ]
    print(f"命名空间 {namespace}")
    print(f"共 {len(paths)} 条记录，开始逐条下载…")

    records = {}
    failed = []
    for index, record_path in enumerate(paths, start=1):
        # 记录路径里可能有中文，必须转义（保留 / 作为层级分隔）。
        url = f"{API_BASE}/{urllib.parse.quote(namespace)}/{urllib.parse.quote(record_path, safe='/')}"
        try:
            records[record_path] = fetch_json(url)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            failed.append((record_path, str(error)))
        if index % 50 == 0:
            print(f"  已处理 {index}/{len(paths)}")
        time.sleep(0.05)

    payload = {
        "app": "banji-class-hub",
        "namespace": namespace,
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "recordCount": len(records),
        "failed": failed,
        "records": records,
    }
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    print("")
    print(
        f"备份完成：{output}"
        f"（{os.path.getsize(output):,} 字节，成功 {len(records)} 条，失败 {len(failed)} 条）"
    )
    print("请把这份 json 复制到网盘或 U 盘，别留在仓库目录里。")
    if failed:
        print("失败明细：")
        for record_path, message in failed[:20]:
            print(f"  - {record_path}: {message}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
