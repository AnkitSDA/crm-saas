/**
 * CRM UTM Capture for Contact Form 7
 * -----------------------------------
 * Enqueue this on the landing page (or sitewide). It does two jobs:
 *
 *   1. On page load, reads UTM/gclid/fbclid from the URL and stores them
 *      in a first-party cookie (90-day TTL). This means even if a user
 *      lands via Google Ads, browses around, and submits a form 5 minutes
 *      later from a different page, the attribution still survives.
 *
 *   2. On form load, fills the hidden CF7 fields (utm_source, gclid, etc.)
 *      from the cookie + current page URL/referrer.
 *
 * INSTALL OPTIONS:
 *   A) Save this file in your child theme as /js/crm-utm-capture.js and
 *      enqueue via functions.php:
 *
 *        add_action('wp_enqueue_scripts', function() {
 *          wp_enqueue_script(
 *            'crm-utm',
 *            get_stylesheet_directory_uri() . '/js/crm-utm-capture.js',
 *            array(), '1.0', true
 *          );
 *        });
 *
 *   B) Or paste this inside a <script> tag using a plugin like
 *      "Insert Headers and Footers" (WPCode) -> Body section.
 */
(function () {
  var COOKIE_NAME = 'crm_attr';
  var COOKIE_DAYS = 90;
  var TRACKED_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign',
    'utm_term', 'utm_content', 'gclid', 'fbclid'
  ];

  function readCookie() {
    var match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
    if (!match) return {};
    try { return JSON.parse(decodeURIComponent(match[1])); } catch (e) { return {}; }
  }

  function writeCookie(obj) {
    var d = new Date();
    d.setTime(d.getTime() + COOKIE_DAYS * 24 * 60 * 60 * 1000);
    document.cookie = COOKIE_NAME + '=' + encodeURIComponent(JSON.stringify(obj))
      + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  function captureFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var existing = readCookie();
    var captured = false;

    TRACKED_PARAMS.forEach(function (key) {
      var v = params.get(key);
      if (v) {
        existing[key] = v;
        captured = true;
      }
    });

    // First-touch landing page (don't overwrite if already set)
    if (!existing.landing_page) {
      existing.landing_page = window.location.href.substring(0, 500);
      captured = true;
    }
    if (!existing.referrer && document.referrer) {
      existing.referrer = document.referrer.substring(0, 500);
      captured = true;
    }

    if (captured) writeCookie(existing);
    return existing;
  }

  function fillForm(attr) {
    // Fill any hidden input whose name matches our tracked keys.
    // Works for CF7, Elementor, Gravity Forms - any form with name="utm_source" etc.
    var keys = TRACKED_PARAMS.concat(['landing_page', 'referrer']);
    keys.forEach(function (key) {
      var v = attr[key];
      if (!v) return;
      var inputs = document.querySelectorAll('input[name="' + key + '"]');
      inputs.forEach(function (el) { el.value = v; });
    });
  }

  function run() {
    var attr = captureFromUrl();
    fillForm(attr);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Re-fill when CF7 inserts/updates forms dynamically (some themes do this)
  document.addEventListener('wpcf7mailsent', function () {/* no-op */});
})();
