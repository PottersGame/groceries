# Terms of Service & Legal Disclaimers — PantryPal SK

_Last updated: 2026-03-01_

## 1. Acceptance of Terms

By installing or using the PantryPal SK application ("the App"), you agree to these Terms of Service. If you do not agree, do not use the App.

## 2. Description of Service

PantryPal SK is a grocery inventory and price-comparison tool for the Slovak market. It allows users to:

- Scan Slovak eKasa QR codes to retrieve receipt data.
- Track a personal pantry and shopping list on-device.
- Contribute anonymous, aggregated price observations to a shared database.
- Browse crowdsourced price comparisons and promotional deals from retail flyers.

## 3. No Warranty / Disclaimer of Accuracy

Price data displayed in the App is sourced from:

1. **Crowdsourced observations** submitted anonymously by other users — accuracy cannot be guaranteed and prices may be out of date.
2. **Automated flyer extraction** using AI vision models — the extraction may contain errors or omissions.

**Price data is provided for informational purposes only.** Always verify prices at the point of sale. PantryPal SK accepts no liability for any loss or inconvenience arising from inaccurate price data.

## 4. eKasa API — Terms of Use

The App accesses the Slovak Financial Administration's eKasa public API (`ekasa.financnasprava.sk`) to retrieve receipt details. By using the scanning feature, you acknowledge:

- You will only scan QR codes from receipts that were issued to you or that you have the right to access.
- You will use the eKasa data for personal record-keeping purposes only, in accordance with the Slovak Financial Administration's published terms of use for the eKasa system.
- PantryPal SK is not affiliated with, endorsed by, or officially connected to the Slovak Financial Administration (Finančná správa SR).

> **Responsibility**: Each user is solely responsible for ensuring that their individual use of the eKasa API complies with the Slovak Financial Administration's current terms of use. The project maintainers make no representation that any particular use is permitted.

## 5. Flyer PDF Scraping — Legal Notice

PantryPal SK's Cloudflare Worker automatically fetches and processes publicly accessible retail flyer PDFs (currently: Lidl SK, Kaufland SK) to extract promotional pricing data.

**Important notices regarding this automated scraping:**

- Retail websites' Terms of Service may restrict automated access to their content. Operators of this software are responsible for reviewing and complying with each retailer's current Terms of Service and `robots.txt` before deploying the worker.
- The PDF flyer pages are publicly accessible advertising materials. The extracted data (product names and sale prices) is factual information that is not subject to copyright protection under Slovak/EU law; however, the underlying PDF documents may be protected by copyright.
- If any retailer requests that automated access be stopped, the relevant store target must be removed from `STORE_TARGETS` in `worker/src/index.ts` immediately.
- The project maintainers make no legal representation regarding the permissibility of scraping any specific retailer's website. **Each operator deploys this worker at their own legal risk.**

> **Retailer compliance checklist** (review before deploying):
> - [ ] Lidl SK (`www.lidl.sk`) — review `https://www.lidl.sk/robots.txt` and ToS
> - [ ] Kaufland SK (`www.kaufland.sk`) — review `https://www.kaufland.sk/robots.txt` and ToS

## 6. User Responsibilities

You agree not to:

- Submit false or misleading price data.
- Use the App in a manner that violates any applicable law or regulation.
- Attempt to reverse-engineer, scrape, or abuse the PantryPal SK backend API.
- Use the App to collect, infer, or reconstruct personal data about other individuals.

## 7. Limitation of Liability

To the fullest extent permitted by applicable law, PantryPal SK and its contributors are not liable for:

- Any inaccuracies in displayed prices or promotional information.
- Any loss of data stored in the local on-device database.
- Any consequences arising from reliance on flyer or crowdsourced price data.
- Any issues arising from third-party API changes or downtime (eKasa, Gemini, Cloudflare).

## 8. Open-Source License

PantryPal SK is open-source software. Refer to the [`LICENSE`](LICENSE) file for the applicable licence terms.

## 9. Changes to These Terms

We may update these Terms of Service at any time. Continued use of the App after changes are posted constitutes acceptance of the updated Terms.

## 10. Governing Law

These Terms are governed by the laws of the Slovak Republic. Any disputes shall be subject to the jurisdiction of the Slovak courts.

## 11. Contact

For legal enquiries, please open an issue at the project's GitHub repository.
