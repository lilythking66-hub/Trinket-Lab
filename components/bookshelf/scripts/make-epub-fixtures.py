"""Generate the small EPUB fixtures used by tests/epub.*. Pure stdlib (zlib PNG writer)."""
import os, struct, zlib, zipfile

OUT = os.path.join(os.path.dirname(__file__), "..", "tests", "fixtures")
os.makedirs(OUT, exist_ok=True)


def png(w, h, top, bottom):
    rows = b""
    for y in range(h):
        t = y / (h - 1)
        c = bytes(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        rows += b"\x00" + c * w
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")


def write(name, files):
    path = os.path.join(OUT, name)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for n, data in files.items():
            z.writestr(n, data, compress_type=zipfile.ZIP_DEFLATED)
    print("wrote", path, os.path.getsize(path))


CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""

def xhtml(body, title="t"):
    return f"""<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>{title}</title><link rel="stylesheet" href="../Styles/style.css"/></head>
<body>{body}</body></html>"""

para = "海雾从早晨就没有散，灯塔的影子落在潮湿的石阶上。邮差把信放进木箱，又沿着来时的路慢慢走回去。"

# EPUB 3: nav TOC with nested entry, cover-image, two chapters inside one file (fragments),
# a two-line heading that repeats the TOC title, nav document also listed in the spine.
write("sample-epub3.epub", {
    "META-INF/container.xml": CONTAINER,
    "OEBPS/content.opf": """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:fixture-3</dc:identifier>
    <dc:title>雾尾镇来信</dc:title><dc:creator>林间</dc:creator><dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="Text/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover-img" href="Images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="Text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="Text/ch2%20and%203.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="Styles/style.css" media-type="text/css"/>
  </manifest>
  <spine><itemref idref="cover"/><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>""",
    "OEBPS/Text/nav.xhtml": xhtml("""<nav epub:type="toc"><h1>目录</h1><ol>
  <li><a href="ch1.xhtml">第一章 灯塔</a></li>
  <li><a href="ch2%20and%203.xhtml#c2">第二章 邮差</a>
    <ol><li><a href="ch2%20and%203.xhtml#c3">第三章 回信</a></li></ol></li>
</ol></nav>""", "目录"),
    "OEBPS/Text/cover.xhtml": xhtml('<div><img src="../Images/cover.png" alt="cover"/></div>'),
    "OEBPS/Text/ch1.xhtml": xhtml("<h1>第一章</h1><h2>灯塔</h2>" + "".join(f"<p>{para}</p>" for _ in range(12)) + "<p>灯塔的光<br/>照着海面。</p>"),
    "OEBPS/Text/ch2 and 3.xhtml": xhtml(
        '<section id="c2"><h1>第二章 邮差</h1><p>邮差来了，<em>雨</em>也来了。</p>'
        + "".join(f"<p>{para}</p>" for _ in range(8))
        + '</section><section id="c3"><h1>第三章 回信</h1><p>我给他回信。</p><script>bad()</script></section>'),
    "OEBPS/Images/cover.png": png(60, 90, (40, 70, 90), (190, 160, 110)),
    "OEBPS/Styles/style.css": "p { text-indent: 2em; }",
})

# EPUB 2: NCX TOC, <meta name="cover">, English, files without TOC entries continue a chapter.
write("sample-epub2.epub", {
    "META-INF/container.xml": CONTAINER,
    "OEBPS/content.opf": """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>The Lighthouse Letters</dc:title><dc:creator opf:role="aut">Lin Jian</dc:creator>
    <dc:language>en</dc:language><dc:identifier id="id">fixture-2</dc:identifier>
    <meta name="cover" content="coverimage"/>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="coverimage" href="art.png" media-type="image/png"/>
    <item id="a" href="a.html" media-type="application/xhtml+xml"/>
    <item id="a2" href="a2.html" media-type="application/xhtml+xml"/>
    <item id="b" href="b.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="a"/><itemref idref="a2"/><itemref idref="b"/></spine>
</package>""",
    "OEBPS/toc.ncx": """<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
  <navPoint id="n1" playOrder="1"><navLabel><text>Chapter One</text></navLabel><content src="a.html"/></navPoint>
  <navPoint id="n2" playOrder="2"><navLabel><text>Chapter Two</text></navLabel><content src="b.html"/></navPoint>
</navMap></ncx>""",
    "OEBPS/art.png": png(40, 60, (120, 40, 40), (230, 200, 160)),
    "OEBPS/a.html": xhtml("<h2>Chapter One</h2><p>The fog had not lifted since morning.</p><p>The postman left the letter in the wooden box.</p>"),
    "OEBPS/a2.html": xhtml("<p>This file has no TOC entry and continues chapter one.</p>"),
    "OEBPS/b.html": xhtml("<h2>Chapter Two</h2><p>I wrote back the same evening.</p>"),
})

# DRM: an encrypted content file (not font obfuscation).
write("drm.epub", {
    "META-INF/container.xml": CONTAINER,
    "META-INF/encryption.xml": """<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
  <enc:CipherData><enc:CipherReference URI="OEBPS/a.html"/></enc:CipherData></enc:EncryptedData>
</encryption>""",
    "OEBPS/content.opf": "<package/>",
})
