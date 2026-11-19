# Website analytics

The documentation site's Umami Cloud website ID is `4189bdbe-f0c1-4b47-b0ca-3fcc7991437d`. It is a public tracking ID, not an API credential. The dashboard's domain `ervin-khamoido.github.io` is correct: our integration limits tracking to the exact `/money-query-parser/` page (with or without its trailing slash). Other projects on the same domain and the Sites mirror are excluded.

The analytics code lives in `site/analytics.mjs`, outside the library's published file allowlist. Installing either npm distribution never loads a tracker or sends telemetry. Website analytics changes do not require a package release.

## What is measured

One manual pageview is sent after the tracker loads. Automatic navigation and click tracking are disabled, so editing the shareable query with `history.replaceState()` does not create more pageviews. The following fixed event names are each sent at most once per page load:

| Event | Meaning |
| --- | --- |
| `engaged_visit` | Interaction plus at least 15 observed seconds with the document visible and focused |
| `playground_input` | A trusted input event in the search expression field |
| `ast_input` | A trusted input event in the saved filter editor |
| `example_select` | Click on a parser example |
| `format_change`, `currency_change` | Change to a parser setting |
| `output_sql`, `output_formatted` | Click on an output format |
| `copy_install_click` | Click on the install-command copy button |
| `copy_code_click`, `copy_result_click` | Click on a code/result copy button |
| `share_example_click` | Click on the example-link copy button |
| `outbound_npm`, `outbound_github` | Click on a link to that destination |

Copy events describe a click, not clipboard success or an actual installation. Events count occurrence per page, not repeated actions. Reloads can count again. Engagement is a useful signal, not proof of a human visitor, unique person, recruiter, library user or npm installation. Sophisticated automated browsers can still imitate interaction; privacy settings, blockers and network failures can hide real visits.

## Data boundaries

The final before-send hook constructs a fresh allowlisted payload containing the public website ID, fixed page path/title, hostname, browser language, screen dimensions, referrer origin and an optional fixed event name. It rejects unknown events and non-event payload types. It never forwards input values, amounts, ASTs, URL query strings/fragments, referrer paths, arbitrary event data, user IDs, session recordings or captured errors. The external script request uses `no-referrer`.

The tracker uses no cookies, and this integration never calls `identify()`. Umami receives the visitor's network request and can derive approximate location and browser information; this is not an assertion that no personal data is processed. See [Umami's privacy policy](https://umami.is/privacy) and [tracker documentation](https://docs.umami.is/docs/tracker-configuration).

Tracking is disabled before loading the external script on local previews, other hostnames/paths, browsers reporting `navigator.webdriver`, Global Privacy Control, Do Not Track, explicit analytics-off URLs, and browsers with the Umami opt-out flag. If that storage flag cannot be read, tracking stays disabled. These checks are exclusions, not a bot-authentication system.

## Exclude development and your own visits

For production smoke tests or your own browsing, use:

https://ervin-khamoido.github.io/money-query-parser/?analytics=off

The flag remains in the URL as the playground updates its query. For a persistent browser opt-out, run this on the site and reload:

```js
localStorage.setItem('umami.disabled', '1');
```

This localStorage key applies to the entire origin, including other Umami-enabled GitHub Pages projects under the same account. To remove the opt-out:

```js
localStorage.removeItem('umami.disabled');
```

The privacy notice is available from the website footer. The build copies the same analytics module to both deployments, but the hostname guard prevents the mirror from sending data to this dashboard.

## Verification and reading the dashboard

Run `npm run check`: deterministic tests verify no initialization outside production, opt-outs, final-payload stripping, event deduplication, load queues, focused/visible engagement time, and tracker failures. Tests inject a fake browser and never call Umami. CI and local previews must not add visits.

After deployment, open the [Umami dashboard](https://cloud.umami.is/), select **money-query-parser**, and check realtime activity and Events. Compare pageviews/visitors with `engaged_visit` and playground events rather than interpreting pageviews alone as adoption. Existing traffic from before deployment cannot be reconstructed. Any deliberate unexcluded verification visit is test traffic and should not be presented as external adoption.
