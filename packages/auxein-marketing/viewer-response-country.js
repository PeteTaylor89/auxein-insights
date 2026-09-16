/**
 * CloudFront Function - viewer-response event.
 *
 * Publishes the viewer's IP-derived country to the browser as a cookie, so the
 * statically exported site can show country-aware pricing. Read by
 * src/lib/useRegion.ts.
 *
 * NOT YET DEPLOYED. Until it is, useRegion falls back to the browser time zone.
 *
 * To deploy:
 *   1. Create the function (viewer-response) and associate it with the default
 *      cache behaviour of the auxein.co.nz distribution. This is a SECOND
 *      function alongside url-rewrite.js, which is viewer-request.
 *   2. CloudFront-Viewer-Country is NOT supplied automatically - it has to be
 *      enabled on a policy attached to that behaviour. Use an ORIGIN REQUEST
 *      policy, not a cache policy: the HTML is byte-identical for every
 *      country, so putting country in the cache key would fragment the cache
 *      for no benefit.
 *   3. Verify:  curl -sI https://auxein.co.nz/grow/ | grep -i set-cookie
 *      Expect:  Set-Cookie: auxein_country=NZ; Path=/; Max-Age=86400; ...
 *
 * Safe by construction: if the header is missing the function sets no cookie
 * and the page keeps its time-zone fallback. Viewer-response functions run on
 * every request rather than being cached, so this cannot leak one viewer's
 * country to another.
 */
function handler(event) {
  var response = event.response;
  var country = event.request.headers['cloudfront-viewer-country'];

  if (country && country.value) {
    if (!response.cookies) {
      response.cookies = {};
    }
    response.cookies['auxein_country'] = {
      value: country.value.toUpperCase(),
      attributes: 'Path=/; Max-Age=86400; SameSite=Lax; Secure',
    };
  }

  return response;
}
