"""Assemble an EPUB 3 from an already-extracted article.

Pure packaging: takes XHTML + image bytes and returns the zip. Everything that
needs a browser (settling images, serialising the DOM to well-formed XHTML)
happens in render.py — this module has no Playwright dependency.
"""
import io
import uuid
import zipfile
from datetime import datetime, timezone
from xml.sax.saxutils import escape, quoteattr

CONTAINER_XML = """<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

# Reflowable, and deliberately restrained: an e-reader's own font, size and
# dark-mode settings must win, so body sets no colour, no background and no
# font-size. Only small meta text is styled, in tones that survive inversion.
STYLESHEET = """@charset "utf-8";

body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.5;
  margin: 0 1em;
  widows: 2;
  orphans: 2;
}

header.meta { margin-bottom: 1.6em; }
header.meta .site {
  font-family: sans-serif;
  font-size: 0.7em;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  margin: 0 0 0.5em;
}
h1.title {
  font-size: 1.5em;
  line-height: 1.22;
  margin: 0 0 0.4em;
  font-weight: bold;
  text-align: left;
}
header.meta .byline {
  font-size: 0.85em;
  font-style: italic;
  margin: 0;
}
hr.rule { border: 0; border-top: 1px solid currentColor; opacity: 0.25; margin: 1em 0 1.4em; }

p { margin: 0 0 0.7em; text-indent: 0; }
h2, h3, h4 { font-size: 1.1em; line-height: 1.3; margin: 1.4em 0 0.5em; page-break-after: avoid; }
h3, h4 { font-size: 1em; }

/* Images reflow to the reader's page rather than a fixed print box. */
img { max-width: 100%; height: auto; }
figure { margin: 1.2em 0; page-break-inside: avoid; text-align: center; }
figcaption, .caption {
  font-family: sans-serif;
  font-size: 0.75em;
  font-style: italic;
  margin-top: 0.4em;
  text-align: center;
}

blockquote {
  margin: 1.2em 1em;
  padding-left: 0.8em;
  border-left: 2px solid currentColor;
  font-style: italic;
}
ul, ol { margin: 0 0 0.7em 1.2em; padding: 0; }
li { margin-bottom: 0.3em; }
pre, code { font-family: monospace; font-size: 0.85em; }
pre { white-space: pre-wrap; word-wrap: break-word; }
table { width: 100%; border-collapse: collapse; font-size: 0.85em; margin: 1.2em 0; }
th, td { border: 1px solid currentColor; padding: 0.3em 0.4em; text-align: left; }
a { text-decoration: none; color: inherit; }

footer.source {
  margin-top: 2em;
  font-family: sans-serif;
  font-size: 0.7em;
  word-wrap: break-word;
  opacity: 0.75;
}
"""

COVER_CSS = """body { margin: 0; padding: 0; text-align: center; }
img { max-width: 100%; height: auto; }
"""


def _nav(title: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contenido</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contenido</h1>
<ol><li><a href="article.xhtml">{escape(title)}</a></li></ol>
</nav>
</body>
</html>
"""


def _ncx(title: str, book_id: str) -> str:
    """EPUB 2 table of contents. EPUB 3 readers use nav.xhtml, but older
    devices (and several Kindle conversion paths) still look for this."""
    return f"""<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
  <meta name="dtb:uid" content="{escape(book_id)}"/>
  <meta name="dtb:depth" content="1"/>
  <meta name="dtb:totalPageCount" content="0"/>
  <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>{escape(title)}</text></docTitle>
<navMap>
  <navPoint id="np1" playOrder="1">
    <navLabel><text>{escape(title)}</text></navLabel>
    <content src="article.xhtml"/>
  </navPoint>
</navMap>
</ncx>
"""


def _cover_xhtml(title: str, image_href: str) -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>{escape(title)}</title>
  <link rel="stylesheet" type="text/css" href="cover.css"/>
</head>
<body epub:type="cover">
<div><img src={quoteattr(image_href)} alt={quoteattr(title)}/></div>
</body>
</html>
"""


def _opf(*, title: str, book_id: str, lang: str, author: str, site: str,
         url: str, date: str, images: list, has_cover: bool) -> str:
    manifest = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
        '<item id="css" href="style.css" media-type="text/css"/>',
        '<item id="article" href="article.xhtml" media-type="application/xhtml+xml"/>',
    ]
    spine = []
    if has_cover:
        manifest += [
            '<item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>',
            '<item id="cover-css" href="cover.css" media-type="text/css"/>',
            '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
        ]
        spine.append('<itemref idref="cover" linear="yes"/>')
    spine.append('<itemref idref="article" linear="yes"/>')

    for img in images:
        manifest.append(
            f'<item id={quoteattr(img["id"])} href={quoteattr(img["href"])} '
            f'media-type={quoteattr(img["media_type"])}/>'
        )

    meta_extra = []
    if author:
        meta_extra.append(f"<dc:creator>{escape(author)}</dc:creator>")
    if site:
        meta_extra.append(f"<dc:publisher>{escape(site)}</dc:publisher>")
    if date:
        meta_extra.append(f"<dc:date>{escape(date)}</dc:date>")
    if has_cover:
        # Legacy pointer; EPUB 2 readers find the cover only through this.
        meta_extra.append('<meta name="cover" content="cover-image"/>')

    modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    nl = "\n    "
    return f"""<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"
         unique-identifier="bookid" xml:lang={quoteattr(lang)}>
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">{escape(book_id)}</dc:identifier>
    <dc:title>{escape(title)}</dc:title>
    <dc:language>{escape(lang)}</dc:language>
    <dc:source>{escape(url)}</dc:source>
    {nl.join(meta_extra)}
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    {nl.join(manifest)}
  </manifest>
  <spine toc="ncx">
    {nl.join(spine)}
  </spine>
</package>
"""


def build(*, title: str, article_xhtml: str, url: str, lang: str = "es",
          author: str = "", site: str = "", date: str = "",
          images: list | None = None, cover_png: bytes | None = None) -> bytes:
    """Pack an article into an EPUB 3 file.

    `images` is a list of {id, href, media_type, data} as produced by the
    renderer; `article_xhtml` must already reference them by their `href`.
    """
    images = images or []
    title = title.strip() or site or "Artículo"
    book_id = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, url)}"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        # The spec requires "mimetype" first and stored uncompressed, so that
        # a reader can sniff the format from the raw bytes of the zip.
        info = zipfile.ZipInfo("mimetype")
        info.compress_type = zipfile.ZIP_STORED
        z.writestr(info, "application/epub+zip")

        z.writestr("META-INF/container.xml", CONTAINER_XML)
        z.writestr("OEBPS/content.opf", _opf(
            title=title, book_id=book_id, lang=lang, author=author, site=site,
            url=url, date=date, images=images, has_cover=cover_png is not None))
        z.writestr("OEBPS/nav.xhtml", _nav(title))
        z.writestr("OEBPS/toc.ncx", _ncx(title, book_id))
        z.writestr("OEBPS/style.css", STYLESHEET)
        z.writestr("OEBPS/article.xhtml", article_xhtml)
        if cover_png is not None:
            z.writestr("OEBPS/cover.png", cover_png)
            z.writestr("OEBPS/cover.css", COVER_CSS)
            z.writestr("OEBPS/cover.xhtml", _cover_xhtml(title, "cover.png"))
        for img in images:
            z.writestr(f"OEBPS/{img['href']}", img["data"])
    return buf.getvalue()
