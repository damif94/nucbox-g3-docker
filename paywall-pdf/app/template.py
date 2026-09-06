"""Printable HTML wrapper for extracted articles."""
import html

PAGE_CSS = """
@page { size: A4; margin: 18mm 16mm 16mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font: 12pt/1.62 Georgia, "Times New Roman", serif;
  color: #1a1a1a; margin: 0; background: #fff; hyphens: auto;
}
header.meta { border-bottom: 1.5pt solid #1a1a1a; padding-bottom: 8pt; margin-bottom: 16pt; }
header.meta .site {
  font: bold 8.5pt/1.3 -apple-system, "Helvetica Neue", Arial, sans-serif;
  letter-spacing: .11em; text-transform: uppercase; color: #8a6a3b;
}
h1.title { font-size: 21pt; line-height: 1.2; margin: 6pt 0 8pt; font-weight: 700; }
header.meta .byline {
  font: italic 10pt/1.4 Georgia, serif; color: #555;
}
p { margin: 0 0 10pt; orphans: 3; widows: 3; text-align: justify; }
h2, h3, h4 {
  font: bold 13pt/1.3 Georgia, serif; margin: 16pt 0 6pt;
  break-after: avoid; page-break-after: avoid;
}
h3 { font-size: 11.5pt; }
figure { margin: 12pt 0; break-inside: avoid; page-break-inside: avoid; }
img {
  max-width: 100%; height: auto; display: block; margin: 0 auto;
  /* Cap height so one tall photo can't leave a mostly-blank page */
  max-height: 115mm; object-fit: contain;
}
figcaption, .caption {
  font: 8.5pt/1.4 -apple-system, Arial, sans-serif; color: #666;
  margin-top: 4pt; text-align: center;
}
blockquote {
  margin: 12pt 0 12pt 10pt; padding-left: 10pt;
  border-left: 2.5pt solid #d8cdbb; color: #444; font-style: italic;
}
ul, ol { margin: 0 0 10pt 16pt; padding: 0; }
li { margin-bottom: 4pt; }
pre, code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9.5pt; }
pre { background: #f5f3ef; padding: 8pt; overflow-wrap: break-word; white-space: pre-wrap; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 12pt 0; }
th, td { border: .5pt solid #ccc; padding: 4pt 6pt; text-align: left; }
a { color: #1a1a1a; text-decoration: none; }
hr { border: 0; border-top: .5pt solid #ddd; margin: 14pt 0; }
/* Strip junk Readability sometimes keeps */
iframe, video, audio, form, button, .newsletter, [class*="promo"],
[class*="related"], [class*="subscribe"], [class*="paywall"] { display: none !important; }
footer.source {
  margin-top: 20pt; padding-top: 8pt; border-top: .5pt solid #ccc;
  font: 8pt/1.45 -apple-system, Arial, sans-serif; color: #777; word-break: break-all;
}
"""


def build(*, title: str, content_html: str, url: str, site: str = "",
          byline: str = "", published: str = "", engine: str = "") -> str:
    """Wrap extracted article HTML in a self-contained printable document."""
    esc = html.escape
    sub = " · ".join(x for x in (byline.strip(), published.strip()) if x)
    return f"""<!doctype html>
<html lang="{esc(LANG_GUESS(url))}">
<head>
<meta charset="utf-8">
<base href="{esc(url, quote=True)}">
<title>{esc(title)}</title>
<style>{PAGE_CSS}</style>
</head>
<body>
<header class="meta">
  <div class="site">{esc(site or _host(url))}</div>
  <h1 class="title">{esc(title)}</h1>
  {f'<div class="byline">{esc(sub)}</div>' if sub else ''}
</header>
<article>
{content_html}
</article>
<footer class="source">
  {esc(url)}<br>
  Bypass Paywalls Clean → PDF{f' · {esc(engine)}' if engine else ''}
</footer>
</body>
</html>"""


def _host(url: str) -> str:
    from urllib.parse import urlparse
    return (urlparse(url).hostname or "").removeprefix("www.")


def LANG_GUESS(url: str) -> str:
    host = _host(url)
    if host.endswith((".uy", ".ar", ".es", ".mx", ".cl", ".co")):
        return "es"
    return "en"


def build_epub_source(*, title: str, content_html: str, url: str, site: str = "",
                      byline: str = "", published: str = "", engine: str = "",
                      lang: str = "") -> str:
    """HTML for the EPUB's article document, loaded in the browser first.

    Unlike `build()` this carries no print CSS and no inline styles: it links
    the stylesheet that ships inside the EPUB, and keeps `<base>` only so the
    original image URLs still resolve while the page loads. render.py strips
    the base, rewrites the images to local hrefs and serialises the result to
    well-formed XHTML.
    """
    esc = html.escape
    sub = " · ".join(x for x in (byline.strip(), published.strip()) if x)
    return f"""<!doctype html>
<html lang="{esc(lang or LANG_GUESS(url))}">
<head>
<meta charset="utf-8">
<base href="{esc(url, quote=True)}">
<title>{esc(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css">
</head>
<body>
<header class="meta">
  <p class="site">{esc(site or _host(url))}</p>
  <h1 class="title">{esc(title)}</h1>
  {f'<p class="byline">{esc(sub)}</p>' if sub else ''}
</header>
<hr class="rule">
<article>
{content_html}
</article>
<footer class="source">
  <p>{esc(url)}</p>
  <p>Bypass Paywalls Clean{f' · {esc(engine)}' if engine else ''}</p>
</footer>
</body>
</html>"""


COVER_CSS = """
html, body { margin: 0; padding: 0; width: 100%; height: 100%; }
body {
  display: flex; flex-direction: column; justify-content: space-between;
  box-sizing: border-box; padding: 90px 80px 70px;
  background: #f7f4ee; color: #1a1a1a;
  font-family: Georgia, "Times New Roman", serif;
  border-top: 26px solid #8a6a3b;
}
.site {
  font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 30px; font-weight: 700; letter-spacing: .16em;
  text-transform: uppercase; color: #8a6a3b;
}
h1 {
  font-size: 78px; line-height: 1.14; font-weight: 700; margin: 0;
  /* Long headlines must shrink rather than overflow the cover. */
  overflow: hidden; max-height: 8.4em;
}
h1.long { font-size: 58px; }
h1.xlong { font-size: 46px; }
.meta { font-size: 27px; font-style: italic; color: #555; line-height: 1.5; }
.rule { border: 0; border-top: 2px solid #cdbfa6; margin: 44px 0; }
"""


def build_cover(*, title: str, site: str, byline: str = "", published: str = "") -> str:
    """A standalone page screenshotted into the EPUB cover image.

    E-reader libraries are browsed by cover, so an article with no cover is
    hard to find again; this gives every one a legible, consistent thumbnail.
    """
    esc = html.escape
    size = "xlong" if len(title) > 110 else "long" if len(title) > 60 else ""
    sub = " · ".join(x for x in (byline.strip(), published.strip()) if x)
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><style>{COVER_CSS}</style></head>
<body>
<div><div class="site">{esc(site)}</div><hr class="rule"></div>
<h1 class="{size}">{esc(title)}</h1>
<div><hr class="rule"><div class="meta">{esc(sub)}</div></div>
</body></html>"""
