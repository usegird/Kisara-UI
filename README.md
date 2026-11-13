# KisaraUI

KisaraUI is a web front end for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) and for
LLM servers with an OpenAI-compatible Chat Completions API. It runs entirely in your browser
and connects directly to the servers you specify. It has no server of its own.

## Requirements

- A ComfyUI instance that you run, started with `--enable-cors-header <origin>`, where
  `<origin>` is the origin you open KisaraUI from. Prefer a specific origin over `*`.
- Optionally, an LLM server or service with an OpenAI-compatible Chat Completions API.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Before sending a change, run:

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build
```

The Node.js version is pinned in `.nvmrc`, and the package manager is pnpm.

## Privacy

Usegrid institute does not collect personal information through KisaraUI. What you enter stays in your
browser, or in the user folder of the ComfyUI you connect to, and is sent only to the servers
you specify. The full privacy policy is shown in the app.

## License

KisaraUI is distributed under the Business Source License 1.1. See [`LICENSE`](LICENSE) for
the terms, including the Additional Use Grant and the Change License (MIT).
Images, text and other content you generate with KisaraUI are not restricted by this license.
The Terms of Service and the Privacy Policy in [`legal/`](legal/) are **not** part of the
licensed work: they are (c) Usegrid institute, all rights reserved, and apply only to the official
deployment. If you deploy or redistribute KisaraUI, replace them with your own texts
(see [`legal/README.md`](legal/README.md)).

## Contributing and security

- Contributions: see [`CONTRIBUTING.md`](CONTRIBUTING.md). Contributions are accepted under
  the MIT License.
- Bug reports and feature requests: open an issue using one of the templates. Issues are
  public: do not post personal information, API keys, or the URLs of your servers, including
  in screenshots.
- Vulnerabilities: see [`SECURITY.md`](SECURITY.md). Report them privately through GitHub
  private vulnerability reporting, not in issues.
- Questions and other feedback: use the contact form (https://contact.kisara-ui.com).

## Trademarks

KisaraUI is not affiliated with or endorsed by ComfyUI or by any LLM server or service it can
connect to. Their names are used only to describe compatibility.
