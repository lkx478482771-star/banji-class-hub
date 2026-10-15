"""把 MantleDB 命名空间里的全部数据导出成一份 JSON 备份。

MantleDB 是无账号的公共原型服务，没有备份、没有审计、没有 SLA，
而且免费命名空间 30 天没有写入就会被自动清空。
在做任何清理或迁移之前，请先跑一次这个脚本。

数据是**分片**存放的（见 README 的「存储分片」），所以无参数运行会按
config.js 的 mantleNamespace + mantleNamespaceMap 把**每一个命名空间**各导出一份文件；
只备份主片等于丢掉 4/5 的数据。

用法一（推荐，双击 backup-mantle.cmd 就是走这条路）：
    python backup-mantle.py
    命名空间自动从仓库根的 config.js 读取，备份写到仓库根的 backups/ 目录，
    文件名是 banji-backup-<命名空间>-<时间戳>.json。

用法二（手动指定单个命名空间）：
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


def read_namespaces_from_config(config_path: str):
    """从 config.js 里读出所有命名空间（mantleNamespace 加 mantleNamespaceMap 的每个值）。

    分片后数据散在多个命名空间里，备份必须全部收齐，所以这里返回的是列表而不是单个。
    """
    if not os.path.exists(config_path):
        return []
    with open(config_path, "r", encoding="utf-8") as handle:
        text = handle.read()
    found = []
    main_match = re.search(r'mantleNamespace\s*:\s*"([^"]+)"', text)
    if main_match:
        found.append(main_match.group(1))
    map_match = re.search(r"mantleNamespaceMap\s*:\s*\{(.*?)\}", text, re.S)
    if map_match:
        # 只取冒号右边的值（键是 "accounts/" 这种路径前缀，不是命名空间）。
        found.extend(re.findall(r':\s*"([^"]+)"', map_match.group(1)))
    # 去重但保持顺序
    namespaces = []
    for namespace in found:
        if namespace not in namespaces:
            namespaces.append(namespace)
    return namespaces


def export_namespace(namespace: str, output: str) -> int:
    """导出单个命名空间，返回失败的条目数。"""
    list_url = f"{API_BASE}/list/{urllib.parse.quote(namespace)}"
    try:
        listing = fetch_json(list_url)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
        # 空的命名空间会回 404（Namespace not found），这不算错误，照常写一份空备份。
        print(f"命名空间 {namespace}：列表读不到（{error}），按 0 条处理。")
        listing = None

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
    if failed:
        print("失败明细：")
        for record_path, message in failed[:20]:
            print(f"  - {record_path}: {message}")
    return len(failed)


def main() -> int:
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if len(sys.argv) >= 3:
        namespace, output = sys.argv[1], sys.argv[2]
        return 0 if export_namespace(namespace, output) == 0 else 1
    if len(sys.argv) != 1:
        print(__doc__)
        return 2

    namespaces = read_namespaces_from_config(os.path.join(root, "config.js"))
    if not namespaces:
        print("没能从 config.js 里读到命名空间。")
        print("请改成手动用法：python backup-mantle.py <namespace> <输出文件>")
        return 2

    backup_dir = os.path.join(root, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")

    print(f"要备份 {len(namespaces)} 个命名空间：{'、'.join(namespaces)}")
    print("")
    total_failed = 0
    total_records = 0
    files = []
    for namespace in namespaces:
        output = os.path.join(backup_dir, f"banji-backup-{namespace}-{stamp}.json")
        failed = export_namespace(namespace, output)
        total_failed += failed
        files.append(output)
        try:
            with open(output, "r", encoding="utf-8") as handle:
                total_records += json.load(handle).get("recordCount", 0)
        except (OSError, ValueError):
            pass
        print("")

    print(f"全部完成：{len(files)} 份文件，共 {total_records} 条记录，失败 {total_failed} 条。")
    print("请把 backups/ 里的这些 json 复制到网盘或 U 盘，别留在仓库目录里。")
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
