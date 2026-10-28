# WA File Sender

[Español](README.md)

Author: **Isaac Avalos** · Beta: **0.1.0-beta.1** · License: [GPL v3](LICENSE) (`GPL-3.0-only`).

Desktop application for preparing and sending **one ZIP per WhatsApp recipient**, with a review step and at least 10 seconds between sends.

## Download and installation

[Beta 0.1.0-beta.1](https://github.com/yoshadow/wa-file-sender/releases/tag/v0.1.0-beta.1) is available for **x64** systems. You do not need to install Node.js, npm or Chrome to use the packages.

| System            | Download                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows x64       | [.exe installer](https://github.com/yoshadow/wa-file-sender/releases/download/v0.1.0-beta.1/WA-File-Sender-0.1.0-beta.1-windows-x64.exe)           |
| Linux x64         | [.AppImage application](https://github.com/yoshadow/wa-file-sender/releases/download/v0.1.0-beta.1/WA-File-Sender-0.1.0-beta.1-linux-x64.AppImage) |
| SHA-256 checksums | [SHA256SUMS.txt](https://github.com/yoshadow/wa-file-sender/releases/download/v0.1.0-beta.1/SHA256SUMS.txt)                                        |

The release's **Source code** archives contain source code; use the `.exe` or `.AppImage` to install the application.

### Windows

1. Download the `.exe` installer using the link above.
2. Open the file and follow the installer instructions.
3. Launch **WA File Sender** from the Start menu.

### Linux

1. Download the `.AppImage` file and save it in a folder where you want to keep the application.
2. Open a terminal in that folder and make the file executable:

   ```sh
   chmod +x WA-File-Sender-0.1.0-beta.1-linux-x64.AppImage
   ```

3. Open it with a double-click or run it from that terminal:

   ```sh
   ./WA-File-Sender-0.1.0-beta.1-linux-x64.AppImage
   ```

The AppImage runs directly; it does not use an installation wizard.

### Tested compatibility

Manual testing confirmed application operation, sending, opening the received ZIP and session recovery on **Windows 11 x64** and **Linux Mint 22.3 Cinnamon 64-bit**. Manual package testing on Windows 10 and Ubuntu 24.04 remains pending; other distributions and architectures have not been verified.

These beta packages are unsigned, so your system may display a security warning. SHA-256 checksums can verify file integrity but do not replace a publisher signature.

## Usage

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

Do not commit documents, real contact CSVs, sessions, QR codes, temporary ZIPs, databases, logs, caches or `node_modules`.

CI runs code and desktop checks on Ubuntu 24.04 and Windows Server 2022. Package generation runs separately through the manual distribution workflow, with license and version checks and an optional draft prerelease. It does not run on pushes or pull requests or publish releases automatically. CI does not replace manual package testing. See the [distribution guide](docs/distribution.md) and the [published beta notes](https://github.com/yoshadow/wa-file-sender/releases/tag/v0.1.0-beta.1).

Original project code is licensed under GNU GPL version 3 only. Third-party dependencies retain their own licenses and notices; see [NOTICE](NOTICE).
