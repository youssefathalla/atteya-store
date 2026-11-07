# Atteya Store

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.3.

## How work gets done

- Work is tracked in Linear, with the team and project named in `linear.config.json`. `AGENTS.md` is the full rulebook for people and AI agents.
- Branch names are `<type>/<short-name>`, for example `fix/sign-in-errors`. PR titles and commit messages start with the Linear id.
- `npm ci` turns on a pre-push check that blocks bad branch names and commits without the Linear id. It also runs preflight, tests and the build before anything reaches GitHub.
- On a pull request, Cursor Bugbot and the Cursor security review check it, and Claude fixes what they find (up to 3 rounds). The PR merges into `develop` by itself when it's clean, but PRs that change `.github/` wait for a person.
- `npm run agent:build -- <id> <id>` starts Claude on Linear tickets right away. Tickets labelled `agent-ready` are picked up every 2 hours.
- Merged work goes to QA in Linear. A person checks it on the dev site and moves it to Done.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Fonts

The first page preloads two subset fonts instead of the full Google Sans Flex file (1,887,540 bytes) and the full Material Symbols Outlined file (3,827,840 bytes). Google Sans Flex keeps Latin, weights 400–800, and optical size. Material Symbols keeps the names in `scripts/fonts/material-symbols.icons.txt`. The subset files use new names so a year-long cache does not keep serving the old fonts.

Add a new icon to that list, regenerate the symbols file, and preflight will remind you when the code uses a name that is not on the list.

Material Symbols, from the sorted list (`icon_names` must be alphabetical). The CSS response contains one `fonts.gstatic.com` woff2 URL. Save that file under a new name in `public/fonts/` (the current file is `material-symbols-outlined-subset-2.woff2`) and point `_fonts.scss` and `index.html` at it. Fonts are cached for a year, so a changed subset must not reuse the previous file name.

```bash
names=$(paste -sd, scripts/fonts/material-symbols.icons.txt)
curl -fsSL \
  -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' \
  -o /tmp/material-symbols.css \
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,400..600,0..1,-25&icon_names=${names}&display=block"
```

Google Sans Flex, from the full variable font (the old `public/fonts/google-sans-flex.woff2`). `python3 -m pip install fonttools brotli` once. The source font has no Arabic glyphs, so this subset does not add Arabic ranges.

```bash
python3 -m fontTools.varLib.instancer public/fonts/google-sans-flex.woff2 wght=400:800 wdth=drop GRAD=drop ROND=drop slnt=drop -o /tmp/gsf.ttf
python3 -m fontTools.subset /tmp/gsf.ttf \
  --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+FEFF,U+FFFD" \
  --layout-features="*" \
  --flavor=woff2 \
  --output-file=public/fonts/google-sans-flex-subset.woff2
```

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
