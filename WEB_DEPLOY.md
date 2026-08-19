# Nasazení webové verze GSS (FREE + PRO)

Shrnutí architektury: `npm run build:web:site` vyrobí jednu složku
`dist-web-site/` obsahující FREE build v kořeni a PRO build v `/pro/`.
Musí se nahrát **na jednu doménu** (ne dvě subdomény), protože AI Generator
API klíč se ukládá do `localStorage`, který se mezi subdoménami nesdílí.

## Manuální nasazení (nejjednodušší způsob, žádný GitHub potřeba)

```bash
npm run build:web:site
```

Vezmi obsah `dist-web-site/` a přetáhni ho na kteroukoli z nich:

### Cloudflare Pages (doporučeno, zdarma)
1. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages → **Upload assets**
2. Přetáhni celý obsah `dist-web-site/`
3. Hotovo — dostaneš URL typu `gss-web.pages.dev`

### Vercel
1. [vercel.com/new](https://vercel.com/new) → přetáhnout složku `dist-web-site/` (nebo `vercel --prod` z příkazové řádky s Vercel CLI)

### Netlify
1. [app.netlify.com/drop](https://app.netlify.com/drop) → přetáhnout `dist-web-site/`

Všechny tři mají zdarma dostatečný tier pro statický web bez vlastního serveru.

## Automatické nasazení přes GitHub Actions (volitelné)

`.github/workflows/ci.yml` už obsahuje job `deploy-web`, který se spustí
při každém pushi do `main`/`master` — **ale je defaultně vypnutý**, dokud
nenastavíš:

1. **Založit Cloudflare účet** (zdarma) na [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Vytvořit API token**: My Profile → API Tokens → Create Token →
   šablona "Edit Cloudflare Workers" stačí (zahrnuje i Pages)
3. **Zjistit Account ID**: kterákoli doména v Cloudflare dashboardu, Account ID
   je v pravém panelu
4. V GitHub repu → Settings → Secrets and variables → Actions:
   - **Secrets** → New repository secret:
     - `CLOUDFLARE_API_TOKEN` = token z kroku 2
     - `CLOUDFLARE_ACCOUNT_ID` = ID z kroku 3
   - **Variables** → New repository variable:
     - `CLOUDFLARE_PAGES_ENABLED` = `true` (bez tohohle zůstane deploy krok
       vypnutý — vědomá pojistka, aby workflow neselhával kvůli chybějícím
       secrets, pokud web nasazení zatím nechceš)
5. První push do `main` vytvoří Cloudflare Pages projekt `gss-web`
   automaticky (jméno je natvrdo v `ci.yml` — uprav, pokud chceš jiné)

## Testování před nasazením (doporučeno)

```bash
npm run build:web:site
cd dist-web-site
python3 -m http.server 8000
# otevřít http://localhost:8000/     → FREE
# otevřít http://localhost:8000/pro/ → PRO
```

Tohle je přesně to, co jsem sám ověřil (HTTP odpovědi, správné cesty k
assetům, žádný Tauri kód v bundlu) — **nemohl jsem ale spustit skutečný
prohlížeč** (síťová omezení mého prostředí neumožnila stáhnout Chromium
pro automatizovaný test). Doporučuju před ostrým nasazením projít appku
naživo v prohlížeči — hlavně: otevření/uložení grafu (stažení souboru),
AI Generator (měl by ukázat jasnou zprávu "není podporováno na webu", ne
spadnout), Community Library, a přepnutí mezi `/` a `/pro/` pro ověření,
že se PRO funkce skutečně odemknou.

## Co na webu chybí oproti desktopu (vědomě)

- **AI Generator** — vyžaduje CORS proxy (Anthropic API neposkytuje CORS
  hlavičky pro přímé volání z prohlížeče), který zatím není nasazený.
  Zobrazí jasnou chybovou zprávu, ne pád. Viz `src/platform/web.ts`.
- **Runtime licenční klíč** — FREE/PRO na webu je čistě to, na jaké URL
  jsi (`/` vs `/pro/`), zadaný při buildu. Žádné "zadej klíč" pole.
