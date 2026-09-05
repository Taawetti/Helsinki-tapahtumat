/** JSON-LD turvallisesti <script type="application/ld+json">-elementtiin.
 *  JSON.stringify sellaisenaan on XSS-reitti: ulkoisen lähteen otsikossa
 *  oleva '</script><script>…' katkaisisi elementin ja suorittaisi koodia.
 *  '<' korvataan \\u003c-muodolla: riski poistuu ja JSON pysyy validina
 *  (sama merkki, eri kirjoitusasu) — hakukoneet jäsentävät identtisesti. */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
