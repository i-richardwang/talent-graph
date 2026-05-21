#!/usr/bin/env python3
# 从 parquet 抽取某一列的原始名清单,去重按频次降序排,切片成 N 个 CSV。
# 每片上限由 --batch-size 控制(默认 500),超出自动分片。
# 切片大小按"Agent 能稳定通读不漏扫"定 —— 单列名字 500 行时 LLM 中段注意力
# 仍稳定;调大到 1000+ 容易漏扫字面不明显的语义变体。
# 产出文件 only 一列 raw_name,不带频次 —— Agent 逐条判决,频次已体现在分片顺序上。
#
# 用法:
#   python3 tools/prod/export-raw-names.py \
#     --source <path/to/raw.parquet> \
#     --column <列名,如 school_name / company_name> \
#     --entity-type <entity_type,如 school / company>
#
# 依赖: polars

import argparse
import sys
from datetime import date
from pathlib import Path

import polars as pl


def main() -> int:
    p = argparse.ArgumentParser(description="从 parquet 抽取原始名清单,切片为 CSV")
    p.add_argument("--source", required=True, help="parquet 路径")
    p.add_argument("--column", required=True, help="原始名所在列名(如 school_name / company_name)")
    p.add_argument("--entity-type", required=True, help="entity_type(用于文件名前缀,如 school)")
    p.add_argument("--out-dir", default="exports", help="输出目录(默认 exports/)")
    p.add_argument("--batch-size", type=int, default=500, help="每片最大行数(默认 500)")
    args = p.parse_args()

    source = Path(args.source).expanduser()
    if not source.exists():
        print(f"ERROR: parquet 不存在: {source}", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = pl.scan_parquet(source)
    agg = (
        df.filter(pl.col(args.column).is_not_null() & (pl.col(args.column) != ""))
        .group_by(args.column)
        .agg(pl.len().alias("cnt"))
        .sort("cnt", descending=True)
        .select(pl.col(args.column).alias("raw_name"))
        .collect()
    )

    total = len(agg)
    if total == 0:
        print(f"ERROR: 列 {args.column!r} 在 {source.name} 中没有有效数据", file=sys.stderr)
        return 1

    today = date.today().strftime("%Y%m%d")
    n_slices = (total + args.batch_size - 1) // args.batch_size
    width = max(2, len(str(n_slices)))

    print(f"源文件: {source}")
    print(f"列: {args.column}  entity_type: {args.entity_type}")
    print(f"去重后: {total} 条  →  切片: {n_slices} 个(每片 ≤ {args.batch_size})")
    print()

    for i in range(n_slices):
        slice_df = agg.slice(i * args.batch_size, args.batch_size)
        fname = f"{args.entity_type}_{today}_{str(i + 1).zfill(width)}.csv"
        fpath = out_dir / fname
        slice_df.write_csv(fpath)
        print(f"  {fpath}  ({len(slice_df)} 行)")

    print()
    print(f"完成。产出目录: {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
