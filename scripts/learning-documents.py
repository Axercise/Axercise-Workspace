"""Bounded local document extraction/rendering; stdout is JSON only."""
import base64
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

MAX_TEXT = 2_000_000
MAX_PAGES = 500

def office(path, extension):
    with zipfile.ZipFile(path) as archive:
        if len(archive.infolist()) > 5000:
            raise ValueError("Office document contains too many entries")
        if sum(i.file_size for i in archive.infolist()) > 100 * 1024 * 1024:
            raise ValueError("Office document expands beyond 100 MB")
        if extension == "docx":
            names = ["word/document.xml"]
        elif extension == "pptx":
            names = sorted((n for n in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)), key=lambda n: int(re.search(r"(\d+)\.xml", n).group(1)))
        else:
            shared = []
            if "xl/sharedStrings.xml" in archive.namelist():
                root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
                shared = ["".join(n.text or "" for n in item.iter() if n.tag.rsplit("}", 1)[-1] == "t") for item in root]
            pages = []
            names = sorted((n for n in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)), key=lambda n: int(re.search(r"(\d+)\.xml", n).group(1)))
            for i, name in enumerate(names[:MAX_PAGES]):
                root = ElementTree.fromstring(archive.read(name))
                rows = []
                for row in root.iter():
                    if row.tag.rsplit("}", 1)[-1] != "row":
                        continue
                    cells = []
                    for cell in row:
                        value = "".join(n.text or "" for n in cell.iter() if n.tag.rsplit("}", 1)[-1] in ("v", "t"))
                        if cell.attrib.get("t") == "s" and value.isdigit():
                            value = shared[int(value)] if int(value) < len(shared) else ""
                        cells.append(f"{cell.attrib.get('r', '')}: {value}")
                    rows.append(" | ".join(cells))
                pages.append({"page": i + 1, "label": f"ชีต {i + 1}", "text": "\n".join(rows)})
            return pages
        pages = []
        for i, name in enumerate(names[:MAX_PAGES]):
            root = ElementTree.fromstring(archive.read(name))
            text = "\n".join(node.text for node in root.iter() if node.tag.rsplit("}", 1)[-1] in ("t", "v") and node.text)
            pages.append({"page": i + 1, "label": f"สไลด์ {i + 1}" if extension == "pptx" else f"ส่วนเอกสาร {i + 1}", "text": text[:MAX_TEXT]})
        return pages

def run():
    mode, filename, extension = sys.argv[1:4]
    path = Path(filename)
    if mode == "render":
        import pymupdf
        page_no = int(sys.argv[4])
        with pymupdf.open(path) as document:
            if not 1 <= page_no <= len(document):
                raise ValueError("Page number is outside the document")
            page = document[page_no - 1]
            scale = min(2, 1800 / max(page.rect.width, page.rect.height))
            data = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False).tobytes("png")
            return {"image": "data:image/png;base64," + base64.b64encode(data).decode("ascii")}
    if extension == "pdf":
        import pymupdf
        with pymupdf.open(path) as document:
            if document.needs_pass:
                raise ValueError("PDF requires a password")
            if len(document) > MAX_PAGES:
                raise ValueError("PDF exceeds 500 pages; split it into smaller documents")
            pages = [{"page": i + 1, "label": f"หน้า {i + 1}", "text": page.get_text(sort=True)} for i, page in enumerate(document)]
    elif extension in ("docx", "pptx", "xlsx"):
        pages = office(path, extension)
    elif extension in ("txt", "md", "csv", "py", "js", "ts", "c", "cpp", "h", "java", "json", "ipynb"):
        pages = [{"page": 1, "label": "ข้อความ", "text": path.read_text(encoding="utf-8-sig", errors="replace")}]
    elif extension in ("png", "jpg", "jpeg", "webp", "gif"):
        pages = [{"page": 1, "label": "ภาพ", "text": ""}]
    else:
        return {"status": "unsupported", "pages": []}
    if sum(len(p["text"]) for p in pages) > MAX_TEXT:
        raise ValueError("Document text exceeds 2 million characters; split the document")
    readable = sum(len(p["text"].strip()) for p in pages)
    partly_unreadable = extension == "pdf" and any(len(p["text"].strip()) < 5 for p in pages)
    return {"status": "ready" if readable > 10 and not partly_unreadable else "scanned", "pages": pages}

if __name__ == "__main__":
    try:
        print(json.dumps(run(), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"status": "error", "error": str(error)[:300]}))
        sys.exit(1)
