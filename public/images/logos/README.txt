Brand logos for the homepage carousel.

Included: SVG placeholders (e.g. hospeco.svg) are already here so the
carousel shows logo-style graphics. The app currently loads .svg files.

To use your own artwork: add PNG files with the same base names
(hospeco.png, global-glove.png, etc.) and change getBrandLogoPath() in
app.js to return .png instead of .svg (or add logic to prefer .png when present).

Suggested PNG size: height ~40–60px, max width ~140px.
