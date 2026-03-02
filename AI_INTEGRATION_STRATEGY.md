# AI Integration Strategy — Glovecubs

How we use AI to help members and how to keep integration **easy and seamless**.

---

## 1. Where AI Serves Members Today

| Touchpoint | What it does | Friction today |
|------------|--------------|----------------|
| **AI Glove Advisor** | Multi-step questionnaire → personalized product recommendations (rule-based scoring). | Requires login; single entry point (nav only). |
| **Cost Analysis / Upload Invoice** | Add invoices, see spend analytics, “optimization opportunities” (rule-based). | Separate page; no AI parsing of PDFs yet. |
| **Hero “AI Spend Snapshot”** | Sample tips + CTA to Upload Invoice. | Static copy, not personalized. |
| **Quick Bulk Builder** | Type + use case + qty → bulk order. | Not AI; could be enhanced with “recommend for this use case.” |

**Current tech:** All logic is **rule-based** (scoring, filters, static tips). No LLM/API calls yet — good for cost, latency, and reliability; we can add optional AI later where it adds real value.

---

## 2. Principles for Easy, Seamless AI

- **Contextual, not isolated** — Surface AI where the member already is (product page, cart, filters, account), not only on a dedicated “AI” page.
- **Progressive, not gated** — Offer value before login where possible (e.g. short advisor or “recommend for this category”); deeper features (saved preferences, spend analysis) after login.
- **Clear value, low jargon** — Label actions by outcome (“Find gloves for my use case”, “See if I can save”, “Get a recommendation”) and use “AI” only when it helps set expectations.
- **One path, many doors** — Same underlying capabilities (recommendations, spend insights) reachable from nav, hero, product grid, cart, and account so members don’t hunt.
- **Graceful fallback** — If we add LLMs later, keep rule-based behavior as default so the site works without API keys or when providers are slow/down.

---

## 3. Integration Points (Seamless Placement)

**A. Homepage**

- Keep “Try AI Glove Finder” and “Upload Invoice for Savings” as primary CTAs.
- Optional: small “Not sure what you need? Answer 3 questions → get picks” that starts a shortened advisor flow or jumps to full advisor.

**B. Shop / Product listing**

- Filter bar or sticky CTA: **“Get a recommendation”** → opens AI Advisor (or a 3-question shortcut that pre-fills type/industry).
- “Recommended for you” strip (when logged in and we have advisor answers or order history).

**C. Product detail page**

- “Not the right fit? **Get a recommendation**” → opens advisor with optional pre-fill (e.g. category or material from current product).
- “Often bought with / Better for your use case” (rule-based from category/use case).

**D. Cart**

- “Based on your cart, you might also need…” (rule-based: e.g. if only disposables, suggest complementary item).
- “Want to **check if you could save**?” → Cost Analysis / Upload Invoice.

**E. Account / Dashboard**

- “Your spend at a glance” + “Add invoice” and “Optimization tips” (current Cost Analysis).
- “Your last recommendation” (link back to last AI Advisor result or “Get a new recommendation”).

**F. Nav and global entry**

- Keep **“AI Recommender”** (or rename to “Glove Finder” / “Get a recommendation”).
- Optional: small chip or icon “AI” next to it so members know it’s smart help, not just filters.

---

## 4. Making the Current Advisor Feel Seamless

- **Short path for logged-out users**  
  - Option 1: Allow a **3-question “quick” flow** (e.g. type, industry, budget) → show a few recommendations with “Login to save and compare” and “Browse all.”  
  - Option 2: Keep full advisor behind login but add a **preview**: “Answer 8 questions, get a shortlist in under a minute” + one sample recommendation by industry.

- **Pre-fill from context**  
  - From product page: open advisor with category/material/use case pre-selected.  
  - From “Shop by industry”: open advisor with industry pre-selected.  
  - Reduces clicks and makes the advisor feel part of the browsing flow.

- **Post-recommendation actions**  
  - “Add to cart”, “Compare”, “Save to list” on each recommended product.  
  - “Start over” and “Adjust answers” without losing the list (e.g. “Refine” opens back to a specific question).

- **Copy and UX**  
  - Progress: “Question 3 of 8” and a progress bar (already there).  
  - Reassurance: “Your answers are private and secure” (already there).  
  - Optional: “Skip” for non-critical questions (e.g. texture) with a sensible default.

---

## 5. Cost Analysis / Spend (AI When We Add It)

- **Today:** Manual entry (vendor, date, total) + rule-based “optimization opportunities.”  
- **Seamless angle:**  
  - “Add invoice” visible from account and from hero; same flow.  
  - When we add AI: **optional** “Upload PDF/image” → parse line items → suggest “You might save by switching these SKUs to…” with links to our products.  
- **Principle:** Keep manual entry as the primary path; AI as enhancement so we don’t depend on parsing quality for core value.

---

## 6. Optional Future: LLM or External AI

If we add an LLM (e.g. OpenAI, Anthropic) later:

- **Use cases that fit:**  
  - Natural-language “What gloves for a bakery with oily surfaces?” → map to advisor answers or filters.  
  - Richer explanation for “Why we recommend this” (one paragraph per product).  
  - Invoice line-item parsing and “savings story” in plain language.

- **Keep it easy and safe:**  
  - One configurable module (e.g. `lib/ai.js`) with a single `ask(query, context)` that calls the provider; fallback to rule-based or “Sorry, try the Glove Finder” on failure.  
  - No PII in prompts; product catalog and public site context only unless we explicitly design for it.  
  - Feature flag or env var so the site runs fully without any API key.

---

## 7. Quick Wins (No Backend Change)

1. **Pre-fill AI Advisor from URL or context**  
   e.g. `#ai-advisor?industry=food` or from “Shop by industry” click → `navigate('ai-advisor', { industry: 'food' })` and set first question(s) from that.

2. **“Get a recommendation” on product and shop pages**  
   Same `navigate('ai-advisor')` but pass current category/material so the advisor opens with those pre-selected.

3. **Rename or subtitle in nav**  
   “AI Recommender” → “Glove Finder” or “AI Glove Finder” so intent is obvious.

4. **Single CTA on Cost Analysis empty state**  
   “Add your first invoice” or “Connect your orders” with one primary button; keep “Start Shopping” secondary.

5. **Hero “AI Spend Snapshot”**  
   If we have a way to know industry (e.g. from account or last advisor), show one dynamic tip instead of three static ones; otherwise keep as is.

---

## 8. Summary

- **Today:** AI-style value comes from **AI Glove Advisor** (rule-based recommendations) and **Cost Analysis** (invoices + rule-based optimizations). Both can be surfaced in more places and with less friction.
- **Seamless =** contextual entry points (home, shop, product, cart, account), optional short/guest path, pre-fill from context, and clear CTAs (“Get a recommendation”, “See if I can save”).
- **Later:** Optional LLM for natural language and richer explanations; always with a rule-based fallback and no hard dependency on external AI for core flows.

Use this doc to prioritize which integration points to build first (e.g. “Get a recommendation” on product page + advisor pre-fill) and to keep future LLM work aligned with “easy and seamless” for members.
