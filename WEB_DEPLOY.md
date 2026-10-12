# Nasazení webové verze GSS (FREE)

Veřejně se nasazuje **jen FREE** web: `npm run build:web:free` vyrobí složku
`dist-web/free/`. PRO se prodává jako desktopová aplikace na itch.io —
statická podsložka `/pro/` by byla zdarma dostupná komukoli, kdo zná adresu,
proto ji CI nenasazuje. (`npm run build:web:site` s PRO v `/pro/` zůstává jen
pro lokální testování — **nenahrávej jeho výstup na veřejný hosting**.
Viz SECURITY.md → "Web edition gating".)

## Automatické nasazení přes GitHub Actions (doporučeno)

`.github/workflows/ci.yml` obsahuje job `deploy-web`, který se spustí
při každém pushi do `main`/`master` — **ale nasazovací krok je vypnutý**,
dokud nenastavíš:

1. **Cloudflare účet** (zdarma) na [dash.cloudflare.com](https://dash.cloudflare.com).
   Projekt v Cloudflare **nezakládej** — workflow si projekt `gss-web` založí
   sám při prvním nasazení.
2. **API token**: ikona profilu → My Profile → API Tokens → Create Token →
   Create Custom Token → Permissions: `Account` / `Cloudflare Pages` / `Edit`
   → Continue to summary → Create Token.
3. **Account ID**: 32znakový kód v adrese dashboardu
   (`https://dash.cloudflare.com/<account-id>/…`).
4. V GitHub repu → Settings → Secrets and variables → Actions:
   - **Secrets** → New repository secret:
     - `CLOUDFLARE_API_TOKEN` = token z kroku 2
     - `CLOUDFLARE_ACCOUNT_ID` = ID z kroku 3
   - **Variables** → New repository variable:
     - `CLOUDFLARE_PAGES_ENABLED` = `true` (bez tohohle zůstane deploy krok
       vypnutý — vědomá pojistka, aby workflow neselhával kvůli chybějícím
       secrets, pokud web nasazení zatím nechceš)
5. Spusť workflow znovu (Actions → poslední běh na `main` → Re-run all jobs)
   nebo pushni do `main`. Web poběží na `https://gss-web.pages.dev`.

## Manuální nasazení (bez GitHubu)

```bash
npm run build:web:free
```

Obsah `dist-web/free/` nahraj na Cloudflare Pages (Workers & Pages → Create →
Pages → Upload assets), Vercel ([vercel.com/new](https://vercel.com/new)) nebo
Netlify ([app.netlify.com/drop](https://app.netlify.com/drop)). Všechny tři
mají zdarma dostatečný tier pro statický web.

## Testování před nasazením

```bash
npm run build:web:free
cd dist-web/free
python3 -m http.server 8000
# otevřít http://localhost:8000/
```

Doporučuju projít appku naživo v prohlížeči — hlavně: otevření/uložení grafu
(stažení souboru), AI Generator (na webu se nemá vůbec zobrazit) a Community
Library.

## Co na webu chybí oproti desktopu (vědomě)

- **PRO funkce** — jen v desktopové PRO verzi z itch.io.
- **AI Generator** — vyžaduje CORS proxy (Anthropic API neposkytuje CORS
  hlavičky pro přímé volání z prohlížeče), který zatím není nasazený.
  Na webu se tlačítko AI vůbec nezobrazuje a API klíč se neukládá.
  Viz `src/platform/web.ts`.
