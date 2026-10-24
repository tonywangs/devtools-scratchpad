"""Conservative filesystem resolver; deliberately not a browser or web server."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import quote, unquote, urljoin, urlsplit

ORIGIN = "https://site-link-inspector.invalid"
HTML = {".html", ".htm"}
ATTRS = {"a": {"href"}, "area": {"href"}, "img": {"src", "srcset"},
         "link": {"href"}, "script": {"src"}, "iframe": {"src"},
         "source": {"src", "srcset"}, "video": {"src", "poster"},
         "audio": {"src"}, "object": {"data"}, "form": {"action"},
         "input": {"src", "formaction"}, "button": {"formaction"}}


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.links, self.ids, self.base = [], set(), None
        self.lines = text.splitlines()
        self.feed(text)
        self.close()

    def handle_starttag(self, tag, attrs):
        # HTML uses the first duplicate attribute. Preserve other occurrences
        # as unsupported, rather than silently double-checking an ignored value.
        seen = set()
        for attr, value in attrs:
            if attr == "id" or (tag == "a" and attr == "name"):
                if value is not None and attr not in seen:
                    self.ids.add(value)
            if tag == "base" and attr == "href" and self.base is None and value is not None:
                self.base = value
            if attr in ATTRS.get(tag, set()) or (tag == "base" and attr == "href"):
                line, col = self.getpos()
                self.links.append(dict(tag=tag, attribute=attr, url=value or "",
                    line=line, column=col + 1,
                    snippet=self.get_starttag_text(),
                    duplicate=attr in seen))
            seen.add(attr)

    handle_startendtag = handle_starttag


def _unsupported_url(value):
    return ("\\" in value or any(ord(c) < 32 or ord(c) == 127 for c in value)
            or bool(re.search(r"%(?![0-9a-fA-F]{2})", value)))


def resolve(root, source, link, document, documents, index):
    def result(status, reason, **evidence):
        return {**link, "source": source, "status": status, "reason": reason, **evidence}
    raw = link["url"].strip(" ")
    if link["duplicate"]:
        return result("unsupported", "duplicate_attribute")
    if link["tag"] == "base":
        return result("skipped", "base_configuration", base=document.base)
    if not raw and link["attribute"] in {"src", "poster", "data"}:
        return result("unsupported", "empty_resource_url")
    if link["attribute"] == "srcset":
        return result("unsupported", "responsive_image_candidates")
    if link["attribute"] in {"action", "formaction"}:
        return result("unsupported", "server_form_action")
    if _unsupported_url(raw) or (document.base is not None and _unsupported_url(document.base)):
        return result("unsupported", "ambiguous_url_syntax")
    try:
        parsed_raw = urlsplit(raw)
        if parsed_raw.scheme and parsed_raw.scheme.lower() not in {"http", "https"}:
            return result("skipped", "non_navigation_scheme")
        page_url = ORIGIN + "/" + quote(source, safe="/")
        base = urljoin(page_url, document.base) if document.base is not None else page_url
        resolved = urljoin(base, raw)
        parts = urlsplit(resolved)
        evidence = dict(resolved_url=resolved, base_url=base, query_ignored=parts.query)
        # Explicit absolute URLs are external, even if they happen to match our
        # internal placeholder. No hostnames are mapped onto the filesystem.
        if parsed_raw.scheme or parsed_raw.netloc or raw.startswith("//"):
            return result("skipped", "external_network_disabled", **evidence)
        if urlsplit(base).netloc != urlsplit(ORIGIN).netloc or urlsplit(base).scheme != "https":
            return result("skipped", "external_base_network_disabled", **evidence)
        if document.base and (urlsplit(document.base).scheme or document.base.startswith("//")):
            return result("skipped", "external_base_network_disabled", **evidence)
        if re.search(r"%(?:2f|5c|00)", parts.path, re.I):
            return result("unsupported", "encoded_path_separator_or_nul", **evidence)
        decoded = unquote(parts.path, errors="strict")
        fragment = unquote(parts.fragment, errors="strict")
        if any(p == ".." for p in decoded.split("/")):
            return result("unsupported", "encoded_parent_segment", **evidence)
        target = (root / decoded.lstrip("/")).resolve()
        if not target.is_relative_to(root):
            return result("unsupported", "outside_root", **evidence)
        if target.is_dir():
            target = (target / index).resolve()
            if not target.is_relative_to(root):
                return result("unsupported", "outside_root", **evidence)
            evidence["directory_index"] = index
        evidence["target"] = target.relative_to(root).as_posix()
        evidence["fragment"] = fragment
        if not target.is_file():
            return result("failed", "missing_target", **evidence)
        if parts.path.endswith("/") and "directory_index" not in evidence:
            return result("failed", "not_a_directory", **evidence)
        if fragment:
            if ":~:" in fragment:
                return result("unsupported", "text_fragment", **evidence)
            if target.suffix.lower() not in HTML:
                return result("unsupported", "non_html_fragment", **evidence)
            target_doc = documents.get(target)
            if not isinstance(target_doc, Document):
                return result("unsupported", "unreadable_target_html", **evidence)
            if fragment not in target_doc.ids and fragment.lower() != "top":
                return result("failed", "missing_anchor", **evidence)
        return result("checked", "local_target_exists", **evidence)
    except (ValueError, UnicodeError, OSError) as exc:
        return result("unsupported", "unresolvable_url", detail=str(exc))


def inspect(root, index="index.html"):
    root = Path(root).resolve()
    if not root.is_dir():
        raise ValueError("site root must be an existing directory")
    if not index or Path(index).name != index or index in {".", ".."} or "\\" in index:
        raise ValueError("directory index must be a filename")
    documents, sources, errors = {}, [], []
    # Do not traverse directory symlinks. File symlinks are explicitly excluded.
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() not in HTML:
            continue
        source = path.relative_to(root).as_posix()
        if path.is_symlink():
            errors.append(dict(source=source, reason="symlink_html_excluded"))
            continue
        if not path.is_file():
            continue
        try:
            doc = Document(path.read_text(encoding="utf-8-sig", errors="strict"))
            documents[path.resolve()] = doc
            sources.append((source, doc))
        except (OSError, UnicodeError, ValueError) as exc:
            errors.append(dict(source=source, reason="unreadable_html", detail=str(exc)))
    links = [resolve(root, source, link, doc, documents, index)
             for source, doc in sources for link in doc.links]
    counts = {s: 0 for s in ("checked", "skipped", "unsupported", "failed")}
    counts.update(Counter(link["status"] for link in links))
    return dict(schema_version=1, root=str(root), directory_index=index,
                html_files=len(sources), total=len(links), counts=counts,
                scan_errors=errors, links=links)
