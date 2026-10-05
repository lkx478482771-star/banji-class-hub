"""把 MantleDB 命名空间里的全部数据导出成一份 JSON 备份。

MantleDB 是无账号的公共原型服务，没有备份、没有审计、没有 SLA。
在做任何清理或迁移之前，请先跑一次这个脚本。

用法:
    python backup_mantle.py <namespace> <输出文件>

注意：导出文件里含有账号记录（口令哈希与盐）和同学的真实信息，
请勿提交进 git，也不要外传；用完按需删除。
"""
import json
import sys
import time
import urllib.error
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


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    namespace, output = sys.argv[1], sys.argv[2]
    list_url = f"{API_BASE}/list/{urllib.parse.quote(namespace)}"

    listing = fetch_json(list_url)
    paths = [
        entry.get("path")
        for entry in (listing or {}).get("entries", [])
        if isinstance(entry, dict) and isinstance(entry.get("path"), str)
    ]
    print(f"命名空间 {namespace} 共 {len(paths)} 条记录，开始逐条下载…")

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
        "namespace": namespace,
        "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "recordCount": len(records),
        "failed": failed,
        "records": records,
    }
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    import os

    print(f"已写出 {output}（{os.path.getsize(output):,} 字节，成功 {len(records)} 条，失败 {len(failed)} 条）")
    if failed:
        print("失败明细：")
        for record_path, message in failed[:20]:
            print(f"  - {record_path}: {message}")
    return 0 if not failed else 1


if __name__ == "__main__":
    import urllib.parse  # noqa: E402  (供 urllib.parse.quote 使用)

    raise SystemExit(main())
