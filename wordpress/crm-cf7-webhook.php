<?php
/**
 * CRM Webhook for Contact Form 7
 * --------------------------------
 * Drop this code into your child theme's functions.php, OR install the
 * "Code Snippets" plugin and paste it there (recommended - survives theme updates).
 *
 * Then on the SAME PAGE that has your CF7 form, also add the JS file
 * `crm-utm-capture.js` so that hidden UTM fields get populated.
 *
 * In your CF7 form editor (Contact > Contact Forms > Edit), add these hidden fields:
 *
 *   [hidden utm_source]
 *   [hidden utm_medium]
 *   [hidden utm_campaign]
 *   [hidden utm_term]
 *   [hidden utm_content]
 *   [hidden gclid]
 *   [hidden fbclid]
 *   [hidden landing_page]
 *   [hidden referrer]
 *
 * Your regular fields should be named: your-name, your-phone, your-email, your-message
 * (CF7 defaults). If you use different names, edit the field map below.
 */

// =============================================================================
// CONFIG - edit these two lines
// =============================================================================
define('CRM_WEBHOOK_URL', 'https://your-backend.onrender.com/webhooks/form');
define('CRM_API_KEY',     'crm_PASTE_YOUR_TENANT_API_KEY_HERE');
// =============================================================================

add_action('wpcf7_mail_sent', 'crm_send_lead_to_backend');

function crm_send_lead_to_backend($contact_form) {
    $submission = WPCF7_Submission::get_instance();
    if (!$submission) return;

    $data = $submission->get_posted_data();

    // Map CF7 fields -> CRM payload. Adjust names on the left if your form uses different ones.
    $payload = array(
        'api_key'      => CRM_API_KEY,
        'name'         => isset($data['your-name'])    ? $data['your-name']    : '',
        'phone'        => isset($data['your-phone'])   ? $data['your-phone']   : '',
        'email'        => isset($data['your-email'])   ? $data['your-email']   : '',
        'message'      => isset($data['your-message']) ? $data['your-message'] : '',
        'utm_source'   => isset($data['utm_source'])   ? $data['utm_source']   : '',
        'utm_medium'   => isset($data['utm_medium'])   ? $data['utm_medium']   : '',
        'utm_campaign' => isset($data['utm_campaign']) ? $data['utm_campaign'] : '',
        'utm_term'     => isset($data['utm_term'])     ? $data['utm_term']     : '',
        'utm_content'  => isset($data['utm_content'])  ? $data['utm_content']  : '',
        'gclid'        => isset($data['gclid'])        ? $data['gclid']        : '',
        'fbclid'       => isset($data['fbclid'])       ? $data['fbclid']       : '',
        'landing_page' => isset($data['landing_page']) ? $data['landing_page'] : '',
        'referrer'     => isset($data['referrer'])     ? $data['referrer']     : '',
    );

    // Strip empty strings (backend treats null cleaner than "")
    foreach ($payload as $k => $v) {
        if ($v === '' || $v === null) unset($payload[$k]);
    }
    // api_key must always be sent
    $payload['api_key'] = CRM_API_KEY;

    $response = wp_remote_post(CRM_WEBHOOK_URL, array(
        'method'      => 'POST',
        'headers'     => array('Content-Type' => 'application/json'),
        'body'        => wp_json_encode($payload),
        'timeout'     => 15,
        'blocking'    => false,  // fire-and-forget so it never slows down the user
    ));

    // Log failures (visible in WP debug log)
    if (is_wp_error($response)) {
        error_log('[CRM Webhook] Error: ' . $response->get_error_message());
    }
}
