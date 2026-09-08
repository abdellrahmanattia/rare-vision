Upload your 17 official partner logo files here, named to match js/main.js:

louis-vuitton.svg   gucci.svg        chanel.svg         hermes.svg
zara.svg             hm.svg           tommy-hilfiger.svg calvin-klein.svg
nike.svg             adidas.svg       american-eagle.svg puma.svg
lacoste.svg          us-polo-assn.svg new-balance.svg    coach.svg
casio.svg

SVG is preferred so logos stay crisp at any display size and scale cleanly
with the browser's zoom level. If you only have raster files (PNG/JPG),
that's fine too — just change the file extension in the `src` path built
inside renderBrandMarquee() in js/main.js (search for ".svg") to match
whatever format you're uploading, and rename your files to match instead.

Until a given file is uploaded, that logo automatically falls back to a
plain text label instead of showing a broken image — see handleLogoError()
in js/main.js.
