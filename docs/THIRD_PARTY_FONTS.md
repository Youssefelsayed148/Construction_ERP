# Bundled font licenses

The frontend bundles the following IBM Plex font packages for offline, same-origin rendering:

- `@fontsource/ibm-plex-sans` 5.3.0, IBM Plex Sans.
- `@fontsource/ibm-plex-sans-arabic` 5.3.0, IBM Plex Sans Arabic.

Both packages are licensed under the SIL Open Font License, version 1.1. Full package license texts are retained in [docs/licenses/IBM-Plex-Sans-LICENSE.txt](licenses/IBM-Plex-Sans-LICENSE.txt) and [docs/licenses/IBM-Plex-Sans-Arabic-LICENSE.txt](licenses/IBM-Plex-Sans-Arabic-LICENSE.txt). Font files are embedded in the frontend build and served under the existing same-origin `font-src 'self'` Content Security Policy. No runtime font CDN is used.
