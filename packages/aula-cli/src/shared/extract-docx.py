"""Read text from an untrusted DOCX archive without extracting files or running Office."""
import io
import re
import stat
import sys
import zipfile
import xml.etree.ElementTree as ET

MAX_BYTES = 25 * 1024 * 1024
MAX_XML = 8 * 1024 * 1024
raw = sys.stdin.buffer.read(MAX_BYTES + 1)
if len(raw) > MAX_BYTES:
    raise ValueError("Input too large")
with zipfile.ZipFile(io.BytesIO(raw)) as archive:
    entries = archive.infolist()
    names = [item.filename for item in entries]
    if len(entries) > 2000 or len(set(names)) != len(names):
        raise ValueError("Unexpected archive entries")
    for item in entries:
        if item.filename.startswith("/") or "\\" in item.filename or ".." in item.filename.split("/") or stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1:
            raise ValueError("Unsafe archive member")
    if sum(item.file_size for item in entries) > 100 * 1024 * 1024:
        raise ValueError("Expanded archive too large")
    if "word/document.xml" not in names or "[Content_Types].xml" not in names:
        raise ValueError("Not a DOCX document")
    parts = ["word/document.xml"] + sorted(name for name in names if re.fullmatch(r"word/(header\d+|footer\d+|footnotes|endnotes)\.xml", name))
    output = []
    for name in parts:
        info = archive.getinfo(name)
        if info.file_size > MAX_XML or info.flag_bits & 1:
            raise ValueError("Unsupported document part")
        with archive.open(info) as stream:
            xml = stream.read(MAX_XML + 1)
        if len(xml) > MAX_XML:
            raise ValueError("Oversized XML")
        decoded = xml.decode("utf-8-sig")
        if "\x00" in decoded or "<!DOCTYPE" in decoded.upper() or "<!ENTITY" in decoded.upper():
            raise ValueError("Unsafe XML")
        root = ET.fromstring(decoded)
        ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

        def render(node, indent=""):
            if node.tag == ns + "p":
                words = []
                for child in node.iter():
                    if child.tag == ns + "t":
                        words.append(child.text or "")
                    elif child.tag == ns + "tab":
                        words.append("\t")
                    elif child.tag in (ns + "br", ns + "cr"):
                        words.append("\n")
                return [indent + "".join(words)]
            if node.tag == ns + "tbl":
                lines = []
                for row_number, row in enumerate(node.findall(ns + "tr"), 1):
                    lines.append(indent + "Table row " + str(row_number))
                    for cell_number, cell in enumerate(row.findall(ns + "tc"), 1):
                        lines.append(indent + "  Cell " + str(cell_number) + ":")
                        for child in cell:
                            lines.extend(render(child, indent + "    "))
                return lines
            lines = []
            for child in node:
                lines.extend(render(child, indent))
            return lines

        output.extend(render(root))
    sys.stdout.write("\n".join(output))
