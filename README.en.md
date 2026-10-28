# WA File Sender

[Español](README.md)

Author: **Isaac Avalos** · Candidate: **0.1.0-beta.1** · License: [GPL v3](LICENSE) (`GPL-3.0-only`).

Desktop application for preparing and sending **one ZIP per WhatsApp recipient**, with a review step and at least 10 seconds between sends. Target platforms: Windows 10/11 x64 and Ubuntu 24.04 x64. Distribution packages are postponed while development continues.

Select **English** in the lower left sidebar. The language changes without restarting or losing your selection and is remembered for future launches. Names, file contents, phone numbers and your outgoing message are not translated.

1. Link WhatsApp by scanning the QR code in the application's sidebar.
2. Download the empty template and fill in your contacts, keeping the CSV headers **`nombre,telefono`**. Include the international country code; `+` is added if missing. Save as UTF-8 CSV, preserving every phone digit.
3. Select the main folder containing one subfolder per contact. Folder names must match contact names; accents are preserved, while case and surrounding spaces are ignored.
4. Select recipients and direct files, optionally write a common message and choose the pause.
5. Click **Review send**, check all details, then **Confirm and send**.

A temporary standard ZIP without encryption or a password is generated per recipient, up to 20 MiB. Originals remain intact. The optional message accompanies the ZIP as its document caption. Files are checked for changes before sending.

The application stops on errors or disconnections and does not retry or resume automatically. Check uncertain results in the WhatsApp chat before deciding whether to resend. Successfully sent contacts are unchecked but remain selectable; deliberate resends require additional authorization. “Sent” does not guarantee delivery or reading.

One log per batch is saved in the selected main folder. Results and duplicate detection remain in memory for the current session only. The WhatsApp session stays in the application's user data directory until unlinked. No application-level encryption is added to local data. The integration is unofficial; pauses do not guarantee protection against account restrictions.

## Development

Requires Node.js 24, npm 11 or later and a graphical desktop with Electron's system dependencies.

```sh
npm ci
npm start
```

```sh
npm run check
npm run test:desktop
```

Automated tests use temporary profiles, fictitious contacts and controlled transports without connecting a WhatsApp account or sending real messages. On Linux without a display, use `xvfb-run -a npm run test:desktop` while retaining the sandbox.

Do not commit documents, real contact CSVs, sessions, QR codes, temporary ZIPs, databases, logs, caches or `node_modules`. Build tooling is retained for a later distribution stage; packages are not currently generated in CI.

A manual distribution workflow is prepared separately from CI. It can generate review artifacts and optionally a draft prerelease with license and version checks. It does not run on pushes or publish releases automatically. No packages have been generated in this preparation stage. See the [distribution guide](docs/distribution.md).

Original project code is licensed under GNU GPL version 3 only. Third-party dependencies retain their own licenses and notices; see [NOTICE](NOTICE).
