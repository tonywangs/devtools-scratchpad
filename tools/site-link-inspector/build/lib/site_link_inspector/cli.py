import argparse
import json
from pathlib import Path
from .core import inspect


def write_report(report, output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    data = json.dumps(report, ensure_ascii=True, indent=2)
    (output / "report.json").write_text(data + "\n", encoding="utf-8")
    template = Path(__file__).with_name("report.html").read_text(encoding="utf-8")
    # Prevent source content from terminating the inert JSON script element.
    safe = data.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    (output / "index.html").write_text(template.replace("__REPORT_DATA__", safe), encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Inspect a built static site without network access.")
    parser.add_argument("root", type=Path, help="built site root (UTF-8 HTML)")
    parser.add_argument("--output", type=Path, default=Path("link-report"), help="report directory outside the site root")
    parser.add_argument("--index", default="index.html", help="directory index filename")
    parser.add_argument("--strict", action="store_true", help="also fail when unsupported occurrences exist")
    args = parser.parse_args(argv)
    try:
        if args.output.resolve().is_relative_to(args.root.resolve()):
            raise ValueError("report output must be outside the inspected root")
        report = inspect(args.root, args.index)
        write_report(report, args.output)
    except (OSError, ValueError) as exc:
        parser.exit(2, f"error: {exc}\n")
    print(json.dumps({k: report[k] for k in ("html_files", "total", "counts", "scan_errors")}))
    print(f"Report: {(args.output / 'index.html').resolve()}")
    if report["scan_errors"] or report["html_files"] == 0:
        return 2
    return int(bool(report["counts"]["failed"] or (args.strict and report["counts"]["unsupported"])))
